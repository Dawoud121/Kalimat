// v2.9.4
import React, { useState, useEffect, useRef } from 'react'
import { Pen, Highlighter, Eraser, Undo2, Redo2, Trash2, Lasso, Type, ImagePlus, Spline, Download, Sparkles, Languages, BookOpenText, GraduationCap, ScanSearch, MessageCircleQuestion, MousePointer2 } from 'lucide-react'

const AI_MODES = [
  { key: 'transcribe', label: 'Transcribe & Translate', icon: Languages, desc: 'Read and translate your handwriting' },
  { key: 'explain',    label: 'Explain My Notes',       icon: BookOpenText, desc: 'Reorganize messy notes into study notes' },
  { key: 'feedback',   label: 'Tutor Feedback',         icon: GraduationCap, desc: 'Get corrections and learning tips' },
  { key: 'full',       label: 'Full Analysis',          icon: ScanSearch, desc: 'Transcription + feedback + vocabulary' },
  { key: 'ask',        label: 'Ask About This Note',    icon: MessageCircleQuestion, desc: 'Ask a question about your notes' },
]

const COLORS = [
  { value: '#000000', label: 'Black' },
  { value: '#ffffff', label: 'White' },
  { value: '#1a73e8', label: 'Blue' },
  { value: '#d45656', label: 'Red' },
  { value: '#0fa76e', label: 'Green' },
  { value: '#e68a00', label: 'Orange' },
  { value: '#7c3aed', label: 'Purple' },
]

const THICKNESSES = [
  { value: 2, label: 'Thin' },
  { value: 4, label: 'Medium' },
  { value: 7, label: 'Thick' },
]

