// v2.8.0
import React, { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import NotebookToolbar from './NotebookToolbar'
import { saveNotebookStrokes } from '../../lib/dataService'

const HIGHLIGHTER_OPACITY = 0.3
const LINE_SPACING = 32 // px between ruled lines in canvas space
const PAGE_HEIGHT = 2000 // virtual canvas height in canvas-space px
const LINE_COLOR = '#d0d8e0'
const LINE_COLOR_DARK = '#2a2f36'
const MIN_ZOOM = 0.5
const MAX_ZOOM = 3

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
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y)
    }
    ctx.stroke()
  } else {
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1]
      const p1 = pts[i]
      const pressure = (p0.pressure + p1.pressure) / 2
      ctx.lineWidth = stroke.width * (0.3 + 0.7 * pressure)
      ctx.beginPath()
      ctx.moveTo(p0.x, p0.y)
      if (i < pts.length - 1) {
        const p2 = pts[i + 1]
        const mx = (p1.x + p2.x) / 2
        const my = (p1.y + p2.y) / 2
        ctx.quadraticCurveTo(p1.x, p1.y, mx, my)
      } else {
        ctx.lineTo(p1.x, p1.y)
      }
      ctx.stroke()
    }
  }
  ctx.restore()
}

function hitTestStroke(stroke, x, y, radius) {
  const pts = stroke.points
  if (!pts) return false
  const r = radius + (stroke.width || 4) / 2
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i].x - x
    const dy = pts[i].y - y
    if (dx * dx + dy * dy < r * r) return true
  }
  return false
}

