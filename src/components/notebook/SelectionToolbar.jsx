// v2.9.0
import React, { useMemo } from 'react'
import { Copy, FlipHorizontal2, FlipVertical2, Trash2 } from 'lucide-react'

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

const GAP = 8

export default function SelectionToolbar({
  bounds,
  onChangeColor,
  onChangeThickness,
  onDelete,
  onDuplicate,
  onFlipH,
  onFlipV,
  onClose,
}) {
  const style = useMemo(() => {
    if (!bounds) return { display: 'none' }

    const centerX = bounds.x + bounds.width / 2
    const aboveY = bounds.y - GAP
    const belowY = bounds.y + bounds.height + GAP

    // Position above by default; if too close to top, position below
    const placeBelow = aboveY < 50

    return {
      position: 'absolute',
      left: centerX,
      top: placeBelow ? belowY : aboveY,
      transform: placeBelow ? 'translateX(-50%)' : 'translate(-50%, -100%)',
      zIndex: 1000,
    }
  }, [bounds])

  if (!bounds) return null

  return (
    <div className="notebook-selection-toolbar" style={style}>
      <div className="notebook-toolbar-group">
        {COLORS.map(c => (
          <button
            key={c.value}
            className="notebook-color-swatch"
            style={{ '--swatch-color': c.value }}
            onClick={() => onChangeColor(c.value)}
            title={c.label}
          />
        ))}
      </div>

      <div className="notebook-toolbar-divider" />

      <div className="notebook-toolbar-group">
        {THICKNESSES.map(t => (
          <button
            key={t.value}
            className="notebook-thickness-btn"
            onClick={() => onChangeThickness(t.value)}
            title={t.label}
          >
            <span className="notebook-thickness-dot" style={{ width: t.value + 4, height: t.value + 4 }} />
          </button>
        ))}
      </div>

      <div className="notebook-toolbar-divider" />

      <div className="notebook-toolbar-group">
        <button className="notebook-tool-btn" onClick={onDuplicate} title="Duplicate">
          <Copy size={16} />
        </button>
        <button className="notebook-tool-btn" onClick={onFlipH} title="Flip Horizontal">
          <FlipHorizontal2 size={16} />
        </button>
        <button className="notebook-tool-btn" onClick={onFlipV} title="Flip Vertical">
          <FlipVertical2 size={16} />
        </button>
        <button className="notebook-tool-btn notebook-tool-btn-danger" onClick={onDelete} title="Delete">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}