export default function NotebookToolbar({
  tool, onToolChange,
  color, onColorChange,
  thickness, onThicknessChange,
  smoothing, onSmoothingToggle,
  eraserSize, onEraserSizeChange,
  textFontSize, onTextFontSizeChange,
  canUndo, canRedo, onUndo, onRedo,
  onClear,
  onExportPNG, onExportPDF,
  onAnalyze, analyzing, hasAnalysis,
}) {
  const [exportOpen, setExportOpen] = useState(false)
  const [aiMenuOpen, setAiMenuOpen] = useState(false)
  const aiMenuRef = useRef(null)

  // Close AI menu on outside click
  useEffect(() => {
    if (!aiMenuOpen) return
    const handler = (e) => {
      if (aiMenuRef.current && !aiMenuRef.current.contains(e.target)) setAiMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [aiMenuOpen])

  return (
    <div className="notebook-toolbar">
      {/* Drawing tools */}
      <div className="notebook-toolbar-group">
        <button
          className={`notebook-tool-btn${tool === 'pen' ? ' active' : ''}`}
          onClick={() => onToolChange('pen')}
          title="Pen"
        >
          <Pen size={16} />
        </button>
        <button
          className={`notebook-tool-btn${tool === 'highlighter' ? ' active' : ''}`}
          onClick={() => onToolChange('highlighter')}
          title="Highlighter"
        >
          <Highlighter size={16} />
        </button>
        <button
          className={`notebook-tool-btn${tool === 'eraser' ? ' active' : ''}`}
          onClick={() => onToolChange('eraser')}
          title="Eraser"
        >
          <Eraser size={16} />
        </button>
      </div>

      <div className="notebook-toolbar-divider" />

      {/* Selection & insert tools */}
      <div className="notebook-toolbar-group">
        <button
          className={`notebook-tool-btn${tool === 'cursor' ? ' active' : ''}`}
          onClick={() => onToolChange('cursor')}
          title="Select / Move"
        >
          <MousePointer2 size={16} />
        </button>
        <button
          className={`notebook-tool-btn${tool === 'lasso' ? ' active' : ''}`}
          onClick={() => onToolChange('lasso')}
          title="Lasso Select"
        >
          <Lasso size={16} />
        </button>
        <button
          className={`notebook-tool-btn${tool === 'text' ? ' active' : ''}`}
          onClick={() => onToolChange('text')}
          title="Text"
        >
          <Type size={16} />
        </button>
        <button
          className={`notebook-tool-btn${tool === 'image' ? ' active' : ''}`}
          onClick={() => onToolChange('image')}
          title="Insert Image"
        >
          <ImagePlus size={16} />
        </button>
      </div>

      {/* Color & thickness (visible for pen/highlighter/text) */}
      {tool !== 'eraser' && tool !== 'lasso' && tool !== 'image' && tool !== 'cursor' && (
        <>
          <div className="notebook-toolbar-divider" />
          <div className="notebook-toolbar-group">
            {COLORS.map(c => (
              <button
                key={c.value}
                className={`notebook-color-swatch${color === c.value ? ' active' : ''}`}
                style={{ '--swatch-color': c.value }}
                onClick={() => onColorChange(c.value)}
                title={c.label}
              />
            ))}
          </div>

          <div className="notebook-toolbar-divider" />
          <div className="notebook-toolbar-group">
            {THICKNESSES.map(t => (
              <button
                key={t.value}
                className={`notebook-thickness-btn${thickness === t.value ? ' active' : ''}`}
                onClick={() => onThicknessChange(t.value)}
                title={t.label}
              >
                <span className="notebook-thickness-dot" style={{ width: t.value + 4, height: t.value + 4 }} />
              </button>
            ))}
          </div>
        </>
      )}

      {/* Eraser size options */}
      {tool === 'eraser' && (
        <>
          <div className="notebook-toolbar-divider" />
          <div className="notebook-toolbar-group">
            {[['small', 'S'], ['medium', 'M'], ['large', 'L']].map(([size, label]) => (
              <button
                key={size}
                className={`notebook-tool-btn${eraserSize === size ? ' active' : ''}`}
                onClick={() => onEraserSizeChange(size)}
                title={`Eraser ${label}`}
                style={{ fontSize: 12, fontWeight: 600, minWidth: 28 }}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
      {/* Text font size */}
      {tool === 'text' && (
        <>
          <div className="notebook-toolbar-divider" />
          <div className="notebook-toolbar-group">
            {[16, 20, 24, 32, 40].map(sz => (
              <button
                key={sz}
                className={`notebook-tool-btn${textFontSize === sz ? ' active' : ''}`}
                onClick={() => onTextFontSizeChange(sz)}
                title={`${sz}px`}
                style={{ fontSize: 11, fontWeight: 600, minWidth: 28 }}
              >
                {sz}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="notebook-toolbar-divider" />
      <div className="notebook-toolbar-group">
        <button className="notebook-tool-btn" onClick={onUndo} disabled={!canUndo} title="Undo">
          <Undo2 size={16} />
        </button>
        <button className="notebook-tool-btn" onClick={onRedo} disabled={!canRedo} title="Redo">
          <Redo2 size={16} />
        </button>
      </div>

      <div className="notebook-toolbar-divider" />
      <div className="notebook-toolbar-group">
        <button
          className={`notebook-tool-btn${smoothing ? ' active' : ''}`}
          onClick={onSmoothingToggle}
          title={smoothing ? 'Smoothing (on)' : 'Smoothing (off)'}
        >
          <Spline size={16} />
        </button>
        <button className="notebook-tool-btn notebook-tool-btn-danger" onClick={onClear} title="Clear all">
          <Trash2 size={16} />
        </button>
      </div>

      <div className="notebook-toolbar-divider" />
      <div className="notebook-toolbar-group" style={{ position: 'relative' }} ref={aiMenuRef}>
        <button
          className={`notebook-tool-btn notebook-analyze-btn${analyzing ? ' analyzing' : ''}${hasAnalysis ? ' has-results' : ''}`}
          onClick={() => {
            if (hasAnalysis && !aiMenuOpen) {
              // If we have results, toggle panel; long-press or second click opens menu
              onAnalyze('toggle')
            } else {
              setAiMenuOpen(!aiMenuOpen)
            }
          }}
          disabled={analyzing}
          title="AI Analysis"
        >
          <Sparkles size={16} />
        </button>
        {aiMenuOpen && (
          <div className="notebook-ai-menu">
            {AI_MODES.map(m => (
              <button
                key={m.key}
                className="notebook-ai-menu-item"
                onClick={() => { setAiMenuOpen(false); onAnalyze(m.key) }}
              >
                <m.icon size={16} />
                <div className="notebook-ai-menu-item-text">
                  <span className="notebook-ai-menu-item-label">{m.label}</span>
                  <span className="notebook-ai-menu-item-desc">{m.desc}</span>
                </div>
              </button>
            ))}
            {hasAnalysis && (
              <>
                <div className="sidebar-divider" style={{ margin: '4px 0' }} />
                <button
                  className="notebook-ai-menu-item"
                  onClick={() => { setAiMenuOpen(false); onAnalyze('toggle') }}
                >
                  <Sparkles size={16} />
                  <div className="notebook-ai-menu-item-text">
                    <span className="notebook-ai-menu-item-label">Show Results</span>
                    <span className="notebook-ai-menu-item-desc">Open the analysis panel</span>
                  </div>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="notebook-toolbar-divider" />
      <div className="notebook-toolbar-group" style={{ position: 'relative' }}>
        <button
          className="notebook-tool-btn"
          onClick={() => setExportOpen(!exportOpen)}
          title="Export"
        >
          <Download size={16} />
        </button>
        {exportOpen && (
          <div className="notebook-menu" style={{ top: '100%', left: 0 }} onClick={() => setExportOpen(false)}>
            <button onClick={onExportPNG}>Export as PNG</button>
            <button onClick={onExportPDF}>Export as PDF</button>
          </div>
        )}
      </div>
    </div>
  )
}
