// v2.9.4
import React, { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import NotebookToolbar from './NotebookToolbar'
import SelectionToolbar from './SelectionToolbar'
import { saveNotebookStrokes } from '../../lib/dataService'
import { Trash2, FlipHorizontal2, FlipVertical2, Copy, Lock, Unlock, ArrowUpToLine, ArrowDownToLine } from 'lucide-react'

const HIGHLIGHTER_OPACITY = 0.3
const LINE_SPACING = 32
const LINE_COLOR = '#d0d8e0'
const LINE_COLOR_DARK = '#2a2f36'
const GRID_COLOR = '#d0d8e0'
const GRID_COLOR_DARK = '#2a2f36'
const MIN_ZOOM = 1
const MAX_ZOOM = 5
const PAGE_PADDING_BOTTOM = 200 // blank space below last element (was 600)
const PAGE_BG = '#faf9f6'
const PAGE_BG_DARK = '#1e1e1e'
const EXPORT_WIDTH = 800 // fixed width for PNG/PDF exports
const ERASER_SIZES = { small: 8, medium: 16, large: 28 }
const LASSO_MOVE_THRESHOLD = 6 // px in canvas space before drag registers

// ── Ramer-Douglas-Peucker point simplification ──
function rdpSimplify(points, tolerance) {
  if (points.length <= 2) return points
  let maxDist = 0, maxIdx = 0
  const first = points[0], last = points[points.length - 1]
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], first, last)
    if (d > maxDist) { maxDist = d; maxIdx = i }
  }
  if (maxDist > tolerance) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), tolerance)
    const right = rdpSimplify(points.slice(maxIdx), tolerance)
    return [...left.slice(0, -1), ...right]
  }
  return [first, last]
}

function perpDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2)
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len
}

// ── Point-in-polygon (ray casting) ──
function pointInPolygon(px, py, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y
    const xj = polygon[j].x, yj = polygon[j].y
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

// ── Element rendering ──
function drawElement(ctx, el, imageCache) {
  if (el.type === 'text') {
    drawTextElement(ctx, el)
  } else if (el.type === 'image') {
    drawImageElement(ctx, el, imageCache)
  } else {
    drawStroke(ctx, el)
  }
}

function drawStroke(ctx, stroke) {
  const pts = stroke.points
  if (!pts || pts.length === 0) return
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = stroke.color
  ctx.globalAlpha = stroke.opacity ?? 1

  if (stroke.tool === 'highlighter') {
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = HIGHLIGHTER_OPACITY
    ctx.lineWidth = stroke.width * 3
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.stroke()
  } else if (stroke.smooth && pts.length >= 3) {
    // Smooth rendering with quadratic Bezier curves through midpoints
    // Use average pressure for uniform width in smooth mode
    const avgPressure = pts.reduce((s, p) => s + (p.pressure || 0.5), 0) / pts.length
    ctx.lineWidth = stroke.width * (0.3 + 0.7 * avgPressure)
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 0; i < pts.length - 1; i++) {
      const mid = { x: (pts[i].x + pts[i+1].x) / 2, y: (pts[i].y + pts[i+1].y) / 2 }
      if (i === 0) {
        ctx.lineTo(mid.x, mid.y)
      } else {
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mid.x, mid.y)
      }
    }
    ctx.lineTo(pts[pts.length-1].x, pts[pts.length-1].y)
    ctx.stroke()
  } else {
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1], p1 = pts[i]
      const pressure = (p0.pressure + p1.pressure) / 2
      ctx.lineWidth = stroke.width * (0.3 + 0.7 * pressure)
      ctx.beginPath()
      ctx.moveTo(p0.x, p0.y)
      ctx.lineTo(p1.x, p1.y)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function drawTextElement(ctx, el) {
  ctx.save()
  ctx.font = `${el.fontSize || 20}px "Noto Naskh Arabic", serif`
  ctx.fillStyle = el.color || '#000'
  ctx.textBaseline = 'top'
  ctx.direction = 'rtl'
  const lines = (el.text || '').split('\n')
  const lineH = (el.fontSize || 20) * 1.5
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], el.x + (el.width || 200), el.y + i * lineH)
  }
  ctx.restore()
}

function drawImageElement(ctx, el, imageCache) {
  if (!el.src) return
  const img = imageCache?.get(el.src)
  if (img && img.complete) {
    if (el.flipH || el.flipV) {
      ctx.save()
      ctx.translate(el.x + el.width / 2, el.y + el.height / 2)
      ctx.scale(el.flipH ? -1 : 1, el.flipV ? -1 : 1)
      ctx.drawImage(img, -el.width / 2, -el.height / 2, el.width, el.height)
      ctx.restore()
    } else {
      ctx.drawImage(img, el.x, el.y, el.width, el.height)
    }
  } else {
    // placeholder
    ctx.save()
    ctx.fillStyle = '#e0e0e0'
    ctx.fillRect(el.x, el.y, el.width, el.height)
    ctx.strokeStyle = '#ccc'
    ctx.strokeRect(el.x, el.y, el.width, el.height)
    ctx.restore()
  }
}

// ── Hit testing ──
function hitTestElement(el, x, y, radius) {
  if (el.type === 'text') {
    const w = el.width || 200
    const h = (el.fontSize || 20) * 1.5 * Math.max(1, (el.text || '').split('\n').length)
    return x >= el.x && x <= el.x + w && y >= el.y && y <= el.y + h
  }
  if (el.type === 'image') {
    return x >= el.x && x <= el.x + el.width && y >= el.y && y <= el.y + el.height
  }
  // stroke
  return hitTestStroke(el, x, y, radius)
}

function hitTestStroke(stroke, x, y, radius) {
  const pts = stroke.points
  if (!pts) return false
  const r = radius + (stroke.width || 4) / 2
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i].x - x, dy = pts[i].y - y
    if (dx * dx + dy * dy < r * r) return true
  }
  return false
}

function getResizeHandle(el, x, y, zoom) {
  if (el.type !== 'image') return null
  const handleSize = 14 / zoom
  const corners = [
    { name: 'tl', cx: el.x, cy: el.y },
    { name: 'tr', cx: el.x + el.width, cy: el.y },
    { name: 'bl', cx: el.x, cy: el.y + el.height },
    { name: 'br', cx: el.x + el.width, cy: el.y + el.height },
  ]
  for (const c of corners) {
    if (Math.abs(x - c.cx) < handleSize && Math.abs(y - c.cy) < handleSize) return c.name
  }
  return null
}

function getElementBounds(el) {
  if (el.type === 'text') {
    const w = el.width || 200
    const h = (el.fontSize || 20) * 1.5 * Math.max(1, (el.text || '').split('\n').length)
    return { x: el.x, y: el.y, w, h }
  }
  if (el.type === 'image') {
    return { x: el.x, y: el.y, w: el.width, h: el.height }
  }
  // stroke
  const pts = el.points
  if (!pts || pts.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  const pad = (el.width || 4) / 2
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }
}

function getSelectionBounds(elements, indices) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const idx of indices) {
    const b = getElementBounds(elements[idx])
    if (b.x < minX) minX = b.x
    if (b.y < minY) minY = b.y
    if (b.x + b.w > maxX) maxX = b.x + b.w
    if (b.y + b.h > maxY) maxY = b.y + b.h
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

// ── Image compression ──
function compressImage(file, maxDim = 2048, quality = 0.92) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let w = img.width, h = img.height
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = (h / w) * maxDim; w = maxDim }
          else { w = (w / h) * maxDim; h = maxDim }
        }
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', quality), width: w, height: h })
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

// Helper: read image from clipboard API (for contextmenu paste)
async function readClipboardImage() {
  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      const imageType = item.types.find(t => t.startsWith('image/'))
      if (imageType) {
        const blob = await item.getType(imageType)
        return await compressImage(blob)
      }
    }
  } catch { /* clipboard API not available or no image */ }
  return null
}

// ── Main Component ──
const SNAP_DISTANCE = 10

