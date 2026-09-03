// v2.9.5
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Pen, Highlighter, Eraser, Undo2, Redo2, Trash2, Lasso, Type, ImagePlus, Spline, Download, Sparkles, Languages, BookOpenText, GraduationCap, ScanSearch, MessageCircleQuestion, MousePointer2 } from 'lucide-react'

const AI_MODES = [
  { key: 'transcribe', label: 'Transcribe & Translate', icon: Languages, desc: 'Read and translate your handwriting' },
  { key: 'explain',    label: 'Explain My Notes',       icon: BookOpenText, desc: 'Reorganize messy notes into study notes' },
  { key: 'feedback',   label: 'Tutor Feedback',         icon: GraduationCap, desc: 'Get corrections and learning tips' },
  { key: 'full',       label: 'Full Analysis',          icon: ScanSearch, desc: 'Transcription + feedback + vocabulary' },
  { key: 'ask',        label: 'Ask About This Note',    icon: MessageCircleQuestion, desc: 'Ask a question about your notes' },
]

const DROPDOWN_COLORS = [
  // Row 1
  { value: '#000000', label: 'Black' },
  { value: '#444444', label: 'Dark Gray' },
  { value: '#888888', label: 'Gray' },
  { value: '#cccccc', label: 'Light Gray' },
  { value: '#ffffff', label: 'White' },
  // Row 2
  { value: '#d45656', label: 'Red' },
  { value: '#8b0000', label: 'Dark Red' },
  { value: '#e91e8a', label: 'Pink' },
  { value: '#ff6b9d', label: 'Rose' },
  { value: '#ff6347', label: 'Coral' },
  // Row 3
  { value: '#1a73e8', label: 'Blue' },
  { value: '#1e3a5f', label: 'Navy' },
  { value: '#00bcd4', label: 'Cyan' },
  { value: '#009688', label: 'Teal' },
  { value: '#87ceeb', label: 'Sky' },
  // Row 4
  { value: '#0fa76e', label: 'Green' },
  { value: '#2e7d32', label: 'Dark Green' },
  { value: '#8bc34a', label: 'Lime' },
  { value: '#ffd600', label: 'Yellow' },
  { value: '#e68a00', label: 'Orange' },
  // Row 5
  { value: '#7c3aed', label: 'Purple' },
  { value: '#3f51b5', label: 'Indigo' },
  { value: '#9c82d4', label: 'Lavender' },
  { value: '#795548', label: 'Brown' },
  { value: '#800020', label: 'Maroon' },
]

const DROPDOWN_SIZES = [1, 2, 3, 4, 5, 7, 9, 12]

const QUICK_THICKNESSES = [
  { value: 2, label: 'Thin' },
  { value: 4, label: 'Medium' },
  { value: 7, label: 'Thick' },
]

const DEFAULT_FAV_COLORS = ['#000000', '#1a73e8', '#d45656', '#0fa76e']

function loadFavColors() {
  try {
    const stored = localStorage.getItem('kalimat_fav_colors')
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length === 4) return parsed
    }
  } catch {}
  return [...DEFAULT_FAV_COLORS]
}

function saveFavColors(colors) {
  localStorage.setItem('kalimat_fav_colors', JSON.stringify(colors))
}

