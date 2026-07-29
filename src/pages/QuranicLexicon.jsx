// v2.0.5
import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../auth/AuthContext'
import ModalPortal from '../components/ModalPortal'
import { api } from '../lib/api'
import { createWord, createSrsCard, normalizeDeck, getUserDecks, createDeck, batchAddWordsFromQuran } from '../lib/dataService'
import { getOfflineQuranSurah, getAllOfflineQuranWords } from '../lib/syncService'
import { Search, X, BookOpen, Download } from 'lucide-react'

// ── Helpers ────────────────────────────────────────────────────────────────
const stripDiacritics = (text) =>
  text.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06EA-\u06ED]/g, '')

const isArabic = (text) => /[\u0600-\u06FF]/.test(text)

// Harakat (diacritical marks) range — these are combining characters and
// must stay attached to the preceding letter, not get their own space.
const HARAKAT_RE = /[\u064B-\u065F\u0610-\u061A]/

// Auto-space Arabic letters: "رحم" → "ر ح م"
// Harakat stay glued to the preceding letter: "رَحِمَ" → "رَ حِ مَ"
const formatArabicInput = (text) => {
  const chars = [...text.replace(/\s+/g, '')]
  const result = []
  for (let i = 0; i < chars.length; i++) {
    result.push(chars[i])
    if (i < chars.length - 1 && !HARAKAT_RE.test(chars[i + 1])) {
      result.push(' ')
    }
  }
  return result.join('')
}

// Strip both diacritics and spaces for DB comparison
const normalizeArabicQuery = (text) =>
  stripDiacritics(
    text
      .replace(/\u0640\u0670/g, '\u0627') // ـٰ tatweel + superscript alef → ا (Quranic long-alif convention)
      .replace(/\u0640/g, '')             // strip remaining tatweel/kashida
  )
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627') // أ إ آ ٱ → ا (alif variants)
    .replace(/\u0624/g, '\u0648')                      // ؤ → و
    .replace(/\u0626/g, '\u064A')                      // ئ → ي
    .replace(/\s+/g, '')

// Arabic base letters only (excludes diacritics/tashkeel) — used for letter count
const ARABIC_LETTER_RE = /[\u0621-\u064A]/g

// ── Arabic on-screen keyboard ──────────────────────────────────────────────
const ARABIC_LETTERS = [
  'ا','أ','إ','آ','ب','ت','ث','ج','ح','خ','د',
  'ذ','ر','ز','س','ش','ص','ض','ط',
  'ظ','ع','غ','ف','ق','ك','ل','م',
  'ن','ه','و','ؤ','ي','ئ','ء',
]

// Harakat displayed on alif so each mark is clearly visible
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