const NotebookCanvas = forwardRef(function NotebookCanvas({ lessonId, initialStrokes, template = 'arabic', onAnalyze, analyzing, hasAnalysis }, ref) {
  const staticCanvasRef = useRef(null)
  const activeCanvasRef = useRef(null)
  const linesCanvasRef = useRef(null)
  const wrapperRef = useRef(null)

  const elementsRef = useRef([])  // renamed from strokesRef
  const undoStackRef = useRef([])
  const redoStackRef = useRef([])
  const currentStrokeRef = useRef(null)
  const isDrawingRef = useRef(false)
  const saveTimerRef = useRef(null)
  const isDirtyRef = useRef(false)
  const imageCacheRef = useRef(new Map())

  // Lasso polygon persistence
  const lassoPolygonRef = useRef(null)

  // Line straightening on hold
  const holdTimerRef = useRef(null)
  const lastMoveTimeRef = useRef(0)
  const straightenRef = useRef(false)

  // Viewport transform
  const viewRef = useRef({ x: 0, y: 0, zoom: 1 })
  const [zoomLevel, setZoomLevel] = useState(1)

  // Touch gesture tracking
  const gestureRef = useRef({ active: false, startDist: 0, startZoom: 1, startX: 0, startY: 0, startViewX: 0, startViewY: 0, pointers: new Map() })

  const [tool, setTool] = useState('pen')
  const [color, setColor] = useState(() => {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? '#ffffff' : '#000000'
  })
  const [thickness, setThickness] = useState(4)
  const [smoothing, setSmoothing] = useState(true)
  const [eraserSize, setEraserSize] = useState('medium') // small/medium/large
  const [textFontSize, setTextFontSize] = useState(24) // independent of pen thickness
  const [undoCount, setUndoCount] = useState(0)
  const [redoCount, setRedoCount] = useState(0)
  const [elementCount, setElementCount] = useState(0)

  // Text editing state
  const [editingText, setEditingText] = useState(null) // { idx, el, isNew }
  const textAreaRef = useRef(null)

  // Image selection state (move/resize)
  const [selectedImage, _setSelectedImage] = useState(null) // index into elementsRef
  const selectedImageRef = useRef(null)
  const setSelectedImage = (v) => { selectedImageRef.current = v; _setSelectedImage(v) }
  const imgDragRef = useRef(null) // { mode: 'move'|'resize', handle, startX, startY, origX, origY, origW, origH }
  const fileInputRef = useRef(null)

  // Lasso selection state
  const [lassoPath, setLassoPath] = useState(null) // array of {x,y} in canvas space while drawing
  const [selectedIndices, _setSelectedIndices] = useState(null) // Set of indices
  const selectedIndicesRef = useRef(null)
  const setSelectedIndices = (v) => { selectedIndicesRef.current = v; _setSelectedIndices(v) }
  const [selectionBounds, setSelectionBounds] = useState(null) // screen-space bounds
  const [showSelToolbar, setShowSelToolbar] = useState(false)
  const selDragRef = useRef(null) // { startX, startY, origPositions }

  // Cursor position for tool preview (eraser circle, pen/highlighter dot)
  const [cursorPos, setCursorPos] = useState(null)

  // Image context menu state
  const [imageMenu, setImageMenu] = useState(null) // { x, y, idx }

  useImperativeHandle(ref, () => ({
    save: () => saveNow(),
    isDirty: () => isDirtyRef.current,
    exportAsPNG,
    exportAsPDF,
    getCanvasImage: () => {
      // Only capture the area that has content (plus small margin)
      let contentBottom = 0
      for (const el of elementsRef.current) {
        const b = getElementBounds(el)
        const bottom = b.y + b.h
        if (bottom > contentBottom) contentBottom = bottom
      }
      if (contentBottom === 0) contentBottom = 400 // empty page fallback
      contentBottom += 40 // small margin
      const w = wrapperRef.current?.clientWidth || EXPORT_WIDTH
      const offscreen = document.createElement('canvas')
      offscreen.width = w * 2
      offscreen.height = contentBottom * 2
      const ctx = offscreen.getContext('2d')
      ctx.scale(2, 2)
      ctx.fillStyle = getIsDark() ? PAGE_BG_DARK : PAGE_BG
      ctx.fillRect(0, 0, w, contentBottom)
      drawTemplateOnExport(ctx, w, contentBottom)
      elementsRef.current.forEach(el => drawElement(ctx, el, imageCacheRef.current))
      return offscreen.toDataURL('image/png')
    },
  }))

  // ── Get page bottom (dynamic based on content) ──
  function getPageBottom() {
    let maxY = 400 // minimum page height
    for (const el of elementsRef.current) {
      const b = getElementBounds(el)
      const bottom = b.y + b.h
      if (bottom > maxY) maxY = bottom
    }
    return maxY + PAGE_PADDING_BOTTOM
  }

  // ── Init elements from props ──
  useEffect(() => {
    const loaded = (initialStrokes || []).map(s => s.stroke_data || s)
    elementsRef.current = loaded
    undoStackRef.current = []
    redoStackRef.current = []
    // Restore saved zoom for this lesson
    const savedZoom = parseFloat(localStorage.getItem(`kalimat_zoom_${lessonId}`)) || 1
    viewRef.current = { x: 0, y: 0, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, savedZoom)) }
    setZoomLevel(viewRef.current.zoom)
    setElementCount(loaded.length)
    setUndoCount(0)
    setRedoCount(0)
    setSelectedIndices(null)
    setSelectionBounds(null)
    setShowSelToolbar(false)
    setEditingText(null)
    isDirtyRef.current = false
    // Preload images
    loaded.forEach(el => { if (el.type === 'image' && el.src) preloadImage(el.src) })
    requestAnimationFrame(() => redrawAll())
  }, [lessonId, initialStrokes])

  function preloadImage(src) {
    if (imageCacheRef.current.has(src)) return
    const img = new Image()
    img.onload = () => redrawAll()
    img.src = src
    imageCacheRef.current.set(src, img)
  }

  function insertImageAtCenter(dataUrl, width, height) {
    const wrapper = wrapperRef.current
    const v = viewRef.current
    const cx = (-v.x + (wrapper?.clientWidth || 400) / 2) / v.zoom
    const cy = (-v.y + (wrapper?.clientHeight || 400) / 2) / v.zoom
    const imgW = Math.min(width, 640)
    const imgH = imgW * (height / width)
    const imgEl = {
      type: 'image',
      id: crypto.randomUUID(),
      x: cx - imgW / 2,
      y: cy - imgH / 2,
      width: imgW,
      height: imgH,
      src: dataUrl,
    }
    preloadImage(dataUrl)
    elementsRef.current.push(imgEl)
    undoStackRef.current.push({ type: 'draw', stroke: imgEl })
    redoStackRef.current = []
    redrawAll()
    scheduleSave()
    updateCounts()
    // Auto-select the new image
    setSelectedImage(elementsRef.current.length - 1)
  }

  async function handleFileInput(file) {
    if (!file) return
    const { dataUrl, width, height } = await compressImage(file)
    insertImageAtCenter(dataUrl, width, height)
  }

  // ── Canvas sizing ──
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const resize = () => {
      const rect = wrapper.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      ;[staticCanvasRef, activeCanvasRef, linesCanvasRef].forEach(r => {
        const c = r.current
        if (!c) return
        c.width = rect.width * dpr
        c.height = rect.height * dpr
        c.style.width = rect.width + 'px'
        c.style.height = rect.height + 'px'
      })
      clampViewport()
      redrawAll()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(wrapper)
    resize()
    return () => observer.disconnect()
  }, [lessonId])

  // ── Template change triggers redraw ──
  useEffect(() => {
    redrawAll()
  }, [template])

  // ── Viewport clamping ──
  function clampViewport() {
    const v = viewRef.current
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const w = wrapper.clientWidth
    // Horizontal: page starts at 0, extends to wrapper width in canvas space
    // At zoom 1, content width = wrapper width, so no horizontal scroll needed
    // At zoom > 1, allow scrolling but keep content within view
    const contentW = w * v.zoom
    if (contentW <= w) {
      v.x = 0 // page fits, no scroll
    } else {
      v.x = Math.min(0, Math.max(w - contentW, v.x))
    }
    // Vertical: don't scroll above page top
    v.y = Math.min(0, v.y)
  }

  // ── Wheel zoom/scroll ──
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const handleWheel = (e) => {
      e.preventDefault()
      const v = viewRef.current
      if (e.ctrlKey || e.metaKey) {
        const rect = wrapper.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        const factor = 1 - e.deltaY * 0.005
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor))
        v.x = mx - (mx - v.x) * (newZoom / v.zoom)
        v.y = my - (my - v.y) * (newZoom / v.zoom)
        v.zoom = newZoom
      } else {
        v.y -= e.deltaY
      }
      clampViewport()
      setZoomLevel(v.zoom)
      localStorage.setItem(`kalimat_zoom_${lessonId}`, v.zoom)
      redrawAll()
      updateSelectionBoundsScreen()
    }
    wrapper.addEventListener('wheel', handleWheel, { passive: false })
    return () => wrapper.removeEventListener('wheel', handleWheel)
  }, [lessonId])

  // ── Dark mode helper ──
  function getIsDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark'
  }

  // ── Template drawing functions ──
  function drawPageBackground() {
    const c = linesCanvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const w = c.width / dpr, h = c.height / dpr
    const v = viewRef.current
    const dark = getIsDark()

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.scale(dpr, dpr)

    // Fill entire canvas with page background
    ctx.fillStyle = dark ? PAGE_BG_DARK : PAGE_BG
    ctx.fillRect(0, 0, w, h)

    // Draw template pattern
    const tmpl = template || 'arabic'
    if (tmpl === 'blank') return
    if (tmpl === 'lined') drawLinedTemplate(ctx, w, h, v, dark)
    else if (tmpl === 'grid') drawGridTemplate(ctx, w, h, v, dark)
    else if (tmpl === 'dotted') drawDottedTemplate(ctx, w, h, v, dark)
    else if (tmpl === 'arabic') drawArabicTemplate(ctx, w, h, v, dark)
    else drawLinedTemplate(ctx, w, h, v, dark) // fallback
  }

  function drawLinedTemplate(ctx, w, h, v, dark) {
    ctx.strokeStyle = dark ? LINE_COLOR_DARK : LINE_COLOR
    ctx.lineWidth = 0.5
    const startLine = Math.max(0, Math.floor(-v.y / (LINE_SPACING * v.zoom)))
    const endLine = Math.ceil((h - v.y) / (LINE_SPACING * v.zoom))
    for (let i = startLine; i <= endLine; i++) {
      const y = v.y + i * LINE_SPACING * v.zoom
      if (y < 0 || y > h) continue
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
    }
  }

  function drawGridTemplate(ctx, w, h, v, dark) {
    ctx.strokeStyle = dark ? GRID_COLOR_DARK : GRID_COLOR
    ctx.lineWidth = 0.5
    // Horizontal
    const startH = Math.max(0, Math.floor(-v.y / (LINE_SPACING * v.zoom)))
    const endH = Math.ceil((h - v.y) / (LINE_SPACING * v.zoom))
    for (let i = startH; i <= endH; i++) {
      const y = v.y + i * LINE_SPACING * v.zoom
      if (y < 0 || y > h) continue
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
    }
    // Vertical
    const startV = Math.max(0, Math.floor(-v.x / (LINE_SPACING * v.zoom)))
    const endV = Math.ceil((w - v.x) / (LINE_SPACING * v.zoom))
    for (let i = startV; i <= endV; i++) {
      const x = v.x + i * LINE_SPACING * v.zoom
      if (x < 0 || x > w) continue
      ctx.beginPath(); ctx.moveTo(x, Math.max(0, v.y)); ctx.lineTo(x, h); ctx.stroke()
    }
  }

  function drawDottedTemplate(ctx, w, h, v, dark) {
    ctx.fillStyle = dark ? GRID_COLOR_DARK : GRID_COLOR
    const startH = Math.max(0, Math.floor(-v.y / (LINE_SPACING * v.zoom)))
    const endH = Math.ceil((h - v.y) / (LINE_SPACING * v.zoom))
    const startV = Math.max(0, Math.floor(-v.x / (LINE_SPACING * v.zoom)))
    const endV = Math.ceil((w - v.x) / (LINE_SPACING * v.zoom))
    const dotR = Math.max(0.8, 1 * v.zoom)
    for (let row = startH; row <= endH; row++) {
      const y = v.y + row * LINE_SPACING * v.zoom
      if (y < 0 || y > h) continue
      for (let col = startV; col <= endV; col++) {
        const x = v.x + col * LINE_SPACING * v.zoom
        if (x < 0 || x > w) continue
        ctx.beginPath(); ctx.arc(x, y, dotR, 0, Math.PI * 2); ctx.fill()
      }
    }
  }

  function drawArabicTemplate(ctx, w, h, v, dark) {
    const spacing = 48 // wider for Arabic script
    ctx.lineWidth = 0.5
    const startLine = Math.max(0, Math.floor(-v.y / (spacing * v.zoom)))
    const endLine = Math.ceil((h - v.y) / (spacing * v.zoom))
    for (let i = startLine; i <= endLine; i++) {
      const baseY = v.y + i * spacing * v.zoom
      // Baseline (solid)
      ctx.strokeStyle = dark ? '#3a3f46' : '#b0b8c0'
      ctx.lineWidth = 0.8
      if (baseY >= 0 && baseY <= h) {
        ctx.beginPath(); ctx.moveTo(0, baseY); ctx.lineTo(w, baseY); ctx.stroke()
      }
      // Midline guide (dashed, lighter)
      const midY = baseY + spacing * v.zoom * 0.5
      ctx.strokeStyle = dark ? LINE_COLOR_DARK : LINE_COLOR
      ctx.lineWidth = 0.3
      ctx.setLineDash([4, 4])
      if (midY >= 0 && midY <= h) {
        ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(w, midY); ctx.stroke()
      }
      ctx.setLineDash([])
    }
  }

  // ── Canvas transforms ──
  function applyViewTransform(ctx) {
    const dpr = window.devicePixelRatio || 1
    const v = viewRef.current
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    ctx.translate(v.x, v.y)
    ctx.scale(v.zoom, v.zoom)
  }

  function redrawStatic() {
    const c = staticCanvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    applyViewTransform(ctx)
    elementsRef.current.forEach(el => drawElement(ctx, el, imageCacheRef.current))
    // Draw lasso selection highlight (use ref for immediate access)
    const selIdx = selectedIndicesRef.current
    if (selIdx && selIdx.size > 0) {
      drawSelectionHighlight(ctx, selIdx)
    }
    // Draw image selection handles (use ref for immediate access)
    const selImg = selectedImageRef.current
    if (selImg !== null) {
      const el = elementsRef.current[selImg]
      if (el?.type === 'image') {
        drawImageHandles(ctx, el)
      }
    }
    // Page break lines
    drawPageBreakLines(ctx)
  }

  function drawImageHandles(ctx, el) {
    const z = viewRef.current.zoom
    const handleSize = 8 / z
    ctx.save()
    // Dashed border — orange if locked, blue if unlocked
    ctx.setLineDash([6 / z, 4 / z])
    ctx.strokeStyle = el.locked ? '#e68a00' : '#1a73e8'
    ctx.lineWidth = 2 / z
    ctx.strokeRect(el.x, el.y, el.width, el.height)
    ctx.setLineDash([])
    if (!el.locked) {
      // Corner handles (only for unlocked)
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#1a73e8'
      ctx.lineWidth = 1.5 / z
      const corners = [
        [el.x, el.y],
        [el.x + el.width, el.y],
        [el.x, el.y + el.height],
        [el.x + el.width, el.y + el.height],
      ]
      for (const [cx, cy] of corners) {
        ctx.fillRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize)
        ctx.strokeRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize)
      }
    }
    ctx.restore()
  }

  function drawSelectionHighlight(ctx, selIdx) {
    ctx.save()
    if (lassoPolygonRef.current && lassoPolygonRef.current.length > 2) {
      // Draw the lasso polygon shape
      const poly = lassoPolygonRef.current
      ctx.setLineDash([6 / viewRef.current.zoom, 4 / viewRef.current.zoom])
      ctx.strokeStyle = '#1a73e8'
      ctx.lineWidth = 1.5 / viewRef.current.zoom
      ctx.fillStyle = 'rgba(26, 115, 232, 0.08)'
      ctx.beginPath()
      ctx.moveTo(poly[0].x, poly[0].y)
      for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    } else {
      ctx.setLineDash([6, 4])
      ctx.strokeStyle = '#1a73e8'
      ctx.lineWidth = 1.5 / viewRef.current.zoom
      for (const idx of selIdx) {
        const b = getElementBounds(elementsRef.current[idx])
        ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4)
      }
    }
    ctx.setLineDash([])
    ctx.restore()
  }

  function drawPageBreakLines(ctx) {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const pageW = wrapper.clientWidth
    const pdfPageH = pageW * 1.414
    const pageBottom = getPageBottom()
    ctx.save()
    ctx.setLineDash([8 / viewRef.current.zoom, 4 / viewRef.current.zoom])
    ctx.strokeStyle = 'rgba(200, 200, 200, 0.5)'
    ctx.lineWidth = 1 / viewRef.current.zoom
    for (let y = pdfPageH; y < pageBottom; y += pdfPageH) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(pageW, y)
      ctx.stroke()
    }
    ctx.restore()
  }

  function redrawAll() {
    drawPageBackground()
    redrawStatic()
    clearActiveCanvas()
  }

  function clearActiveCanvas() {
    const c = activeCanvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
  }

  // ── Saving ──
  function scheduleSave() {
    isDirtyRef.current = true
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveNow(), 2000)
  }

  async function saveNow() {
    if (!isDirtyRef.current || !lessonId) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    isDirtyRef.current = false
    const data = elementsRef.current.map((s, i) => ({ stroke_data: s, order_index: i }))
    try {
      await saveNotebookStrokes(lessonId, data)
    } catch (err) {
      console.error('Notebook save failed:', err)
      isDirtyRef.current = true
    }
  }

  useEffect(() => {
    const handleBeforeUnload = () => { if (isDirtyRef.current) saveNow() }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      if (isDirtyRef.current) saveNow()
    }
  }, [lessonId])

  function updateCounts() {
    setElementCount(elementsRef.current.length)
    setUndoCount(undoStackRef.current.length)
    setRedoCount(redoStackRef.current.length)
  }

  // ── Coordinate conversion ──
  function screenToCanvas(clientX, clientY) {
    const rect = activeCanvasRef.current.getBoundingClientRect()
    const v = viewRef.current
    return {
      x: (clientX - rect.left - v.x) / v.zoom,
      y: (clientY - rect.top - v.y) / v.zoom,
    }
  }

  function canvasToScreen(cx, cy) {
    const rect = wrapperRef.current?.getBoundingClientRect() || { left: 0, top: 0 }
    const v = viewRef.current
    return {
      x: cx * v.zoom + v.x,
      y: cy * v.zoom + v.y,
    }
  }

  function getCoalescedCanvasPoints(e) {
    if (e.getCoalescedEvents) {
      const events = e.getCoalescedEvents()
      if (events.length > 0) {
        return events.map(ce => {
          const p = screenToCanvas(ce.clientX, ce.clientY)
          return { ...p, pressure: ce.pressure || 0.5 }
        })
      }
    }
    const p = screenToCanvas(e.clientX, e.clientY)
    return [{ ...p, pressure: e.pressure || 0.5 }]
  }

  // ── Selection bounds in screen space ──
  function updateSelectionBoundsScreen() {
    const selIdx = selectedIndicesRef.current
    if (!selIdx || selIdx.size === 0) {
      setSelectionBounds(null)
      return
    }
    const cb = getSelectionBounds(elementsRef.current, selIdx)
    const tl = canvasToScreen(cb.x, cb.y)
    const br = canvasToScreen(cb.x + cb.w, cb.y + cb.h)
    setSelectionBounds({ x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y })
  }

  // ── Touch gesture handling ──
  function handleTouchPointerDown(e) {
    const g = gestureRef.current
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (g.pointers.size === 2) {
      const [p1, p2] = [...g.pointers.values()]
      g.active = true
      g.startDist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      g.startZoom = viewRef.current.zoom
      g.startX = (p1.x + p2.x) / 2
      g.startY = (p1.y + p2.y) / 2
      g.startViewX = viewRef.current.x
      g.startViewY = viewRef.current.y
      if (isDrawingRef.current) {
        isDrawingRef.current = false
        currentStrokeRef.current = null
        clearActiveCanvas()
      }
    }
  }

  function handleTouchPointerMove(e) {
    const g = gestureRef.current
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (g.active && g.pointers.size >= 2) {
      const [p1, p2] = [...g.pointers.values()]
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      const midX = (p1.x + p2.x) / 2
      const midY = (p1.y + p2.y) / 2
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, g.startZoom * (dist / g.startDist)))
      const v = viewRef.current
      v.zoom = newZoom
      v.x = g.startViewX + (midX - g.startX)
      v.y = g.startViewY + (midY - g.startY)
      clampViewport()
      setZoomLevel(newZoom)
      localStorage.setItem(`kalimat_zoom_${lessonId}`, newZoom)
      redrawAll()
      updateSelectionBoundsScreen()
    }
  }

  function handleTouchPointerUp(e) {
    const g = gestureRef.current
    g.pointers.delete(e.pointerId)
    if (g.pointers.size < 2) g.active = false
  }

  const panRef = useRef({ active: false, startX: 0, startY: 0, startViewX: 0, startViewY: 0 })

  // ── Pointer handlers ──
  const handlePointerDown = useCallback((e) => {
    // Close image context menu on any click
    setImageMenu(null)
    // Ignore right-click — let contextmenu handler deal with it
    if (e.button === 2) return

    // Touch: pan/zoom (but allow tool interaction for lasso/cursor/image)
    if (e.pointerType === 'touch') {
      handleTouchPointerDown(e)
      // Two-finger gesture always does zoom/pan
      if (gestureRef.current.pointers.size >= 2) return

      const pos = screenToCanvas(e.clientX, e.clientY)

      // Lasso: allow touch to drag existing selection or toggle toolbar
      if (tool === 'lasso' && selectedIndicesRef.current && selectedIndicesRef.current.size > 0) {
        const insideSelection = lassoPolygonRef.current
          ? pointInPolygon(pos.x, pos.y, lassoPolygonRef.current)
          : (() => { const cb = getSelectionBounds(elementsRef.current, selectedIndicesRef.current); return pos.x >= cb.x && pos.x <= cb.x + cb.w && pos.y >= cb.y && pos.y <= cb.y + cb.h })()
        if (insideSelection) {
          e.preventDefault()
          activeCanvasRef.current?.setPointerCapture(e.pointerId)
          selDragRef.current = {
            startX: pos.x, startY: pos.y, moved: false,
            origPositions: [...selectedIndicesRef.current].map(idx => {
              const el = elementsRef.current[idx]
              if (el.type === 'text' || el.type === 'image') return { idx, x: el.x, y: el.y }
              return { idx, points: el.points.map(p => ({ ...p })) }
            }),
            origLassoPoly: lassoPolygonRef.current ? lassoPolygonRef.current.map(p => ({ ...p })) : null,
          }
          isDrawingRef.current = true
          panRef.current = { active: false }
          return
        }
      }

      // Cursor: allow touch to select/move/resize images
      if (tool === 'cursor') {
        setImageMenu(null)
        // Check resize handles on selected image
        if (selectedImageRef.current !== null) {
          const selEl = elementsRef.current[selectedImageRef.current]
          if (selEl?.type === 'image' && !selEl.locked) {
            const handle = getResizeHandle(selEl, pos.x, pos.y, viewRef.current.zoom)
            if (handle) {
              e.preventDefault()
              activeCanvasRef.current?.setPointerCapture(e.pointerId)
              imgDragRef.current = {
                mode: 'resize', handle,
                startX: pos.x, startY: pos.y,
                origX: selEl.x, origY: selEl.y,
                origW: selEl.width, origH: selEl.height,
              }
              isDrawingRef.current = true
              panRef.current = { active: false }
              return
            }
          }
        }
        // Check if touching any image
        for (let i = elementsRef.current.length - 1; i >= 0; i--) {
          const el = elementsRef.current[i]
          if (el.type === 'image' && hitTestElement(el, pos.x, pos.y, 0)) {
            e.preventDefault()
            activeCanvasRef.current?.setPointerCapture(e.pointerId)
            setSelectedImage(i)
            if (!el.locked) {
              imgDragRef.current = {
                mode: 'move', handle: null,
                startX: pos.x, startY: pos.y,
                origX: el.x, origY: el.y,
                origW: el.width, origH: el.height,
              }
              isDrawingRef.current = true
            }
            panRef.current = { active: false }
            return
          }
        }
      }

      // Default single-finger: pan
      const v = viewRef.current
      panRef.current = { active: true, startX: e.clientX, startY: e.clientY, startViewX: v.x, startViewY: v.y }
      e.preventDefault()
      activeCanvasRef.current?.setPointerCapture(e.pointerId)
      return
    }

    e.preventDefault()
    const canvas = activeCanvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(e.pointerId)

    const pos = screenToCanvas(e.clientX, e.clientY)

    // ── Text tool ──
    if (tool === 'text') {
      // Check if clicking on existing text
      for (let i = elementsRef.current.length - 1; i >= 0; i--) {
        const el = elementsRef.current[i]
        if (el.type === 'text' && hitTestElement(el, pos.x, pos.y, 0)) {
          setEditingText({ idx: i, el: { ...el }, isNew: false })
          return
        }
      }
      // Create new text element
      const newEl = {
        type: 'text',
        id: crypto.randomUUID(),
        x: pos.x,
        y: pos.y,
        text: '',
        fontSize: textFontSize,
        color: color,
        width: 300,
      }
      setEditingText({ idx: -1, el: newEl, isNew: true })
      return
    }

    // ── Cursor tool — select, move, resize any element ──
    if (tool === 'cursor') {
      // Close image menu if open
      setImageMenu(null)
      // Check if clicking a resize handle on currently selected image first
      if (selectedImage !== null) {
        const selEl = elementsRef.current[selectedImage]
        if (selEl?.type === 'image' && !selEl.locked) {
          const handle = getResizeHandle(selEl, pos.x, pos.y, viewRef.current.zoom)
          if (handle) {
            imgDragRef.current = {
              mode: 'resize', handle,
              startX: pos.x, startY: pos.y,
              origX: selEl.x, origY: selEl.y,
              origW: selEl.width, origH: selEl.height,
            }
            isDrawingRef.current = true
            return
          }
        }
      }
      // Check if clicking on any element (images first, then text, then strokes)
      for (let i = elementsRef.current.length - 1; i >= 0; i--) {
        const el = elementsRef.current[i]
        if (hitTestElement(el, pos.x, pos.y, el.type === 'image' ? 0 : 8 / viewRef.current.zoom)) {
          if (el.type === 'image') {
            setSelectedImage(i)
            if (!el.locked) {
              imgDragRef.current = {
                mode: 'move', handle: null,
                startX: pos.x, startY: pos.y,
                origX: el.x, origY: el.y,
                origW: el.width, origH: el.height,
              }
              isDrawingRef.current = true
            }
            return
          }
          if (el.type === 'text') {
            setEditingText({ idx: i, el: { ...el }, isNew: false })
            return
          }
        }
      }
      // Clicked empty space — deselect
      setSelectedImage(null)
      return
    }

    // ── Image tool ──
    if (tool === 'image') {
      // Check if clicking on an existing image — select it for move/resize
      if (selectedImage !== null) {
        const selEl = elementsRef.current[selectedImage]
        if (selEl?.type === 'image') {
          const handle = getResizeHandle(selEl, pos.x, pos.y, viewRef.current.zoom)
          if (handle) {
            imgDragRef.current = {
              mode: 'resize', handle,
              startX: pos.x, startY: pos.y,
              origX: selEl.x, origY: selEl.y,
              origW: selEl.width, origH: selEl.height,
            }
            isDrawingRef.current = true
            return
          }
        }
      }
      for (let i = elementsRef.current.length - 1; i >= 0; i--) {
        const el = elementsRef.current[i]
        if (el.type === 'image' && hitTestElement(el, pos.x, pos.y, 0)) {
          setSelectedImage(i)
          imgDragRef.current = {
            mode: 'move', handle: null,
            startX: pos.x, startY: pos.y,
            origX: el.x, origY: el.y,
            origW: el.width, origH: el.height,
          }
          isDrawingRef.current = true
          return
        }
      }
      // If already have a selected image and clicked elsewhere, deselect
      if (selectedImage !== null) {
        setSelectedImage(null)
        return
      }
      // Open file picker
      fileInputRef.current?.click()
      return
    }

    // ── Lasso tool ──
    if (tool === 'lasso') {
      // If clicking inside existing selection, start drag
      if (selectedIndices && selectedIndices.size > 0) {
        const insideSelection = lassoPolygonRef.current
          ? pointInPolygon(pos.x, pos.y, lassoPolygonRef.current)
          : (() => { const cb = getSelectionBounds(elementsRef.current, selectedIndices); return pos.x >= cb.x && pos.x <= cb.x + cb.w && pos.y >= cb.y && pos.y <= cb.y + cb.h })()
        if (insideSelection) {
          // Toggle floating toolbar on click, or start drag
          selDragRef.current = {
            startX: pos.x,
            startY: pos.y,
            moved: false,
            origPositions: [...selectedIndices].map(idx => {
              const el = elementsRef.current[idx]
              if (el.type === 'text' || el.type === 'image') return { idx, x: el.x, y: el.y }
              return { idx, points: el.points.map(p => ({ ...p })) }
            }),
            origLassoPoly: lassoPolygonRef.current ? lassoPolygonRef.current.map(p => ({ ...p })) : null,
          }
          isDrawingRef.current = true
          return
        }
      }
      // Start new lasso
      setSelectedIndices(null)
      setSelectionBounds(null)
      setShowSelToolbar(false)
      lassoPolygonRef.current = null
      setLassoPath([pos])
      isDrawingRef.current = true
      return
    }

    // ── Eraser ──
    if (tool === 'eraser') {
      const removed = []
      elementsRef.current = elementsRef.current.filter(s => {
        if (hitTestElement(s, pos.x, pos.y, ERASER_SIZES[eraserSize] / viewRef.current.zoom)) {
          removed.push(s)
          return false
        }
        return true
      })
      if (removed.length > 0) {
        undoStackRef.current.push({ type: 'erase', strokes: removed })
        redoStackRef.current = []
        redrawAll()
        scheduleSave()
        updateCounts()
      }
      isDrawingRef.current = true
      return
    }

    // ── Pen / Highlighter ──
    // Snap-to-endpoint: check existing strokes for nearby endpoints
    let startPos = { x: pos.x, y: pos.y }
    for (const el of elementsRef.current) {
      if (!el.points || el.points.length < 2) continue
      const first = el.points[0], last = el.points[el.points.length - 1]
      if (Math.hypot(pos.x - first.x, pos.y - first.y) < SNAP_DISTANCE / viewRef.current.zoom) {
        startPos = { x: first.x, y: first.y }
        break
      }
      if (Math.hypot(pos.x - last.x, pos.y - last.y) < SNAP_DISTANCE / viewRef.current.zoom) {
        startPos = { x: last.x, y: last.y }
        break
      }
    }

    straightenRef.current = false
    lastMoveTimeRef.current = Date.now()
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current)

    currentStrokeRef.current = {
      tool,
      color,
      width: thickness,
      opacity: tool === 'highlighter' ? HIGHLIGHTER_OPACITY : 1,
      points: [{ x: startPos.x, y: startPos.y, pressure: e.pressure || 0.5 }],
    }
    isDrawingRef.current = true
  }, [tool, color, thickness, selectedIndices, selectedImage, eraserSize, textFontSize])

  const handlePointerMove = useCallback((e) => {
    if (e.pointerType === 'touch') {
      handleTouchPointerMove(e)
      // If we're actively dragging a selection or image via touch, fall through to normal handlers
      if (isDrawingRef.current && (selDragRef.current || imgDragRef.current)) {
        // Don't pan — handle below
      } else if (panRef.current.active && gestureRef.current.pointers.size === 1 && !gestureRef.current.active) {
        e.preventDefault()
        const v = viewRef.current
        v.x = panRef.current.startViewX + (e.clientX - panRef.current.startX)
        v.y = panRef.current.startViewY + (e.clientY - panRef.current.startY)
        clampViewport()
        redrawAll()
        updateSelectionBoundsScreen()
        return
      } else {
        return
      }
    }

    // Track cursor for eraser circle / pen dot preview
    if (tool === 'eraser' || tool === 'pen' || tool === 'highlighter') {
      const rect = activeCanvasRef.current?.getBoundingClientRect()
      if (rect) setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }

    if (!isDrawingRef.current) return
    e.preventDefault()

    const pos = screenToCanvas(e.clientX, e.clientY)

    // Image move/resize (cursor or image tool)
    const selImg = selectedImageRef.current
    if ((tool === 'image' || tool === 'cursor') && imgDragRef.current && selImg !== null) {
      const el = elementsRef.current[selImg]
      if (!el) return
      const d = imgDragRef.current
      const dx = pos.x - d.startX
      const dy = pos.y - d.startY
      if (d.mode === 'move') {
        el.x = d.origX + dx
        el.y = d.origY + dy
      } else if (d.mode === 'resize') {
        const aspect = d.origW / d.origH
        if (d.handle === 'br') {
          el.width = Math.max(40, d.origW + dx)
          el.height = el.width / aspect
        } else if (d.handle === 'bl') {
          const newW = Math.max(40, d.origW - dx)
          el.x = d.origX + d.origW - newW
          el.width = newW
          el.height = newW / aspect
        } else if (d.handle === 'tr') {
          el.width = Math.max(40, d.origW + dx)
          const newH = el.width / aspect
          el.y = d.origY + d.origH - newH
          el.height = newH
        } else if (d.handle === 'tl') {
          const newW = Math.max(40, d.origW - dx)
          el.x = d.origX + d.origW - newW
          const newH = newW / aspect
          el.y = d.origY + d.origH - newH
          el.width = newW
          el.height = newH
        }
      }
      redrawAll()
      return
    }

    // Lasso drag
    if (tool === 'lasso' && selDragRef.current) {
      const dx = pos.x - selDragRef.current.startX
      const dy = pos.y - selDragRef.current.startY
      if (Math.abs(dx) > LASSO_MOVE_THRESHOLD || Math.abs(dy) > LASSO_MOVE_THRESHOLD) selDragRef.current.moved = true
      for (const orig of selDragRef.current.origPositions) {
        const el = elementsRef.current[orig.idx]
        if (el.locked) continue
        if (el.type === 'text' || el.type === 'image') {
          el.x = orig.x + dx
          el.y = orig.y + dy
        } else if (orig.points) {
          el.points = orig.points.map(p => ({ x: p.x + dx, y: p.y + dy, pressure: p.pressure }))
        }
      }
      // Move lasso polygon with selection
      if (lassoPolygonRef.current && selDragRef.current.origLassoPoly) {
        lassoPolygonRef.current = selDragRef.current.origLassoPoly.map(p => ({ x: p.x + dx, y: p.y + dy }))
      }
      redrawAll()
      updateSelectionBoundsScreen()
      return
    }

    // Lasso path drawing
    if (tool === 'lasso' && lassoPath) {
      setLassoPath(prev => [...prev, pos])
      // Draw lasso on active canvas
      clearActiveCanvas()
      const ctx = activeCanvasRef.current.getContext('2d')
      applyViewTransform(ctx)
      ctx.save()
      ctx.setLineDash([4 / viewRef.current.zoom, 4 / viewRef.current.zoom])
      ctx.strokeStyle = '#1a73e8'
      ctx.lineWidth = 1.5 / viewRef.current.zoom
      ctx.beginPath()
      ctx.moveTo(lassoPath[0].x, lassoPath[0].y)
      for (const p of lassoPath) ctx.lineTo(p.x, p.y)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
      ctx.restore()
      return
    }

    // Eraser
    if (tool === 'eraser') {
      const removed = []
      elementsRef.current = elementsRef.current.filter(s => {
        if (hitTestElement(s, pos.x, pos.y, ERASER_SIZES[eraserSize] / viewRef.current.zoom)) {
          removed.push(s)
          return false
        }
        return true
      })
      if (removed.length > 0) {
        undoStackRef.current.push({ type: 'erase', strokes: removed })
        redoStackRef.current = []
        redrawAll()
        scheduleSave()
        updateCounts()
      }
      return
    }

    // Pen / Highlighter
    if (!currentStrokeRef.current) return

    // If already straightened, moving the pen rotates/resizes the line around its origin
    if (straightenRef.current) {
      const pos = screenToCanvas(e.clientX, e.clientY)
      const first = currentStrokeRef.current.points[0]
      // Snap endpoint to nearby existing stroke endpoints
      let endPos = { x: pos.x, y: pos.y }
      const snapDist = SNAP_DISTANCE / viewRef.current.zoom
      for (const el of elementsRef.current) {
        if (!el.points || el.points.length < 2) continue
        const ef = el.points[0], el2 = el.points[el.points.length - 1]
        if (Math.hypot(pos.x - ef.x, pos.y - ef.y) < snapDist) { endPos = { x: ef.x, y: ef.y }; break }
        if (Math.hypot(pos.x - el2.x, pos.y - el2.y) < snapDist) { endPos = { x: el2.x, y: el2.y }; break }
      }
      currentStrokeRef.current.points = [first, { x: endPos.x, y: endPos.y, pressure: first.pressure }]
      clearActiveCanvas()
      const previewCtx = activeCanvasRef.current.getContext('2d')
      applyViewTransform(previewCtx)
      previewCtx.save()
      previewCtx.lineCap = 'round'
      previewCtx.strokeStyle = currentStrokeRef.current.color
      previewCtx.lineWidth = currentStrokeRef.current.width
      previewCtx.globalAlpha = currentStrokeRef.current.tool === 'highlighter' ? HIGHLIGHTER_OPACITY : 1
      previewCtx.beginPath()
      previewCtx.moveTo(first.x, first.y)
      previewCtx.lineTo(endPos.x, endPos.y)
      previewCtx.stroke()
      // Snap indicator dot at origin
      previewCtx.fillStyle = '#0fa76e'
      previewCtx.beginPath()
      previewCtx.arc(first.x, first.y, 4 / viewRef.current.zoom, 0, Math.PI * 2)
      previewCtx.fill()
      previewCtx.restore()
      return
    }

    const points = getCoalescedCanvasPoints(e)
    currentStrokeRef.current.points.push(...points)
    lastMoveTimeRef.current = Date.now()

    // Start/reset hold timer for line straightening
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
    holdTimerRef.current = setTimeout(() => {
      if (!isDrawingRef.current || !currentStrokeRef.current) return
      straightenRef.current = true
      // Show straight line preview
      clearActiveCanvas()
      const previewCtx = activeCanvasRef.current.getContext('2d')
      applyViewTransform(previewCtx)
      const pts = currentStrokeRef.current.points
      if (pts.length >= 2) {
        previewCtx.save()
        previewCtx.lineCap = 'round'
        previewCtx.strokeStyle = currentStrokeRef.current.color
        previewCtx.lineWidth = currentStrokeRef.current.width
        previewCtx.globalAlpha = currentStrokeRef.current.tool === 'highlighter' ? HIGHLIGHTER_OPACITY : 1
        previewCtx.beginPath()
        previewCtx.moveTo(pts[0].x, pts[0].y)
        previewCtx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y)
        previewCtx.stroke()
        previewCtx.restore()
      }
    }, 500)

    clearActiveCanvas()
    const ctx = activeCanvasRef.current.getContext('2d')
    applyViewTransform(ctx)
    drawStroke(ctx, currentStrokeRef.current)
  }, [tool, lassoPath, eraserSize])

  const handlePointerUp = useCallback((e) => {
    if (e.pointerType === 'touch') {
      handleTouchPointerUp(e)
      panRef.current.active = false
      // If we were dragging a selection or image via touch, fall through to release handlers
      if (isDrawingRef.current && (selDragRef.current || imgDragRef.current)) {
        // Fall through — don't return
      } else {
        return
      }
    }

    if (!isDrawingRef.current) return
    isDrawingRef.current = false

    // Image move/resize release
    const selImg = selectedImageRef.current
    if ((tool === 'image' || tool === 'cursor') && imgDragRef.current && selImg !== null) {
      const d = imgDragRef.current
      const el = elementsRef.current[selImg]
      imgDragRef.current = null
      if (el && (el.x !== d.origX || el.y !== d.origY || el.width !== d.origW || el.height !== d.origH)) {
        undoStackRef.current.push({
          type: 'transform',
          indices: [selImg],
          before: [{ idx: selImg, x: d.origX, y: d.origY, width: d.origW, height: d.origH }],
          after: [{ idx: selImg, x: el.x, y: el.y, width: el.width, height: el.height }],
        })
        redoStackRef.current = []
        scheduleSave()
        updateCounts()
      }
      return
    }

    // Lasso drag release
    if (tool === 'lasso' && selDragRef.current) {
      if (selDragRef.current.moved) {
        undoStackRef.current.push({
          type: 'transform',
          indices: [...selectedIndices],
          before: selDragRef.current.origPositions,
          after: [...selectedIndices].map(idx => {
            const el = elementsRef.current[idx]
            if (el.type === 'text' || el.type === 'image') return { idx, x: el.x, y: el.y }
            return { idx, points: el.points.map(p => ({ ...p })) }
          }),
        })
        redoStackRef.current = []
        scheduleSave()
        updateCounts()
      } else {
        // Click without move: toggle toolbar
        setShowSelToolbar(prev => !prev)
      }
      selDragRef.current = null
      return
    }

    // Lasso path complete
    if (tool === 'lasso' && lassoPath && lassoPath.length > 2) {
      const polygon = lassoPath
      const hits = new Set()
      elementsRef.current.forEach((el, idx) => {
        if (!el.type || el.type === 'stroke') {
          // Check if any stroke point is inside the polygon
          if (el.points?.some(p => pointInPolygon(p.x, p.y, polygon))) hits.add(idx)
        } else {
          // For text/image, check center point
          const b = getElementBounds(el)
          if (pointInPolygon(b.x + b.w / 2, b.y + b.h / 2, polygon)) hits.add(idx)
        }
      })
      setLassoPath(null)
      clearActiveCanvas()
      if (hits.size > 0) {
        // Store the lasso polygon for persistent display
        lassoPolygonRef.current = polygon.map(p => ({ ...p }))
        setSelectedIndices(hits)
        const cb = getSelectionBounds(elementsRef.current, hits)
        const tl = canvasToScreen(cb.x, cb.y)
        const br = canvasToScreen(cb.x + cb.w, cb.y + cb.h)
        setSelectionBounds({ x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y })
        setShowSelToolbar(false)
      } else {
        lassoPolygonRef.current = null
        setSelectedIndices(null)
        setSelectionBounds(null)
      }
      redrawAll()
      return
    }
    setLassoPath(null)

    // Eraser
    if (tool === 'eraser' || !currentStrokeRef.current) return

    // Clear hold timer
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null }

    const stroke = currentStrokeRef.current
    currentStrokeRef.current = null

    if (stroke.points.length < 2) {
      clearActiveCanvas()
      straightenRef.current = false
      return
    }

    // Line straightening: if held still for 500ms, replace with straight line
    if (straightenRef.current) {
      const first = stroke.points[0]
      let last = stroke.points[stroke.points.length - 1]
      // Snap endpoint to nearby existing stroke endpoints
      const snapDist = SNAP_DISTANCE / viewRef.current.zoom
      for (const el of elementsRef.current) {
        if (!el.points || el.points.length < 2) continue
        const ef = el.points[0], el2 = el.points[el.points.length - 1]
        if (Math.hypot(last.x - ef.x, last.y - ef.y) < snapDist) { last = { ...last, x: ef.x, y: ef.y }; break }
        if (Math.hypot(last.x - el2.x, last.y - el2.y) < snapDist) { last = { ...last, x: el2.x, y: el2.y }; break }
      }
      stroke.points = [first, last]
      straightenRef.current = false
    }

    // Round points
    stroke.points = stroke.points.map(p => ({
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      pressure: Math.round(p.pressure * 100) / 100,
    }))

    // RDP point reduction (always on for data size)
    if (stroke.points.length > 3) {
      stroke.points = rdpSimplify(stroke.points, 0.3)
    }

    // Mark stroke with smooth flag for rendering
    stroke.smooth = smoothing

    elementsRef.current.push(stroke)
    undoStackRef.current.push({ type: 'draw', stroke })
    redoStackRef.current = []

    clearActiveCanvas()
    const ctx = staticCanvasRef.current.getContext('2d')
    applyViewTransform(ctx)
    drawStroke(ctx, stroke)

    scheduleSave()
    updateCounts()
  }, [tool, smoothing, lassoPath, selectedIndices])

  // ── Undo / Redo ──
  const handleUndo = useCallback(() => {
    const action = undoStackRef.current.pop()
    if (!action) return

    if (action.type === 'draw') {
      const idx = elementsRef.current.lastIndexOf(action.stroke)
      if (idx !== -1) elementsRef.current.splice(idx, 1)
      redoStackRef.current.push(action)
    } else if (action.type === 'erase') {
      elementsRef.current.push(...action.strokes)
      redoStackRef.current.push(action)
    } else if (action.type === 'clear') {
      elementsRef.current = action.strokes
      redoStackRef.current.push(action)
    } else if (action.type === 'transform') {
      // Support both action.before (array) and action.items (flip/lock)
      const items = action.items || action.before
      for (const orig of items) {
        const el = elementsRef.current[orig.idx]
        if (!el) continue
        const src = orig.before || orig // flip/lock uses {idx, before, after}, lasso/move uses {idx, x, y, ...}
        if (src.x != null) { el.x = src.x; el.y = src.y }
        if (src.width != null) { el.width = src.width; el.height = src.height }
        if (src.flipH != null) el.flipH = src.flipH
        if (src.flipV != null) el.flipV = src.flipV
        if (src.locked != null) el.locked = src.locked
        if (src.points) el.points = src.points.map(p => ({ ...p }))
      }
      redoStackRef.current.push(action)
    } else if (action.type === 'deleteSelected') {
      // Re-insert deleted elements at their original indices
      for (const { idx, el } of action.items.sort((a, b) => a.idx - b.idx)) {
        elementsRef.current.splice(idx, 0, el)
      }
      redoStackRef.current.push(action)
    } else if (action.type === 'addText' || action.type === 'editText') {
      if (action.type === 'addText') {
        const idx = elementsRef.current.findIndex(el => el.id === action.el.id)
        if (idx !== -1) elementsRef.current.splice(idx, 1)
      } else {
        const idx = elementsRef.current.findIndex(el => el.id === action.el.id)
        if (idx !== -1) elementsRef.current[idx] = { ...action.before }
      }
      redoStackRef.current.push(action)
    } else if (action.type === 'colorChange' || action.type === 'thicknessChange') {
      for (const { idx, before } of action.changes) {
        const el = elementsRef.current[idx]
        if (!el) continue
        if (action.type === 'colorChange') el.color = before
        else el.width = before
      }
      redoStackRef.current.push(action)
    }

    setSelectedIndices(null)
    setSelectionBounds(null)
    setShowSelToolbar(false)
    redrawAll()
    scheduleSave()
    updateCounts()
  }, [])

  const handleRedo = useCallback(() => {
    const action = redoStackRef.current.pop()
    if (!action) return

    if (action.type === 'draw') {
      elementsRef.current.push(action.stroke)
      undoStackRef.current.push(action)
    } else if (action.type === 'erase') {
      elementsRef.current = elementsRef.current.filter(s => !action.strokes.includes(s))
      undoStackRef.current.push(action)
    } else if (action.type === 'clear') {
      elementsRef.current = []
      undoStackRef.current.push(action)
    } else if (action.type === 'transform') {
      // Support both action.after (array) and action.items (flip/lock)
      const items = action.items || action.after
      for (const snap of items) {
        const el = elementsRef.current[snap.idx]
        if (!el) continue
        const src = snap.after || snap // flip/lock uses {idx, before, after}, lasso/move uses {idx, x, y, ...}
        if (src.x != null) { el.x = src.x; el.y = src.y }
        if (src.width != null) { el.width = src.width; el.height = src.height }
        if (src.flipH != null) el.flipH = src.flipH
        if (src.flipV != null) el.flipV = src.flipV
        if (src.locked != null) el.locked = src.locked
        if (src.points) el.points = src.points.map(p => ({ ...p }))
      }
      undoStackRef.current.push(action)
    } else if (action.type === 'deleteSelected') {
      const ids = action.items.map(i => i.el.id || i.idx)
      elementsRef.current = elementsRef.current.filter((el, idx) => !action.items.some(i => i.idx === idx || (el.id && el.id === i.el.id)))
      undoStackRef.current.push(action)
    } else if (action.type === 'addText') {
      elementsRef.current.push(action.el)
      undoStackRef.current.push(action)
    } else if (action.type === 'editText') {
      const idx = elementsRef.current.findIndex(el => el.id === action.el.id)
      if (idx !== -1) elementsRef.current[idx] = { ...action.after }
      undoStackRef.current.push(action)
    } else if (action.type === 'colorChange' || action.type === 'thicknessChange') {
      for (const { idx, after } of action.changes) {
        const el = elementsRef.current[idx]
        if (!el) continue
        if (action.type === 'colorChange') el.color = after
        else el.width = after
      }
      undoStackRef.current.push(action)
    }

    redrawAll()
    scheduleSave()
    updateCounts()
  }, [])

  const handleClear = useCallback(() => {
    if (elementsRef.current.length === 0) return
    if (!confirm('Clear all?')) return
    undoStackRef.current.push({ type: 'clear', strokes: [...elementsRef.current] })
    redoStackRef.current = []
    elementsRef.current = []
    setSelectedIndices(null)
    setSelectionBounds(null)
    setShowSelToolbar(false)
    redrawAll()
    scheduleSave()
    updateCounts()
  }, [])

  // ── Selection actions (from floating toolbar) ──
  function handleSelChangeColor(newColor) {
    if (!selectedIndices) return
    const changes = []
    for (const idx of selectedIndices) {
      const el = elementsRef.current[idx]
      changes.push({ idx, before: el.color, after: newColor })
      el.color = newColor
    }
    undoStackRef.current.push({ type: 'colorChange', changes })
    redoStackRef.current = []
    redrawAll()
    scheduleSave()
    updateCounts()
  }

  function handleSelChangeThickness(newThickness) {
    if (!selectedIndices) return
    const changes = []
    for (const idx of selectedIndices) {
      const el = elementsRef.current[idx]
      if (el.type === 'text' || el.type === 'image') continue
      changes.push({ idx, before: el.width, after: newThickness })
      el.width = newThickness
    }
    if (changes.length === 0) return
    undoStackRef.current.push({ type: 'thicknessChange', changes })
    redoStackRef.current = []
    redrawAll()
    scheduleSave()
    updateCounts()
  }

  function handleSelDelete() {
    if (!selectedIndices) return
    const items = [...selectedIndices].sort((a, b) => b - a).map(idx => ({ idx, el: elementsRef.current[idx] }))
    for (const { idx } of items) elementsRef.current.splice(idx, 1)
    undoStackRef.current.push({ type: 'deleteSelected', items: items.reverse() })
    redoStackRef.current = []
    setSelectedIndices(null)
    setSelectionBounds(null)
    setShowSelToolbar(false)
    redrawAll()
    scheduleSave()
    updateCounts()
  }

  function handleSelDuplicate() {
    if (!selectedIndices) return
    const newEls = []
    for (const idx of selectedIndices) {
      const el = elementsRef.current[idx]
      const clone = JSON.parse(JSON.stringify(el))
      if (clone.id) clone.id = crypto.randomUUID()
      // Offset the duplicate
      if (clone.type === 'text' || clone.type === 'image') {
        clone.x += 20; clone.y += 20
      } else if (clone.points) {
        clone.points = clone.points.map(p => ({ ...p, x: p.x + 20, y: p.y + 20 }))
      }
      newEls.push(clone)
    }
    elementsRef.current.push(...newEls)
    for (const el of newEls) {
      undoStackRef.current.push({ type: 'draw', stroke: el })
    }
    redoStackRef.current = []
    setSelectedIndices(null)
    setSelectionBounds(null)
    setShowSelToolbar(false)
    redrawAll()
    scheduleSave()
    updateCounts()
  }

  function handleSelFlipH() {
    if (!selectedIndices) return
    const cb = getSelectionBounds(elementsRef.current, selectedIndices)
    const centerX = cb.x + cb.w / 2
    const before = [...selectedIndices].map(idx => {
      const el = elementsRef.current[idx]
      if (el.type === 'text' || el.type === 'image') return { idx, x: el.x, y: el.y }
      return { idx, points: el.points.map(p => ({ ...p })) }
    })
    for (const idx of selectedIndices) {
      const el = elementsRef.current[idx]
      if (el.type === 'text' || el.type === 'image') {
        el.x = 2 * centerX - el.x - (el.width || 0)
      } else if (el.points) {
        el.points = el.points.map(p => ({ ...p, x: 2 * centerX - p.x }))
      }
    }
    const after = [...selectedIndices].map(idx => {
      const el = elementsRef.current[idx]
      if (el.type === 'text' || el.type === 'image') return { idx, x: el.x, y: el.y }
      return { idx, points: el.points.map(p => ({ ...p })) }
    })
    undoStackRef.current.push({ type: 'transform', indices: [...selectedIndices], before, after })
    redoStackRef.current = []
    redrawAll()
    updateSelectionBoundsScreen()
    scheduleSave()
    updateCounts()
  }

  function handleSelFlipV() {
    if (!selectedIndices) return
    const cb = getSelectionBounds(elementsRef.current, selectedIndices)
    const centerY = cb.y + cb.h / 2
    const before = [...selectedIndices].map(idx => {
      const el = elementsRef.current[idx]
      if (el.type === 'text' || el.type === 'image') return { idx, x: el.x, y: el.y }
      return { idx, points: el.points.map(p => ({ ...p })) }
    })
    for (const idx of selectedIndices) {
      const el = elementsRef.current[idx]
      if (el.type === 'text' || el.type === 'image') {
        el.y = 2 * centerY - el.y - (getElementBounds(el).h || 0)
      } else if (el.points) {
        el.points = el.points.map(p => ({ ...p, y: 2 * centerY - p.y }))
      }
    }
    const after = [...selectedIndices].map(idx => {
      const el = elementsRef.current[idx]
      if (el.type === 'text' || el.type === 'image') return { idx, x: el.x, y: el.y }
      return { idx, points: el.points.map(p => ({ ...p })) }
    })
    undoStackRef.current.push({ type: 'transform', indices: [...selectedIndices], before, after })
    redoStackRef.current = []
    redrawAll()
    updateSelectionBoundsScreen()
    scheduleSave()
    updateCounts()
  }

  // ── Text editing ──
  function commitText() {
    if (!editingText) return
    const text = textAreaRef.current?.value || ''
    if (!text.trim()) {
      setEditingText(null)
      return
    }
    if (editingText.isNew) {
      const el = { ...editingText.el, text }
      elementsRef.current.push(el)
      undoStackRef.current.push({ type: 'addText', el })
      redoStackRef.current = []
    } else {
      const before = { ...editingText.el }
      elementsRef.current[editingText.idx] = { ...editingText.el, text }
      undoStackRef.current.push({ type: 'editText', el: editingText.el, before, after: { ...editingText.el, text } })
      redoStackRef.current = []
    }
    setEditingText(null)
    redrawAll()
    scheduleSave()
    updateCounts()
  }

  // ── Image context menu actions ──
  function handleImageDelete(idx) {
    const el = elementsRef.current[idx]
    if (!el) return
    elementsRef.current.splice(idx, 1)
    undoStackRef.current.push({ type: 'deleteSelected', items: [{ idx, el }] })
    redoStackRef.current = []
    setSelectedImage(null)
    setImageMenu(null)
    redrawAll()
    scheduleSave()
    updateCounts()
  }

  function handleImageDuplicate(idx) {
    const el = elementsRef.current[idx]
    if (!el) return
    const clone = JSON.parse(JSON.stringify(el))
    if (clone.id) clone.id = crypto.randomUUID()
    clone.x += 20; clone.y += 20
    clone.locked = false
    elementsRef.current.push(clone)
    undoStackRef.current.push({ type: 'draw', stroke: clone })
    redoStackRef.current = []
    if (clone.src) preloadImage(clone.src)
    setSelectedImage(elementsRef.current.length - 1)
    setImageMenu(null)
    redrawAll()
    scheduleSave()
    updateCounts()
  }

  function handleImageFlip(idx, axis) {
    const el = elementsRef.current[idx]
    if (!el || el.locked) return
    const beforeFlipH = el.flipH, beforeFlipV = el.flipV
    if (axis === 'h') el.flipH = !el.flipH
    else el.flipV = !el.flipV
    undoStackRef.current.push({ type: 'transform', items: [{ idx, before: { flipH: beforeFlipH, flipV: beforeFlipV }, after: { flipH: el.flipH, flipV: el.flipV } }] })
    redoStackRef.current = []
    setImageMenu(null)
    redrawAll()
    scheduleSave()
    updateCounts()
  }

  function handleImageLock(idx) {
    const el = elementsRef.current[idx]
    if (!el) return
    const wasLocked = el.locked
    el.locked = !el.locked
    undoStackRef.current.push({ type: 'transform', items: [{ idx, before: { locked: wasLocked }, after: { locked: el.locked } }] })
    redoStackRef.current = []
    setImageMenu(null)
    redrawAll()
    scheduleSave()
    updateCounts()
  }

  function handleImageBringForward(idx) {
    if (idx >= elementsRef.current.length - 1) return
    const arr = elementsRef.current
    ;[arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]
    setSelectedImage(idx + 1)
    setImageMenu(null)
    redrawAll()
    scheduleSave()
  }

  function handleImageSendBackward(idx) {
    if (idx <= 0) return
    const arr = elementsRef.current
    ;[arr[idx], arr[idx - 1]] = [arr[idx - 1], arr[idx]]
    setSelectedImage(idx - 1)
    setImageMenu(null)
    redrawAll()
    scheduleSave()
  }

  // ── Keyboard handler (Delete, paste) ──
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const handleKeyDown = (e) => {
      if (editingText) return // don't intercept text editing
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Delete selected image
        const selImg = selectedImageRef.current
        if (selImg !== null) {
          e.preventDefault()
          const el = elementsRef.current[selImg]
          if (el) {
            elementsRef.current.splice(selImg, 1)
            undoStackRef.current.push({ type: 'deleteSelected', items: [{ idx: selImg, el }] })
            redoStackRef.current = []
            setSelectedImage(null)
            redrawAll()
            scheduleSave()
            updateCounts()
          }
          return
        }
        // Delete lasso selection
        const selIdx = selectedIndicesRef.current
        if (selIdx && selIdx.size > 0) {
          e.preventDefault()
          handleSelDelete()
          return
        }
      }
    }

    const handlePaste = async (e) => {
      if (editingText) return
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (!file) continue
          const { dataUrl, width, height } = await compressImage(file)
          insertImageAtCenter(dataUrl, width, height)
          break
        }
      }
    }

    // Context menu: show image menu if cursor tool + clicking on image, otherwise native menu
    const handleContextMenu = (e) => {
      if (tool !== 'cursor' && tool !== 'image') return // let native menu show
      const rect = activeCanvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const pos = screenToCanvas(e.clientX, e.clientY)
      // Check if right-clicking on an image
      for (let i = elementsRef.current.length - 1; i >= 0; i--) {
        const el = elementsRef.current[i]
        if (el.type === 'image' && hitTestElement(el, pos.x, pos.y, 0)) {
          e.preventDefault()
          setSelectedImage(i)
          setImageMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, idx: i })
          redrawAll()
          return
        }
      }
      // No image hit — let native menu show (for paste etc)
    }

    wrapper.addEventListener('keydown', handleKeyDown)
    wrapper.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('paste', handlePaste)
    // Make wrapper focusable for keyboard events
    if (!wrapper.getAttribute('tabindex')) wrapper.setAttribute('tabindex', '-1')
    return () => {
      wrapper.removeEventListener('keydown', handleKeyDown)
      wrapper.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('paste', handlePaste)
    }
  }, [lessonId, editingText, tool])

  // ── Export ──
  function exportAsPNG() {
    const pageBottom = getPageBottom()
    const offscreen = document.createElement('canvas')
    offscreen.width = EXPORT_WIDTH * 2
    offscreen.height = pageBottom * 2
    const ctx = offscreen.getContext('2d')
    ctx.scale(2, 2)
    // Fill page background
    ctx.fillStyle = getIsDark() ? PAGE_BG_DARK : PAGE_BG
    ctx.fillRect(0, 0, EXPORT_WIDTH, pageBottom)
    // Draw template
    drawTemplateOnExport(ctx, EXPORT_WIDTH, pageBottom)
    // Draw all elements
    elementsRef.current.forEach(el => drawElement(ctx, el, imageCacheRef.current))
    // Download
    const link = document.createElement('a')
    link.download = `notebook-${lessonId}.png`
    link.href = offscreen.toDataURL('image/png')
    link.click()
  }

  async function exportAsPDF() {
    try {
      const jsPDFModule = await import('jspdf')
      const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF
      const pageBottom = getPageBottom()
      const pdfPageH = EXPORT_WIDTH * 1.414 // A4 ratio
      const pageCount = Math.ceil(pageBottom / pdfPageH)
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [EXPORT_WIDTH, pdfPageH] })

      for (let p = 0; p < pageCount; p++) {
        if (p > 0) pdf.addPage()
        const offscreen = document.createElement('canvas')
        offscreen.width = EXPORT_WIDTH * 2
        offscreen.height = pdfPageH * 2
        const ctx = offscreen.getContext('2d')
        ctx.scale(2, 2)
        ctx.fillStyle = getIsDark() ? PAGE_BG_DARK : PAGE_BG
        ctx.fillRect(0, 0, EXPORT_WIDTH, pdfPageH)
        ctx.save()
        ctx.translate(0, -p * pdfPageH)
        drawTemplateOnExport(ctx, EXPORT_WIDTH, pageBottom)
        elementsRef.current.forEach(el => drawElement(ctx, el, imageCacheRef.current))
        ctx.restore()
        const imgData = offscreen.toDataURL('image/jpeg', 0.92)
        pdf.addImage(imgData, 'JPEG', 0, 0, EXPORT_WIDTH, pdfPageH)
      }

      pdf.save(`notebook-${lessonId}.pdf`)
    } catch {
      alert('PDF export requires jspdf. Install it with: npm install jspdf')
    }
  }

  function drawTemplateOnExport(ctx, w, h) {
    const tmpl = template || 'arabic'
    if (tmpl === 'blank') return
    ctx.strokeStyle = getIsDark() ? LINE_COLOR_DARK : LINE_COLOR
    ctx.lineWidth = 0.5
    if (tmpl === 'lined') {
      for (let y = LINE_SPACING; y < h; y += LINE_SPACING) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
      }
    } else if (tmpl === 'grid') {
      for (let y = LINE_SPACING; y < h; y += LINE_SPACING) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
      }
      for (let x = LINE_SPACING; x < w; x += LINE_SPACING) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
      }
    } else if (tmpl === 'dotted') {
      ctx.fillStyle = getIsDark() ? GRID_COLOR_DARK : GRID_COLOR
      for (let y = LINE_SPACING; y < h; y += LINE_SPACING) {
        for (let x = LINE_SPACING; x < w; x += LINE_SPACING) {
          ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill()
        }
      }
    } else if (tmpl === 'arabic') {
      const spacing = 48
      for (let y = spacing; y < h; y += spacing) {
        ctx.strokeStyle = getIsDark() ? '#3a3f46' : '#b0b8c0'
        ctx.lineWidth = 0.8
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
        const midY = y + spacing * 0.5
        ctx.strokeStyle = getIsDark() ? LINE_COLOR_DARK : LINE_COLOR
        ctx.lineWidth = 0.3
        ctx.setLineDash([4, 4])
        ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(w, midY); ctx.stroke()
        ctx.setLineDash([])
      }
    }
  }

  // ── Tool change clears selection ──
  useEffect(() => {
    if (tool !== 'lasso') {
      setSelectedIndices(null)
      setSelectionBounds(null)
      setShowSelToolbar(false)
      lassoPolygonRef.current = null
    }
    if (tool !== 'image' && tool !== 'cursor') {
      setSelectedImage(null)
    }
    // Auto-open file picker when image tool is selected
    if (tool === 'image') {
      fileInputRef.current?.click()
    }
    redrawAll()
  }, [tool])

  // ── Text overlay position ──
  const textOverlayStyle = editingText ? (() => {
    const v = viewRef.current
    const sx = editingText.el.x * v.zoom + v.x
    const sy = editingText.el.y * v.zoom + v.y
    return {
      position: 'absolute',
      left: sx,
      top: sy,
      fontSize: (editingText.el.fontSize || 20) * v.zoom,
      color: editingText.el.color || '#000',
      fontFamily: '"Noto Naskh Arabic", serif',
      direction: 'rtl',
      background: 'transparent',
      border: '1px dashed #1a73e8',
      outline: 'none',
      padding: 4,
      minWidth: 100 * v.zoom,
      minHeight: (editingText.el.fontSize || 20) * v.zoom * 1.5,
      zIndex: 100,
      resize: 'both',
      lineHeight: 1.5,
    }
  })() : null

  return (
    <div className="notebook-canvas-area">
      <NotebookToolbar
        tool={tool} onToolChange={setTool}
        color={color} onColorChange={setColor}
        thickness={thickness} onThicknessChange={setThickness}
        smoothing={smoothing} onSmoothingToggle={() => {
          setSmoothing(s => {
            const newVal = !s
            elementsRef.current.forEach(el => {
              if (!el.type || el.type === 'stroke') el.smooth = newVal
            })
            redrawAll()
            scheduleSave()
            return newVal
          })
        }}
        canUndo={undoCount > 0} canRedo={redoCount > 0}
        onUndo={handleUndo} onRedo={handleRedo}
        onClear={handleClear}
        onExportPNG={exportAsPNG}
        onExportPDF={exportAsPDF}
        eraserSize={eraserSize} onEraserSizeChange={setEraserSize}
        textFontSize={textFontSize} onTextFontSizeChange={setTextFontSize}
        onAnalyze={onAnalyze}
        analyzing={analyzing}
        hasAnalysis={hasAnalysis}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => { handleFileInput(e.target.files?.[0]); e.target.value = '' }}
      />
      <div ref={wrapperRef} className="notebook-canvas-wrapper" tabIndex={-1}>
        <canvas ref={linesCanvasRef} className="notebook-canvas" />
        <canvas ref={staticCanvasRef} className="notebook-canvas" />
        <canvas
          ref={activeCanvasRef}
          className="notebook-canvas notebook-canvas-active"
          style={{ cursor: (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') ? 'none' : (tool === 'cursor' ? 'default' : 'crosshair') }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={() => setCursorPos(null)}
        />
        {cursorPos && tool === 'eraser' && (
          <div className="notebook-cursor-circle" style={{
            left: cursorPos.x,
            top: cursorPos.y,
            width: ERASER_SIZES[eraserSize] * 2 * viewRef.current.zoom,
            height: ERASER_SIZES[eraserSize] * 2 * viewRef.current.zoom,
          }} />
        )}
        {cursorPos && (tool === 'pen' || tool === 'highlighter') && (
          <div className="notebook-cursor-dot" style={{
            left: cursorPos.x,
            top: cursorPos.y,
            width: (thickness + 2) * viewRef.current.zoom,
            height: (thickness + 2) * viewRef.current.zoom,
            backgroundColor: color,
            opacity: tool === 'highlighter' ? 0.5 : 0.7,
          }} />
        )}
        {/* Text editing overlay */}
        {editingText && (
          <textarea
            ref={textAreaRef}
            style={textOverlayStyle}
            defaultValue={editingText.el.text || ''}
            autoFocus
            onBlur={commitText}
            onKeyDown={e => { if (e.key === 'Escape') { setEditingText(null) } }}
          />
        )}
        {/* Selection floating toolbar */}
        {showSelToolbar && selectionBounds && (
          <SelectionToolbar
            bounds={selectionBounds}
            onChangeColor={handleSelChangeColor}
            onChangeThickness={handleSelChangeThickness}
            onDelete={handleSelDelete}
            onDuplicate={handleSelDuplicate}
            onFlipH={handleSelFlipH}
            onFlipV={handleSelFlipV}
            onClose={() => { setSelectedIndices(null); setSelectionBounds(null); setShowSelToolbar(false) }}
          />
        )}
        {/* Image context menu */}
        {imageMenu && (
          <div
            className="notebook-image-menu"
            style={{ left: imageMenu.x, top: imageMenu.y }}
            onPointerDown={e => e.stopPropagation()}
          >
            <button onClick={() => handleImageDuplicate(imageMenu.idx)}>
              <Copy size={15} /> Duplicate
            </button>
            <button onClick={() => handleImageBringForward(imageMenu.idx)}>
              <ArrowUpToLine size={15} /> Bring Forward
            </button>
            <button onClick={() => handleImageSendBackward(imageMenu.idx)}>
              <ArrowDownToLine size={15} /> Send Backward
            </button>
            <button onClick={() => handleImageFlip(imageMenu.idx, 'h')}>
              <FlipHorizontal2 size={15} /> Flip Horizontal
            </button>
            <button onClick={() => handleImageFlip(imageMenu.idx, 'v')}>
              <FlipVertical2 size={15} /> Flip Vertical
            </button>
            <div className="menu-divider" />
            <button onClick={() => handleImageLock(imageMenu.idx)}>
              {elementsRef.current[imageMenu.idx]?.locked
                ? <><Unlock size={15} /> Unlock</>
                : <><Lock size={15} /> Lock</>
              }
            </button>
            <div className="menu-divider" />
            <button className="danger" onClick={() => handleImageDelete(imageMenu.idx)}>
              <Trash2 size={15} /> Delete
            </button>
          </div>
        )}
      </div>
      {zoomLevel !== 1 && (
        <div className="notebook-zoom-indicator">{Math.round(zoomLevel * 100)}%</div>
      )}
    </div>
  )
})

export default NotebookCanvas
