// v2.8.0
// All data operations for Kalimat — uses PHP/SQLite backend via api.js

// ── Trust score constants (tune these in one place) ───────────────────────────
export const TRUST_BASELINE              = 50   // starting trust score for every user
export const TRUST_APPROVE_DELTA         = 2    // +2 on approval
export const TRUST_REJECT_DELTA          = 1    // -1 on rejection
export const COMMUNITY_VERIFIED_THRESHOLD = 5   // weighted score to reach community_verified

import { api, getToken } from './api'

const API_BASE = import.meta.env.VITE_API_URL || '/api'
import {
  getOfflineWords, getOfflineDecks, getOfflineSrsCards,
  updateSrsCardLocally, queueSrsCardUpdate,
  cacheWord, cacheSrsCard, cacheDeck,
  removeCachedWord, removeCachedDeck,
  removeCachedSrsCardsByWord, removeCachedSrsCardsByDeck, removeCachedWordsByDeck,
} from './syncService'

// ── Profiles ──────────────────────────────────────────────────────────────
export async function getProfile(userId) {
  return await api.get(`/profiles/${userId}`)
}

export async function updateProfile(userId, updates) {
  return await api.put(`/profiles/${userId}`, updates)
}

// ── Decks ──────────────────────────────────────────────────────────────────
export async function getUserDecks(userId) {
  if (!navigator.onLine) return getOfflineDecks(userId)
  return await api.get('/decks')
}

export async function createDeck(userId, { title, description = '', isPublic = false, sourceCommunityDeckId = null }) {
  const data = await api.post('/decks', {
    title, description,
    is_public: isPublic,
    source_community_deck_id: sourceCommunityDeckId || null,
  })
  cacheDeck(data)
  return data
}

export async function updateDeck(deckId, updates) {
  return await api.put(`/decks/${deckId}`, updates)
}

export async function deleteDeck(deckId) {
  await api.del(`/decks/${deckId}`)
  removeCachedDeck(deckId)
  removeCachedWordsByDeck(deckId)
  removeCachedSrsCardsByDeck(deckId)
}

export async function getPublicDecks() {
  const data = await api.get('/decks/public')
  return (data || []).map(d => ({
    ...d,
    uploaderName: d.uploader_name || 'Unknown',
    source: 'shared',
  }))
}

// ── Words ──────────────────────────────────────────────────────────────────
export async function getUserWords(userId) {
  if (!navigator.onLine) return getOfflineWords(userId)
  return await api.get('/words')
}

export async function getDeckWords(deckId) {
  return await api.get(`/words/deck/${deckId}`)
}

export async function wordExistsInDeck(userId, deckId, arabic) {
  const result = await api.get(`/words/exists?deckId=${deckId}&arabic=${encodeURIComponent(arabic)}`)
  return result.exists
}

export async function createWord(userId, { deckId, arabic, english, root = '', partOfSpeech = '', exampleSentence = '', notes = '', color = null, past = '', present = '', command = '', masdar = '', singular = '', dual = '', plural = '' }) {
  const data = await api.post('/words', {
    deck_id: deckId || null,
    arabic, english, root,
    part_of_speech: partOfSpeech,
    example_sentence: exampleSentence,
    notes, color,
    past: past || null,
    present: present || null,
    command: command || null,
    masdar: masdar || null,
    singular: singular || null,
    dual: dual || null,
    plural: plural || null,
  })
  cacheWord(data)
  return data
}

