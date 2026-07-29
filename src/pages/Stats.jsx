// v2.4.0
import React, { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { api } from '../lib/api'
import { normalizeSrsCard, normalizeDeck, getStudyLog, getUserStoryProgress } from '../lib/dataService'
import { getSRSStatus } from '../srs/sm2'
import { Flame, Star, AlertTriangle } from 'lucide-react'
import YearCalendar from '../components/YearCalendar'

// ── Helpers ───────────────────────────────────────────────────────────────────
function calcStreak(studyLog) {
  if (!studyLog.length) return 0
  const days = new Set(studyLog.map(r => r.date))
  let streak = 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = 0; i <= 365; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    if (days.has(d.toISOString().slice(0, 10))) {
      streak++
    } else if (i > 0) {
      break
    }
  }
  return streak
}

function formatTime(ms) {
  if (!ms || ms < 60000) return '< 1 min'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatTimeVerbose(ms) {
  if (!ms || ms < 60000) return 'Less than a minute'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h === 0) return `${m} minute${m !== 1 ? 's' : ''}`
  if (m === 0) return `${h} hour${h !== 1 ? 's' : ''}`
  return `${h} hour${h !== 1 ? 's' : ''} ${m} min`
}

// ── Shared components ─────────────────────────────────────────────────────────
function Metric({ value, label, sub, color, icon: Icon }) {
  return (
    <div className="stat-metric">
      {Icon && <Icon size={16} style={{ color: color || 'var(--color-text-muted)', marginBottom: 6 }} strokeWidth={1.75} />}
      <div className="stat-metric-value" style={{ color: color || 'var(--color-text)' }}>{value}</div>
      <div className="stat-metric-label">{label}</div>
      {sub && <div className="stat-metric-sub">{sub}</div>}
    </div>
  )
}

function SectionEmpty({ message }) {
  return (
    <div style={{ color: 'var(--color-text-muted)', fontSize: '0.88rem', padding: '12px 0' }}>
      {message}
    </div>
  )
}

