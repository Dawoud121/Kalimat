// v1.0.1
import React, { useState, useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { api } from '../lib/api'
import { createWord, createSrsCard, normalizeDeck } from '../lib/dataService'

// ── Surah Al-Fatiha data (stored as a static constant, NOT in DB) ─────────
export const FATIHA_WORDS = [
  // Verse 1
  { id: '1:1', arabic: 'بِسْمِ',          english: 'in the name of',       root: 'س م و', grammarTag: 'جار ومجرور',  verseNumber: 1, position: 1 },
  { id: '1:2', arabic: 'اللَّهِ',          english: 'Allah',                root: 'أ ل ه', grammarTag: 'اسم',         verseNumber: 1, position: 2 },
  { id: '1:3', arabic: 'الرَّحْمَٰنِ',    english: 'the Most Gracious',    root: 'ر ح م', grammarTag: 'صفة',         verseNumber: 1, position: 3 },
  { id: '1:4', arabic: 'الرَّحِيمِ',      english: 'the Most Merciful',    root: 'ر ح م', grammarTag: 'صفة',         verseNumber: 1, position: 4 },
  // Verse 2
  { id: '2:1', arabic: 'الْحَمْدُ',       english: 'All praise',           root: 'ح م د', grammarTag: 'مبتدأ',       verseNumber: 2, position: 1 },
  { id: '2:2', arabic: 'لِلَّهِ',         english: 'belongs to Allah',     root: 'أ ل ه', grammarTag: 'جار ومجرور',  verseNumber: 2, position: 2 },
  { id: '2:3', arabic: 'رَبِّ',           english: 'Lord of',              root: 'ر ب ب', grammarTag: 'مضاف إليه',   verseNumber: 2, position: 3 },
  { id: '2:4', arabic: 'الْعَالَمِينَ',  english: 'all worlds',            root: 'ع ل م', grammarTag: 'مضاف إليه',   verseNumber: 2, position: 4 },
  // Verse 3
  { id: '3:1', arabic: 'الرَّحْمَٰنِ',    english: 'the Most Gracious',    root: 'ر ح م', grammarTag: 'صفة',         verseNumber: 3, position: 1 },
  { id: '3:2', arabic: 'الرَّحِيمِ',      english: 'the Most Merciful',    root: 'ر ح م', grammarTag: 'صفة',         verseNumber: 3, position: 2 },
  // Verse 4
  { id: '4:1', arabic: 'مَالِكِ',         english: 'Owner of',             root: 'م ل ك', grammarTag: 'صفة',         verseNumber: 4, position: 1 },
  { id: '4:2', arabic: 'يَوْمِ',          english: 'Day of',               root: 'ي و م', grammarTag: 'مضاف إليه',   verseNumber: 4, position: 2 },
  { id: '4:3', arabic: 'الدِّينِ',        english: 'Judgement',            root: 'د ي ن', grammarTag: 'مضاف إليه',   verseNumber: 4, position: 3 },
  // Verse 5
  { id: '5:1', arabic: 'إِيَّاكَ',       english: 'You alone',             root: '—',     grammarTag: 'ضمير منفصل',  verseNumber: 5, position: 1 },
  { id: '5:2', arabic: 'نَعْبُدُ',        english: 'we worship',           root: 'ع ب د', grammarTag: 'فعل مضارع',   verseNumber: 5, position: 2 },
  { id: '5:3', arabic: 'وَإِيَّاكَ',     english: 'and You alone',         root: '—',     grammarTag: 'ضمير منفصل',  verseNumber: 5, position: 3 },
  { id: '5:4', arabic: 'نَسْتَعِينُ',    english: 'we ask for help',       root: 'ع و ن', grammarTag: 'فعل مضارع',   verseNumber: 5, position: 4 },
  // Verse 6
  { id: '6:1', arabic: 'اهْدِنَا',        english: 'Guide us',             root: 'ه د ي', grammarTag: 'فعل أمر',     verseNumber: 6, position: 1 },
  { id: '6:2', arabic: 'الصِّرَاطَ',     english: 'the path',              root: 'ص ر ط', grammarTag: 'مفعول به',    verseNumber: 6, position: 2 },
  { id: '6:3', arabic: 'الْمُسْتَقِيمَ', english: 'the straight',          root: 'ق و م', grammarTag: 'صفة',         verseNumber: 6, position: 3 },
  // Verse 7
  { id: '7:1', arabic: 'صِرَاطَ',        english: 'path of',              root: 'ص ر ط', grammarTag: 'مضاف إليه',   verseNumber: 7, position: 1 },
  { id: '7:2', arabic: 'الَّذِينَ',      english: 'those whom',            root: '—',     grammarTag: 'اسم موصول',   verseNumber: 7, position: 2 },
  { id: '7:3', arabic: 'أَنْعَمْتَ',     english: 'You bestowed favour',   root: 'ن ع م', grammarTag: 'فعل ماضي',    verseNumber: 7, position: 3 },
  { id: '7:4', arabic: 'عَلَيْهِمْ',     english: 'upon them',             root: '—',     grammarTag: 'جار ومجرور',  verseNumber: 7, position: 4 },
  { id: '7:5', arabic: 'غَيْرِ',         english: 'not of',               root: 'غ ي ر', grammarTag: 'مضاف إليه',   verseNumber: 7, position: 5 },
  { id: '7:6', arabic: 'الْمَغْضُوبِ',   english: 'those who earned anger',root: 'غ ض ب', grammarTag: 'مضاف إليه',   verseNumber: 7, position: 6 },
  { id: '7:7', arabic: 'عَلَيْهِمْ',     english: 'upon them',             root: '—',     grammarTag: 'جار ومجرور',  verseNumber: 7, position: 7 },
  { id: '7:8', arabic: 'وَلَا',           english: 'and not',              root: '—',     grammarTag: 'حرف عطف',     verseNumber: 7, position: 8 },
  { id: '7:9', arabic: 'الضَّالِّينَ',   english: 'those who went astray', root: 'ض ل ل', grammarTag: 'مضاف إليه',   verseNumber: 7, position: 9 },
]

// Group words by verse number
const VERSES = FATIHA_WORDS.reduce((acc, word) => {
  if (!acc[word.verseNumber]) acc[word.verseNumber] = []
  acc[word.verseNumber].push(word)
  return acc
}, {})

const VERSE_NUMBERS = Object.keys(VERSES).map(Number).sort((a, b) => a - b)

export default function QuranContext() {
  const { currentUser } = useAuth()
  const [selectedWord, setSelectedWord] = useState(null)
  const [addSuccess, setAddSuccess] = useState(false)
  const [addError, setAddError] = useState('')
  const [decks, setDecks] = useState([])
  const [targetDeckId, setTargetDeckId] = useState(null)

  // Load user decks
  useEffect(() => {
    if (!currentUser) return
    let cancelled = false
    const load = async () => {
      const data = await api.get('/decks')
      if (cancelled) return
      const normalized = (data || []).map(normalizeDeck)
      setDecks(normalized)
      if (normalized.length > 0 && !targetDeckId) {
        setTargetDeckId(normalized[0].id)
      }
    }
    load()
    return () => { cancelled = true }
  }, [currentUser])

  // When decks first load, set default target
  useEffect(() => {
    if (decks.length > 0 && !targetDeckId) {
      setTargetDeckId(decks[0].id)
    }
  }, [decks, targetDeckId])

  const handleSelectWord = (word) => {
    setSelectedWord(prev => prev?.id === word.id ? null : word)
    setAddSuccess(false)
    setAddError('')
  }

  const handleAddToWordBank = async () => {
    if (!selectedWord || !currentUser) return
    setAddError('')

    const deckId = targetDeckId || decks?.[0]?.id
    if (!deckId) {
      setAddError('Please create a deck first.')
      return
    }

    // Check if word already exists
    const { exists } = await api.get(`/words/exists?arabic=${encodeURIComponent(selectedWord.arabic)}`)
    if (exists) {
      setAddError('This word is already in your word bank.')
      return
    }

    try {
      const newWord = await createWord(currentUser.id, {
        deckId,
        arabic:          selectedWord.arabic,
        english:         selectedWord.english,
        root:            selectedWord.root !== '—' ? selectedWord.root : '',
        partOfSpeech:    selectedWord.grammarTag || '',
        exampleSentence: '',
      })
      await createSrsCard(currentUser.id, { wordId: newWord.id, deckId })
      setAddSuccess(true)
    } catch (err) {
      setAddError(err.message || 'Failed to add word.')
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Quran in Context</h1>
        <p className="page-subtitle">Surah Al-Fatiha — click any word to explore its meaning</p>
      </div>

      <div className="quran-page">
        {/* Quran text panel */}
        <div className="quran-text-panel">
          <div className="surah-title">سُورَةُ الْفَاتِحَة</div>
          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: 24 }}>
            Surah Al-Fatiha · 7 verses · Meccan
          </p>

          {/* Bismillah banner */}
          <div style={{
            textAlign: 'center',
            fontFamily: 'var(--font-arabic)',
            fontSize: '1.8rem',
            color: 'var(--color-primary)',
            padding: '12px 0 20px',
            borderBottom: '1px solid var(--color-border)',
            marginBottom: 20,
            direction: 'rtl',
          }}>
            بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
          </div>

          {VERSE_NUMBERS.map(vNum => {
            const verseWords = VERSES[vNum]
            return (
              <div key={vNum} className="verse">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, direction: 'rtl' }}>
                  <span className="verse-number">{vNum}</span>
                  <div className="verse-text">
                    {verseWords.map(word => (
                      <span
                        key={word.id}
                        className={`quran-word${selectedWord?.id === word.id ? ' selected' : ''}`}
                        onClick={() => handleSelectWord(word)}
                        title={word.english}
                      >
                        {word.arabic}{' '}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Info panel */}
        <div className="quran-info-panel">
          {selectedWord ? (
            <>
              <div className="quran-info-arabic">{selectedWord.arabic}</div>
              <div className="quran-info-english">{selectedWord.english}</div>

              <div className="divider" />

              <div className="quran-info-row">
                <span className="quran-info-label">Root</span>
                <span className="quran-info-value arabic">{selectedWord.root}</span>
              </div>
              <div className="quran-info-row">
                <span className="quran-info-label">Grammar</span>
                <span className="quran-info-value arabic">{selectedWord.grammarTag}</span>
              </div>
              <div className="quran-info-row">
                <span className="quran-info-label">Verse</span>
                <span className="quran-info-value">{selectedWord.verseNumber}:{selectedWord.position}</span>
              </div>

              <div className="divider" />

              {/* Add to word bank */}
              <div className="form-group" style={{ marginBottom: 8 }}>
                <label className="form-label">Add to deck:</label>
                <select
                  className="form-select"
                  value={targetDeckId || ''}
                  onChange={e => setTargetDeckId(Number(e.target.value))}
                >
                  {decks && decks.length > 0
                    ? decks.map(d => <option key={d.id} value={d.id}>{d.title}</option>)
                    : <option disabled>No decks — create one first</option>
                  }
                </select>
              </div>

              {addSuccess && (
                <div className="alert alert-success" style={{ padding: '8px 12px', fontSize: '0.82rem' }}>
                  ✓ Added to your word bank!
                </div>
              )}
              {addError && (
                <div className="alert alert-danger" style={{ padding: '8px 12px', fontSize: '0.82rem' }}>
                  {addError}
                </div>
              )}

              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={handleAddToWordBank}
                disabled={!decks || decks.length === 0}
              >
                + Add to Word Bank
              </button>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-muted)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🕌</div>
              <p style={{ fontSize: '0.9rem' }}>
                Click any word in the Surah to see its meaning, root, and grammar tag.
              </p>
              <div style={{ marginTop: 20, padding: '12px', background: 'var(--color-primary-muted)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontFamily: 'var(--font-arabic)', direction: 'rtl', fontSize: '1rem', color: 'var(--color-primary)' }}>
                  {FATIHA_WORDS.length} كلمة
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                  {FATIHA_WORDS.length} words total
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
