// v2.8.0
import React, { useRef, useState, useEffect, useCallback } from 'react'
import { Undo2, Trash2 } from 'lucide-react'

export default function Scratchpad({ clearTrigger }) {
  const canvasRef = useRef(null)
  const wrapperRef = useRef(null)
  const strokes = useRef([])
  const currentStroke = useRef([])
  const isDrawing = useRef(false)
  const [strokeCount, setStrokeCount] = useState(0)

  const getCtx = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const ctx = canvas.getContext('2d')
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3 * window.devicePixelRatio
    ctx.strokeStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-text').trim() || '#333'
    return ctx
  }, [])

  const clearCanvas = useCallback(() => {
    strokes.current = []
    currentStroke.current = []
    setStrokeCount(0)
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [])

  // Auto-clear when card changes
  useEffect(() => { clearCanvas() }, [clearTrigger, clearCanvas])

  // Size canvas to match CSS size (handles Retina/HiDPI)
  useEffect(() => {
    const wrapper = wrapperRef.current
    const canvas = canvasRef.current
    if (!wrapper || !canvas) return

    const resize = () => {
      const rect = wrapper.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      redraw()
    }

    const observer = new ResizeObserver(resize)
    observer.observe(wrapper)
    resize()
    return () => observer.disconnect()
  }, [])

  const redraw = useCallback(() => {
    const ctx = getCtx()
    if (!ctx) return
    const canvas = canvasRef.current
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const stroke of strokes.current) {
      if (stroke.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(stroke[0].x, stroke[0].y)
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i].x, stroke[i].y)
      }
      ctx.stroke()
    }
  }, [getCtx])

  const getPos = useCallback((e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    return {
      x: (e.clientX - rect.left) * dpr,
      y: (e.clientY - rect.top) * dpr,
    }
  }, [])

  const handlePointerDown = useCallback((e) => {
    e.preventDefault()
    const canvas = canvasRef.current
    canvas.setPointerCapture(e.pointerId)
    isDrawing.current = true
    const pos = getPos(e)
    currentStroke.current = [pos]
    const ctx = getCtx()
    if (ctx) {
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
    }
  }, [getPos, getCtx])

  const handlePointerMove = useCallback((e) => {
    if (!isDrawing.current) return
    const pos = getPos(e)
    currentStroke.current.push(pos)
    const ctx = getCtx()
    if (ctx) {
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
    }
  }, [getPos, getCtx])

  const handlePointerUp = useCallback((e) => {
    if (!isDrawing.current) return
    isDrawing.current = false
    canvasRef.current?.releasePointerCapture(e.pointerId)
    if (currentStroke.current.length > 0) {
      strokes.current.push([...currentStroke.current])
      setStrokeCount(strokes.current.length)
    }
    currentStroke.current = []
  }, [])

  const undo = useCallback(() => {
    if (strokes.current.length === 0) return
    strokes.current.pop()
    setStrokeCount(strokes.current.length)
    redraw()
  }, [redraw])

  return (
    <div className="scratchpad-wrapper">
      <div className="scratchpad-toolbar">
        <span className="scratchpad-label">Practice Writing</span>
        <div className="scratchpad-actions">
          <button className="scratchpad-btn" onClick={undo} disabled={strokeCount === 0}>
            <Undo2 size={13} /> Undo
          </button>
          <button className="scratchpad-btn" onClick={clearCanvas} disabled={strokeCount === 0}>
            <Trash2 size={13} /> Clear
          </button>
        </div>
      </div>
      <div ref={wrapperRef} className="scratchpad-canvas-wrapper">
        <canvas
          ref={canvasRef}
          className="scratchpad-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          role="img"
          aria-label="Practice writing area"
        />
      </div>
    </div>
  )
}
