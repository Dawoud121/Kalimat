// v2.0.6
import React, { useState, useMemo } from 'react'
import { X, Printer } from 'lucide-react'
import ModalPortal from './ModalPortal'
import { getSRSStatus } from '../srs/sm2'

function stripDiacritics(text) {
  return (text || '').replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06EA-\u06ED]/g, '')
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function generatePrintHTML(cards, deck, options) {
  const {
    cardsPerRow,
    corners,
    borderColor,
    bgColor,
    showRootFront,
    showPosFront,
    showRootBack,
    showPosBack,
    customFrontText,
    customBackText,
    stripDiacriticsOpt,
    cutLines,
  } = options

  const borderRadius = corners === 'rounded' ? '10px' : '2px'
  // card height scales with cards per row: fewer per row = taller cards
  const cardHeights = { 2: 72, 3: 58, 4: 46 }
  const cardHeight = cardHeights[cardsPerRow] || 58
  const gap = 4
  // Fixed rows per page per column count — prevents cards splitting across pages
  const rowsPerPage = { 2: 3, 3: 4, 4: 5 }[cardsPerRow] || 3

  // Group cards into rows, padding the last row with nulls so every row is full width
  const rows = []
  for (let i = 0; i < cards.length; i += cardsPerRow) {
    const row = cards.slice(i, i + cardsPerRow)
    while (row.length < cardsPerRow) row.push(null) // invisible placeholder
    rows.push(row)
  }

  // Group rows into pages
  const pages = []
  for (let i = 0; i < rows.length; i += rowsPerPage) {
    pages.push(rows.slice(i, i + rowsPerPage))
  }

  const cardStyle = [
    `flex:1`,
    `border:1.5px solid ${escapeHtml(borderColor)}`,
    `background:${escapeHtml(bgColor)}`,
    `border-radius:${borderRadius}`,
    `padding:5mm 4mm`,
    `display:flex`,
    `flex-direction:column`,
    `align-items:center`,
    `justify-content:center`,
    `min-height:${cardHeight}mm`,
    `text-align:center`,
    `overflow:hidden`,
    cutLines ? `outline:0.5px dashed #ccc;outline-offset:3mm` : '',
  ].filter(Boolean).join(';')

  const rowStyle = `display:flex;gap:${gap}mm;margin-bottom:${gap}mm;page-break-inside:avoid;`

  const placeholderStyle = `flex:1;min-height:${cardHeight}mm;visibility:hidden`

  const frontCard = (card) => {
    if (!card) return `<div style="${placeholderStyle}"></div>`
    const arabic = stripDiacriticsOpt
      ? stripDiacritics(card.arabic || '')
      : (card.arabic || '')
    return `<div style="${cardStyle}">
      <div style="font-family:'Noto Naskh Arabic',serif;font-size:24pt;direction:rtl;line-height:1.4;margin-bottom:2mm">${escapeHtml(arabic)}</div>
      ${showPosFront && card.partOfSpeech ? `<div style="font-size:6.5pt;font-family:monospace;text-transform:uppercase;letter-spacing:0.06em;color:#888;margin-bottom:1.5mm">${escapeHtml(card.partOfSpeech)}</div>` : ''}
      ${showRootFront && card.root ? `<div style="font-family:'Noto Naskh Arabic',serif;font-size:10pt;color:#aaa;direction:rtl">${escapeHtml(card.root)}</div>` : ''}
      ${customFrontText ? `<div style="font-size:7.5pt;color:#bbb;margin-top:2mm;font-style:italic">${escapeHtml(customFrontText)}</div>` : ''}
    </div>`
  }

  const backCard = (card) => {
    if (!card) return `<div style="${placeholderStyle}"></div>`
    return `<div style="${cardStyle}">
      <div style="font-size:14pt;font-weight:600;line-height:1.4;margin-bottom:2mm">${escapeHtml(card.english || '')}</div>
      ${showPosBack && card.partOfSpeech ? `<div style="font-size:6.5pt;font-family:monospace;text-transform:uppercase;letter-spacing:0.06em;color:#888;margin-bottom:1.5mm">${escapeHtml(card.partOfSpeech)}</div>` : ''}
      ${showRootBack && card.root ? `<div style="font-family:'Noto Naskh Arabic',serif;font-size:10pt;color:#aaa;direction:rtl;margin-bottom:1.5mm">${escapeHtml(card.root)}</div>` : ''}
      ${customBackText ? `<div style="font-size:7.5pt;color:#bbb;margin-top:2mm;font-style:italic">${escapeHtml(customBackText)}</div>` : ''}
    </div>`
  }

  const pageBreak = `<div style="page-break-after:always"></div>`
  const labelStyle = `font-size:7pt;color:#bbb;margin-bottom:3mm;font-family:'Inter',sans-serif;letter-spacing:0.04em;text-transform:uppercase`

  // Render each front page, then each back page (backs per page mirrored for long-edge flip)
  const frontPages = pages.map((pageRows, pi) =>
    `<div style="page-break-after:always">
      <div style="${labelStyle}">${escapeHtml(deck.title)} · Front · Page ${pi + 1} of ${pages.length}</div>
      ${pageRows.map(row => `<div style="${rowStyle}">${row.map(frontCard).join('')}</div>`).join('')}
    </div>`
  ).join('')

  const backPages = pages.map((pageRows, pi) =>
    `<div style="${pi < pages.length - 1 ? 'page-break-after:always' : ''}">
      <div style="${labelStyle}">${escapeHtml(deck.title)} · Back · Page ${pi + 1} of ${pages.length}</div>
      ${pageRows.map(row => `<div style="${rowStyle}">${[...row].reverse().map(backCard).join('')}</div>`).join('')}
    </div>`
  ).join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
  <style>
    @page { margin: 10mm; size: A4; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; }
    .print-instructions {
      background: #fffbe6;
      border: 1px solid #f0c040;
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 12mm;
      font-size: 9pt;
      color: #555;
      line-height: 1.5;
    }
    .print-instructions strong { color: #333; }
    .print-btn {
      display: inline-block;
      margin-top: 10px;
      padding: 8px 20px;
      background: #18E299;
      color: #0a0a0a;
      font-weight: 600;
      font-size: 10pt;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }
    .print-btn:hover { background: #0fa76e; }
    @media print { .print-instructions { display: none; } }
  </style>
</head>
<body>
  <div class="print-instructions">
    <strong>Enable two-sided printing:</strong> In the print dialog enable <strong>Two-sided</strong> or <strong>Duplex</strong> and set flip to <strong>Long edge</strong>. The back page is pre-mirrored to align correctly.<br>
    <button class="print-btn" onclick="window.print()">🖨️ Print</button>
  </div>
  ${frontPages}
  ${backPages}
</body>
</html>`
}

export default function PrintFlashcardsModal({ deck, words, srsMap, onClose }) {
  const [options, setOptions] = useState({
    cardsPerRow: 2,
    corners: 'rounded',
    borderColor: '#000000',
    bgColor: '#ffffff',
    showRootFront: false,
    showPosFront: true,
    showRootBack: true,
    showPosBack: true,
    customFrontText: '',
    customBackText: '',
    stripDiacriticsOpt: false,
    cutLines: true,
    filter: 'all',
  })

  const set = (key, val) => setOptions(o => ({ ...o, [key]: val }))

  const filteredCards = useMemo(() => {
    if (options.filter === 'all') return words
    return words.filter(w => {
      const card = srsMap?.[w.id]
      if (!card) return options.filter === 'new'
      return getSRSStatus(card) === options.filter
    })
  }, [words, srsMap, options.filter])

  const handlePrint = () => {
    if (filteredCards.length === 0) return
    const html = generatePrintHTML(filteredCards, deck, options)
    const win = window.open('', '_blank')
    if (!win) { alert('Allow pop-ups for this site to open the print window.'); return }
    win.document.write(html)
    win.document.close()
  }

  const Toggle = ({ label, optKey }) => (
    <div className="btn-group" style={{ flexWrap: 'nowrap' }}>
      <button
        className={`btn btn-sm${options[optKey] ? ' btn-primary' : ''}`}
        onClick={() => set(optKey, true)}
      >{label[0]}</button>
      <button
        className={`btn btn-sm${!options[optKey] ? ' btn-primary' : ''}`}
        onClick={() => set(optKey, false)}
      >{label[1]}</button>
    </div>
  )

  return (
    <ModalPortal>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal print-modal" onClick={e => e.stopPropagation()}>

        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Printer size={18} /> Print — {deck.title}
          </h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="print-modal-body">

          {/* ── LEFT COLUMN ── */}
          <div className="print-options-col">

            <div className="print-section">
              <div className="print-section-title">Layout</div>

              <label className="print-label">Cards per row</label>
              <div className="btn-group">
                {[2, 3, 4].map(n => (
                  <button
                    key={n}
                    className={`btn btn-sm${options.cardsPerRow === n ? ' btn-primary' : ''}`}
                    onClick={() => set('cardsPerRow', n)}
                  >{n}</button>
                ))}
              </div>

              <label className="print-label" style={{ marginTop: 14 }}>Corners</label>
              <div className="btn-group">
                <button className={`btn btn-sm${options.corners === 'rounded' ? ' btn-primary' : ''}`} onClick={() => set('corners', 'rounded')}>Rounded</button>
                <button className={`btn btn-sm${options.corners === 'sharp' ? ' btn-primary' : ''}`} onClick={() => set('corners', 'sharp')}>Sharp</button>
              </div>

              <label className="print-label" style={{ marginTop: 14 }}>Cut lines</label>
              <Toggle label={['On', 'Off']} optKey="cutLines" />
            </div>

            <div className="print-section">
              <div className="print-section-title">Colour</div>
              <div className="print-color-row">
                <span className="print-label">Card background</span>
                <input type="color" value={options.bgColor} onChange={e => set('bgColor', e.target.value)} className="print-color-input" />
              </div>
              <div className="print-color-row" style={{ marginTop: 10 }}>
                <span className="print-label">Border / outline</span>
                <input type="color" value={options.borderColor} onChange={e => set('borderColor', e.target.value)} className="print-color-input" />
              </div>
            </div>

            <div className="print-section">
              <div className="print-section-title">Filter cards</div>
              <select
                className="form-select"
                value={options.filter}
                onChange={e => set('filter', e.target.value)}
              >
                <option value="all">All cards ({words.length})</option>
                <option value="new">New only</option>
                <option value="learning">Learning only</option>
                <option value="review">Review only</option>
                <option value="mastered">Mastered only</option>
              </select>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 6 }}>
                {filteredCards.length} card{filteredCards.length !== 1 ? 's' : ''} will be printed
              </div>
            </div>

          </div>

          {/* ── RIGHT COLUMN ── */}
          <div className="print-options-col">

            <div className="print-section">
              <div className="print-section-title">Front side (Arabic)</div>

              <label className="print-label">Strip diacritics</label>
              <Toggle label={['Yes', 'No']} optKey="stripDiacriticsOpt" />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                <label className="print-checkbox-label">
                  <input type="checkbox" checked={options.showRootFront} onChange={e => set('showRootFront', e.target.checked)} />
                  Show root
                </label>
                <label className="print-checkbox-label">
                  <input type="checkbox" checked={options.showPosFront} onChange={e => set('showPosFront', e.target.checked)} />
                  Show part of speech
                </label>
              </div>

              <label className="print-label" style={{ marginTop: 12 }}>Custom text on every front card</label>
              <input
                className="form-input"
                placeholder="e.g. كليمات ستوديو"
                value={options.customFrontText}
                onChange={e => set('customFrontText', e.target.value)}
              />
            </div>

            <div className="print-section">
              <div className="print-section-title">Back side (English)</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label className="print-checkbox-label">
                  <input type="checkbox" checked={options.showRootBack} onChange={e => set('showRootBack', e.target.checked)} />
                  Show root
                </label>
                <label className="print-checkbox-label">
                  <input type="checkbox" checked={options.showPosBack} onChange={e => set('showPosBack', e.target.checked)} />
                  Show part of speech
                </label>
              </div>

              <label className="print-label" style={{ marginTop: 12 }}>Custom text on every back card</label>
              <input
                className="form-input"
                placeholder="e.g. kalimatstudio.com"
                value={options.customBackText}
                onChange={e => set('customBackText', e.target.value)}
              />
            </div>

            <div className="print-section print-tip">
              <strong>Double-sided printing:</strong> Click Print, then in the browser's print dialog enable <strong>Two-sided</strong> or <strong>Duplex</strong> and set flip to <strong>Long edge</strong>. The back page is pre-mirrored so every card lines up.
            </div>

          </div>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handlePrint}
            disabled={filteredCards.length === 0}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Printer size={14} />
            {filteredCards.length === 0 ? 'No cards match filter' : `Print ${filteredCards.length} card${filteredCards.length !== 1 ? 's' : ''}`}
          </button>
        </div>

      </div>
    </div>
    </ModalPortal>
  )
}