export async function updateWord(wordId, updates) {
  // Map camelCase to snake_case
  const mapped = {}
  if (updates.arabic           !== undefined) mapped.arabic           = updates.arabic
  if (updates.english          !== undefined) mapped.english          = updates.english
  if (updates.root             !== undefined) mapped.root             = updates.root
  if (updates.partOfSpeech     !== undefined) mapped.part_of_speech   = updates.partOfSpeech
  if (updates.exampleSentence  !== undefined) mapped.example_sentence = updates.exampleSentence
  if (updates.notes            !== undefined) mapped.notes            = updates.notes
  if (updates.color            !== undefined) mapped.color            = updates.color
  if (updates.deckId           !== undefined) mapped.deck_id          = updates.deckId
  if (updates.past     !== undefined) mapped.past     = updates.past     || null
  if (updates.present  !== undefined) mapped.present  = updates.present  || null
  if (updates.command  !== undefined) mapped.command  = updates.command  || null
  if (updates.masdar   !== undefined) mapped.masdar   = updates.masdar   || null
  if (updates.singular !== undefined) mapped.singular = updates.singular || null
  if (updates.dual     !== undefined) mapped.dual     = updates.dual     || null
  if (updates.plural   !== undefined) mapped.plural   = updates.plural   || null

  return await api.put(`/words/${wordId}`, mapped)
}

export async function deleteWord(wordId) {
  await api.del(`/words/${wordId}`)
  removeCachedWord(wordId)
  removeCachedSrsCardsByWord(wordId)
}

export async function deleteWords(wordIds) {
  if (!wordIds.length) return
  await api.post('/words/batch-delete', { ids: wordIds })
  wordIds.forEach(id => {
    removeCachedWord(id)
    removeCachedSrsCardsByWord(id)
  })
}

// ── SRS Cards ──────────────────────────────────────────────────────────────
export async function getUserSrsCards(userId) {
  if (!navigator.onLine) return getOfflineSrsCards(userId)
  return await api.get('/srs')
}

export async function getDueSrsCards(userId, { deckId } = {}) {
  if (!navigator.onLine) {
    const [cards, words] = await Promise.all([
      getOfflineSrsCards(userId),
      getOfflineWords(userId),
    ])
    const now = new Date().toISOString()
    const wordMap = Object.fromEntries(words.map(w => [w.id, w]))
    return cards
      .filter(c => {
        if (deckId && c.deck_id !== deckId) return false
        return c.next_review_date <= now
      })
      .map(c => ({
        ...normalizeSrsCard(c),
        word: wordMap[c.word_id] ? normalizeWord(wordMap[c.word_id]) : null,
      }))
      .filter(c => c.word)
  }
  const url = deckId ? `/srs/due?deckId=${deckId}` : '/srs/due'
  const data = await api.get(url)
  return (data || []).map(card => ({
    ...normalizeSrsCard(card),
    word: card.words ? normalizeWord(card.words) : null,
  })).filter(c => c.word)
}

export async function getAllSrsCardsWithWords(userId, { deckId } = {}) {
  if (!navigator.onLine) {
    const [cards, words] = await Promise.all([
      getOfflineSrsCards(userId),
      getOfflineWords(userId),
    ])
    const wordMap = Object.fromEntries(words.map(w => [w.id, w]))
    return cards
      .filter(c => !deckId || c.deck_id === deckId)
      .map(c => ({
        ...normalizeSrsCard(c),
        word: wordMap[c.word_id] ? normalizeWord(wordMap[c.word_id]) : null,
      }))
      .filter(c => c.word)
  }
  const url = deckId ? `/srs/all?deckId=${deckId}` : '/srs/all'
  const data = await api.get(url)
  return (data || []).map(card => ({
    ...normalizeSrsCard(card),
    word: card.words ? normalizeWord(card.words) : null,
  })).filter(c => c.word)
}

export async function createSrsCard(userId, { wordId, deckId }) {
  const data = await api.post('/srs', { word_id: wordId, deck_id: deckId || null })
  cacheSrsCard(data)
  return data
}

export async function updateSrsCard(cardId, { repetitions, easeFactor, interval, nextReviewDate, lastReviewed }) {
  const updates = { repetitions, easeFactor, interval, nextReviewDate, lastReviewed }
  updateSrsCardLocally(cardId, updates)

  if (!navigator.onLine) {
    await queueSrsCardUpdate(cardId, updates)
    return
  }

  await api.put(`/srs/${cardId}`, {
    repetitions,
    ease_factor: easeFactor,
    interval,
    next_review_date: nextReviewDate,
    last_reviewed: lastReviewed,
  })
}

