// v2.8.0
import React from 'react'
import { Pen, Highlighter, Eraser, Undo2, Redo2, PenTool, Trash2 } from 'lucide-react'

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
  pencilOnly, onPencilOnlyToggle,
  canUndo, canRedo, onUndo, onRedo,
  onClear,
}) {
  return (
    <div className="notebook-toolbar">
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

      {tool !== 'eraser' && (
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
          className={`notebook-tool-btn${pencilOnly ? ' active' : ''}`}
          onClick={onPencilOnlyToggle}
          title={pencilOnly ? 'Pencil only (on)' : 'Pencil only (off)'}
        >
          <PenTool size={16} />
        </button>
        <button className="notebook-tool-btn notebook-tool-btn-danger" onClick={onClear} title="Clear all">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}
