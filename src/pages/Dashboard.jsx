// v2.7.0
import React, { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { api } from '../lib/api'
import { normalizeSrsCard, normalizeDeck, getStudyLog } from '../lib/dataService'
import YearCalendar from '../components/YearCalendar'
import { BookOpen } from 'lucide-react'

const BISMILLAH = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ'

const DAILY_VERSES = [
  { arabic: 'إِنَّ مَعَ الْعُسْرِ يُسْرًا',                              english: 'Indeed, with hardship will be ease.',                              ref: 'Al-Inshirah 94:6' },
  { arabic: 'رَبِّ زِدْنِي عِلْمًا',                                      english: 'My Lord, increase me in knowledge.',                               ref: 'Ta-Ha 20:114' },
  { arabic: 'حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ',                     english: 'Allah is sufficient for us, and He is the best Disposer of affairs.', ref: "Ali 'Imran 3:173" },
  { arabic: 'إِنَّ اللَّهَ مَعَ الصَّابِرِينَ',                           english: 'Indeed, Allah is with the patient.',                               ref: 'Al-Baqarah 2:153' },
  { arabic: 'وَمَا تَوْفِيقِي إِلَّا بِاللَّهِ',                          english: 'My success is only through Allah.',                                ref: 'Hud 11:88' },
  { arabic: 'اقْرَأْ بِاسْمِ رَبِّكَ الَّذِي خَلَقَ',                    english: 'Read in the name of your Lord who created.',                      ref: "Al-'Alaq 96:1" },
  { arabic: 'وَلَا تَيْأَسُوا مِن رَّوْحِ اللَّهِ',                       english: 'Do not despair of relief from Allah.',                             ref: 'Yusuf 12:87' },
  { arabic: 'يُرِيدُ اللَّهُ بِكُمُ الْيُسْرَ',                           english: 'Allah intends for you ease.',                                     ref: 'Al-Baqarah 2:185' },
  { arabic: 'وَهُوَ مَعَكُمْ أَيْنَ مَا كُنتُمْ',                         english: 'He is with you wherever you are.',                                ref: 'Al-Hadid 57:4' },
  { arabic: 'وَعَسَىٰ أَن تَكْرَهُوا شَيْئًا وَهُوَ خَيْرٌ لَّكُمْ',    english: 'Perhaps you dislike something and it is good for you.',            ref: 'Al-Baqarah 2:216' },
  { arabic: 'قُلْ هُوَ اللَّهُ أَحَدٌ',                                   english: 'Say: He is Allah, the One.',                                      ref: 'Al-Ikhlas 112:1' },
  { arabic: 'فَإِنَّ مَعَ الْعُسْرِ يُسْرًا',                             english: 'For indeed, with hardship will be ease.',                         ref: 'Al-Inshirah 94:5' },
  { arabic: 'إِنَّ اللَّهَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ',                 english: 'Indeed, Allah has power over all things.',                        ref: 'Al-Baqarah 2:20' },
  { arabic: 'وَاللَّهُ يَعْلَمُ وَأَنتُمْ لَا تَعْلَمُونَ',               english: 'Allah knows and you do not know.',                                ref: 'Al-Baqarah 2:232' },
  { arabic: 'وَأَنَّ إِلَىٰ رَبِّكَ الْمُنتَهَىٰ',                        english: 'And that to your Lord is the finality.',                          ref: 'An-Najm 53:42' },
  { arabic: 'فَاذْكُرُونِي أَذْكُرْكُمْ',                                  english: 'So remember Me; I will remember you.',                            ref: 'Al-Baqarah 2:152' },
  { arabic: 'وَتَوَكَّلْ عَلَى اللَّهِ',                                   english: 'And put your trust in Allah.',                                    ref: 'Al-Ahzab 33:3' },
]

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function calcStreak(studyLog) {
  if (!studyLog || studyLog.length === 0) return 0
  const days = new Set(studyLog.map(r => r.date))
  let streak = 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = 0; i <= 365; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    if (days.has(key)) {
      streak++
    } else if (i > 0) {
      break
    }
  }
  return streak
}

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

