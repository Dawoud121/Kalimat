// v2.7.0
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  getDueSrsCards,
  getAllSrsCardsWithWords,
  getUserDecks,
  updateSrsCard,
  updateDeck,
  normalizeDeck,
  logStudySession,
} from '../lib/dataService'
import { applyRating, previewIntervals, getSRSStatus } from '../srs/sm2'
import { Sparkles, CheckCircle2, RotateCcw, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import SpeakButton from '../components/SpeakButton'

const FLIP_DURATION = 400 // ms — must match CSS transition duration

function getDeckIntervalDays(deck) {
  if (deck.reviewFrequency === 'daily')   return 1
  if (deck.reviewFrequency === 'weekly')  return 7
  if (deck.reviewFrequency === 'monthly') return 30
  if (deck.reviewFrequency === 'custom')  return deck.reviewIntervalDays || 7
  return null
}

async function applyFrequencyDeckReview(deck, userId) {
  const days = getDeckIntervalDays(deck)
  if (!days) return
  const next = new Date()
  next.setDate(next.getDate() + days)
  await updateDeck(deck.id, { next_deck_review: next.toISOString() })
}

// Module-level session cache — survives navigation (component unmount/remount)
// Cleared when the user explicitly ends the session or completes it.
let _savedSession = null

// ── Today's study stats (localStorage) ────────────────────────────────────
function readTodayStats() {
  const today = new Date().toISOString().slice(0, 10)
  try {
    const raw = localStorage.getItem('kalimat_today_stats')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.date === today) return parsed
    }
  } catch (_) {}
  return { date: today, timeMs: 0, correct: 0, total: 0 }
}

function flushSessionStats(startTime, correct, total) {
  if (!startTime || !total) return 0
  const elapsed = Date.now() - startTime
  const cur = readTodayStats()
  localStorage.setItem('kalimat_today_stats', JSON.stringify({
    date:    cur.date,
    timeMs:  cur.timeMs + elapsed,
    correct: cur.correct + correct,
    total:   cur.total + total,
  }))
  return elapsed
}

const RATING_LABELS  = ['Hard', 'Easy']
const RATING_CLASSES = ['again', 'good']
const LIMIT_OPTIONS  = [10, 20, 50, null] // null = All

const FIELD_OPTIONS = [
  { value: 'arabic',   label: 'Arabic Word' },
  { value: 'english',  label: 'English' },
  { value: 'root',     label: 'Root' },
  { value: 'singular', label: 'Singular' },
  { value: 'dual',     label: 'Dual' },
  { value: 'plural',   label: 'Plural' },
  { value: 'past',     label: 'Past Tense' },
  { value: 'present',  label: 'Present Tense' },
  { value: 'command',  label: 'Command' },
  { value: 'masdar',   label: 'Masdar' },
]

const ARABIC_FIELDS = new Set(['arabic', 'root', 'singular', 'dual', 'plural', 'past', 'present', 'command', 'masdar'])

function getFieldValue(word, field) {
  return word[field] || ''
}

