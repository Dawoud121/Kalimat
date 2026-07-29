import React, { useState, useRef, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  MeasuringStrategy,
} from '@dnd-kit/core'
import { snapCenterToCursor } from '@dnd-kit/modifiers'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GripVertical, FolderOpen, Folder, Plus, Pencil, Trash2,
  ChevronDown, ChevronRight, Eye, Check,
} from 'lucide-react'
import {
  createCommunityCollection,
  updateCommunityCollection,
  deleteCommunityCollection,
  batchUpdateCollectionOrders,
  batchUpdateDeckOrders,
} from '../lib/dataService'

// ── Sortable deck row (compact, used inside folders and uncollected) ───────────
function SortableDeckRow({ deck, isAdmin, onPreview, onImport, onEdit }) {
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: `deck-${deck.id}`, disabled: !isAdmin })

  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div ref={setNodeRef} style={style} className={`team-deck-row${isDragging ? ' is-dragging' : ''}`}>
      {isAdmin && (
        <span ref={setActivatorNodeRef} {...listeners} {...attributes} className="drag-handle">
          <GripVertical size={14} />
        </span>
      )}
      <span className="team-deck-title">{deck.title}</span>
      <span className="team-deck-wordcount">
        {deck.word_count ?? (Array.isArray(deck.words_json) ? deck.words_json.length : '?')} words
      </span>
      <div className="team-deck-actions">
        <button className="btn btn-secondary btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          onClick={onPreview}
        >
          <Eye size={12} /> Preview
        </button>
        <button className="btn btn-primary btn-sm" onClick={onImport}>Import</button>
        {isAdmin && onEdit && (
          <button className="icon-btn" title="Edit deck" onClick={onEdit} style={{ marginLeft: 2 }}>
            <Pencil size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

// Ghost shown in DragOverlay while dragging a deck
function DeckRowGhost({ deck }) {
  return (
    <div className="team-deck-row drag-overlay">
      <span className="drag-handle"><GripVertical size={14} /></span>
      <span className="team-deck-title">{deck.title}</span>
      <span className="team-deck-wordcount">
        {deck.word_count ?? (Array.isArray(deck.words_json) ? deck.words_json.length : '?')} words
      </span>
    </div>
  )
}

// ── Sortable collection (folder) ──────────────────────────────────────────────
function SortableCollection({
  collection, deckIds, decks, isAdmin,
  expanded, onToggle, onPreview, onImport,
  onStartRename, onDelete, onEditDeck,
}) {
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: `col-${collection.id}`, disabled: !isAdmin })

  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div ref={setNodeRef} style={style} className={`team-collection${isDragging ? ' is-dragging' : ''}`}>
      {/* Header row */}
      <div className="team-collection-header" onClick={onToggle}>
        {isAdmin && (
          <span
            ref={setActivatorNodeRef} {...listeners} {...attributes}
            className="drag-handle"
            onClick={e => e.stopPropagation()}
          >
            <GripVertical size={14} />
          </span>
        )}
        <span className="team-collection-icon">
          {expanded ? <FolderOpen size={15} /> : <Folder size={15} />}
        </span>
        <span className="team-collection-title">{collection.title}</span>
        <span className="team-collection-count">{decks.length}</span>
        <span className="team-collection-chevron">
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
        {isAdmin && (
          <div className="team-collection-admin" onClick={e => e.stopPropagation()}>
            <button className="icon-btn" title="Rename" onClick={onStartRename}>
              <Pencil size={13} />
            </button>
            <button className="icon-btn icon-btn-danger" title="Delete folder" onClick={onDelete}>
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Deck list inside */}
      {expanded && (
        <div className="team-collection-body">
          <SortableContext items={deckIds} strategy={verticalListSortingStrategy}>
            {decks.length === 0 ? (
              <div className="team-collection-empty">Drag decks here</div>
            ) : (
              decks.map(d => (
                <SortableDeckRow
                  key={d.id}
                  deck={d}
                  isAdmin={isAdmin}
                  onPreview={() => onPreview(d)}
                  onImport={() => onImport(d)}
                  onEdit={onEditDeck ? () => onEditDeck(d) : null}
                />
              ))
            )}
          </SortableContext>
        </div>
      )}
    </div>
  )
}

