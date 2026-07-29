import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getUserWords, getUserDecks, normalizeDeck, normalizeWord } from '../lib/dataService'
import SpeakButton from '../components/SpeakButton'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Pick 3 distractors for a given word.
 * Priority: same root → same part of speech → same deck → anything else.
 * Also excludes words with identical English text to avoid ambiguous questions.
 */
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

  // 1. Same root (most confusable — same trilateral root, different form)
  if (correctWord.root && correctWord.root.trim()) {
    addFrom(allWords.filter(w => w.root === correctWord.root))
  }

  // 2. Same part of speech (e.g. all verbs, all nouns)
  if (chosen.length < 3 && correctWord.partOfSpeech) {
    addFrom(allWords.filter(w => w.partOfSpeech === correctWord.partOfSpeech))
  }

  // 3. Same deck (topically related)
  if (chosen.length < 3) {
    addFrom(allWords.filter(w => w.deckId === correctWord.deckId))
  }

  // 4. Fill from everything else
  if (chosen.length < 3) {
    addFrom(allWords)
  }

  return chosen.slice(0, 3)
}

const OPTION_LABELS = ['A', 'B', 'C', 'D']
const COUNT_OPTIONS = [10, 20, 50, 'All']

export default function MultipleChoice() {
  const { currentUser, isGuest, guestData } = useAuth()

  // ── Setup state ───────────────────────────────────────────────────────────
  const [phase,          setPhase]          = useState('setup')
  const [decks,          setDecks]          = useState([])
  const [allWords,       setAllWords]       = useState([])
  const [selectedDeckId, setSelectedDeckId] = useState(null)
  const [questionCount,  setQuestionCount]  = useState(10)
  const [setupLoading,   setSetupLoading]   = useState(true)

  // ── Game state ────────────────────────────────────────────────────────────
  const [questions, setQuestions] = useState([])
  const [qIndex,    setQIndex]    = useState(0)
  const [selected,  setSelected]  = useState(null) // option index the user picked
  const [score,     setScore]     = useState(0)
  const [wrong,     setWrong]     = useState(0)

  // Load words + decks
  useEffect(() => {
    if (isGuest) {
      setAllWords(guestData.words)
      setDecks([...guestData.decks].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })))
      setSetupLoading(false)
      return
    }
    if (!currentUser) return
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

  // Need at least 4 words globally for distractors
  const canPlay = filteredWords.length >= 4 && allWords.length >= 4

  // Build question list
  const handleStart = useCallback(() => {
    const pool  = shuffle(filteredWords)
    const limit = questionCount === 'All'
      ? pool.length
      : Math.min(questionCount, pool.length)
    const chosen = pool.slice(0, limit)

    const built = chosen.map(word => {
      const distractors = getDistractors(word, allWords)
      const options = shuffle([
        { text: word.english, correct: true },
        ...distractors.map(d => ({ text: d.english, correct: false })),
      ])
      return { word, options }
    })

    setQuestions(built)
    setQIndex(0)
    setSelected(null)
    setScore(0)
    setWrong(0)
    setPhase('playing')
  }, [filteredWords, allWords, questionCount])

  const handleSelect = useCallback((idx) => {
    if (selected !== null) return
    setSelected(idx)
    if (questions[qIndex].options[idx].correct) {
      setScore(s => s + 1)
    } else {
      setWrong(w => w + 1)
    }
  }, [selected, questions, qIndex])

  const handleNext = useCallback(() => {
    if (qIndex + 1 >= questions.length) {
      setPhase('complete')
    } else {
      setQIndex(i => i + 1)
      setSelected(null)
    }
  }, [qIndex, questions.length])

  // Keyboard: A/B/C/D or 1/2/3/4 to pick; Enter/Space to advance
  useEffect(() => {
    if (phase !== 'playing') return
    const handler = (e) => {
      if (selected !== null) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleNext() }
        return
      }
      const map = { a: 0, b: 1, c: 2, d: 3, 1: 0, 2: 1, 3: 2, 4: 3 }
      const idx = map[e.key.toLowerCase()]
      if (idx !== undefined && idx < 4) handleSelect(idx)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, selected, handleSelect, handleNext])

  // ── Setup screen ──────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">🧠 Multiple Choice</h1>
          <p className="page-subtitle">Pick the correct translation — distractors share roots or parts of speech</p>
        </div>

        <div className="session-setup" style={{ maxWidth: 440 }}>
          <h2>New Game</h2>
          <p className="setup-subtitle">4 options per question · distractors chosen by root and type</p>

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

              <div className="setup-row">
                <label>Questions</label>
                <div className="mode-toggle">
                  {COUNT_OPTIONS.map(n => (
                    <button
                      key={n}
                      className={questionCount === n ? 'active' : ''}
                      onClick={() => setQuestionCount(n)}
                      disabled={n !== 'All' && filteredWords.length < n}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {canPlay ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                  {filteredWords.length} words available
                </p>
              ) : (
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
    const total = questions.length
    const pct   = Math.round((score / total) * 100)
    const grade =
      pct === 100 ? 'A+' :
      pct >= 90   ? 'A'  :
      pct >= 75   ? 'B'  :
      pct >= 60   ? 'C'  : 'D'
    const gradeColor =
      pct >= 90 ? 'var(--color-success)' :
      pct >= 60 ? 'var(--color-warning)' : 'var(--color-danger)'

    return (
      <div className="page-container">
        <div className="session-complete">
          <div className="mc-grade" style={{ color: gradeColor }}>{grade}</div>
          <h2 className="session-complete-title">
            {pct === 100 ? 'Perfect score!' : pct >= 75 ? 'Well done!' : pct >= 50 ? 'Keep practising' : 'Need more review'}
          </h2>
          <div className="session-stats">
            <div className="session-stat">
              <div className="session-stat-value" style={{ color: 'var(--color-primary)' }}>{pct}%</div>
              <div className="session-stat-label">Score</div>
            </div>
            <div className="session-stat">
              <div className="session-stat-value" style={{ color: 'var(--color-success)' }}>{score}</div>
              <div className="session-stat-label">Correct</div>
            </div>
            <div className="session-stat">
              <div className="session-stat-value" style={{ color: 'var(--color-danger)' }}>{wrong}</div>
              <div className="session-stat-label">Wrong</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/games" className="btn btn-secondary">← Games</Link>
            <button className="btn btn-primary" onClick={handleStart}>Play Again</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Playing ───────────────────────────────────────────────────────────────
  const q         = questions[qIndex]
  const progress  = qIndex / questions.length
  const answered  = selected !== null
  const correctIdx = q.options.findIndex(o => o.correct)

  return (
    <div className="page-container" style={{ maxWidth: 640, margin: '0 auto' }}>

      {/* Header */}
      <div className="memory-header" style={{ marginBottom: 8 }}>
        <Link to="/games" className="btn btn-ghost btn-sm">← Games</Link>
        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
          {qIndex + 1} / {questions.length}
        </span>
        <span style={{ fontSize: '0.85rem', color: 'var(--color-success)', fontWeight: 600 }}>
          ✓ {score}
          <span style={{ color: 'var(--color-danger)', marginLeft: 10 }}>✗ {wrong}</span>
        </span>
      </div>

      {/* Progress bar */}
      <div className="progress-bar-wrapper" style={{ marginBottom: 28 }}>
        <div className="progress-bar-fill" style={{ width: `${progress * 100}%`, transition: 'width 0.3s ease' }} />
      </div>

      {/* Question card */}
      <div className="mc-question-card">
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
            if (i === correctIdx)           cls += ' correct'
            else if (i === selected)        cls += ' wrong'
            else                            cls += ' dimmed'
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

      {/* Next button — appears after answering */}
      {answered && (
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button className="btn btn-primary" onClick={handleNext} autoFocus>
            {qIndex + 1 >= questions.length ? 'See Results →' : 'Next →'}
          </button>
          <p style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Press Enter or Space to continue
          </p>
        </div>
      )}

      {!answered && (
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          Keyboard: A B C D  or  1 2 3 4
        </p>
      )}

    </div>
  )
}
