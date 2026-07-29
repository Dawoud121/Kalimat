// v2.7.0
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getSRSStatus } from '../srs/sm2'
import { lookupWord } from '../dictionary/arabicDict'
import { X, Check, Pencil, Trash2, BookOpen, Search, Library, Download, Globe, RotateCcw, FolderOpen, Upload, Copy, MoreHorizontal, Printer, Sparkles, Save, RefreshCw } from 'lucide-react'
import SpeakButton from '../components/SpeakButton'
import PrintFlashcardsModal from '../components/PrintFlashcardsModal'
import ModalPortal from '../components/ModalPortal'

export const WORD_COLORS = [
  '#b85555', // dusty red
  '#c4783c', // terracotta
  '#a08830', // ochre
  '#4a9460', // sage green
  '#3a8888', // dusty teal
  '#3a6ab0', // slate blue
  '#7040b0', // plum
  '#a83c78', // mauve
]
import {
  getUserWords,
  getUserDecks,
  getUserSrsCards,
  wordExistsInDeck,
  createWord,
  updateWord,
  deleteWord,
  deleteWords,
  createDeck,
  updateDeck,
  deleteDeck,
  createSrsCard,
  uploadCommunityDeck,
  unuploadCommunityDeck,
  getDeckWords,
  resetSrsCard,
  resetDeckSrsCards,
  markWordsAsKnown,
  getDeckSrsCards,
  getDownloadCounts,
  normalizeWord,
  normalizeDeck,
  normalizeSrsCard,
  getUserSentences,
  getAllSentencesAdmin,
  getSentencesForWord,
  createSentence,
  updateSentence,
  deleteSentence,
  approveSentence,
  rejectSentence,
  propagateSentence,
  flagSentenceUnknowns,
  searchDictionaryByRoot,
  lookupRootForArabic,
  lookupWordInDictionary,
  batchImportDeck,
} from '../lib/dataService'

// ── Arabic keyboard helpers ───────────────────────────────────────────────────
const isArabic = (text) => /[\u0600-\u06FF]/.test(text)
const HARAKAT_RE = /[\u064B-\u065F\u0610-\u061A]/
const stripDiacritics = (s) => s.replace(/[\u064B-\u065F\u0610-\u061A\u0670]/g, '').trim()

// Auto-space letters; harakat stay glued to preceding letter: "رَحِمَ" → "رَ حِ مَ"
const formatArabicInput = (text) => {
  const chars = [...text.replace(/\s+/g, '')]
  const result = []
  for (let i = 0; i < chars.length; i++) {
    result.push(chars[i])
    if (i < chars.length - 1 && !HARAKAT_RE.test(chars[i + 1])) {
      result.push(' ')
    }
  }
  return result.join('')
}

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
        <button key={l} className="arabic-key" onMouseDown={e => { e.preventDefault(); onLetter(l) }}>
          {l}
        </button>
      ))}
      <button className="arabic-key arabic-key-backspace" onMouseDown={e => { e.preventDefault(); onBackspace() }}>
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

// ── helpers ──────────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  return <span className={`srs-badge ${status}`}>{status}</span>
}

