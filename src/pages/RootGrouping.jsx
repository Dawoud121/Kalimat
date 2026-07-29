import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getUserWords, getUserDecks, normalizeDeck, normalizeWord, getDictionaryAll } from '../lib/dataService'
import SpeakButton from '../components/SpeakButton'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Strip diacritics for deduplication comparison
const stripDiacritics = s =>
  (s || '').replace(/[\u064B-\u065F\u0610-\u061A\u0670]/g, '').trim()

/**
 * Find valid root groups from a word list.
 * Deduplicates by Arabic text first, then groups by root.
 * Priority: 4×4 → 4×3 → 3×4 → 3×3 → 2×4 → 2×3
 */
function findRootGroups(words) {
  // Deduplicate by stripped arabic text — prevents same word appearing twice
  const seen = new Set()
  const unique = words.filter(w => {
    if (!w.arabic || !w.root?.trim()) return false
    const key = stripDiacritics(w.arabic)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Group by root
  const byRoot = {}
  unique.forEach(w => {
    const root = w.root.trim()
    if (!byRoot[root]) byRoot[root] = []
    byRoot[root].push(w)
  })

  const rootEntries = Object.entries(byRoot)

  const configs = [
    { numGroups: 4, groupSize: 4 },
    { numGroups: 4, groupSize: 3 },
    { numGroups: 3, groupSize: 4 },
    { numGroups: 3, groupSize: 3 },
    { numGroups: 2, groupSize: 4 },
    { numGroups: 2, groupSize: 3 },
  ]

  for (const { numGroups, groupSize } of configs) {
    const eligible = rootEntries.filter(([, ws]) => ws.length >= groupSize)
    if (eligible.length >= numGroups) {
      const chosen = shuffle(eligible).slice(0, numGroups)
      return {
        groups: chosen.map(([root, ws]) => ({
          root,
          words: shuffle(ws).slice(0, groupSize),
        })),
        groupSize,
      }
    }
  }

  return null
}

const GROUP_COLORS = [
  { bg: 'var(--color-primary)',  text: '#fff' },
  { bg: 'var(--color-success)',  text: '#fff' },
  { bg: 'var(--color-warning)',  text: '#fff' },
  { bg: 'var(--color-info)',     text: '#fff' },
]

export default function RootGrouping() {
  const { currentUser, isGuest, guestData } = useAuth()

  // ── Setup ─────────────────────────────────────────────────────────────────
  const [source,       setSource]       = useState('dictionary') // 'dictionary' | 'all' | deckId
  const [decks,        setDecks]        = useState([])
  const [userWords,    setUserWords]    = useState([])
  const [dictWords,    setDictWords]    = useState([])
  const [userLoading,  setUserLoading]  = useState(true)
  const [dictLoading,  setDictLoading]  = useState(true)

  // ── Game ──────────────────────────────────────────────────────────────────
  const [groups,    setGroups]    = useState([])
  const [groupSize, setGroupSize] = useState(4)
  const [cards,     setCards]     = useState([])
  const [selected,  setSelected]  = useState(new Set())
  const [solved,    setSolved]    = useState([])
  const [mistakes,  setMistakes]  = useState(0)
  const [shaking,   setShaking]   = useState(false)
  const [phase,     setPhase]     = useState('setup')

  // Load dictionary words
  useEffect(() => {
    getDictionaryAll(3000)
      .then(data => {
        setDictWords(data.map(w => ({
          id:           `dict_${w.id}`,
          arabic:       w.arabic,
          english:      w.definition || '',
          root:         w.root || '',
          partOfSpeech: w.pos || '',
        })))
      })
      .catch(() => {})
      .finally(() => setDictLoading(false))
  }, [])

  // Load user words and decks
  useEffect(() => {
    if (isGuest) {
      setUserWords(guestData.words)
      setDecks([...guestData.decks].sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
      ))
      setUserLoading(false)
      return
    }
    if (!currentUser) return
    Promise.all([
      getUserWords(currentUser.id),
      getUserDecks(currentUser.id),
    ]).then(([words, userDecks]) => {
      setUserWords(words.map(normalizeWord))
      setDecks(
        userDecks.map(normalizeDeck).sort((a, b) =>
          a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
        )
      )
      setUserLoading(false)
    })
  }, [currentUser, isGuest, guestData])

  // Active word pool based on source selection
  const activeWords = useMemo(() => {
    if (source === 'dictionary') return dictWords
    if (source === 'all')        return userWords
    const deckId = Number(source)
    return userWords.filter(w => w.deckId === deckId)
  }, [source, dictWords, userWords])

  const groupResult = useMemo(() => findRootGroups(activeWords), [activeWords])

  const setupLoading = source === 'dictionary' ? dictLoading : userLoading

  // ── Start ─────────────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    if (!groupResult) return
    const { groups: g, groupSize: gs } = groupResult
    const flat = shuffle(g.flatMap(gr => gr.words))
    setGroups(g)
    setGroupSize(gs)
    setCards(flat)
    setSelected(new Set())
    setSolved([])
    setMistakes(0)
    setShaking(false)
    setPhase('playing')
  }, [groupResult])

  // ── Toggle card selection ─────────────────────────────────────────────────
  const toggleCard = useCallback((word) => {
    if (shaking) return
    if (solved.some(s => s.words.some(w => w.id === word.id))) return
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(word.id)) {
        next.delete(word.id)
      } else if (next.size < groupSize) {
        next.add(word.id)
      }
      return next
    })
  }, [shaking, solved, groupSize])

  // ── Submit guess ──────────────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    if (selected.size !== groupSize) return
    const selectedWords = cards.filter(c => selected.has(c.id))
    const roots = new Set(selectedWords.map(c => c.root?.trim()).filter(Boolean))

    if (roots.size === 1) {
      const root = [...roots][0]
      const group = groups.find(g => g.root === root)
      const colorIdx = solved.length % GROUP_COLORS.length
      const newSolved = [...solved, { ...group, colorIdx }]
      setSolved(newSolved)
      setSelected(new Set())
      if (newSolved.length === groups.length) setPhase('won')
    } else {
      setMistakes(m => m + 1)
      setShaking(true)
      setTimeout(() => {
        setShaking(false)
        setSelected(new Set())
      }, 600)
    }
  }, [selected, groupSize, cards, groups, solved])

  // Pre-compute which decks have enough roots — avoids calling findRootGroups in render
  const deckValid = useMemo(() => {
    const map = {}
    decks.forEach(d => {
      map[d.id] = !!findRootGroups(userWords.filter(w => w.deckId === d.id))
    })
    return map
  }, [decks, userWords])

  const allUserResult = useMemo(() => findRootGroups(userWords), [userWords])

  // ── Setup screen ──────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">🌿 Root Grouping</h1>
          <p className="page-subtitle">Sort words into groups that share the same Arabic root</p>
        </div>

        <div className="session-setup" style={{ maxWidth: 440 }}>
          <h2>New Game</h2>
          <p className="setup-subtitle">Find the root families hidden in the cards</p>

          {setupLoading ? (
            <div className="spinner" style={{ margin: '32px auto', display: 'block' }} />
          ) : (
            <>
              <div className="setup-row">
                <label>Word source</label>
                <select
                  className="form-select"
                  value={source}
                  onChange={e => setSource(e.target.value)}
                >
                  <option value="dictionary">Dictionary</option>
                  {!userLoading && (
                    <option
                      value="all"
                      disabled={!allUserResult}
                    >
                      All My Decks ({userWords.length} words){!allUserResult ? ' — not enough roots' : ''}
                    </option>
                  )}
                  {!userLoading && decks.map(d => (
                    <option
                      key={d.id}
                      value={String(d.id)}
                      disabled={!deckValid[d.id]}
                    >
                      {d.title}{!deckValid[d.id] ? ' — not enough roots' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {groupResult ? (
                <div className="alert alert-success" style={{ marginTop: 12 }}>
                  Found <strong>{groupResult.groups.length} groups</strong> of <strong>{groupResult.groupSize} words</strong> each
                  &nbsp;({groupResult.groups.length * groupResult.groupSize} cards total)
                </div>
              ) : (
                <div className="alert alert-danger" style={{ marginTop: 12 }}>
                  Not enough words with shared roots in this source.
                </div>
              )}

              <button
                className="btn btn-primary setup-start-btn"
                onClick={handleStart}
                disabled={!groupResult}
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

  // ── Won screen ────────────────────────────────────────────────────────────
  if (phase === 'won') {
    return (
      <div className="page-container">
        <div className="session-complete">
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>
            {mistakes === 0 ? '🏆' : mistakes <= 2 ? '🌿' : '✅'}
          </div>
          <h2 className="session-complete-title">
            {mistakes === 0 ? 'Flawless!' : 'All roots found!'}
          </h2>
          <div className="session-stats">
            <div className="session-stat">
              <div className="session-stat-value" style={{ color: 'var(--color-success)' }}>{groups.length}</div>
              <div className="session-stat-label">Groups</div>
            </div>
            <div className="session-stat">
              <div className="session-stat-value" style={{ color: mistakes === 0 ? 'var(--color-success)' : 'var(--color-warning)' }}>
                {mistakes}
              </div>
              <div className="session-stat-label">Mistakes</div>
            </div>
          </div>

          <div style={{ width: '100%', marginBottom: 24 }}>
            {solved.map(s => (
              <div
                key={s.root}
                className="rg-solved-row"
                style={{ background: GROUP_COLORS[s.colorIdx].bg, color: GROUP_COLORS[s.colorIdx].text }}
              >
                <div className="rg-solved-root arabic">{s.root}</div>
                <div className="rg-solved-words">{s.words.map(w => w.arabic).join(' · ')}</div>
              </div>
            ))}
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
  const remainingCards = cards.filter(c => !solved.some(s => s.words.some(w => w.id === c.id)))

  return (
    <div className="page-container">

      <div className="memory-header">
        <Link to="/games" className="btn btn-ghost btn-sm">← Games</Link>
        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
          Find groups of <strong>{groupSize}</strong>
        </span>
        <span style={{ fontSize: '0.85rem' }}>
          <span style={{ color: 'var(--color-success)' }}>✓ {solved.length}/{groups.length}</span>
          {mistakes > 0 && (
            <span style={{ color: 'var(--color-danger)', marginLeft: 10 }}>✗ {mistakes}</span>
          )}
        </span>
      </div>

      {solved.map(s => (
        <div
          key={s.root}
          className="rg-solved-row"
          style={{ background: GROUP_COLORS[s.colorIdx].bg, color: GROUP_COLORS[s.colorIdx].text }}
        >
          <div className="rg-solved-root arabic">{s.root}</div>
          <div className="rg-solved-words">{s.words.map(w => w.arabic).join(' · ')}</div>
        </div>
      ))}

      <div className={`rg-board${shaking ? ' shaking' : ''}`}>
        {remainingCards.map(card => {
          const isSelected = selected.has(card.id)
          return (
            <div
              key={card.id}
              className={`rg-card${isSelected ? ' selected' : ''}`}
              onClick={() => toggleCard(card)}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggleCard(card) }}
            >
              <div className="rg-card-arabic arabic">{card.arabic}</div>
              <SpeakButton text={card.arabic} size={13} />
              <div className="rg-card-english">{card.english}</div>
            </div>
          )
        })}
      </div>

      <div style={{ textAlign: 'center', marginTop: 20 }}>
        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={selected.size !== groupSize || shaking}
          style={{ minWidth: 160 }}
        >
          Submit Group ({selected.size}/{groupSize})
        </button>
        {selected.size > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setSelected(new Set())}
            style={{ marginLeft: 10 }}
          >
            Clear
          </button>
        )}
      </div>

    </div>
  )
}
