// v1.9.3
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getUserWords, getUserDecks, normalizeDeck, normalizeWord } from '../lib/dataService'
import SpeakButton from '../components/SpeakButton'

const TIMER_SECONDS = 60

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function getDistractors(correctWord, allWords) {
  const excludeIds  = new Set([correctWord.id])
  const excludeText = new Set([correctWord.english.trim().toLowerCase()])
  const chosen = []

  const addFrom = (candidates) => {
    const pool = shuffle(
      candidates.filter(w =>
        !excludeIds.has(w.id) &&
        !excludeText.has(w.english.trim().toLowerCase())
      )
    )
    for (const w of pool) {
      if (chosen.length >= 3) break
      chosen.push(w)
      excludeIds.add(w.id)
      excludeText.add(w.english.trim().toLowerCase())
    }
  }

  if (correctWord.root && correctWord.root.trim()) {
    addFrom(allWords.filter(w => w.root === correctWord.root))
  }
  if (chosen.length < 3 && correctWord.partOfSpeech) {
    addFrom(allWords.filter(w => w.partOfSpeech === correctWord.partOfSpeech))
  }
  if (chosen.length < 3) {
    addFrom(allWords.filter(w => w.deckId === correctWord.deckId))
  }
  if (chosen.length < 3) {
    addFrom(allWords)
  }

  return chosen.slice(0, 3)
}

function buildQuestions(pool, allWords) {
  return pool.map(word => {
    const distractors = getDistractors(word, allWords)
    const options = shuffle([
      { text: word.english, correct: true },
      ...distractors.map(d => ({ text: d.english, correct: false })),
    ])
    return { word, options }
  })
}

const OPTION_LABELS = ['A', 'B', 'C', 'D']

const BEST_SCORE_KEY = (userId) => `kalimat_sr_best_${userId}`