export async function resetSrsCard(cardId) {
  await api.post(`/srs/reset/${cardId}`)
}

export async function resetDeckSrsCards(userId, deckId) {
  await api.post('/srs/reset-deck', { deckId })
}

export async function markWordsAsKnown(cardIds) {
  await api.post('/srs/mark-known', { cardIds })
}

export async function getDeckSrsCards(userId, deckId) {
  return await api.get(`/srs/deck/${deckId}`)
}

export async function getSrsCardForWord(userId, wordId) {
  return await api.get(`/srs/word/${wordId}`)
}

// ── Batch import (fast — single round-trip per table) ─────────────────────
export async function batchImportDeck(userId, deckData, words, communityDeckId = null) {
  const deck = await createDeck(userId, { ...deckData, sourceCommunityDeckId: communityDeckId })

  const validWords = words.filter(w => w.arabic)
  if (validWords.length === 0) return deck

  // Batch insert all words
  const wordInserts = validWords.map(w => ({
    arabic:           w.arabic,
    english:          w.english || '',
    root:             w.root || '',
    part_of_speech:   w.partOfSpeech || w.part_of_speech || '',
    example_sentence: w.exampleSentence || w.example_sentence || '',
    notes:            w.notes    || '',
    past:             w.past     || '',
    present:          w.present  || '',
    command:          w.command  || '',
    masdar:           w.masdar   || '',
    singular:         w.singular || '',
    dual:             w.dual     || '',
    plural:           w.plural   || '',
  }))

  const insertedWords = await api.post('/words/batch', { deck_id: deck.id, words: wordInserts })

  // Create pending sentence rows for any word that has an example_sentence
  const sentenceInserts = (insertedWords || [])
    .map((w, i) => ({ id: w.id, sentence: wordInserts[i]?.example_sentence }))
    .filter(x => x.sentence?.trim())
    .map(x => ({
      word_id:     x.id,
      arabic:      x.sentence.trim(),
      translation: '',
      source:      'ai_import',
      status:      'pending',
    }))
  if (sentenceInserts.length) {
    try {
      await api.post('/sentences/batch', { sentences: sentenceInserts })
    } catch (err) {
      console.error('[batchImportDeck] sentence insert failed:', err?.message)
    }
  }

  // Batch insert all srs_cards
  const cardInserts = (insertedWords || []).map(w => ({
    word_id: w.id,
    deck_id: deck.id,
  }))
  await api.post('/srs/batch', { cards: cardInserts })

  // Increment download count on the source community deck
  if (communityDeckId) {
    await api.post(`/community/decks/${communityDeckId}/download`)
  }

  return deck
}

// ── Dictionary ────────────────────────────────────────────────────────────
const _stripDiacritics = s => s.replace(/[\u064B-\u065F\u0610-\u061A\u0670]/g, '').trim()

export async function lookupWordInDictionary(arabic) {
  if (!arabic?.trim()) return null
  const target = _stripDiacritics(arabic.trim())
  if (!target) return null

  const tryLookup = async (q) => {
    const data = await api.get(`/dictionary/lookup?q=${encodeURIComponent(q)}`)
    if (!data?.length) return null
    return data.find(e => _stripDiacritics(e.arabic) === target) ||
           data.find(e => {
             const ds = _stripDiacritics(e.arabic)
             return target.startsWith(ds) && target.length - ds.length <= 2
           }) || null
  }

  const match = await tryLookup(target)
              || (target.length > 3 ? await tryLookup(target.slice(0, -1)) : null)
              || (target.length > 4 ? await tryLookup(target.slice(0, -2)) : null)

  return match ? { arabic: match.arabic, english: match.definition, root: match.root } : null
}

