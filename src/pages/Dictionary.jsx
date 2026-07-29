// v2.0.0
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  getUserDecks,
  createWord,
  createSrsCard,
  searchDictionary,
  searchDictionaryByRoot,
  getDictionaryAll,
  getDictionaryCount,
  wordExistsInDeck,
  normalizeDeck,
  submitContribution,
  deleteDictionaryWord,
  deleteDictionaryForm,
  importDictionaryBatch,
} from '../lib/dataService'
import { Search, BookOpen, Check, X, Plus, MessageSquarePlus, Trash2, Pencil, Upload } from 'lucide-react'
import SpeakButton from '../components/SpeakButton'
import ModalPortal from '../components/ModalPortal'

const ADMIN_EMAIL = 'dawoudhussein07@gmail.com'

// ── Arabic keyboard helpers ───────────────────────────────────────────────────
const isArabic   = (text) => /[\u0600-\u06FF]/.test(text)
const HARAKAT_RE = /[\u064B-\u065F\u0610-\u061A]/

const formatArabicInput = (text) => {
  const chars = [...text.replace(/\s+/g, '')]
  const result = []
  for (let i = 0; i < chars.length; i++) {
    result.push(chars[i])
    if (i < chars.length - 1 && !HARAKAT_RE.test(chars[i + 1])) result.push(' ')
  }
  return result.join('')
}

// No-space append — for actual Arabic word inputs
const appendWordLetter = (prev, letter) => {
  if (HARAKAT_RE.test(letter)) {
    const chars = [...prev]
    if (chars.length > 0 && HARAKAT_RE.test(chars[chars.length - 1])) {
      chars[chars.length - 1] = letter
    } else { chars.push(letter) }
    return chars.join('')
  }
  return prev + letter
}
const backspaceWord = (prev) => [...prev].slice(0, -1).join('')

const ARABIC_LETTERS = [
  'ا','أ','إ','آ','ب','ت','ث','ج','ح','خ','د',
  'ذ','ر','ز','س','ش','ص','ض','ط',
  'ظ','ع','غ','ف','ق','ك','ل','م',
  'ن','ه','و','ؤ','ي','ئ','ء',
]

const HARAKAT_KEYS = [
  { label: 'اَ', value: '\u064E', title: 'Fatha (a)' },
  { label: 'اِ', value: '\u0650', title: 'Kasra (i)' },
  { label: 'اُ', value: '\u064F', title: 'Damma (u)' },
  { label: 'اْ', value: '\u0652', title: 'Sukun' },
  { label: 'اّ', value: '\u0651', title: 'Shadda' },
  { label: 'اً', value: '\u064B', title: 'Tanwin Fath (an)' },
  { label: 'اٍ', value: '\u064D', title: 'Tanwin Kasr (in)' },
  { label: 'اٌ', value: '\u064C', title: 'Tanwin Damm (un)' },
]

function ArabicKeyboard({ onLetter, onBackspace }) {
  return (
    <div className="arabic-keyboard">
      {ARABIC_LETTERS.map(l => (
        <button key={l} className="arabic-key"
          onMouseDown={e => { e.preventDefault(); onLetter(l) }}>
          {l}
        </button>
      ))}
      <button className="arabic-key arabic-key-backspace"
        onMouseDown={e => { e.preventDefault(); onBackspace() }}>
        ⌫
      </button>
      <div className="arabic-keyboard-divider" />
      {HARAKAT_KEYS.map(h => (
        <button key={h.value} className="arabic-key arabic-key-harakat" title={h.title}
          onMouseDown={e => { e.preventDefault(); onLetter(h.value) }}>
          {h.label}
        </button>
      ))}
    </div>
  )
}

// ── Expand forms into virtual dictionary entries ─────────────────────────────
const STRIP_DIACRITICS_RE = /[\u064B-\u065F\u0610-\u061A\u0670]/g
const stripDiacriticsSort = (s) => (s || '').replace(STRIP_DIACRITICS_RE, '').replace(/\s/g, '')

// Generate an appropriate English definition for a form entry based on the
// parent definition and the form label. Handles common verb conjugation patterns
// and noun/adjective variants.
function generateFormDefinition(parentDef, formLabel, pos) {
  if (!parentDef || !formLabel) return parentDef || ''
  const label = formLabel.replace(/\s*\([^)]*\)\s*/g, '').trim().toLowerCase()
  const def = parentDef.trim()

  // Extract base verb from "to X" definitions
  const toMatch = def.match(/^to\s+(.+)$/i)
  const baseVerb = toMatch ? toMatch[1].trim() : null

  // Verb forms — only transform "to X" definitions
  if (baseVerb) {
    // Handle multi-word: "to listen" → "listen", "to put on" → "put on"
    // First word is the main verb for conjugation
    const words = baseVerb.split(/\s+/)
    const verb = words[0]
    const rest = words.slice(1).join(' ')
    const suffix = rest ? ' ' + rest : ''

    // Simple English conjugation helpers
    const thirdPerson = (v) => {
      if (v === 'do') return 'does'
      if (v === 'go') return 'goes'
      if (v === 'have') return 'has'
      if (v === 'be') return 'is'
      if (v.endsWith('sh') || v.endsWith('ch') || v.endsWith('ss') || v.endsWith('x') || v.endsWith('zz') || v.endsWith('o')) return v + 'es'
      if (v.endsWith('y') && !/[aeiou]y$/i.test(v)) return v.slice(0, -1) + 'ies'
      return v + 's'
    }
    const gerund = (v) => {
      if (v === 'be') return 'being'
      if (v === 'die') return 'dying'
      if (v === 'lie') return 'lying'
      if (v === 'tie') return 'tying'
      if (v.endsWith('ie')) return v.slice(0, -2) + 'ying'
      if (v.endsWith('ee')) return v + 'ing'
      if (v.endsWith('e') && v.length > 2) return v.slice(0, -1) + 'ing'
      if (/[^aeiou][aeiou][bcdfghlmnprstvwz]$/i.test(v) && v.length <= 4) return v + v.slice(-1) + 'ing'
      return v + 'ing'
    }

    if (label === 'present' || label.startsWith('present')) {
      return `${thirdPerson(verb)}${suffix} / is ${gerund(verb)}${suffix}`
    }
    if (label === 'past' || label.startsWith('past')) {
      return def // "to look" is already correct for past tense base form
    }
    if (label === 'command' || label.startsWith('command')) {
      return `${baseVerb}!`
    }
    if (label === 'masdar') {
      return `${gerund(verb)}${suffix} (verbal noun)`
    }
    if (label === 'active participle') {
      return `one who ${thirdPerson(verb)}${suffix}`
    }
  }

  // Noun/adjective plural
  if (label === 'plural') {
    // Simple pluralization
    if (def.endsWith('y') && !/[aeiou]y$/i.test(def)) return def.slice(0, -1) + 'ies'
    if (def.endsWith('s') || def.endsWith('sh') || def.endsWith('ch') || def.endsWith('x') || def.endsWith('z')) return def + 'es'
    if (def.endsWith('f')) return def.slice(0, -1) + 'ves'
    if (def.endsWith('fe')) return def.slice(0, -2) + 'ves'
    if (def.endsWith('man') && def.length > 3) return def.slice(0, -3) + 'men'
    return def + 's'
  }

  // Feminine / masculine variants
  if (label === 'feminine' || label.startsWith('fem')) return def + ' (f.)'
  if (label === 'masculine' || label.startsWith('masc')) return def + ' (m.)'

  // For all other labels, append the label as context
  return `${def} (${formLabel.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase()})`
}