export default function SpeedRound() {
  const { currentUser, isGuest, guestData } = useAuth()

  // ── Setup ─────────────────────────────────────────────────────────────────
  const [phase,          setPhase]          = useState('setup')
  const [decks,          setDecks]          = useState([])
  const [allWords,       setAllWords]       = useState([])
  const [selectedDeckId, setSelectedDeckId] = useState(null)
  const [setupLoading,   setSetupLoading]   = useState(true)

  // ── Game ──────────────────────────────────────────────────────────────────
  const [questions,  setQuestions]  = useState([])
  const [qIndex,     setQIndex]     = useState(0)
  const [selected,   setSelected]   = useState(null)  // option idx
  const [score,      setScore]      = useState(0)
  const [wrong,      setWrong]      = useState(0)
  const [timeLeft,   setTimeLeft]   = useState(TIMER_SECONDS)
  const [feedback,   setFeedback]   = useState(null)  // 'correct' | 'wrong'
  const [bestScore,  setBestScore]  = useState(0)

  const timerRef    = useRef(null)
  const feedbackRef = useRef(null)

  useEffect(() => {
    if (isGuest) {
      setAllWords(guestData.words)
      setDecks([...guestData.decks].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })))
      setSetupLoading(false)
      return
    }
    if (!currentUser) return
    const saved = parseInt(localStorage.getItem(BEST_SCORE_KEY(currentUser.id)) || '0', 10)
    setBestScore(saved)
    Promise.all([
      getUserWords(currentUser.id),
      getUserDecks(currentUser.id),
    ]).then(([words, userDecks]) => {
      setAllWords(words.map(normalizeWord))
      setDecks(
        userDecks.map(normalizeDeck).sort((a, b) =>
          a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
        )
      )
      setSetupLoading(false)
    })
  }, [currentUser, isGuest, guestData])

  const filteredWords = selectedDeckId
    ? allWords.filter(w => w.deckId === selectedDeckId)
    : allWords

  const canPlay = filteredWords.length >= 4 && allWords.length >= 4

  // ── Timer ─────────────────────────────────────────────────────────────────
  const endGame = useCallback((finalScore) => {
    clearInterval(timerRef.current)
    clearTimeout(feedbackRef.current)
    if (currentUser) {
      const best = parseInt(localStorage.getItem(BEST_SCORE_KEY(currentUser.id)) || '0', 10)
      if (finalScore > best) {
        localStorage.setItem(BEST_SCORE_KEY(currentUser.id), String(finalScore))
        setBestScore(finalScore)
      }
    }
    setPhase('complete')
  }, [currentUser])

  useEffect(() => {
    if (phase !== 'playing') return
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          setScore(s => {
            endGame(s)
            return s
          })
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [phase, endGame])

  // ── Start ─────────────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    const pool = shuffle(filteredWords)
    const qs   = buildQuestions(pool, allWords)
    setQuestions(qs)
    setQIndex(0)
    setSelected(null)
    setScore(0)
    setWrong(0)
    setTimeLeft(TIMER_SECONDS)
    setFeedback(null)
    setPhase('playing')
  }, [filteredWords, allWords])

  // ── Answer ────────────────────────────────────────────────────────────────
  const advanceQuestion = useCallback(() => {
    setSelected(null)
    setFeedback(null)
    setQIndex(i => i + 1)  // questions are pre-shuffled, cycle via modulo in render
  }, [])

  const handleSelect = useCallback((idx) => {
    if (selected !== null || feedback !== null) return
    const isCorrect = questions[qIndex % questions.length].options[idx].correct
    setSelected(idx)
    setFeedback(isCorrect ? 'correct' : 'wrong')
    if (isCorrect) {
      setScore(s => s + 1)
    } else {
      setWrong(w => w + 1)
    }
    // Auto-advance after brief feedback window
    feedbackRef.current = setTimeout(advanceQuestion, isCorrect ? 500 : 900)
  }, [selected, feedback, questions, qIndex, advanceQuestion])

  // Keyboard: A/B/C/D or 1/2/3/4
  useEffect(() => {
    if (phase !== 'playing') return
    const handler = (e) => {
      const map = { a: 0, b: 1, c: 2, d: 3, 1: 0, 2: 1, 3: 2, 4: 3 }
      const idx = map[e.key.toLowerCase()]
      if (idx !== undefined) handleSelect(idx)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, handleSelect])

  // Cleanup on unmount
  useEffect(() => () => {
    clearInterval(timerRef.current)
    clearTimeout(feedbackRef.current)
  }, [])

  // ── Setup screen ──────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">⚡ Speed Round</h1>
          <p className="page-subtitle">Translate as many words as you can in {TIMER_SECONDS} seconds</p>
        </div>

        <div className="session-setup" style={{ maxWidth: 440 }}>
          <h2>New Game</h2>
          <p className="setup-subtitle">60 seconds · 4 options · endless questions</p>

          {setupLoading ? (
            <div className="spinner" style={{ margin: '32px auto', display: 'block' }} />
          ) : (
            <>
              <div className="setup-row">
                <label>Deck</label>
                <select
                  className="form-select"
                  value={selectedDeckId || ''}
                  onChange={e => setSelectedDeckId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">All Decks ({allWords.length} words)</option>
                  {decks.map(d => {
                    const count = allWords.filter(w => w.deckId === d.id).length
                    return (
                      <option key={d.id} value={d.id} disabled={count < 4}>
                        {d.title} ({count} words){count < 4 ? ' — need 4+' : ''}
                      </option>
                    )
                  })}
                </select>
              </div>

              {bestScore > 0 && (
                <div className="alert alert-success" style={{ marginTop: 12 }}>
                  Your best score: <strong>{bestScore} words</strong>
                </div>
              )}

              {!canPlay && (
                <div className="alert alert-danger" style={{ marginTop: 12 }}>
                  Need at least 4 words to play.{' '}
                  <Link to="/community">Import a deck →</Link>
                </div>
              )}

              <button
                className="btn btn-primary setup-start-btn"
                onClick={handleStart}
                disabled={!canPlay}
              >
                Start →
              </button>

              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <Link to="/games" className="btn btn-ghost btn-sm">← Back to Games</Link>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Complete screen ───────────────────────────────────────────────────────
  if (phase === 'complete') {
    const total     = score + wrong
    const isNewBest = score >= bestScore && score > 0
    return (
      <div className="page-container">
        <div className="session-complete">
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>
            {isNewBest ? '🏆' : score >= 10 ? '⚡' : '✅'}
          </div>
          <h2 className="session-complete-title">
            {isNewBest ? 'New best score!' : 'Time\'s up!'}
          </h2>
          <div className="session-stats">
            <div className="session-stat">
              <div className="session-stat-value" style={{ color: 'var(--color-primary)' }}>{score}</div>
              <div className="session-stat-label">Correct</div>
            </div>
            <div className="session-stat">
              <div className="session-stat-value" style={{ color: 'var(--color-danger)' }}>{wrong}</div>
              <div className="session-stat-label">Wrong</div>
            </div>
            <div className="session-stat">
              <div className="session-stat-value" style={{ color: 'var(--color-text-muted)' }}>{bestScore}</div>
              <div className="session-stat-label">Best</div>
            </div>
          </div>
          {total > 0 && (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: 24 }}>
              {Math.round((score / total) * 100)}% accuracy · {total} answered
            </p>
          )}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/games" className="btn btn-secondary">← Games</Link>
            <button className="btn btn-primary" onClick={handleStart}>Play Again</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Playing ───────────────────────────────────────────────────────────────
  const q          = questions[qIndex % questions.length]
  const correctIdx = q.options.findIndex(o => o.correct)
  const answered   = selected !== null
  const timerPct   = (timeLeft / TIMER_SECONDS) * 100
  const timerColor = timeLeft <= 10
    ? 'var(--color-danger)'
    : timeLeft <= 20
    ? 'var(--color-warning)'
    : 'var(--color-success)'

  return (
    <div className="page-container" style={{ maxWidth: 640, margin: '0 auto' }}>

      {/* Header */}
      <div className="memory-header" style={{ marginBottom: 8 }}>
        <Link to="/games" className="btn btn-ghost btn-sm">← Games</Link>
        <span className={`sr-timer${timeLeft <= 10 ? ' sr-timer-urgent' : ''}`} style={{ color: timerColor }}>
          {timeLeft}s
        </span>
        <span style={{ fontSize: '0.85rem' }}>
          <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>✓ {score}</span>
          {wrong > 0 && (
            <span style={{ color: 'var(--color-danger)', marginLeft: 10 }}>✗ {wrong}</span>
          )}
        </span>
      </div>

      {/* Timer bar */}
      <div className="progress-bar-wrapper" style={{ marginBottom: 20 }}>
        <div
          className="progress-bar-fill"
          style={{
            width: `${timerPct}%`,
            background: timerColor,
            transition: 'width 1s linear, background 0.3s ease',
          }}
        />
      </div>

      {/* Question */}
      <div className={`mc-question-card sr-question-card${feedback ? ` sr-feedback-${feedback}` : ''}`}>
        <div className="mc-arabic" style={{ color: q.word.color || undefined }}>
          {q.word.arabic}
          <SpeakButton text={q.word.arabic} size={16} />
        </div>
        {q.word.partOfSpeech && (
          <span className="mc-pos-badge">{q.word.partOfSpeech}</span>
        )}
        {q.word.root && (
          <div className="mc-root">Root: <span className="arabic">{q.word.root}</span></div>
        )}
      </div>

      {/* Options */}
      <div className="mc-options">
        {q.options.map((opt, i) => {
          let cls = 'mc-option'
          if (answered) {
            if (i === correctIdx)          cls += ' correct'
            else if (i === selected)       cls += ' wrong'
            else                           cls += ' dimmed'
          }
          return (
            <button
              key={i}
              className={cls}
              onClick={() => handleSelect(i)}
              disabled={answered}
            >
              <span className="mc-option-key">{OPTION_LABELS[i]}</span>
              <span className="mc-option-text">{opt.text}</span>
              {answered && i === correctIdx && <span className="mc-icon">✓</span>}
              {answered && i === selected && !opt.correct && <span className="mc-icon">✗</span>}
            </button>
          )
        })}
      </div>

      <p style={{ textAlign: 'center', marginTop: 16, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
        Keyboard: A B C D  or  1 2 3 4
      </p>

    </div>
  )
}
