// v2.8.0
import React from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'

export default function ResetPassword() {
  // Self-hosted backend — password reset links are not supported yet.
  // Direct users to contact admin or use the forgot-password page.
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
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, color: 'var(--color-warning)' }}>
            <AlertTriangle size={48} strokeWidth={1.25} />
          </div>
          <h1 className="auth-title">Password Reset</h1>
          <p className="auth-subtitle" style={{ marginBottom: 24 }}>
            Password reset links are not currently supported. Please contact the administrator to reset your password.
          </p>
          <Link to="/login" className="btn btn-primary" style={{ width: '100%', textAlign: 'center', display: 'block' }}>
            ← Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