export async function lookupRootForArabic(arabic) {
  if (!arabic?.trim()) return null
  const data = await api.get(`/dictionary/search?q=${encodeURIComponent(arabic.trim())}&limit=10`)
  if (!data?.length) return null
  const target = _stripDiacritics(arabic.trim())
  const match = data.find(e => _stripDiacritics(e.arabic) === target)
  return match?.root || null
}

export async function getDictionaryAll(limit = 2000) {
  return await api.get(`/dictionary?limit=${limit}`)
}

export async function getDictionaryCount() {
  const result = await api.get('/dictionary/count')
  return result.count || 0
}

export async function getDictionarySourceCounts() {
  // Not used in Dictionary.jsx anymore (source filter chips removed)
  // But keep it available — just return empty for now
  return { quran: 0, bayna_yadayk: 0, msa: 0 }
}

export async function importDictionaryBatch(entries, source = 'msa') {
  // Normalize field names
  const mapped = entries.map(e => {
    const pos = (e.part_of_speech || e.pos || '').trim()
    let forms = Array.isArray(e.forms) ? e.forms : []
    if (forms.length === 0) {
      const t = pos.toLowerCase()
      if (t === 'verb') {
        if (e.past)    forms.push({ type: 'verb', arabic: e.past.trim(),    label: 'Past (ماضي)' })
        if (e.present) forms.push({ type: 'verb', arabic: e.present.trim(), label: 'Present (مضارع)' })
        if (e.command) forms.push({ type: 'verb', arabic: e.command.trim(), label: 'Command (أمر)' })
        if (e.masdar)  forms.push({ type: 'verb', arabic: e.masdar.trim(),  label: 'Masdar (مصدر)' })
      } else if (t === 'noun' || t === 'adjective') {
        if (e.singular) forms.push({ type: t, arabic: e.singular.trim(), label: 'Singular (مفرد)' })
        if (e.dual)     forms.push({ type: t, arabic: e.dual.trim(),     label: 'Dual (مثنى)' })
        if (e.plural)   forms.push({ type: t, arabic: e.plural.trim(),   label: 'Plural (جمع)' })
      }
    }
    return {
      arabic:           (e.arabic || '').trim(),
      definition:       (e.english || e.definition || '').trim(),
      root:             (e.root || '').trim(),
      pos,
      example_sentence: (e.example_sentence || '').trim(),
      forms,
    }
  }).filter(e => e.arabic && e.definition)

  if (mapped.length === 0) return { inserted: 0, tagged: 0 }

  // Fetch all existing entries
  const existing = await api.get('/dictionary?limit=5000')
  const existingMap = new Map(existing.map(e => [e.arabic.trim(), e]))
  const toInsert = []
  const toUpdate = []

  for (const entry of mapped) {
    const ex = existingMap.get(entry.arabic)
    if (ex) {
      const updates = {}
      const current = Array.isArray(ex.sources) ? ex.sources : []
      if (!current.includes(source)) updates.sources = [...current, source]
      const existingForms = Array.isArray(ex.forms) ? ex.forms : []
      if (existingForms.length === 0 && entry.forms.length > 0) updates.forms = entry.forms
      if (!ex.example_sentence && entry.example_sentence) updates.example_sentence = entry.example_sentence
      if (Object.keys(updates).length > 0) toUpdate.push({ id: ex.id, updates })
    } else {
      toInsert.push({ ...entry, sources: [source] })
    }
  }

  // Insert new entries via admin import endpoint
  let inserted = 0
  if (toInsert.length > 0) {
    const result = await api.post('/dictionary/import', { entries: toInsert, source })
    inserted = result.imported || 0
  }

  // Update existing entries
  let tagged = 0
  for (const { id, updates } of toUpdate) {
    await api.put(`/dictionary/${id}`, updates)
    tagged++
  }

  return { inserted, tagged }
}

