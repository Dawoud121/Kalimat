// Dexie instance used exclusively as an offline cache.
// Stores raw Supabase snake_case rows so normalizers work unchanged.
// Separate from the legacy KalimatDB (which used the old Dexie-only schema).
import Dexie from 'dexie'

const offlineDb = new Dexie('KalimatOfflineCache')

offlineDb.version(1).stores({
  words:     'id, user_id, deck_id',
  decks:     'id, user_id',
  srsCards:  'id, user_id, word_id, deck_id, next_review_date',
  syncQueue: '++localId, cardId',   // pending srsCard updates made while offline
  meta:      'key',                 // { key: 'lastSync_<userId>', value: timestamp }
})

// v2 — adds the Quran lexicon cache (one-time download, static data)
offlineDb.version(2).stores({
  words:      'id, user_id, deck_id',
  decks:      'id, user_id',
  srsCards:   'id, user_id, word_id, deck_id, next_review_date',
  syncQueue:  '++localId, cardId',
  meta:       'key',
  quranWords: 'id, surah',          // indexed by surah for fast per-surah reads
})

export default offlineDb