const NotebookCanvas = forwardRef(function NotebookCanvas({ lessonId, initialStrokes }, ref) {
  const staticCanvasRef = useRef(null)
  const activeCanvasRef = useRef(null)
  const linesCanvasRef = useRef(null)
  const wrapperRef = useRef(null)

  const strokesRef = useRef([])
  const undoStackRef = useRef([])
  const redoStackRef = useRef([])
  const currentStrokeRef = useRef(null)
  const isDrawingRef = useRef(false)
  const saveTimerRef = useRef(null)
  const isDirtyRef = useRef(false)

  // Viewport transform: pan + zoom
  const viewRef = useRef({ x: 0, y: 0, zoom: 1 })
  const [zoomLevel, setZoomLevel] = useState(1)

  // Touch gesture tracking
  const gestureRef = useRef({ active: false, startDist: 0, startZoom: 1, startX: 0, startY: 0, startViewX: 0, startViewY: 0, pointerId1: null, pointerId2: null, pointers: new Map() })

  const [tool, setTool] = useState('pen')
  const [color, setColor] = useState('#000000')
  const [thickness, setThickness] = useState(4)
  const [pencilOnly, setPencilOnly] = useState(false)
  const [undoCount, setUndoCount] = useState(0)
  const [redoCount, setRedoCount] = useState(0)
  const [strokeCount, setStrokeCount] = useState(0)

  useImperativeHandle(ref, () => ({
    save: () => saveNow(),
    isDirty: () => isDirtyRef.current,
  }))

  // Init strokes from props
  useEffect(() => {
    const loaded = (initialStrokes || []).map(s => s.stroke_data || s)
    strokesRef.current = loaded
    undoStackRef.current = []
    redoStackRef.current = []
    viewRef.current = { x: 0, y: 0, zoom: 1 }
    setZoomLevel(1)
    setStrokeCount(loaded.length)
    setUndoCount(0)
    setRedoCount(0)
    isDirtyRef.current = false
    redrawAll()
  }, [lessonId, initialStrokes])

  // Setup canvas sizes
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const resize = () => {
      const rect = wrapper.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      ;[staticCanvasRef, activeCanvasRef, linesCanvasRef].forEach(ref => {
        const c = ref.current
        if (!c) return
        c.width = rect.width * dpr
        c.height = rect.height * dpr
        c.style.width = rect.width + 'px'
        c.style.height = rect.height + 'px'
      })
      redrawAll()
    }

    const observer = new ResizeObserver(resize)
    observer.observe(wrapper)
    resize()
    return () => observer.disconnect()
  }, [lessonId])

  // Wheel zoom/scroll
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const handleWheel = (e) => {
      e.preventDefault()
      const v = viewRef.current
      if (e.ctrlKey || e.metaKey) {
        // Pinch-zoom on trackpad
        const rect = wrapper.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        const factor = 1 - e.deltaY * 0.005
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor))
        // Zoom toward cursor
        v.x = mx - (mx - v.x) * (newZoom / v.zoom)
        v.y = my - (my - v.y) * (newZoom / v.zoom)
        v.zoom = newZoom
      } else {
        // Scroll = pan
        v.x -= e.deltaX
        v.y -= e.deltaY
      }
      setZoomLevel(v.zoom)
      redrawAll()
    }
    wrapper.addEventListener('wheel', handleWheel, { passive: false })
    return () => wrapper.removeEventListener('wheel', handleWheel)
  }, [lessonId])

  function getIsDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark'
  }

  function drawLines() {
    const c = linesCanvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const w = c.width / dpr
    const h = c.height / dpr
    const v = viewRef.current

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.scale(dpr, dpr)

    ctx.strokeStyle = getIsDark() ? LINE_COLOR_DARK : LINE_COLOR
    ctx.lineWidth = 0.5

    // Draw horizontal ruled lines across the virtual page
    const startLine = Math.max(0, Math.floor(-v.y / (LINE_SPACING * v.zoom)))
    const endLine = Math.ceil((h - v.y) / (LINE_SPACING * v.zoom))

    for (let i = startLine; i <= endLine && i < PAGE_HEIGHT / LINE_SPACING; i++) {
      const y = v.y + i * LINE_SPACING * v.zoom
      if (y < 0 || y > h) continue
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }
  }

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
    strokesRef.current.forEach(s => drawStroke(ctx, s))
  }

  function redrawAll() {
    drawLines()
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

  function scheduleSave() {
    isDirtyRef.current = true
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveNow(), 2000)
  }

  async function saveNow() {
    if (!isDirtyRef.current || !lessonId) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    isDirtyRef.current = false
    const strokes = strokesRef.current.map((s, i) => ({
      stroke_data: s,
      order_index: i,
    }))
    try {
      await saveNotebookStrokes(lessonId, strokes)
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
    setStrokeCount(strokesRef.current.length)
    setUndoCount(undoStackRef.current.length)
    setRedoCount(redoStackRef.current.length)
  }

  // Convert screen coords to canvas-space coords (accounting for pan+zoom)
  function screenToCanvas(clientX, clientY) {
    const rect = activeCanvasRef.current.getBoundingClientRect()
    const v = viewRef.current
    const sx = clientX - rect.left
    const sy = clientY - rect.top
    return {
      x: (sx - v.x) / v.zoom,
      y: (sy - v.y) / v.zoom,
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

  // ── Touch gesture handling (pan/zoom with fingers) ──

  function handleTouchPointerDown(e) {
    const g = gestureRef.current
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (g.pointers.size === 2) {
      // Start pinch/pan gesture
      const [p1, p2] = [...g.pointers.values()]
      g.active = true
      g.startDist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      g.startZoom = viewRef.current.zoom
      g.startX = (p1.x + p2.x) / 2
      g.startY = (p1.y + p2.y) / 2
      g.startViewX = viewRef.current.x
      g.startViewY = viewRef.current.y
      // Cancel any in-progress drawing
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
      setZoomLevel(newZoom)
      redrawAll()
    }
  }

  function handleTouchPointerUp(e) {
    const g = gestureRef.current
    g.pointers.delete(e.pointerId)
    if (g.pointers.size < 2) {
      g.active = false
    }
  }

  // Single-finger pan (touch only, when not drawing)
  const panRef = useRef({ active: false, startX: 0, startY: 0, startViewX: 0, startViewY: 0 })

  const handlePointerDown = useCallback((e) => {
    // Touch gesture tracking
    if (e.pointerType === 'touch') {
      handleTouchPointerDown(e)

      // Single-finger pan
      if (gestureRef.current.pointers.size === 1) {
        const v = viewRef.current
        panRef.current = { active: true, startX: e.clientX, startY: e.clientY, startViewX: v.x, startViewY: v.y }
        e.preventDefault()
        activeCanvasRef.current?.setPointerCapture(e.pointerId)
        return
      }
      return
    }

    // Pen/mouse drawing
    if (pencilOnly && e.pointerType !== 'pen' && e.pointerType !== 'mouse') return
    e.preventDefault()
    const canvas = activeCanvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(e.pointerId)

    const pos = screenToCanvas(e.clientX, e.clientY)

    if (tool === 'eraser') {
      const removed = []
      strokesRef.current = strokesRef.current.filter(s => {
        if (hitTestStroke(s, pos.x, pos.y, 12 / viewRef.current.zoom)) {
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

    currentStrokeRef.current = {
      tool,
      color,
      width: thickness,
      opacity: tool === 'highlighter' ? HIGHLIGHTER_OPACITY : 1,
      points: [{ x: pos.x, y: pos.y, pressure: e.pressure || 0.5 }],
    }
    isDrawingRef.current = true
  }, [tool, color, thickness, pencilOnly])

  const handlePointerMove = useCallback((e) => {
    // Touch gesture
    if (e.pointerType === 'touch') {
      handleTouchPointerMove(e)

      // Single-finger pan
      if (panRef.current.active && gestureRef.current.pointers.size === 1 && !gestureRef.current.active) {
        e.preventDefault()
        const v = viewRef.current
        v.x = panRef.current.startViewX + (e.clientX - panRef.current.startX)
        v.y = panRef.current.startViewY + (e.clientY - panRef.current.startY)
        redrawAll()
        return
      }
      return
    }

    if (!isDrawingRef.current) return
    e.preventDefault()

    if (tool === 'eraser') {
      const pos = screenToCanvas(e.clientX, e.clientY)
      const removed = []
      strokesRef.current = strokesRef.current.filter(s => {
        if (hitTestStroke(s, pos.x, pos.y, 12 / viewRef.current.zoom)) {
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

    if (!currentStrokeRef.current) return

    const points = getCoalescedCanvasPoints(e)
    currentStrokeRef.current.points.push(...points)

    clearActiveCanvas()
    const ctx = activeCanvasRef.current.getContext('2d')
    applyViewTransform(ctx)
    drawStroke(ctx, currentStrokeRef.current)
  }, [tool])

  const handlePointerUp = useCallback((e) => {
    if (e.pointerType === 'touch') {
      handleTouchPointerUp(e)
      panRef.current.active = false
      return
    }

    if (!isDrawingRef.current) return
    isDrawingRef.current = false

    if (tool === 'eraser' || !currentStrokeRef.current) return

    const stroke = currentStrokeRef.current
    currentStrokeRef.current = null

    if (stroke.points.length < 2) {
      clearActiveCanvas()
      return
    }

    stroke.points = stroke.points.map(p => ({
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      pressure: Math.round(p.pressure * 100) / 100,
    }))

    strokesRef.current.push(stroke)
    undoStackRef.current.push({ type: 'draw', stroke })
    redoStackRef.current = []

    clearActiveCanvas()
    const ctx = staticCanvasRef.current.getContext('2d')
    applyViewTransform(ctx)
    drawStroke(ctx, stroke)

    scheduleSave()
    updateCounts()
  }, [tool])

  const handleUndo = useCallback(() => {
    const action = undoStackRef.current.pop()
    if (!action) return

    if (action.type === 'draw') {
      const idx = strokesRef.current.lastIndexOf(action.stroke)
      if (idx !== -1) strokesRef.current.splice(idx, 1)
      redoStackRef.current.push(action)
    } else if (action.type === 'erase') {
      strokesRef.current.push(...action.strokes)
      redoStackRef.current.push(action)
    } else if (action.type === 'clear') {
      strokesRef.current = action.strokes
      redoStackRef.current.push(action)
    }

    redrawAll()
    scheduleSave()
    updateCounts()
  }, [])

  const handleRedo = useCallback(() => {
    const action = redoStackRef.current.pop()
    if (!action) return

    if (action.type === 'draw') {
      strokesRef.current.push(action.stroke)
      undoStackRef.current.push(action)
    } else if (action.type === 'erase') {
      strokesRef.current = strokesRef.current.filter(s => !action.strokes.includes(s))
      undoStackRef.current.push(action)
    } else if (action.type === 'clear') {
      strokesRef.current = []
      undoStackRef.current.push(action)
    }

    redrawAll()
    scheduleSave()
    updateCounts()
  }, [])

  const handleClear = useCallback(() => {
    if (strokesRef.current.length === 0) return
    if (!confirm('Clear all strokes?')) return
    undoStackRef.current.push({ type: 'clear', strokes: [...strokesRef.current] })
    redoStackRef.current = []
    strokesRef.current = []
    redrawAll()
    scheduleSave()
    updateCounts()
  }, [])

  return (
    <div className="notebook-canvas-area">
      <NotebookToolbar
        tool={tool} onToolChange={setTool}
        color={color} onColorChange={setColor}
        thickness={thickness} onThicknessChange={setThickness}
        pencilOnly={pencilOnly} onPencilOnlyToggle={() => setPencilOnly(p => !p)}
        canUndo={undoCount > 0} canRedo={redoCount > 0}
        onUndo={handleUndo} onRedo={handleRedo}
        onClear={handleClear}
      />
      <div ref={wrapperRef} className="notebook-canvas-wrapper">
        <canvas ref={linesCanvasRef} className="notebook-canvas" />
        <canvas ref={staticCanvasRef} className="notebook-canvas" />
        <canvas
          ref={activeCanvasRef}
          className="notebook-canvas notebook-canvas-active"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>
      {zoomLevel !== 1 && (
        <div className="notebook-zoom-indicator">{Math.round(zoomLevel * 100)}%</div>
      )}
    </div>
  )
})

export default NotebookCanvas
