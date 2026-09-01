// v2.0.9
import React, { useState, useEffect } from 'react'
import { Outlet, Link, useLocation, useSearchParams } from 'react-router-dom'
import { WifiOff } from 'lucide-react'
import Sidebar from './Sidebar'
import { useAuth } from '../auth/AuthContext'

const ADMIN_EMAIL = 'dawoudhussein07@gmail.com'

// Routes that get a secondary sidebar
const SECONDARY_SIDEBAR_ROUTES = ['/contributions', '/decks', '/word-bank', '/admin', '/stories', '/stats']

const SECONDARY_SIDEBAR_CONFIG = {
  '/contributions': {
    title: 'Contributions',
    groups: [
      {
        label: 'COMMUNITY',
        items: [
          { key: 'pending',     label: 'Pending' },
          { key: 'approved',    label: 'Approved' },
        ],
      },
      {
        label: 'MINE',
        items: [
          { key: 'submissions', label: 'Submissions' },
        ],
      },
    ],
    adminGroups: [
      {
        label: 'MODERATION',
        items: [
          { key: 'flagged', label: 'Flagged Words' },
        ],
      },
    ],
  },
  '/decks': {
    title: 'Decks',
    defaultSection: 'my-decks',
    groups: [
      {
        label: 'MINE',
        items: [
          { key: 'my-decks', label: 'My Decks' },
          { key: 'uploads',  label: 'My Uploads' },
        ],
      },
      {
        label: 'BROWSE',
        items: [
          { key: 'team',   label: 'Kalimat Team' },
          { key: 'browse', label: 'Browse All' },
        ],
      },
    ],
  },
  '/word-bank': {
    title: 'Word Bank',
    defaultSection: 'words',
    groups: [
      {
        label: 'LIBRARY',
        items: [
          { key: 'words', label: 'Words' },
          { key: 'roots', label: 'Roots' },
        ],
      },
      {
        label: 'STUDY',
        items: [
          { key: 'sentences', label: 'Sentences' },
        ],
      },
    ],
  },
  '/admin': {
    title: 'Admin',
    defaultSection: 'overview',
    groups: [
      {
        label: 'ANALYTICS',
        items: [
          { key: 'overview',    label: 'Overview' },
          { key: 'users',       label: 'Users' },
          { key: 'engagement',  label: 'Engagement' },
          { key: 'content',     label: 'Content' },
        ],
      },
      {
        label: 'COMMUNITY',
        items: [
          { key: 'moderation', label: 'Moderation' },
          { key: 'feedback',   label: 'Feedback' },
        ],
      },
    ],
  },
  '/stories': {
    title: 'Stories',
    defaultSection: 'all',
    groups: [
      {
        label: 'BROWSE',
        items: [
          { key: 'all',    label: 'All Stories' },
          { key: 'hadith', label: 'Hadith' },
        ],
      },
    ],
  },
  '/stats': {
    title: 'Statistics',
    defaultSection: 'overview',
    groups: [
      {
        label: 'STATS',
        items: [
          { key: 'overview',      label: 'Overview' },
          { key: 'activity',      label: 'Activity' },
          { key: 'vocabulary',    label: 'Vocabulary' },
          { key: 'contributions', label: 'Contributions' },
        ],
      },
    ],
  },
}

function SecondarySidebar({ config, isAdmin }) {
  const [searchParams] = useSearchParams()
  const activeSection = searchParams.get('section') || config.defaultSection || 'pending'

  const groups = [
    ...config.groups,
    ...(isAdmin ? (config.adminGroups || []) : []),
  ]

  return (
    <div className="secondary-sidebar">
      {/* Page title */}
      <div className="secondary-sidebar-header">
        <div className="secondary-sidebar-title">{config.title}</div>
      </div>

      {/* Groups with dividers between them */}
      <div className="secondary-sidebar-nav">
        {groups.map((group, i) => (
          <React.Fragment key={group.label}>
            {i > 0 && <div className="sidebar-divider" style={{ margin: '4px 0' }} />}
            <div className="secondary-sidebar-group">
              <div className="secondary-sidebar-group-label">{group.label}</div>
              {group.items.map(item => (
                <Link
                  key={item.key}
                  to={`?section=${item.key}`}
                  replace
                  className={`secondary-sidebar-item${activeSection === item.key ? ' active' : ''}`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const goOnline  = () => setIsOffline(false)
    const goOffline = () => setIsOffline(true)
    window.addEventListener('online',  goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online',  goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div className="offline-banner">
      <WifiOff size={13} />
      Offline — studying from local cache. Ratings will sync when you reconnect.
    </div>
  )
}

function GuestBanner() {
  const { isGuest } = useAuth()
  if (!isGuest) return null
  return (
    <div className="guest-banner">
      <span>You're browsing as a guest — progress will be lost if you leave or refresh.</span>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <Link to="/register" className="btn btn-primary btn-sm">Create Account</Link>
        <Link to="/login" className="btn btn-ghost btn-sm">Log In</Link>
      </div>
    </div>
  )
}

export default function Layout() {
  const { currentUser } = useAuth()
  const location = useLocation()
  const isAdmin = currentUser?.email === ADMIN_EMAIL

  const hasSecondary = SECONDARY_SIDEBAR_ROUTES.some(r => location.pathname === r || location.pathname.startsWith(r + '/'))
  const secondaryConfig = hasSecondary
    ? SECONDARY_SIDEBAR_CONFIG[SECONDARY_SIDEBAR_ROUTES.find(r => location.pathname === r || location.pathname.startsWith(r + '/'))]
    : null

  // Apply body class for CSS margin adjustment
  useEffect(() => {
    if (hasSecondary) {
      document.body.classList.add('has-secondary-sidebar')
    } else {
      document.body.classList.remove('has-secondary-sidebar')
    }
    return () => document.body.classList.remove('has-secondary-sidebar')
  }, [hasSecondary])

  return (
    <div className="app-layout">
      <Sidebar />
      {hasSecondary && secondaryConfig && (
        <SecondarySidebar config={secondaryConfig} isAdmin={isAdmin} />
      )}
      <div className="main-wrapper">
        <GuestBanner />
        <main className="main-content">
          <OfflineBanner />
          <Outlet />
        </main>
      </div>
    </div>
  )
}
