// v2.8.0
import React, { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import NotebookToolbar from './NotebookToolbar'
import { saveNotebookStrokes } from '../../lib/dataService'

const HIGHLIGHTER_OPACITY = 0.3

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
    // Pen: variable width based on pressure
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1]
      const p1 = pts[i]
      const pressure = (p0.pressure + p1.pressure) / 2
      ctx.lineWidth = stroke.width * (0.3 + 0.7 * pressure)
      ctx.beginPath()
      ctx.moveTo(p0.x, p0.y)
      // Use quadratic bezier for smoother curves when we have a next point
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
  const wrapperRef = useRef(null)

  const strokesRef = useRef([])
  const undoStackRef = useRef([])
  const redoStackRef = useRef([])
  const currentStrokeRef = useRef(null)
  const isDrawingRef = useRef(false)
  const saveTimerRef = useRef(null)
  const isDirtyRef = useRef(false)

  const [tool, setTool] = useState('pen')
  const [color, setColor] = useState('#000000')
  const [thickness, setThickness] = useState(4)
  const [pencilOnly, setPencilOnly] = useState(false)
  const [undoCount, setUndoCount] = useState(0)
  const [redoCount, setRedoCount] = useState(0)
  const [strokeCount, setStrokeCount] = useState(0)

  // Expose save method to parent
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
    setStrokeCount(loaded.length)
    setUndoCount(0)
    setRedoCount(0)
    isDirtyRef.current = false
    redrawStatic()
  }, [lessonId, initialStrokes])

  // Setup canvas sizes
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const resize = () => {
      const rect = wrapper.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      ;[staticCanvasRef, activeCanvasRef].forEach(ref => {
        const c = ref.current
        if (!c) return
        c.width = rect.width * dpr
        c.height = rect.height * dpr
        c.style.width = rect.width + 'px'
        c.style.height = rect.height + 'px'
        const ctx = c.getContext('2d')
        ctx.scale(dpr, dpr)
      })
      redrawStatic()
    }

    const observer = new ResizeObserver(resize)
    observer.observe(wrapper)
    resize()
    return () => observer.disconnect()
  }, [lessonId])

  function redrawStatic() {
    const c = staticCanvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.scale(dpr, dpr)
    ctx.restore()
    strokesRef.current.forEach(s => drawStroke(ctx, s))
  }

  function clearActiveCanvas() {
    const c = activeCanvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.scale(dpr, dpr)
    ctx.restore()
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

  // Save on unmount + beforeunload
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

  function getCanvasPos(e) {
    const rect = activeCanvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function getCoalescedPoints(e) {
    const rect = activeCanvasRef.current.getBoundingClientRect()
    if (e.getCoalescedEvents) {
      const events = e.getCoalescedEvents()
      if (events.length > 0) {
        return events.map(ce => ({
          x: ce.clientX - rect.left,
          y: ce.clientY - rect.top,
          pressure: ce.pressure || 0.5,
        }))
      }
    }
    return [{
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure || 0.5,
    }]
  }

  const handlePointerDown = useCallback((e) => {
    if (pencilOnly && e.pointerType === 'touch') return
    e.preventDefault()
    const canvas = activeCanvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(e.pointerId)

    const pos = getCanvasPos(e)

    if (tool === 'eraser') {
      // Erase strokes under pointer
      const before = strokesRef.current.length
      const removed = []
      strokesRef.current = strokesRef.current.filter(s => {
        if (hitTestStroke(s, pos.x, pos.y, 12)) {
          removed.push(s)
          return false
        }
        return true
      })
      if (removed.length > 0) {
        undoStackRef.current.push({ type: 'erase', strokes: removed })
        redoStackRef.current = []
        redrawStatic()
        scheduleSave()
        updateCounts()
      }
      isDrawingRef.current = true
      return
    }

    // Start new stroke
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
    if (!isDrawingRef.current) return
    e.preventDefault()

    if (tool === 'eraser') {
      const pos = getCanvasPos(e)
      const removed = []
      strokesRef.current = strokesRef.current.filter(s => {
        if (hitTestStroke(s, pos.x, pos.y, 12)) {
          removed.push(s)
          return false
        }
        return true
      })
      if (removed.length > 0) {
        undoStackRef.current.push({ type: 'erase', strokes: removed })
        redoStackRef.current = []
        redrawStatic()
        scheduleSave()
        updateCounts()
      }
      return
    }

    if (!currentStrokeRef.current) return

    const points = getCoalescedPoints(e)
    currentStrokeRef.current.points.push(...points)

    // Draw current stroke on active canvas
    clearActiveCanvas()
    const ctx = activeCanvasRef.current.getContext('2d')
    drawStroke(ctx, currentStrokeRef.current)
  }, [tool])

  const handlePointerUp = useCallback((e) => {
    if (!isDrawingRef.current) return
    isDrawingRef.current = false

    if (tool === 'eraser' || !currentStrokeRef.current) return

    // Commit stroke
    const stroke = currentStrokeRef.current
    currentStrokeRef.current = null

    // Only save strokes with more than 1 point (ignore accidental taps with no movement)
    if (stroke.points.length < 2) {
      clearActiveCanvas()
      return
    }

    // Round points to 1 decimal to reduce JSON size
    stroke.points = stroke.points.map(p => ({
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      pressure: Math.round(p.pressure * 100) / 100,
    }))

    strokesRef.current.push(stroke)
    undoStackRef.current.push({ type: 'draw', stroke })
    redoStackRef.current = []

    clearActiveCanvas()
    // Draw committed stroke on static canvas
    const ctx = staticCanvasRef.current.getContext('2d')
    drawStroke(ctx, stroke)

    scheduleSave()
    updateCounts()
  }, [tool])

  const handleUndo = useCallback(() => {
    const action = undoStackRef.current.pop()
    if (!action) return

    if (action.type === 'draw') {
      // Remove the last drawn stroke
      const idx = strokesRef.current.lastIndexOf(action.stroke)
      if (idx !== -1) strokesRef.current.splice(idx, 1)
      redoStackRef.current.push(action)
    } else if (action.type === 'erase') {
      // Re-add erased strokes
      strokesRef.current.push(...action.strokes)
      redoStackRef.current.push(action)
    } else if (action.type === 'clear') {
      strokesRef.current = action.strokes
      redoStackRef.current.push(action)
    }

    redrawStatic()
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

    redrawStatic()
    scheduleSave()
    updateCounts()
  }, [])

  const handleClear = useCallback(() => {
    if (strokesRef.current.length === 0) return
    if (!confirm('Clear all strokes?')) return
    undoStackRef.current.push({ type: 'clear', strokes: [...strokesRef.current] })
    redoStackRef.current = []
    strokesRef.current = []
    redrawStatic()
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
    </div>
  )
})

export default NotebookCanvas
