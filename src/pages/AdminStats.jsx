// v2.2.0
import React, { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { api } from '../lib/api'
import {
  getAdminUsersList,
  getAdminAppSessions,
  getAdminEngagementStats,
  getAdminContentStats,
  getAdminFeedback,
} from '../lib/dataService'

const ADMIN_EMAIL = 'dawoudhussein07@gmail.com'

// ── Helpers ───────────────────────────────────────────────────────────────────

function lastNDays(n) {
  const days = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

function shortDate(iso) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '—'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

function formatTotalTime(ms) {
  if (!ms) return '—'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function relativeDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now - d
  const days = Math.floor(diffMs / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7)  return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function fullDateTime(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Shared UI components ──────────────────────────────────────────────────────

function Metric({ label, value, sub, color, large }) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      padding: large ? '20px 24px' : '14px 18px',
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <div style={{
        fontSize: large ? '2rem' : '1.5rem',
        fontWeight: 700,
        color: color || 'var(--color-text)',
        lineHeight: 1.1,
      }}>
        {value ?? '—'}
      </div>
      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

function Card({ title, children, style }) {
  return (
    <div className="card" style={{ marginBottom: 20, ...style }}>
      {title && (
        <div className="card-header" style={{ marginBottom: 16 }}>
          <div className="card-title">{title}</div>
        </div>
      )}
      {children}
    </div>
  )
}

function SectionSpinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
      <div className="spinner" />
    </div>
  )
}

function SectionError({ msg }) {
  return <div style={{ color: 'var(--color-danger)', padding: '40px 0' }}>Failed to load: {msg}</div>
}

function AdminTable({ headers, rows, emptyMsg = 'No data yet.' }) {
  if (!rows?.length) {
    return <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>{emptyMsg}</div>
  }
  return (
    <div className="table-container">
      <table className="admin-table">
        <thead>
          <tr>
            {headers.map(h => (
              <th key={h.key || h} style={{ textAlign: h.right ? 'right' : 'left' }}>
                {h.label || h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {headers.map(h => (
                <td key={h.key || h} style={{ textAlign: h.right ? 'right' : 'left' }}>
                  {row[h.key || h]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Line Chart (unchanged from v1) ────────────────────────────────────────────

function smoothPath(pts) {
  if (pts.length === 0) return ''
  return pts.map((p, i) => {
    if (i === 0) return `M ${p.x},${p.y}`
    const prev = pts[i - 1]
    const cpx = (prev.x + p.x) / 2
    return `C ${cpx},${prev.y} ${cpx},${p.y} ${p.x},${p.y}`
  }).join(' ')
}

function LineChart({ data, valueKey, label, color, days: dayCount = 30, valueFormatter }) {
  const days = lastNDays(dayCount)
  const byDate = {}
  ;(data || []).forEach(row => { byDate[row.date] = Number(row[valueKey]) || 0 })
  const values = days.map(d => byDate[d] || 0)
  const max = Math.max(...values, 1)
  const hasData = values.some(v => v > 0)
  const fmt = valueFormatter || (v => v)

  const W = 500, H = 110
  const pad = { top: 10, right: 10, bottom: 22, left: 36 }
  const iW = W - pad.left - pad.right
  const iH = H - pad.top - pad.bottom

  const pts = values.map((v, i) => ({
    x: pad.left + (i / Math.max(values.length - 1, 1)) * iW,
    y: pad.top + (1 - v / max) * iH,
    v, date: days[i],
  }))

  const linePath = smoothPath(pts)
  const areaPath = hasData
    ? `${linePath} L ${pts[pts.length-1].x},${pad.top+iH} L ${pts[0].x},${pad.top+iH} Z`
    : ''
  const midIdx = Math.floor(days.length / 2)

  return (
    <div>
      <div style={{
        fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6,
      }}>
        {label}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
        {[0, 0.5, 1].map(t => (
          <line key={t} x1={pad.left} y1={pad.top + t*iH} x2={pad.left+iW} y2={pad.top + t*iH}
            stroke="var(--color-border)" strokeWidth="1" strokeDasharray={t === 0 || t === 1 ? 'none' : '3 3'} />
        ))}
        {hasData && <path d={areaPath} fill={color} fillOpacity="0.07" />}
        {hasData && <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {hasData && pts.filter(p => p.v > 0).map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} stroke="var(--color-surface)" strokeWidth="1.5">
            <title>{shortDate(p.date)}: {fmt(p.v)}</title>
          </circle>
        ))}
        <text x={pad.left-6} y={pad.top+4}   fontSize="9" fill="var(--color-text-muted)" textAnchor="end" dominantBaseline="middle">{fmt(max)}</text>
        <text x={pad.left-6} y={pad.top+iH}  fontSize="9" fill="var(--color-text-muted)" textAnchor="end" dominantBaseline="middle">0</text>
        <text x={pts[0].x}              y={H-4} fontSize="9" fill="var(--color-text-muted)" textAnchor="middle">{shortDate(days[0])}</text>
        <text x={pts[midIdx].x}         y={H-4} fontSize="9" fill="var(--color-text-muted)" textAnchor="middle">{shortDate(days[midIdx])}</text>
        <text x={pts[pts.length-1].x}   y={H-4} fontSize="9" fill="var(--color-text-muted)" textAnchor="middle">Today</text>
        {!hasData && (
          <text x={pad.left+iW/2} y={pad.top+iH/2} fontSize="10" fill="var(--color-text-muted)" textAnchor="middle" dominantBaseline="middle">
            No activity in this period
          </text>
        )}
      </svg>
    </div>
  )
}

// ── Section: Overview ─────────────────────────────────────────────────────────

function OverviewSection() {
  const [stats, setStats]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)

  useEffect(() => {
    api.get('/admin/stats')
      .then(data => setStats(data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <SectionSpinner />
  if (error)   return <SectionError msg={error} />

  return (
    <>
      {/* Active users */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <Metric label="Active Today"    value={stats?.active_today}  sub="users who studied today"
          color={stats?.active_today > 0 ? 'var(--color-brand)' : undefined} large />
        <Metric label="Active — 7 days"  value={stats?.active_7d}    sub={`${stats?.retention_7d ?? 0}% of all users`} />
        <Metric label="Active — 30 days" value={stats?.active_30d} />
        <Metric label="Total Users"      value={stats?.total_users} />
      </div>

      {/* Engagement charts */}
      <Card title="Engagement — Last 30 Days">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
          <LineChart data={stats?.dau_chart}          valueKey="users"  label="Daily Active Users"      color="var(--color-brand)" />
          <LineChart data={stats?.dau_chart}          valueKey="cards"  label="Cards Reviewed Per Day"  color="var(--color-primary)" />
        </div>
      </Card>

      {/* New signups */}
      <Card title="New Accounts — Last 30 Days">
        <LineChart data={stats?.new_accounts_chart} valueKey="count"  label="Signups Per Day" color="var(--color-success)" />
      </Card>

      {/* Platform totals */}
      <Card title="Platform Totals">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Metric label="Total Users"          value={stats?.total_users} />
          <Metric label="Total Decks"          value={stats?.total_decks} />
          <Metric label="Total Words"          value={stats?.total_words?.toLocaleString()} />
          <Metric label="Community Decks"      value={stats?.total_community_decks} />
          <Metric label="Total Downloads"      value={stats?.total_downloads?.toLocaleString()} />
          <Metric label="Cards Reviewed"       value={stats?.total_cards_reviewed?.toLocaleString()} sub="all time" />
          <Metric label="Study Sessions"       value={stats?.total_sessions?.toLocaleString()} />
          <Metric label="Avg Cards / Session"  value={stats?.avg_session_size} />
        </div>
      </Card>
    </>
  )
}

// ── Section: Users ────────────────────────────────────────────────────────────

function UsersSection() {
  const [users,    setUsers]    = useState(null)
  const [sessions, setSessions] = useState(null)
  const [search,   setSearch]   = useState('')
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    Promise.allSettled([getAdminUsersList(), getAdminAppSessions()])
      .then(([uRes, sRes]) => {
        if (uRes.status === 'fulfilled') setUsers(uRes.value)
        else setError(uRes.reason?.message)
        if (sRes.status === 'fulfilled') setSessions(sRes.value)
      })
      .finally(() => setLoading(false))
  }, [])

  const filteredUsers = useMemo(() => {
    if (!users) return []
    const q = search.toLowerCase()
    if (!q) return users
    return users.filter(u =>
      u.username?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    )
  }, [users, search])

  if (loading) return <SectionSpinner />
  if (error)   return <SectionError msg={error} />

  const userHeaders = [
    { key: 'username',   label: 'Username' },
    { key: 'email',      label: 'Email' },
    { key: 'joined',     label: 'Joined' },
    { key: 'last_active',label: 'Last Active' },
    { key: 'words',      label: 'Words',    right: true },
    { key: 'cards',      label: 'Cards',    right: true },
    { key: 'study_time', label: 'Study Time', right: true },
    { key: 'sessions',   label: 'Sessions', right: true },
  ]

  const userRows = filteredUsers.map(u => ({
    username:    u.username,
    email:       u.email,
    joined:      relativeDate(u.joined),
    last_active: relativeDate(u.last_active),
    words:       u.word_count?.toLocaleString() || '0',
    cards:       u.total_cards_reviewed?.toLocaleString() || '0',
    study_time:  formatTotalTime(u.total_study_ms),
    sessions:    u.total_sessions?.toLocaleString() || '0',
  }))

  const sessionHeaders = [
    { key: 'username',   label: 'User' },
    { key: 'entered',    label: 'Entered' },
    { key: 'exited',     label: 'Exited' },
    { key: 'duration',   label: 'Duration', right: true },
    { key: 'status',     label: 'Status' },
  ]

  const sessionRows = (sessions || []).map(s => ({
    username: s.username,
    entered:  fullDateTime(s.started_at),
    exited:   s.ended_at ? fullDateTime(s.ended_at) : '—',
    duration: s.duration_ms ? formatDuration(s.duration_ms) : '—',
    status:   s.ended_at
      ? <span className="srs-badge review">Ended</span>
      : <span className="srs-badge new">Active</span>,
  }))

  return (
    <>
      <Card title="All Users">
        <input
          className="search-input"
          placeholder="Search by username or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginBottom: 16, maxWidth: 340 }}
        />
        <AdminTable headers={userHeaders} rows={userRows} emptyMsg="No users found." />
      </Card>

      <Card title="App Session Log">
        <p style={{ fontSize: '0.83rem', color: 'var(--color-text-muted)', marginTop: 0, marginBottom: 12 }}>
          Every time a user opens the app. Sessions without an exit time were closed by tab/browser closure.
        </p>
        <AdminTable headers={sessionHeaders} rows={sessionRows} emptyMsg="No sessions recorded yet." />
      </Card>
    </>
  )
}

// ── Section: Engagement ───────────────────────────────────────────────────────

function EngagementSection() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    getAdminEngagementStats()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <SectionSpinner />
  if (error)   return <SectionError msg={error} />

  // Convert ms → minutes for the chart
  const timeChartData = (data?.daily_study_time || []).map(row => ({
    date:  row.date,
    mins:  Math.round((row.total_ms || 0) / 60000),
    users: row.users,
  }))

  return (
    <>
      {/* Key metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <Metric label="Avg Session Duration"   value={formatDuration(data?.avg_session_ms)}   large />
        <Metric label="Total Study Time"       value={formatTotalTime(data?.total_study_ms)}  sub="all users combined" />
        <Metric label="Day-7 Retention"        value={data?.retention_d7  != null ? `${data.retention_d7}%`  : '—'} sub="users active again within 7 days" color="var(--color-brand)" />
        <Metric label="Day-30 Retention"       value={data?.retention_d30 != null ? `${data.retention_d30}%` : '—'} sub="users active again within 30 days" />
      </div>

      {/* Study time chart */}
      <Card title="Study Time Per Day — Last 30 Days">
        <LineChart
          data={timeChartData}
          valueKey="mins"
          label="Minutes Studied (all users)"
          color="var(--color-brand)"
          valueFormatter={v => `${v}m`}
        />
      </Card>

      {/* DAU chart from study_log perspective */}
      <Card title="Active Studiers Per Day — Last 30 Days">
        <LineChart
          data={timeChartData}
          valueKey="users"
          label="Unique Users Who Studied"
          color="var(--color-primary)"
        />
      </Card>

      {/* Extra metric */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <Metric label="Avg Study Sessions / User" value={data?.avg_sessions_per_user ?? '—'} />
        <Metric label="Avg Session Duration"      value={formatDuration(data?.avg_session_ms)} />
        <Metric label="Total Logged Study Time"   value={formatTotalTime(data?.total_study_ms)} sub="cumulative across all users" />
      </div>
    </>
  )
}

// ── Section: Content ──────────────────────────────────────────────────────────

function ContentSection() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    getAdminContentStats()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <SectionSpinner />
  if (error)   return <SectionError msg={error} />

  const bd = data?.srs_breakdown || {}
  const total = Number(bd.total) || 1

  const SRS_SEGMENTS = [
    { key: 'new',      label: 'New',      color: '#94a3b8' },
    { key: 'learning', label: 'Learning', color: 'var(--color-warning)' },
    { key: 'review',   label: 'Review',   color: 'var(--color-info, #2471a3)' },
    { key: 'mastered', label: 'Mastered', color: 'var(--color-success)' },
  ]

  const hardestHeaders = [
    { key: 'arabic',     label: 'Arabic' },
    { key: 'english',    label: 'English' },
    { key: 'avg_ease',   label: 'Avg Ease Factor', right: true },
    { key: 'user_count', label: 'Users',            right: true },
  ]

  const hardestRows = (data?.hardest_words || []).map(w => ({
    arabic:     <span className="arabic" style={{ fontSize: '1.1rem' }}>{w.arabic}</span>,
    english:    w.english,
    avg_ease:   <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>{w.avg_ease}</span>,
    user_count: w.user_count,
  }))

  return (
    <>
      {/* Summary metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <Metric label="Total SRS Cards"  value={Number(bd.total || 0).toLocaleString()}  large />
        <Metric label="Mastered"         value={`${data?.mastered_pct ?? 0}%`}  color="var(--color-success)" />
        <Metric label="Avg Ease Factor"  value={data?.avg_ease_factor ?? '—'} sub="platform average (2.5 = normal)" />
        <Metric label="New Cards"        value={Number(bd.new || 0).toLocaleString()} />
      </div>

      {/* SRS breakdown bar */}
      <Card title="Platform SRS Breakdown">
        <div style={{ display: 'flex', height: 28, borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 16, gap: 2 }}>
          {SRS_SEGMENTS.map(seg => {
            const count = Number(bd[seg.key] || 0)
            const pct = (count / total) * 100
            if (pct < 0.5) return null
            return (
              <div key={seg.key} title={`${seg.label}: ${count.toLocaleString()} (${pct.toFixed(1)}%)`}
                style={{ flex: `0 0 ${pct}%`, background: seg.color, transition: 'flex 0.3s' }} />
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {SRS_SEGMENTS.map(seg => {
            const count = Number(bd[seg.key] || 0)
            const pct = total > 1 ? ((count / total) * 100).toFixed(1) : '0.0'
            return (
              <div key={seg.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.83rem' }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
                <span style={{ color: 'var(--color-text-muted)' }}>{seg.label}</span>
                <span style={{ fontWeight: 700 }}>{count.toLocaleString()}</span>
                <span style={{ color: 'var(--color-text-muted)' }}>({pct}%)</span>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Hardest words */}
      <Card title="Hardest Words Platform-Wide">
        <p style={{ fontSize: '0.83rem', color: 'var(--color-text-muted)', marginTop: 0, marginBottom: 12 }}>
          Words with the lowest average ease factor across all users who have reviewed them. Lower = harder.
        </p>
        <AdminTable headers={hardestHeaders} rows={hardestRows} emptyMsg="Not enough data yet (need ≥2 users per word)." />
      </Card>
    </>
  )
}

// ── Section: Moderation ───────────────────────────────────────────────────────

function ModerationSection() {
  const [stats, setStats]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)

  useEffect(() => {
    api.get('/admin/stats')
      .then(data => setStats(data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <SectionSpinner />
  if (error)   return <SectionError msg={error} />

  const contrib = stats?.contributions_breakdown || {}
  const approvalRate = contrib.total > 0
    ? Math.round((contrib.approved / contrib.total) * 100) : 0

  const contributorHeaders = [
    { key: 'rank',        label: '#' },
    { key: 'username',    label: 'User' },
    { key: 'trust_score', label: 'Trust Score', right: true },
  ]
  const contributorRows = (stats?.top_contributors || []).map((c, i) => ({
    rank:        i + 1,
    username:    c.username,
    trust_score: <span style={{ fontWeight: 700, color: 'var(--color-brand)' }}>{c.trust_score}</span>,
  }))

  const deckHeaders = [
    { key: 'title',    label: 'Deck' },
    { key: 'uploader', label: 'Uploader' },
    { key: 'downloads',label: 'Downloads', right: true },
  ]
  const deckRows = (stats?.top_community_decks || []).map(d => ({
    title:     d.title,
    uploader:  d.uploader_username || 'Kalimat Team',
    downloads: <span style={{ fontWeight: 700, color: 'var(--color-brand)' }}>{d.download_count}</span>,
  }))

  return (
    <>
      {/* Contributions breakdown */}
      <Card title="Contributions">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 0 }}>
          <Metric label="Total"         value={contrib.total} />
          <Metric label="Approval Rate" value={`${approvalRate}%`}
            color={approvalRate >= 70 ? 'var(--color-success)' : 'var(--color-warning)'} />
          <Metric label="Approved"  value={contrib.approved} color="var(--color-success)" />
          <Metric label="Pending"   value={contrib.pending}  color="var(--color-warning)" />
          <Metric label="Rejected"  value={contrib.rejected} color="var(--color-danger)" />
        </div>
      </Card>

      {/* Side-by-side tables */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card title="Top Contributors">
          <AdminTable headers={contributorHeaders} rows={contributorRows} emptyMsg="No contributors yet." />
        </Card>
        <Card title="Top Community Decks">
          <AdminTable headers={deckHeaders} rows={deckRows} emptyMsg="No community decks yet." />
        </Card>
      </div>
    </>
  )
}

// ── Section: Feedback ─────────────────────────────────────────────────────────

const TYPE_LABELS = { bug: 'Bug', feature: 'Feature', other: 'Other' }
const TYPE_COLORS = {
  bug:     { bg: 'var(--color-danger-bg)',  text: 'var(--color-danger)' },
  feature: { bg: 'var(--color-info-bg)',    text: 'var(--color-info)' },
  other:   { bg: 'var(--color-surface-elevated)', text: 'var(--color-text-muted)' },
}

function FeedbackSection() {
  const [items,   setItems]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [filter,  setFilter]  = useState('all')

  useEffect(() => {
    getAdminFeedback()
      .then(setItems)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (!items) return []
    if (filter === 'all') return items
    return items.filter(f => f.type === filter)
  }, [items, filter])

  if (loading) return <SectionSpinner />
  if (error)   return <SectionError msg={error} />

  const counts = {
    all:     items?.length || 0,
    bug:     items?.filter(f => f.type === 'bug').length || 0,
    feature: items?.filter(f => f.type === 'feature').length || 0,
    other:   items?.filter(f => f.type === 'other').length || 0,
  }

  return (
    <>
      {/* Summary counts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <Metric label="Total"    value={counts.all} large />
        <Metric label="Bugs"     value={counts.bug}     color="var(--color-danger)" />
        <Metric label="Features" value={counts.feature} color="var(--color-info)" />
        <Metric label="Other"    value={counts.other} />
      </div>

      <Card>
        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['all', 'bug', 'feature', 'other'].map(t => (
            <button
              key={t}
              className={`theme-option${filter === t ? ' active' : ''}`}
              onClick={() => setFilter(t)}
              style={{ textTransform: 'capitalize' }}
            >
              {t === 'all' ? `All (${counts.all})` : `${TYPE_LABELS[t] || t} (${counts[t]})`}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', padding: '20px 0' }}>
            No {filter === 'all' ? '' : filter} feedback yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map(item => {
              const col = TYPE_COLORS[item.type] || TYPE_COLORS.other
              return (
                <div key={item.id} style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 16px',
                  background: 'var(--color-surface)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      background: col.bg, color: col.text,
                      fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px',
                      borderRadius: 'var(--radius-full)', textTransform: 'uppercase',
                    }}>
                      {TYPE_LABELS[item.type] || item.type}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                      {item.email || 'Unknown'}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
                      {relativeDate(item.created_at)}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--color-text)', whiteSpace: 'pre-wrap' }}>
                    {item.message}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function AdminStats() {
  const { currentUser } = useAuth()
  const [searchParams]  = useSearchParams()
  const section = searchParams.get('section') || 'overview'
  const isAdmin = currentUser?.email === ADMIN_EMAIL

  if (!isAdmin) {
    return (
      <div className="page-container">
        <div className="empty-state" style={{ paddingTop: 80 }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>🔒</div>
          <div style={{ fontWeight: 600 }}>Admin access only</div>
        </div>
      </div>
    )
  }

  const SECTION_TITLES = {
    overview:   'Overview',
    users:      'Users',
    engagement: 'Engagement',
    content:    'Content Health',
    moderation: 'Moderation',
    feedback:   'Feedback',
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
          Admin — {SECTION_TITLES[section] || 'Dashboard'}
        </h1>
        <p style={{ color: 'var(--color-text-muted)', marginTop: 4, marginBottom: 0 }}>
          Visible to you only · live data across all users
        </p>
      </div>

      {section === 'overview'   && <OverviewSection />}
      {section === 'users'      && <UsersSection />}
      {section === 'engagement' && <EngagementSection />}
      {section === 'content'    && <ContentSection />}
      {section === 'moderation' && <ModerationSection />}
      {section === 'feedback'   && <FeedbackSection />}
    </div>
  )
}