function BarChart({ data, colorFn, height = 120 }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height, width: '100%' }}>
      {data.map((d, i) => {
        const barH = Math.max((d.value / max) * (height - 32), d.value > 0 ? 4 : 0)
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, height: '100%', justifyContent: 'flex-end' }}>
            {d.value > 0 && (
              <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', lineHeight: 1 }}>{d.value}</span>
            )}
            <div
              style={{ width: '100%', height: barH, background: colorFn ? colorFn(d, i) : 'var(--color-brand)', borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }}
              title={`${d.label}: ${d.value}`}
            />
            <span style={{ fontSize: '0.62rem', color: 'var(--color-text-muted)', textAlign: 'center', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
              {d.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_LABELS = { new: 'Not Started', learning: 'Learning', review: 'Familiar', mastered: 'Mastered' }
const STATUS_COLORS = { new: 'var(--color-border-medium)', learning: 'var(--color-warning)', review: 'var(--color-brand-deep)', mastered: 'var(--color-success)' }

// ── Sections ──────────────────────────────────────────────────────────────────

function OverviewSection({ totalWords, totals, streak, totalReviews, totalTimeMs, dueToday, bestSingleDay, storiesCompleted }) {
  const masteredPct = totalWords > 0 ? Math.round((totals.mastered / totalWords) * 100) : 0

  return (
    <div>
      {/* Primary metrics */}
      <div className="stat-metrics-row">
        <Metric value={totalWords} label="Words in Bank" />
        <Metric value={totals.mastered} label="Mastered" color="var(--color-success)" />
        <Metric
          value={<span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{streak} <Flame size={18} strokeWidth={1.75} style={{ color: 'var(--color-warning)' }} /></span>}
          label="Day Streak"
        />
        <Metric value={totalReviews.toLocaleString()} label="Total Reviews" />
      </div>

      {/* Secondary metrics */}
      <div className="stat-metrics-row" style={{ marginTop: 0 }}>
        <Metric value={formatTime(totalTimeMs)} label="Time Studied" sub="all time" />
        <Metric value={bestSingleDay} label="Best Day" sub="cards reviewed" />
        <Metric value={dueToday} label="Due Today" color={dueToday > 0 ? 'var(--color-warning)' : undefined} />
        {storiesCompleted > 0 && (
          <Metric value={storiesCompleted} label="Stories Read" color="var(--color-brand-deep)" />
        )}
      </div>

      {/* Due today CTA */}
      {dueToday > 0 && (
        <div style={{ margin: '4px 0 20px', padding: '14px 18px', background: 'var(--color-warning-bg)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--color-warning)', fontSize: '0.95rem' }}>
              {dueToday} card{dueToday !== 1 ? 's' : ''} due for review
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
              Keep your streak going — review now
            </div>
          </div>
          <Link to="/flashcards?mode=review" className="btn btn-primary btn-sm">
            Start Review
          </Link>
        </div>
      )}

      {/* Overall progress bar */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">Overall Progress</div>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{masteredPct}% mastered</span>
        </div>
        <div style={{ height: 12, borderRadius: 'var(--radius-full)', overflow: 'hidden', background: 'var(--color-surface-elevated)', display: 'flex', gap: 1 }}>
          {['mastered', 'review', 'learning', 'new'].map(key => {
            const pct = totalWords > 0 ? (totals[key] / totalWords) * 100 : 0
            return pct > 0 ? (
              <div key={key} style={{ height: '100%', width: `${pct}%`, background: STATUS_COLORS[key] }}
                title={`${STATUS_LABELS[key]}: ${totals[key]}`} />
            ) : null
          })}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
          {['mastered', 'review', 'learning', 'new'].map(key => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}>
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: STATUS_COLORS[key], flexShrink: 0 }} />
              <span style={{ color: 'var(--color-text-muted)' }}>{STATUS_LABELS[key]}</span>
              <span style={{ fontWeight: 700 }}>{totals[key]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ActivitySection({ studyLog, streak }) {
  const totalReviews  = studyLog.reduce((s, r) => s + (r.cards_reviewed || 0), 0)
  const totalTimeMs   = studyLog.reduce((s, r) => s + (r.session_ms || 0), 0)
  const activeDays    = studyLog.length
  const avgPerDay     = activeDays > 0 ? Math.round(totalReviews / activeDays) : 0
  const bestSingleDay = studyLog.reduce((m, r) => Math.max(m, r.cards_reviewed || 0), 0)

  // Review history last 7 days — short weekday labels, easy to read
  const reviewHistory = useMemo(() => {
    const agg = {}
    studyLog.forEach(r => { agg[r.date] = (agg[r.date] || 0) + (r.cards_reviewed || 0) })
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      const key = d.toISOString().slice(0, 10)
      const label = i === 6 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' })
      return { label, value: agg[key] || 0 }
    })
  }, [studyLog])

  const heatmapData = useMemo(() =>
    studyLog.map(r => ({ date: r.date, count: r.cards_reviewed })),
  [studyLog])

  return (
    <div>
      {/* Stats strip */}
      <div className="stat-metrics-row">
        <Metric value={activeDays} label="Active Days" sub="days with reviews" />
        <Metric value={avgPerDay} label="Avg per Day" sub="on active days" />
        <Metric value={bestSingleDay} label="Best Day" sub="most cards reviewed" />
        <Metric value={formatTimeVerbose(totalTimeMs)} label="Time Studied" sub="all time" />
      </div>

      {/* Year calendar — same as Dashboard */}
      <div className="card" style={{ marginBottom: 16 }}>
        <YearCalendar activityData={heatmapData} streak={streak} />
      </div>

      {/* 7-day review history */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Cards Reviewed</div>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>last 7 days</span>
        </div>
        {totalReviews === 0
          ? <SectionEmpty message="No reviews yet. Complete a flashcard session to see your history." />
          : <BarChart data={reviewHistory} height={140}
              colorFn={(d, i) => i === reviewHistory.length - 1 ? 'var(--color-brand)' : 'var(--color-border-medium)'} />
        }
      </div>
    </div>
  )
}

function VocabularySection({ totalWords, totals, cards, wordRows, decks }) {
  const masteredPct = totalWords > 0 ? Math.round((totals.mastered / totalWords) * 100) : 0

  const bestKnown = useMemo(() => {
    if (!cards || !wordRows) return null
    const wordMap = Object.fromEntries(wordRows.map(w => [w.id, w]))
    const eligible = cards.filter(c => c.repetitions > 0 && c.interval > 1)
    if (!eligible.length) return null
    const best = eligible.reduce((a, b) => a.interval > b.interval ? a : b)
    return { arabic: wordMap[best.wordId]?.arabic, interval: best.interval }
  }, [cards, wordRows])

  const hardest = useMemo(() => {
    if (!cards || !wordRows) return null
    const wordMap = Object.fromEntries(wordRows.map(w => [w.id, w]))
    const bestArabic = bestKnown?.arabic
    const eligible = cards.filter(c => {
      if (c.repetitions < 2 || c.interval >= 21) return false
      if (bestArabic && wordMap[c.wordId]?.arabic === bestArabic) return false
      return true
    })
    if (!eligible.length) return null
    const hard = eligible.reduce((a, b) => {
      const scoreA = a.easeFactor / Math.log2(a.repetitions + 2)
      const scoreB = b.easeFactor / Math.log2(b.repetitions + 2)
      return scoreA < scoreB ? a : b
    })
    return { arabic: wordMap[hard.wordId]?.arabic }
  }, [cards, wordRows, bestKnown])

  const deckStats = useMemo(() => {
    if (!decks || !cards || !wordRows) return []
    const wordCountByDeck = {}
    const statusByDeck = {}
    wordRows.forEach(w => { wordCountByDeck[w.deck_id] = (wordCountByDeck[w.deck_id] || 0) + 1 })
    cards.forEach(c => {
      if (!statusByDeck[c.deckId]) statusByDeck[c.deckId] = { new: 0, learning: 0, review: 0, mastered: 0 }
      statusByDeck[c.deckId][getSRSStatus(c)]++
    })
    return decks
      .map(d => {
        const total    = wordCountByDeck[d.id] || 0
        const s        = statusByDeck[d.id] || { new: 0, learning: 0, review: 0, mastered: 0 }
        const mastered = s.mastered
        const pct      = total > 0 ? Math.round((mastered / total) * 100) : 0
        return { ...d, total, mastered, pct, status: s }
      })
      .filter(d => d.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [decks, cards, wordRows])

  return (
    <div>
      {/* Progress bar */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">Word Progress</div>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{masteredPct}% mastered</span>
        </div>
        <div style={{ height: 14, borderRadius: 'var(--radius-full)', overflow: 'hidden', background: 'var(--color-surface-elevated)', display: 'flex', gap: 1 }}>
          {['mastered', 'review', 'learning', 'new'].map(key => {
            const pct = totalWords > 0 ? (totals[key] / totalWords) * 100 : 0
            return pct > 0 ? (
              <div key={key} style={{ height: '100%', width: `${pct}%`, background: STATUS_COLORS[key] }}
                title={`${STATUS_LABELS[key]}: ${totals[key]}`} />
            ) : null
          })}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
          {['mastered', 'review', 'learning', 'new'].map(key => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}>
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: STATUS_COLORS[key], flexShrink: 0 }} />
              <span style={{ color: 'var(--color-text-muted)' }}>{STATUS_LABELS[key]}</span>
              <span style={{ fontWeight: 700 }}>{totals[key]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Best / Hardest */}
      <div className="stats-charts-grid" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Star size={14} style={{ color: 'var(--color-success)' }} /> Best Known Word
            </div>
          </div>
          {bestKnown?.arabic ? (
            <>
              <div style={{ fontFamily: 'var(--font-arabic)', fontSize: '2rem', direction: 'rtl', color: 'var(--color-success)', lineHeight: 1.4, marginTop: 4 }}>
                {bestKnown.arabic}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                Scheduled every {bestKnown.interval} days
              </div>
            </>
          ) : (
            <SectionEmpty message="Keep reviewing to see your best known word." />
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={14} style={{ color: 'var(--color-warning)' }} /> Biggest Challenge
            </div>
          </div>
          {hardest?.arabic ? (
            <>
              <div style={{ fontFamily: 'var(--font-arabic)', fontSize: '2rem', direction: 'rtl', color: 'var(--color-warning)', lineHeight: 1.4, marginTop: 4 }}>
                {hardest.arabic}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                Needs the most practice
              </div>
            </>
          ) : (
            <SectionEmpty message="Keep reviewing to see your biggest challenge." />
          )}
        </div>
      </div>

      {/* Deck breakdown */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Deck Breakdown</div>
          <Link to="/word-bank" className="btn btn-ghost btn-sm">Manage →</Link>
        </div>
        {deckStats.length === 0 ? (
          <SectionEmpty message={<>No decks yet. <Link to="/community">Import a community deck →</Link></>} />
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Deck</th>
                  <th style={{ textAlign: 'right' }}>Words</th>
                  <th style={{ textAlign: 'right', color: 'var(--color-success)' }}>Mastered</th>
                  <th style={{ minWidth: 140 }}>Progress</th>
                </tr>
              </thead>
              <tbody>
                {deckStats.map(d => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 500 }}>
                      <Link to={`/flashcards?deck=${d.id}`} style={{ color: 'var(--color-text)', textDecoration: 'none' }}>
                        {d.title}
                      </Link>
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>{d.total}</td>
                    <td style={{ textAlign: 'right', fontSize: '0.85rem', color: 'var(--color-success)' }}>{d.mastered}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 8, borderRadius: 'var(--radius-full)', background: 'var(--color-surface-elevated)', overflow: 'hidden', display: 'flex', gap: 1 }}>
                          {['mastered', 'review', 'learning'].map(key => {
                            const pct = d.total > 0 ? (d.status[key] / d.total) * 100 : 0
                            return pct > 0 ? (
                              <div key={key} style={{ height: '100%', width: `${pct}%`, background: STATUS_COLORS[key] }} />
                            ) : null
                          })}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', flexShrink: 0, width: 30, textAlign: 'right' }}>
                          {d.pct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function ContributionsSection({ contributions }) {
  const counts = useMemo(() => {
    if (!contributions) return { words: 0, forms: 0, corrections: 0, total: 0, approved: 0, pending: 0, rejected: 0 }
    return {
      words:       contributions.filter(c => c.type === 'new_word').length,
      forms:       contributions.filter(c => c.type === 'add_form').length,
      corrections: contributions.filter(c => c.type === 'correct_form').length,
      total:       contributions.length,
      approved:    contributions.filter(c => c.status === 'approved').length,
      pending:     contributions.filter(c => c.status === 'pending').length,
      rejected:    contributions.filter(c => c.status === 'rejected').length,
    }
  }, [contributions])

  return (
    <div>
      {/* Type breakdown */}
      <div className="stat-metrics-row">
        <Metric value={counts.words}       label="Words Suggested" />
        <Metric value={counts.forms}       label="Forms Added" />
        <Metric value={counts.corrections} label="Corrections" />
        <Metric value={counts.total}       label="Total Submitted" />
      </div>

      {/* Status breakdown */}
      {counts.total > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">Submission Status</div>
            <Link to="/contributions?section=submissions" className="btn btn-ghost btn-sm">View all →</Link>
          </div>
          <div style={{ display: 'flex', height: 12, borderRadius: 'var(--radius-full)', overflow: 'hidden', background: 'var(--color-surface-elevated)', gap: 1 }}>
            {[
              { key: 'approved', count: counts.approved, color: 'var(--color-success)' },
              { key: 'pending',  count: counts.pending,  color: 'var(--color-warning)' },
              { key: 'rejected', count: counts.rejected, color: 'var(--color-danger)' },
            ].map(({ key, count, color }) => {
              const pct = counts.total > 0 ? (count / counts.total) * 100 : 0
              return pct > 0 ? (
                <div key={key} style={{ height: '100%', width: `${pct}%`, background: color }}
                  title={`${key}: ${count}`} />
              ) : null
            })}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
            {[
              { label: 'Approved', count: counts.approved, color: 'var(--color-success)' },
              { label: 'Pending',  count: counts.pending,  color: 'var(--color-warning)' },
              { label: 'Rejected', count: counts.rejected, color: 'var(--color-danger)' },
            ].map(({ label, count, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                <span style={{ fontWeight: 700 }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {counts.total === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '32px 20px' }}>
          <div style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: 12 }}>
            You haven't made any contributions yet.
          </div>
          <Link to="/contributions" className="btn btn-secondary btn-sm">
            Contribute a word →
          </Link>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Stats() {
  const { currentUser, isGuest, guestData } = useAuth()
  const [searchParams] = useSearchParams()
  const section = searchParams.get('section') || 'overview'

  const [cards,         setCards]         = useState(null)
  const [decks,         setDecks]         = useState(null)
  const [wordRows,      setWordRows]      = useState(null)
  const [contributions, setContributions] = useState(null)
  const [studyLog,      setStudyLog]      = useState(null)
  const [storyProgress, setStoryProgress] = useState({})

  useEffect(() => {
    if (isGuest) {
      setCards(guestData.srsCards)
      setDecks(guestData.decks)
      setWordRows(guestData.words.map(w => ({ id: w.id, deck_id: w.deckId, arabic: w.arabic })))
      setContributions([])
      setStudyLog([])
      return
    }
    if (!currentUser) return
    let cancelled = false
    const load = async () => {
      const [cardsRes, decksRes, wordsRes, contribRes, logRes] = await Promise.allSettled([
        api.get('/srs'),
        api.get('/decks'),
        api.get('/words'),
        api.get('/contributions/user'),
        getStudyLog(currentUser.id),
      ])
      if (cancelled) return
      if (cardsRes.status === 'fulfilled')  setCards((cardsRes.value || []).map(normalizeSrsCard))
      if (decksRes.status === 'fulfilled')  setDecks((decksRes.value || []).map(normalizeDeck))
      if (wordsRes.status === 'fulfilled')  setWordRows(wordsRes.value || [])
      setContributions(contribRes.status === 'fulfilled' ? (contribRes.value || []) : [])
      setStudyLog(logRes.status === 'fulfilled' ? logRes.value : [])
    }
    load()

    // Story progress (non-critical)
    getUserStoryProgress(currentUser.id)
      .then(map => { if (!cancelled) setStoryProgress(map) })
      .catch(() => {})

    return () => { cancelled = true }
  }, [currentUser, isGuest, guestData])

  const loading = !cards || !decks || !wordRows || studyLog === null

  // Derived data shared across sections
  const totalWords = useMemo(() => new Set((wordRows || []).map(w => w.arabic)).size, [wordRows])

  const totals = useMemo(() => {
    if (!cards || !wordRows) return { new: 0, learning: 0, review: 0, mastered: 0 }
    const SRS_RANK = { mastered: 4, review: 3, learning: 2, new: 1 }
    const wordMap = new Map(wordRows.map(w => [w.id, w.arabic]))
    const bestByArabic = new Map()
    for (const card of cards) {
      const arabic = wordMap.get(card.wordId)
      if (!arabic) continue
      const prev = bestByArabic.get(arabic)
      const rank = SRS_RANK[getSRSStatus(card)] || 0
      if (!prev || rank > (SRS_RANK[getSRSStatus(prev)] || 0)) bestByArabic.set(arabic, card)
    }
    const t = { new: 0, learning: 0, review: 0, mastered: 0 }
    bestByArabic.forEach(c => { t[getSRSStatus(c)]++ })
    return t
  }, [cards, wordRows])

  const streak = useMemo(() => calcStreak(studyLog || []), [studyLog])

  const totalReviews = useMemo(() =>
    (studyLog || []).reduce((s, r) => s + (r.cards_reviewed || 0), 0),
  [studyLog])

  const totalTimeMs = useMemo(() =>
    (studyLog || []).reduce((s, r) => s + (r.session_ms || 0), 0),
  [studyLog])

  const bestSingleDay = useMemo(() =>
    (studyLog || []).reduce((m, r) => Math.max(m, r.cards_reviewed || 0), 0),
  [studyLog])

  const dueToday = useMemo(() => {
    if (!cards) return 0
    const now = new Date().toISOString()
    return cards.filter(c => c.nextReviewDate <= now).length
  }, [cards])

  const storiesCompleted = useMemo(() =>
    Object.values(storyProgress).filter(p => p.completed).length,
  [storyProgress])

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Statistics</h1>
        <p className="page-subtitle">A full picture of your learning progress</p>
      </div>

      {section === 'overview' && (
        <OverviewSection
          totalWords={totalWords}
          totals={totals}
          streak={streak}
          totalReviews={totalReviews}
          totalTimeMs={totalTimeMs}
          dueToday={dueToday}
          bestSingleDay={bestSingleDay}
          storiesCompleted={storiesCompleted}
        />
      )}

      {section === 'activity' && (
        <ActivitySection
          studyLog={studyLog}
          streak={streak}
        />
      )}

      {section === 'vocabulary' && (
        <VocabularySection
          totalWords={totalWords}
          totals={totals}
          cards={cards}
          wordRows={wordRows}
          decks={decks}
        />
      )}

      {section === 'contributions' && (
        <ContributionsSection contributions={contributions} />
      )}
    </div>
  )
}