function expandFormsToEntries(entries) {
  const expanded = []
  for (const entry of entries) {
    expanded.push(entry)
    if (!Array.isArray(entry.forms)) continue
    const baseNorm = stripDiacriticsSort(entry.arabic)
    for (let i = 0; i < entry.forms.length; i++) {
      const form = entry.forms[i]
      if (!form.arabic) continue
      if (stripDiacriticsSort(form.arabic) === baseNorm) continue
      expanded.push({
        _isForm: true,
        _parentEntry: entry,
        _formLabel: form.label || '',
        id: `${entry.id}_form_${i}`,
        arabic: form.arabic,
        definition: generateFormDefinition(entry.definition, form.label, entry.pos),
        root: entry.root,
        pos: entry.pos,
        forms: entry.forms,
      })
    }
  }
  expanded.sort((a, b) => {
    const aN = stripDiacriticsSort(a.arabic)
    const bN = stripDiacriticsSort(b.arabic)
    return aN < bN ? -1 : aN > bN ? 1 : (a._isForm ? 1 : 0) - (b._isForm ? 1 : 0)
  })
  return expanded
}

// ── Add Form modal (submits to contributions) ─────────────────────────────────
const FORM_TYPES = ['verb', 'noun', 'adjective', 'other']
const POS_OPTIONS = [
  '', 'verb', 'noun', 'adjective', 'adverb', 'preposition',
  'particle', 'conjunction', 'pronoun', 'proper noun', 'interjection', 'other',
]