/* ── Dropdown component for pen/highlighter settings ── */
function ToolDropdown({ color, onColorChange, thickness, onThicknessChange, editingFavSlot, onFavAssign, onClose }) {
  const dropdownRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div className="notebook-pen-dropdown" ref={dropdownRef}>
      <div className="notebook-pen-dropdown-label">Color</div>
      <div className="notebook-pen-dropdown-colors">
        {DROPDOWN_COLORS.map(c => (
          <button
            key={c.value}
            className={`notebook-pen-dropdown-color${color === c.value ? ' active' : ''}`}
            style={{ background: c.value }}
            onClick={() => {
              if (editingFavSlot !== null) {
                onFavAssign(editingFavSlot, c.value)
              } else {
                onColorChange(c.value)
              }
              onClose()
            }}
            title={c.label}
          />
        ))}
      </div>
      <div className="notebook-pen-dropdown-label">Size</div>
      <div className="notebook-pen-dropdown-sizes">
        {DROPDOWN_SIZES.map(s => (
          <button
            key={s}
            className={`notebook-pen-dropdown-size${thickness === s ? ' active' : ''}`}
            onClick={() => { onThicknessChange(s); onClose() }}
            title={`${s}px`}
          >
            <span className="notebook-thickness-dot" style={{ width: s + 2, height: s + 2 }} />
          </button>
        ))}
      </div>
      {editingFavSlot !== null && (
        <div className="notebook-pen-dropdown-hint">Pick a color to assign to favorite slot {editingFavSlot + 1}</div>
      )}
      {editingFavSlot === null && (
        <div className="notebook-pen-dropdown-hint">Click a favorite slot, then pick a color</div>
      )}
    </div>
  )
}

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
  const [penDropdownOpen, setPenDropdownOpen] = useState(false)
  const [highlighterDropdownOpen, setHighlighterDropdownOpen] = useState(false)
  const [favColors, setFavColors] = useState(loadFavColors)
  const [editingFavSlot, setEditingFavSlot] = useState(null)

  const aiMenuRef = useRef(null)
  const penBtnRef = useRef(null)
  const highlighterBtnRef = useRef(null)

  // Close AI menu on outside click
  useEffect(() => {
    if (!aiMenuOpen) return
    const handler = (e) => {
      if (aiMenuRef.current && !aiMenuRef.current.contains(e.target)) setAiMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [aiMenuOpen])

  // Close dropdowns when tool changes away
  useEffect(() => {
    if (tool !== 'pen') setPenDropdownOpen(false)
    if (tool !== 'highlighter') setHighlighterDropdownOpen(false)
    if (tool !== 'pen' && tool !== 'highlighter') setEditingFavSlot(null)
  }, [tool])

  const handlePenClick = useCallback(() => {
    if (tool === 'pen') {
      setPenDropdownOpen(prev => !prev)
    } else {
      onToolChange('pen')
      setPenDropdownOpen(false)
    }
    setHighlighterDropdownOpen(false)
    setEditingFavSlot(null)
  }, [tool, onToolChange])

  const handleHighlighterClick = useCallback(() => {
    if (tool === 'highlighter') {
      setHighlighterDropdownOpen(prev => !prev)
    } else {
      onToolChange('highlighter')
      setHighlighterDropdownOpen(false)
    }
    setPenDropdownOpen(false)
    setEditingFavSlot(null)
  }, [tool, onToolChange])

  const closePenDropdown = useCallback(() => {
    setPenDropdownOpen(false)
    setEditingFavSlot(null)
  }, [])

  const closeHighlighterDropdown = useCallback(() => {
    setHighlighterDropdownOpen(false)
    setEditingFavSlot(null)
  }, [])

  const handleFavAssign = useCallback((slotIndex, newColor) => {
    setFavColors(prev => {
      const next = [...prev]
      next[slotIndex] = newColor
      saveFavColors(next)
      return next
    })
    setEditingFavSlot(null)
  }, [])

  const handleFavClick = useCallback((index) => {
    if (penDropdownOpen || highlighterDropdownOpen) {
      // Dropdown is open — enter fav editing mode
      setEditingFavSlot(prev => prev === index ? null : index)
    } else {
      // No dropdown — just pick this color
      onColorChange(favColors[index])
    }
  }, [penDropdownOpen, highlighterDropdownOpen, onColorChange, favColors])

  const showColorThickness = tool === 'pen' || tool === 'highlighter'
  const showTextSizes = tool === 'text'

  return (
    <div className="notebook-toolbar">
      {/* Drawing tools */}
      <div className="notebook-toolbar-group">
        <div style={{ position: 'relative' }} ref={penBtnRef}>
          <button
            className={`notebook-tool-btn notebook-tool-btn-with-indicator${tool === 'pen' ? ' active' : ''}`}
            onClick={handlePenClick}
            title="Pen"
          >
            <Pen size={16} />
            <span className="notebook-tool-color-indicator" style={{ background: color }} />
          </button>
          {penDropdownOpen && (
            <ToolDropdown
              color={color}
              onColorChange={onColorChange}
              thickness={thickness}
              onThicknessChange={onThicknessChange}
              editingFavSlot={editingFavSlot}
              onFavAssign={handleFavAssign}
              onClose={closePenDropdown}
            />
          )}
        </div>
        <div style={{ position: 'relative' }} ref={highlighterBtnRef}>
          <button
            className={`notebook-tool-btn notebook-tool-btn-with-indicator${tool === 'highlighter' ? ' active' : ''}`}
            onClick={handleHighlighterClick}
            title="Highlighter"
          >
            <Highlighter size={16} />
            <span className="notebook-tool-color-indicator" style={{ background: color }} />
          </button>
          {highlighterDropdownOpen && (
            <ToolDropdown
              color={color}
              onColorChange={onColorChange}
              thickness={thickness}
              onThicknessChange={onThicknessChange}
              editingFavSlot={editingFavSlot}
              onFavAssign={handleFavAssign}
              onClose={closeHighlighterDropdown}
            />
          )}
        </div>
        <button
          className={`notebook-tool-btn${tool === 'eraser' ? ' active' : ''}`}
          onClick={() => { onToolChange('eraser'); setPenDropdownOpen(false); setHighlighterDropdownOpen(false); setEditingFavSlot(null) }}
          title="Eraser"
        >
          <Eraser size={16} />
        </button>
      </div>

      {/* Favorite colors + quick thickness (for pen/highlighter) */}
      {showColorThickness && (
        <>
          <div className="notebook-toolbar-divider" />
          <div className="notebook-toolbar-group">
            {favColors.map((fc, i) => (
              <button
                key={i}
                className={`notebook-fav-swatch${color === fc ? ' active' : ''}${editingFavSlot === i ? ' editing' : ''}`}
                style={{ background: fc, borderColor: fc === '#ffffff' && color !== fc && editingFavSlot !== i ? 'var(--color-border-medium)' : undefined }}
                onClick={() => handleFavClick(i)}
                title={`Favorite ${i + 1}`}
              />
            ))}
          </div>

          <div className="notebook-toolbar-group" style={{ marginLeft: 2 }}>
            {QUICK_THICKNESSES.map(t => (
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

      {/* Text color swatches + font sizes */}
      {showTextSizes && (
        <>
          <div className="notebook-toolbar-divider" />
          <div className="notebook-toolbar-group">
            {favColors.map((fc, i) => (
              <button
                key={i}
                className={`notebook-fav-swatch${color === fc ? ' active' : ''}`}
                style={{ background: fc, borderColor: fc === '#ffffff' && color !== fc ? 'var(--color-border-medium)' : undefined }}
                onClick={() => onColorChange(fc)}
                title={`Color ${i + 1}`}
              />
            ))}
          </div>
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
