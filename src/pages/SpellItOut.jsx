import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getUserWords, getUserDecks, normalizeDeck, normalizeWord } from '../lib/dataService'
import SpeakButton, { speakArabic } from '../components/SpeakButton'
import { BookOpen, Headphones } from 'lucide-react'

// ── Arabic keyboard ────────────────────────────────────────────────────────
const ARABIC_LETTERS = [
  'ا','أ','إ','آ','ب','ت','ث','ج','ح','خ','د',
  'ذ','ر','ز','س','ش','ص','ض','ط',
  'ظ','ع','غ','ف','ق','ك','ل','م',
  'ن','ه','و','ؤ','ي','ئ','ء',
]
const HARAKAT_KEYS = [
  { label: 'اَ', value: '\u064E', title: 'Fatha (a)' },
  { label: 'اِ', value: '\u0650', title: 'Kasra (i)' },
  { label: 'اُ', value: '\u064F', title: 'Damma (u)' },
  { label: 'اْ', value: '\u0652', title: 'Sukun' },
  { label: 'اّ', value: '\u0651', title: 'Shadda' },
  { label: 'اً', value: '\u064B', title: 'Tanwin Fath (an)' },
  { label: 'اٍ', value: '\u064D', title: 'Tanwin Kasr (in)' },
  { label: 'اٌ', value: '\u064C', title: 'Tanwin Damm (un)' },
]

