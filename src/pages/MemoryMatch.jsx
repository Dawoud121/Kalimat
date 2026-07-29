import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getUserWords, getUserDecks, normalizeDeck, normalizeWord } from '../lib/dataService'
import SpeakButton from '../components/SpeakButton'

const PAIRS = 8 // 8 pairs = 16 cards total

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function MemoryMatch() {
  const { currentUser, isGuest, guestData } = useAuth()

  // ── Setup state ───────────────────────────────────────────────────────────
  const [phase,          setPhase]          = useState('setup') // 'setup'|'playing'|'won'
  const [decks,          setDecks]          = useState([])
  const [allWords,       setAllWords]       = useState([])
  const [selectedDeckId, setSelectedDeckId] = useState(null)
  const [setupLoading,   setSetupLoading]   = useState(true)

  // ── Game state ────────────────────────────────────────────────────────────
  const [cards,    setCards]    = useState([])   // all 16 card objects
  const [revealed, setRevealed] = useState([])   // ids of the 1–2 currently face-up cards
  const [matched,  setMatched]  = useState(new Set()) // pairIds of confirmed matches
  const [rounds,   setRounds]   = useState(0)
  const [locked,   setLocked]   = useState(false) // block clicks during flip-back delay

  // Load decks + words once
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
      setDecks(userDecks.map(normalizeDeck).sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
      ))
      setSetupLoading(false)
    })
  }, [currentUser, isGuest, guestData])

  const filteredWords = selectedDeckId
    ? allWords.filter(w => w.deckId === selectedDeckId)
    : allWords

  const canPlay = filteredWords.length >= PAIRS

  // Build and shuffle 16 cards from 8 random words
  const handleStart = useCallback(() => {
    const pool = shuffle(filteredWords).slice(0, PAIRS)
    const cardList = []
    pool.forEach((word, i) => {
      cardList.push({ id: i * 2,     pairId: i, type: 'arabic',  content: word.arabic,  color: word.color })
      cardList.push({ id: i * 2 + 1, pairId: i, type: 'english', content: word.english, color: null })
    })
    setCards(shuffle(cardList))
    setRevealed([])
    setMatched(new Set())
    setRounds(0)
    setLocked(false)
    setPhase('playing')
  }, [filteredWords])

  // Card click
  const handleCardClick = useCallback((card) => {
    if (locked) return
    if (revealed.includes(card.id)) return
    if (matched.has(card.pairId)) return

    const newRevealed = [...revealed, card.id]
    setRevealed(newRevealed)

    if (newRevealed.length === 2) {
      const [id1, id2] = newRevealed
      const c1 = cards.find(c => c.id === id1)
      const c2 = cards.find(c => c.id === id2)

      setRounds(r => r + 1)
      setLocked(true)

      if (c1.pairId === c2.pairId) {
        // Correct match
        setTimeout(() => {
          setMatched(prev => {
            const next = new Set([...prev, c1.pairId])
            if (next.size === PAIRS) setPhase('won')
            return next
          })
          setRevealed([])
          setLocked(false)
        }, 500)
      } else {
        // Wrong — flip back after a pause so user can see both cards
        setTimeout(() => {
          setRevealed([])
          setLocked(false)
        }, 900)
      }
    }
  }, [locked, revealed, matched, cards])

  // ── Setup screen ──────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">🃏 Memory Match</h1>
          <p className="page-subtitle">Match Arabic words to their English meanings</p>
        </div>

        <div className="session-setup" style={{ maxWidth: 440 }}>
          <h2>New Game</h2>
          <p className="setup-subtitle">16 cards · {PAIRS} pairs · fewest rounds wins</p>

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
                      <option key={d.id} value={d.id} disabled={count < PAIRS}>
                        {d.title} ({count} words){count < PAIRS ? ' — need 8+' : ''}
                      </option>
                    )
                  })}
                </select>
              </div>

              {canPlay ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: 6 }}>
                  8 words will be chosen randomly from {filteredWords.length} available
                </p>
              ) : (
                <div className="alert alert-danger" style={{ marginTop: 12 }}>
                  Need at least 8 words to play.{' '}
                  <Link to="/community">Import a deck →</Link>
                </div>
              )}

              <button
                className="btn btn-primary setup-start-btn"
                onClick={handleStart}
                disabled={!canPlay}
              >
                Start Game →
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

  // ── Won screen ────────────────────────────────────────────────────────────
  if (phase === 'won') {
    const misses = rounds - PAIRS
    return (
      <div className="page-container">
        <div className="session-complete">
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>
            {misses === 0 ? '🏆' : '🎉'}
          </div>
          <h2 className="session-complete-title">
            {misses === 0 ? 'Perfect game!' : 'All pairs matched!'}
          </h2>
          <div className="session-stats">
            <div className="session-stat">
              <div className="session-stat-value" style={{ color: 'var(--color-primary)' }}>{rounds}</div>
              <div className="session-stat-label">Rounds</div>
            </div>
            <div className="session-stat">
              <div className="session-stat-value" style={{ color: 'var(--color-success)' }}>{PAIRS}</div>
              <div className="session-stat-label">Pairs</div>
            </div>
            <div className="session-stat">
              <div
                className="session-stat-value"
                style={{ color: misses === 0 ? 'var(--color-success)' : 'var(--color-warning)' }}
              >
                {misses}
              </div>
              <div className="session-stat-label">Misses</div>
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
  return (
    <div className="page-container">
      {/* Header bar */}
      <div className="memory-header">
        <Link to="/games" className="btn btn-ghost btn-sm">← Games</Link>
        <div className="memory-stats">
          <span className="memory-stat">
            <span className="memory-stat-val">{matched.size}</span>
            <span className="memory-stat-lbl">/{PAIRS} pairs</span>
          </span>
          <span className="memory-stat">
            <span className="memory-stat-val">{rounds}</span>
            <span className="memory-stat-lbl"> rounds</span>
          </span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setPhase('setup')}>Restart</button>
      </div>

      {/* Progress bar */}
      <div className="progress-bar-wrapper" style={{ marginBottom: 24 }}>
        <div
          className="progress-bar-fill"
          style={{ width: `${(matched.size / PAIRS) * 100}%`, transition: 'width 0.4s ease' }}
        />
      </div>

      {/* 4×4 card grid */}
      <div className="memory-board">
        {cards.map(card => {
          const isFaceUp  = revealed.includes(card.id) || matched.has(card.pairId)
          const isMatched = matched.has(card.pairId)

          return (
            <div
              key={card.id}
              className={[
                'memory-card',
                isFaceUp  ? 'face-up'  : '',
                isMatched ? 'matched'  : '',
              ].filter(Boolean).join(' ')}
              onClick={() => handleCardClick(card)}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleCardClick(card) }}
            >
              <div className="memory-card-inner">
                {/* Face down */}
                <div className="memory-card-front">
                  <span className="memory-card-symbol">؟</span>
                </div>
                {/* Face up */}
                <div className={`memory-card-back${card.type === 'arabic' ? ' arabic' : ''}`}>
                  <span style={{ color: card.color || undefined }}>{card.content}</span>
                  {card.type === 'arabic' && <SpeakButton text={card.content} size={12} />}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
