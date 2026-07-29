// v2.8.0
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail } from 'lucide-react'

export default function ForgotPassword() {
  const [email,   setEmail]   = useState('')
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email.trim()) { setError('Please enter your email address.'); return }

    // Self-hosted backend — no automated email reset yet.
    // Show a message directing the user to contact the admin.
    setLoading(true)
    setTimeout(() => {
      setSent(true)
      setLoading(false)
    }, 500)
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-logo">
          <div className="auth-logo-title">Kalimat</div>
          <span className="auth-logo-arabic">كلمات</span>
          <p style={{ marginTop: 8, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            Your Arabic learning companion
          </p>
        </div>

        <div className="auth-card">
          {sent ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, color: 'var(--color-primary)' }}><Mail size={48} strokeWidth={1.25} /></div>
              <h1 className="auth-title">Password Reset</h1>
              <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', marginBottom: 24 }}>
                Please contact the administrator to reset your password for <strong>{email}</strong>.
              </p>
              <Link to="/login" className="btn btn-ghost" style={{ width: '100%', textAlign: 'center' }}>
                ← Back to sign in
              </Link>
            </>
          ) : (
            <>
              <h1 className="auth-title">Forgot password?</h1>
              <p className="auth-subtitle">Enter your email to request a password reset.</p>

              {error && <div className="alert alert-danger">{error}</div>}

              <form onSubmit={handleSubmit} noValidate>
                <div className="form-group">
                  <label className="form-label" htmlFor="email">Email address</label>
                  <input
                    id="email"
                    type="email"
                    className="form-input"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="email"
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: 4 }}
                  disabled={loading}
                >
                  {loading
                    ? <span className="spinner" style={{ width: 16, height: 16 }} />
                    : 'Request reset'}
                </button>
              </form>

              <div className="auth-footer">
                <Link to="/login">← Back to sign in</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
