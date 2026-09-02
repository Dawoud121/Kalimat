// v2.1.0
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import ModalPortal from '../components/ModalPortal'
import {
  getContributions,
  getSentenceFlagContributions,
  getUserContributions,
  submitContribution,
  updateContribution,
  voteContribution,
  removeVote,
  getUserVotes,
  moderateContribution,
} from '../lib/dataService'
import { ThumbsUp, ThumbsDown, Check, X, Plus, AlertTriangle, Pencil } from 'lucide-react'

const ADMIN_EMAIL = 'dawoudhussein07@gmail.com'

const POS_OPTIONS = [
  '', 'verb', 'noun', 'adjective', 'adverb', 'preposition',
  'particle', 'conjunction', 'pronoun', 'proper noun', 'interjection', 'other',
]

// ── Arabic keyboard helpers ───────────────────────────────────────────────────
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

// No-space append — for actual Arabic word inputs (letters stay joined)
function appendWordLetter(prev, letter) {
  if (HARAKAT_RE.test(letter)) {
    const chars = [...prev]
    if (chars.length > 0 && HARAKAT_RE.test(chars[chars.length - 1])) {
      chars[chars.length - 1] = letter
    } else { chars.push(letter) }
    return chars.join('')
  }
  return prev + letter
}
function backspaceWord(prev) {
  return [...prev].slice(0, -1).join('')
}

// Keyboard handlers: arabic word uses no-space, root uses spaced formatArabicInput
function makeKbHandlers(activeField, setArabic, setRoot) {
  const onLetter = (letter) => {
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
    } else {
      setArabic(prev => appendWordLetter(prev, letter))
    }
  }
  const onBackspace = () => {
    if (activeField === 'root') {
      setRoot(prev => {
        const bare = prev.replace(/\s+/g, '')
        const trimmed = [...bare].slice(0, -1).join('')
        return trimmed ? formatArabicInput(trimmed) : ''
      })
    } else {
      setArabic(prev => backspaceWord(prev))
    }
  }
  return { onLetter, onBackspace }
}

const TYPE_LABELS = {
  new_word:     'New Word',
  add_form:     'Add Form',
  correct_form: 'Correction',
}
const TYPE_COLORS = {
  new_word:     'var(--color-primary)',
  add_form:     'var(--color-success)',
  correct_form: 'var(--color-warning, #d97706)',
}