function formatTime(ms) {
  if (!ms) return '—'
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  return `${(ms / 60000).toFixed(1)} min`
}

export default function Dashboard() {
  const { currentUser, isGuest, guestData } = useAuth()

  const [allCards, setAllCards] = useState(null)
  const [decks,    setDecks]    = useState(null)
  const [studyLog, setStudyLog] = useState(null)

  // Today's session stats from localStorage (written by Flashcards.jsx)
  const todayStats = useMemo(() => readTodayStats(), [])

  // Verse rotates daily (deterministic: day-of-year mod list length)
  const verse = useMemo(() => {
    const start = new Date(new Date().getFullYear(), 0, 0)
    const dayOfYear = Math.floor((Date.now() - start) / 86400000)
    return DAILY_VERSES[dayOfYear % DAILY_VERSES.length]
  }, [])

  useEffect(() => {
    if (isGuest) {
      setAllCards(guestData.srsCards)
      setDecks(guestData.decks)
      setStudyLog([])
      return
    }
    if (!currentUser) return
    let cancelled = false

    const load = async () => {
      const [cards, decks, logData] = await Promise.all([
        api.get('/srs'),
        api.get('/decks'),
        getStudyLog(currentUser.id).catch(() => []),
      ])
      if (cancelled) return
      setAllCards((cards || []).map(normalizeSrsCard))
      setDecks((decks || []).map(normalizeDeck))
      setStudyLog(logData)
    }
    load()
    return () => { cancelled = true }
  }, [currentUser, isGuest, guestData])

  // Heatmap data for the year calendar
  const heatmapData = useMemo(() => {
    if (!studyLog) return []
    return studyLog.map(r => ({ date: r.date, count: r.cards_reviewed }))
  }, [studyLog])

  const streak = useMemo(() => calcStreak(studyLog || []), [studyLog])

  // Cards reviewed today (from srs_cards.last_reviewed — reflects mid-session too)
  const todayDateStr = new Date().toISOString().slice(0, 10)
  const studiedToday = useMemo(
    () => (allCards || []).filter(c => c.lastReviewed?.slice(0, 10) === todayDateStr).length,
    [allCards, todayDateStr]
  )

  const dueCount = useMemo(() => {
    if (!allCards) return 0
    const now = new Date()
    const nowISO = now.toISOString()
    const pausedDeckIds = new Set(
      (decks || [])
        .filter(d => d.reviewFrequency && d.nextDeckReview && new Date(d.nextDeckReview) > now)
        .map(d => d.id)
    )
    return allCards.filter(c => c.nextReviewDate <= nowISO && !pausedDeckIds.has(c.deckId)).length
  }, [allCards, decks])

  // Derived stat box values
  const paceStr = useMemo(() => {
    if (!todayStats.timeMs || !studiedToday) return '—'
    const sec = todayStats.timeMs / studiedToday / 1000
    return `${sec.toFixed(1)}s`
  }, [todayStats.timeMs, studiedToday])

  const retentionStr = useMemo(() => {
    if (!todayStats.total) return '—'
    return `${Math.round((todayStats.correct / todayStats.total) * 100)}%`
  }, [todayStats.correct, todayStats.total])

  const retentionColor = useMemo(() => {
    if (!todayStats.total) return 'inherit'
    const rate = todayStats.correct / todayStats.total
    return rate >= 0.8 ? 'var(--color-success)' : rate >= 0.6 ? 'var(--color-warning)' : 'var(--color-danger)'
  }, [todayStats.correct, todayStats.total])

  // Loading
  if (allCards === null || decks === null || studyLog === null) {
    return <div className="loading-screen"><div className="spinner" /></div>
  }

  // Onboarding for brand-new users with no decks
  if (decks.length === 0) {
    return (
      <div className="page-container">
        <div className="bismillah">{BISMILLAH}</div>
        <div className="page-header">
          <h1 className="greeting">{getGreeting()}, {currentUser?.username}!</h1>
          <p className="greeting-sub">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <div className="onboarding-card">
          <div className="onboarding-header">
            <div className="onboarding-icon"><BookOpen size={32} strokeWidth={1.5} /></div>
            <h2 className="onboarding-title">Welcome to Kalimat</h2>
            <p className="onboarding-subtitle">
              You're set up — now let's get your first vocabulary deck. Follow these 3 steps to start learning.
            </p>
          </div>

          <div className="onboarding-steps">
            <div className="onboarding-step onboarding-step-active">
              <div className="onboarding-step-num">1</div>
              <div className="onboarding-step-body">
                <div className="onboarding-step-title">Import a vocabulary deck</div>
                <div className="onboarding-step-desc">
                  Community Decks has free Bayna Yadayk vocabulary (Chapters 1–16) ready to import in one tap.
                </div>
                <Link to="/community" className="btn btn-primary" style={{ marginTop: 12, display: 'inline-block' }}>
                  Browse Community Decks →
                </Link>
              </div>
            </div>

            <div className="onboarding-step">
              <div className="onboarding-step-num">2</div>
              <div className="onboarding-step-body">
                <div className="onboarding-step-title">Study with flashcards</div>
                <div className="onboarding-step-desc">
                  The app uses spaced repetition (SM-2) to schedule reviews automatically — hard words appear more often, easy ones less.
                </div>
              </div>
            </div>

            <div className="onboarding-step">
              <div className="onboarding-step-num">3</div>
              <div className="onboarding-step-body">
                <div className="onboarding-step-title">Track your progress</div>
                <div className="onboarding-step-desc">
                  Your streak, stats, and activity calendar fill in here as you study each day.
                </div>
              </div>
            </div>
          </div>

          <div className="onboarding-footer">
            Or add words manually in the{' '}
            <Link to="/word-bank">Word Bank</Link>
            {' '}if you prefer to build your own deck.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">

      {/* Bismillah */}
      <div className="bismillah">{BISMILLAH}</div>

      {/* Greeting + Start Review */}
      <div className="home-header">
        <div>
          <h1 className="greeting">{getGreeting()}, {currentUser?.username || 'there'}!</h1>
          <p className="greeting-sub">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Link to="/flashcards?mode=review" className="btn btn-primary">
          {dueCount > 0 ? `Start Review (${dueCount} due) →` : 'Practice →'}
        </Link>
      </div>

      {/* Today's stat boxes */}
      <div className="home-stats">
        <div className="home-stat-box">
          <div className="home-stat-label">Studied</div>
          <div className="home-stat-value">{studiedToday}</div>
          <div className="home-stat-sub">cards today</div>
        </div>
        <div className="home-stat-box">
          <div className="home-stat-label">Time</div>
          <div className="home-stat-value">{formatTime(todayStats.timeMs)}</div>
          <div className="home-stat-sub">studied today</div>
        </div>
        <div className="home-stat-box">
          <div className="home-stat-label">Pace</div>
          <div className="home-stat-value">{paceStr}</div>
          <div className="home-stat-sub">per card</div>
        </div>
        <div className="home-stat-box">
          <div className="home-stat-label">Retention</div>
          <div className="home-stat-value" style={{ color: retentionColor }}>{retentionStr}</div>
          <div className="home-stat-sub">correct rate</div>
        </div>
      </div>

      {/* Year calendar */}
      <div className="card" style={{ marginBottom: 20 }}>
        <YearCalendar activityData={heatmapData} streak={streak} />
      </div>

      {/* Ayah of the Day */}
      <div className="ayah-card">
        <div className="ayah-label">Ayah of the Day</div>
        <div className="ayah-arabic">{verse.arabic}</div>
        <div className="ayah-translation">{verse.english}</div>
        <div className="ayah-ref">{verse.ref}</div>
      </div>

    </div>
  )
}