// ── All 114 surahs — type: Makki/Madani, verses: verse count ──────────────
const SURAH_LIST = [
  { n: 1,   ar: 'الفاتحة',     en: 'Al-Fatihah',     type: 'Makki',  verses: 7   },
  { n: 2,   ar: 'البقرة',      en: 'Al-Baqarah',     type: 'Madani', verses: 286 },
  { n: 3,   ar: 'آل عمران',    en: 'Aali Imran',     type: 'Madani', verses: 200 },
  { n: 4,   ar: 'النساء',      en: 'An-Nisa',        type: 'Madani', verses: 176 },
  { n: 5,   ar: 'المائدة',     en: 'Al-Maidah',      type: 'Madani', verses: 120 },
  { n: 6,   ar: 'الأنعام',     en: 'Al-Anam',        type: 'Makki',  verses: 165 },
  { n: 7,   ar: 'الأعراف',     en: 'Al-Araf',        type: 'Makki',  verses: 206 },
  { n: 8,   ar: 'الأنفال',     en: 'Al-Anfal',       type: 'Madani', verses: 75  },
  { n: 9,   ar: 'التوبة',      en: 'At-Tawbah',      type: 'Madani', verses: 129 },
  { n: 10,  ar: 'يونس',        en: 'Yunus',          type: 'Makki',  verses: 109 },
  { n: 11,  ar: 'هود',         en: 'Hud',            type: 'Makki',  verses: 123 },
  { n: 12,  ar: 'يوسف',        en: 'Yusuf',          type: 'Makki',  verses: 111 },
  { n: 13,  ar: 'الرعد',       en: 'Ar-Rad',         type: 'Madani', verses: 43  },
  { n: 14,  ar: 'إبراهيم',     en: 'Ibrahim',        type: 'Makki',  verses: 52  },
  { n: 15,  ar: 'الحجر',       en: 'Al-Hijr',        type: 'Makki',  verses: 99  },
  { n: 16,  ar: 'النحل',       en: 'An-Nahl',        type: 'Makki',  verses: 128 },
  { n: 17,  ar: 'الإسراء',     en: 'Al-Isra',        type: 'Makki',  verses: 111 },
  { n: 18,  ar: 'الكهف',       en: 'Al-Kahf',        type: 'Makki',  verses: 110 },
  { n: 19,  ar: 'مريم',        en: 'Maryam',         type: 'Makki',  verses: 98  },
  { n: 20,  ar: 'طه',          en: 'Ta-Ha',          type: 'Makki',  verses: 135 },
  { n: 21,  ar: 'الأنبياء',    en: 'Al-Anbiya',      type: 'Makki',  verses: 112 },
  { n: 22,  ar: 'الحج',        en: 'Al-Hajj',        type: 'Madani', verses: 78  },
  { n: 23,  ar: 'المؤمنون',    en: 'Al-Muminun',     type: 'Makki',  verses: 118 },
  { n: 24,  ar: 'النور',       en: 'An-Nur',         type: 'Madani', verses: 64  },
  { n: 25,  ar: 'الفرقان',     en: 'Al-Furqan',      type: 'Makki',  verses: 77  },
  { n: 26,  ar: 'الشعراء',     en: 'Ash-Shuara',     type: 'Makki',  verses: 227 },
  { n: 27,  ar: 'النمل',       en: 'An-Naml',        type: 'Makki',  verses: 93  },
  { n: 28,  ar: 'القصص',       en: 'Al-Qasas',       type: 'Makki',  verses: 88  },
  { n: 29,  ar: 'العنكبوت',    en: 'Al-Ankabut',     type: 'Makki',  verses: 69  },
  { n: 30,  ar: 'الروم',       en: 'Ar-Rum',         type: 'Makki',  verses: 60  },
  { n: 31,  ar: 'لقمان',       en: 'Luqman',         type: 'Makki',  verses: 34  },
  { n: 32,  ar: 'السجدة',      en: 'As-Sajdah',      type: 'Makki',  verses: 30  },
  { n: 33,  ar: 'الأحزاب',     en: 'Al-Ahzab',       type: 'Madani', verses: 73  },
  { n: 34,  ar: 'سبأ',         en: 'Saba',           type: 'Makki',  verses: 54  },
  { n: 35,  ar: 'فاطر',        en: 'Fatir',          type: 'Makki',  verses: 45  },
  { n: 36,  ar: 'يس',          en: 'Ya-Sin',         type: 'Makki',  verses: 83  },
  { n: 37,  ar: 'الصافات',     en: 'As-Saffat',      type: 'Makki',  verses: 182 },
  { n: 38,  ar: 'ص',           en: 'Sad',            type: 'Makki',  verses: 88  },
  { n: 39,  ar: 'الزمر',       en: 'Az-Zumar',       type: 'Makki',  verses: 75  },
  { n: 40,  ar: 'غافر',        en: 'Ghafir',         type: 'Makki',  verses: 85  },
  { n: 41,  ar: 'فصلت',        en: 'Fussilat',       type: 'Makki',  verses: 54  },
  { n: 42,  ar: 'الشورى',      en: 'Ash-Shura',      type: 'Makki',  verses: 53  },
  { n: 43,  ar: 'الزخرف',      en: 'Az-Zukhruf',     type: 'Makki',  verses: 89  },
  { n: 44,  ar: 'الدخان',      en: 'Ad-Dukhan',      type: 'Makki',  verses: 59  },
  { n: 45,  ar: 'الجاثية',     en: 'Al-Jathiyah',    type: 'Makki',  verses: 37  },
  { n: 46,  ar: 'الأحقاف',     en: 'Al-Ahqaf',       type: 'Makki',  verses: 35  },
  { n: 47,  ar: 'محمد',        en: 'Muhammad',       type: 'Madani', verses: 38  },
  { n: 48,  ar: 'الفتح',       en: 'Al-Fath',        type: 'Madani', verses: 29  },
  { n: 49,  ar: 'الحجرات',     en: 'Al-Hujurat',     type: 'Madani', verses: 18  },
  { n: 50,  ar: 'ق',           en: 'Qaf',            type: 'Makki',  verses: 45  },
  { n: 51,  ar: 'الذاريات',    en: 'Adh-Dhariyat',   type: 'Makki',  verses: 60  },
  { n: 52,  ar: 'الطور',       en: 'At-Tur',         type: 'Makki',  verses: 49  },
  { n: 53,  ar: 'النجم',       en: 'An-Najm',        type: 'Makki',  verses: 62  },
  { n: 54,  ar: 'القمر',       en: 'Al-Qamar',       type: 'Makki',  verses: 55  },
  { n: 55,  ar: 'الرحمن',      en: 'Ar-Rahman',      type: 'Madani', verses: 78  },
  { n: 56,  ar: 'الواقعة',     en: 'Al-Waqiah',      type: 'Makki',  verses: 96  },
  { n: 57,  ar: 'الحديد',      en: 'Al-Hadid',       type: 'Madani', verses: 29  },
  { n: 58,  ar: 'المجادلة',    en: 'Al-Mujadila',    type: 'Madani', verses: 22  },
  { n: 59,  ar: 'الحشر',       en: 'Al-Hashr',       type: 'Madani', verses: 24  },
  { n: 60,  ar: 'الممتحنة',    en: 'Al-Mumtahanah',  type: 'Madani', verses: 13  },
  { n: 61,  ar: 'الصف',        en: 'As-Saf',         type: 'Madani', verses: 14  },
  { n: 62,  ar: 'الجمعة',      en: 'Al-Jumuah',      type: 'Madani', verses: 11  },
  { n: 63,  ar: 'المنافقون',   en: 'Al-Munafiqun',   type: 'Madani', verses: 11  },
  { n: 64,  ar: 'التغابن',     en: 'At-Taghabun',    type: 'Madani', verses: 18  },
  { n: 65,  ar: 'الطلاق',      en: 'At-Talaq',       type: 'Madani', verses: 12  },
  { n: 66,  ar: 'التحريم',     en: 'At-Tahrim',      type: 'Madani', verses: 12  },
  { n: 67,  ar: 'الملك',       en: 'Al-Mulk',        type: 'Makki',  verses: 30  },
  { n: 68,  ar: 'القلم',       en: 'Al-Qalam',       type: 'Makki',  verses: 52  },
  { n: 69,  ar: 'الحاقة',      en: 'Al-Haqqah',      type: 'Makki',  verses: 52  },
  { n: 70,  ar: 'المعارج',     en: "Al-Ma'arij",     type: 'Makki',  verses: 44  },
  { n: 71,  ar: 'نوح',         en: 'Nuh',            type: 'Makki',  verses: 28  },
  { n: 72,  ar: 'الجن',        en: 'Al-Jinn',        type: 'Makki',  verses: 28  },
  { n: 73,  ar: 'المزمل',      en: 'Al-Muzzammil',   type: 'Makki',  verses: 20  },
  { n: 74,  ar: 'المدثر',      en: 'Al-Muddaththir', type: 'Makki',  verses: 56  },
  { n: 75,  ar: 'القيامة',     en: 'Al-Qiyamah',     type: 'Makki',  verses: 40  },
  { n: 76,  ar: 'الإنسان',     en: 'Al-Insan',       type: 'Madani', verses: 31  },
  { n: 77,  ar: 'المرسلات',    en: 'Al-Mursalat',    type: 'Makki',  verses: 50  },
  { n: 78,  ar: 'النبأ',       en: 'An-Naba',        type: 'Makki',  verses: 40  },
  { n: 79,  ar: 'النازعات',    en: 'An-Naziat',      type: 'Makki',  verses: 46  },
  { n: 80,  ar: 'عبس',         en: 'Abasa',          type: 'Makki',  verses: 42  },
  { n: 81,  ar: 'التكوير',     en: 'At-Takwir',      type: 'Makki',  verses: 29  },
  { n: 82,  ar: 'الانفطار',    en: 'Al-Infitar',     type: 'Makki',  verses: 19  },
  { n: 83,  ar: 'المطففين',    en: 'Al-Mutaffifin',  type: 'Makki',  verses: 36  },
  { n: 84,  ar: 'الانشقاق',    en: 'Al-Inshiqaq',    type: 'Makki',  verses: 25  },
  { n: 85,  ar: 'البروج',      en: 'Al-Buruj',       type: 'Makki',  verses: 22  },
  { n: 86,  ar: 'الطارق',      en: 'At-Tariq',       type: 'Makki',  verses: 17  },
  { n: 87,  ar: 'الأعلى',      en: "Al-A'la",        type: 'Makki',  verses: 19  },
  { n: 88,  ar: 'الغاشية',     en: 'Al-Ghashiyah',   type: 'Makki',  verses: 26  },
  { n: 89,  ar: 'الفجر',       en: 'Al-Fajr',        type: 'Makki',  verses: 30  },
  { n: 90,  ar: 'البلد',       en: 'Al-Balad',       type: 'Makki',  verses: 20  },
  { n: 91,  ar: 'الشمس',       en: 'Ash-Shams',      type: 'Makki',  verses: 15  },
  { n: 92,  ar: 'الليل',       en: 'Al-Layl',        type: 'Makki',  verses: 21  },
  { n: 93,  ar: 'الضحى',       en: 'Ad-Duha',        type: 'Makki',  verses: 11  },
  { n: 94,  ar: 'الشرح',       en: 'Ash-Sharh',      type: 'Makki',  verses: 8   },
  { n: 95,  ar: 'التين',       en: 'At-Tin',         type: 'Makki',  verses: 8   },
  { n: 96,  ar: 'العلق',       en: 'Al-Alaq',        type: 'Makki',  verses: 19  },
  { n: 97,  ar: 'القدر',       en: 'Al-Qadr',        type: 'Makki',  verses: 5   },
  { n: 98,  ar: 'البينة',      en: 'Al-Bayyinah',    type: 'Madani', verses: 8   },
  { n: 99,  ar: 'الزلزلة',     en: 'Az-Zalzalah',    type: 'Madani', verses: 8   },
  { n: 100, ar: 'العاديات',    en: 'Al-Adiyat',      type: 'Makki',  verses: 11  },
  { n: 101, ar: 'القارعة',     en: 'Al-Qariah',      type: 'Makki',  verses: 11  },
  { n: 102, ar: 'التكاثر',     en: 'At-Takathur',    type: 'Makki',  verses: 8   },
  { n: 103, ar: 'العصر',       en: 'Al-Asr',         type: 'Makki',  verses: 3   },
  { n: 104, ar: 'الهمزة',      en: 'Al-Humazah',     type: 'Makki',  verses: 9   },
  { n: 105, ar: 'الفيل',       en: 'Al-Fil',         type: 'Makki',  verses: 5   },
  { n: 106, ar: 'قريش',        en: 'Quraysh',        type: 'Makki',  verses: 4   },
  { n: 107, ar: 'الماعون',     en: 'Al-Maun',        type: 'Makki',  verses: 7   },
  { n: 108, ar: 'الكوثر',      en: 'Al-Kawthar',     type: 'Makki',  verses: 3   },
  { n: 109, ar: 'الكافرون',    en: 'Al-Kafirun',     type: 'Makki',  verses: 6   },
  { n: 110, ar: 'النصر',       en: 'An-Nasr',        type: 'Madani', verses: 3   },
  { n: 111, ar: 'المسد',       en: 'Al-Masad',       type: 'Makki',  verses: 5   },
  { n: 112, ar: 'الإخلاص',     en: 'Al-Ikhlas',      type: 'Makki',  verses: 4   },
  { n: 113, ar: 'الفلق',       en: 'Al-Falaq',       type: 'Makki',  verses: 5   },
  { n: 114, ar: 'الناس',       en: 'An-Nas',         type: 'Makki',  verses: 6   },
]