// Ghost shown in DragOverlay while dragging a folder
function CollectionGhost({ collection }) {
  return (
    <div className="team-collection drag-overlay">
      <div className="team-collection-header">
        <span className="drag-handle"><GripVertical size={14} /></span>
        <span className="team-collection-icon"><Folder size={15} /></span>
        <span className="team-collection-title">{collection.title}</span>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function TeamTab({
  teamDecks,
  initialCollections,
  isAdmin,
  onPreview,
  onImport,
  onEditDeck,
}) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [collections, setCollections] = useState(
    [...initialCollections].sort((a, b) => a.order_index - b.order_index)
  )

  // deckMap: key = 'uncollected' | 'col-{id}', value = sorted deck array
  const [deckMap, setDeckMap] = useState(() => buildDeckMap(teamDecks, initialCollections))

  // Keep a ref so drag handlers always see latest deckMap
  const deckMapRef = useRef(deckMap)
  const setDeckMapSync = useCallback((updater) => {
    setDeckMap(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      deckMapRef.current = next
      return next
    })
  }, [])

  const [expanded,   setExpanded]   = useState(() => new Set())
  const [activeId,   setActiveId]   = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [renameVal,  setRenameVal]  = useState('')
  const [showNew,    setShowNew]    = useState(false)
  const [newTitle,   setNewTitle]   = useState('')
  const [creating,   setCreating]   = useState(false)
  const renameInputRef = useRef(null)
  const newInputRef    = useRef(null)

  // ── DnD sensors ───────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // ── Helpers ───────────────────────────────────────────────────────────────
  const findContainer = useCallback((id, map = deckMapRef.current) => {
    // id is a container key itself
    if (id in map) return id
    // id looks like a collection drag id
    if (id.startsWith('col-')) return id
    // search for deck id in map values
    for (const [key, decks] of Object.entries(map)) {
      if (decks.some(d => `deck-${d.id}` === id)) return key
    }
    return null
  }, [])

  const persistDeckMap = useCallback(async (map = deckMapRef.current) => {
    const updates = []
    Object.entries(map).forEach(([key, decks]) => {
      const collectionId = key === 'uncollected' ? null : parseInt(key.replace('col-', ''))
      decks.forEach((d, i) => updates.push({ id: d.id, order_index: i, collection_id: collectionId }))
    })
    await batchUpdateDeckOrders(updates).catch(console.error)
  }, [])

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const handleDragStart = ({ active }) => setActiveId(active.id)

  const handleDragOver = ({ active, over }) => {
    if (!over || active.id === over.id) return
    if (active.id.startsWith('col-')) return // folder reorder — handled in dragEnd

    const from = findContainer(active.id)
    const to   = findContainer(over.id)
    if (!from || !to || from === to) return

    setDeckMapSync(prev => {
      const fromDecks = [...(prev[from] || [])]
      const toDecks   = [...(prev[to]   || [])]
      const moving    = fromDecks.find(d => `deck-${d.id}` === active.id)
      if (!moving) return prev

      const newFrom = fromDecks.filter(d => `deck-${d.id}` !== active.id)
      // Insert at the position of over.id within toDecks (or at end)
      const overIdx = toDecks.findIndex(d => `deck-${d.id}` === over.id)
      const newTo   = overIdx >= 0
        ? [...toDecks.slice(0, overIdx), moving, ...toDecks.slice(overIdx)]
        : [...toDecks, moving]

      // Auto-expand the target folder
      if (to !== 'uncollected') {
        const colId = parseInt(to.replace('col-', ''))
        setExpanded(prev => new Set([...prev, colId]))
      }

      return { ...prev, [from]: newFrom, [to]: newTo }
    })
  }

  const handleDragEnd = async ({ active, over }) => {
    setActiveId(null)
    if (!over || active.id === over.id) return

    if (active.id.startsWith('col-')) {
      // Reorder folders
      const colIds = collections.map(c => `col-${c.id}`)
      const oldIdx = colIds.indexOf(active.id)
      const newIdx = colIds.indexOf(over.id)
      if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return
      const reordered = arrayMove(collections, oldIdx, newIdx)
      setCollections(reordered)
      const updates = reordered.map((c, i) => ({ id: c.id, order_index: i }))
      await batchUpdateCollectionOrders(updates).catch(console.error)
      return
    }

    // Reorder deck within same container (cross-container already handled in onDragOver)
    const map = deckMapRef.current
    const container = findContainer(active.id, map)
    if (!container) { await persistDeckMap(); return }

    const items  = map[container] || []
    const oldIdx = items.findIndex(d => `deck-${d.id}` === active.id)
    const newIdx = items.findIndex(d => `deck-${d.id}` === over.id)

    if (oldIdx >= 0 && newIdx >= 0 && oldIdx !== newIdx) {
      const reordered = arrayMove(items, oldIdx, newIdx)
      const newMap = { ...map, [container]: reordered }
      setDeckMapSync(newMap)
      await persistDeckMap(newMap)
    } else {
      await persistDeckMap(map)
    }
  }

  // ── Active item for DragOverlay ───────────────────────────────────────────
  const allDecks  = Object.values(deckMap).flat()
  const activeCol = activeId?.startsWith('col-')
    ? collections.find(c => `col-${c.id}` === activeId)
    : null
  const activeDeck = activeId?.startsWith('deck-')
    ? allDecks.find(d => `deck-${d.id}` === activeId)
    : null

  // ── Folder create ─────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      const col = await createCommunityCollection(newTitle.trim())
      setCollections(prev => [...prev, col])
      setDeckMapSync(prev => ({ ...prev, [`col-${col.id}`]: [] }))
      setExpanded(prev => new Set([...prev, col.id]))
      setNewTitle('')
      setShowNew(false)
    } finally {
      setCreating(false)
    }
  }

  // ── Folder rename ─────────────────────────────────────────────────────────
  const startRename = (col) => {
    setRenamingId(col.id)
    setRenameVal(col.title)
    setTimeout(() => renameInputRef.current?.focus(), 0)
  }

  const commitRename = async (col) => {
    if (renameVal.trim() && renameVal.trim() !== col.title) {
      await updateCommunityCollection(col.id, { title: renameVal.trim() }).catch(console.error)
      setCollections(prev => prev.map(c => c.id === col.id ? { ...c, title: renameVal.trim() } : c))
    }
    setRenamingId(null)
  }

  // ── Folder delete ─────────────────────────────────────────────────────────
  const handleDelete = async (col) => {
    if (!window.confirm(`Delete folder "${col.title}"?\n\nDecks inside will become uncollected.`)) return
    const moved = deckMap[`col-${col.id}`] || []
    await deleteCommunityCollection(col.id).catch(console.error)
    setCollections(prev => prev.filter(c => c.id !== col.id))
    setDeckMapSync(prev => {
      const next = { ...prev }
      delete next[`col-${col.id}`]
      next.uncollected = [...(prev.uncollected || []), ...moved]
      return next
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const colIds   = collections.map(c => `col-${c.id}`)
  const uncollected = deckMap.uncollected || []

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      {/* Admin toolbar */}
      {isAdmin && (
        <div className="team-toolbar">
          {showNew ? (
            <div className="team-new-folder">
              <input
                ref={newInputRef}
                autoFocus
                className="form-input"
                placeholder="Folder name"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter')  handleCreate()
                  if (e.key === 'Escape') { setShowNew(false); setNewTitle('') }
                }}
                style={{ width: 220 }}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={handleCreate}
                disabled={creating || !newTitle.trim()}
              >
                {creating ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Create'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowNew(false); setNewTitle('') }}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowNew(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <Plus size={13} /> New Folder
            </button>
          )}
        </div>
      )}

      {/* Collections */}
      <SortableContext items={colIds} strategy={verticalListSortingStrategy}>
        {collections.map(col => {
          const containerKey = `col-${col.id}`
          const decks = deckMap[containerKey] || []
          const deckIds = decks.map(d => `deck-${d.id}`)

          // Inline rename mode
          if (renamingId === col.id) {
            return (
              <div key={col.id} className="team-collection">
                <div className="team-collection-header" style={{ cursor: 'default' }}>
                  <span className="team-collection-icon" style={{ color: 'var(--color-brand)' }}>
                    <Folder size={15} />
                  </span>
                  <input
                    ref={renameInputRef}
                    className="form-input"
                    value={renameVal}
                    onChange={e => setRenameVal(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter')  commitRename(col)
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    style={{ flex: 1, maxWidth: 260, height: 30, padding: '2px 8px' }}
                  />
                  <button className="btn btn-primary btn-sm" onClick={() => commitRename(col)}>Save</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setRenamingId(null)}>Cancel</button>
                </div>
              </div>
            )
          }

          return (
            <SortableCollection
              key={col.id}
              collection={col}
              deckIds={deckIds}
              decks={decks}
              isAdmin={isAdmin}
              expanded={expanded.has(col.id)}
              onToggle={() => setExpanded(prev => {
                const next = new Set(prev)
                next.has(col.id) ? next.delete(col.id) : next.add(col.id)
                return next
              })}
              onPreview={onPreview}
              onImport={onImport}
              onStartRename={() => startRename(col)}
              onDelete={() => handleDelete(col)}
              onEditDeck={isAdmin ? onEditDeck : null}
            />
          )
        })}
      </SortableContext>

      {/* Uncollected decks */}
      {uncollected.length > 0 && (
        <div className="team-uncollected" id="uncollected">
          {collections.length > 0 && (
            <div className="team-uncollected-label">
              Uncollected
              <span className="team-collection-count">{uncollected.length}</span>
            </div>
          )}
          <SortableContext
            items={uncollected.map(d => `deck-${d.id}`)}
            strategy={verticalListSortingStrategy}
          >
            {uncollected.map(d => (
              <SortableDeckRow
                key={d.id}
                deck={d}
                isAdmin={isAdmin}
                onPreview={() => onPreview(d)}
                onImport={() => onImport(d)}
                onEdit={isAdmin && onEditDeck ? () => onEditDeck(d) : null}
              />
            ))}
          </SortableContext>
        </div>
      )}

      {/* Empty state when no folders and no decks */}
      {collections.length === 0 && uncollected.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-title">No team decks yet</div>
        </div>
      )}

      {/* Drag overlay */}
      <DragOverlay modifiers={[snapCenterToCursor]} dropAnimation={{ duration: 180, easing: 'ease' }}>
        {activeCol  && <CollectionGhost collection={activeCol} />}
        {activeDeck && <DeckRowGhost    deck={activeDeck} />}
      </DragOverlay>
    </DndContext>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function buildDeckMap(decks, collections) {
  const map = { uncollected: [] }
  const knownColIds = new Set(collections.map(c => c.id))
  collections.forEach(c => { map[`col-${c.id}`] = [] })
  decks.forEach(d => {
    // If collection_id points to an unknown/deleted collection, fall back to uncollected
    const key = (d.collection_id && knownColIds.has(d.collection_id))
      ? `col-${d.collection_id}`
      : 'uncollected'
    map[key].push(d)
  })
  Object.keys(map).forEach(k => map[k].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)))
  return map
}