export async function searchDictionary(query, limit = 1000, source = null) {
  if (!query.trim()) return []
  const data = await api.get(`/dictionary/search?q=${encodeURIComponent(query.trim())}&limit=${limit}`)
  const results = data || []
  if (!source) return results
  return results.filter(e => Array.isArray(e.sources) && e.sources.includes(source))
}

export async function getDictionaryBySource(source, limit = 200) {
  const all = await api.get(`/dictionary?limit=${limit}`)
  return (all || []).filter(e => Array.isArray(e.sources) && e.sources.includes(source))
}

export async function searchDictionaryByRoot(rootQuery, limit = 200, source = null) {
  if (!rootQuery.trim()) return []
  // Use the search endpoint which also searches roots
  const data = await api.get(`/dictionary/search?q=${encodeURIComponent(rootQuery.trim())}&limit=${limit}`)
  const results = data || []
  if (!source) return results
  return results.filter(e => Array.isArray(e.sources) && e.sources.includes(source))
}

export async function deleteDictionaryForm(entryId, formIndex) {
  await api.del(`/dictionary/${entryId}/form/${formIndex}`)
}

export async function deleteDictionaryWord(id) {
  const result = await api.del(`/dictionary/${id}`)
  if (!result.deleted) throw new Error('Delete failed')
}

// ── Community Decks ────────────────────────────────────────────────────────
export async function getCommunityDecks() {
  return await api.get('/community/decks')
}

export async function getCommunityCollections() {
  return await api.get('/community/collections')
}

export async function createCommunityCollection(title) {
  return await api.post('/community/collections', { title })
}

export async function updateCommunityCollection(id, { title }) {
  await api.put(`/community/collections/${id}`, { title })
}

export async function deleteCommunityCollection(id) {
  await api.del(`/community/collections/${id}`)
}

export async function batchUpdateCollectionOrders(items) {
  await api.post('/community/collections/reorder', { items })
}

export async function batchUpdateDeckOrders(items) {
  await api.post('/community/decks/reorder', { items })
}

export async function patchCommunityDeckWords(deckId, updatedWords) {
  await api.put(`/community/decks/${deckId}/words`, { words: updatedWords })
}

export async function patchCommunityDeckMeta(deckId, { title, description }) {
  await api.put(`/community/decks/${deckId}`, { title, description })
}

export async function uploadCommunityDeck(userId, username, deck, words) {
  const uniqueNoRoot = [...new Set(words.filter(w => !w.root).map(w => w.arabic))]
  const rootMap = new Map()
  if (uniqueNoRoot.length) {
    await Promise.all(uniqueNoRoot.map(async arabic => {
      const root = await lookupRootForArabic(arabic)
      if (root) rootMap.set(arabic, root)
    }))
  }
  const enrichedWords = rootMap.size > 0
    ? words.map(w => ({ ...w, root: w.root || rootMap.get(w.arabic) || '' }))
    : words

  const communityDeck = await api.post('/community/decks', {
    uploader_username: username,
    title:             deck.title,
    description:       deck.description || '',
    word_count:        enrichedWords.length,
    words_json:        enrichedWords,
    download_count:    deck.savedDownloadCount || 0,
  })

  await api.put(`/decks/${deck.id}`, {
    is_public: true,
    community_deck_id: communityDeck.id,
  })
}

export async function unuploadCommunityDeck(deck) {
  let communityDeckId = deck.communityDeckId
  let downloadCount = deck.savedDownloadCount || 0

  // If we know the community deck ID, fetch its current download count
  if (communityDeckId) {
    try {
      const counts = await api.get(`/community/decks/downloads?ids=${communityDeckId}`)
      downloadCount = counts[communityDeckId] || downloadCount
    } catch (_) {}
  }

  await api.put(`/decks/${deck.id}`, {
    is_public: false,
    saved_download_count: downloadCount,
    community_deck_id: null,
  })

  if (communityDeckId) {
    await api.del(`/community/decks/${communityDeckId}`)
  }
}

