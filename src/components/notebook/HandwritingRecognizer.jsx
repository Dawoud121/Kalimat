// v2.9.0
import React, { useRef, useState, useEffect, useCallback } from 'react'
import { X, Eraser, ScanText, Loader2 } from 'lucide-react'
import { recognizeHandwriting } from '../../lib/dataService'

export default function HandwritingRecognizer({ onRecognized, onClose }) {
  const canvasRef = useRef(null)
  const isDrawingRef = useRef(false)
  const [recognizing, setRecognizing] = useState(false)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = 400 * dpr
    c.height = 200 * dpr
    c.style.width = '400px'
    c.style.height = '200px'
    const ctx = c.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, 400, 200)
  }, [])

  const getPos = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }, [])

  const handleDown = useCallback((e) => {
    isDrawingRef.current = true
    const pos = getPos(e)
    const ctx = canvasRef.current.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    canvasRef.current.setPointerCapture(e.pointerId)
  }, [getPos])

  const handleMove = useCallback((e) => {
    if (!isDrawingRef.current) return
    const pos = getPos(e)
    const ctx = canvasRef.current.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }, [getPos])

  const handleUp = useCallback(() => {
    isDrawingRef.current = false
  }, [])

  function clearCanvas() {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, 400, 200)
    setResult('')
    setError('')
  }

  async function handleRecognize() {
    setRecognizing(true)
    setError('')
    try {
      const c = canvasRef.current
      const dataUrl = c.toDataURL('image/png')
      // Strip data:image/png;base64, prefix
      const base64 = dataUrl.split(',')[1]
      const res = await recognizeHandwriting(base64)
      if (res.error) {
        setError(res.error)
      } else {
        setResult(res.text || '')
      }
    } catch (err) {
      setError(err.message || 'Recognition failed')
    }
    setRecognizing(false)
  }

  function handleInsert() {
    if (result.trim()) {
      onRecognized(result.trim())
    }
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 className="modal-title" style={{ margin: 0, fontSize: '1.1rem' }}>Arabic Handwriting Recognition</h2>
          <button className="notebook-tool-btn" onClick={onClose} title="Close"><X size={16} /></button>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
          Write Arabic text below, then press Recognize to convert it to typed text.
        </p>

        <canvas
          ref={canvasRef}
          style={{ border: '1px solid var(--color-border)', borderRadius: 8, cursor: 'crosshair', touchAction: 'none', display: 'block', margin: '0 auto', maxWidth: '100%' }}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={clearCanvas}>
            <Eraser size={14} /> Clear
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleRecognize} disabled={recognizing}>
            {recognizing ? <Loader2 size={14} className="spin" /> : <ScanText size={14} />}
            {recognizing ? ' Recognizing…' : ' Recognize'}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--color-danger-bg, #fef2f2)', color: 'var(--color-danger, #d45656)', borderRadius: 6, fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        {result && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>Recognized text:</div>
            <div style={{ padding: '12px 16px', background: 'var(--color-bg-secondary)', borderRadius: 8, fontFamily: '"Noto Naskh Arabic", serif', fontSize: '1.3rem', direction: 'rtl', textAlign: 'right', lineHeight: 1.8 }}>
              {result}
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleInsert} style={{ marginTop: 12, width: '100%' }}>
              Insert as Text
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
