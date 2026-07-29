// v2.8.0
// Offline sync service for Kalimat.
// Handles: initial data download → IndexedDB, local SRS updates, queue flush on reconnect.
import offlineDb from '../db/offlineDb'
import { api } from './api'

// ── Initial sync ──────────────────────────────────────────────────────────────
// Called after login/session restore. Downloads all user data into IndexedDB.
// Fire-and-forget — never blocks the UI.
export async function initialSync(userId) {
  if (!navigator.onLine) return
  try {
    const [words, decks, srsCards] = await Promise.all([
      api.get('/words'),
      api.get('/decks'),
      api.get('/srs'),
    ])

    await offlineDb.transaction('rw',
      [offlineDb.words, offlineDb.decks, offlineDb.srsCards, offlineDb.meta],
      async () => {
        await offlineDb.words.where('user_id').equals(userId).delete()
        await offlineDb.decks.where('user_id').equals(userId).delete()
        await offlineDb.srsCards.where('user_id').equals(userId).delete()
        if (words.length)    await offlineDb.words.bulkPut(words)
        if (decks.length)    await offlineDb.decks.bulkPut(decks)
        if (srsCards.length) await offlineDb.srsCards.bulkPut(srsCards)
        await offlineDb.meta.put({ key: `lastSync_${userId}`, value: Date.now() })
      }
    )
    console.log(`[Kalimat] Offline cache ready: ${words.length} words, ${srsCards.length} cards`)
  } catch (err) {
    console.warn('[Kalimat] Cache sync failed:', err.message)
  }
}

// ── Flush queue on reconnect ──────────────────────────────────────────────────
// Sends any SRS card updates that were made while offline.
export async function flushSyncQueue() {
  if (!navigator.onLine) return
  let pending
  try {
    pending = await offlineDb.syncQueue.toArray()
  } catch (_) { return }
  if (!pending.length) return

  let flushed = 0
  for (const item of pending) {
    try {
      await api.put(`/srs/${item.cardId}`, {
        repetitions:      item.updates.repetitions,
        ease_factor:      item.updates.easeFactor,
        interval:         item.updates.interval,
        next_review_date: item.updates.nextReviewDate,
        last_reviewed:    item.updates.lastReviewed,
      })
      await offlineDb.syncQueue.delete(item.localId)
      flushed++
    } catch (err) {
      console.warn('[Kalimat] Flush failed for card', item.cardId, err.message)
      break
    }
  }
  if (flushed > 0) {
    console.log(`[Kalimat] Synced ${flushed} offline rating${flushed > 1 ? 's' : ''}`)
  }
}

// ── Local SRS write ───────────────────────────────────────────────────────────
export async function updateSrsCardLocally(cardId, updates) {
  try {
    await offlineDb.srsCards.update(cardId, {
      repetitions:      updates.repetitions,
      ease_factor:      updates.easeFactor,
      interval:         updates.interval,
      next_review_date: updates.nextReviewDate,
      last_reviewed:    updates.lastReviewed,
    })
  } catch (_) {}
}

export async function queueSrsCardUpdate(cardId, updates) {
  try {
    await offlineDb.syncQueue.add({ cardId, updates, timestamp: Date.now() })
  } catch (_) {}
}

// ── Cache helpers (fire-and-forget) ──────────────────────────────────────────
export function cacheWord(word)      { offlineDb.words.put(word).catch(() => {})    }
export function cacheSrsCard(card)   { offlineDb.srsCards.put(card).catch(() => {}) }
export function cacheDeck(deck)      { offlineDb.decks.put(deck).catch(() => {})    }

export function removeCachedWord(id)    { offlineDb.words.delete(id).catch(() => {})    }
export function removeCachedDeck(id)    { offlineDb.decks.delete(id).catch(() => {})    }
export function removeCachedSrsCardsByWord(wordId) {
  offlineDb.srsCards.where('word_id').equals(wordId).delete().catch(() => {})
}
export function removeCachedSrsCardsByDeck(deckId) {
  offlineDb.srsCards.where('deck_id').equals(deckId).delete().catch(() => {})
}
export function removeCachedWordsByDeck(deckId) {
  offlineDb.words.where('deck_id').equals(deckId).delete().catch(() => {})
}

// ── Offline reads (raw snake_case — matches API output) ─────────────────────
export async function getOfflineWords(userId) {
  return offlineDb.words.where('user_id').equals(userId).toArray()
}
export async function getOfflineDecks(userId) {
  return offlineDb.decks.where('user_id').equals(userId).toArray()
}
export async function getOfflineSrsCards(userId) {
  return offlineDb.srsCards.where('user_id').equals(userId).toArray()
}

// ── Status ────────────────────────────────────────────────────────────────────
export async function hasCachedData(userId) {
  try {
    const meta = await offlineDb.meta.get(`lastSync_${userId}`)
    return !!meta
  } catch (_) { return false }
}

export async function getPendingQueueCount() {
  try { return offlineDb.syncQueue.count() }
  catch (_) { return 0 }
}

// ── Quran lexicon cache ───────────────────────────────────────────────────────
// One-time download of all 114 surahs (~77k word tokens).
// Quran text is static — once cached it is never re-downloaded.
const QURAN_CACHE_KEY = 'quranCached'

export async function syncQuranLexicon() {
  if (!navigator.onLine) return
  try {
    const cached = await offlineDb.meta.get(QURAN_CACHE_KEY)
    if (cached) return
  } catch (_) {}

  try {
    // Fetch all surahs (1–114) and combine
    let all = []
    for (let surah = 1; surah <= 114; surah++) {
      const data = await api.get(`/quran/${surah}`)
      if (data?.length) all = all.concat(data)
    }

    if (all.length > 0) {
      await offlineDb.quranWords.bulkPut(all)
      await offlineDb.meta.put({ key: QURAN_CACHE_KEY, value: Date.now() })
      console.log(`[Kalimat] Quran cached: ${all.length} words`)
    }
  } catch (err) {
    console.warn('[Kalimat] Quran cache failed:', err.message)
  }
}

// Read one surah from cache, sorted by verse → position
export async function getOfflineQuranSurah(surahNum) {
  try {
    const words = await offlineDb.quranWords.where('surah').equals(surahNum).toArray()
    return words.sort((a, b) => a.verse !== b.verse ? a.verse - b.verse : a.position - b.position)
  } catch (_) { return [] }
}

// Read all cached Quran words (for full-text offline search)
export async function getAllOfflineQuranWords() {
  try { return offlineDb.quranWords.toArray() }
  catch (_) { return [] }
}

export async function isQuranCached() {
  try {
    const meta = await offlineDb.meta.get(QURAN_CACHE_KEY)
    return !!meta
  } catch (_) { return false }
}
