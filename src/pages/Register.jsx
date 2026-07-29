import React, { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export default function Register() {
  const { register, currentUser } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [globalError, setGlobalError] = useState('')

  if (currentUser) return <Navigate to="/dashboard" replace />

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  const validate = () => {
    const errs = {}
    if (!form.username.trim())                errs.username = 'Username is required.'
    else if (form.username.trim().length < 2) errs.username = 'Username must be at least 2 characters.'
    else if (form.username.trim().length > 30) errs.username = 'Username must be 30 characters or fewer.'
    if (!form.email.trim())             errs.email = 'Email is required.'
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Enter a valid email address.'
    if (!form.password)                 errs.password = 'Password is required.'
    else if (form.password.length < 6)  errs.password = 'Password must be at least 6 characters.'
    if (!form.confirm)                  errs.confirm = 'Please confirm your password.'
    else if (form.confirm !== form.password) errs.confirm = 'Passwords do not match.'
    return errs
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setGlobalError('')
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setLoading(true)
    try {
      await register(form.username.trim(), form.email.trim(), form.password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setGlobalError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-container" style={{ maxWidth: 460 }}>
        <div className="auth-logo">
          <div className="auth-logo-title">Kalimat</div>
          <span className="auth-logo-arabic">كلمات</span>
        </div>

        <div className="auth-card">
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-subtitle">Start your Arabic learning journey today</p>

          {globalError && <div className="alert alert-danger">{globalError}</div>}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                className="form-input"
                placeholder="e.g. Ahmad"
                value={form.username}
                onChange={set('username')}
                autoComplete="username"
                autoFocus
              />
              {errors.username && <p className="form-error">{errors.username}</p>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                className="form-input"
                placeholder="you@example.com"
                value={form.email}
                onChange={set('email')}
                autoComplete="email"
              />
              {errors.email && <p className="form-error">{errors.email}</p>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="form-input"
                placeholder="At least 6 characters"
                value={form.password}
                onChange={set('password')}
                autoComplete="new-password"
              />
              {errors.password && <p className="form-error">{errors.password}</p>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="confirm">Confirm password</label>
              <input
                id="confirm"
                type="password"
                className="form-input"
                placeholder="Re-enter password"
                value={form.confirm}
                onChange={set('confirm')}
                autoComplete="new-password"
              />
              {errors.confirm && <p className="form-error">{errors.confirm}</p>}
            </div>

            <div style={{ background: 'var(--color-info-bg)', borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem', color: 'var(--color-info)' }}>
              After signing up, visit Community Decks to import free Bayna Yadayk vocabulary packs.
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={loading}
            >
              {loading
                ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Setting up your account…</>
                : 'Create account'}
            </button>
          </form>

          <div className="auth-footer">
            Already have an account?{' '}
            <Link to="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