// ── Add/Edit Word Modal ───────────────────────────────────────────────────────
function WordModal({ mode, initial, decks, onSave, onClose, hideDeck = false }) {
  const { currentUser } = useAuth()
  const [form, setForm] = useState({
    arabic:          initial?.arabic          || '',
    english:         initial?.english         || '',
    root:            initial?.root            || '',
    partOfSpeech:    initial?.partOfSpeech    || 'noun',
    deckId:          initial?.deckId          || (decks[0]?.id ?? ''),
    exampleSentence: initial?.exampleSentence || '',
    notes:           initial?.notes           || '',
    past:            initial?.past            || '',
    present:         initial?.present         || '',
    command:         initial?.command         || '',
    masdar:          initial?.masdar          || '',
    singular:        initial?.singular        || '',
    dual:            initial?.dual            || '',
    plural:          initial?.plural          || '',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  // Sentences (edit mode only)
  const [wordSentences, setWordSentences] = useState([])
  const [newSentence, setNewSentence] = useState('')
  const [addingSentence, setAddingSentence] = useState(false)

  useEffect(() => {
    if (mode === 'edit' && initial?.id) {
      getSentencesForWord(initial.id).then(setWordSentences).catch(() => {})
    }
  }, [mode, initial?.id])

  const handleAddSentence = async () => {
    if (!newSentence.trim() || !currentUser || addingSentence) return
    setAddingSentence(true)
    try {
      const row = await createSentence(currentUser.id, {
        arabic:  newSentence.trim(),
        wordId:  initial.id,
        source:  'user',
      })
      setWordSentences(prev => [row, ...prev])
      setNewSentence('')
    } catch { /* non-fatal */ } finally {
      setAddingSentence(false)
    }
  }

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  // Auto-fill from dictionary when Arabic changes
  const handleArabicChange = (e) => {
    const val = e.target.value
    setForm(f => ({ ...f, arabic: val }))
    if (mode === 'add' && val.trim()) {
      const entry = lookupWord(val.trim())
      if (entry) {
        setForm(f => ({
          ...f,
          arabic: val,
          english:      f.english      || entry.english,
          root:         f.root         || entry.root,
          partOfSpeech: f.partOfSpeech || entry.partOfSpeech,
        }))
      }
    }
  }

  const validate = () => {
    const e = {}
    if (!form.arabic.trim())  e.arabic  = 'Arabic word is required.'
    if (!form.english.trim()) e.english = 'English meaning is required.'
    return e
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      await onSave({ ...form, deckId: Number(form.deckId) || null })
      onClose()
    } catch (err) {
      setErrors({ global: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalPortal>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{mode === 'add' ? 'Add New Word' : 'Edit Word'}</h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        {errors.global && <div className="alert alert-danger">{errors.global}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Arabic *</label>
            <input
              type="text"
              className="form-input arabic-input"
              value={form.arabic}
              onChange={handleArabicChange}
              placeholder="أَدْخِلْ كَلِمَةً"
              dir="rtl"
              autoFocus
            />
            {errors.arabic && <p className="form-error">{errors.arabic}</p>}
            <p className="form-hint">Root and meaning will auto-fill if the word is in the dictionary.</p>
          </div>

          <div className="form-group">
            <label className="form-label">English *</label>
            <input
              type="text"
              className="form-input"
              value={form.english}
              onChange={set('english')}
              placeholder="English meaning"
            />
            {errors.english && <p className="form-error">{errors.english}</p>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Root</label>
              <input
                type="text"
                className="form-input arabic-input"
                value={form.root}
                onChange={set('root')}
                placeholder="ج ذ ر"
                dir="rtl"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Part of Speech</label>
              <select className="form-select" value={form.partOfSpeech} onChange={set('partOfSpeech')}>
                <option value="noun">Noun</option>
                <option value="verb">Verb</option>
                <option value="adjective">Adjective</option>
                <option value="adverb">Adverb</option>
                <option value="particle">Particle</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          {!hideDeck && (
            <div className="form-group">
              <label className="form-label">Deck</label>
              <select className="form-select" value={form.deckId} onChange={set('deckId')}>
                {decks.map(d => (
                  <option key={d.id} value={d.id}>{d.title}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Example Sentence</label>
            <textarea
              className="form-textarea arabic-input"
              value={form.exampleSentence}
              onChange={set('exampleSentence')}
              placeholder="مثال…"
              dir="rtl"
              rows={2}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Note / Mnemonic <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <input
              type="text"
              className="form-input"
              value={form.notes}
              onChange={set('notes')}
              placeholder="Personal reminder, memory trick, context…"
            />
            <p className="form-hint">Shown on the back of the flashcard during review.</p>
          </div>

          {(form.partOfSpeech === 'verb') && (
            <div className="form-group">
              <label className="form-label">Verb Forms <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { key: 'past',    label: 'Past (ماضي)',       placeholder: 'كَتَبَ' },
                  { key: 'present', label: 'Present (مضارع)',   placeholder: 'يَكْتُبُ' },
                  { key: 'command', label: 'Command (أمر)',     placeholder: 'اُكْتُبْ' },
                  { key: 'masdar',  label: 'Masdar (مصدر)',     placeholder: 'كِتَابَة' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: 4 }}>{label}</label>
                    <input
                      type="text"
                      className="form-input arabic-input"
                      value={form[key]}
                      onChange={set(key)}
                      placeholder={placeholder}
                      dir="rtl"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {(form.partOfSpeech === 'noun' || form.partOfSpeech === 'adjective') && (
            <div className="form-group">
              <label className="form-label">Noun Forms <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {[
                  { key: 'singular', label: 'Singular (مفرد)', placeholder: 'كِتَاب' },
                  { key: 'dual',     label: 'Dual (مثنى)',     placeholder: 'كِتَابَان' },
                  { key: 'plural',   label: 'Plural (جمع)',    placeholder: 'كُتُب' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: 4 }}>{label}</label>
                    <input
                      type="text"
                      className="form-input arabic-input"
                      value={form[key]}
                      onChange={set(key)}
                      placeholder={placeholder}
                      dir="rtl"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : mode === 'add' ? 'Add Word' : 'Save'}
            </button>
          </div>
        </form>

        {/* ── Sentences section (edit mode only) ── */}
        {mode === 'edit' && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 10 }}>
              Sentences ({wordSentences.length})
            </div>

            {wordSentences.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {wordSentences.map(s => {
                  const statusColor = s.status === 'approved' ? '#065f46' : s.status === 'rejected' ? '#991b1b' : 'var(--color-text-muted)'
                  const statusBg    = s.status === 'approved' ? '#d1fae5'  : s.status === 'rejected' ? '#fee2e2'  : 'var(--color-bg-secondary)'
                  return (
                    <div key={s.id} style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '8px 10px' }}>
                      <div style={{ fontFamily: 'var(--font-arabic)', direction: 'rtl', fontSize: '1.05rem', lineHeight: 1.7 }}>{s.arabic}</div>
                      <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '1px 7px', borderRadius: 99, background: statusBg, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {s.status || 'pending'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Add a new sentence */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <textarea
                className="form-textarea arabic-input"
                value={newSentence}
                onChange={e => setNewSentence(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddSentence() } }}
                placeholder="أَضِفْ جُمْلَةً جَدِيدَةً…"
                dir="rtl"
                rows={2}
                style={{ flex: 1, margin: 0 }}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={handleAddSentence}
                disabled={!newSentence.trim() || addingSentence}
                style={{ flexShrink: 0 }}
              >
                {addingSentence ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Add'}
              </button>
            </div>
            <p className="form-hint" style={{ marginTop: 4 }}>Sentence goes to pending for review.</p>
          </div>
        )}
      </div>
    </div>
    </ModalPortal>
  )
}

// ── Deck Create Modal ─────────────────────────────────────────────────────────
function DeckModal({ onSave, onClose }) {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) { setError('Deck title is required.'); return }
    setSaving(true)
    try {
      await onSave(title.trim(), desc.trim())
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalPortal>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Create New Deck</h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Deck Title *</label>
            <input
              type="text" className="form-input" value={title}
              onChange={e => setTitle(e.target.value)} placeholder="e.g. My Custom Deck" autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-textarea" value={desc} onChange={e => setDesc(e.target.value)} rows={2} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '…' : 'Create Deck'}
            </button>
          </div>
        </form>
      </div>
    </div>
    </ModalPortal>
  )
}

// ── Add Word Inline Form (inside EditDeckModal) ───────────────────────────────
function AddWordInlineForm({ onSave, onCancel }) {
  const [form, setForm] = useState({ arabic: '', english: '', root: '', partOfSpeech: 'noun', exampleSentence: '', notes: '', past: '', present: '', command: '', masdar: '', singular: '', dual: '', plural: '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [showKeyboard, setShowKeyboard] = useState(false)

  // Track which Arabic field is focused so the keyboard knows where to type
  const focusedFieldRef = useRef('arabic')
  const inputRefs = useRef({})

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleArabicChange = (e) => {
    const val = e.target.value
    setField('arabic', val)
    if (val.trim()) {
      const entry = lookupWord(val.trim())
      if (entry) {
        setForm(f => ({
          ...f, arabic: val,
          english:      f.english      || entry.english,
          root:         f.root         || entry.root,
          partOfSpeech: entry.partOfSpeech || f.partOfSpeech,
        }))
      }
    }
  }

  const handleKeyLetter = (letter) => {
    const key = focusedFieldRef.current
    if (HARAKAT_RE.test(letter)) {
      setForm(f => {
        const chars = [...(f[key] || '')]
        if (chars.length > 0 && HARAKAT_RE.test(chars[chars.length - 1])) chars[chars.length - 1] = letter
        else chars.push(letter)
        return { ...f, [key]: chars.join('') }
      })
    } else {
      setForm(f => ({ ...f, [key]: (f[key] || '') + letter }))
    }
    inputRefs.current[key]?.focus()
  }

  const handleKeyBackspace = () => {
    const key = focusedFieldRef.current
    setForm(f => ({ ...f, [key]: [...(f[key] || '')].slice(0, -1).join('') }))
    inputRefs.current[key]?.focus()
  }

  const arabicInputProps = (key) => ({
    ref: el => { inputRefs.current[key] = el },
    onFocus: () => { focusedFieldRef.current = key },
    className: 'form-input arabic-input',
    value: form[key],
    onChange: e => setField(key, e.target.value),
    dir: 'rtl',
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = {}
    if (!form.arabic.trim())  errs.arabic  = 'Required'
    if (!form.english.trim()) errs.english = 'Required'
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      await onSave({
        arabic:          form.arabic.trim(),
        english:         form.english.trim(),
        root:            form.root.trim(),
        partOfSpeech:    form.partOfSpeech,
        exampleSentence: form.exampleSentence.trim(),
        notes:           form.notes.trim(),
        past:            form.past.trim(),
        present:         form.present.trim(),
        command:         form.command.trim(),
        masdar:          form.masdar.trim(),
        singular:        form.singular.trim(),
        dual:            form.dual.trim(),
        plural:          form.plural.trim(),
      })
    } catch (err) {
      setErrors({ global: err.message })
    } finally {
      setSaving(false)
    }
  }

  const isVerb = form.partOfSpeech === 'verb'
  const isNounAdj = form.partOfSpeech === 'noun' || form.partOfSpeech === 'adjective'

  return (
    <form onSubmit={handleSubmit} style={{
      background: 'var(--color-surface-raised)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      padding: 14,
      marginBottom: 12,
    }}>
      {errors.global && <div className="alert alert-danger" style={{ marginBottom: 8 }}>{errors.global}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div>
          <input {...arabicInputProps('arabic')} placeholder="Arabic *" autoFocus
            onChange={handleArabicChange} />
          {errors.arabic && <p className="form-error">{errors.arabic}</p>}
        </div>
        <div>
          <input type="text" className="form-input" placeholder="English *"
            value={form.english} onChange={e => setField('english', e.target.value)} />
          {errors.english && <p className="form-error">{errors.english}</p>}
        </div>
        <input {...arabicInputProps('root')} placeholder="Root (ج ذ ر)" />
        <select className="form-select" value={form.partOfSpeech}
          onChange={e => setField('partOfSpeech', e.target.value)}>
          <option value="noun">Noun</option>
          <option value="verb">Verb</option>
          <option value="adjective">Adjective</option>
          <option value="adverb">Adverb</option>
          <option value="particle">Particle</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div style={{ marginBottom: 8 }}>
        <textarea className="form-textarea arabic-input" placeholder="Example sentence (optional)"
          value={form.exampleSentence} onChange={e => setField('exampleSentence', e.target.value)}
          onFocus={() => { focusedFieldRef.current = 'exampleSentence' }}
          ref={el => { inputRefs.current['exampleSentence'] = el }}
          dir="rtl" rows={2} />
      </div>

      <div style={{ marginBottom: 8 }}>
        <input type="text" className="form-input" placeholder="Note / Mnemonic (optional)"
          value={form.notes} onChange={e => setField('notes', e.target.value)} />
      </div>

      {isVerb && (
        <div style={{ marginBottom: 8 }}>
          <p className="form-label" style={{ marginBottom: 6 }}>Verb Forms <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span></p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { key: 'past',    ph: 'Past (ماضي)' },
              { key: 'present', ph: 'Present (مضارع)' },
              { key: 'command', ph: 'Command (أمر)' },
              { key: 'masdar',  ph: 'Masdar (مصدر)' },
            ].map(({ key, ph }) => (
              <input key={key} {...arabicInputProps(key)} placeholder={ph} />
            ))}
          </div>
        </div>
      )}

      {isNounAdj && (
        <div style={{ marginBottom: 8 }}>
          <p className="form-label" style={{ marginBottom: 6 }}>Noun Forms <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span></p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { key: 'singular', ph: 'Singular (مفرد)' },
              { key: 'dual',     ph: 'Dual (مثنى)' },
              { key: 'plural',   ph: 'Plural (جمع)' },
            ].map(({ key, ph }) => (
              <input key={key} {...arabicInputProps(key)} placeholder={ph} />
            ))}
          </div>
        </div>
      )}

      <button type="button" className="btn btn-secondary btn-sm"
        style={{ marginBottom: showKeyboard ? 8 : 0 }}
        onClick={() => setShowKeyboard(s => !s)}>
        {showKeyboard ? 'Hide Keyboard' : '⌨ Arabic Keyboard'}
      </button>
      {showKeyboard && (
        <ArabicKeyboard onLetter={handleKeyLetter} onBackspace={handleKeyBackspace} />
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
          {saving ? '…' : 'Add Word'}
        </button>
      </div>
    </form>
  )
}

// ── Edit Deck Modal (title + description + full word management) ───────────────
function EditDeckModal({ deck, currentUser, onClose }) {
  const [title,     setTitle]     = useState(deck.title)
  const [desc,      setDesc]      = useState(deck.description || '')
  const [metaError, setMetaError] = useState('')
  const [savingMeta, setSavingMeta] = useState(false)
  const [metaSaved,  setMetaSaved]  = useState(false)

  const [words,       setWords]       = useState(null)
  const [srsMap,      setSrsMap]      = useState({}) // wordId -> srs_card
  const [editingWord, setEditingWord] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [selected,    setSelected]    = useState(new Set())

  const loadWords = useCallback(async () => {
    const [w, cards] = await Promise.all([
      getDeckWords(deck.id),
      getDeckSrsCards(currentUser.id, deck.id),
    ])
    setWords(w.map(normalizeWord))
    const m = {}
    cards.forEach(c => { m[normalizeSrsCard(c).wordId] = normalizeSrsCard(c) })
    setSrsMap(m)
  }, [deck.id, currentUser.id])

  useEffect(() => { loadWords() }, [loadWords])

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (!words) return
    if (selected.size === words.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(words.map(w => w.id)))
    }
  }

  // ── save deck name/description ──
  const handleSaveMeta = async (e) => {
    e.preventDefault()
    if (!title.trim()) { setMetaError('Title is required.'); return }
    setSavingMeta(true)
    setMetaError('')
    try {
      await updateDeck(deck.id, { title: title.trim(), description: desc.trim() })
      setMetaSaved(true)
      setTimeout(() => setMetaSaved(false), 2000)
    } catch (err) {
      setMetaError(err.message)
    } finally {
      setSavingMeta(false)
    }
  }

  // ── word actions ──
  const handleAddWord = async (form) => {
    const newWord = await createWord(currentUser.id, { deckId: deck.id, ...form })
    await createSrsCard(currentUser.id, { wordId: newWord.id, deckId: deck.id })
    setShowAddForm(false)
    await loadWords()
  }

  const handleSaveWord = async (wordId, form) => {
    await updateWord(wordId, form)
    setEditingWord(null)
    await loadWords()
  }

  const handleDeleteWord = async (wordId) => {
    await deleteWord(wordId)
    setSelected(prev => { const n = new Set(prev); n.delete(wordId); return n })
    await loadWords()
  }

  const handleMarkAsKnown = async () => {
    const cardIds = [...selected].map(wordId => srsMap[wordId]?.id).filter(Boolean)
    if (cardIds.length) await markWordsAsKnown(cardIds)
    setSelected(new Set())
    await loadWords()
  }

  const hasSelection = selected.size > 0

  return (<>
    <ModalPortal>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Edit Deck</h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        {/* ── Deck name / description ── */}
        <form onSubmit={handleSaveMeta}>
          {metaError && <div className="alert alert-danger">{metaError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Title *</label>
              <input type="text" className="form-input" value={title}
                onChange={e => setTitle(e.target.value)} autoFocus />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Description</label>
              <input type="text" className="form-input" value={desc}
                onChange={e => setDesc(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={savingMeta}>
              {metaSaved ? <><Check size={13} /> Saved</> : savingMeta ? '…' : 'Save'}
            </button>
          </div>
        </form>

        <div className="divider" />

        {/* ── Words section ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
            Words {words !== null ? `(${words.length})` : ''}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={`btn btn-sm${hasSelection ? ' btn-primary' : ' btn-secondary'}`}
              onClick={handleMarkAsKnown}
              disabled={words === null}
              title={hasSelection ? `Mark ${selected.size} selected word(s) as known` : 'Select words to mark as known'}
            >
              <Check size={13} /> Mark as Known{hasSelection ? ` (${selected.size})` : ''}
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => { setShowAddForm(s => !s); setEditingWord(null) }}
            >
              {showAddForm ? 'Cancel' : '+ Add Word'}
            </button>
          </div>
        </div>

        {showAddForm && (
          <AddWordInlineForm
            onSave={handleAddWord}
            onCancel={() => setShowAddForm(false)}
          />
        )}

        {words === null ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <span className="spinner" />
          </div>
        ) : words.length === 0 ? (
          <div className="empty-state" style={{ padding: '20px 0' }}>
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              No words yet — add your first one above.
            </div>
          </div>
        ) : (
          <div className="table-container" style={{ maxHeight: 340 }}>
            <table>
              <thead>
                <tr>
                  <th className="checkbox-cell">
                    <input type="checkbox"
                      checked={selected.size === words.length && words.length > 0}
                      onChange={toggleSelectAll} />
                  </th>
                  <th>Arabic</th>
                  <th>English</th>
                  <th>Root</th>
                  <th>POS</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {words.map(word => (
                  <tr key={word.id} style={selected.has(word.id) ? { background: 'var(--color-primary-muted)' } : {}}>
                    <td className="checkbox-cell">
                      <input type="checkbox"
                        checked={selected.has(word.id)}
                        onChange={() => toggleSelect(word.id)} />
                    </td>
                    <td className="td-arabic">{word.arabic}</td>
                    <td>{word.english}</td>
                    <td><span className="arabic" style={{ fontSize: '0.9rem' }}>{word.root || '—'}</span></td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>{word.partOfSpeech || '—'}</td>
                    <td>
                      <div className="action-icons">
                        <button className="icon-btn" title="Edit"
                          onClick={() => { setEditingWord(word); setShowAddForm(false) }}><Pencil size={13} /></button>
                        <button className="icon-btn danger" title="Delete"
                          onClick={() => handleDeleteWord(word.id)}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
    </ModalPortal>

    {editingWord && (
      <WordModal
        mode="edit"
        initial={editingWord}
        decks={[]}
        hideDeck={true}
        onSave={(form) => handleSaveWord(editingWord.id, form)}
        onClose={() => setEditingWord(null)}
      />
    )}
  </>
  )
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────
function ConfirmModal({ title, body, confirmLabel = 'Delete', onConfirm, onClose }) {
  return (
    <ModalPortal>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <p style={{ marginBottom: 20, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>{body}</p>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

// ── Review Frequency Modal ────────────────────────────────────────────────────
function ReviewFrequencyModal({ deck, onSave, onClose }) {
  const [frequency,  setFrequency]  = useState(deck.reviewFrequency || '')
  const [customDays, setCustomDays] = useState(deck.reviewIntervalDays || 7)
  const [saving,     setSaving]     = useState(false)

  const OPTIONS = [
    { value: '',        label: 'No schedule', desc: 'Standard SRS — cards appear based on individual intervals' },
    { value: 'daily',   label: 'Daily',       desc: 'All cards reviewed every day' },
    { value: 'weekly',  label: 'Weekly',       desc: 'All cards reviewed every 7 days' },
    { value: 'monthly', label: 'Monthly',      desc: 'All cards reviewed every 30 days' },
    { value: 'custom',  label: 'Custom',       desc: null },
  ]

  const handleSave = async () => {
    setSaving(true)
    try {
      const updates = frequency
        ? { review_frequency: frequency, review_interval_days: frequency === 'custom' ? Number(customDays) : null }
        : { review_frequency: null, review_interval_days: null, next_deck_review: null }
      await onSave(deck.id, updates)
      onClose()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalPortal>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="modal-title">Review Schedule</h2>
            <button className="modal-close" onClick={onClose}><X size={16} /></button>
          </div>
          <p style={{ marginBottom: 16, color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
            Set how often all cards in <strong>{deck.title}</strong> are reviewed as a group. When due, individual SRS intervals are ignored.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
            {OPTIONS.map(opt => (
              <label
                key={opt.value}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                  padding: '10px 12px', borderRadius: 'var(--radius-md)',
                  border: '1px solid',
                  borderColor: frequency === opt.value ? 'var(--color-brand)' : 'var(--color-border)',
                  background: frequency === opt.value ? 'var(--color-brand-muted)' : 'transparent',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <input
                  type="radio" name="freq" value={opt.value}
                  checked={frequency === opt.value}
                  onChange={() => setFrequency(opt.value)}
                  style={{ marginTop: 3, flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.88rem' }}>{opt.label}</div>
                  {opt.desc && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{opt.desc}</div>
                  )}
                  {opt.value === 'custom' && frequency === 'custom' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                      <span style={{ fontSize: '0.83rem' }}>Every</span>
                      <input
                        type="number" min={1} max={365}
                        value={customDays}
                        onChange={e => setCustomDays(Math.max(1, Math.min(365, Number(e.target.value))))}
                        className="form-input" style={{ width: 64 }}
                        onClick={e => e.stopPropagation()}
                      />
                      <span style={{ fontSize: '0.83rem' }}>days</span>
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

// ── Delete Shared Deck Modal ──────────────────────────────────────────────────
function DeleteSharedDeckModal({ deck, wordCount, onDeletePersonalOnly, onDeleteEverywhere, onClose }) {
  const [busy, setBusy] = useState(false)

  const handlePersonalOnly = async () => {
    setBusy(true)
    try { await onDeletePersonalOnly() } finally { setBusy(false) }
  }

  const handleEverywhere = async () => {
    setBusy(true)
    try { await onDeleteEverywhere() } finally { setBusy(false) }
  }

  return (
    <ModalPortal>
    <div className="modal-overlay" onClick={busy ? undefined : onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Delete "{deck.title}"?</h2>
          <button className="modal-close" onClick={onClose} disabled={busy}><X size={16} /></button>
        </div>

        <div className="alert alert-warning" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16 }}>
          <Globe size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>This deck is currently shared in <strong>Community Decks</strong>. Choose what to delete:</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {/* Option 1 */}
          <div style={{
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4, fontSize: '0.9rem' }}>Delete my copy only</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
              Removes this deck from your Word Bank. The community version stays live so others can still import it.
              You can re-import it from Community Decks at any time.
            </div>
          </div>

          {/* Option 2 */}
          <div style={{
            border: '1px solid var(--color-danger)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
            background: 'var(--color-danger-bg)',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4, fontSize: '0.9rem', color: 'var(--color-danger)' }}>Delete everywhere</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
              Removes your copy <em>and</em> takes the deck off Community Decks. Your download count will be saved — if you re-share later, it will be restored.
            </div>
          </div>
        </div>

        <div className="modal-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-secondary" onClick={handlePersonalOnly} disabled={busy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {busy ? <span className="spinner" style={{ width: 13, height: 13 }} /> : null}
            Delete my copy only
          </button>
          <button className="btn btn-danger" onClick={handleEverywhere} disabled={busy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {busy ? <span className="spinner" style={{ width: 13, height: 13 }} /> : null}
            Delete everywhere
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

// ── Inline Edit Row ───────────────────────────────────────────────────────────
function EditableRow({ word, decks, srsCard, onSave, onCancelEdit }) {
  const [form, setForm] = useState({
    arabic:          word.arabic,
    english:         word.english,
    root:            word.root || '',
    partOfSpeech:    word.partOfSpeech || '',
    exampleSentence: word.exampleSentence || '',
    notes:           word.notes || '',
    color:           word.color || null,
  })

  return (
    <>
      <tr style={{ background: 'var(--color-primary-muted)' }}>
        <td className="checkbox-cell" />
        <td className="td-arabic">
          <input className="form-input arabic-input" value={form.arabic}
            onChange={e => setForm(f => ({ ...f, arabic: e.target.value }))}
            style={{ width: 140 }} dir="rtl" />
        </td>
        <td>
          <input className="form-input" value={form.english}
            onChange={e => setForm(f => ({ ...f, english: e.target.value }))}
            style={{ width: 160 }} />
        </td>
        <td>
          <input className="form-input arabic-input" value={form.root}
            onChange={e => setForm(f => ({ ...f, root: e.target.value }))}
            style={{ width: 90 }} dir="rtl" />
        </td>
        <td>
          <select className="form-select" value={form.partOfSpeech}
            onChange={e => setForm(f => ({ ...f, partOfSpeech: e.target.value }))}
            style={{ width: 120 }}>
            <option value="noun">noun</option>
            <option value="verb">verb</option>
            <option value="adjective">adjective</option>
            <option value="adverb">adverb</option>
            <option value="particle">particle</option>
            <option value="other">other</option>
          </select>
        </td>
        <td>{decks.find(d => d.id === word.deckId)?.title || '—'}</td>
        <td>{srsCard ? <StatusBadge status={getSRSStatus(srsCard)} /> : '—'}</td>
        <td>
          <div className="action-icons">
            <button className="icon-btn" title="Save" onClick={() => onSave(form)}><Save size={14} /></button>
            <button className="icon-btn" title="Cancel" onClick={onCancelEdit}><X size={14} /></button>
          </div>
        </td>
      </tr>
      <tr style={{ background: 'var(--color-primary-muted)' }}>
        <td colSpan={8} style={{ paddingTop: 0, paddingBottom: 4 }}>
          <input
            className="form-input"
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Memory hook / mnemonic (optional)…"
            style={{ width: '100%', fontSize: '0.85rem' }}
          />
        </td>
      </tr>
      <tr style={{ background: 'var(--color-primary-muted)' }}>
        <td colSpan={8} style={{ paddingTop: 0, paddingBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>Word colour:</span>
            <div className="color-swatches">
              {WORD_COLORS.map(c => (
                <button
                  key={c}
                  className={`color-swatch${form.color === c ? ' active' : ''}`}
                  style={{ background: c }}
                  onClick={e => { e.preventDefault(); setForm(f => ({ ...f, color: f.color === c ? null : c })) }}
                  title={c}
                />
              ))}
              {form.color && (
                <button
                  className="color-swatch color-swatch-clear"
                  onClick={e => { e.preventDefault(); setForm(f => ({ ...f, color: null })) }}
                  title="Clear colour"
                >×</button>
              )}
            </div>
          </div>
        </td>
      </tr>
    </>
  )
}

// ── Copy Word to Deck Modal ───────────────────────────────────────────────────
function CopyToDecksModal({ word, decks, onCopy, onClose }) {
  const otherDecks = decks.filter(d => d.id !== word.deckId)
  const [targetId, setTargetId] = useState(otherDecks[0]?.id ?? '')
  const [saving, setSaving]     = useState(false)
  const [done, setDone]         = useState(false)
  const [error, setError]       = useState('')

  const handleCopy = async () => {
    if (!targetId) return
    setSaving(true)
    setError('')
    try {
      await onCopy(word, Number(targetId))
      setDone(true)
    } catch (err) {
      setError(err.message || 'Failed to copy word.')
    } finally {
      setSaving(false)
    }
  }

  if (otherDecks.length === 0) {
    return (
      <ModalPortal>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="modal-title">Copy to Deck</h2>
            <button className="modal-close" onClick={onClose}><X size={16} /></button>
          </div>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 20 }}>
            You only have one deck. Create another deck first to copy words between decks.
          </p>
          <div className="modal-actions">
            <button className="btn btn-primary" onClick={onClose}>OK</button>
          </div>
        </div>
      </div>
      </ModalPortal>
    )
  }

  return (
    <ModalPortal>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Copy to Deck</h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--color-surface-elevated)', borderRadius: 'var(--radius)', direction: 'rtl', textAlign: 'right' }}>
          <span style={{ fontFamily: 'var(--font-arabic)', fontSize: '1.2rem' }}>{word.arabic}</span>
          {word.english && <span style={{ direction: 'ltr', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginRight: 8 }}> — {word.english}</span>}
        </div>

        {error && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{error}</div>}

        {done ? (
          <div className="alert alert-success" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Check size={14} /> Copied to "{decks.find(d => d.id === Number(targetId))?.title}"!
          </div>
        ) : (
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">Copy to:</label>
            <select className="form-select" value={targetId} onChange={e => setTargetId(e.target.value)}>
              {otherDecks.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>{done ? 'Close' : 'Cancel'}</button>
          {!done && (
            <button className="btn btn-primary" onClick={handleCopy} disabled={saving || !targetId}>
              {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Copy'}
            </button>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}


// ── Sentences Tab ─────────────────────────────────────────────────────────────
const ADMIN_EMAIL = 'dawoudhussein07@gmail.com'

// ── Sentence Gloss ────────────────────────────────────────────────────────────
// Module-level cache so lookups survive tab switches and component unmounts.
const _glossCache = {}

function SentenceGloss({ arabic, words }) {
  // Only used to trigger re-render when an async lookup completes.
  const [tick, setTick] = useState(0)

  const tokens = useMemo(() =>
    arabic.trim().split(/\s+/).map(token => {
      const stripped = stripDiacritics(token)
      // Word bank: exact match OR word is a prefix (e.g. كلب matches كلبا)
      const match = words?.find(w => {
        const ws = stripDiacritics(w.arabic)
        return ws === stripped || (stripped.startsWith(ws) && stripped.length - ws.length <= 2)
      })
      return { token, stripped, match }
    }), [arabic, words])

  useEffect(() => {
    // Only look up tokens not in word bank and not already cached
    const uncached = tokens.filter(t => !t.match && !(t.stripped in _glossCache))
    if (!uncached.length) return
    uncached.forEach(async ({ token, stripped }) => {
      const result = await lookupWordInDictionary(token)
      _glossCache[stripped] = result?.english || null
      setTick(n => n + 1) // re-render to show newly resolved definitions
    })
  }, [tokens]) // eslint-disable-line react-hooks/exhaustive-deps

  // Show what we already know — don't hide the whole row while lookups are pending.
  // A word shows its definition as soon as it's resolved; unresolved ones show nothing yet.
  const hasAnyMeaning = tokens.some(t => t.match || _glossCache[t.stripped])
  if (!hasAnyMeaning) return null

  return (
    <div className="sentence-gloss" style={{ marginBottom: 10 }}>
      {tokens.map((item, i) => {
        const meaning = item.match?.english || _glossCache[item.stripped]
        return (
          <div key={i} className="sentence-gloss-word">
            <div className="sentence-gloss-arabic">{item.token}</div>
            <div className={`sentence-gloss-english${meaning ? '' : ' sentence-gloss-unknown'}`}>
              {meaning || '·'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const STATUS_STYLES = {
  pending:  { background: 'var(--color-bg-secondary)', color: 'var(--color-text-muted)',  label: 'Pending'  },
  approved: { background: '#d1fae5',                   color: '#065f46',                  label: 'Approved' },
  rejected: { background: '#fee2e2',                   color: '#991b1b',                  label: 'Rejected' },
}

function SentencesTab({ words }) {
  const { currentUser } = useAuth()
  const isAdmin = currentUser?.email === ADMIN_EMAIL

  const [sentences,           setSentences]           = useState(null)
  const [composerArabic,      setComposerArabic]      = useState('')
  const [composerTranslation, setComposerTranslation] = useState('')
  const [composerWordId,      setComposerWordId]      = useState('')
  const [showKeyboard,        setShowKeyboard]        = useState(false)
  const [suggestions,         setSuggestions]         = useState([])
  const [editingId,           setEditingId]           = useState(null)
  const [editArabic,          setEditArabic]          = useState('')
  const [editTranslation,     setEditTranslation]     = useState('')
  const [search,              setSearch]              = useState('')
  const [statusFilter,        setStatusFilter]        = useState('pending') // admin default
  const [approveResult,       setApproveResult]       = useState(null) // { propagated, flagged }
  const [saving,              setSaving]              = useState(false)

  const composerRef = useRef(null)

  const loadSentences = useCallback(async () => {
    if (!currentUser) return
    const data = isAdmin
      ? await getAllSentencesAdmin()
      : await getUserSentences(currentUser.id)
    setSentences(data)
  }, [currentUser, isAdmin])

  useEffect(() => { loadSentences() }, [loadSentences])

  // ── Autocomplete ──
  useEffect(() => {
    if (!composerArabic || !words?.length) { setSuggestions([]); return }
    const tokens = composerArabic.split(' ')
    const currentToken = tokens[tokens.length - 1]
    if (!currentToken || currentToken.length < 1) { setSuggestions([]); return }
    const stripped = stripDiacritics(currentToken)
    if (!stripped) { setSuggestions([]); return }
    const matches = words
      .filter(w => {
        const ws = stripDiacritics(w.arabic)
        return ws !== stripped && ws.startsWith(stripped)
      })
      .slice(0, 6)
    setSuggestions(matches)
  }, [composerArabic, words])

  const acceptSuggestion = (word) => {
    const tokens = composerArabic.split(' ')
    tokens[tokens.length - 1] = word.arabic
    setComposerArabic(tokens.join(' ') + ' ')
    setSuggestions([])
    setTimeout(() => composerRef.current?.focus(), 0)
  }

  // ── Interlinear gloss ──
  // ── CRUD ──
  const handleSave = async () => {
    if (!composerArabic.trim() || saving) return
    setSaving(true)
    try {
      await createSentence(currentUser.id, {
        arabic:      composerArabic.trim(),
        translation: composerTranslation.trim(),
        wordId:      composerWordId ? Number(composerWordId) : null,
      })
      setComposerArabic('')
      setComposerTranslation('')
      setComposerWordId('')
      setSuggestions([])
      await loadSentences()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    await deleteSentence(id)
    setSentences(prev => prev.filter(s => s.id !== id))
  }

  const startEdit = (s) => {
    setEditingId(s.id)
    setEditArabic(s.arabic)
    setEditTranslation(s.translation || '')
  }

  const handleSaveEdit = async () => {
    await updateSentence(editingId, { arabic: editArabic.trim(), translation: editTranslation.trim() })
    await loadSentences()
    setEditingId(null)
  }

  const handleApprove = async (id) => {
    const sentence = sentences.find(s => s.id === id)

    // 1. Mark approved
    await approveSentence(id)
    setSentences(prev => prev.map(s => s.id === id ? { ...s, status: 'approved' } : s))

    if (!sentence) return

    // 2. Propagate to other matching words in the word bank
    let matched = []
    try {
      const result = await propagateSentence(sentence, words)
      matched = result.matched
    } catch (err) {
      console.error('[handleApprove] propagateSentence failed:', err?.message)
    }

    // 3. Check every token against the dictionary, flag those not found
    const DIACRITIC_RE = /[\u064B-\u065F\u0610-\u061A\u0670]/g
    const PREFIX_RE    = /^[\u0648\u0641\u0628\u0644\u0643](?=[\u0600-\u06FF])|^\u0627\u0644/
    const unknownTokens = [...new Set(
      sentence.arabic.trim().split(/\s+/)
        .map(t => t.replace(DIACRITIC_RE, '').replace(PREFIX_RE, '').trim())
        .filter(t => t.length >= 2)
    )]
    let flagged = []
    try {
      flagged = await flagSentenceUnknowns(
        unknownTokens, currentUser.id, currentUser.username || 'Admin'
      )
    } catch (err) {
      console.error('[handleApprove] flagSentenceUnknowns failed:', err?.message)
    }

    setApproveResult({ matchedWords: matched, flagged: flagged.length })
    setTimeout(() => setApproveResult(null), 8000)
  }

  const handleReject = async (id) => {
    await rejectSentence(id)
    setSentences(prev => prev.map(s => s.id === id ? { ...s, status: 'rejected' } : s))
  }

  const displayedSentences = useMemo(() => {
    if (!sentences) return []
    // Never show propagated rows in either view — they are internal links only
    let list = sentences.filter(s => s.source !== 'propagated')
    if (isAdmin) {
      if (statusFilter !== 'all') {
        list = list.filter(s => (s.status || 'pending') === statusFilter)
      }
    }
    if (!search.trim()) return list
    const q = search.trim().toLowerCase()
    return list.filter(s =>
      s.arabic.includes(search.trim()) ||
      (s.translation && s.translation.toLowerCase().includes(q))
    )
  }, [sentences, search, statusFilter, isAdmin])

  const handleKeyLetter = (letter) => {
    setComposerArabic(prev => prev + letter)
    composerRef.current?.focus()
  }
  const handleKeyBackspace = () => {
    setComposerArabic(prev => [...prev].slice(0, -1).join(''))
    composerRef.current?.focus()
  }

  const formatDate = (iso) => {
    const d   = new Date(iso)
    const now = new Date()
    const sec = (now - d) / 1000
    if (sec < 60)    return 'just now'
    if (sec < 3600)  return `${Math.floor(sec / 60)}m ago`
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
    if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`
    return d.toLocaleDateString()
  }

  // Count by status for admin filter tabs
  const statusCounts = useMemo(() => {
    if (!sentences) return {}
    return sentences
      .filter(s => s.source !== 'propagated')
      .reduce((acc, s) => {
        const st = s.status || 'pending'
        acc[st] = (acc[st] || 0) + 1
        acc.all = (acc.all || 0) + 1
        return acc
      }, {})
  }, [sentences])

  return (
    <div>
      {/* Composer — always visible */}
      <div className="sentence-composer">
        <div style={{ position: 'relative' }}>
          <textarea
            ref={composerRef}
            className="sentence-composer-input"
            value={composerArabic}
            onChange={e => { setComposerArabic(e.target.value) }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave() } }}
            placeholder="اكتب جملتك هنا…"
            dir="rtl"
            rows={2}
          />
          {suggestions.length > 0 && (
            <div className="sentence-suggestions">
              {suggestions.map(w => (
                <button
                  key={w.id}
                  className="sentence-suggestion-item"
                  onMouseDown={e => { e.preventDefault(); acceptSuggestion(w) }}
                >
                  <span style={{ fontFamily: 'var(--font-arabic)', fontSize: '1rem' }}>{w.arabic}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginRight: 10 }}>{w.english}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          type="text"
          className="form-input"
          value={composerTranslation}
          onChange={e => setComposerTranslation(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
          placeholder="English translation (optional)…"
          style={{ marginTop: 8 }}
        />
        <select
          className="form-select"
          value={composerWordId}
          onChange={e => setComposerWordId(e.target.value)}
          style={{ marginTop: 8 }}
        >
          <option value="">— Link to word (optional) —</option>
          {[...words].sort((a, b) => a.arabic.localeCompare(b.arabic)).map(w => (
            <option key={w.id} value={w.id}>{w.arabic} — {w.english}</option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
          <button
            className={`btn btn-sm${showKeyboard ? ' btn-primary' : ''}`}
            onClick={() => setShowKeyboard(k => !k)}
            title="Toggle Arabic keyboard"
            style={{ fontFamily: 'var(--font-arabic)', fontSize: '1.1rem', padding: '6px 14px' }}
          >
            ع
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={!composerArabic.trim() || saving}
          >
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Save Sentence'}
          </button>
        </div>
      </div>

      {/* On-screen keyboard */}
      {showKeyboard && (
        <ArabicKeyboard onLetter={handleKeyLetter} onBackspace={handleKeyBackspace} />
      )}

      {/* Admin review queue header */}
      {isAdmin && (
        <div style={{ margin: '20px 0 16px', paddingTop: 20, borderTop: '1px solid var(--color-border)' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '1rem' }}>Review Queue</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['pending', 'approved', 'rejected', 'all'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`btn btn-sm${statusFilter === s ? ' btn-primary' : ' btn-secondary'}`}
                style={{ textTransform: 'capitalize' }}
              >
                {s} {statusCounts[s] ? `(${statusCounts[s]})` : '(0)'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      {sentences && sentences.length > 4 && (
        <div className="search-input-wrapper" style={{ marginBottom: 16 }}>
          <span className="search-icon"><Search size={16} /></span>
          <input
            type="text"
            className="form-input"
            placeholder="Search sentences…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>
      )}

      {/* Approval result banner */}
      {approveResult && (
        <div style={{
          background: '#d1fae5', color: '#065f46', borderRadius: 8,
          padding: '10px 14px', marginBottom: 12, fontSize: '0.875rem',
        }}>
          <span style={{ fontWeight: 600 }}>✓ Approved</span>
          {approveResult.matchedWords?.length > 0 && (
            <span> · also set as example sentence for{' '}
              <span style={{ fontFamily: 'var(--font-arabic)' }}>
                {approveResult.matchedWords.map(w => `${w.arabic} (${w.english})`).join('، ')}
              </span>
            </span>
          )}
          {approveResult.flagged > 0 && (
            <span> · {approveResult.flagged} unknown word{approveResult.flagged !== 1 ? 's' : ''} sent to contributions</span>
          )}
          {approveResult.matchedWords?.length === 0 && approveResult.flagged === 0 && (
            <span style={{ fontWeight: 400 }}> · no other words in this sentence matched your word bank</span>
          )}
        </div>
      )}

      {/* Sentence list */}
      {sentences === null ? (
        <div style={{ textAlign: 'center', padding: 32 }}><span className="spinner" /></div>
      ) : displayedSentences.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">
            {sentences.length === 0 ? 'No sentences yet' : 'No matches'}
          </div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', maxWidth: 360, margin: '0 auto' }}>
            {sentences.length === 0
              ? 'Write a sentence above — words from your Word Bank will be auto-translated word-by-word beneath it.'
              : 'Try a different search or filter.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {displayedSentences.map(sentence => {
            const status = sentence.status || 'pending'
            const statusStyle = STATUS_STYLES[status] || STATUS_STYLES.pending
            return editingId === sentence.id ? (
              <div key={sentence.id} className="sentence-card sentence-card-editing">
                <div style={{ position: 'relative' }}>
                  <textarea
                    className="sentence-composer-input"
                    value={editArabic}
                    onChange={e => setEditArabic(e.target.value)}
                    dir="rtl"
                    rows={2}
                    autoFocus
                  />
                </div>
                <input
                  type="text"
                  className="form-input"
                  value={editTranslation}
                  onChange={e => setEditTranslation(e.target.value)}
                  placeholder="English translation (optional)…"
                  style={{ marginTop: 8 }}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit() }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                  <button className="btn btn-primary btn-sm" onClick={handleSaveEdit}>Save</button>
                </div>
              </div>
            ) : (
              <div key={sentence.id} className="sentence-card">
                {/* Status badge + source + linked word */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                    background: statusStyle.background, color: statusStyle.color,
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>
                    {statusStyle.label}
                  </span>
                  {sentence.source === 'ai_import' && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>AI import</span>
                  )}
                  {sentence.word_id && (() => {
                    const linked = words.find(w => w.id === sentence.word_id)
                    return linked ? (
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-primary)', fontFamily: 'var(--font-arabic)' }}>
                        {linked.arabic} — {linked.english}
                      </span>
                    ) : null
                  })()}
                </div>

                {/* Arabic text */}
                <div style={{ fontFamily: 'var(--font-arabic)', fontSize: '1.35rem', direction: 'rtl', lineHeight: 1.7, marginBottom: 10 }}>
                  {sentence.arabic}
                </div>

                {/* Interlinear gloss with dictionary fallback */}
                <SentenceGloss arabic={sentence.arabic} words={words} />

                {/* Translation & actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
                  <div>
                    {sentence.translation && (
                      <div style={{ fontSize: '0.88rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                        "{sentence.translation}"
                      </div>
                    )}
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 3 }}>
                      {formatDate(sentence.created_at)}
                    </div>
                  </div>

                  {/* Admin approve/reject */}
                  {isAdmin ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      {status !== 'approved' && (
                        <button
                          className="btn btn-sm"
                          style={{ background: '#d1fae5', color: '#065f46', border: 'none', fontWeight: 600 }}
                          onClick={() => handleApprove(sentence.id)}
                        >
                          ✓ Approve
                        </button>
                      )}
                      {status !== 'rejected' && (
                        <button
                          className="btn btn-sm"
                          style={{ background: '#fee2e2', color: '#991b1b', border: 'none', fontWeight: 600 }}
                          onClick={() => handleReject(sentence.id)}
                        >
                          ✕ Reject
                        </button>
                      )}
                      <button className="icon-btn danger" title="Delete" onClick={() => handleDelete(sentence.id)}><Trash2 size={13} /></button>
                    </div>
                  ) : (
                    <div className="action-icons">
                      <button className="icon-btn" title="Edit" onClick={() => startEdit(sentence)}><Pencil size={13} /></button>
                      <button className="icon-btn danger" title="Delete" onClick={() => handleDelete(sentence.id)}><Trash2 size={13} /></button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Root Detail Modal (click a root in the Words table) ──────────────────────
function RootDetailModal({ root, words, sortedDecks, currentUser, onWordAdded, onClose }) {
  const [results,    setResults]    = useState(null)
  const [searching,  setSearching]  = useState(true)
  const [deckPick,   setDeckPick]   = useState(sortedDecks[0]?.id ?? '')
  const [addedIds,   setAddedIds]   = useState(new Set())
  const [addingNow,  setAddingNow]  = useState(false)

  const ownedArabic = useMemo(
    () => new Set(words.map(w => stripDiacritics(w.arabic))),
    [words]
  )

  useEffect(() => {
    searchDictionaryByRoot(root)
      .then(data => { setResults(data); setSearching(false) })
      .catch(() => { setResults([]); setSearching(false) })
  }, [root])

  const grouped = useMemo(() => {
    if (!results) return []
    const map = new Map()
    for (const entry of results) {
      const key = entry.pos || ''
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(entry)
    }
    return POS_ORDER.filter(k => map.has(k)).map(k => ({ pos: k, entries: map.get(k) }))
  }, [results])

  const inBank    = results?.filter(e => ownedArabic.has(stripDiacritics(e.arabic))).length ?? 0
  const notInBank = results ? results.length - inBank : 0

  const handleAdd = async (entry) => {
    if (!deckPick || !currentUser) return
    setAddingNow(true)
    try {
      const deckId = Number(deckPick)
      const exists = await wordExistsInDeck(currentUser.id, deckId, entry.arabic)
      if (!exists) {
        const newWord = await createWord(currentUser.id, {
          deckId,
          arabic:       entry.arabic,
          english:      entry.definition,
          root:         entry.root || '',
          partOfSpeech: entry.pos  || '',
        })
        await createSrsCard(currentUser.id, { wordId: newWord.id, deckId })
        onWordAdded()
      }
      setAddedIds(prev => new Set([...prev, entry.id]))
    } catch (err) {
      alert('Failed to add word: ' + err.message)
    } finally {
      setAddingNow(false)
    }
  }

  return (
    <ModalPortal>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            Root
            <span style={{ fontFamily: 'var(--font-arabic)', fontSize: '1.4rem', direction: 'rtl', color: 'var(--color-primary)' }}>
              {root}
            </span>
          </h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        {searching && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-muted)', padding: '24px 0' }}>
            <span className="spinner" style={{ width: 16, height: 16 }} /> Loading…
          </div>
        )}

        {!searching && results?.length === 0 && (
          <div style={{ color: 'var(--color-text-muted)', padding: '24px 0', fontSize: '0.9rem' }}>
            No dictionary entries found for this root.
          </div>
        )}

        {!searching && results?.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                <strong style={{ color: 'var(--color-text)' }}>{results.length}</strong> {results.length === 1 ? 'word' : 'words'}
                {inBank    > 0 && <span style={{ marginLeft: 10, color: 'var(--color-success)' }}>· {inBank} in your bank</span>}
                {notInBank > 0 && <span style={{ marginLeft: 6 }}>· {notInBank} new to you</span>}
              </div>
              {sortedDecks.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Add to:</span>
                  <select className="form-select" style={{ fontSize: '0.82rem', padding: '5px 8px' }}
                    value={deckPick} onChange={e => setDeckPick(e.target.value)}>
                    {sortedDecks.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              {grouped.map(({ pos, entries }) => (
                <div key={pos} style={{ marginBottom: 20 }}>
                  <div style={{
                    fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.07em', color: 'var(--color-text-muted)',
                    marginBottom: 8, paddingBottom: 5, borderBottom: '1px solid var(--color-border)',
                  }}>
                    {POS_LABEL[pos] || pos || 'Uncategorised'} ({entries.length})
                  </div>
                  <div className="dict-results">
                    {entries.map(entry => {
                      const owned     = ownedArabic.has(stripDiacritics(entry.arabic))
                      const justAdded = addedIds.has(entry.id)
                      return (
                        <div key={entry.id} className="dict-entry"
                          style={owned ? { borderLeft: '3px solid var(--color-success)' } : undefined}>
                          <div className="dict-entry-main">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span className="dict-arabic">{entry.arabic}</span>
                              <SpeakButton text={entry.arabic} />
                              {owned && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-success)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                  <Check size={11} /> In your bank
                                </span>
                              )}
                            </div>
                            <div className="dict-definition">{entry.definition}</div>
                          </div>
                          {sortedDecks.length > 0 && !owned && (
                            <div className="dict-entry-action">
                              {justAdded ? (
                                <span style={{ fontSize: '0.85rem', color: 'var(--color-success)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <Check size={13} /> Added
                                </span>
                              ) : (
                                <button className="btn btn-secondary btn-sm"
                                  onClick={() => handleAdd(entry)} disabled={addingNow}>
                                  + Add
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

// ── Root Explorer Tab ─────────────────────────────────────────────────────────
const POS_ORDER = ['verb', 'noun', 'adjective', 'adverb', 'particle', 'preposition', 'conjunction', 'pronoun', 'other', '']
const POS_LABEL = {
  verb: 'Verbs', noun: 'Nouns', adjective: 'Adjectives', adverb: 'Adverbs',
  particle: 'Particles', preposition: 'Prepositions', conjunction: 'Conjunctions',
  pronoun: 'Pronouns', other: 'Other', '': 'Uncategorised',
}

function RootsTab({ words, sortedDecks, currentUser, onWordAdded }) {
  const [rootQuery,    setRootQuery]    = useState('')
  const [results,      setResults]      = useState(null)   // null = no search yet
  const [searching,    setSearching]    = useState(false)
  const [showKeyboard, setShowKeyboard] = useState(false)
  const [deckPick,     setDeckPick]     = useState(sortedDecks[0]?.id ?? '')
  const [addingId,     setAddingId]     = useState(null)
  const [addingNow,    setAddingNow]    = useState(false)
  const [addedIds,     setAddedIds]     = useState(new Set())
  const inputRef = useRef(null)

  // Set of normalised Arabic from the user's word bank for fast "already have" lookup
  const ownedArabic = useMemo(
    () => new Set(words.map(w => stripDiacritics(w.arabic))),
    [words]
  )

  // Debounced root search
  useEffect(() => {
    const q = rootQuery.trim()
    if (!q) { setResults(null); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await searchDictionaryByRoot(q)
        setResults(data)
        setAddedIds(new Set()) // reset added markers on new search
      } catch (err) {
        console.error('Root search:', err)
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [rootQuery])

  // Group results by part of speech, in a fixed display order
  const grouped = useMemo(() => {
    if (!results) return []
    const map = new Map()
    for (const entry of results) {
      const key = entry.pos || ''
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(entry)
    }
    return POS_ORDER
      .filter(k => map.has(k))
      .map(k => ({ pos: k, entries: map.get(k) }))
  }, [results])

  const inBank   = results?.filter(e => ownedArabic.has(stripDiacritics(e.arabic))).length ?? 0
  const notInBank = results ? results.length - inBank : 0

  const handleAdd = async (entry) => {
    if (!deckPick || !currentUser) return
    setAddingNow(true)
    try {
      const deckId = Number(deckPick)
      const exists = await wordExistsInDeck(currentUser.id, deckId, entry.arabic)
      if (!exists) {
        const newWord = await createWord(currentUser.id, {
          deckId,
          arabic:       entry.arabic,
          english:      entry.definition,
          root:         entry.root || '',
          partOfSpeech: entry.pos  || '',
        })
        await createSrsCard(currentUser.id, { wordId: newWord.id, deckId })
        onWordAdded()
      }
      setAddedIds(prev => new Set([...prev, entry.id]))
      setAddingId(null)
    } catch (err) {
      alert('Failed to add word: ' + err.message)
    } finally {
      setAddingNow(false)
    }
  }

  const handleKeyLetter = (letter) => {
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
    inputRef.current?.focus()
  }
  const handleKeyBackspace = () => {
    setRootQuery(prev => {
      const bare = prev.replace(/\s+/g, '')
      const trimmed = [...bare].slice(0, -1).join('')
      return trimmed ? formatArabicInput(trimmed) : ''
    })
    inputRef.current?.focus()
  }

  return (
    <div>
      {/* Search bar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: showKeyboard ? 12 : 20, flexWrap: 'wrap' }}>
        <div className="search-input-wrapper" style={{ flex: 1, maxWidth: 360 }}>
          <span className="search-icon" style={{ fontFamily: 'var(--font-arabic)', fontSize: '0.95rem', color: 'var(--color-text-muted)' }}>ج ذ ر</span>
          <input
            ref={inputRef}
            type="text"
            className="form-input"
            placeholder="Enter a root (e.g. ك ت ب)…"
            value={rootQuery}
            onChange={e => {
              const val = e.target.value
              setRootQuery(isArabic(val) ? formatArabicInput(val) : val)
            }}
            style={{ paddingLeft: 52, paddingRight: rootQuery ? 32 : undefined, direction: rootQuery ? 'rtl' : 'ltr', fontFamily: rootQuery ? 'var(--font-arabic)' : 'inherit', fontSize: rootQuery ? '1.05rem' : undefined }}
            autoFocus
          />
          {rootQuery && (
            <button
              onClick={() => { setRootQuery(''); setResults(null) }}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}
            ><X size={15} /></button>
          )}
        </div>
        <button
          className={`btn btn-sm${showKeyboard ? ' btn-primary' : ''}`}
          onClick={() => setShowKeyboard(k => !k)}
          title="Toggle Arabic keyboard"
          style={{ fontFamily: 'var(--font-arabic)', fontSize: '1.1rem', padding: '6px 14px', flexShrink: 0 }}
        >ع</button>
      </div>

      {showKeyboard && (
        <ArabicKeyboard onLetter={handleKeyLetter} onBackspace={handleKeyBackspace} />
      )}

      {/* Idle state */}
      {results === null && !searching && (
        <div className="empty-state" style={{ padding: '48px 0' }}>
          <div className="empty-state-icon" style={{ fontFamily: 'var(--font-arabic)', fontSize: '2.5rem', color: 'var(--color-text-muted)' }}>ك ت ب</div>
          <div className="empty-state-title">Explore by root</div>
          <p style={{ color: 'var(--color-text-muted)', maxWidth: 360, margin: '0 auto' }}>
            Type an Arabic root above to see all derived words in the dictionary — verbs, nouns, adjectives and more.
          </p>
        </div>
      )}

      {/* Searching */}
      {searching && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-muted)', padding: '16px 0' }}>
          <span className="spinner" style={{ width: 16, height: 16 }} /> Searching…
        </div>
      )}

      {/* No results */}
      {!searching && results !== null && results.length === 0 && (
        <div className="empty-state" style={{ padding: '32px 0' }}>
          <div className="empty-state-title">No entries found for this root</div>
          <p style={{ color: 'var(--color-text-muted)' }}>Try a different root or check the spelling.</p>
        </div>
      )}

      {/* Results */}
      {!searching && results !== null && results.length > 0 && (
        <>
          {/* Summary bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              <strong style={{ color: 'var(--color-text)' }}>{results.length}</strong> {results.length === 1 ? 'word' : 'words'} found
              {inBank > 0 && (
                <span style={{ marginLeft: 10, color: 'var(--color-success)' }}>
                  · {inBank} already in your bank
                </span>
              )}
              {notInBank > 0 && (
                <span style={{ marginLeft: 6, color: 'var(--color-text-muted)' }}>
                  · {notInBank} new to you
                </span>
              )}
            </div>
            {/* Deck picker — shown once, applies to all "+ Add" clicks */}
            {sortedDecks.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Add to:</span>
                <select
                  className="form-select"
                  style={{ fontSize: '0.82rem', padding: '5px 8px' }}
                  value={deckPick}
                  onChange={e => setDeckPick(e.target.value)}
                >
                  {sortedDecks.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Groups */}
          {grouped.map(({ pos, entries }) => (
            <div key={pos} style={{ marginBottom: 24 }}>
              <div style={{
                fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.07em', color: 'var(--color-text-muted)',
                marginBottom: 10, paddingBottom: 6,
                borderBottom: '1px solid var(--color-border)',
              }}>
                {POS_LABEL[pos] || pos || 'Uncategorised'} ({entries.length})
              </div>
              <div className="dict-results">
                {entries.map(entry => {
                  const owned   = ownedArabic.has(stripDiacritics(entry.arabic))
                  const justAdded = addedIds.has(entry.id)
                  return (
                    <div key={entry.id} className="dict-entry" style={owned ? { borderLeft: '3px solid var(--color-success)' } : undefined}>
                      <div className="dict-entry-main">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="dict-arabic">{entry.arabic}</span>
                          <SpeakButton text={entry.arabic} />
                          {owned && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-success)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <Check size={11} /> In your bank
                            </span>
                          )}
                        </div>
                        {entry.root && (
                          <div className="dict-meta">
                            <span className="dict-root">{entry.root}</span>
                          </div>
                        )}
                        <div className="dict-definition">{entry.definition}</div>
                      </div>

                      {sortedDecks.length > 0 && !owned && (
                        <div className="dict-entry-action">
                          {justAdded ? (
                            <span style={{ fontSize: '0.85rem', color: 'var(--color-success)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Check size={13} /> Added
                            </span>
                          ) : (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleAdd(entry)}
                              disabled={addingNow && addingId === entry.id}
                            >
                              {addingNow && addingId === entry.id
                                ? <span className="spinner" style={{ width: 12, height: 12 }} />
                                : '+ Add'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ── AI Prompt Modal ───────────────────────────────────────────────────────────
const AI_PROMPT_TEMPLATE = `Generate a JSON array of Arabic vocabulary words for the theme: [THEME]. Include 20 words. Each word must follow this exact format with no extra text, just the raw JSON array:

[
  {
    "arabic": "كَلْبٌ",
    "english": "dog",
    "root": "ك ل ب",
    "part_of_speech": "noun",
    "example_sentence": "رَأَيْتُ كَلْبًا فِي الشَّارِعِ",
    "notes": "",
    "singular": "كَلْبٌ",
    "dual": "كَلْبَانِ",
    "plural": "كِلَابٌ",
    "past": "",
    "present": "",
    "command": "",
    "masdar": ""
  }
]

Rules:
- Include full diacritics/tashkeel on all Arabic text
- part_of_speech must be one of: noun, verb, adjective, adverb, particle, other
- For verbs: fill past, present, command, masdar — leave singular, dual, plural empty
- For nouns/adjectives: fill singular, dual, plural — leave verb fields empty
- example_sentence must be a natural sentence containing the word, fully vowelled
- notes must always be left empty — do not put anything in it
- Output raw JSON only — no explanation, no markdown code block`

function AiPromptModal({ onClose }) {
  const [theme, setTheme] = useState('')
  const [copied, setCopied] = useState(false)

  const prompt = AI_PROMPT_TEMPLATE.replace('[THEME]', theme.trim() || '[THEME]')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback for browsers that block clipboard
      const ta = document.createElement('textarea')
      ta.value = prompt
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <ModalPortal>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 680, width: '95vw' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={18} /> Generate with AI
          </h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ padding: '16px 20px 20px' }}>

          {/* Steps */}
          <ol style={{ margin: '0 0 18px', paddingLeft: 20, fontSize: '0.875rem', color: 'var(--color-text-muted)', lineHeight: 2 }}>
            <li>Type your theme below, then click <strong>Copy Prompt</strong></li>
            <li>Paste into <strong>ChatGPT</strong> or <strong>Claude</strong> and send it</li>
            <li>Select and copy the entire JSON response it gives you</li>
            <li>Open <strong>Notepad</strong>, paste the JSON in, then go to <strong>File → Save As</strong></li>
            <li>In the Save dialog, set <strong>Save as type</strong> to <strong>All Files (*.*)</strong>, then name the file ending in <code style={{ fontSize: '0.8rem' }}>.json</code> — e.g. <code style={{ fontSize: '0.8rem' }}>animals.json</code> — and save</li>
            <li>Back here, click <strong>Import JSON</strong> and select that file</li>
          </ol>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Theme</label>
            <input
              className="form-input"
              placeholder="e.g. animals, food, travel, emotions…"
              value={theme}
              onChange={e => setTheme(e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">Prompt</label>
            <pre style={{
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
              padding: '10px 12px',
              background: 'var(--color-bg-secondary, #f5f5f5)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              color: 'var(--color-text)',
            }}>{prompt}</pre>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={handleCopy}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Prompt</>}
            </button>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function WordBank({ forceSection = null }) {
  const { currentUser, isGuest, guestData } = useAuth()

  const [words,          setWords]          = useState(null)
  const [decks,          setDecks]          = useState(null)
  const [srsCards,       setSrsCards]       = useState(null)
  const [downloadCounts, setDownloadCounts] = useState({})

  const [search, setSearch]           = useState('')
  const [rootSearch, setRootSearch]   = useState('')
  const [activeSearchField, setActiveSearchField] = useState('word') // 'word' | 'root'
  const [showKeyboard, setShowKeyboard] = useState(false)
  const [copyWord, setCopyWord]     = useState(null)
  const [filterDeck, setFilterDeck] = useState('all')
  const [filterSRS, setFilterSRS]   = useState('all')
  const [editingWord, setEditingWord] = useState(null)
  const [selected, setSelected]     = useState(new Set())
  const [expandedDeckGroups, setExpandedDeckGroups] = useState(new Set())
  const [modal, setModal]           = useState(null)
  const [confirmDeck, setConfirmDeck] = useState(null)
  const [editDeck,    setEditDeck]    = useState(null)
  const [openMenuDeckId, setOpenMenuDeckId] = useState(null)
  const [printDeck,      setPrintDeck]      = useState(null)
  const [frequencyDeck,  setFrequencyDeck]  = useState(null)
  const [rootModal, setRootModal]   = useState(null) // root string or null
  const [fillingRoots, setFillingRoots] = useState(false)
  const [rootsFilled,  setRootsFilled]  = useState(null) // number or null
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const activeTab = forceSection || searchParams.get('section') || 'words'
  const [showAiPrompt, setShowAiPrompt] = useState(false)
  const fileInputRef = useRef(null)
  const searchRef = useRef(null)
  const rootSearchRef = useRef(null)

  // Load all data
  const reload = useCallback(async () => {
    if (isGuest) {
      setWords(guestData.words)
      setDecks(guestData.decks)
      setSrsCards(guestData.srsCards)
      setDownloadCounts({})
      return
    }
    if (!currentUser) return
    const [w, d, s] = await Promise.all([
      getUserWords(currentUser.id),
      getUserDecks(currentUser.id),
      getUserSrsCards(currentUser.id),
    ])
    const normalizedDecks = d.map(normalizeDeck)
    setWords(w.map(normalizeWord))
    setDecks(normalizedDecks)
    setSrsCards(s.map(normalizeSrsCard))

    // Fetch live download counts for any currently-public decks
    const communityIds = normalizedDecks.filter(d => d.communityDeckId).map(d => d.communityDeckId)
    const counts = await getDownloadCounts(communityIds)
    setDownloadCounts(counts)
  }, [currentUser, isGuest, guestData])

  useEffect(() => { reload() }, [reload])

  // Build srsCard map keyed by wordId
  const srsMap = useMemo(() => {
    if (!srsCards) return {}
    const m = {}
    srsCards.forEach(c => { m[c.wordId] = c })
    return m
  }, [srsCards])

  // Alphabetically + numerically sorted decks (e.g. "Ch 1" before "Ch 2" before "Ch 10")
  const sortedDecks = useMemo(() => {
    if (!decks) return []
    return [...decks].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
    )
  }, [decks])

  // Build deck word count map
  const deckWordCount = useMemo(() => {
    const map = {}
    words?.forEach(w => {
      map[w.deckId] = (map[w.deckId] || 0) + 1
    })
    return map
  }, [words])

  // Due count per deck
  const duePerDeck = useMemo(() => {
    const now = new Date().toISOString()
    const map = {}
    srsCards?.forEach(card => {
      if (card.nextReviewDate <= now && card.deckId) {
        map[card.deckId] = (map[card.deckId] || 0) + 1
      }
    })
    return map
  }, [srsCards])

  // Filtered & searched words
  const filteredWords = useMemo(() => {
    if (!words) return []
    let arr = words
    if (filterDeck !== 'all') arr = arr.filter(w => w.deckId === Number(filterDeck))
    if (filterSRS !== 'all')  arr = arr.filter(w => getSRSStatus(srsMap[w.id]) === filterSRS)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      arr = arr.filter(w =>
        w.arabic.includes(search.trim()) ||
        (w.english && w.english.toLowerCase().includes(q))
      )
    }
    if (rootSearch.trim()) {
      arr = arr.filter(w => w.root && w.root.includes(rootSearch.trim()))
    }
    return arr
  }, [words, filterDeck, filterSRS, search, rootSearch, srsMap])

  // Group filtered words by arabic text (one display row per unique word)
  const groupedWords = useMemo(() => {
    const SRS_RANK = { mastered: 4, review: 3, learning: 2, new: 1 }
    const groups = new Map() // arabic -> { primary, allWords }
    for (const word of filteredWords) {
      if (!groups.has(word.arabic)) {
        groups.set(word.arabic, { primary: word, allWords: [] })
      }
      groups.get(word.arabic).allWords.push(word)
    }
    return [...groups.values()].map(g => ({
      ...g,
      bestStatus: g.allWords.reduce((best, w) => {
        const s = getSRSStatus(srsMap[w.id])
        return (SRS_RANK[s] || 0) > (SRS_RANK[best] || 0) ? s : best
      }, 'new'),
    }))
  }, [filteredWords, srsMap])

  // ── actions ──
  const handleAddWord = async (form) => {
    const newWord = await createWord(currentUser.id, {
      deckId:          form.deckId,
      arabic:          form.arabic,
      english:         form.english,
      root:            form.root,
      partOfSpeech:    form.partOfSpeech,
      exampleSentence: form.exampleSentence,
      notes:           form.notes || '',
      past:            form.past,
      present:         form.present,
      command:         form.command,
      masdar:          form.masdar,
      singular:        form.singular,
      dual:            form.dual,
      plural:          form.plural,
    })
    await createSrsCard(currentUser.id, { wordId: newWord.id, deckId: form.deckId })
    await reload()
  }

  const handleEditWord = async (wordId, form) => {
    await updateWord(wordId, {
      arabic:          form.arabic,
      english:         form.english,
      root:            form.root,
      partOfSpeech:    form.partOfSpeech,
      exampleSentence: form.exampleSentence,
      notes:           form.notes  !== undefined ? form.notes  : undefined,
      color:           form.color  !== undefined ? form.color  : undefined,
      past:            form.past,
      present:         form.present,
      command:         form.command,
      masdar:          form.masdar,
      singular:        form.singular,
      dual:            form.dual,
      plural:          form.plural,
    })
    setEditingWord(null)
    await reload()
  }

  // Delete all copies of a word across all decks (by arabic text group)
  const handleDeleteWordGroup = async (arabicText) => {
    const group = groupedWords.find(g => g.primary.arabic === arabicText)
    if (!group) return
    const ids = group.allWords.map(w => w.id)
    await deleteWords(ids)
    setExpandedDeckGroups(prev => { const n = new Set(prev); n.delete(arabicText); return n })
    await reload()
  }

  const handleDeleteSelected = async () => {
    // selected tracks arabic text keys; resolve all word IDs across those groups
    const ids = groupedWords
      .filter(g => selected.has(g.primary.arabic))
      .flatMap(g => g.allWords.map(w => w.id))
    await deleteWords(ids)
    setSelected(new Set())
    setModal(null)
    await reload()
  }

  const handleMarkAsKnown = async () => {
    const cardIds = groupedWords
      .filter(g => selected.has(g.primary.arabic))
      .flatMap(g => g.allWords.map(w => srsMap[w.id]?.id).filter(Boolean))
    if (cardIds.length) await markWordsAsKnown(cardIds)
    setSelected(new Set())
    await reload()
  }

  const handleCreateDeck = async (title, description) => {
    await createDeck(currentUser.id, { title, description })
    await reload()
  }

  const handleCloseEditDeck = async () => {
    setEditDeck(null)
    setModal(null)
    await reload()
  }

  const handleDeleteDeck = async (deck) => {
    await deleteDeck(deck.id)
    setConfirmDeck(null)
    setModal(null)
    await reload()
  }

  // Delete personal copy only — community entry stays
  const handleDeleteDeckPersonalOnly = async (deck) => {
    await deleteDeck(deck.id)
    setConfirmDeck(null)
    setModal(null)
    await reload()
  }

  // Delete personal copy AND remove from Community Decks
  const handleDeleteDeckEverywhere = async (deck) => {
    try { await unuploadCommunityDeck(deck) } catch { /* ignore if already gone */ }
    await deleteDeck(deck.id)
    setConfirmDeck(null)
    setModal(null)
    await reload()
  }

  const handleResetWord = async (wordId) => {
    const srsCard = srsMap[wordId]
    if (!srsCard) return
    await resetSrsCard(srsCard.id)
    await reload()
  }

  const handleFillMissingRoots = async () => {
    setFillingRoots(true)
    try {
      // Group words by unique Arabic so we only look each word up once
      const seen = new Map() // arabic → [id, id, ...]
      for (const word of words) {
        if (!word.root) {
          if (!seen.has(word.arabic)) seen.set(word.arabic, [])
          seen.get(word.arabic).push(word.id)
        }
      }
      let filled = 0
      for (const [arabic, ids] of seen) {
        const root = await lookupRootForArabic(arabic)
        if (root) {
          for (const id of ids) await updateWord(id, { root })
          filled++
        }
      }
      setRootsFilled(filled)
      setTimeout(() => setRootsFilled(null), 4000)
      await reload()
    } finally {
      setFillingRoots(false)
    }
  }

  const handleCopyWord = async (word, targetDeckId) => {
    const exists = await wordExistsInDeck(currentUser.id, targetDeckId, word.arabic)
    if (exists) throw new Error('This word already exists in that deck.')
    const newWord = await createWord(currentUser.id, {
      deckId:          targetDeckId,
      arabic:          word.arabic,
      english:         word.english,
      root:            word.root || '',
      partOfSpeech:    word.partOfSpeech || '',
      exampleSentence: word.exampleSentence || '',
    })
    await createSrsCard(currentUser.id, { wordId: newWord.id, deckId: targetDeckId })
    await reload()
  }

  const handleResetDeck = async (deck) => {
    await resetDeckSrsCards(currentUser.id, deck.id)
    setConfirmDeck(null)
    setModal(null)
    await reload()
  }

  const handleFrequencySave = async (deckId, updates) => {
    await updateDeck(deckId, updates)
    setDecks(prev => prev.map(d => {
      if (d.id !== deckId) return d
      return {
        ...d,
        reviewFrequency:    'review_frequency'     in updates ? updates.review_frequency     : d.reviewFrequency,
        reviewIntervalDays: 'review_interval_days' in updates ? updates.review_interval_days  : d.reviewIntervalDays,
        nextDeckReview:     'next_deck_review'      in updates ? updates.next_deck_review      : d.nextDeckReview,
      }
    }))
  }

  const handleUploadCommunity = async (deck) => {
    const deckWords = await getDeckWords(deck.id)
    await uploadCommunityDeck(
      currentUser.id,
      currentUser.username || 'Unknown',
      deck,
      deckWords
    )
    await reload()
  }

  const handleUnuploadCommunity = async (deck) => {
    try {
      await unuploadCommunityDeck(deck)
      await reload()
    } catch (err) {
      alert('Un-share failed: ' + err.message)
    }
  }

  const handleExportDeck = async (deck) => {
    const deckWords = await getDeckWords(deck.id)
    const normalized = deckWords.map(normalizeWord)
    const data = {
      title: deck.title,
      description: deck.description,
      words: normalized.map(({ arabic, english, root, partOfSpeech, exampleSentence }) =>
        ({ arabic, english, root, partOfSpeech, exampleSentence })
      ),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${deck.title.replace(/\s+/g, '_')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportDeck = async (file) => {
    const text = await file.text()
    let data
    try { data = JSON.parse(text) } catch { alert('Invalid JSON file.'); return }

    // Accept bare array (AI output) or wrapped object { title, words }
    let title, description, words
    if (Array.isArray(data)) {
      const name = window.prompt('Enter a name for this deck:', file.name.replace(/\.json$/i, ''))
      if (!name) return
      title = name.trim()
      description = ''
      words = data
    } else if (data.title && Array.isArray(data.words)) {
      title = data.title
      description = data.description || ''
      words = data.words
    } else {
      alert('Invalid deck format.'); return
    }

    const wordsWithSentences = (Array.isArray(words) ? words : [])
      .filter(w => (w.example_sentence || w.exampleSentence || '').trim())
    await batchImportDeck(currentUser.id, { title, description }, words)
    await reload()
    // Navigate to sentences if words had sentences, otherwise go to Decks page
    if (wordsWithSentences.length > 0) {
      navigate('?section=sentences', { replace: true })
    } else {
      navigate('/decks', { replace: true })
    }
  }

  const toggleSelect = (arabicText) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(arabicText) ? next.delete(arabicText) : next.add(arabicText)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === groupedWords.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(groupedWords.map(g => g.primary.arabic)))
    }
  }

  if (!words || !decks) {
    return <div className="loading-screen"><div className="spinner" /></div>
  }

  // Empty state — direct users to Community Decks to import shared vocabulary
  if (words.length === 0 && decks.length === 0) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">Word Bank</h1>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, color: 'var(--color-text-muted)' }}><Library size={48} strokeWidth={1.25} /></div>
          <h2 style={{ marginBottom: 8 }}>Your word bank is empty</h2>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 24 }}>
            Import the Bayna Yadayk vocabulary from Community Decks, or add words manually below.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/community" className="btn btn-primary">Browse Community Decks →</a>
            <button className="btn btn-secondary" onClick={() => setModal('add')}>Add a word manually</button>
          </div>
        </div>
      </div>
    )
  }

  const PAGE_SUBTITLES = {
    words:     `${words.length} words across ${decks.length} decks`,
    decks:     `${decks.length} deck${decks.length !== 1 ? 's' : ''}`,
    sentences: 'Example sentences for your words',
    roots:     'Browse your vocabulary by Arabic root',
  }

  return (
    <div className="page-container page-container-fill">
      <div className="page-header">
        <h1 className="page-title">
          {activeTab === 'words'     && 'Words'}
          {activeTab === 'decks'     && 'Decks'}
          {activeTab === 'sentences' && 'Sentences'}
          {activeTab === 'roots'     && 'Roots'}
        </h1>
        <p className="page-subtitle">{PAGE_SUBTITLES[activeTab]}</p>
      </div>

      <div className="wordbank-scroll">

      {/* ── WORDS TAB ── */}
      {activeTab === 'words' && (
        <>
          {/* Toolbar — row 1: search */}
          <div className="wordbank-toolbar">
            <div className="search-input-wrapper" style={{ flex: 2 }}>
              <span className="search-icon"><Search size={16} /></span>
              <input
                ref={searchRef}
                type="text" className="form-input" placeholder="Arabic word or English…"
                value={search}
                onFocus={() => setActiveSearchField('word')}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 36, direction: isArabic(search) ? 'rtl' : 'ltr' }}
              />
            </div>
            <div className="search-input-wrapper" style={{ flex: 1 }}>
              <span className="search-icon"><Search size={16} /></span>
              <input
                ref={rootSearchRef}
                type="text" className="form-input" placeholder="Root (ك ت ب)…"
                value={rootSearch}
                onFocus={() => setActiveSearchField('root')}
                onChange={e => {
                  const val = e.target.value
                  setRootSearch(isArabic(val) ? formatArabicInput(val) : val)
                }}
                style={{ paddingLeft: 36, direction: rootSearch ? 'rtl' : 'ltr', fontFamily: rootSearch ? 'var(--font-arabic)' : 'inherit' }}
              />
            </div>
            <button
              className={`btn btn-sm${showKeyboard ? ' btn-primary' : ''}`}
              onClick={() => setShowKeyboard(k => !k)}
              title="Toggle Arabic keyboard"
              style={{ fontFamily: 'var(--font-arabic)', fontSize: '1.1rem', padding: '6px 14px', flexShrink: 0 }}
            >
              ع
            </button>
          </div>

          {/* Toolbar — row 2: filters + actions */}
          <div className="wordbank-toolbar">
            <select className="form-select" style={{ width: 180 }} value={filterDeck} onChange={e => setFilterDeck(e.target.value)}>
              <option value="all">All Decks</option>
              {sortedDecks.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
            <select className="form-select" style={{ width: 160 }} value={filterSRS} onChange={e => setFilterSRS(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="new">New</option>
              <option value="learning">Learning</option>
              <option value="review">Review</option>
              <option value="mastered">Mastered</option>
            </select>
            <div className="wordbank-actions" style={{ marginLeft: 'auto' }}>
              {selected.size > 0 && (
                <>
                  <button className="btn btn-secondary btn-sm" onClick={handleMarkAsKnown} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Check size={13} /> Mark as Known ({selected.size})
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => setModal('confirm-delete-words')}>
                    Delete ({selected.size})
                  </button>
                </>
              )}
              <button className="btn btn-primary btn-sm" onClick={() => setModal('add')}>
                + Add Word
              </button>
            </div>
          </div>

          {/* Arabic keyboard panel */}
          {showKeyboard && (
            <ArabicKeyboard
              onLetter={letter => {
                if (activeSearchField === 'root') {
                  if (HARAKAT_RE.test(letter)) {
                    setRootSearch(prev => {
                      const bare = prev.replace(/\s+/g, '')
                      const chars = [...bare]
                      if (chars.length > 0 && HARAKAT_RE.test(chars[chars.length - 1])) chars[chars.length - 1] = letter
                      else chars.push(letter)
                      return formatArabicInput(chars.join(''))
                    })
                  } else {
                    setRootSearch(prev => formatArabicInput(prev + letter))
                  }
                  rootSearchRef.current?.focus()
                } else {
                  if (HARAKAT_RE.test(letter)) {
                    setSearch(prev => {
                      const chars = [...prev]
                      if (chars.length > 0 && HARAKAT_RE.test(chars[chars.length - 1])) chars[chars.length - 1] = letter
                      else chars.push(letter)
                      return chars.join('')
                    })
                  } else {
                    setSearch(prev => prev + letter)
                  }
                  searchRef.current?.focus()
                }
              }}
              onBackspace={() => {
                if (activeSearchField === 'root') {
                  setRootSearch(prev => {
                    const bare = prev.replace(/\s+/g, '')
                    const trimmed = [...bare].slice(0, -1).join('')
                    return trimmed ? formatArabicInput(trimmed) : ''
                  })
                  rootSearchRef.current?.focus()
                } else {
                  setSearch(prev => [...prev].slice(0, -1).join(''))
                  searchRef.current?.focus()
                }
              }}
            />
          )}

          {/* Table */}
          <div className="wordbank-table-wrap">
          {groupedWords.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><Search size={40} strokeWidth={1.25} /></div>
              <div className="empty-state-title">No words found</div>
              <p style={{ color: 'var(--color-text-muted)', marginBottom: 16 }}>
                {words.length === 0 ? 'Add your first word to get started.' : 'Try adjusting your filters.'}
              </p>
              {words.length === 0 && (
                <button className="btn btn-primary" onClick={() => setModal('add')}>Add First Word</button>
              )}
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th className="checkbox-cell">
                      <input type="checkbox"
                        checked={selected.size > 0 && selected.size === groupedWords.length}
                        onChange={toggleSelectAll} />
                    </th>
                    <th>Arabic</th>
                    <th>English</th>
                    <th>Root</th>
                    <th>Part of Speech</th>
                    <th>Deck</th>
                    <th>
                      Status
                      <span className="srs-info-btn">
                        ?
                        <span className="srs-tooltip">
                          New — never reviewed{'\n'}
                          Learning — due within 1 day{'\n'}
                          Review — due every 2–20 days{'\n'}
                          Mastered — interval ≥ 21 days
                        </span>
                      </span>
                    </th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedWords.map(({ primary: word, allWords, bestStatus }) => {
                    const srsCard = srsMap[word.id]
                    const allIds = allWords.map(w => w.id)
                    const allSelected = selected.has(word.arabic)
                    const deckEntries = allWords.map(w => ({ id: w.id, title: decks.find(d => d.id === w.deckId)?.title || '—' }))
                    const isExpanded = expandedDeckGroups.has(word.arabic)

                    return (
                      <tr key={word.arabic} style={word.color ? { borderLeft: `3px solid ${word.color}` } : undefined}>
                        <td className="checkbox-cell">
                          <input type="checkbox"
                            checked={allSelected}
                            onChange={() => toggleSelect(word.arabic)} />
                        </td>
                        <td className="td-arabic">
                          <span style={{ color: word.color || undefined }}>{word.arabic}</span>
                          <SpeakButton text={word.arabic} />
                        </td>
                        <td>{word.english}</td>
                        <td>
                          {word.root
                            ? <button className="root-link" onClick={() => setRootModal(word.root)}>{word.root}</button>
                            : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                        </td>
                        <td>
                          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                            {word.partOfSpeech || '—'}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.82rem' }}>
                          {deckEntries.length === 1 ? (
                            <span style={{ color: 'var(--color-text-muted)' }}>{deckEntries[0].title}</span>
                          ) : (
                            <div>
                              <button
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', fontSize: '0.82rem', padding: 0, display: 'flex', alignItems: 'center', gap: 3 }}
                                onClick={() => setExpandedDeckGroups(prev => {
                                  const next = new Set(prev)
                                  next.has(word.arabic) ? next.delete(word.arabic) : next.add(word.arabic)
                                  return next
                                })}
                              >
                                {deckEntries.length} decks {isExpanded ? '▴' : '▾'}
                              </button>
                              {isExpanded && (
                                <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                  {deckEntries.map(e => (
                                    <span key={e.id} style={{ color: 'var(--color-text-muted)', paddingLeft: 4, borderLeft: '2px solid var(--color-border)' }}>
                                      {e.title}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td>
                          <StatusBadge status={bestStatus} />
                        </td>
                        <td>
                          <div className="action-icons">
                            <button className="icon-btn" title="Edit" onClick={() => setEditingWord(word)}><Pencil size={13} /></button>
                            <button className="icon-btn" title="Copy to another deck" onClick={() => setCopyWord(word)}><Copy size={13} /></button>
                            <button className="icon-btn" title="Reset SRS progress" onClick={() => handleResetWord(word.id)}><RotateCcw size={13} /></button>
                            <button className="icon-btn danger" title="Delete" onClick={() => handleDeleteWordGroup(word.arabic)}><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          </div>{/* end wordbank-table-wrap */}
        </>
      )}

      {/* ── DECKS TAB ── */}
      {activeTab === 'decks' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>{decks.length} decks</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAiPrompt(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Sparkles size={13} /> Generate with AI
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Upload size={13} /> Import JSON
              </button>
              <input
                type="file" accept=".json" ref={fileInputRef} style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files[0]
                  if (file) { await handleImportDeck(file); e.target.value = '' }
                }}
              />
              <button className="btn btn-primary btn-sm" onClick={() => setModal('deck')}>
                + New Deck
              </button>
            </div>
          </div>

          {decks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><FolderOpen size={40} strokeWidth={1.25} /></div>
              <div className="empty-state-title">No decks yet</div>
              <button className="btn btn-primary mt-3" onClick={() => setModal('deck')}>Create First Deck</button>
            </div>
          ) : (
            <div className="deck-grid">
              {sortedDecks.map(deck => (
                <div key={deck.id} className="deck-card">
                  <div>
                    <div className="deck-card-title">{deck.title}</div>
                    {deck.description && (
                      <div className="deck-card-desc">{deck.description}</div>
                    )}
                  </div>
                  <div className="deck-card-meta">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Library size={13} /> {deckWordCount[deck.id] || 0} words</span>
                    {deck.reviewFrequency ? (() => {
                      const now = new Date()
                      const nextDate = deck.nextDeckReview ? new Date(deck.nextDeckReview) : null
                      const isDue = !nextDate || nextDate <= now
                      const freqLabel = deck.reviewFrequency === 'custom'
                        ? `every ${deck.reviewIntervalDays}d`
                        : deck.reviewFrequency
                      const daysUntil = nextDate ? Math.ceil((nextDate - now) / 86400000) : 0
                      return (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.8rem', color: isDue ? 'var(--color-brand)' : 'var(--color-text-muted)' }}>
                          <RefreshCw size={11} />
                          {isDue ? `${freqLabel} · due` : `${freqLabel} · in ${daysUntil}d`}
                        </span>
                      )
                    })() : duePerDeck[deck.id] > 0 && (
                      <span className="srs-badge learning">{duePerDeck[deck.id]} due</span>
                    )}
                    {deck.isPublic && <span className="badge badge-success">Public</span>}
                    {deck.communityDeckId && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                        <Download size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> {downloadCounts[deck.communityDeckId] ?? deck.savedDownloadCount} downloads
                      </span>
                    )}
                    {!deck.communityDeckId && deck.savedDownloadCount > 0 && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                        <Download size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> {deck.savedDownloadCount} downloads
                      </span>
                    )}
                  </div>
                  <div className="deck-card-actions">
                    <Link
                      to={`/flashcards?deck=${deck.id}&mode=review`}
                      className="btn btn-primary btn-sm"
                    >
                      Study →
                    </Link>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      onClick={() => { setEditDeck(deck); setModal('edit-deck') }}
                    >
                      <Pencil size={13} /> Edit
                    </button>
                    <div style={{ position: 'relative', marginLeft: 'auto' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '4px 7px' }}
                        onClick={() => setOpenMenuDeckId(openMenuDeckId === deck.id ? null : deck.id)}
                        title="More options"
                      >
                        <MoreHorizontal size={15} />
                      </button>
                      {openMenuDeckId === deck.id && (
                        <>
                          <div
                            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                            onClick={() => setOpenMenuDeckId(null)}
                          />
                          <div className="deck-dropdown">
                            <button onClick={() => { setPrintDeck(deck); setOpenMenuDeckId(null) }}>
                              <Printer size={13} /> Print PDF
                            </button>
                            <button onClick={() => { handleExportDeck(deck); setOpenMenuDeckId(null) }}>
                              Export
                            </button>
                            {deck.isPublic ? (
                              <button onClick={() => { setConfirmDeck(deck); setModal('confirm-unshare-deck'); setOpenMenuDeckId(null) }}>
                                <Globe size={13} /> Un-share
                              </button>
                            ) : (
                              <button onClick={() => { handleUploadCommunity(deck); setOpenMenuDeckId(null) }}>
                                <Globe size={13} /> Share to community
                              </button>
                            )}
                            <button onClick={() => { setFrequencyDeck(deck); setOpenMenuDeckId(null) }}>
                              <RefreshCw size={13} /> Review schedule
                            </button>
                            <button onClick={() => { setConfirmDeck(deck); setModal('confirm-reset-deck'); setOpenMenuDeckId(null) }}>
                              Reset progress
                            </button>
                            <button
                              className="deck-dropdown-danger"
                              onClick={() => {
                                setConfirmDeck(deck)
                                setModal(deck.communityDeckId ? 'confirm-delete-shared-deck' : 'confirm-delete-deck')
                                setOpenMenuDeckId(null)
                              }}
                            >
                              Delete deck
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}


      {/* ── SENTENCES TAB ── */}
      {activeTab === 'sentences' && (
        <SentencesTab words={words} />
      )}

      {/* ── ROOTS TAB ── */}
      {activeTab === 'roots' && (
        <RootsTab
          words={words}
          sortedDecks={sortedDecks}
          currentUser={currentUser}
          onWordAdded={reload}
        />
      )}

      </div>{/* end wordbank-scroll */}

      {/* ── MODALS ── */}
      {modal === 'add' && (
        <WordModal
          mode="add"
          decks={sortedDecks}
          onSave={handleAddWord}
          onClose={() => setModal(null)}
        />
      )}

      {editingWord && (
        <WordModal
          mode="edit"
          initial={editingWord}
          decks={sortedDecks}
          hideDeck={true}
          onSave={(form) => handleEditWord(editingWord.id, form)}
          onClose={() => setEditingWord(null)}
        />
      )}

      {modal === 'deck' && (
        <DeckModal
          onSave={handleCreateDeck}
          onClose={() => setModal(null)}
        />
      )}

      {modal === 'edit-deck' && editDeck && (
        <EditDeckModal
          deck={editDeck}
          currentUser={currentUser}
          onClose={handleCloseEditDeck}
        />
      )}

      {modal === 'confirm-delete-words' && (
        <ConfirmModal
          title="Delete Selected Words"
          body={`Are you sure you want to delete ${selected.size} word${selected.size !== 1 ? 's' : ''}? This will also remove their SRS progress.`}
          onConfirm={handleDeleteSelected}
          onClose={() => setModal(null)}
        />
      )}

      {modal === 'confirm-delete-deck' && confirmDeck && (
        <ConfirmModal
          title={`Delete "${confirmDeck.title}"?`}
          body={`This will delete the deck and all ${deckWordCount[confirmDeck.id] || 0} words in it, along with all SRS progress. This cannot be undone.`}
          onConfirm={() => handleDeleteDeck(confirmDeck)}
          onClose={() => { setModal(null); setConfirmDeck(null) }}
        />
      )}

      {modal === 'confirm-delete-shared-deck' && confirmDeck && (
        <DeleteSharedDeckModal
          deck={confirmDeck}
          wordCount={deckWordCount[confirmDeck.id] || 0}
          onDeletePersonalOnly={() => handleDeleteDeckPersonalOnly(confirmDeck)}
          onDeleteEverywhere={() => handleDeleteDeckEverywhere(confirmDeck)}
          onClose={() => { setModal(null); setConfirmDeck(null) }}
        />
      )}

      {modal === 'confirm-reset-deck' && confirmDeck && (
        <ConfirmModal
          title={`Reset "${confirmDeck.title}"?`}
          body={`This will reset the SRS progress for all ${deckWordCount[confirmDeck.id] || 0} words in this deck back to "new". The words themselves won't be deleted.`}
          confirmLabel="Reset Progress"
          onConfirm={() => handleResetDeck(confirmDeck)}
          onClose={() => { setModal(null); setConfirmDeck(null) }}
        />
      )}

      {modal === 'confirm-unshare-deck' && confirmDeck && (
        <ConfirmModal
          title={`Un-share "${confirmDeck.title}"?`}
          body="This will remove the deck from Community Decks. Your download count will be saved — if you re-share it later, the count will be restored."
          confirmLabel="Un-share"
          onConfirm={async () => { await handleUnuploadCommunity(confirmDeck); setModal(null); setConfirmDeck(null) }}
          onClose={() => { setModal(null); setConfirmDeck(null) }}
        />
      )}

      {frequencyDeck && (
        <ReviewFrequencyModal
          deck={frequencyDeck}
          onSave={handleFrequencySave}
          onClose={() => setFrequencyDeck(null)}
        />
      )}

      {copyWord && (
        <CopyToDecksModal
          word={copyWord}
          decks={sortedDecks}
          onCopy={handleCopyWord}
          onClose={() => setCopyWord(null)}
        />
      )}

      {rootModal && (
        <RootDetailModal
          root={rootModal}
          words={words}
          sortedDecks={sortedDecks}
          currentUser={currentUser}
          onWordAdded={reload}
          onClose={() => setRootModal(null)}
        />
      )}

      {printDeck && (
        <PrintFlashcardsModal
          deck={printDeck}
          words={words.filter(w => w.deckId === printDeck.id)}
          srsMap={srsMap}
          onClose={() => setPrintDeck(null)}
        />
      )}

      {showAiPrompt && (
        <AiPromptModal onClose={() => setShowAiPrompt(false)} />
      )}
    </div>
  )
}
