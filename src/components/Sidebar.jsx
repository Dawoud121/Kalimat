// v2.0.9
import React, { useState, useEffect, useRef } from 'react'
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getProfile } from '../lib/dataService'
import {
  LayoutDashboard,
  CreditCard,
  BookMarked,
  BookOpenText,
  Library,
  Gamepad2,
  BarChart2,
  Settings,
  LogOut,
  Star,
  X,
  ShieldCheck,
  ScrollText,
  FolderOpen,
  PenLine,
} from 'lucide-react'

const ADMIN_EMAIL = 'dawoudhussein07@gmail.com'

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Home',            path: '/dashboard' },
  { divider: true },
  { icon: CreditCard,      label: 'Flashcards',      path: '/flashcards' },
  { icon: PenLine,         label: 'Notebook',         path: '/notebook' },
  { icon: Gamepad2,        label: 'Games',            path: '/games' },
  { divider: true },
  { icon: BookMarked,      label: 'Word Bank',        path: '/word-bank' },
  { icon: FolderOpen,      label: 'Decks',            path: '/decks' },
  { icon: Library,         label: 'Dictionary',       path: '/dictionary' },
  { divider: true },
  { icon: BookOpenText,    label: 'Quranic Lexicon',  mobileLabel: 'Quran',     path: '/quran' },
  { icon: ScrollText,      label: 'Stories',          path: '/stories' },
  { divider: true },
  { icon: BarChart2,       label: 'Statistics',       mobileLabel: 'Stats',     path: '/stats' },
  { icon: Settings,        label: 'Settings',         path: '/settings' },
]

function trustTier(score) {
  if (score >= 15) return { label: 'Trusted',     color: 'var(--color-brand)' }
  if (score >= 5)  return { label: 'Contributor', color: 'var(--color-warning)' }
  return              { label: 'Newcomer',    color: 'var(--color-text-muted)' }
}

export default function Sidebar() {
  const { currentUser, logout, isGuest } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [profileOpen, setProfileOpen] = useState(false)
  const [trustScore,  setTrustScore]  = useState(null)
  const popoverRef = useRef(null)

  // Fetch trust score whenever user changes
  useEffect(() => {
    if (!currentUser) return
    getProfile(currentUser.id)
      .then(p => setTrustScore(p?.trust_score ?? 0))
      .catch(() => setTrustScore(0))
  }, [currentUser])

  // Close popover on outside click
  useEffect(() => {
    if (!profileOpen) return
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [profileOpen])

  const handleLogout = () => {
    setProfileOpen(false)
    logout()
    navigate('/login')
  }

  const initials = currentUser?.username
    ? currentUser.username.slice(0, 2).toUpperCase()
    : '?'

  const tier = trustTier(trustScore ?? 0)

  return (
    <aside className="sidebar" onMouseLeave={() => setProfileOpen(false)}>

      {/* Logo */}
      <div className="sidebar-logo">
        <img src="/icon-192.png" alt="Kalimat" className="sidebar-logo-icon" />
        <div className="sidebar-logo-text">
          <div className="sidebar-logo-title">Kalimat</div>
          <span className="sidebar-logo-arabic">كلمات</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item, i) => {
          if (item.divider) {
            return <div key={`divider-${i}`} className="sidebar-divider" />
          }
          const Icon = item.icon
          const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/')
          return (
            <NavLink
              key={item.path}
              to={item.path}
              title={item.label}
              className={`sidebar-nav-item${isActive ? ' active' : ''}${item.mobileHide ? ' mobile-hide' : ''}`}
            >
              <Icon size={18} strokeWidth={1.75} className="nav-icon" />
              {item.mobileLabel ? (
                <>
                  <span className="nav-label mobile-full-label">{item.label}</span>
                  <span className="nav-label mobile-short-label">{item.mobileLabel}</span>
                </>
              ) : (
                <span className="nav-label">{item.label}</span>
              )}
            </NavLink>
          )
        })}

        {/* Admin-only link */}
        {currentUser?.email === ADMIN_EMAIL && (() => {
          const isActive = location.pathname === '/admin'
          return (
            <>
              <div className="sidebar-divider" />
              <NavLink
                to="/admin"
                title="Admin"
                className={`sidebar-nav-item admin-nav-item${isActive ? ' active' : ''}`}
              >
                <ShieldCheck size={18} strokeWidth={1.75} className="nav-icon" />
                <span className="nav-label">Admin</span>
              </NavLink>
            </>
          )
        })()}
      </nav>

      {/* Guest footer */}
      {isGuest && (
        <div className="sidebar-footer" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Link to="/register" className="btn btn-primary btn-sm" style={{ textAlign: 'center' }}>
            Create Account
          </Link>
          <Link to="/login" className="btn btn-ghost btn-sm" style={{ textAlign: 'center' }}>
            Log In
          </Link>
        </div>
      )}

      {/* Footer with profile popover */}
      {!isGuest && (
        <div className="sidebar-footer" ref={popoverRef} style={{ position: 'relative' }}>

          {/* Profile popover */}
          {profileOpen && (
            <div className="profile-popover">
              <button className="profile-popover-close" onClick={() => setProfileOpen(false)}>
                <X size={14} />
              </button>

              <div className="profile-popover-avatar">{initials}</div>
              <div className="profile-popover-name">{currentUser?.username}</div>
              <div className="profile-popover-email">{currentUser?.email}</div>

              <div className="profile-popover-trust" style={{ color: tier.color }}>
                <Star size={13} />
                <span>Trust Score: <strong>{trustScore ?? '—'}</strong></span>
                <span className="profile-trust-tier">{tier.label}</span>
              </div>

              <div className="profile-popover-actions">
                <NavLink
                  to="/settings"
                  className="btn btn-secondary btn-sm"
                  style={{ textAlign: 'center' }}
                  onClick={() => setProfileOpen(false)}
                >
                  <Settings size={13} /> Settings
                </NavLink>
                <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
                  <LogOut size={13} /> Log out
                </button>
              </div>
            </div>
          )}

          {/* Clickable user row */}
          <button
            className="sidebar-user"
            style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}
            onClick={() => setProfileOpen(p => !p)}
            title={currentUser?.username}
          >
            <div className="sidebar-user-avatar">{initials}</div>
            <div className="sidebar-user-name">{currentUser?.username}</div>
          </button>

          <button
            className="sidebar-logout-btn"
            onClick={handleLogout}
            title="Log out"
          >
            <LogOut size={16} strokeWidth={1.75} />
            <span className="nav-label">Log out</span>
          </button>
        </div>
      )}

    </aside>
  )
}