// ── Submit modal ──────────────────────────────────────────────────────────────
function SubmitModal({ onClose, onSubmitted, currentUser }) {
  const [type,        setType]        = useState('new_word')
  const [arabic,      setArabic]      = useState('')
  const [def,         setDef]         = useState('')
  const [root,        setRoot]        = useState('')
  const [pos,         setPos]         = useState('')
  const [quranRef,    setQuranRef]    = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [duplicate,   setDuplicate]   = useState(false)
  const [showKb,      setShowKb]      = useState(false)
  const [activeField, setActiveField] = useState('arabic') // 'arabic' | 'root'
  const arabicRef = useRef(null)
  const rootRef   = useRef(null)

  const { onLetter, onBackspace } = makeKbHandlers(activeField, setArabic, setRoot)

  const handleSubmit = async () => {
    if (!arabic.trim()) { setError('Arabic word is required.'); return }
    if (!def.trim())    { setError('Definition is required.'); return }
    setError('')
    setSaving(true)
    try {
      const result = await submitContribution(currentUser.id, currentUser.username, {
        type,
        arabic:          arabic.trim(),
        definition:      def.trim(),
        root:            root.trim() || null,
        pos:             pos || null,
        quran_reference: quranRef.trim() || null,
      })
      if (result?.isDuplicate) {
        setDuplicate(true)
        onSubmitted()
      } else {
        onSubmitted()
        onClose()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalPortal>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Suggest a Contribution</h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        {duplicate && (
          <div style={{ padding: '12px 0', color: 'var(--color-warning, #d97706)', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={15} style={{ flexShrink: 0 }} />
            This word was already requested. Your upvote has been added to the existing request.
          </div>
        )}

        {!duplicate && <>
        <div className="form-group">
          <label className="form-label">Type</label>
          <select className="form-select" value={type} onChange={e => setType(e.target.value)}>
            <option value="new_word">New Word</option>
          </select>
          <p className="form-hint">Add Form and Correction can be submitted from the Dictionary page.</p>
        </div>

        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <label className="form-label" style={{ marginBottom: 0 }}>Arabic Word *</label>
            <button
              className={`btn btn-sm${showKb ? ' btn-primary' : ''}`}
              onClick={() => setShowKb(k => !k)}
              style={{ fontFamily: 'var(--font-arabic)', fontSize: '1rem', padding: '2px 10px' }}
              title="Toggle Arabic keyboard"
            >ع</button>
          </div>
          <input
            ref={arabicRef}
            type="text"
            className="form-input"
            value={arabic}
            onChange={e => setArabic(e.target.value)}
            onFocus={() => setActiveField('arabic')}
            placeholder="e.g. كَتَبَ"
            style={{ direction: 'rtl', fontFamily: 'var(--font-arabic)', fontSize: '1.1rem' }}
            dir="rtl"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Definition *</label>
          <input
            type="text"
            className="form-input"
            value={def}
            onChange={e => setDef(e.target.value)}
            placeholder="e.g. to write"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Root <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span></label>
          <input
            ref={rootRef}
            type="text"
            className="form-input"
            value={root}
            onChange={e => setRoot(e.target.value)}
            onFocus={() => setActiveField('root')}
            placeholder="e.g. ك ت ب"
            style={{ direction: 'rtl', fontFamily: 'var(--font-arabic)' }}
            dir="rtl"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Part of Speech <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span></label>
          <select className="form-select" value={pos} onChange={e => setPos(e.target.value)}>
            {POS_OPTIONS.map(o => (
              <option key={o} value={o}>{o === '' ? '— select —' : o.charAt(0).toUpperCase() + o.slice(1)}</option>
            ))}
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Quran Reference <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span></label>
          <input
            type="text"
            className="form-input"
            value={quranRef}
            onChange={e => setQuranRef(e.target.value)}
            placeholder="e.g. 2:255"
          />
        </div>

        {showKb && (
          <div style={{ marginTop: 12 }}>
            <ArabicKeyboard onLetter={onLetter} onBackspace={onBackspace} />
          </div>
        )}

        {error && <p className="form-error" style={{ marginTop: 8 }}>{error}</p>}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Submit'}
          </button>
        </div>
        </>}

        {duplicate && (
          <div className="modal-actions">
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
    </ModalPortal>
  )
}

// ── Moderate modal ────────────────────────────────────────────────────────────
function ModerateModal({ contribution, action, onClose, onDone, currentUser }) {
  const [note,   setNote]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const handleConfirm = async () => {
    setSaving(true)
    try {
      await moderateContribution(contribution.id, currentUser.id, currentUser.username, action, note)
      onDone()
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
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title" style={{ color: action === 'approved' ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {action === 'approved' ? 'Approve' : 'Reject'} Contribution
          </h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ marginBottom: 16, fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
          <strong style={{ fontFamily: 'var(--font-arabic)', fontSize: '1.1rem', direction: 'rtl', display: 'block', marginBottom: 4 }}>
            {contribution.arabic}
          </strong>
          {contribution.definition}
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Note <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span></label>
          <input
            type="text"
            className="form-input"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Reason or comment…"
          />
        </div>
        {error && <p className="form-error" style={{ marginTop: 8 }}>{error}</p>}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className={`btn ${action === 'approved' ? 'btn-primary' : 'btn-danger'}`}
            onClick={handleConfirm}
            disabled={saving}
          >
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : (action === 'approved' ? 'Approve' : 'Reject')}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

// ── Edit modal (for own pending contributions) ────────────────────────────────
function EditModal({ contribution, onClose, onSaved }) {
  const [arabic,      setArabic]      = useState(contribution.arabic      || '')
  const [def,         setDef]         = useState(contribution.definition  || '')
  const [root,        setRoot]        = useState(contribution.root        || '')
  const [pos,         setPos]         = useState(contribution.pos         || '')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [showKb,      setShowKb]      = useState(false)
  const [activeField, setActiveField] = useState('arabic')

  const { onLetter, onBackspace } = makeKbHandlers(activeField, setArabic, setRoot)

  const handleSave = async () => {
    if (!arabic.trim()) { setError('Arabic word is required.'); return }
    if (!def.trim())    { setError('Definition is required.'); return }
    setError('')
    setSaving(true)
    try {
      await updateContribution(contribution.id, {
        arabic:     arabic.trim(),
        definition: def.trim(),
        root:       root.trim() || null,
        pos:        pos || null,
      })
      onSaved()
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
      <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Edit Contribution</h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <label className="form-label" style={{ marginBottom: 0 }}>Arabic Word *</label>
            <button
              className={`btn btn-sm${showKb ? ' btn-primary' : ''}`}
              onClick={() => setShowKb(k => !k)}
              style={{ fontFamily: 'var(--font-arabic)', fontSize: '1rem', padding: '2px 10px' }}
              title="Toggle Arabic keyboard"
            >ع</button>
          </div>
          <input
            type="text"
            className="form-input"
            value={arabic}
            onChange={e => setArabic(e.target.value)}
            onFocus={() => setActiveField('arabic')}
            placeholder="e.g. كَتَبَ"
            style={{ direction: 'rtl', fontFamily: 'var(--font-arabic)', fontSize: '1.1rem' }}
            dir="rtl"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Definition *</label>
          <input
            type="text"
            className="form-input"
            value={def}
            onChange={e => setDef(e.target.value)}
            placeholder="e.g. to write"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Root <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span></label>
          <input
            type="text"
            className="form-input"
            value={root}
            onChange={e => setRoot(e.target.value)}
            onFocus={() => setActiveField('root')}
            placeholder="e.g. ك ت ب"
            style={{ direction: 'rtl', fontFamily: 'var(--font-arabic)' }}
            dir="rtl"
          />
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
            <ArabicKeyboard onLetter={onLetter} onBackspace={onBackspace} />
          </div>
        )}

        {error && <p className="form-error" style={{ marginTop: 8 }}>{error}</p>}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Save'}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

const STATUS_COLORS = {
  pending:            { color: 'var(--color-text-muted)',  bg: 'var(--color-surface-elevated)' },
  community_verified: { color: 'var(--color-primary)',     bg: 'transparent' },
  approved:           { color: 'var(--color-success)',     bg: 'transparent' },
  rejected:           { color: 'var(--color-danger)',      bg: 'transparent' },
}

// ── Contribution card ─────────────────────────────────────────────────────────
function ContributionCard({ contribution, userVote, onVote, onModerate, onEdit, isAdmin, currentUserId, showStatus }) {
  const score   = contribution.vote_score || 0
  const isOwn   = contribution.submitted_by === currentUserId
  const canVote = !isOwn && contribution.status === 'pending'
  const canEdit = isOwn && contribution.status === 'pending'
  const canModerate = isAdmin && (contribution.status === 'pending' || contribution.status === 'community_verified')

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      padding: '14px 16px',
    }}>
      {/* Top row: word + badges + admin actions */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-arabic)', fontSize: '1.25rem', direction: 'rtl', color: 'var(--color-text)' }}>
              {contribution.arabic}
            </span>
            <span className="srs-badge" style={{ background: 'transparent', border: `1px solid ${TYPE_COLORS[contribution.type]}`, color: TYPE_COLORS[contribution.type], fontSize: '0.72rem' }}>
              {TYPE_LABELS[contribution.type]}
            </span>
            {showStatus && (
              <span className="srs-badge" style={{ background: STATUS_COLORS[contribution.status]?.bg, border: `1px solid ${STATUS_COLORS[contribution.status]?.color}`, color: STATUS_COLORS[contribution.status]?.color, fontSize: '0.72rem' }}>
                {contribution.status}
              </span>
            )}
            {contribution.pos && (
              <span className="srs-badge" style={{ background: 'var(--color-surface-elevated)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', fontSize: '0.72rem' }}>
                {contribution.pos}
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.9rem', color: 'var(--color-text)', marginBottom: 3 }}>{contribution.definition}</div>
          {contribution.root && (
            <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>Root: <span style={{ fontFamily: 'var(--font-arabic)', direction: 'rtl' }}>{contribution.root}</span></div>
          )}
          {contribution.quran_reference && (
            <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
              Quran: <strong>{contribution.quran_reference}</strong>
            </div>
          )}
        </div>

        {/* Admin actions (approve / reject) */}
        {canModerate && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              className="btn btn-sm btn-primary"
              style={{ padding: '4px 10px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              onClick={() => onModerate(contribution, 'approved')}
            >
              <Check size={13} /> Approve
            </button>
            <button
              className="btn btn-sm btn-danger"
              style={{ padding: '4px 10px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              onClick={() => onModerate(contribution, 'rejected')}
            >
              <X size={13} /> Reject
            </button>
          </div>
        )}
      </div>

      {/* Moderator note — shown on rejected submissions */}
      {contribution.moderator_note && contribution.status === 'rejected' && (
        <div style={{
          marginTop: 10,
          padding: '8px 12px',
          borderLeft: '3px solid var(--color-danger)',
          background: 'var(--color-danger-bg)',
          borderRadius: '0 var(--radius) var(--radius) 0',
          fontSize: '0.83rem',
          color: 'var(--color-danger)',
        }}>
          <strong>Moderator note:</strong> {contribution.moderator_note}
        </div>
      )}

      {/* Bottom row: submitter meta + vote controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
          <span>
            <strong>{contribution.submitter_username || 'Anonymous'}</strong>
            {' · '}{new Date(contribution.created_at).toLocaleDateString()}
          </span>
          {canEdit && (
            <button
              className="btn btn-sm btn-secondary"
              style={{ padding: '2px 8px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              onClick={() => onEdit(contribution)}
            >
              <Pencil size={12} /> Edit
            </button>
          )}
        </div>

        {/* Vote controls */}
        {canVote ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <button
              className="btn btn-sm"
              style={{ padding: '3px 7px', color: userVote === 1 ? 'var(--color-primary)' : 'var(--color-text-muted)' }}
              onClick={() => onVote(contribution, 1)}
              title="Upvote"
            >
              <ThumbsUp size={13} />
            </button>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, minWidth: 18, textAlign: 'center', color: score > 0 ? 'var(--color-success)' : score < 0 ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
              {score}
            </span>
            <button
              className="btn btn-sm"
              style={{ padding: '3px 7px', color: userVote === -1 ? 'var(--color-danger)' : 'var(--color-text-muted)' }}
              onClick={() => onVote(contribution, -1)}
              title="Downvote"
            >
              <ThumbsDown size={13} />
            </button>
          </div>
        ) : (
          score !== 0 && (
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: score > 0 ? 'var(--color-success)' : 'var(--color-danger)', flexShrink: 0 }}>
              {score > 0 ? '+' : ''}{score}
            </span>
          )
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Contributions() {
  const { currentUser } = useAuth()
  const isAdmin = currentUser?.email === ADMIN_EMAIL
  const [searchParams] = useSearchParams()
  const section = searchParams.get('section') || 'pending'

  const [items,      setItems]      = useState([])
  const [userVotes,  setUserVotes]  = useState({})
  const [loading,    setLoading]    = useState(true)
  const [showSubmit, setShowSubmit] = useState(false)
  const [modTarget,  setModTarget]  = useState(null)
  const [editTarget, setEditTarget] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let list = []

      if (section === 'pending') {
        // All community pending (excluding sentence flags)
        const raw = await getContributions({ status: 'pending' })
        list = raw.filter(c => c.source !== 'sentence_flag')
      } else if (section === 'approved') {
        // All community approved (excluding sentence flags and gemini)
        const raw = await getContributions({ status: 'approved' })
        list = raw.filter(c => c.source !== 'sentence_flag' && c.source !== 'gemini')
      } else if (section === 'submissions') {
        // User's own contributions at any status
        list = currentUser ? await getUserContributions(currentUser.id) : []
      } else if (section === 'gemini' && isAdmin) {
        // Admin-only: Gemini AI-added words
        const raw = await getContributions({ status: 'approved' })
        list = raw.filter(c => c.source === 'gemini')
      } else if (section === 'flagged' && isAdmin) {
        // Admin-only: sentence-flagged unknown words
        list = await getSentenceFlagContributions()
      }

      setItems(list)

      if (currentUser && list.length > 0) {
        const votes = await getUserVotes(currentUser.id, list.map(c => c.id))
        setUserVotes(votes)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [section, currentUser, isAdmin])

  useEffect(() => { load() }, [load])

  const handleVote = async (contribution, vote) => {
    if (!currentUser) return
    const existing = userVotes[contribution.id]
    try {
      if (existing === vote) {
        const newScore = await removeVote(currentUser.id, contribution.id)
        setUserVotes(prev => { const n = { ...prev }; delete n[contribution.id]; return n })
        setItems(prev => prev.map(c => c.id === contribution.id ? { ...c, vote_score: newScore } : c))
      } else {
        const newScore = await voteContribution(currentUser.id, contribution.id, vote)
        setUserVotes(prev => ({ ...prev, [contribution.id]: vote }))
        setItems(prev => prev.map(c => c.id === contribution.id ? { ...c, vote_score: newScore } : c))
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleModerate = (contribution, action) => setModTarget({ contribution, action })
  const handleEdit     = (contribution) => setEditTarget(contribution)

  const EMPTY_MESSAGES = {
    pending:     'No pending contributions from the community',
    approved:    'No approved contributions yet',
    submissions: "You haven't submitted anything yet",
    flagged:     'No flagged words',
  }

  return (
    <div className="page-container" style={{ maxWidth: 720 }}>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 className="page-title">
            {section === 'pending'     && 'Pending'}
            {section === 'approved'    && 'Approved'}
            {section === 'submissions' && 'My Submissions'}
            {section === 'gemini'      && 'Gemini Words'}
            {section === 'flagged'     && 'Flagged Words'}
          </h1>
          <p className="page-subtitle">
            {section === 'pending'     && 'Community word suggestions awaiting review'}
            {section === 'approved'    && 'Words approved and added to the dictionary'}
            {section === 'submissions' && 'All contributions you have submitted'}
            {section === 'gemini'      && 'Words added to decks via AI notebook analysis'}
            {section === 'flagged'     && 'Unknown words flagged from sentence approvals'}
          </p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowSubmit(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', flexShrink: 0, marginTop: 4 }}
        >
          <Plus size={13} /> Suggest Word
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-muted)', padding: '24px 0' }}>
          <span className="spinner" style={{ width: 16, height: 16 }} /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state" style={{ padding: '48px 0' }}>
          <div className="empty-state-title">{EMPTY_MESSAGES[section] || 'Nothing here yet'}</div>
          {section === 'submissions' && (
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setShowSubmit(true)}>
              Suggest a Word
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(c => (
            <ContributionCard
              key={c.id}
              contribution={c}
              userVote={userVotes[c.id]}
              onVote={handleVote}
              onModerate={handleModerate}
              onEdit={handleEdit}
              isAdmin={isAdmin}
              currentUserId={currentUser?.id}
              showStatus={section === 'submissions'}
            />
          ))}
        </div>
      )}

      {showSubmit && (
        <SubmitModal
          currentUser={currentUser}
          onClose={() => setShowSubmit(false)}
          onSubmitted={load}
        />
      )}

      {modTarget && (
        <ModerateModal
          contribution={modTarget.contribution}
          action={modTarget.action}
          currentUser={currentUser}
          onClose={() => setModTarget(null)}
          onDone={load}
        />
      )}

      {editTarget && (
        <EditModal
          contribution={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
