// v2.9.0
import React, { useState } from 'react'
import { Pen, Highlighter, Eraser, Undo2, Redo2, Trash2, Lasso, Type, ImagePlus, Spline, Download, Sparkles } from 'lucide-react'

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
  canUndo, canRedo, onUndo, onRedo,
  onClear,
  onExportPNG, onExportPDF,
  onAnalyze, analyzing,
}) {
  const [exportOpen, setExportOpen] = useState(false)

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
      {tool !== 'eraser' && tool !== 'lasso' && tool !== 'image' && (
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
      <div className="notebook-toolbar-group">
        <button
          className={`notebook-tool-btn notebook-analyze-btn${analyzing ? ' analyzing' : ''}`}
          onClick={onAnalyze}
          disabled={analyzing}
          title="Analyze with AI"
        >
          <Sparkles size={16} />
        </button>
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