export async function deleteCommunityDeck(id) {
  await api.del(`/community/decks/${id}`)
}

export async function importAdminCommunityDeck(userId, { title, description, uploaderUsername, words }) {
  return await api.post('/community/decks/admin-import', {
    uploaded_by_user_id: userId,
    uploader_username: uploaderUsername || 'Kalimat Team',
    title,
    description: description || '',
    words,
  })
}

export async function getUserDeckWordCounts(userId) {
  return await api.get('/words/counts')
}

export async function getDownloadCounts(communityDeckIds) {
  if (!communityDeckIds.length) return {}
  return await api.get(`/community/decks/downloads?ids=${communityDeckIds.join(',')}`)
}

// ── Normalizer ────────────────────────────────────────────────────────────
export function normalizeWord(w) {
  return {
    id:              w.id,
    userId:          w.user_id,
    deckId:          w.deck_id,
    arabic:          w.arabic,
    english:         w.english,
    root:            w.root || '',
    partOfSpeech:    w.part_of_speech || '',
    exampleSentence: w.example_sentence || '',
    notes:           w.notes     || '',
    color:           w.color     || null,
    past:            w.past     || '',
    present:         w.present  || '',
    command:         w.command  || '',
    masdar:          w.masdar   || '',
    singular:        w.singular || '',
    dual:            w.dual     || '',
    plural:          w.plural   || '',
    createdAt:       w.created_at,
  }
}

export function normalizeDeck(d) {
  return {
    id:                   d.id,
    userId:               d.user_id,
    title:                d.title,
    description:          d.description || '',
    isPublic:             d.is_public,
    communityDeckId:      d.community_deck_id || null,
    savedDownloadCount:   d.saved_download_count || 0,
    sourceCommunityDeckId: d.source_community_deck_id || null,
    createdAt:            d.created_at,
    reviewFrequency:      d.review_frequency    || null,
    reviewIntervalDays:   d.review_interval_days || null,
    nextDeckReview:       d.next_deck_review     || null,
  }
}

export function normalizeSrsCard(c) {
  return {
    id:             c.id,
    userId:         c.user_id,
    wordId:         c.word_id,
    deckId:         c.deck_id,
    repetitions:    c.repetitions,
    easeFactor:     c.ease_factor,
    interval:       c.interval,
    nextReviewDate: c.next_review_date,
    lastReviewed:   c.last_reviewed,
  }
}

// ── Contributions ──────────────────────────────────────────────────────────

export async function getContributions({ status = 'pending', source = null, limit = 50, offset = 0 } = {}) {
  let url = `/contributions?status=${status}&limit=${limit}&offset=${offset}`
  if (source) url += `&source=${source}`
  return await api.get(url)
}

export async function getSentenceFlagContributions(limit = 100) {
  return await api.get(`/contributions/flagged?limit=${limit}`)
}

export async function getUserContributions(userId, status = null) {
  let url = '/contributions/user'
  if (status) url += `?status=${status}`
  return await api.get(url)
}

function stripDiacritics(text) {
  return (text || '').replace(/[\u064B-\u065F\u0610-\u061A]/g, '').trim()
}

export async function submitContribution(userId, username, contribution) {
  return await api.post('/contributions', {
    submitter_username: username,
    ...contribution,
  })
}

export async function voteContribution(userId, contributionId, vote) {
  const result = await api.post(`/contributions/${contributionId}/vote`, { vote })
  return result.score
}

export async function removeVote(userId, contributionId) {
  const result = await api.del(`/contributions/${contributionId}/vote`)
  return result.score
}

export async function getUserVotes(userId, contributionIds) {
  if (!contributionIds.length) return {}
  return await api.get(`/contributions/votes?ids=${contributionIds.join(',')}`)
}

export async function updateContribution(contributionId, updates) {
  return await api.put(`/contributions/${contributionId}`, updates)
}

