// v2.6.0
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  getCollections, getStories, getStory,
  getUserStoryProgress, upsertStoryProgress,
} from '../lib/dataService'
import SpeakButton from '../components/SpeakButton'
import { ArrowLeft, CheckCircle, Eye, EyeOff, ChevronRight, BookOpen } from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_COLORS = {
  hadith: { bg: 'var(--color-info-bg)',    text: 'var(--color-info)' },
  quran:  { bg: 'var(--color-success-bg)', text: 'var(--color-success)' },
  seerah: { bg: 'var(--color-warning-bg)', text: 'var(--color-warning)' },
}

const DIFFICULTY_COLORS = {
  beginner:     { bg: 'var(--color-success-bg)',  text: 'var(--color-success)' },
  intermediate: { bg: 'var(--color-warning-bg)',  text: 'var(--color-warning)' },
  advanced:     { bg: 'var(--color-danger-bg)',   text: 'var(--color-danger)' },
}

function Badge({ label, colors }) {
  return (
    <span style={{
      background: colors.bg, color: colors.text,
      fontSize: '0.7rem', fontWeight: 700,
      padding: '2px 8px', borderRadius: 'var(--radius-full)',
      textTransform: 'capitalize', flexShrink: 0,
    }}>
      {label}
    </span>
  )
}

// ── Book spine colours (one per collection slot) ─────────────────────────────

const BOOK_PALETTE = [
  { bg: '#E8534A', accent: '#C13A30' }, // coral red
  { bg: '#5B9CF5', accent: '#3A78D8' }, // sky blue
  { bg: '#4CBFB8', accent: '#2D9A93' }, // teal
  { bg: '#F5A623', accent: '#D18B0A' }, // amber
  { bg: '#A06FD1', accent: '#7D4DB8' }, // lavender
  { bg: '#5BBD72', accent: '#3A9A50' }, // mint green
  { bg: '#F07263', accent: '#C94F40' }, // salmon
  { bg: '#E8C43A', accent: '#C5A01A' }, // golden yellow
]

// ── Book (single spine on the shelf) ─────────────────────────────────────────

function Book({ collection, stories, progress, onClick, index, isHovered, onHover, onLeave }) {
  const totalStories   = stories.length
  const completedCount = stories.filter(st => progress[st.id]?.completed).length
  const pct            = totalStories > 0 ? (completedCount / totalStories) * 100 : 0
  const color          = BOOK_PALETTE[index % BOOK_PALETTE.length]
  // Taller books for larger collections
  const height         = Math.max(160, Math.min(230, 150 + totalStories * 9))

  return (
    <div
      className="book"
      style={{ height, backgroundColor: color.bg }}
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      {/* decorative accent band */}
      <div className="book-accent-band" style={{ background: color.accent }} />

      {/* progress fill */}
      {pct > 0 && (
        <div className="book-progress-overlay" style={{ height: `${pct}%` }} />
      )}

      <div className="book-spine-title">{collection.title}</div>

      {completedCount === totalStories && totalStories > 0 && (
        <div className="book-check-icon">
          <CheckCircle size={11} color="rgba(255,255,255,0.9)" />
        </div>
      )}
    </div>
  )
}

// ── Story Card ────────────────────────────────────────────────────────────────

function StoryCard({ story, progress, onClick }) {
  const seg       = story.segments?.length || 0
  const done      = progress?.segments_read || 0
  const completed = progress?.completed || false
  const pct       = seg > 0 ? Math.round((done / seg) * 100) : 0

  return (
    <div className="story-card" onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {story.hadith_number != null && (
          <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
            #{story.hadith_number}
          </span>
        )}
        <Badge label={story.difficulty} colors={DIFFICULTY_COLORS[story.difficulty] || DIFFICULTY_COLORS.beginner} />
        {completed && <CheckCircle size={14} style={{ color: 'var(--color-success)', marginLeft: 'auto' }} />}
      </div>

      <div className="story-card-title">{story.title_english}</div>

      {story.title_arabic && (
        <div style={{ fontFamily: 'var(--font-arabic)', direction: 'rtl', fontSize: '1rem', color: 'var(--color-text-muted)' }}>
          {story.title_arabic}
        </div>
      )}

      <p className="story-card-desc">{story.description}</p>

      <div style={{ marginTop: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: 6 }}>
          <span>{seg} segments</span>
          {done > 0 && !completed && <span style={{ color: 'var(--color-brand-deep)', fontWeight: 600 }}>{pct}% read</span>}
        </div>
        <div style={{ height: 4, background: 'var(--color-border)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            width: `${pct}%`, height: '100%',
            background: completed ? 'var(--color-success)' : 'var(--color-brand)',
            borderRadius: 2, transition: 'width 0.4s',
          }} />
        </div>
      </div>
    </div>
  )
}

