// v2.1.0
import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import ModalPortal from '../components/ModalPortal'
import {
  getCommunityDecks,
  getCommunityCollections,
  getUserDecks,
  getUserDeckWordCounts,
  batchImportDeck,
  deleteCommunityDeck,
  unuploadCommunityDeck,
  wordExistsInDeck,
  createWord,
  createSrsCard,
  normalizeDeck,
  lookupRootForArabic,
  patchCommunityDeckWords,
  patchCommunityDeckMeta,
  importAdminCommunityDeck,
} from '../lib/dataService'
import TeamTab from '../components/TeamTab'
import { X, Check, Search, Globe, User, BookOpen, Download, Eye, Info, Trash2, Upload, Plus, Pencil } from 'lucide-react'
import SpeakButton from '../components/SpeakButton'

// ── Preview modal ─────────────────────────────────────────────────────────────
function PreviewModal({ deck, words, uploaderName, onClose, onImport, importing, alreadyImported, currentUser, userDecks }) {
  const [targetDeckId, setTargetDeckId] = useState(userDecks[0]?.id ?? '')
  const [addedWords,   setAddedWords]   = useState(new Set()) // Set of word index
  const [addingIdx,    setAddingIdx]    = useState(null)      // index currently being added

  const handleAddWord = async (word, idx) => {
    if (!currentUser || !targetDeckId) return
    setAddingIdx(idx)
    try {
      const deckId = Number(targetDeckId)
      const exists = await wordExistsInDeck(currentUser.id, deckId, word.arabic)
      if (exists) {
        // Mark as already added rather than throwing an error
        setAddedWords(prev => new Set([...prev, idx]))
        return
      }
      const newWord = await createWord(currentUser.id, {
        deckId,
        arabic:       word.arabic,
        english:      word.english || word.definition || '',
        root:         word.root || '',
        partOfSpeech: word.partOfSpeech || word.part_of_speech || '',
        exampleSentence: '',
      })
      await createSrsCard(currentUser.id, { wordId: newWord.id, deckId })
      setAddedWords(prev => new Set([...prev, idx]))
    } catch (err) {
      alert('Failed to add word: ' + err.message)
    } finally {
      setAddingIdx(null)
    }
  }

  return (
    <ModalPortal>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{deck.title}</h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: 12 }}>
          By {uploaderName || 'Unknown'} · {words.length} words
          {deck.description && ` · ${deck.description}`}
        </p>

        {/* Deck picker for per-word adds */}
        {userDecks.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Add words to:</span>
            <select
              className="form-select"
              value={targetDeckId}
              onChange={e => setTargetDeckId(e.target.value)}
              style={{ flex: 1, minWidth: 160, fontSize: '0.85rem' }}
            >
              {userDecks.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </div>
        )}

        <div className="table-container" style={{ maxHeight: 380, overflowY: 'auto', marginBottom: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Arabic</th>
                <th>English</th>
                <th>Root</th>
                <th>POS</th>
                {userDecks.length > 0 && <th style={{ width: 60 }}></th>}
              </tr>
            </thead>
            <tbody>
              {words.map((w, i) => (
                <tr key={i}>
                  <td className="td-arabic">{w.arabic} <SpeakButton text={w.arabic} /></td>
                  <td>{w.english || w.definition || '—'}</td>
                  <td><span className="arabic" style={{ fontSize: '0.9rem' }}>{w.root || '—'}</span></td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{w.partOfSpeech || w.part_of_speech || '—'}</td>
                  {userDecks.length > 0 && (
                    <td>
                      {addedWords.has(i) ? (
                        <span style={{ color: 'var(--color-success)', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <Check size={12} /> Added
                        </span>
                      ) : (
                        <button
                          className="icon-btn"
                          title="Add to deck"
                          onClick={() => handleAddWord(w, i)}
                          disabled={addingIdx === i}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.75rem', padding: '3px 8px', borderRadius: 'var(--radius)' }}
                        >
                          {addingIdx === i
                            ? <span className="spinner" style={{ width: 10, height: 10 }} />
                            : <><Plus size={11} /> Add</>}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={onImport} disabled={importing}>
            {importing ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Importing…</> : 'Import All to Word Bank'}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

// ── Deck card ─────────────────────────────────────────────────────────────────
function DeckCard({ deck, imported, isOwn, isAdmin, onPreview, onImport, onUnshare, onDelete, onEdit }) {
  const wordCount = deck.word_count || (Array.isArray(deck.words_json) ? deck.words_json.length : '?')

  return (
    <div className="deck-card" style={{ position: 'relative' }}>
      {onEdit && (
        <button
          onClick={onEdit}
          title="Edit title / description"
          style={{
            position: 'absolute', top: 10, right: 10,
            background: 'none', border: 'none', cursor: 'pointer', padding: 4,
            color: 'var(--color-text-muted)', borderRadius: 'var(--radius)',
            display: 'inline-flex', alignItems: 'center',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--color-brand)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-muted)'}
        >
          <Pencil size={13} />
        </button>
      )}
      <div style={{ flex: 1 }}>
        <div className="deck-card-title">{deck.title}</div>
        {deck.description && <div className="deck-card-desc">{deck.description}</div>}
      </div>
      <div className="deck-card-meta">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <User size={13} /> {deck.uploader_username || 'Unknown'}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <BookOpen size={13} /> {wordCount} words
        </span>
        {(deck.download_count || 0) > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Download size={13} /> {deck.download_count} downloads
          </span>
        )}
      </div>
      <div className="deck-card-actions">
        <button className="btn btn-secondary btn-sm" onClick={onPreview}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Eye size={13} /> Preview
        </button>

        {/* Import — always available for non-owners */}
        {!isOwn && (
          <button className="btn btn-primary btn-sm" onClick={onImport}>
            Import
          </button>
        )}

        {/* Un-share — only for deck owner */}
        {isOwn && onUnshare && (
          <button className="btn btn-primary btn-sm" onClick={onUnshare}>
            Un-share
          </button>
        )}

        {/* Delete — admin or owner */}
        {(isAdmin || (isOwn && imported)) && onDelete && (
          <button className="btn btn-outline-danger btn-sm" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CommunityDecks({ forceSection = null }) {
  const { currentUser, isGuest, importGuestDeck, guestData } = useAuth()
  const [searchParams] = useSearchParams()
  const activeTab = forceSection || searchParams.get('section') || 'team'
  const [search,         setSearch]         = useState('')
  const [preview,        setPreview]        = useState(null)
  const [importing,      setImporting]      = useState(false)
  const [importSuccess,  setImportSuccess]  = useState(null)
  const [communityDecks, setCommunityDecks] = useState([])
  const [userDecks,      setUserDecks]      = useState([])   // current user's decks table rows
  const [loading,        setLoading]        = useState(true)
  const [confirmDelete,  setConfirmDelete]  = useState(null) // community deck to delete
  const [confirmUnshare, setConfirmUnshare] = useState(null) // community deck to un-share
  const [importedSet,    setImportedSet]    = useState(new Set())
  const [backfilling,    setBackfilling]    = useState(false)
  const [backfillDone,   setBackfillDone]   = useState(null) // result message
  const [adminImporting, setAdminImporting] = useState(false)
  const [adminImportMsg, setAdminImportMsg] = useState(null) // { type: 'success'|'error', text }
  const adminImportRef = useRef(null)
  const [collections,   setCollections]   = useState([])
  const [editDeck,      setEditDeck]      = useState(null)  // deck being edited
  const [editTitle,     setEditTitle]     = useState('')
  const [editDesc,      setEditDesc]      = useState('')
  const [editSaving,    setEditSaving]    = useState(false)
  const [editClearing,  setEditClearing]  = useState(false)
  const [editImporting, setEditImporting] = useState(false)
  const [editMsg,       setEditMsg]       = useState(null)  // { type, text }
  const editImportRef = useRef(null)

  const isAdmin = currentUser?.email === 'dawoudhussein07@gmail.com'

  // ── Load data ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser && !isGuest) return
    const load = async () => {
      try {
        const [communityData, collectionsData] = await Promise.all([
          getCommunityDecks(),
          getCommunityCollections(),
        ])
        setCollections(collectionsData)

        // Deduplicate by title — prefer Kalimat Team rows over user-uploaded rows,
        // then newest created_at, so admin-imported rows always win over old personal uploads
        const isTeamRow = d => d.uploader_username === 'Kalimat Team' || d.uploaded_by_user_id === null
        const sorted = [...(communityData || [])].sort((a, b) => {
          const aTeam = isTeamRow(a) ? 0 : 1
          const bTeam = isTeamRow(b) ? 0 : 1
          if (aTeam !== bTeam) return aTeam - bTeam
          return new Date(b.created_at) - new Date(a.created_at)
        })
        const seen = new Set()
        const unique = sorted.filter(d => {
          if (seen.has(d.title)) return false
          seen.add(d.title)
          return true
        })
        setCommunityDecks(unique)

        if (isGuest) {
          // Mark guest-imported decks as already imported
          const alreadyImported = new Set(
            unique
              .filter(cd => guestData.decks.some(gd => gd.title === cd.title))
              .map(cd => cd.id)
          )
          setImportedSet(alreadyImported)
        } else {
          const [userDecksRaw, wordCounts] = await Promise.all([
            getUserDecks(currentUser.id),
            getUserDeckWordCounts(currentUser.id),
          ])
          const normalized = userDecksRaw.map(normalizeDeck)
          setUserDecks(normalized)

          const alreadyImported = new Set()
          for (const ud of normalized) {
            if (!ud.sourceCommunityDeckId) continue
            const source = unique.find(cd => cd.id === ud.sourceCommunityDeckId)
            if (!source) continue
            if ((wordCounts[ud.id] || 0) === (source.word_count || 0)) {
              alreadyImported.add(ud.sourceCommunityDeckId)
            }
          }
          setImportedSet(alreadyImported)
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [currentUser, isGuest])

  // ── Split decks into 3 groups ───────────────────────────────────────────────
  const { teamDecks, browseDecks, myDecks } = useMemo(() => {
    const team   = []
    const browse = []
    const mine   = []
    for (const d of communityDecks) {
      const isTeam = d.uploader_username === 'Kalimat Team' || d.uploaded_by_user_id === null
      const isMine = d.uploaded_by_user_id === currentUser?.id
      if (isTeam)       team.push(d)
      else if (isMine)  mine.push(d)
      else              browse.push(d)
    }
    const sort = arr => [...arr].sort((a, b) =>
      (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' })
    )
    return { teamDecks: sort(team), browseDecks: sort(browse), myDecks: sort(mine) }
  }, [communityDecks, currentUser])

  // ── Filter active tab by search ─────────────────────────────────────────────
  const activeList = activeTab === 'team' ? teamDecks : activeTab === 'browse' ? browseDecks : myDecks
  const filtered = useMemo(() => {
    if (!search.trim()) return activeList
    const q = search.trim().toLowerCase()
    return activeList.filter(d =>
      d.title?.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q)
    )
  }, [activeList, search])

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handlePreview = (deck) => {
    setPreview({
      deck,
      words: Array.isArray(deck.words_json) ? deck.words_json : [],
      uploaderName: deck.uploader_username || 'Unknown',
    })
  }

  const handleImport = async () => {
    if (!preview) return
    setImporting(true)
    try {
      if (isGuest) {
        // Guest: store deck in memory (no Supabase)
        importGuestDeck(
          { title: preview.deck.title, description: preview.deck.description || '' },
          preview.words
        )
      } else {
        await batchImportDeck(
          currentUser.id,
          { title: preview.deck.title, description: preview.deck.description || '' },
          preview.words,
          preview.deck.id
        )
      }
      const importedDeckId = preview.deck.id
      const isFirstImport = !importedSet.has(importedDeckId)
      setImportSuccess(preview.deck.title)
      setPreview(null)
      if (isFirstImport) {
        setCommunityDecks(prev => prev.map(d =>
          d.id === importedDeckId ? { ...d, download_count: (d.download_count || 0) + 1 } : d
        ))
        setImportedSet(prev => new Set([...prev, importedDeckId]))
      }
    } catch (err) {
      alert('Import failed: ' + err.message)
    } finally {
      setImporting(false)
    }
  }

  const handleDelete = async (deck) => {
    try {
      await deleteCommunityDeck(deck.id)
      setCommunityDecks(prev => prev.filter(d => d.id !== deck.id))
      setConfirmDelete(null)
    } catch (err) {
      alert('Delete failed: ' + err.message)
    }
  }

  // Admin only: backfill roots in words_json for all community decks
  const handleBackfillRoots = async () => {
    setBackfilling(true)
    setBackfillDone(null)
    let totalWords = 0
    try {
      for (const deck of communityDecks) {
        const words = Array.isArray(deck.words_json) ? deck.words_json : []
        const missingArabics = [...new Set(words.filter(w => !w.root).map(w => w.arabic))]
        if (!missingArabics.length) continue

        // Parallel lookups for this deck's missing roots
        const rootMap = new Map()
        await Promise.all(missingArabics.map(async arabic => {
          const root = await lookupRootForArabic(arabic)
          if (root) rootMap.set(arabic, root)
        }))
        if (!rootMap.size) continue

        const updatedWords = words.map(w => ({
          ...w,
          root: w.root || rootMap.get(w.arabic) || '',
        }))
        await patchCommunityDeckWords(deck.id, updatedWords)
        totalWords += rootMap.size

        // Update local state so preview reflects the change immediately
        setCommunityDecks(prev => prev.map(d =>
          d.id === deck.id ? { ...d, words_json: updatedWords } : d
        ))
      }
      setBackfillDone(`Done — filled roots for ${totalWords} word${totalWords !== 1 ? 's' : ''} across all community decks.`)
      setTimeout(() => setBackfillDone(null), 6000)
    } catch (err) {
      setBackfillDone(`Error: ${err.message}`)
    } finally {
      setBackfilling(false)
    }
  }

  const handleAdminImport = async (file) => {
    if (!file || !currentUser) return
    setAdminImporting(true)
    setAdminImportMsg(null)
    try {
      const text = await file.text()
      let parsed
      try { parsed = JSON.parse(text) } catch {
        setAdminImportMsg({ type: 'error', text: 'Invalid JSON file.' })
        return
      }

      // Normalise snake_case field names from dictionary-export format
      const normaliseWord = (w) => ({
        arabic:          w.arabic,
        english:         w.english,
        root:            w.root,
        partOfSpeech:    w.partOfSpeech    ?? w.part_of_speech   ?? '',
        exampleSentence: w.exampleSentence ?? w.example_sentence ?? '',
      })

      let title, description, uploader_username, words
      if (Array.isArray(parsed)) {
        // Raw word array — derive title from filename
        title             = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ')
        description       = ''
        uploader_username = 'Kalimat Team'
        words             = parsed.map(normaliseWord)
      } else {
        ;({ title, description, uploader_username } = parsed)
        words = Array.isArray(parsed.words) ? parsed.words.map(normaliseWord) : []
      }

      if (!title || words.length === 0) {
        setAdminImportMsg({ type: 'error', text: 'JSON must have "title" and a non-empty "words" array.' })
        return
      }
      const newDeck = await importAdminCommunityDeck(currentUser.id, {
        title,
        description,
        uploaderUsername: uploader_username || 'Kalimat Team',
        words,
      })
      setCommunityDecks(prev => [newDeck, ...prev])
      setAdminImportMsg({ type: 'success', text: `Imported "${title}" with ${words.length} words.` })
      setTimeout(() => setAdminImportMsg(null), 6000)
    } catch (err) {
      setAdminImportMsg({ type: 'error', text: 'Import failed: ' + err.message })
    } finally {
      setAdminImporting(false)
      if (adminImportRef.current) adminImportRef.current.value = ''
    }
  }

  const handleEditSave = async () => {
    if (!editDeck || !editTitle.trim()) return
    setEditSaving(true)
    try {
      await patchCommunityDeckMeta(editDeck.id, {
        title: editTitle.trim(),
        description: editDesc.trim(),
      })
      setCommunityDecks(prev => prev.map(d =>
        d.id === editDeck.id ? { ...d, title: editTitle.trim(), description: editDesc.trim() } : d
      ))
      setEditDeck(null)
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally {
      setEditSaving(false)
    }
  }

  const handleEditClearWords = async () => {
    if (!editDeck) return
    if (!window.confirm(`Delete all words in "${editDeck.title}"? This cannot be undone.`)) return
    setEditClearing(true)
    setEditMsg(null)
    try {
      await patchCommunityDeckWords(editDeck.id, [])
      setCommunityDecks(prev => prev.map(d =>
        d.id === editDeck.id ? { ...d, words_json: [], word_count: 0 } : d
      ))
      setEditMsg({ type: 'success', text: 'All words deleted.' })
    } catch (err) {
      setEditMsg({ type: 'error', text: 'Failed: ' + err.message })
    } finally {
      setEditClearing(false)
    }
  }

  const handleEditImportWords = async (file) => {
    if (!file || !editDeck) return
    setEditImporting(true)
    setEditMsg(null)
    try {
      const text = await file.text()
      let parsed
      try { parsed = JSON.parse(text) } catch { throw new Error('Invalid JSON file.') }

      const normaliseWord = (w) => ({
        arabic:          w.arabic,
        english:         w.english,
        root:            w.root || '',
        partOfSpeech:    w.partOfSpeech    ?? w.part_of_speech   ?? '',
        exampleSentence: w.exampleSentence ?? w.example_sentence ?? '',
      })

      const words = Array.isArray(parsed)
        ? parsed.map(normaliseWord)
        : Array.isArray(parsed.words) ? parsed.words.map(normaliseWord) : null

      if (!words || words.length === 0) throw new Error('No words found in file.')

      await patchCommunityDeckWords(editDeck.id, words)
      setCommunityDecks(prev => prev.map(d =>
        d.id === editDeck.id ? { ...d, words_json: words, word_count: words.length } : d
      ))
      setEditMsg({ type: 'success', text: `Imported ${words.length} words.` })
    } catch (err) {
      setEditMsg({ type: 'error', text: 'Failed: ' + err.message })
    } finally {
      setEditImporting(false)
      if (editImportRef.current) editImportRef.current.value = ''
    }
  }

  const handleUnshare = async (communityDeck) => {
    // Find the user's own deck that links back to this community deck
    const userDeck = userDecks.find(ud => ud.communityDeckId === communityDeck.id)
    try {
      if (userDeck) {
        await unuploadCommunityDeck(userDeck)
      } else {
        // Fallback: just delete the community row (deck may have been created before tracking)
        await deleteCommunityDeck(communityDeck.id)
      }
      setCommunityDecks(prev => prev.filter(d => d.id !== communityDeck.id))
      setConfirmUnshare(null)
    } catch (err) {
      alert('Un-share failed: ' + err.message)
    }
  }

  // ── Empty state copy per tab ─────────────────────────────────────────────────
  const emptyMessages = {
    team:   { title: 'No official decks yet', body: 'Kalimat Team decks will appear here.' },
    browse: { title: communityDecks.length === 0 ? 'No community decks yet' : 'No decks match your search',
              body:  'Be the first to share a deck! Go to Word Bank → Decks and click Share.' },
    mine:   { title: 'You haven\'t shared any decks yet',
              body:  'Go to Word Bank → Decks and click Share on any deck to publish it here.' },
  }

  // Clear search when section changes
  useEffect(() => { setSearch('') }, [activeTab])

  const PAGE_TITLES = {
    team:   { title: 'Kalimat Team',  subtitle: 'Official decks curated by the Kalimat team' },
    browse: { title: 'Browse All',    subtitle: 'Decks shared by the community' },
    mine:   { title: 'My Uploads',    subtitle: 'Decks you have shared with the community' },
  }
  const { title: pageTitle, subtitle: pageSubtitle } = PAGE_TITLES[activeTab] || PAGE_TITLES.team

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">{pageTitle}</h1>
        <p className="page-subtitle">{pageSubtitle}</p>
      </div>

      {importSuccess && (
        <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Check size={15} style={{ flexShrink: 0 }} /> "{importSuccess}" has been imported to your word bank!
          <button
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center' }}
            onClick={() => setImportSuccess(null)}
          ><X size={15} /></button>
        </div>
      )}


      {/* Search + admin import */}
      <div className="search-filter-bar" style={{ marginBottom: adminImportMsg ? 8 : 20, display: 'flex', gap: 8, alignItems: 'center' }}>
        <div className="search-input-wrapper" style={{ flex: 1 }}>
          <span className="search-icon"><Search size={16} /></span>
          <input
            type="text"
            className="form-input"
            placeholder="Search decks…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>
        {isAdmin && (
          <>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => adminImportRef.current?.click()}
              disabled={adminImporting}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}
              title="Import community deck from JSON (admin)"
            >
              {adminImporting
                ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Importing…</>
                : <><Upload size={13} /> Import Deck</>}
            </button>
            <input
              type="file"
              accept=".json"
              ref={adminImportRef}
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files[0]; if (f) handleAdminImport(f) }}
            />
          </>
        )}
      </div>

      {adminImportMsg && (
        <div style={{
          marginBottom: 16, padding: '8px 14px', borderRadius: 'var(--radius-md)',
          fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8,
          ...(adminImportMsg.type === 'error'
            ? { background: 'var(--color-danger-bg)', color: 'var(--color-danger)', border: '1px solid var(--color-danger)' }
            : { background: 'var(--color-success-bg)', color: 'var(--color-success)', border: '1px solid var(--color-success)' })
        }}>
          {adminImportMsg.type === 'error' ? <X size={14} /> : <Check size={14} />}
          {adminImportMsg.text}
        </div>
      )}

      {/* Deck list */}
      {loading ? (
        <div className="loading-screen" style={{ minHeight: 'auto', padding: 60 }}>
          <div className="spinner" /><span>Loading decks…</span>
        </div>
      ) : activeTab === 'team' ? (
        /* Team tab — folder view with drag-and-drop */
        <TeamTab
          key={teamDecks.length} /* re-mount if decks list changes (import/delete) */
          teamDecks={teamDecks}
          initialCollections={collections}
          isAdmin={isAdmin}
          onPreview={handlePreview}
          onImport={handlePreview}
          onEditDeck={isAdmin ? (deck) => { setEditDeck(deck); setEditTitle(deck.title); setEditDesc(deck.description || '') } : null}
        />
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Globe size={40} strokeWidth={1.25} /></div>
          <div className="empty-state-title">{emptyMessages[activeTab].title}</div>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 16, maxWidth: 400, margin: '0 auto 16px' }}>
            {emptyMessages[activeTab].body}
          </p>
        </div>
      ) : (
        <div className="deck-grid">
          {filtered.map(deck => {
            const isTeam  = deck.uploader_username === 'Kalimat Team' || deck.uploaded_by_user_id === null
            const isOwn   = !isTeam && deck.uploaded_by_user_id === currentUser?.id
            return (
              <DeckCard
                key={deck.id}
                deck={deck}
                imported={importedSet.has(deck.id)}
                isOwn={isOwn}
                isAdmin={isAdmin}
                onPreview={() => handlePreview(deck)}
                onImport={() => handlePreview(deck)}
                onUnshare={isOwn ? () => setConfirmUnshare(deck) : null}
                onDelete={(isAdmin || isOwn) ? () => setConfirmDelete(deck) : null}
              />
            )
          })}
        </div>
      )}

      {/* "How to share" banner — only on Browse and Team tabs */}
      {activeTab !== 'mine' && (
        <div style={{
          marginTop: 32,
          background: 'var(--color-primary-muted)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}>
          <div style={{ color: 'var(--color-primary)', flexShrink: 0 }}><Info size={28} strokeWidth={1.5} /></div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Share your own decks</div>
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.88rem' }}>
              Go to <strong>Word Bank → Decks</strong> and click <strong>Share</strong> on any deck to make it available to the community.
            </div>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <PreviewModal
          deck={preview.deck}
          words={preview.words}
          uploaderName={preview.uploaderName}
          onClose={() => setPreview(null)}
          onImport={handleImport}
          importing={importing}
          alreadyImported={importedSet.has(preview.deck.id)}
          currentUser={currentUser}
          userDecks={userDecks}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <ModalPortal>
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Delete "{confirmDelete.title}"?</h2>
              <button className="modal-close" onClick={() => setConfirmDelete(null)}><X size={16} /></button>
            </div>
            <p style={{ marginBottom: 20, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              This will permanently remove the deck from Community Decks. Anyone who has already imported it keeps their copy.
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDelete(confirmDelete)}>Delete</button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Edit deck meta */}
      {editDeck && (
        <ModalPortal>
        <div className="modal-overlay" onClick={() => setEditDeck(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Edit Deck</h2>
              <button className="modal-close" onClick={() => { setEditDeck(null); setEditMsg(null) }}><X size={16} /></button>
            </div>

            {/* Title / description */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
              <div>
                <label className="form-label">Title</label>
                <input
                  className="form-input"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  placeholder="Deck title"
                  autoFocus
                />
              </div>
              <div>
                <label className="form-label">Description</label>
                <input
                  className="form-input"
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  placeholder="Optional description"
                />
              </div>
            </div>

            {/* Word actions */}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16, marginBottom: 16 }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Words ({editDeck.word_count ?? (Array.isArray(editDeck.words_json) ? editDeck.words_json.length : '?')})
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-outline-danger btn-sm"
                  onClick={handleEditClearWords}
                  disabled={editClearing || editImporting}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  {editClearing ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Clearing…</> : 'Clear All Words'}
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => editImportRef.current?.click()}
                  disabled={editClearing || editImporting}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  {editImporting ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Importing…</> : <><Upload size={13} /> Import JSON</>}
                </button>
                <input
                  type="file"
                  accept=".json"
                  ref={editImportRef}
                  style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files[0]; if (f) handleEditImportWords(f) }}
                />
              </div>
            </div>

            {/* Feedback */}
            {editMsg && (
              <div style={{
                marginBottom: 14, padding: '7px 12px', borderRadius: 'var(--radius)',
                fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 7,
                ...(editMsg.type === 'error'
                  ? { background: 'var(--color-danger-bg)', color: 'var(--color-danger)', border: '1px solid var(--color-danger)' }
                  : { background: 'var(--color-success-bg)', color: 'var(--color-success)', border: '1px solid var(--color-success)' })
              }}>
                {editMsg.type === 'error' ? <X size={13} /> : <Check size={13} />}
                {editMsg.text}
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => { setEditDeck(null); setEditMsg(null) }}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleEditSave}
                disabled={editSaving || !editTitle.trim()}
              >
                {editSaving ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Saving…</> : 'Save'}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Un-share confirm */}
      {confirmUnshare && (
        <ModalPortal>
        <div className="modal-overlay" onClick={() => setConfirmUnshare(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Un-share "{confirmUnshare.title}"?</h2>
              <button className="modal-close" onClick={() => setConfirmUnshare(null)}><X size={16} /></button>
            </div>
            <p style={{ marginBottom: 20, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              This will remove the deck from Community Decks. Anyone who has already imported it keeps their copy. Your download count will be saved and restored if you re-share it later.
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmUnshare(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => handleUnshare(confirmUnshare)}>Un-share</button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  )
}