function ArabicKeyboard({ onLetter, onBackspace }) {
  return (
    <div className="arabic-keyboard">
      {ARABIC_LETTERS.map(l => (
        <button key={l} className="arabic-key" onMouseDown={e => { e.preventDefault(); onLetter(l) }}>
          {l}
        </button>
      ))}
      <button className="arabic-key arabic-key-backspace" onMouseDown={e => { e.preventDefault(); onBackspace() }}>
        ⌫
      </button>
      <div className="arabic-keyboard-divider" />
      {HARAKAT_KEYS.map(h => (
        <button key={h.value} className="arabic-key arabic-key-harakat" title={h.title}
          onMouseDown={e => { e.preventDefault(); onLetter(h.value) }}>
          {h.label}
        </button>
      ))}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Strip diacritics/vowel marks — answers are accepted with or without harakat
const stripVowels = (s) =>
  s.replace(/[\u0610-\u061A\u064B-\u065F\u0670]/g, '').trim()

const COUNT_OPTIONS = [10, 20, 50, 'All']

export default function SpellItOut() {
  const { currentUser, isGuest, guestData } = useAuth()

  // ── Setup ─────────────────────────────────────────────────────────────────
  const [phase,          setPhase]          = useState('setup')
  const [decks,          setDecks]          = useState([])
  const [allWords,       setAllWords]       = useState([])
  const [selectedDeckId, setSelectedDeckId] = useState(null)
  const [questionCount,  setQuestionCount]  = useState(10)
  const [listeningMode,  setListeningMode]  = useState(true)
  const [setupLoading,   setSetupLoading]   = useState(true)

  // ── Game ──────────────────────────────────────────────────────────────────
  const [questions,  setQuestions]  = useState([])   // [{word}]
  const [qIndex,     setQIndex]     = useState(0)
  const [userInput,  setUserInput]  = useState('')
  const [submitted,  setSubmitted]  = useState(false) // whether this q has been answered
  const [isCorrect,  setIsCorrect]  = useState(false)
  const [score,      setScore]      = useState(0)
  const [results,    setResults]    = useState([])    // [{word, userAnswer, correct}]

  const inputRef    = useRef(null)
  const advanceRef  = useRef(null)

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

  const canPlay = filteredWords.length >= 1

  // Focus input when a new question starts
  useEffect(() => {
    if (phase === 'playing' && !submitted) {
      inputRef.current?.focus()
    }
  }, [phase, qIndex, submitted])

  // Auto-play audio when a new question loads in listening mode
  useEffect(() => {
    if (phase === 'playing' && listeningMode && questions[qIndex]) {
      speakArabic(questions[qIndex].arabic).catch(() => {})
    }
  }, [phase, qIndex, listeningMode, questions])

  // ── Start ─────────────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    const pool  = shuffle(filteredWords)
    const limit = questionCount === 'All'
      ? pool.length
      : Math.min(questionCount, pool.length)
    setQuestions(pool.slice(0, limit))
    setQIndex(0)
    setUserInput('')
    setSubmitted(false)
    setIsCorrect(false)
    setScore(0)
    setResults([])
    setPhase('playing')
  }, [filteredWords, questionCount])

  // ── Submit answer ─────────────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    if (submitted || !userInput.trim()) return
    const word    = questions[qIndex]
    const correct = stripVowels(userInput) === stripVowels(word.arabic)
    setSubmitted(true)
    setIsCorrect(correct)
    if (correct) setScore(s => s + 1)
    setResults(r => [...r, { word, userAnswer: userInput.trim(), correct }])

    // Auto-advance on correct answer after brief green flash
    if (correct) {
      advanceRef.current = setTimeout(() => handleAdvance(), 900)
    }
  }, [submitted, userInput, questions, qIndex])

  // ── Advance to next question ──────────────────────────────────────────────
  const handleAdvance = useCallback(() => {
    clearTimeout(advanceRef.current)
    const nextIndex = qIndex + 1
    if (nextIndex >= questions.length) {
      setPhase('complete')
    } else {
      setQIndex(nextIndex)
      setUserInput('')
      setSubmitted(false)
      setIsCorrect(false)
    }
  }, [qIndex, questions.length])

  // Cleanup auto-advance on unmount
  useEffect(() => () => clearTimeout(advanceRef.current), [])

  // ── Keyboard: Enter to submit or advance ──────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return
    const handler = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (!submitted) handleSubmit()
        else if (!isCorrect) handleAdvance()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, submitted, isCorrect, handleSubmit, handleAdvance])

  // ── On-screen keyboard ────────────────────────────────────────────────────
  const handleKeyLetter = useCallback((letter) => {
    if (submitted) return
    setUserInput(v => v + letter)
    inputRef.current?.focus()
  }, [submitted])

  const handleKeyBackspace = useCallback(() => {
    if (submitted) return
    setUserInput(v => v.slice(0, -1))
    inputRef.current?.focus()
  }, [submitted])

  // ── Setup screen ──────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">🔤 Spell It Out</h1>
          <p className="page-subtitle">See the English meaning — type the Arabic word from memory</p>
        </div>

        <div className="session-setup" style={{ maxWidth: 440 }}>
          <h2>New Game</h2>
          <p className="setup-subtitle">
            {listeningMode
              ? 'Listen to the Arabic word · type what you hear · vowels optional'
              : 'See the English meaning · type the Arabic word · vowels optional'}
          </p>

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
                      <option key={d.id} value={d.id} disabled={count < 1}>
                        {d.title} ({count} words)
                      </option>
                    )
                  })}
                </select>
              </div>

              <div className="setup-row">
                <label>Mode</label>
                <div className="mode-toggle">
                  <button
                    className={!listeningMode ? 'active' : ''}
                    onClick={() => setListeningMode(false)}
                  >
                    <BookOpen size={14} strokeWidth={1.75} /> Reading
                  </button>
                  <button
                    className={listeningMode ? 'active' : ''}
                    onClick={() => setListeningMode(true)}
                  >
                    <Headphones size={14} strokeWidth={1.75} /> Listening
                  </button>
                </div>
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
                  Need at least 1 word to play.{' '}
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
    const wrong = total - score
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
      <div className="page-container" style={{ maxWidth: 680 }}>
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
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 36 }}>
            <Link to="/games" className="btn btn-secondary">← Games</Link>
            <button className="btn btn-primary" onClick={handleStart}>Play Again</button>
          </div>
        </div>

        {/* Review list */}
        <div style={{ marginTop: 8 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 14, color: 'var(--color-text-muted)' }}>
            Review
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {results.map((r, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: r.correct ? 'var(--color-success-bg, rgba(15,167,110,0.08))' : 'var(--color-danger-bg)',
                  border: `1px solid ${r.correct ? 'rgba(15,167,110,0.2)' : 'rgba(212,86,86,0.2)'}`,
                }}
              >
                <div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: 3 }}>
                    {r.word.english}
                    {r.word.partOfSpeech && (
                      <span style={{ marginLeft: 8, fontSize: '0.75rem', opacity: 0.7 }}>{r.word.partOfSpeech}</span>
                    )}
                  </div>
                  <div style={{ fontFamily: 'var(--font-arabic)', fontSize: '1.2rem', direction: 'rtl', color: 'var(--color-text)' }}>
                    {r.word.arabic}
                  </div>
                  {!r.correct && r.userAnswer && (
                    <div style={{ marginTop: 4, fontSize: '0.8rem', color: 'var(--color-danger)', fontFamily: 'var(--font-arabic)', direction: 'rtl' }}>
                      You wrote: {r.userAnswer}
                    </div>
                  )}
                  {!r.correct && !r.userAnswer && (
                    <div style={{ marginTop: 4, fontSize: '0.8rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                      Skipped
                    </div>
                  )}
                </div>
                <div style={{ fontSize: '1.1rem' }}>
                  {r.correct ? '✓' : '✗'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Playing ───────────────────────────────────────────────────────────────
  const word     = questions[qIndex]
  const progress = qIndex / questions.length
  const wrong    = questions.length - score - (submitted ? 0 : 0) // running wrong count from results

  return (
    <div className="page-container" style={{ maxWidth: 640, margin: '0 auto' }}>

      {/* Header */}
      <div className="memory-header" style={{ marginBottom: 8 }}>
        <Link to="/games" className="btn btn-ghost btn-sm">← Games</Link>
        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
          {qIndex + 1} / {questions.length}
        </span>
        <span style={{ fontSize: '0.85rem' }}>
          <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>✓ {score}</span>
          <span style={{ color: 'var(--color-danger)', marginLeft: 10 }}>
            ✗ {results.filter(r => !r.correct).length}
          </span>
        </span>
      </div>

      {/* Progress bar */}
      <div className="progress-bar-wrapper" style={{ marginBottom: 28 }}>
        <div className="progress-bar-fill" style={{ width: `${progress * 100}%`, transition: 'width 0.3s ease' }} />
      </div>

      {/* Question card */}
      <div className="mc-question-card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 10 }}>
          Spell in Arabic
        </div>

        {listeningMode ? (
          /* ── Listening mode: speaker button, reveal English after guess ── */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <SpeakButton text={word.arabic} size={36} className="speak-btn-lg" />
            {submitted ? (
              <>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.3, marginTop: 4 }}>
                  {word.english}
                </div>
                {word.partOfSpeech && (
                  <span className="mc-pos-badge">{word.partOfSpeech}</span>
                )}
                {word.root && (
                  <div className="mc-root">Root: <span className="arabic">{word.root}</span></div>
                )}
              </>
            ) : (
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                Tap the speaker to replay
              </div>
            )}
          </div>
        ) : (
          /* ── Reading mode: show English as before ── */
          <>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.3 }}>
              {word.english}
            </div>
            {word.partOfSpeech && (
              <span className="mc-pos-badge" style={{ marginTop: 10 }}>{word.partOfSpeech}</span>
            )}
            {word.root && (
              <div className="mc-root" style={{ marginTop: 8 }}>Root: <span className="arabic">{word.root}</span></div>
            )}
          </>
        )}
      </div>

      {/* Answer input — large writing area for pen/stylus input */}
      <div
        style={{
          padding: '16px',
          borderRadius: 'var(--radius-lg)',
          border: `2px solid ${
            !submitted        ? 'var(--color-border-medium)' :
            isCorrect         ? 'rgba(15,167,110,0.5)'       :
                                'rgba(212,86,86,0.5)'
          }`,
          background: !submitted ? 'var(--color-surface)' :
                      isCorrect  ? 'rgba(15,167,110,0.06)' :
                                   'var(--color-danger-bg)',
          transition: 'border-color 0.2s, background 0.2s',
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 6 }}>
          Type or write your answer
        </div>
        <textarea
          ref={inputRef}
          value={userInput}
          onChange={e => { if (!submitted) setUserInput(e.target.value.replace(/\n/g, '')) }}
          onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
          placeholder="Type or write the Arabic word…"
          readOnly={submitted}
          rows={3}
          style={{
            width: '100%',
            border: 'none',
            background: 'transparent',
            outline: 'none',
            fontFamily: 'var(--font-arabic)',
            fontSize: '2rem',
            direction: 'rtl',
            textAlign: 'right',
            color: 'var(--color-text)',
            resize: 'none',
            lineHeight: 1.6,
          }}
        />

        {/* Feedback row */}
        {submitted && (
          <div style={{ marginTop: 10, fontSize: '0.9rem' }}>
            {isCorrect ? (
              <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>Correct!</span>
            ) : (
              <span>
                <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>Incorrect — </span>
                <span style={{ color: 'var(--color-text-muted)' }}>correct answer: </span>
                <span style={{ fontFamily: 'var(--font-arabic)', fontSize: '1.1rem', direction: 'rtl', color: word.color || 'var(--color-text)' }}>
                  {word.arabic}
                </span>
                <SpeakButton text={word.arabic} />
              </span>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {!submitted ? (
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={handleSubmit}
            disabled={!userInput.trim()}
          >
            Submit
          </button>
        ) : !isCorrect ? (
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleAdvance}>
            {qIndex + 1 >= questions.length ? 'See Results →' : 'Next →'}
          </button>
        ) : null}
      </div>

      {!submitted && (
        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 16 }}>
          Press Enter to submit · vowels optional
        </p>
      )}
      {submitted && !isCorrect && (
        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 16 }}>
          Press Enter to continue
        </p>
      )}

      {/* On-screen keyboard */}
      <ArabicKeyboard onLetter={handleKeyLetter} onBackspace={handleKeyBackspace} />
    </div>
  )
}