// Extract the English part of a form label: "Past (ماضي)" → "Past"
const shortLabel = (label) => {
  if (!label) return ''
  const m = label.match(/^([^(]+)/)
  return m ? m[1].trim() : label
}

// Badge colours for parts of speech shown on the book pages
const POS_PAGE_STYLES = {
  verb:        { bg: '#fff3e0', color: '#e65100', border: '#ffcc80' },
  noun:        { bg: '#e3f2fd', color: '#1565c0', border: '#90caf9' },
  adjective:   { bg: '#e8f5e9', color: '#2e7d32', border: '#a5d6a7' },
  adverb:      { bg: '#fce4ec', color: '#c62828', border: '#f48fb1' },
  preposition: { bg: '#f3e5f5', color: '#6a1b9a', border: '#ce93d8' },
  particle:    { bg: '#e0f7fa', color: '#006064', border: '#80deea' },
  pronoun:     { bg: '#fff8e1', color: '#f57f17', border: '#ffe082' },
  other:       { bg: '#f5f5f5', color: '#616161', border: '#bdbdbd' },
}

function AddFormModal({ entry, currentUser, onClose, onSubmitted, initialType, initialLabel }) {
  const [formType,   setFormType]   = useState(initialType  || 'verb')
  const [formLabel,  setFormLabel]  = useState(initialLabel || '')
  const [formArabic, setFormArabic] = useState('')
  const [saving,     setSaving]     = useState(false)
  const [done,       setDone]       = useState(false)
  const [error,      setError]      = useState('')
  const [showKb,     setShowKb]     = useState(false)
  const formArabicRef = useRef(null)

  const handleKbLetter = (letter) => {
    setFormArabic(prev => appendWordLetter(prev, letter))
    formArabicRef.current?.focus()
  }
  const handleKbBackspace = () => {
    setFormArabic(prev => backspaceWord(prev))
    formArabicRef.current?.focus()
  }

  const handleSubmit = async () => {
    if (!formArabic.trim()) { setError('Arabic form is required.'); return }
    setError('')
    setSaving(true)
    try {
      await submitContribution(currentUser.id, currentUser.username, {
        type:                'add_form',
        arabic:              entry.arabic,
        definition:          entry.definition,
        dictionary_entry_id: entry.id,
        form_type:           formType,
        form_label:          formLabel.trim() || null,
        form_arabic:         formArabic.trim(),
      })
      setDone(true)
      onSubmitted?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalPortal>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Suggest a Form</h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        {done ? (
          <>
            <div style={{ padding: '16px 0', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check size={18} /> Submitted! Your suggestion will appear in Contributions for review.
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: '0.88rem', color: 'var(--color-text-muted)', marginBottom: 16 }}>
              Suggest a new form for{' '}
              <span style={{ fontFamily: 'var(--font-arabic)', fontSize: '1.1rem', direction: 'rtl' }}>{entry.arabic}</span>
              . It will be reviewed by the community before being added.
            </p>

            <div className="form-group">
              <label className="form-label">Form Category</label>
              <select className="form-select" value={formType} onChange={e => setFormType(e.target.value)}>
                {FORM_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Label <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span></label>
              <input type="text" className="form-input" value={formLabel} onChange={e => setFormLabel(e.target.value)}
                placeholder="e.g. Past (3ms), Plural, Feminine…" />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Arabic Form *</label>
                <button className={`btn btn-sm${showKb ? ' btn-primary' : ''}`}
                  onClick={() => setShowKb(k => !k)}
                  style={{ fontFamily: 'var(--font-arabic)', fontSize: '1rem', padding: '2px 10px' }}
                  title="Toggle Arabic keyboard">ع</button>
              </div>
              <input ref={formArabicRef} type="text" className="form-input" value={formArabic}
                onChange={e => setFormArabic(e.target.value)}
                placeholder="e.g. يَكْتُبُ"
                style={{ direction: 'rtl', fontFamily: 'var(--font-arabic)', fontSize: '1.1rem' }} dir="rtl" />
            </div>

            {showKb && (
              <div style={{ marginTop: 12 }}>
                <ArabicKeyboard onLetter={handleKbLetter} onBackspace={handleKbBackspace} />
              </div>
            )}

            {error && <p className="form-error" style={{ marginTop: 8 }}>{error}</p>}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Submit'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
    </ModalPortal>
  )
}

// ── Correct Form modal ────────────────────────────────────────────────────────
function CorrectFormModal({ entry, currentUser, onClose }) {
  const [formLabel,  setFormLabel]  = useState('')
  const [formArabic, setFormArabic] = useState('')
  const [saving,     setSaving]     = useState(false)
  const [done,       setDone]       = useState(false)
  const [error,      setError]      = useState('')
  const [showKb,     setShowKb]     = useState(false)
  const formArabicRef = useRef(null)

  const handleKbLetter   = (l) => { setFormArabic(prev => appendWordLetter(prev, l)); formArabicRef.current?.focus() }
  const handleKbBackspace = () => { setFormArabic(prev => backspaceWord(prev)); formArabicRef.current?.focus() }

  const handleSubmit = async () => {
    if (!formArabic.trim()) { setError('Proposed Arabic is required.'); return }
    setError('')
    setSaving(true)
    try {
      await submitContribution(currentUser.id, currentUser.username, {
        type:                'correct_form',
        arabic:              entry.arabic,
        definition:          entry.definition,
        dictionary_entry_id: entry.id,
        form_label:          formLabel.trim() || null,
        form_arabic:         formArabic.trim(),
      })
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalPortal>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Suggest a Correction</h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        {done ? (
          <>
            <div style={{ padding: '16px 0', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check size={18} /> Submitted! Your correction will appear in Contributions for review.
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: '0.88rem', color: 'var(--color-text-muted)', marginBottom: 16 }}>
              Suggest a correction for a form of{' '}
              <span style={{ fontFamily: 'var(--font-arabic)', fontSize: '1.1rem', direction: 'rtl' }}>{entry.arabic}</span>.
              It will be reviewed by the community before being applied.
            </p>

            <div className="form-group">
              <label className="form-label">Which form? <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span></label>
              <input type="text" className="form-input" value={formLabel} onChange={e => setFormLabel(e.target.value)}
                placeholder="e.g. Past (3ms), Plural, Feminine singular…" />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Correct Arabic *</label>
                <button className={`btn btn-sm${showKb ? ' btn-primary' : ''}`}
                  onClick={() => setShowKb(k => !k)}
                  style={{ fontFamily: 'var(--font-arabic)', fontSize: '1rem', padding: '2px 10px' }}>ع</button>
              </div>
              <input ref={formArabicRef} type="text" className="form-input" value={formArabic}
                onChange={e => setFormArabic(e.target.value)}
                placeholder="e.g. يَكْتُبُ"
                style={{ direction: 'rtl', fontFamily: 'var(--font-arabic)', fontSize: '1.1rem' }} dir="rtl" />
            </div>

            {showKb && (
              <div style={{ marginTop: 12 }}>
                <ArabicKeyboard onLetter={handleKbLetter} onBackspace={handleKbBackspace} />
              </div>
            )}

            {error && <p className="form-error" style={{ marginTop: 8 }}>{error}</p>}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Submit'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
    </ModalPortal>
  )
}

// ── Request Word modal ─────────────────────────────────────────────────────────
function RequestWordModal({ prefill, currentUser, onClose }) {
  const [arabic,      setArabic]      = useState(prefill || '')
  const [def,         setDef]         = useState('')
  const [root,        setRoot]        = useState('')
  const [pos,         setPos]         = useState('')
  const [saving,      setSaving]      = useState(false)
  const [done,        setDone]        = useState(false)
  const [error,       setError]       = useState('')
  const [showKb,      setShowKb]      = useState(false)
  const [activeField, setActiveField] = useState('arabic')
  const arabicRef = useRef(null)
  const rootRef   = useRef(null)

  const handleKbLetter = (letter) => {
    if (activeField === 'root') {
      setRoot(prev => {
        if (HARAKAT_RE.test(letter)) {
          const bare = prev.replace(/\s+/g, '')
          const chars = [...bare]
          if (chars.length > 0 && HARAKAT_RE.test(chars[chars.length - 1])) {
            chars[chars.length - 1] = letter
          } else { chars.push(letter) }
          return formatArabicInput(chars.join(''))
        }
        return formatArabicInput(prev + letter)
      })
      rootRef.current?.focus()
    } else {
      setArabic(prev => appendWordLetter(prev, letter))
      arabicRef.current?.focus()
    }
  }
  const handleKbBackspace = () => {
    if (activeField === 'root') {
      setRoot(prev => {
        const bare = prev.replace(/\s+/g, '')
        const trimmed = [...bare].slice(0, -1).join('')
        return trimmed ? formatArabicInput(trimmed) : ''
      })
      rootRef.current?.focus()
    } else {
      setArabic(prev => backspaceWord(prev))
      arabicRef.current?.focus()
    }
  }

  const handleSubmit = async () => {
    if (!arabic.trim()) { setError('Arabic word is required.'); return }
    if (!def.trim())    { setError('Definition is required.'); return }
    setError('')
    setSaving(true)
    try {
      await submitContribution(currentUser.id, currentUser.username, {
        type:       'new_word',
        arabic:     arabic.trim(),
        definition: def.trim(),
        root:       root.trim() || null,
        pos:        pos || null,
      })
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalPortal>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Request a Word</h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        {done ? (
          <>
            <div style={{ padding: '16px 0', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check size={18} /> Submitted! Your request will appear in Contributions for community review.
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: '0.88rem', color: 'var(--color-text-muted)', marginBottom: 16 }}>
              Can't find a word in the dictionary? Request it here and the community can vote it in.
            </p>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Arabic Word *</label>
                <button className={`btn btn-sm${showKb ? ' btn-primary' : ''}`}
                  onClick={() => setShowKb(k => !k)}
                  style={{ fontFamily: 'var(--font-arabic)', fontSize: '1rem', padding: '2px 10px' }}
                  title="Toggle Arabic keyboard">ع</button>
              </div>
              <input ref={arabicRef} type="text" className="form-input" value={arabic}
                onChange={e => setArabic(e.target.value)} onFocus={() => setActiveField('arabic')}
                placeholder="e.g. كَتَبَ"
                style={{ direction: 'rtl', fontFamily: 'var(--font-arabic)', fontSize: '1.1rem' }} dir="rtl" />
            </div>

            <div className="form-group">
              <label className="form-label">Definition *</label>
              <input type="text" className="form-input" value={def} onChange={e => setDef(e.target.value)} placeholder="e.g. to write" />
            </div>

            <div className="form-group">
              <label className="form-label">Root <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span></label>
              <input ref={rootRef} type="text" className="form-input" value={root}
                onChange={e => setRoot(e.target.value)} onFocus={() => setActiveField('root')}
                placeholder="e.g. ك ت ب"
                style={{ direction: 'rtl', fontFamily: 'var(--font-arabic)' }} dir="rtl" />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Part of Speech <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span></label>
              <select className="form-select" value={pos} onChange={e => setPos(e.target.value)}>
                {POS_OPTIONS.map(o => (
                  <option key={o} value={o}>{o === '' ? '— select —' : o.charAt(0).toUpperCase() + o.slice(1)}</option>
                ))}
              </select>
            </div>

            {showKb && (
              <div style={{ marginTop: 12 }}>
                <ArabicKeyboard onLetter={handleKbLetter} onBackspace={handleKbBackspace} />
              </div>
            )}

            {error && <p className="form-error" style={{ marginTop: 8 }}>{error}</p>}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Submit Request'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
    </ModalPortal>
  )
}

// ── Word detail modal ─────────────────────────────────────────────────────────
const VERB_SLOTS = [
  { label: 'Past (ماضي)',     type: 'verb' },
  { label: 'Present (مضارع)', type: 'verb' },
  { label: 'Command (أمر)',   type: 'verb' },
  { label: 'Masdar (مصدر)',   type: 'verb' },
]
const NOUN_SLOTS = [
  { label: 'Singular (مفرد)', type: 'noun' },
  { label: 'Dual (مثنى)',     type: 'noun' },
  { label: 'Plural (جمع)',    type: 'noun' },
]
const ADJ_SLOTS = [
  { label: 'Masculine (مذكر)', type: 'adjective' },
  { label: 'Feminine (مؤنث)',  type: 'adjective' },
  { label: 'Plural (جمع)',     type: 'adjective' },
]

const SLOT_KEYWORDS = {
  'Past (ماضي)':      ['past'],
  'Present (مضارع)':  ['present', 'مضارع'],
  'Command (أمر)':    ['command', 'imperative', 'أمر'],
  'Masdar (مصدر)':    ['masdar', 'مصدر', 'verbal noun'],
  'Singular (مفرد)':  ['singular', 'مفرد'],
  'Dual (مثنى)':      ['dual', 'مثنى'],
  'Plural (جمع)':     ['plural', 'جمع'],
  'Masculine (مذكر)': ['masculine', 'مذكر'],
  'Feminine (مؤنث)':  ['feminine', 'مؤنث'],
}

function matchForm(forms, slot) {
  const keywords = SLOT_KEYWORDS[slot.label] || [slot.label.toLowerCase()]
  return forms.find(f => {
    if (f.type !== slot.type) return false
    const label = (f.label || '').toLowerCase()
    return keywords.some(kw => label.includes(kw))
  })
}

function WordDetailModal({ entry, currentUser, onClose }) {
  const [addFormSlot,     setAddFormSlot]     = useState(null) // { type, label } for pre-filled AddFormModal
  const [showAddForm,     setShowAddForm]     = useState(false)
  const [showCorrectForm, setShowCorrectForm] = useState(false)
  const [localForms,      setLocalForms]      = useState(Array.isArray(entry.forms) ? entry.forms : [])
  const [deleteIdx,       setDeleteIdx]       = useState(null)
  const isAdmin = currentUser?.email === ADMIN_EMAIL

  const pos = (entry.pos || '').toLowerCase()
  const isVerb = pos === 'verb'
  const isNoun = pos === 'noun'
  const isAdj  = pos === 'adjective'
  const slots  = isVerb ? VERB_SLOTS : isNoun ? NOUN_SLOTS : isAdj ? ADJ_SLOTS : null

  const handleDeleteForm = async (idx) => {
    try {
      await deleteDictionaryForm(entry.id, idx)
      setLocalForms(prev => prev.filter((_, i) => i !== idx))
      setDeleteIdx(null)
    } catch (err) {
      alert('Failed to delete form: ' + err.message)
    }
  }

  const indexedForms = localForms.map((f, i) => ({ ...f, _idx: i }))
  // Forms not covered by the standard slots (extra / other type)
  const slottedForms = slots ? slots.map(s => matchForm(indexedForms, s)).filter(Boolean) : []
  const extraForms   = indexedForms.filter(f => !slottedForms.includes(f))

  return (
    <ModalPortal>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <span style={{ fontFamily: 'var(--font-arabic)', fontSize: '1.8rem', direction: 'rtl',
              color: 'var(--color-text)', lineHeight: 1.3 }}>
              {entry.arabic}
            </span>
            <SpeakButton text={entry.arabic} />
          </div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Definition */}
        <div className="form-group">
          <label className="form-label">Definition</label>
          <div style={{ padding: '8px 12px', background: 'var(--color-surface-elevated)',
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
            fontSize: '0.95rem', color: 'var(--color-text)' }}>
            {entry.definition}
          </div>
        </div>

        {/* Root + POS */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Root</label>
            <div style={{ padding: '8px 12px', background: 'var(--color-surface-elevated)',
              border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
              fontFamily: 'var(--font-arabic)', fontSize: '1.1rem', direction: 'rtl',
              color: entry.root ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
              {entry.root || '—'}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Part of Speech</label>
            <div style={{ padding: '8px 12px', background: 'var(--color-surface-elevated)',
              border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
              fontSize: '0.9rem', color: entry.pos ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
              {entry.pos || '—'}
            </div>
          </div>
        </div>

        {/* Example sentence */}
        {entry.example_sentence && (
          <div className="form-group">
            <label className="form-label">Example Sentence</label>
            <div style={{ padding: '10px 14px', background: 'var(--color-surface-elevated)',
              border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
              borderRight: '3px solid var(--color-brand)',
              fontFamily: 'var(--font-arabic)', direction: 'rtl', fontSize: '1.05rem',
              color: 'var(--color-text)', lineHeight: 1.8 }}>
              {entry.example_sentence}
            </div>
          </div>
        )}

        {/* Slot-based forms (verb / noun / adjective) */}
        {slots && (
          <div className="form-group">
            <label className="form-label">
              {isVerb ? 'Verb Forms' : isNoun ? 'Noun Forms' : 'Adjective Forms'}
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: isVerb ? '1fr 1fr' : '1fr 1fr 1fr', gap: 10 }}>
              {slots.map((slot) => {
                const form = matchForm(indexedForms, slot)
                return (
                  <div key={slot.label} style={{ background: 'var(--color-surface-elevated)',
                    border: `1px solid ${form ? 'var(--color-border)' : 'var(--color-border)'}`,
                    borderRadius: 'var(--radius-md)', padding: '10px 14px', position: 'relative',
                    opacity: form ? 1 : 0.7 }}>
                    <div style={{ fontSize: '0.78rem', marginBottom: 6, color: 'var(--color-text-muted)' }}>
                      {slot.label}
                    </div>
                    {form ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontFamily: 'var(--font-arabic)', fontSize: '1.2rem',
                            direction: 'rtl', color: 'var(--color-text)' }}>
                            {form.arabic}
                          </span>
                          <SpeakButton text={form.arabic} />
                        </div>
                        {isAdmin && (
                          deleteIdx === form._idx ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 4 }}>
                              <span style={{ fontSize: '0.7rem', color: 'var(--color-danger)' }}>Delete?</span>
                              <button className="btn btn-sm btn-danger" style={{ padding: '1px 6px', fontSize: '0.7rem' }}
                                onClick={() => handleDeleteForm(form._idx)}>Yes</button>
                              <button className="btn btn-sm btn-secondary" style={{ padding: '1px 6px', fontSize: '0.7rem' }}
                                onClick={() => setDeleteIdx(null)}>No</button>
                            </span>
                          ) : (
                            <button className="btn btn-sm" title="Delete form"
                              style={{ position: 'absolute', top: 6, right: 6, padding: '1px 4px', color: 'var(--color-danger)', opacity: 0.5 }}
                              onClick={() => setDeleteIdx(form._idx)}>
                              <Trash2 size={11} />
                            </button>
                          )
                        )}
                      </>
                    ) : currentUser ? (
                      <button
                        className="btn btn-sm btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.78rem' }}
                        onClick={() => { setAddFormSlot(slot); setShowAddForm(true) }}
                      >
                        <Plus size={11} /> Add
                      </button>
                    ) : (
                      <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>—</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Extra forms not covered by standard slots */}
        {extraForms.length > 0 && (
          <div className="form-group">
            <label className="form-label">Other Forms</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {extraForms.map((form) => (
                <div key={form._idx} style={{ background: 'var(--color-surface-elevated)',
                  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                  padding: '10px 14px', position: 'relative' }}>
                  {form.label && (
                    <div style={{ fontSize: '0.78rem', marginBottom: 4, color: 'var(--color-text-muted)' }}>
                      {form.label}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontFamily: 'var(--font-arabic)', fontSize: '1.2rem',
                      direction: 'rtl', color: 'var(--color-text)' }}>
                      {form.arabic}
                    </span>
                    <SpeakButton text={form.arabic} />
                  </div>
                  {isAdmin && (
                    deleteIdx === form._idx ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 4 }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-danger)' }}>Delete?</span>
                        <button className="btn btn-sm btn-danger" style={{ padding: '1px 6px', fontSize: '0.7rem' }}
                          onClick={() => handleDeleteForm(form._idx)}>Yes</button>
                        <button className="btn btn-sm btn-secondary" style={{ padding: '1px 6px', fontSize: '0.7rem' }}
                          onClick={() => setDeleteIdx(null)}>No</button>
                      </span>
                    ) : (
                      <button className="btn btn-sm" title="Delete form"
                        style={{ position: 'absolute', top: 6, right: 6, padding: '1px 4px', color: 'var(--color-danger)', opacity: 0.5 }}
                        onClick={() => setDeleteIdx(form._idx)}>
                        <Trash2 size={11} />
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          {currentUser ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={() => { setAddFormSlot(null); setShowAddForm(true) }}>
                <Plus size={13} /> Add Form
              </button>
              <button className="btn btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={() => setShowCorrectForm(true)}>
                <Pencil size={13} /> Suggest Correction
              </button>
            </div>
          ) : <span />}
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>

      {showAddForm && (
        <AddFormModal
          entry={entry}
          currentUser={currentUser}
          initialType={addFormSlot?.type}
          initialLabel={addFormSlot?.label}
          onClose={() => { setShowAddForm(false); setAddFormSlot(null) }}
        />
      )}

      {showCorrectForm && (
        <CorrectFormModal
          entry={entry}
          currentUser={currentUser}
          onClose={() => setShowCorrectForm(false)}
        />
      )}
    </div>
    </ModalPortal>
  )
}

// ── Dictionary page entry (compact card for the open-book layout) ────────────
function DictPageEntry({ entry, decks, deckPick, setDeckPick, addedIds, addingId, addingNow, setAddingId, onAdd, onSelect, isAdmin, deleteConfirm, setDeleteConfirm, onDelete }) {
  const formCount = Array.isArray(entry.forms) ? entry.forms.length : 0
  const posKey = (entry.pos || '').toLowerCase()
  const ps     = POS_PAGE_STYLES[posKey] || POS_PAGE_STYLES.other

  const realId = entry._isForm ? entry._parentEntry.id : entry.id
  const selectTarget = entry._isForm ? entry._parentEntry : entry

  return (
    <div className="dict-page-entry" onClick={() => onSelect(selectTarget)}>

      {/* Header: badges on left, Arabic word + actions on right */}
      <div className="dict-page-entry-header">
        <div className="dict-page-entry-meta">
          {entry.pos && (
            <span className="dict-page-pos-badge" style={{ background: ps.bg, color: ps.color, border: `1px solid ${ps.border}` }}>
              {entry.pos}
            </span>
          )}
          {entry.root && (
            <span className="dict-page-root-badge">{entry.root}</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span className="dict-page-entry-arabic">{entry.arabic}</span>
            {entry._isForm && (
              <span className="dict-form-label">{shortLabel(entry._formLabel)}</span>
            )}
          </div>
          {decks.length > 0 && (
            addedIds.has(realId) ? (
              <span style={{ fontSize: '0.7rem', color: '#2e7d32', fontWeight: 700 }}>✓</span>
            ) : addingId === realId ? (
              <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                <select className="form-select" style={{ fontSize: '0.72rem', padding: '2px 4px', minWidth: 80 }} value={deckPick} onChange={e => setDeckPick(e.target.value)}>
                  {decks.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
                <button className="btn btn-primary btn-sm" onClick={() => onAdd(selectTarget)} disabled={addingNow} style={{ padding: '2px 6px', fontSize: '0.7rem' }}>
                  {addingNow ? <span className="spinner" style={{ width: 10, height: 10 }} /> : '✓'}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setAddingId(null)} style={{ padding: '2px 5px', fontSize: '0.7rem' }}>✕</button>
              </div>
            ) : (
              <button className="btn btn-sm" onClick={() => setAddingId(realId)}
                style={{ fontSize: '0.68rem', padding: '2px 7px', opacity: 0.6 }} title="Add to deck">
                + Deck
              </button>
            )
          )}
          {isAdmin && !entry._isForm && (
            deleteConfirm?.id === entry.id ? (
              <span style={{ display: 'flex', gap: 2 }}>
                <button className="btn btn-sm btn-danger" style={{ padding: '1px 5px', fontSize: '0.65rem' }} onClick={() => onDelete(entry)}>Del</button>
                <button className="btn btn-sm btn-secondary" style={{ padding: '1px 5px', fontSize: '0.65rem' }} onClick={() => setDeleteConfirm(null)}>No</button>
              </span>
            ) : (
              <button className="btn btn-sm" onClick={() => setDeleteConfirm(entry)}
                style={{ padding: '2px 5px', color: 'var(--color-danger)', opacity: 0.45 }} title="Delete">
                <Trash2 size={11} />
              </button>
            )
          )}
        </div>
      </div>

      {/* Definition */}
      <div className="dict-page-definition">{entry.definition}</div>

      {/* Form count or parent reference */}
      {entry._isForm ? (
        <div className="dict-page-forms">
          form of <span className="arabic">{entry._parentEntry.arabic}</span>
        </div>
      ) : formCount > 0 && (
        <div className="dict-page-forms">
          {formCount} {formCount === 1 ? 'form' : 'forms'}
        </div>
      )}

    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Dictionary() {
  const { currentUser } = useAuth()

  const [query,        setQuery]        = useState('')
  const [rootQuery,    setRootQuery]    = useState('')
  const [results,      setResults]      = useState([])
  const [searching,    setSearching]    = useState(false)
  const [activeSearchField, setActiveSearchField] = useState('word') // 'word' | 'root'
  const [dictCount,    setDictCount]    = useState(null)
  const [decks,        setDecks]        = useState([])
  const [deckPick,     setDeckPick]     = useState('')
  const [addingId,     setAddingId]     = useState(null)   // entry.id with open deck picker
  const [addedIds,     setAddedIds]     = useState(new Set())
  const [addingNow,    setAddingNow]    = useState(false)
  const [showKeyboard, setShowKeyboard] = useState(false)
  const [selectedEntry,    setSelectedEntry]    = useState(null)
  const [showRequestWord,  setShowRequestWord]  = useState(false)
  const [deleteConfirm,    setDeleteConfirm]    = useState(null) // entry to delete
  const [importing,        setImporting]        = useState(false)
  const [importResult,     setImportResult]     = useState(null) // { inserted, tagged } | string (error)
  const [importSource,     setImportSource]     = useState('msa')
  const [idleEntries,      setIdleEntries]      = useState([])
  const [dictPage,         setDictPage]         = useState(0)
  const isAdmin = currentUser?.email === ADMIN_EMAIL
  const searchRef     = useRef(null)
  const rootSearchRef = useRef(null)
  const importFileRef = useRef(null)

  // Load decks + dictionary count on mount
  useEffect(() => {
    getDictionaryCount().then(setDictCount).catch(() => {})
    getDictionaryAll().then(setIdleEntries).catch(() => {})
    if (!currentUser) return
    getUserDecks(currentUser.id)
      .then(raw => {
        const normalized = raw.map(normalizeDeck)
        setDecks(normalized)
        if (normalized.length > 0) setDeckPick(normalized[0].id)
      })
      .catch(() => {})
  }, [currentUser])

  // Debounced search — word/English bar
  useEffect(() => {
    if (!query.trim()) { if (!rootQuery.trim()) setResults([]); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const raw = await searchDictionary(query, 1000)
        const q = query.trim()
        if (q.length >= 4) {
          const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const wordRe = new RegExp(`\\b${escaped}\\b`, 'i')
          raw.sort((a, b) => {
            const aExact = wordRe.test(a.definition || '')
            const bExact = wordRe.test(b.definition || '')
            if (aExact === bExact) return 0
            return aExact ? -1 : 1
          })
        }
        setResults(raw)
      } catch (err) {
        console.error(err)
      } finally {
        setSearching(false)
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [query])

  // Debounced search — root bar
  useEffect(() => {
    if (!rootQuery.trim()) { if (!query.trim()) setResults([]); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        setResults(await searchDictionaryByRoot(rootQuery, 200))
      } catch (err) {
        console.error(err)
      } finally {
        setSearching(false)
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [rootQuery])

  // ── Keyboard handlers ────────────────────────────────────────────────────────
  const handleKeyboardLetter = (letter) => {
    if (activeSearchField === 'root') {
      if (HARAKAT_RE.test(letter)) {
        setRootQuery(prev => {
          const bare = prev.replace(/\s+/g, '')
          const chars = [...bare]
          if (chars.length > 0 && HARAKAT_RE.test(chars[chars.length - 1])) chars[chars.length - 1] = letter
          else chars.push(letter)
          return formatArabicInput(chars.join(''))
        })
      } else {
        setRootQuery(prev => formatArabicInput(prev + letter))
      }
      rootSearchRef.current?.focus()
    } else {
      setQuery(prev => appendWordLetter(prev, letter))
      searchRef.current?.focus()
    }
  }

  const handleKeyboardBackspace = () => {
    if (activeSearchField === 'root') {
      setRootQuery(prev => {
        const bare = prev.replace(/\s+/g, '')
        const trimmed = [...bare].slice(0, -1).join('')
        return trimmed ? formatArabicInput(trimmed) : ''
      })
      rootSearchRef.current?.focus()
    } else {
      setQuery(prev => backspaceWord(prev))
      searchRef.current?.focus()
    }
  }

  // Reset to first spread whenever results or idle/search mode changes
  useEffect(() => { setDictPage(0) }, [results])
  useEffect(() => { setDictPage(0) }, [query, rootQuery])

  // ── Delete word (admin only) ─────────────────────────────────────────────────
  const handleDelete = async (entry) => {
    try {
      await deleteDictionaryWord(entry.id)
      setResults(prev => prev.filter(r => r.id !== entry.id))
      setDeleteConfirm(null)
      if (selectedEntry?.id === entry.id) setSelectedEntry(null)
    } catch (err) {
      alert('Failed to delete: ' + err.message)
    }
  }

  // ── Admin: import dictionary batch from JSON file ────────────────────────────
  const handleImportBatch = async (file) => {
    const text = await file.text()
    let data
    try { data = JSON.parse(text) } catch { setImportResult('Invalid JSON file.'); return }
    if (!Array.isArray(data)) { setImportResult('JSON must be an array of entries.'); return }
    setImporting(true)
    setImportResult(null)
    try {
      const result = await importDictionaryBatch(data, importSource)
      setImportResult(result)
      getDictionaryCount().then(setDictCount).catch(() => {})
      setTimeout(() => setImportResult(null), 8000)
    } catch (err) {
      setImportResult('Import failed: ' + err.message)
    } finally {
      setImporting(false)
    }
  }

  // ── Add word to deck ─────────────────────────────────────────────────────────
  const handleAdd = async (entry) => {
    if (!deckPick || !currentUser) return
    setAddingNow(true)
    try {
      const deckId = Number(deckPick)
      const exists = await wordExistsInDeck(currentUser.id, deckId, entry.arabic)
      if (exists) {
        setAddedIds(prev => new Set([...prev, entry.id]))
        setAddingId(null)
        return
      }
      const newWord = await createWord(currentUser.id, {
        deckId,
        arabic:       entry.arabic,
        english:      entry.definition,
        root:         entry.root || '',
        partOfSpeech: entry.pos || '',
      })
      await createSrsCard(currentUser.id, { wordId: newWord.id, deckId })
      setAddedIds(prev => new Set([...prev, entry.id]))
      setAddingId(null)
    } catch (err) {
      alert('Failed to add word: ' + err.message)
    } finally {
      setAddingNow(false)
    }
  }

  // ── Open-book pagination ─────────────────────────────────────────────────────
  const ENTRIES_PER_PAGE   = 4
  const ENTRIES_PER_SPREAD = ENTRIES_PER_PAGE * 2
  const isIdle        = !query.trim() && !rootQuery.trim()
  const expandedIdle    = useMemo(() => expandFormsToEntries(idleEntries), [idleEntries])
  const expandedResults = useMemo(() => expandFormsToEntries(results), [results])
  const displayedEntries = isIdle ? expandedIdle : expandedResults
  const totalSpreads  = Math.max(1, Math.ceil(displayedEntries.length / ENTRIES_PER_SPREAD))
  const spreadStart   = dictPage * ENTRIES_PER_SPREAD
  const leftEntries   = displayedEntries.slice(spreadStart, spreadStart + ENTRIES_PER_PAGE)
  const rightEntries  = displayedEntries.slice(spreadStart + ENTRIES_PER_PAGE, spreadStart + ENTRIES_PER_SPREAD)

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Dictionary</h1>
        <p className="page-subtitle">
          {expandedIdle.length > 0
            ? `Search ${expandedIdle.length.toLocaleString()} Arabic entries`
            : 'Search curated Arabic entries'}
        </p>
      </div>

      {/* Search bar + keyboard toggle + request word */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: showKeyboard ? 12 : 24, flexWrap: 'wrap' }}>
        {/* Word / English search */}
        <div className="search-input-wrapper" style={{ flex: 2, minWidth: 160 }}>
          <span className="search-icon"><Search size={16} /></span>
          <input
            ref={searchRef}
            type="text"
            className="form-input"
            placeholder="Arabic word or English meaning…"
            value={query}
            onFocus={() => setActiveSearchField('word')}
            onChange={e => setQuery(e.target.value)}
            style={{ paddingLeft: 36, paddingRight: query ? 32 : undefined, direction: isArabic(query) ? 'rtl' : 'ltr' }}
            autoFocus
          />
          {query && (
            <button onClick={() => setQuery('')}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)',
                display: 'flex', alignItems: 'center' }}
            ><X size={15} /></button>
          )}
        </div>
        {/* Root search */}
        <div className="search-input-wrapper" style={{ flex: 1, minWidth: 120 }}>
          <span className="search-icon"><Search size={16} /></span>
          <input
            ref={rootSearchRef}
            type="text"
            className="form-input"
            placeholder="Root (ك ت ب)…"
            value={rootQuery}
            onFocus={() => setActiveSearchField('root')}
            onChange={e => {
              const val = e.target.value
              setRootQuery(isArabic(val) ? formatArabicInput(val) : val)
            }}
            style={{ paddingLeft: 36, paddingRight: rootQuery ? 32 : undefined, direction: rootQuery ? 'rtl' : 'ltr', fontFamily: rootQuery ? 'var(--font-arabic)' : 'inherit' }}
          />
          {rootQuery && (
            <button onClick={() => setRootQuery('')}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)',
                display: 'flex', alignItems: 'center' }}
            ><X size={15} /></button>
          )}
        </div>
        <button
          className={`btn btn-sm${showKeyboard ? ' btn-primary' : ''}`}
          onClick={() => setShowKeyboard(k => !k)}
          title="Toggle Arabic keyboard"
          style={{ fontFamily: 'var(--font-arabic)', fontSize: '1.1rem', padding: '6px 14px', flexShrink: 0 }}
        >
          ع
        </button>
        {currentUser && (
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => setShowRequestWord(true)}
            title="Request a word"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}
          >
            <MessageSquarePlus size={14} /> Request
          </button>
        )}
      </div>

      {isAdmin && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 16 }}>
          <select
            className="form-select"
            value={importSource}
            onChange={e => setImportSource(e.target.value)}
            style={{ fontSize: '0.82rem', padding: '5px 8px', width: 130 }}
            title="Source category for imported entries"
          >
            <option value="msa">MSA</option>
            <option value="quran">Quran</option>
            <option value="bayna_yadayk">Bayna Yadayk</option>
          </select>
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => importFileRef.current?.click()}
            disabled={importing}
            title="Import dictionary batch (admin)"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            {importing
              ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Importing…</>
              : <><Upload size={13} /> Import JSON</>}
          </button>
          <input
            type="file"
            accept=".json"
            ref={importFileRef}
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files[0]
              if (file) { await handleImportBatch(file); e.target.value = '' }
            }}
          />
        </div>
      )}

      {showKeyboard && (
        <ArabicKeyboard onLetter={handleKeyboardLetter} onBackspace={handleKeyboardBackspace} />
      )}

{/* Import result feedback (admin) */}
      {importResult && (
        <div style={{
          marginBottom: 16,
          padding: '10px 14px',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.86rem',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          ...(typeof importResult === 'string'
            ? { background: 'var(--color-danger-bg)', color: 'var(--color-danger)', border: '1px solid var(--color-danger)' }
            : { background: 'var(--color-success-bg)', color: 'var(--color-success)', border: '1px solid var(--color-success)' })
        }}>
          {typeof importResult === 'string'
            ? <><X size={14} /> {importResult}</>
            : <><Check size={14} /> Added <strong>{importResult.inserted}</strong> new {importResult.inserted === 1 ? 'entry' : 'entries'}{importResult.tagged > 0 ? <>, tagged <strong>{importResult.tagged}</strong> existing {importResult.tagged === 1 ? 'entry' : 'entries'} as "{importSource}"</> : ''}</>
          }
        </div>
      )}

      {/* Deck creation hint (above book) */}
      {!isIdle && results.length > 0 && decks.length === 0 && (
        <div style={{ marginBottom: 10, padding: '8px 14px', background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
          <Link to="/word-bank" style={{ color: 'var(--color-brand-deep)' }}>Create a deck</Link> in Word Bank to add words to your study list.
        </div>
      )}

      {/* Result count */}
      {!isIdle && !searching && results.length > 0 && (
        <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: 10 }}>
          {results.length} {results.length === 1 ? 'result' : 'results'}
        </div>
      )}

      {/* ── Open Book ─────────────────────────────────────────────────────── */}
      <div className="dict-open-book-wrapper">
        <div className="dict-open-book">

          {/* Left hard cover */}
          <div className="dict-book-cover dict-book-cover-left" />
          {/* Left page-edge stack */}
          <div className="dict-page-edges" />

          {/* ── LEFT PAGE ── */}
          <div className="dict-book-page dict-page-left">
            {(searching || (isIdle && idleEntries.length === 0)) ? (
              <div className="dict-page-idle">
                <span className="spinner" style={{ width: 22, height: 22, borderColor: '#d4b870', borderTopColor: '#8a5a10' }} />
                <span style={{ fontSize: '0.85rem' }}>{searching ? 'Searching…' : 'Loading…'}</span>
              </div>
            ) : !isIdle && results.length === 0 ? (
              <div className="dict-page-idle">
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>No results</div>
                <p style={{ fontSize: '0.8rem', lineHeight: 1.5, margin: 0 }}>Try a different spelling or meaning.</p>
                {currentUser && (
                  <button className="btn btn-sm btn-secondary" style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => setShowRequestWord(true)}>
                    <MessageSquarePlus size={13} /> Request word
                  </button>
                )}
              </div>
            ) : (
              leftEntries.map(entry => (
                <DictPageEntry
                  key={entry.id} entry={entry}
                  decks={decks} deckPick={deckPick} setDeckPick={setDeckPick}
                  addedIds={addedIds} addingId={addingId} addingNow={addingNow} setAddingId={setAddingId}
                  onAdd={handleAdd} onSelect={setSelectedEntry}
                  isAdmin={isAdmin} deleteConfirm={deleteConfirm} setDeleteConfirm={setDeleteConfirm} onDelete={handleDelete}
                />
              ))
            )}
            {displayedEntries.length > 0 && <div className="dict-page-number">{dictPage * 2 + 1}</div>}
          </div>

          {/* Spine */}
          <div className="dict-book-spine-center" />

          {/* ── RIGHT PAGE ── */}
          <div className="dict-book-page dict-page-right">
            {!searching && displayedEntries.length > 0 && (
              rightEntries.length > 0 ? (
                rightEntries.map(entry => (
                  <DictPageEntry
                    key={entry.id} entry={entry}
                    decks={decks} deckPick={deckPick} setDeckPick={setDeckPick}
                    addedIds={addedIds} addingId={addingId} addingNow={addingNow} setAddingId={setAddingId}
                    onAdd={handleAdd} onSelect={setSelectedEntry}
                    isAdmin={isAdmin} deleteConfirm={deleteConfirm} setDeleteConfirm={setDeleteConfirm} onDelete={handleDelete}
                  />
                ))
              ) : (
                <div className="dict-page-idle" style={{ justifyContent: 'flex-start', paddingTop: 48 }}>
                  <div style={{ fontSize: '0.85rem', fontStyle: 'italic', opacity: 0.6 }}>— end of results —</div>
                </div>
              )
            )}
            {displayedEntries.length > 0 && <div className="dict-page-number" style={{ right: 20, left: 'auto' }}>{dictPage * 2 + 2}</div>}
          </div>

          {/* Right page-edge stack */}
          <div className="dict-page-edges" />
          {/* Right hard cover */}
          <div className="dict-book-cover dict-book-cover-right" />
        </div>

        {/* Pagination */}
        {totalSpreads > 1 && (
          <div className="dict-book-nav">
            <button className="btn btn-sm btn-secondary" onClick={() => setDictPage(p => p - 1)} disabled={dictPage === 0}>◁ Prev</button>
            <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>Spread {dictPage + 1} of {totalSpreads}</span>
            <button className="btn btn-sm btn-secondary" onClick={() => setDictPage(p => p + 1)} disabled={dictPage >= totalSpreads - 1}>Next ▷</button>
          </div>
        )}
      </div>

      {selectedEntry && (
        <WordDetailModal
          entry={selectedEntry}
          currentUser={currentUser}
          onClose={() => setSelectedEntry(null)}
        />
      )}

      {showRequestWord && (
        <RequestWordModal
          prefill={query}
          currentUser={currentUser}
          onClose={() => setShowRequestWord(false)}
        />
      )}
    </div>
  )
}