export default function QuranicLexicon() {
  const { currentUser } = useAuth()
  const [selectedSurah,    setSelectedSurah]    = useState(1)
  const [words,            setWords]            = useState([])
  const [loading,          setLoading]          = useState(true)
  const [selectedWord,     setSelectedWord]     = useState(null)
  const [decks,            setDecks]            = useState([])
  const [targetDeckId,     setTargetDeckId]     = useState(null)
  const [addSuccess,       setAddSuccess]       = useState(false)
  const [addError,         setAddError]         = useState('')
  const [searchQuery,      setSearchQuery]      = useState('')
  const [rootQuery,        setRootQuery]        = useState('')
  const [searchResults,    setSearchResults]    = useState([])
  const [searchLoading,    setSearchLoading]    = useState(false)
  const [searchTotal,      setSearchTotal]      = useState(0)
  const [showKeyboard,     setShowKeyboard]     = useState(false)
  const [activeSearchField, setActiveSearchField] = useState('word') // 'word' | 'root'
  const [pendingScrollWord, setPendingScrollWord] = useState(null)
  // Export-to-deck modal state
  const [exportModal,     setExportModal]     = useState(null)  // { title, wordList } | null
  const [exportDeckId,    setExportDeckId]    = useState(null)
  const [exportUseNew,    setExportUseNew]    = useState(false)
  const [exportNewTitle,  setExportNewTitle]  = useState('')
  const [exportPreview,   setExportPreview]   = useState(null)  // { total, alreadyOwned, toAdd }
  const [exportLoading,   setExportLoading]   = useState(false)
  const [exportDone,      setExportDone]      = useState(null)  // { added, alreadyOwned }
  const [surahSearch,      setSurahSearch]      = useState('')
  const [surahDropdown,    setSurahDropdown]    = useState(false)
  // null = still loading, Set = loaded (may be empty)
  const [userWordSet,      setUserWordSet]      = useState(null)
  const [wordCount,        setWordCount]        = useState(null)  // occurrences in full Quran
  const surahInputRef = useRef(null)
  const surahDropdownRef = useRef(null)
  const searchRef = useRef(null)
  const rootSearchRef = useRef(null)

  // ── Load words when surah changes (offline-aware) ────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setSelectedWord(null)
    setWords([])

    const fetchAll = async () => {
      // Cache-first: Quran data is static — if already downloaded, use it immediately
      const cached = await getOfflineQuranSurah(selectedSurah)
      if (cached.length > 0) {
        if (!cancelled) { setWords(cached); setLoading(false) }
        return
      }

      // Cache miss — fetch from API (no pagination needed with SQLite)
      const all = await api.get(`/quran/${selectedSurah}`)
      if (!cancelled) {
        setWords(all || [])
        setLoading(false)
      }
    }

    fetchAll()
    return () => { cancelled = true }
  }, [selectedSurah])

  // ── Scroll to pending word after surah loads ──────────────────────────────
  useEffect(() => {
    if (!pendingScrollWord || words.length === 0) return
    // The effect fires when pendingScrollWord is set but words still holds the
    // OLD surah's data (setWords([]) inside the load effect hasn't committed yet).
    // Guard: if these aren't the right surah's words, wait.
    if (words[0]?.surah !== pendingScrollWord.surah) return
    const match = words.find(
      w => w.verse === pendingScrollWord.verse && w.position === pendingScrollWord.position
    )
    if (match) {
      setSelectedWord(match)
      // Double rAF ensures the DOM has been painted before scrolling
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = document.getElementById(`verse-${match.verse}`)
          if (el) {
            const top = el.getBoundingClientRect().top + window.scrollY - 120
            window.scrollTo({ top, behavior: 'smooth' })
          }
        })
      })
      setPendingScrollWord(null)
    }
  }, [words, pendingScrollWord])

  // ── Load user decks (offline-aware via getUserDecks) ─────────────────────
  useEffect(() => {
    if (!currentUser) return
    let cancelled = false
    getUserDecks(currentUser.id)
      .then(data => {
        if (cancelled) return
        const normalized = (data || []).map(normalizeDeck)
        setDecks(normalized)
        if (normalized.length > 0) setTargetDeckId(normalized[0].id)
      })
      .catch(console.error)
    return () => { cancelled = true }
  }, [currentUser])

  // ── Count full-Quran occurrences of selected word ────────────────────────
  useEffect(() => {
    if (!selectedWord) { setWordCount(null); return }
    let cancelled = false

    const fetchCount = async () => {
      const bare = selectedWord.arabic_bare?.trim()

      // API handles arabic_bare → exact fallback internally
      const data = await api.get(`/quran/count?arabic=${encodeURIComponent(selectedWord.arabic)}`)
      if (!cancelled) setWordCount(data?.count ?? null)
    }

    fetchCount().catch(() => { if (!cancelled) setWordCount(null) })
    return () => { cancelled = true }
  }, [selectedWord])

  // ── Load user's word bank Arabic values for known/unknown tracking ───────
  useEffect(() => {
    if (!currentUser) { setUserWordSet(new Set()); return }
    let cancelled = false
    api.get('/words')
      .then(data => {
        if (cancelled) return
        const set = new Set((data || []).map(w => normalizeArabicQuery(w.arabic || '')))
        setUserWordSet(set)
      })
      .catch(() => { if (!cancelled) setUserWordSet(new Set()) })
    return () => { cancelled = true }
  }, [currentUser])

  // ── Debounced search — word/English bar + separate root bar ─────────────
  useEffect(() => {
    const hasWord = searchQuery.trim()
    const hasRoot = rootQuery.trim()
    if (!hasWord && !hasRoot) { setSearchResults([]); setSearchTotal(0); return }
    const timer = setTimeout(async () => {
      setSearchLoading(true)
      setSelectedWord(null)
      try {
        const q        = searchQuery.trim()
        const rq       = rootQuery.trim()
        const arabic   = isArabic(q)
        const normalized = q ? normalizeArabicQuery(q) : ''
        const normalizedRoot = rq ? normalizeArabicQuery(rq) : ''

        let matches

        if (!navigator.onLine) {
          // Offline: filter the full cached Quran in JS
          const allWords = await getAllOfflineQuranWords()
          const lower = q.toLowerCase()
          const filtered = allWords.filter(w => {
            let wordMatch = false
            let rootMatch = false
            if (hasWord) {
              wordMatch = arabic
                ? (w.arabic_bare || '').includes(normalized)
                : (w.english || '').toLowerCase().includes(lower)
            }
            if (hasRoot) {
              rootMatch = (w.root_bare || '').includes(normalizedRoot)
            }
            return hasWord && hasRoot ? wordMatch && rootMatch : wordMatch || rootMatch
          })
          matches = filtered.slice(0, 200).map(w => ({
            surah: w.surah, verse: w.verse, position: w.position, id: w.id,
          }))
        } else {
          // Online: API search
          const params = new URLSearchParams()
          if (hasWord) params.set('q', arabic ? normalized : q)
          if (hasRoot) params.set('root', normalizedRoot)
          params.set('limit', '200')
          matches = await api.get(`/quran/search?${params}`) || []
        }

        if (!matches?.length) {
          setSearchResults([]); setSearchTotal(0); setSearchLoading(false); return
        }

        // Deduplicate to unique (surah, verse) pairs, max 100
        const seen = new Set()
        const versePairs = []
        for (const m of matches) {
          const key = `${m.surah}:${m.verse}`
          if (!seen.has(key)) { seen.add(key); versePairs.push({ surah: m.surah, verse: m.verse }) }
          if (versePairs.length >= 100) break
        }
        setSearchTotal(seen.size > 100 ? matches.length : seen.size)

        // Fetch full verse words in parallel (offline: from cache, online: Supabase)
        const matchedKeys = new Set(matches.map(m => `${m.surah}:${m.verse}:${m.position}`))

        let verseWordSets
        if (!navigator.onLine) {
          const allWords = await getAllOfflineQuranWords()
          verseWordSets = versePairs.map(({ surah, verse }) =>
            allWords
              .filter(w => w.surah === surah && w.verse === verse)
              .sort((a, b) => a.position - b.position)
          )
        } else {
          const responses = await Promise.all(
            versePairs.map(({ surah, verse }) =>
              api.get(`/quran/${surah}?verse=${verse}`)
            )
          )
          verseWordSets = responses.map(r => r || [])
        }

        setSearchResults(versePairs.map(({ surah, verse }, i) => ({
          surah,
          verse,
          words: verseWordSets[i].map(w => ({
            ...w,
            isMatch: matchedKeys.has(`${w.surah}:${w.verse}:${w.position}`),
          })),
        })))
      } catch (e) {
        console.error(e)
      } finally {
        setSearchLoading(false)
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [searchQuery, rootQuery])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleGoToSurah = (surahNum, word) => {
    setSearchQuery('')
    setRootQuery('')
    setShowKeyboard(false)
    setSelectedWord(null)
    setSelectedSurah(surahNum)
    if (word) setPendingScrollWord({ surah: surahNum, verse: word.verse, position: word.position })
  }

  const handleSelectWord = (word) => {
    setSelectedWord(prev => prev?.id === word.id ? null : word)
    setAddSuccess(false)
    setAddError('')
  }

  const handleKeyboardLetter = (letter) => {
    if (activeSearchField === 'root') {
      // Root field: auto-space between letters
      if (HARAKAT_RE.test(letter)) {
        setRootQuery(prev => {
          const bare = prev.replace(/\s+/g, '')
          const chars = [...bare]
          if (chars.length > 0 && HARAKAT_RE.test(chars[chars.length - 1])) chars[chars.length - 1] = letter
          else chars.push(letter)
          return formatArabicInput(chars.join(''))
        })
      } else {
        setRootQuery(prev => formatArabicInput(prev + letter))
      }
      rootSearchRef.current?.focus()
    } else {
      // Word field: no auto-spacing (exact Arabic word)
      if (HARAKAT_RE.test(letter)) {
        setSearchQuery(prev => {
          const chars = [...prev]
          if (chars.length > 0 && HARAKAT_RE.test(chars[chars.length - 1])) chars[chars.length - 1] = letter
          else chars.push(letter)
          return chars.join('')
        })
      } else {
        setSearchQuery(prev => prev + letter)
      }
      searchRef.current?.focus()
    }
  }

  const handleKeyboardBackspace = () => {
    if (activeSearchField === 'root') {
      setRootQuery(prev => {
        const bare = prev.replace(/\s+/g, '')
        const trimmed = [...bare].slice(0, -1).join('')
        return trimmed ? formatArabicInput(trimmed) : ''
      })
      rootSearchRef.current?.focus()
    } else {
      setSearchQuery(prev => [...prev].slice(0, -1).join(''))
      searchRef.current?.focus()
    }
  }

  // ── Export modal handlers ─────────────────────────────────────────────────
  const computeExportPreview = async (wordList, deckId) => {
    if (!currentUser || !deckId) return
    setExportLoading(true)
    setExportPreview(null)
    try {
      const existing = await api.get(`/words/deck/${deckId}`)
      const existingSet = new Set((existing || []).map(w => w.arabic))
      const seen = new Set()
      let toAdd = 0, alreadyOwned = 0
      for (const w of wordList) {
        if (!w.arabic) continue
        if (existingSet.has(w.arabic)) { alreadyOwned++; continue }
        if (seen.has(w.arabic)) continue
        seen.add(w.arabic)
        toAdd++
      }
      setExportPreview({ total: seen.size + alreadyOwned, alreadyOwned, toAdd })
    } catch (_) {
      setExportPreview(null)
    }
    setExportLoading(false)
  }

  const openExportModal = (title, wordList) => {
    if (!currentUser) return
    const defaultDeckId = decks?.[0]?.id || null
    setExportModal({ title, wordList })
    setExportDeckId(defaultDeckId)
    setExportUseNew(false)
    setExportNewTitle(title)
    setExportDone(null)
    setExportPreview(null)
    if (defaultDeckId) computeExportPreview(wordList, defaultDeckId)
  }

  const handleExport = async () => {
    if (!currentUser || !exportModal) return
    setExportLoading(true)
    try {
      let deckId = exportDeckId
      if (exportUseNew) {
        if (!exportNewTitle.trim()) { setExportLoading(false); return }
        const newDeck = await createDeck(currentUser.id, { title: exportNewTitle.trim(), description: '' })
        deckId = newDeck.id
        setDecks(prev => [...prev, normalizeDeck(newDeck)])
      }
      if (!deckId) { setExportLoading(false); return }
      const result = await batchAddWordsFromQuran(currentUser.id, deckId, exportModal.wordList)
      setExportDone(result)
    } catch (err) {
      alert('Export failed: ' + (err.message || 'Unknown error'))
    }
    setExportLoading(false)
  }

  const handleAddToWordBank = async () => {
    if (!selectedWord || !currentUser) return
    setAddError('')
    const deckId = targetDeckId || decks?.[0]?.id
    if (!deckId) { setAddError('Please create a deck first.'); return }

    const { exists } = await api.get(`/words/exists?arabic=${encodeURIComponent(selectedWord.arabic)}`)
    if (exists) { setAddError('This word is already in your word bank.'); return }

    try {
      const newWord = await createWord(currentUser.id, {
        deckId,
        arabic:          selectedWord.arabic,
        english:         selectedWord.english,
        root:            selectedWord.root || '',
        partOfSpeech:    selectedWord.grammar_tag || '',
        exampleSentence: '',
      })
      await createSrsCard(currentUser.id, { wordId: newWord.id, deckId })
      setAddSuccess(true)
    } catch (err) {
      setAddError(err.message || 'Failed to add word.')
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const verses = useMemo(() => {
    const map = {}
    for (const w of words) {
      if (!map[w.verse]) map[w.verse] = []
      map[w.verse].push(w)
    }
    return map
  }, [words])

  const verseNumbers = useMemo(
    () => Object.keys(verses).map(Number).sort((a, b) => a - b),
    [verses]
  )

  const letterCount = useMemo(() => {
    if (!words.length) return 0
    return words.reduce((sum, w) => {
      const m = (w.arabic || '').match(ARABIC_LETTER_RE)
      return sum + (m ? m.length : 0)
    }, 0)
  }, [words])

  // ── Surah coverage: unique words known vs unknown ─────────────────────────
  const surahCoverage = useMemo(() => {
    if (!words.length || !userWordSet) return null
    // Deduplicate by arabic_bare (normalized form in DB, or computed on the fly)
    const uniqueMap = new Map() // bare string → first quran_words row
    for (const w of words) {
      const bare = w.arabic_bare || normalizeArabicQuery(w.arabic || '')
      if (!uniqueMap.has(bare)) uniqueMap.set(bare, w)
    }
    const unknownWords = []
    let known = 0
    for (const [bare, w] of uniqueMap) {
      if (userWordSet.has(bare)) known++
      else unknownWords.push(w)
    }
    return { total: uniqueMap.size, known, unknown: unknownWords.length, unknownWords }
  }, [words, userWordSet])

  const currentSurah = SURAH_LIST[selectedSurah - 1]
  const searchIsArabic = isArabic(searchQuery)

  const filteredSurahs = useMemo(() => {
    if (!surahSearch.trim()) return SURAH_LIST
    const q = surahSearch.trim().toLowerCase()
    return SURAH_LIST.filter(s =>
      s.en.toLowerCase().includes(q) ||
      s.ar.includes(surahSearch.trim()) ||
      String(s.n).startsWith(q)
    )
  }, [surahSearch])

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Quranic Lexicon</h1>
        <p className="page-subtitle">Click any word to explore its meaning, root, and grammar</p>
      </div>

      {/* ── Controls ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: showKeyboard ? 12 : 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <div
          ref={surahDropdownRef}
          style={{ position: 'relative', maxWidth: 300, flex: '1 1 200px' }}
          onBlur={e => {
            if (!surahDropdownRef.current?.contains(e.relatedTarget)) {
              setSurahDropdown(false)
              setSurahSearch('')
            }
          }}
        >
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
            <input
              ref={surahInputRef}
              className="form-input"
              placeholder={`${currentSurah.n}. ${currentSurah.ar} — ${currentSurah.en}`}
              value={surahSearch}
              disabled={!!(searchQuery || rootQuery)}
              onChange={e => { setSurahSearch(e.target.value); setSurahDropdown(true) }}
              onFocus={() => { setSurahSearch(''); setSurahDropdown(true) }}
              style={{ paddingLeft: 32, width: '100%' }}
            />
          </div>
          {surahDropdown && (
            <div className="surah-search-dropdown">
              {filteredSurahs.length === 0
                ? <div style={{ padding: '10px 14px', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>No surahs found</div>
                : filteredSurahs.map(s => (
                  <button
                    key={s.n}
                    className={`surah-search-option${s.n === selectedSurah ? ' active' : ''}`}
                    onMouseDown={e => {
                      e.preventDefault()
                      setSelectedSurah(s.n)
                      setSurahDropdown(false)
                      setSurahSearch('')
                    }}
                  >
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.78rem', minWidth: 24 }}>{s.n}.</span>
                    <span style={{ fontFamily: 'var(--font-arabic)', direction: 'rtl', fontSize: '1rem' }}>{s.ar}</span>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>{s.en}</span>
                  </button>
                ))
              }
            </div>
          )}
        </div>

        {/* Arabic keyboard toggle — first */}
        <button
          className={`btn${showKeyboard ? ' btn-primary' : ''}`}
          onClick={() => setShowKeyboard(k => !k)}
          title="Toggle Arabic keyboard"
          style={{ fontFamily: 'var(--font-arabic)', fontSize: '1.1rem', padding: '6px 14px', flexShrink: 0 }}
        >
          ع
        </button>

        {/* Word / English search */}
        <div className="search-input-wrapper" style={{ flex: 2, minWidth: 160 }}>
          <span className="search-icon"><Search size={16} /></span>
          <input
            ref={searchRef}
            type="text"
            className="form-input"
            placeholder="Arabic word or English…"
            value={searchQuery}
            onFocus={() => setActiveSearchField('word')}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ paddingLeft: 36, paddingRight: searchQuery ? 36 : undefined, direction: isArabic(searchQuery) ? 'rtl' : 'ltr' }}
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setSelectedWord(null) }}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}
            ><X size={16} /></button>
          )}
        </div>

        {/* Root search — auto-spaces between letters */}
        <div className="search-input-wrapper" style={{ flex: 1, minWidth: 120 }}>
          <span className="search-icon"><Search size={16} /></span>
          <input
            ref={rootSearchRef}
            type="text"
            className="form-input"
            placeholder="Root (ر ج ع)…"
            value={rootQuery}
            onFocus={() => setActiveSearchField('root')}
            onChange={e => {
              const val = e.target.value
              setRootQuery(isArabic(val) ? formatArabicInput(val) : val)
            }}
            style={{ paddingLeft: 36, paddingRight: rootQuery ? 36 : undefined, direction: rootQuery ? 'rtl' : 'ltr', fontFamily: 'var(--font-arabic)' }}
          />
          {rootQuery && (
            <button onClick={() => setRootQuery('')}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}
            ><X size={16} /></button>
          )}
        </div>
      </div>

      {/* ── Arabic keyboard panel ── */}
      {showKeyboard && (
        <ArabicKeyboard
          onLetter={handleKeyboardLetter}
          onBackspace={handleKeyboardBackspace}
        />
      )}

      {/* ── Search mode indicator ── */}
      {(searchQuery || rootQuery) && (
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 12 }}>
          {[searchQuery && (isArabic(searchQuery) ? 'Arabic word' : 'English'), rootQuery && 'root'].filter(Boolean).join(' + ')} search
        </p>
      )}

      <div className="quran-page">
        {/* ── Text panel ── */}
        <div className="quran-text-panel">
          {(searchQuery || rootQuery) ? (
            /* Search results */
            <>
              {searchLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
                  <div className="spinner" />
                </div>
              ) : searchResults.length === 0 ? (
                <div className="empty-state" style={{ padding: '60px 0' }}>
                  <div className="empty-state-icon"><Search size={40} strokeWidth={1.25} /></div>
                  <div className="empty-state-title">No results</div>
                  <p style={{ color: 'var(--color-text-muted)' }}>No verses found for "{searchQuery || rootQuery}"</p>
                </div>
              ) : (
                <>
                  <p className="search-result-count">
                    Showing {searchResults.length} of {searchTotal} verse{searchTotal !== 1 ? 's' : ''}
                  </p>
                  {searchResults.map(({ surah, verse, words: verseWords }) => {
                    const surahInfo = SURAH_LIST[surah - 1]
                    const firstMatch = verseWords.find(w => w.isMatch)
                    return (
                      <div key={`${surah}:${verse}`} className="verse-result-card">
                        <div className="verse-result-header">
                          <span><strong>{surahInfo.en}</strong> · {surah}:{verse}</span>
                          <button
                            className="btn btn-sm"
                            onClick={() => handleGoToSurah(surah, firstMatch)}
                            style={{ fontSize: '0.78rem', padding: '3px 10px' }}
                          >
                            Go to Surah →
                          </button>
                        </div>
                        <div className="verse-result-body">
                          <div className="verse-text">
                            {verseWords.map(word => (
                              <span
                                key={word.id}
                                className={[
                                  'quran-word',
                                  word.isMatch ? 'match' : '',
                                  selectedWord?.id === word.id ? 'selected' : '',
                                ].filter(Boolean).join(' ')}
                                onClick={() => handleSelectWord(word)}
                              >
                                <span className="quran-word-arabic">{word.arabic}</span>
                                <span className="quran-word-english">{word.english}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </>
          ) : (
            /* Surah browse view */
            <>
              <div className="surah-title">{currentSurah.ar}</div>
              <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: 24 }}>
                Surah {currentSurah.en} · Surah {selectedSurah}
              </p>

              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
                  <div className="spinner" />
                </div>
              ) : words.length === 0 ? (
                <div className="empty-state" style={{ padding: '60px 0' }}>
                  <div className="empty-state-icon"><BookOpen size={40} strokeWidth={1.25} /></div>
                  <div className="empty-state-title">No data found</div>
                  <p style={{ color: 'var(--color-text-muted)' }}>This surah has not been seeded yet.</p>
                </div>
              ) : (
                verseNumbers.map(vNum => (
                  <div key={vNum} id={`verse-${vNum}`} className="verse">
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, direction: 'rtl' }}>
                      <span className="verse-number">{vNum}</span>
                      <div className="verse-text">
                        {verses[vNum].map(word => {
                          const bare = word.arabic_bare || normalizeArabicQuery(word.arabic || '')
                          const isKnown = userWordSet?.has(bare)
                          return (
                          <span
                            key={word.id}
                            className={['quran-word', selectedWord?.id === word.id ? 'selected' : '', isKnown ? 'known' : ''].filter(Boolean).join(' ')}
                            onClick={() => handleSelectWord(word)}
                          >
                            <span className="quran-word-arabic">{word.arabic}</span>
                            <span className="quran-word-english">{word.english}</span>
                          </span>
                          )
                        })}
                      </div>
                    </div>
                    {currentUser && (
                      <button
                        className="verse-export-btn"
                        title={`Export verse ${vNum} to deck`}
                        onClick={() => openExportModal(`${currentSurah.en} ${selectedSurah}:${vNum}`, verses[vNum])}
                      >
                        <Download size={12} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </>
          )}
        </div>

        {/* ── Info panel ── */}
        <div className="quran-info-panel">
          {selectedWord ? (
            <>
              <div className="quran-info-arabic">
                {selectedWord.arabic}
              </div>
              <div className="quran-info-english">{selectedWord.english}</div>
              <div className="divider" />
              {selectedWord.root && (
                <div className="quran-info-row">
                  <span className="quran-info-label">Root</span>
                  <span className="quran-info-value arabic">{selectedWord.root}</span>
                </div>
              )}
              {selectedWord.grammar_tag && (
                <div className="quran-info-row">
                  <span className="quran-info-label">Grammar</span>
                  <span className="quran-info-value arabic">{selectedWord.grammar_tag}</span>
                </div>
              )}
              <div className="quran-info-row">
                <span className="quran-info-label">Verse</span>
                <span className="quran-info-value">{selectedWord.verse}:{selectedWord.position}</span>
              </div>
              <div className="quran-info-row">
                <span className="quran-info-label">In Quran</span>
                <span className="quran-info-value">
                  {wordCount === null ? '…' : `${wordCount.toLocaleString()}×`}
                </span>
              </div>
              <div className="divider" />
              <div className="form-group" style={{ marginBottom: 8 }}>
                <label className="form-label">Add to deck:</label>
                <select
                  className="form-select"
                  value={targetDeckId || ''}
                  onChange={e => setTargetDeckId(Number(e.target.value))}
                >
                  {decks.length > 0
                    ? decks.map(d => <option key={d.id} value={d.id}>{d.title}</option>)
                    : <option disabled>No decks — create one first</option>
                  }
                </select>
              </div>
              {addSuccess && (
                <div className="alert alert-success" style={{ padding: '8px 12px', fontSize: '0.82rem' }}>
                  Added to your word bank!
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
            <div>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontFamily: 'var(--font-arabic)', direction: 'rtl', fontSize: '1.6rem', color: 'var(--color-primary)', marginBottom: 4 }}>
                  {currentSurah.ar}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{currentSurah.en}</div>
              </div>
              <div className="surah-stat-grid">
                <div className="surah-stat">
                  <div className="surah-stat-label">Type</div>
                  <div className="surah-stat-value">{currentSurah.type}</div>
                </div>
                <div className="surah-stat">
                  <div className="surah-stat-label">Verses</div>
                  <div className="surah-stat-value">{currentSurah.verses}</div>
                </div>
                <div className="surah-stat">
                  <div className="surah-stat-label">Words</div>
                  <div className="surah-stat-value">{loading ? '…' : words.length}</div>
                </div>
                <div className="surah-stat">
                  <div className="surah-stat-label">Letters</div>
                  <div className="surah-stat-value">{loading ? '…' : letterCount.toLocaleString()}</div>
                </div>
                <div className="surah-stat" style={{ gridColumn: '1 / -1' }}>
                  <div className="surah-stat-label">Hasanat (×10)</div>
                  <div className="surah-stat-value" style={{ color: 'var(--color-primary)' }}>
                    {loading ? '…' : (letterCount * 10).toLocaleString()}
                  </div>
                </div>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 16 }}>
                Click any word to see its meaning, root, and grammar.
              </p>
              {/* ── Vocabulary coverage ── */}
              {currentUser && surahCoverage && !loading && (
                <div className="surah-coverage">
                  <div className="surah-coverage-header">
                    <span>Vocabulary</span>
                    <span>
                      <strong style={{ color: 'var(--color-success)' }}>{surahCoverage.known}</strong>
                      <span style={{ color: 'var(--color-text-muted)' }}> / {surahCoverage.total} words known</span>
                    </span>
                  </div>
                  <div className="coverage-bar">
                    <div
                      className="coverage-bar-fill"
                      style={{ width: surahCoverage.total > 0 ? `${(surahCoverage.known / surahCoverage.total) * 100}%` : '0%' }}
                    />
                  </div>
                  {surahCoverage.unknown === 0 ? (
                    <p style={{ textAlign: 'center', color: 'var(--color-success)', fontSize: '0.82rem', marginTop: 8 }}>
                      You know all unique words in this surah!
                    </p>
                  ) : (
                    <button
                      className="btn btn-primary"
                      style={{ width: '100%', marginTop: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      onClick={() => openExportModal(
                        `${currentSurah.en} — ${surahCoverage.unknown} unknown words`,
                        surahCoverage.unknownWords
                      )}
                    >
                      <Download size={14} /> Add {surahCoverage.unknown} unknown words to deck
                    </button>
                  )}
                </div>
              )}

              {!loading && words.length > 0 && currentUser && (
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%', marginTop: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  onClick={() => openExportModal(`${currentSurah.en} (Surah ${selectedSurah})`, words)}
                >
                  <Download size={14} /> Export all words to deck
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Export to Deck modal ── */}
      {exportModal && (
        <ModalPortal>
        <div className="modal-overlay" onClick={() => { if (!exportLoading) setExportModal(null) }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title">Export to Deck</h3>
              <button className="modal-close" onClick={() => setExportModal(null)} disabled={exportLoading}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontWeight: 600, marginBottom: 12 }}>{exportModal.title}</p>

              {/* Preview counts */}
              {exportPreview ? (
                <div style={{ background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Unique words</span>
                    <strong>{exportPreview.total}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Already in your bank (skipped)</span>
                    <strong style={{ color: 'var(--color-warning)' }}>{exportPreview.alreadyOwned}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>New words to add</span>
                    <strong style={{ color: 'var(--color-success)' }}>{exportPreview.toAdd}</strong>
                  </div>
                </div>
              ) : exportLoading && !exportDone ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                  <div className="spinner" style={{ width: 16, height: 16 }} /> Calculating…
                </div>
              ) : null}

              {exportDone ? (
                <div className="alert alert-success" style={{ marginBottom: 0 }}>
                  Added {exportDone.added} word{exportDone.added !== 1 ? 's' : ''} to your deck.
                  {exportDone.alreadyOwned > 0 && ` ${exportDone.alreadyOwned} duplicate${exportDone.alreadyOwned !== 1 ? 's' : ''} skipped.`}
                </div>
              ) : (
                <>
                  {/* Deck selector */}
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label className="form-label">Add to existing deck</label>
                    <select
                      className="form-select"
                      value={exportUseNew ? '' : (exportDeckId || '')}
                      onChange={e => { setExportUseNew(false); const id = Number(e.target.value); setExportDeckId(id); computeExportPreview(exportModal.wordList, id) }}
                      disabled={exportUseNew || exportLoading}
                    >
                      {decks.length > 0
                        ? decks.map(d => <option key={d.id} value={d.id}>{d.title}</option>)
                        : <option disabled>No decks — create one below</option>
                      }
                    </select>
                  </div>

                  {/* Create new deck option */}
                  <div className="form-group" style={{ marginBottom: 16 }}>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={exportUseNew}
                        onChange={e => setExportUseNew(e.target.checked)}
                        disabled={exportLoading}
                      />
                      Create a new deck instead
                    </label>
                    {exportUseNew && (
                      <input
                        className="form-input"
                        style={{ marginTop: 6 }}
                        placeholder="New deck name"
                        value={exportNewTitle}
                        onChange={e => setExportNewTitle(e.target.value)}
                        disabled={exportLoading}
                        autoFocus
                      />
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" onClick={() => setExportModal(null)} disabled={exportLoading}>Cancel</button>
                    <button
                      className="btn btn-primary"
                      onClick={handleExport}
                      disabled={exportLoading || exportPreview?.toAdd === 0 || (exportUseNew && !exportNewTitle.trim())}
                    >
                      {exportLoading ? 'Exporting…' : `Export ${exportPreview?.toAdd ?? '…'} words →`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  )
}
