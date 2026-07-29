import React from 'react'
import { Link } from 'react-router-dom'

const AVAILABLE = [
  {
    path:  '/games/memory',
    icon:  '🃏',
    title: 'Memory Match',
    desc:  'Flip cards to match Arabic words with their English definitions in the fewest rounds possible.',
  },
  {
    path:  '/games/multiple-choice',
    icon:  '🧠',
    title: 'Multiple Choice',
    desc:  'Pick the correct translation from 4 options. Distractors share roots or parts of speech to keep it challenging.',
  },
  {
    path:  '/games/root-grouping',
    icon:  '🌿',
    title: 'Root Grouping',
    desc:  'Sort a set of words into groups by their shared Arabic root — like NYT Connections, but for Arabic.',
  },
  {
    path:  '/games/speed-round',
    icon:  '⚡',
    title: 'Speed Round',
    desc:  'How many words can you translate correctly in 60 seconds? Answer fast — the clock never stops.',
  },
  {
    path:  '/games/spell-it-out',
    icon:  '🔤',
    title: 'Spell It Out',
    desc:  'Reading mode: see the English meaning and type the Arabic. Listening mode: hear the word played aloud and spell what you hear. Vowels are optional.',
  },
]

const COMING_SOON = []

export default function Games() {
  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Games</h1>
        <p className="page-subtitle">Practice your Arabic vocabulary through play</p>
      </div>

      <div className="games-grid">
        {AVAILABLE.map(game => (
          <div key={game.path} className="game-card">
            <div className="game-card-icon">{game.icon}</div>
            <h2 className="game-card-title">{game.title}</h2>
            <p className="game-card-desc">{game.desc}</p>
            <Link to={game.path} className="btn btn-primary game-card-btn">Play →</Link>
          </div>
        ))}

        {COMING_SOON.map(game => (
          <div key={game.title} className="game-card game-card-soon">
            <div className="game-card-icon">{game.icon}</div>
            <h2 className="game-card-title">{game.title}</h2>
            <p className="game-card-desc">{game.desc}</p>
            <span className="game-card-soon-badge">Coming Soon</span>
          </div>
        ))}
      </div>
    </div>
  )
}