// ── Story Reader ──────────────────────────────────────────────────────────────

function StoryReader({ story, progress, onBack, onProgressUpdate, isGuest }) {
  const segCount  = story.segments?.length || 0
  const [segmentsRead,     setSegmentsRead]     = useState(progress?.segments_read || 0)
  const [showTranslation,  setShowTranslation]  = useState(true)
  const completed = segmentsRead >= segCount

  const markRead = useCallback((index) => {
    const newRead = Math.max(segmentsRead, index + 1)
    setSegmentsRead(newRead)
    const done = newRead >= segCount
    if (!isGuest) onProgressUpdate(story.id, newRead, done)
  }, [segmentsRead, segCount, isGuest, story.id, onProgressUpdate])

  return (
    <div className="page-container" style={{ maxWidth: 760 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 24 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginTop: 2 }}>
          <ArrowLeft size={14} /> Back
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            {story.hadith_number != null && (
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                Hadith #{story.hadith_number}
              </span>
            )}
            <Badge label={story.difficulty} colors={DIFFICULTY_COLORS[story.difficulty] || DIFFICULTY_COLORS.beginner} />
          </div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
            {story.title_english}
          </h1>
          {story.title_arabic && (
            <div style={{ fontFamily: 'var(--font-arabic)', direction: 'rtl', fontSize: '1.1rem', color: 'var(--color-brand-deep)', marginTop: 2 }}>
              {story.title_arabic}
            </div>
          )}
        </div>
      </div>

      {/* Narrator */}
      {story.narrator && (
        <div style={{
          fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: 20,
          fontStyle: 'italic', borderLeft: '3px solid var(--color-brand)', paddingLeft: 12,
        }}>
          Narrated by {story.narrator}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
          {segmentsRead} / {segCount} read
          {completed && (
            <span style={{ color: 'var(--color-success)', fontWeight: 600, marginLeft: 8 }}>
              <CheckCircle size={13} style={{ verticalAlign: 'middle', marginRight: 3 }} />
              Complete
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn btn-sm ${showTranslation ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => setShowTranslation(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
          >
            {showTranslation ? <Eye size={13} /> : <EyeOff size={13} />}
            Translation {showTranslation ? 'on' : 'off'}
          </button>
          {!completed && (
            <button className="btn btn-ghost btn-sm" onClick={() => {
              setSegmentsRead(segCount)
              if (!isGuest) onProgressUpdate(story.id, segCount, true)
            }}>
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: 'var(--color-border)', borderRadius: 2, marginBottom: 28, overflow: 'hidden' }}>
        <div style={{
          width: `${segCount > 0 ? Math.round((segmentsRead / segCount) * 100) : 0}%`,
          height: '100%',
          background: completed ? 'var(--color-success)' : 'var(--color-brand)',
          borderRadius: 2, transition: 'width 0.3s',
        }} />
      </div>

      {/* Segments */}
      <div className="story-segments">
        {(story.segments || []).map((seg, i) => {
          const isRead = i < segmentsRead
          return (
            <div
              key={i}
              className={`story-segment${isRead ? ' story-segment--read' : ''}`}
              onClick={!isRead ? () => markRead(i) : undefined}
              style={{ cursor: isRead ? 'default' : 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div className="story-segment-num">{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div className="story-segment-arabic" style={{
                    fontFamily: 'var(--font-arabic)', direction: 'rtl',
                    fontSize: '1.4rem', lineHeight: 2, color: 'var(--color-text)',
                  }}>
                    {seg.arabic}
                  </div>

                  {showTranslation && seg.translation && (
                    <div className="story-segment-translation">{seg.translation}</div>
                  )}

                  {showTranslation && seg.notes && (
                    <div className="story-segment-notes">{seg.notes}</div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <SpeakButton text={seg.arabic} size={13} rate="-25%" keepHarakat />
                    {!isRead ? (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.75rem', padding: '2px 10px' }}
                        onClick={e => { e.stopPropagation(); markRead(i) }}
                      >
                        Mark read <ChevronRight size={12} />
                      </button>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <CheckCircle size={12} /> Read
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Completion */}
      {completed && (
        <div style={{ marginTop: 32, padding: '20px 24px', background: 'var(--color-success-bg)', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
          <CheckCircle size={28} style={{ color: 'var(--color-success)', marginBottom: 8 }} />
          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-success)', marginBottom: 4 }}>
            Story complete!
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            You've read all {segCount} segments.
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onBack} style={{ marginTop: 14 }}>
            <ArrowLeft size={13} /> Back to collection
          </button>
        </div>
      )}
    </div>
  )
}

// ── Collection View (stories grid within a collection) ────────────────────────

function CollectionView({ collection, stories, progress, onSelectStory, onBack }) {
  const totalStories   = stories.length
  const completedCount = stories.filter(s => progress[s.id]?.completed).length
  const pct            = totalStories > 0 ? Math.round((completedCount / totalStories) * 100) : 0

  return (
    <div className="page-container">
      {/* Back + heading */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 24 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginTop: 4 }}>
          <ArrowLeft size={14} /> Collections
        </button>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>{collection.title}</h1>
          {collection.title_arabic && (
            <div style={{ fontFamily: 'var(--font-arabic)', direction: 'rtl', fontSize: '1.2rem', color: 'var(--color-brand-deep)', marginTop: 2 }}>
              {collection.title_arabic}
            </div>
          )}
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '6px 0 0' }}>
            {collection.description}
          </p>
        </div>
      </div>

      {/* Progress strip */}
      <div style={{ marginBottom: 24, padding: '12px 16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
          <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{completedCount}</span> of {totalStories} stories complete
        </div>
        <div style={{ flex: 1, minWidth: 120, height: 6, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            width: `${pct}%`, height: '100%',
            background: pct === 100 ? 'var(--color-success)' : 'var(--color-brand)',
            borderRadius: 3, transition: 'width 0.4s',
          }} />
        </div>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: pct === 100 ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
          {pct}%
        </div>
      </div>

      {/* Stories grid */}
      {stories.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-muted)' }}>
          <BookOpen size={36} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div>No stories in this collection yet.</div>
        </div>
      ) : (
        <div className="story-grid">
          {stories.map(story => (
            <StoryCard
              key={story.id}
              story={story}
              progress={progress[story.id]}
              onClick={() => onSelectStory(story)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Collections Grid (bookshelf) ─────────────────────────────────────────────

function CollectionsGrid({ collections, allStories, progress, onSelectCollection, isGuest }) {
  const [hoveredIndex, setHoveredIndex] = useState(null)

  const storiesByCollection = useMemo(() => {
    const map = {}
    allStories.forEach(s => {
      if (!map[s.collection_slug]) map[s.collection_slug] = []
      map[s.collection_slug].push(s)
    })
    return map
  }, [allStories])

  const totalCompleted = useMemo(() =>
    Object.values(progress).filter(p => p.completed).length,
  [progress])

  const hoveredCol     = hoveredIndex != null ? collections[hoveredIndex] : null
  const hoveredStories = hoveredCol ? (storiesByCollection[hoveredCol.slug] || []) : []
  const hoveredDone    = hoveredStories.filter(s => progress[s.id]?.completed).length
  const hoveredPct     = hoveredStories.length > 0 ? Math.round((hoveredDone / hoveredStories.length) * 100) : 0

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Stories</h1>
        <p className="page-subtitle">
          Read classical Islamic texts — Arabic with audio, translation, and vocabulary notes.
        </p>
      </div>

      {isGuest && (
        <div style={{ marginBottom: 20, padding: '10px 14px', background: 'var(--color-info-bg)', color: 'var(--color-info)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
          Reading progress is not saved for guests.{' '}
          <a href="/register" style={{ color: 'var(--color-info)', fontWeight: 600 }}>Create a free account</a> to track your progress.
        </div>
      )}

      {!isGuest && totalCompleted > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
          <div style={{ padding: '6px 12px', background: 'var(--color-success-bg)', borderRadius: 'var(--radius-md)', fontSize: '0.82rem', color: 'var(--color-success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <CheckCircle size={13} /> {totalCompleted} {totalCompleted === 1 ? 'story' : 'stories'} completed
          </div>
        </div>
      )}

      {collections.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-muted)' }}>
          <BookOpen size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div style={{ fontWeight: 600, marginBottom: 4 }}>No collections yet</div>
          <div style={{ fontSize: '0.85rem' }}>Run the SQL migrations and seed script to add content.</div>
        </div>
      ) : (
        <div className="bookshelf-section">
          {/* The shelf */}
          <div className="bookshelf">
            {collections.map((col, i) => (
              <Book
                key={col.id}
                collection={col}
                stories={storiesByCollection[col.slug] || []}
                progress={progress}
                onClick={() => onSelectCollection(col)}
                index={i}
                isHovered={hoveredIndex === i}
                onHover={() => setHoveredIndex(i)}
                onLeave={() => setHoveredIndex(null)}
              />
            ))}
          </div>
          <div className="shelf-plank" />

          {/* Info panel — shows on hover, click to open */}
          {hoveredCol ? (
            <div className="book-info-panel">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="book-info-title">{hoveredCol.title}</div>
                  {hoveredCol.title_arabic && (
                    <div className="book-info-arabic">{hoveredCol.title_arabic}</div>
                  )}
                  <p className="book-info-desc">{hoveredCol.description}</p>
                  <div className="book-info-meta">
                    <span>{hoveredStories.length} stories</span>
                    {hoveredDone > 0 && (
                      <span style={{ color: hoveredPct === 100 ? 'var(--color-success)' : 'var(--color-brand)', fontWeight: 600 }}>
                        {hoveredDone}/{hoveredStories.length} complete
                      </span>
                    )}
                    <Badge label={hoveredCol.category} colors={CATEGORY_COLORS[hoveredCol.category] || CATEGORY_COLORS.hadith} />
                  </div>
                  {hoveredDone > 0 && (
                    <div className="book-info-progress-bar">
                      <div className="book-info-progress-fill" style={{ width: `${hoveredPct}%`, background: hoveredPct === 100 ? 'var(--color-success)' : 'var(--color-brand)' }} />
                    </div>
                  )}
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ flexShrink: 0 }}
                  onClick={() => onSelectCollection(hoveredCol)}
                >
                  Open <ChevronRight size={13} />
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 20, fontSize: '0.82rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
              Hover over a book to preview · click to open
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Stories() {
  const { currentUser, isGuest } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const collectionSlug = searchParams.get('collection')
  const storyId        = searchParams.get('id') ? Number(searchParams.get('id')) : null

  const [collections,    setCollections]    = useState([])
  const [allStories,     setAllStories]     = useState([])
  const [collStories,    setCollStories]    = useState([])
  const [selectedCollection, setSelectedCollection] = useState(null)
  const [selectedStory,  setSelectedStory]  = useState(null)
  const [progress,       setProgress]       = useState({})
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState(null)

  // Load collections + all stories (lightweight, for counts)
  useEffect(() => {
    setLoading(true)
    Promise.all([getCollections(), getStories()])
      .then(([cols, stories]) => {
        setCollections(cols)
        setAllStories(stories)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Load user progress
  useEffect(() => {
    if (!currentUser || isGuest) return
    getUserStoryProgress(currentUser.id)
      .then(map => setProgress(map))
      .catch(() => {})
  }, [currentUser, isGuest])

  // When collectionSlug changes, load that collection's stories and find the collection object
  useEffect(() => {
    if (!collectionSlug) {
      setSelectedCollection(null)
      setCollStories([])
      return
    }
    const col = collections.find(c => c.slug === collectionSlug)
    if (col) setSelectedCollection(col)
    // Filter from already-loaded allStories (avoids extra fetch)
    const filtered = allStories.filter(s => s.collection_slug === collectionSlug)
    setCollStories(filtered)
  }, [collectionSlug, collections, allStories])

  // Resolve storyId to a story object
  useEffect(() => {
    if (!storyId) { setSelectedStory(null); return }
    const found = allStories.find(s => s.id === storyId)
      || collStories.find(s => s.id === storyId)
    if (found) { setSelectedStory(found); return }
    getStory(storyId).then(s => setSelectedStory(s)).catch(() => setSelectedStory(null))
  }, [storyId, allStories, collStories])

  const goToCollection = (col) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('collection', col.slug)
      next.delete('id')
      return next
    })
  }

  const goToStory = (story) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('id', String(story.id))
      return next
    })
  }

  const backToCollections = () => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('collection')
      next.delete('id')
      return next
    })
  }

  const backToCollection = () => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('id')
      return next
    })
  }

  const handleProgressUpdate = useCallback((storyId, segmentsRead, completed) => {
    if (!currentUser) return
    setProgress(prev => ({
      ...prev,
      [storyId]: { story_id: storyId, segments_read: segmentsRead, completed },
    }))
    upsertStoryProgress(currentUser.id, storyId, segmentsRead, completed).catch(() => {})
  }, [currentUser])

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  if (error) return (
    <div className="page-container">
      <div className="alert alert-danger">
        Failed to load: {error}. Make sure the SQL migrations have been run.
      </div>
    </div>
  )

  // Reader
  if (selectedStory) {
    return (
      <StoryReader
        story={selectedStory}
        progress={progress[selectedStory.id]}
        onBack={backToCollection}
        onProgressUpdate={handleProgressUpdate}
        isGuest={isGuest}
      />
    )
  }

  // Collection view (stories list)
  if (selectedCollection) {
    return (
      <CollectionView
        collection={selectedCollection}
        stories={collStories}
        progress={progress}
        onSelectStory={goToStory}
        onBack={backToCollections}
      />
    )
  }

  // Collections grid
  return (
    <CollectionsGrid
      collections={collections}
      allStories={allStories}
      progress={progress}
      onSelectCollection={goToCollection}
      isGuest={isGuest}
    />
  )
}