export default function Flashcards() {
  const { currentUser, isGuest, guestData, updateGuestSrsCard } = useAuth()
  const [searchParams]  = useSearchParams()

  const urlDeckId = searchParams.get('deck') ? Number(searchParams.get('deck')) : null
  const urlMode   = searchParams.get('mode') // 'review' | null

  // ── Setup state ───────────────────────────────────────────────────────────
  const [loadState,      setLoadState]      = useState(() => _savedSession ? 'ready' : 'setup')
  const [setupDecks,     setSetupDecks]     = useState(null)
  const [selectedDeckId, setSelectedDeckId] = useState(urlDeckId ?? _savedSession?.selectedDeckId ?? null)
  const [isReviewMode,   setIsReviewMode]   = useState(_savedSession ? _savedSession.isReviewMode : urlMode === 'review')
  const [sessionLimit,   setSessionLimit]   = useState(_savedSession ? _savedSession.sessionLimit : urlMode === 'review' ? 20 : null)
  const [showAdvanced,   setShowAdvanced]   = useState(false)
  const [frontField,     setFrontField]     = useState(_savedSession?.frontField ?? 'arabic')
  const [backField,      setBackField]      = useState(_savedSession?.backField ?? 'english')

  // ── Session state ─────────────────────────────────────────────────────────
  const [sessionCards, setSessionCards] = useState(() => _savedSession?.sessionCards ?? null)
  const [deckMap,      setDeckMap]      = useState(() => _savedSession?.deckMap ?? {})
  const [sessionIndex, setSessionIndex] = useState(() => _savedSession?.sessionIndex ?? 0)
  const [flipped,      setFlipped]      = useState(false)
  const [done,         setDone]         = useState(() => _savedSession?.done ?? false)
  const [stats,        setStats]        = useState(() => _savedSession?.stats ?? { hard: 0, easy: 0 })
  const [showForms,    setShowForms]    = useState(false)
  const [lastRating,   setLastRating]   = useState(null) // { cardIndex, cardId, prevState, ratingKey }
  const isAnimating           = useRef(false)
  const sessionRatedCount     = useRef(0)     // cards rated in current session
  const sessionLogged         = useRef(false) // prevent double-logging
  const sessionStartTime      = useRef(null)  // Date.now() when session began
  const sessionRatingCorrect  = useRef(0)     // Easy ratings this session
  const sessionRatingTotal    = useRef(0)     // all ratings this session

  // Reset forms panel whenever the active card changes
  useEffect(() => { setShowForms(false) }, [sessionIndex])

  // Persist session to module cache so navigation away and back resumes the session
  useEffect(() => {
    if (loadState === 'ready' && sessionCards) {
      _savedSession = { sessionCards, deckMap, sessionIndex, done, stats, isReviewMode, sessionLimit, selectedDeckId, frontField, backField }
    }
  }, [loadState, sessionCards, deckMap, sessionIndex, done, stats, isReviewMode, sessionLimit, selectedDeckId, frontField, backField])

  // Load decks for the setup screen and card-back deck name lookup
  useEffect(() => {
    if (isGuest) {
      setSetupDecks(guestData.decks)
      const map = {}
      guestData.decks.forEach(d => { map[d.id] = d.title })
      setDeckMap(map)
      return
    }
    if (!currentUser) return
    getUserDecks(currentUser.id)
      .then(decks => {
        const normalized = decks.map(normalizeDeck)
        setSetupDecks(normalized)
        const map = {}
        normalized.forEach(d => { map[d.id] = d.title })
        setDeckMap(map)
      })
      .catch(console.error)
  }, [currentUser, isGuest, guestData.decks])

  // ── Start session ─────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    _savedSession = null
    setLoadState('loading')
    try {
      let cards

      if (isGuest) {
        // Use in-memory guest SRS cards
        const today = new Date().toISOString().slice(0, 10)
        let all = guestData.srsCards
        if (selectedDeckId) all = all.filter(c => c.deckId === selectedDeckId)
        cards = isReviewMode
          ? all.filter(c => c.nextReviewDate <= today)
          : all
      } else {
        const selectedDeck = selectedDeckId ? setupDecks?.find(d => d.id === selectedDeckId) : null
        const isFreqDeck = !!selectedDeck?.reviewFrequency

        if (isFreqDeck) {
          // Frequency deck: always show all cards — deck schedule overrides individual SRS
          cards = await getAllSrsCardsWithWords(currentUser.id, { deckId: selectedDeckId })
        } else {
          const options = selectedDeckId ? { deckId: selectedDeckId } : {}
          cards = isReviewMode
            ? await getDueSrsCards(currentUser.id, options)
            : await getAllSrsCardsWithWords(currentUser.id, options)

          // All-decks review: exclude cards from frequency decks that are not yet due
          if (isReviewMode && !selectedDeckId && setupDecks) {
            const now = new Date()
            const pausedDeckIds = new Set(
              setupDecks
                .filter(d => d.reviewFrequency && d.nextDeckReview && new Date(d.nextDeckReview) > now)
                .map(d => d.id)
            )
            if (pausedDeckIds.size > 0) {
              cards = cards.filter(c => !pausedDeckIds.has(c.deckId))
            }
          }
        }
      }

      // Filter out cards missing the selected front/back field
      const isCustom = frontField !== 'arabic' || backField !== 'english'
      if (isCustom) {
        cards = cards.filter(c => {
          const w = c.word
          return getFieldValue(w, frontField) && getFieldValue(w, backField)
        })
      }

      let arr = [...cards]

      // Shuffle in practice mode
      if (!isReviewMode) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[arr[i], arr[j]] = [arr[j], arr[i]]
        }
      }

      // Apply session limit
      if (sessionLimit !== null && arr.length > sessionLimit) {
        arr = arr.slice(0, sessionLimit)
      }

      setSessionCards(arr)
      setSessionIndex(0)
      setFlipped(false)
      setDone(false)
      setStats({ hard: 0, easy: 0 })
      isAnimating.current = false
      sessionRatedCount.current = 0
      sessionLogged.current = false
      sessionStartTime.current = Date.now()
      sessionRatingCorrect.current = 0
      sessionRatingTotal.current = 0
      setLoadState('ready')
    } catch (err) {
      console.error('Flashcard load error:', err)
      setLoadState('error')
    }
  }, [currentUser, selectedDeckId, isReviewMode, sessionLimit, setupDecks, isGuest, guestData, frontField, backField])

  // Auto-start when navigated from dashboard with ?mode=review (skips setup screen)
  // Only fires if there is no saved session to resume.
  const didAutoStart = useRef(false)
  useEffect(() => {
    if (!currentUser || didAutoStart.current || urlMode !== 'review' || _savedSession) return
    didAutoStart.current = true
    handleStart()
  }, [currentUser, urlMode, handleStart])

  // Flush stats on unmount (user navigates away mid-session)
  useEffect(() => {
    return () => {
      if (sessionStartTime.current) {
        flushSessionStats(sessionStartTime.current, sessionRatingCorrect.current, sessionRatingTotal.current)
        sessionStartTime.current = null
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const currentCard = sessionCards?.[sessionIndex]

  const intervals = useMemo(() => {
    if (!currentCard) return {}
    return previewIntervals({
      repetitions: currentCard.repetitions,
      easeFactor:  currentCard.easeFactor,
      interval:    currentCard.interval,
    })
  }, [currentCard])

  const handleFlip = useCallback(() => {
    if (done || isAnimating.current) return
    setFlipped(f => !f)
  }, [done])

  const handleRate = useCallback(async (quality) => {
    if (!currentCard || !flipped || isAnimating.current || done) return

    isAnimating.current = true

    const updated = applyRating({
      repetitions: currentCard.repetitions,
      easeFactor:  currentCard.easeFactor,
      interval:    currentCard.interval,
    }, quality)

    const ratingKey = ['hard', 'easy'][quality]
    setLastRating({
      cardIndex: sessionIndex,
      cardId:    currentCard.id,
      prevState: {
        repetitions:    currentCard.repetitions,
        easeFactor:     currentCard.easeFactor,
        interval:       currentCard.interval,
        nextReviewDate: currentCard.nextReviewDate,
        lastReviewed:   currentCard.lastReviewed,
      },
      ratingKey,
    })

    if (isGuest) {
      updateGuestSrsCard(currentCard.id, updated)
    } else {
      await updateSrsCard(currentCard.id, updated)
    }

    sessionRatedCount.current += 1
    sessionRatingTotal.current += 1
    if (quality === 1) sessionRatingCorrect.current += 1 // Easy = correct
    setStats(s => ({ ...s, [ratingKey]: s[ratingKey] + 1 }))

    setFlipped(false)

    setTimeout(() => {
      const next = sessionIndex + 1
      if (next >= sessionCards.length) {
        // Flush time + rating stats to localStorage, capture elapsed for Supabase log
        const elapsed = flushSessionStats(sessionStartTime.current, sessionRatingCorrect.current, sessionRatingTotal.current)
        sessionStartTime.current = null
        // Session complete — log to Supabase with duration
        if (!sessionLogged.current && !isGuest) {
          sessionLogged.current = true
          logStudySession(currentUser.id, sessionRatedCount.current, elapsed)
        }
        // Update next_deck_review for frequency decks
        if (!isGuest && selectedDeckId && setupDecks) {
          const deck = setupDecks.find(d => d.id === selectedDeckId)
          if (deck?.reviewFrequency) {
            applyFrequencyDeckReview(deck, currentUser.id).catch(console.error)
          }
        }
        setDone(true)
      } else {
        setSessionIndex(next)
      }
      isAnimating.current = false
    }, FLIP_DURATION)
  }, [currentCard, flipped, done, sessionIndex, sessionCards])

  const handleUndo = useCallback(async () => {
    if (!lastRating || isAnimating.current) return
    isAnimating.current = true
    try {
      await updateSrsCard(lastRating.cardId, lastRating.prevState)
      setStats(s => ({ ...s, [lastRating.ratingKey]: Math.max(0, s[lastRating.ratingKey] - 1) }))
      setSessionIndex(lastRating.cardIndex)
      setFlipped(false)
      setDone(false)
      setLastRating(null)
    } catch (err) {
      console.error('Undo failed:', err)
    } finally {
      isAnimating.current = false
    }
  }, [lastRating])

  const handleMarkDone = async () => {
    let elapsed = 0
    if (sessionStartTime.current) {
      elapsed = flushSessionStats(sessionStartTime.current, sessionRatingCorrect.current, sessionRatingTotal.current)
      sessionStartTime.current = null
    }
    if (!sessionLogged.current && sessionRatedCount.current > 0 && !isGuest) {
      sessionLogged.current = true
      logStudySession(currentUser.id, sessionRatedCount.current, elapsed)
    }
    if (!isGuest && selectedDeckId && setupDecks) {
      const deck = setupDecks.find(d => d.id === selectedDeckId)
      if (deck?.reviewFrequency) {
        await applyFrequencyDeckReview(deck, currentUser.id).catch(console.error)
      }
    }
    setDone(true)
  }

  const handleRestart = () => {
    // Flush time + rating stats if session ended early, capture elapsed for Supabase log
    let elapsed = 0
    if (sessionStartTime.current) {
      elapsed = flushSessionStats(sessionStartTime.current, sessionRatingCorrect.current, sessionRatingTotal.current)
      sessionStartTime.current = null
    }
    // Log any cards rated before the user exits early
    if (!sessionLogged.current && sessionRatedCount.current > 0 && !isGuest) {
      sessionLogged.current = true
      logStudySession(currentUser.id, sessionRatedCount.current, elapsed)
    }
    _savedSession = null
    setLoadState('setup')
    setSessionCards(null)
    setLastRating(null)
  }

  // Keyboard shortcuts
  useEffect(() => {
    if (loadState !== 'ready') return
    const handler = (e) => {
      if ((e.key === 'z' || e.key === 'Z') && !isAnimating.current) { handleUndo(); return }
      if (done || !currentCard || isAnimating.current) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (!flipped) setFlipped(true)
      }
      if (flipped) {
        if (e.key === '1') handleRate(0)
        if (e.key === '2') handleRate(1)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [loadState, done, currentCard, flipped, handleRate, handleUndo])

  // ── Setup screen ──────────────────────────────────────────────────────────
  if (loadState === 'setup') {
    const selectedDeckTitle = selectedDeckId && setupDecks
      ? setupDecks.find(d => d.id === selectedDeckId)?.title
      : null

    return (
      <div className="flashcard-page">
        <div className="session-setup">
          <h2>Study Session</h2>
          <p className="setup-subtitle">Choose what you want to study</p>

          <div className="setup-row">
            <label>Deck</label>
            <select
              className="form-select"
              value={selectedDeckId || ''}
              onChange={e => setSelectedDeckId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">All Decks</option>
              {(setupDecks || [])
                .slice()
                .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }))
                .map(d => (
                  <option key={d.id} value={d.id}>{d.title}</option>
                ))}
            </select>
          </div>

          <div className="setup-row">
            <label>Mode</label>
            <div>
              <div className="mode-toggle">
                <button
                  className={isReviewMode ? 'active' : ''}
                  onClick={() => setIsReviewMode(true)}
                >
                  Due only
                </button>
                <button
                  className={!isReviewMode ? 'active' : ''}
                  onClick={() => setIsReviewMode(false)}
                >
                  All cards
                </button>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 6, marginBottom: 0 }}>
                {isReviewMode
                  ? 'Only cards your brain is scheduled to forget today — the most effective way to study.'
                  : 'Every card in the deck, shuffled. Good for first-time practice or refreshing a whole topic.'}
              </p>
            </div>
          </div>

          <div className="setup-row">
            <label>Limit</label>
            <select
              className="form-select"
              value={sessionLimit ?? 'all'}
              onChange={e => setSessionLimit(e.target.value === 'all' ? null : Number(e.target.value))}
            >
              <option value={10}>10 cards</option>
              <option value={20}>20 cards</option>
              <option value={50}>50 cards</option>
              <option value="all">All cards</option>
            </select>
          </div>

          {selectedDeckId && setupDecks?.find(d => d.id === selectedDeckId)?.reviewFrequency && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--color-brand-muted)', border: '1px solid var(--color-brand)', fontSize: '0.83rem', color: 'var(--color-text)', marginBottom: 8 }}>
              <RefreshCw size={13} style={{ color: 'var(--color-brand)', flexShrink: 0 }} />
              This deck has a fixed review schedule — all cards will be shown.
            </div>
          )}

          <div className="setup-advanced">
            <button
              className="setup-advanced-toggle"
              onClick={() => setShowAdvanced(a => !a)}
            >
              <span>Advanced</span>
              {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showAdvanced && (
              <div className="setup-advanced-body">
                <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
                  Customise what each side of the flashcard shows. Cards missing the selected fields are automatically skipped.
                </p>
                <div className="setup-row">
                  <label>Front</label>
                  <select
                    className="form-select"
                    value={frontField}
                    onChange={e => setFrontField(e.target.value)}
                  >
                    {FIELD_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="setup-row">
                  <label>Back</label>
                  <select
                    className="form-select"
                    value={backField}
                    onChange={e => setBackField(e.target.value)}
                  >
                    {FIELD_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <button className="btn btn-primary setup-start-btn" onClick={handleStart}>
            Start →
          </button>

          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <Link to="/dashboard" className="btn btn-ghost btn-sm">← Back to Dashboard</Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loadState === 'loading') {
    return (
      <div className="flashcard-page">
        <div className="loading-screen" style={{ minHeight: 'auto', padding: 60 }}>
          <div className="spinner" />
          <span>Loading cards…</span>
        </div>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (loadState === 'error') {
    return (
      <div className="flashcard-page">
        <div className="session-complete">
          <h2>Failed to load cards</h2>
          <p style={{ color: 'var(--color-text-muted)' }}>Check your connection and try again.</p>
          <button className="btn btn-secondary" onClick={() => setLoadState('setup')}>← Back</button>
        </div>
      </div>
    )
  }

  // ── No cards ──────────────────────────────────────────────────────────────
  if (sessionCards !== null && sessionCards.length === 0) {
    const deckLabel = selectedDeckId && deckMap[selectedDeckId]
      ? `"${deckMap[selectedDeckId]}"`
      : 'your decks'
    return (
      <div className="flashcard-page">
        <div className="session-complete">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, color: 'var(--color-brand)' }}><Sparkles size={48} strokeWidth={1.25} /></div>
          <h2 className="session-complete-title">
            {isReviewMode ? 'All caught up!' : `No cards in ${deckLabel}`}
          </h2>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 24 }}>
            {isReviewMode
              ? 'No cards are due for review right now. Come back tomorrow!'
              : 'Add words to your word bank to start practicing.'}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={handleRestart}>← Change Session</button>
            <Link to="/word-bank" className="btn btn-primary">Word Bank</Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Session complete ───────────────────────────────────────────────────────
  if (done) {
    const total = sessionCards.length
    const ratingBreakdown = [
      { label: 'Hard', count: stats.hard, color: 'var(--color-danger)' },
      { label: 'Easy', count: stats.easy, color: 'var(--color-success)' },
    ]
    return (
      <div className="flashcard-page">
        <div className="session-complete">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, color: 'var(--color-success)' }}><CheckCircle2 size={48} strokeWidth={1.25} /></div>
          <h2 className="session-complete-title">Session complete!</h2>
          <p style={{ color: 'var(--color-text-muted)' }}>
            You reviewed {total} card{total !== 1 ? 's' : ''}.
          </p>

          <div className="session-stats">
            {ratingBreakdown.map(r => (
              <div key={r.label} className="session-stat">
                <div className="session-stat-value" style={{ color: r.color }}>{r.count}</div>
                <div className="session-stat-label">{r.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {lastRating && (
              <button className="btn btn-secondary" onClick={handleUndo} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <RotateCcw size={14} /> Undo Last Rating
              </button>
            )}
            <Link to="/dashboard" className="btn btn-secondary">← Dashboard</Link>
            <button className="btn btn-primary" onClick={handleRestart}>New Session</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Active session ────────────────────────────────────────────────────────
  const isFrequencySession = !!(selectedDeckId && setupDecks?.find(d => d.id === selectedDeckId)?.reviewFrequency)
  const progress = sessionIndex / sessionCards.length
  const word = currentCard.word
  const isCustomMode = frontField !== 'arabic' || backField !== 'english'
  const frontValue = getFieldValue(word, frontField)
  const backValue = getFieldValue(word, backField)
  const frontIsArabic = ARABIC_FIELDS.has(frontField)
  const backIsArabic = ARABIC_FIELDS.has(backField)
  const frontLabel = FIELD_OPTIONS.find(o => o.value === frontField)?.label
  const backLabel = FIELD_OPTIONS.find(o => o.value === backField)?.label

  return (
    <div className="flashcard-page">
      <div className="flashcard-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={handleRestart}>← End</button>
            {isFrequencySession && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleMarkDone}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-brand)' }}
                title="Mark this deck as reviewed and reset the schedule"
              >
                <CheckCircle2 size={13} /> Mark Done
              </button>
            )}
            {lastRating && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleUndo}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                title="Undo last rating (Z)"
              >
                <RotateCcw size={13} /> Undo
              </button>
            )}
          </div>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            {isReviewMode ? 'Review' : 'Practice'}
            {selectedDeckId && deckMap[selectedDeckId] ? ` · ${deckMap[selectedDeckId]}` : ''}
            {' · '}{sessionIndex + 1} / {sessionCards.length}
          </span>
          <span className={`srs-badge ${getSRSStatus(currentCard)}`} style={{ textTransform: 'capitalize' }}>
            {getSRSStatus(currentCard)}
          </span>
        </div>
        <div className="progress-bar-wrapper">
          <div className="progress-bar-fill" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="progress-label">{sessionIndex} of {sessionCards.length} done</div>
      </div>

      <div className="flashcard-container">
        {/* Flashcard */}
        <div
          className="flashcard-scene"
          onClick={handleFlip}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleFlip() } }}
          aria-label={flipped ? 'Click to flip back' : 'Click to reveal answer'}
        >
          <div className={`flashcard${flipped ? ' flipped' : ''}`}>
            {/* Front */}
            <div className="flashcard-face flashcard-front">
              {isCustomMode ? (
                <>
                  <div className="flashcard-custom-label">{frontLabel}</div>
                  <div className={frontIsArabic ? 'flashcard-arabic' : 'flashcard-english'} style={frontIsArabic && word.color ? { color: word.color } : undefined}>
                    {frontValue}
                  </div>
                  {frontIsArabic && <SpeakButton text={frontValue} size={16} />}
                  <div className="flashcard-hint">Click or press Space to reveal</div>
                </>
              ) : (
                <>
                  <div className="flashcard-arabic" style={{ color: word.color || undefined }}>{word.arabic}</div>
                  <SpeakButton text={word.arabic} size={16} />

                  {(() => {
                    const pos = (word.partOfSpeech || '').toLowerCase()
                    const isVerb = pos === 'verb'
                    const isNounAdj = pos === 'noun' || pos === 'adjective'
                    const verbForms = [
                      { label: 'Past',    value: word.past },
                      { label: 'Present', value: word.present },
                      { label: 'Command', value: word.command },
                      { label: 'Masdar',  value: word.masdar },
                    ]
                    const nounForms = [
                      { label: 'Singular', value: word.singular },
                      { label: 'Dual',     value: word.dual },
                      { label: 'Plural',   value: word.plural },
                    ]
                    const forms = isVerb ? verbForms : isNounAdj ? nounForms : [...verbForms, ...nounForms]
                    const hasForms = forms.some(f => f.value)
                    return (
                      <>
                        <button
                          className="forms-btn"
                          onClick={(e) => { e.stopPropagation(); setShowForms(f => !f) }}
                        >
                          {showForms ? 'Hide Forms' : 'Forms'}
                        </button>
                        {showForms ? (
                          <div className="forms-grid" onClick={(e) => e.stopPropagation()}>
                            {!hasForms
                              ? <div className="forms-grid-empty">No forms added yet</div>
                              : forms.map(f => (
                                  <div key={f.label} className="forms-grid-cell">
                                    <span className="forms-grid-label">{f.label}</span>
                                    <span className="forms-grid-value arabic">{f.value || '—'}</span>
                                  </div>
                                ))
                            }
                          </div>
                        ) : (
                          <>
                            {word.partOfSpeech && (
                              <div style={{
                                background: 'var(--color-primary-muted)',
                                color: 'var(--color-primary)',
                                padding: '3px 12px',
                                borderRadius: 'var(--radius-full)',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                marginBottom: 4,
                              }}>
                                {word.partOfSpeech}
                              </div>
                            )}
                            {word.root && (
                              <div className="arabic" style={{ color: 'var(--color-text-muted)', fontSize: '0.95rem', marginBottom: 8 }}>
                                Root: {word.root}
                              </div>
                            )}
                            <div className="flashcard-hint">Click or press Space to reveal</div>
                          </>
                        )}
                      </>
                    )
                  })()}
                </>
              )}
            </div>

            {/* Back */}
            <div className="flashcard-face flashcard-back">
              {isCustomMode ? (
                <>
                  <div className="flashcard-custom-label">{backLabel}</div>
                  <div className={backIsArabic ? 'flashcard-arabic' : 'flashcard-english'}>
                    {backValue}
                  </div>
                  {backIsArabic && <SpeakButton text={backValue} size={16} />}
                  {/* Context: show the word's arabic + english below */}
                  <div style={{ marginTop: 16, fontSize: '0.82rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                    <span className="arabic">{word.arabic}</span> — {word.english}
                  </div>
                </>
              ) : (
                <>
                  <div className="flashcard-english">{word.english}</div>
                  {word.root && <div className="flashcard-root">Root: {word.root}</div>}
                  {word.partOfSpeech && <div className="flashcard-pos">{word.partOfSpeech}</div>}
                  {word.notes && (
                    <div style={{
                      marginTop: 12,
                      padding: '8px 12px',
                      background: 'var(--color-warning-bg)',
                      borderLeft: '3px solid var(--color-warning)',
                      borderRadius: '0 var(--radius) var(--radius) 0',
                      fontSize: '0.83rem',
                      color: 'var(--color-text)',
                      fontStyle: 'italic',
                      textAlign: 'left',
                    }}>
                      {word.notes}
                    </div>
                  )}
                </>
              )}
              {word.deckId && deckMap[word.deckId] && (
                <div style={{ marginTop: 16, opacity: 0.7, fontSize: '0.8rem' }}>
                  {deckMap[word.deckId]}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Rating buttons below the card */}
        <div className="rating-buttons-below" style={{ visibility: flipped ? 'visible' : 'hidden', opacity: flipped ? 1 : 0 }}>
          {RATING_LABELS.map((label, i) => (
            <button
              key={label}
              className={`rating-btn ${RATING_CLASSES[i]}`}
              onClick={() => handleRate(i)}
              disabled={isAnimating.current}
            >
              <span className="rating-label">{label}</span>
              <span className="rating-interval">{intervals[i]}</span>
            </button>
          ))}
        </div>

        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center', minHeight: '1.2em' }}>
          {flipped
            ? 'Keyboard: 1=Hard  2=Easy'
            : 'Press Space or click the card to reveal the answer'}
        </p>
      </div>
    </div>
  )
}