export async function moderateContribution(contributionId, moderatorId, moderatorUsername, action, note = '') {
  return await api.post(`/contributions/${contributionId}/moderate`, { action, note })
}

export async function deleteContribution(contributionId) {
  return await api.del(`/contributions/${contributionId}`)
}

// ── Sentences ─────────────────────────────────────────────────────────────────

export async function getSentencesForWord(wordId) {
  return await api.get(`/sentences?wordId=${wordId}`)
}

export async function getUserSentences(userId) {
  return await api.get('/sentences/user')
}

export async function getAllSentencesAdmin() {
  return await api.get('/sentences/admin')
}

export async function createSentence(userId, { arabic, translation, wordId = null, source = 'user' }) {
  return await api.post('/sentences', {
    arabic: arabic.trim(),
    translation: (translation || '').trim(),
    word_id: wordId,
    source,
  })
}

export async function updateSentence(id, { arabic, translation }) {
  return await api.put(`/sentences/${id}`, {
    arabic: arabic.trim(),
    translation: (translation || '').trim(),
  })
}

export async function approveSentence(id) {
  await api.post(`/sentences/${id}/approve`)
}

export async function rejectSentence(id) {
  await api.post(`/sentences/${id}/reject`)
}

export async function propagateSentence(sentence, words) {
  const result = await api.post(`/sentences/${sentence.id}/propagate`, { words })
  return result
}

export async function flagSentenceUnknowns(unknownTokens, userId, username) {
  const flagged = []
  await Promise.all(
    unknownTokens
      .filter(t => t.length >= 2)
      .map(async token => {
        const inDict = await lookupWordInDictionary(token)
        if (!inDict) {
          try {
            const result = await submitContribution(userId, username, {
              type:       'new_word',
              arabic:     token,
              root:       '',
              vote_score: 0,
              status:     'pending',
              source:     'sentence_flag',
            })
            if (!result.isDuplicate) flagged.push(token)
          } catch (err) {
            console.error('[flagSentenceUnknowns] contribution insert failed:', err?.message)
          }
        }
      })
  )
  return flagged
}

export async function deleteSentence(id) {
  await api.del(`/sentences/${id}`)
}

// ── Study Log ─────────────────────────────────────────────────────────────────

export async function logStudySession(userId, count, sessionMs = 0) {
  if (!count || count <= 0) return
  const today = new Date().toISOString().slice(0, 10)
  try {
    await api.post('/study/log', { count, sessionMs, date: today })
  } catch (err) {
    console.error('Failed to log study session:', err)
  }
}

// ── App Session Tracking ───────────────────────────────────────────────────────

export async function startAppSession(userId) {
  try {
    const data = await api.post('/sessions/start')
    return data?.id ?? null
  } catch { return null }
}

export async function endAppSession(sessionId, durationMs) {
  if (!sessionId) return
  try {
    await api.post('/sessions/end', { sessionId, durationMs })
  } catch { /* fire and forget */ }
}

// ── Admin RPCs ────────────────────────────────────────────────────────────────

export async function getAdminUsersList() {
  return await api.get('/admin/users')
}

export async function getAdminAppSessions(limit = 100, offset = 0) {
  return await api.get(`/admin/sessions?limit=${limit}&offset=${offset}`)
}

export async function getAdminEngagementStats() {
  return await api.get('/admin/engagement')
}

export async function getAdminContentStats() {
  return await api.get('/admin/content')
}

export async function getStudyLog(userId) {
  return await api.get('/study/log')
}

