// v2.9.0
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import ModalPortal from '../components/ModalPortal'
import { applyTheme } from '../App'
import { submitFeedback } from '../lib/dataService'
import { X, AlertTriangle, Check, Sun, Moon, Monitor, Info, LogOut, MessageSquare } from 'lucide-react'
const APP_VERSION = '2.9.0'

const FEEDBACK_TYPES = [
  { value: 'bug',     label: 'Bug Report' },
  { value: 'feature', label: 'Feature Request' },
  { value: 'other',   label: 'Other' },
]

function FeedbackSection({ user }) {
  const [type,        setType]        = useState('bug')
  const [message,     setMessage]     = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [success,     setSuccess]     = useState(false)
  const [error,       setError]       = useState('')

  const handleSubmit = async () => {
    if (!message.trim()) { setError('Please describe the issue or request.'); return }
    setError('')
    setSubmitting(true)
    try {
      await submitFeedback(user.id, user.email, type, message.trim())
      setSuccess(true)
      setMessage('')
      setTimeout(() => setSuccess(false), 4000)
    } catch (err) {
      setError(err.message || 'Failed to submit. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="settings-section">
      <div className="settings-section-title">Feedback</div>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: 14 }}>
        Found a bug or have an idea? Let us know and we'll look into it.
      </p>

      {/* Type selector */}
      <div className="form-group">
        <label className="form-label">Type</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {FEEDBACK_TYPES.map(t => (
            <button
              key={t.value}
              className={`theme-option${type === t.value ? ' active' : ''}`}
              onClick={() => setType(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Message */}
      <div className="form-group">
        <label className="form-label">
          {type === 'bug' ? 'Describe the bug — what happened and what you expected' :
           type === 'feature' ? 'Describe the feature you\'d like to see' :
           'Your message'}
        </label>
        <textarea
          className="form-input"
          rows={4}
          value={message}
          onChange={e => { setMessage(e.target.value); setError('') }}
          placeholder={
            type === 'bug'     ? 'e.g. When I click X, Y happens instead of Z…' :
            type === 'feature' ? 'e.g. It would be great if the app could…' :
            'Write your message here…'
          }
          style={{ resize: 'vertical', minHeight: 90, borderRadius: 'var(--radius-md)' }}
        />
        {error && <p className="form-error">{error}</p>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
          {submitting ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <><MessageSquare size={13} /> Submit</>}
        </button>
        {success && (
          <span style={{ fontSize: '0.82rem', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Check size={13} /> Submitted — thanks!
          </span>
        )}
      </div>
    </div>
  )
}

function ConfirmDeleteModal({ onConfirm, onClose }) {
  const [input, setInput] = useState('')
  const ready = input === 'DELETE'

  return (
    <ModalPortal>
      <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title" style={{ color: 'var(--color-danger)' }}>Delete Account</h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} style={{ flexShrink: 0 }} /> This action is <strong>permanent</strong>. All your words, decks, and SRS progress will be deleted.
        </div>
        <div className="form-group">
          <label className="form-label">Type <strong>DELETE</strong> to confirm:</label>
          <input
            type="text"
            className="form-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="DELETE"
            autoFocus
          />
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" disabled={!ready} onClick={onConfirm}>
            Delete My Account
          </button>
        </div>
      </div>
      </div>
    </ModalPortal>
  )
}

export default function Settings() {
  const { currentUser, updateUser, logout, deleteAccount } = useAuth()
  const navigate = useNavigate()

  const [displayName, setDisplayName] = useState(currentUser?.username || '')
  const [nameSuccess, setNameSuccess] = useState(false)
  const [nameError, setNameError] = useState('')
  const [savingName, setSavingName] = useState(false)

  const savedTheme = localStorage.getItem('kalimat_theme') || 'system'
  const [theme, setTheme] = useState(savedTheme)

  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const handleSaveName = async () => {
    const name = displayName.trim()
    if (!name) { setNameError('Username cannot be empty.'); return }
    if (name.length < 2) { setNameError('Username must be at least 2 characters.'); return }
    setNameError('')
    setSavingName(true)
    try {
      await updateUser({ username: name })
      setNameSuccess(true)
      setTimeout(() => setNameSuccess(false), 3000)
    } catch (err) {
      setNameError(err.message)
    } finally {
      setSavingName(false)
    }
  }

  const handleThemeChange = (t) => {
    setTheme(t)
    localStorage.setItem('kalimat_theme', t)
    applyTheme(t)
  }

  const handleDeleteAccount = async () => {
    await deleteAccount()
    navigate('/login', { replace: true })
  }

  return (
    <div className="page-container" style={{ maxWidth: 680 }}>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Manage your account and preferences</p>
      </div>

      {/* Profile section */}
      <div className="settings-section">
        <div className="settings-section-title">Profile</div>

        <div className="form-group">
          <label className="form-label">Display Name</label>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              className="form-input"
              value={displayName}
              onChange={e => { setDisplayName(e.target.value); setNameSuccess(false) }}
              style={{ flex: 1 }}
              placeholder="Your name"
            />
            <button className="btn btn-primary" onClick={handleSaveName} disabled={savingName}>
              {savingName ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Save'}
            </button>
          </div>
          {nameError && <p className="form-error">{nameError}</p>}
          {nameSuccess && <p style={{ color: 'var(--color-success)', fontSize: '0.8rem', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}><Check size={13} /> Name updated!</p>}
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Email Address</label>
          <input
            type="email"
            className="form-input"
            value={currentUser?.email || ''}
            readOnly
            style={{ opacity: 0.7, cursor: 'default' }}
          />
          <p className="form-hint">Email changes are managed through Supabase Auth.</p>
        </div>
      </div>

      {/* Theme section */}
      <div className="settings-section">
        <div className="settings-section-title">Appearance</div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Theme</label>
          <div className="theme-options">
            {[
              { value: 'light',  label: 'Light',  icon: <Sun  size={15} /> },
              { value: 'dark',   label: 'Dark',   icon: <Moon size={15} /> },
              { value: 'system', label: 'System', icon: <Monitor size={15} /> },
            ].map(opt => (
              <button
                key={opt.value}
                className={`theme-option${theme === opt.value ? ' active' : ''}`}
                onClick={() => handleThemeChange(opt.value)}
              >
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>
          <p className="form-hint mt-2">
            {theme === 'system' ? 'Follows your operating system preference.' :
             theme === 'dark'   ? 'Dark mode is active.' : 'Light mode is active.'}
          </p>
        </div>
      </div>

      {/* Study preferences */}
      <div className="settings-section">
        <div className="settings-section-title">Study</div>
        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          <div style={{ marginBottom: 8 }}>
            <strong>SRS Algorithm:</strong> SM-2 (Supermemo)
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong>Review schedule:</strong> Cards are scheduled based on your rating — Hard (resets to 1 day), Easy (advances: 1d → 6d → scaled by ease factor).
          </div>
          <div>
            <strong>Keyboard shortcuts:</strong> Space/Enter to flip card · 1=Hard · 2=Easy
          </div>
        </div>
      </div>

      {/* Data section */}
      <div className="settings-section">
        <div className="settings-section-title">Data & Storage</div>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.88rem', marginBottom: 12 }}>
          All data is stored in Supabase (PostgreSQL). Your data is synced across devices when you sign in.
        </p>
        <div style={{ background: 'var(--color-info-bg)', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: '0.85rem', color: 'var(--color-info)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Info size={15} style={{ flexShrink: 0 }} /> To back up your decks, use the <strong>Export</strong> feature in Word Bank → Decks.
        </div>
      </div>


      {/* About section */}
      <div className="settings-section">
        <div className="settings-section-title">About Kalimat</div>
        <div style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', lineHeight: 1.8 }}>
          <div><strong>Version:</strong> {APP_VERSION}</div>
          <div><strong>Purpose:</strong> Arabic vocabulary learning using spaced repetition</div>
          <div><strong>Algorithm:</strong> SM-2 (SuperMemo 2)</div>
          <div><strong>Storage:</strong> Supabase (PostgreSQL)</div>
          <div style={{ marginTop: 12, fontFamily: 'var(--font-arabic)', direction: 'rtl', fontSize: '1.1rem', color: 'var(--color-primary)' }}>
            كلمات — words
          </div>
        </div>
      </div>

      {/* Feedback */}
      <FeedbackSection user={currentUser} />

      {/* Danger zone */}
      <div className="settings-section" style={{ borderColor: 'var(--color-danger)', background: 'var(--color-danger-bg)' }}>
        <div className="settings-section-title" style={{ color: 'var(--color-danger)', borderBottomColor: 'var(--color-danger)' }}>
          Danger Zone
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Delete Account</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              Permanently delete your account and all associated data.
            </div>
          </div>
          <button className="btn btn-danger" onClick={() => setShowDeleteModal(true)}>
            Delete Account
          </button>
        </div>
      </div>

      {/* Logout */}
      <div style={{ marginTop: 8, textAlign: 'center' }}>
        <button
          className="btn btn-secondary"
          onClick={() => { logout(); navigate('/login') }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <LogOut size={15} /> Log out
        </button>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <ConfirmDeleteModal
          onConfirm={handleDeleteAccount}
          onClose={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  )
}