// ── Quran export ──────────────────────────────────────────────────────────────
export async function batchAddWordsFromQuran(userId, deckId, quranWords) {
  // Fetch arabic texts already in this specific deck
  const deckWords = await api.get(`/words/deck/${deckId}`)
  const existingSet = new Set((deckWords || []).map(w => w.arabic))

  const seen = new Set()
  const toAdd = []
  for (const w of quranWords) {
    if (!w.arabic || seen.has(w.arabic) || existingSet.has(w.arabic)) continue
    seen.add(w.arabic)
    toAdd.push(w)
  }

  const alreadyOwned = quranWords.filter(w => w.arabic && existingSet.has(w.arabic)).length

  if (toAdd.length === 0) return { added: 0, alreadyOwned }

  // Bulk insert words
  const wordRows = toAdd.map(w => ({
    arabic: w.arabic,
    english: w.english || '',
    root: w.root || '',
    part_of_speech: w.grammar_tag || '',
    example_sentence: '',
  }))

  const insertedWords = await api.post('/words/batch', { deck_id: deckId, words: wordRows })

  // Bulk insert srs_cards
  const cardInserts = (insertedWords || []).map(w => ({
    word_id: w.id,
    deck_id: deckId,
  }))
  await api.post('/srs/batch', { cards: cardInserts })

  return { added: toAdd.length, alreadyOwned }
}

// ── Feedback ──────────────────────────────────────────────────────────────────

export async function submitFeedback(userId, email, type, message) {
  await api.post('/feedback', { email, type, message })
}

export async function getAdminFeedback() {
  return await api.get('/admin/feedback')
}

// ── Stories ────────────────────────────────────────────────────────────────────

export async function getCollections(category = null) {
  let url = '/collections'
  if (category) url += `?category=${category}`
  return await api.get(url)
}

export async function getStories(collectionSlug = null) {
  let url = '/stories'
  if (collectionSlug) url += `?collectionSlug=${collectionSlug}`
  return await api.get(url)
}

export async function getStory(id) {
  return await api.get(`/stories/${id}`)
}

export async function getUserStoryProgress(userId) {
  const data = await api.get('/stories/progress')
  const map = {}
  for (const row of (data || [])) map[row.story_id] = row
  return map
}

export async function upsertStoryProgress(userId, storyId, segmentsRead, completed) {
  await api.put('/stories/progress', { storyId, segmentsRead, completed })
}

// ── Notebook ──────────────────────────────────────────────────────────────

export async function getNotebookClasses() {
  return await api.get('/notebook/classes')
}

export async function createNotebookClass({ title }) {
  return await api.post('/notebook/classes', { title })
}

export async function updateNotebookClass(id, updates) {
  return await api.put(`/notebook/classes/${id}`, updates)
}

export async function deleteNotebookClass(id) {
  return await api.del(`/notebook/classes/${id}`)
}

export async function getNotebookLessons(classId) {
  return await api.get(`/notebook/classes/${classId}/lessons`)
}

export async function createNotebookLesson(classId, { title, date }) {
  return await api.post(`/notebook/classes/${classId}/lessons`, { title, date })
}

export async function updateNotebookLesson(id, updates) {
  return await api.put(`/notebook/lessons/${id}`, updates)
}

export async function deleteNotebookLesson(id) {
  return await api.del(`/notebook/lessons/${id}`)
}

export async function getNotebookStrokes(lessonId) {
  return await api.get(`/notebook/lessons/${lessonId}/strokes`)
}

export async function saveNotebookStrokes(lessonId, strokes) {
  return await api.put(`/notebook/lessons/${lessonId}/strokes`, { strokes })
}

export async function updateLessonTemplate(lessonId, template) {
  return api.put(`/notebook/lessons/${lessonId}`, { template })
}

export async function uploadNotebookImage(lessonId, file) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('lesson_id', lessonId)
  const token = getToken()
  const res = await fetch(`${API_BASE}/notebook/images`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  if (!res.ok) throw new Error('Upload failed')
  return res.json()
}

export async function getNotebookImages(lessonId) {
  return api.get(`/notebook/images/${lessonId}`)
}

export async function deleteNotebookImage(imageId) {
  return api.del(`/notebook/images/${imageId}`)
}

export async function analyzeNote(imageBase64, prompt, history = [], mode = 'full') {
  return api.post('/notebook/analyze', { image: imageBase64, prompt, history, mode })
}

