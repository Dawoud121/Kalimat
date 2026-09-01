// v2.9.0
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../auth/AuthContext'
import {
  getNotebookClasses, createNotebookClass, updateNotebookClass, deleteNotebookClass,
  getNotebookLessons, createNotebookLesson, updateNotebookLesson, deleteNotebookLesson,
  getNotebookStrokes, updateLessonTemplate,
  recognizeHandwriting, lookupWordInDictionary, createWord,
  getUserDecks,
} from '../lib/dataService'
import NotebookCanvas from '../components/notebook/NotebookCanvas'
import ModalPortal from '../components/ModalPortal'
import {
  ChevronDown, ChevronRight, Plus, Pencil, Trash2, BookOpen, FileText, MoreVertical, X,
  PanelLeftOpen, PanelLeftClose, ScanSearch, Loader2, BookPlus, Check, ExternalLink,
} from 'lucide-react'

const TEMPLATES = [
  { value: 'lined', label: 'Lined' },
  { value: 'blank', label: 'Blank' },
  { value: 'grid', label: 'Grid' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'arabic', label: 'Arabic' },
]

export default function Notebook() {
  const { currentUser } = useAuth()

  const [classes, setClasses] = useState([])
  const [expandedClassIds, setExpandedClassIds] = useState(new Set())
  const [lessonsMap, setLessonsMap] = useState({})
  const [selectedLessonId, setSelectedLessonId] = useState(null)
  const [selectedLesson, setSelectedLesson] = useState(null)
  const [strokes, setStrokes] = useState(null)
  const [loading, setLoading] = useState(true)

  // Sidebar collapse
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Word detection
  const [detecting, setDetecting] = useState(false)
  const [detectedWords, setDetectedWords] = useState(null) // array of { arabic, dictEntry, added }
  const [showWordPanel, setShowWordPanel] = useState(false)
  const [userDecks, setUserDecks] = useState(null)
  const [selectedDeckId, setSelectedDeckId] = useState(null)
  const [addingWord, setAddingWord] = useState(null) // index being added

  // CRUD modals
  const [showNewClass, setShowNewClass] = useState(false)
  const [newClassTitle, setNewClassTitle] = useState('')
  const [showNewLesson, setShowNewLesson] = useState(null)
  const [newLessonTitle, setNewLessonTitle] = useState('')
  const [newLessonDate, setNewLessonDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [editingClass, setEditingClass] = useState(null)
  const [editClassTitle, setEditClassTitle] = useState('')
  const [editingLesson, setEditingLesson] = useState(null)
  const [editLessonTitle, setEditLessonTitle] = useState('')
  const [editLessonDate, setEditLessonDate] = useState('')
  const [menuOpen, setMenuOpen] = useState(null)

  const canvasRef = useRef(null)

  // Load classes on mount
  useEffect(() => {
    if (!currentUser) return
    getNotebookClasses()
      .then(data => { setClasses(data); setLoading(false) })
      .catch(err => { console.error(err); setLoading(false) })
  }, [currentUser])

  // Restore last used lesson after classes load
  useEffect(() => {
    if (loading || classes.length === 0) return
    try {
      const saved = JSON.parse(localStorage.getItem('kalimat_last_lesson'))
      if (!saved?.lessonId || !saved?.classId) return
      // Check that the class exists
      if (!classes.some(c => c.id === saved.classId)) return
      // Expand the class and load its lessons, then select the saved lesson
      setExpandedClassIds(prev => new Set([...prev, saved.classId]))
      getNotebookLessons(saved.classId).then(lessons => {
        setLessonsMap(prev => ({ ...prev, [saved.classId]: lessons }))
        const lesson = lessons.find(l => l.id === saved.lessonId)
        if (lesson) selectLesson(lesson)
      }).catch(err => console.error('Failed to restore last lesson:', err))
    } catch { /* ignore invalid localStorage */ }
  }, [loading, classes])

  // Load lessons when a class is expanded
  const toggleClass = useCallback(async (classId) => {
    setExpandedClassIds(prev => {
      const next = new Set(prev)
      if (next.has(classId)) { next.delete(classId) } else { next.add(classId) }
      return next
    })
    if (!lessonsMap[classId]) {
      try {
        const lessons = await getNotebookLessons(classId)
        setLessonsMap(prev => ({ ...prev, [classId]: lessons }))
      } catch (err) { console.error(err) }
    }
  }, [lessonsMap])

  // Load strokes when a lesson is selected
  const selectLesson = useCallback(async (lesson) => {
    if (canvasRef.current?.isDirty()) {
      await canvasRef.current.save()
    }
    setSelectedLessonId(lesson.id)
    setSelectedLesson(lesson)
    setStrokes(null)
    setSidebarOpen(false) // auto-close sidebar on selection
    // Remember last used lesson
    localStorage.setItem('kalimat_last_lesson', JSON.stringify({ lessonId: lesson.id, classId: lesson.class_id }))
    try {
      const data = await getNotebookStrokes(lesson.id)
      setStrokes(data)
    } catch (err) { console.error(err); setStrokes([]) }
  }, [])

  // ── Template change ──
  const handleTemplateChange = async (template) => {
    if (!selectedLesson) return
    try {
      await updateLessonTemplate(selectedLesson.id, template)
      const updated = { ...selectedLesson, template }
      setSelectedLesson(updated)
      setLessonsMap(prev => {
        const classId = selectedLesson.class_id
        return {
          ...prev,
          [classId]: (prev[classId] || []).map(l => l.id === updated.id ? updated : l),
        }
      })
    } catch (err) { console.error(err) }
  }

  // ── Class CRUD ──
  const handleCreateClass = async () => {
    if (!newClassTitle.trim()) return
    try {
      const created = await createNotebookClass({ title: newClassTitle.trim() })
      setClasses(prev => [...prev, created])
      setNewClassTitle('')
      setShowNewClass(false)
    } catch (err) { console.error(err) }
  }

  const handleUpdateClass = async () => {
    if (!editClassTitle.trim() || !editingClass) return
    try {
      const updated = await updateNotebookClass(editingClass.id, { title: editClassTitle.trim() })
      setClasses(prev => prev.map(c => c.id === updated.id ? updated : c))
      setEditingClass(null)
    } catch (err) { console.error(err) }
  }

  const handleDeleteClass = async (classId) => {
    if (!confirm('Delete this class and all its lessons?')) return
    try {
      await deleteNotebookClass(classId)
      setClasses(prev => prev.filter(c => c.id !== classId))
      setLessonsMap(prev => { const next = { ...prev }; delete next[classId]; return next })
      if (selectedLesson && lessonsMap[classId]?.some(l => l.id === selectedLessonId)) {
        setSelectedLessonId(null)
        setSelectedLesson(null)
        setStrokes(null)
      }
    } catch (err) { console.error(err) }
    setMenuOpen(null)
  }

  // ── Lesson CRUD ──
  const handleCreateLesson = async (classId) => {
    if (!newLessonTitle.trim()) return
    try {
      const created = await createNotebookLesson(classId, {
        title: newLessonTitle.trim(),
        date: newLessonDate,
      })
      setLessonsMap(prev => ({
        ...prev,
        [classId]: [...(prev[classId] || []), created],
      }))
      setNewLessonTitle('')
      setNewLessonDate(new Date().toISOString().slice(0, 10))
      setShowNewLesson(null)
      selectLesson(created)
    } catch (err) { console.error(err) }
  }

  const handleUpdateLesson = async () => {
    if (!editLessonTitle.trim() || !editingLesson) return
    try {
      const updated = await updateNotebookLesson(editingLesson.id, {
        title: editLessonTitle.trim(),
        date: editLessonDate,
      })
      setLessonsMap(prev => {
        const classId = editingLesson.class_id
        return {
          ...prev,
          [classId]: (prev[classId] || []).map(l => l.id === updated.id ? updated : l),
        }
      })
      if (selectedLessonId === updated.id) setSelectedLesson(updated)
      setEditingLesson(null)
    } catch (err) { console.error(err) }
  }

  const handleDeleteLesson = async (lesson) => {
    if (!confirm('Delete this lesson and all its notes?')) return
    try {
      await deleteNotebookLesson(lesson.id)
      setLessonsMap(prev => ({
        ...prev,
        [lesson.class_id]: (prev[lesson.class_id] || []).filter(l => l.id !== lesson.id),
      }))
      if (selectedLessonId === lesson.id) {
        setSelectedLessonId(null)
        setSelectedLesson(null)
        setStrokes(null)
      }
    } catch (err) { console.error(err) }
    setMenuOpen(null)
  }

  // ── Detect Words ──
  const handleDetectWords = async () => {
    if (!canvasRef.current) return
    setDetecting(true)
    setDetectedWords(null)
    try {
      const base64 = canvasRef.current.getCanvasImage()
      const res = await recognizeHandwriting(base64)
      if (res.error) { alert(res.error); setDetecting(false); return }
      const rawText = res.text || ''
      // Split into unique Arabic words (remove diacritics for matching, keep original)
      const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+/g
      const rawWords = rawText.match(arabicRegex) || []
      // Deduplicate
      const seen = new Set()
      const unique = []
      for (const w of rawWords) {
        const key = w.replace(/[\u064B-\u065F\u0670]/g, '') // strip tashkeel for dedup
        if (!seen.has(key)) { seen.add(key); unique.push(w) }
      }
      // Look up each word in dictionary
      const results = await Promise.all(unique.map(async (arabic) => {
        try {
          const dictEntry = await lookupWordInDictionary(arabic)
          return { arabic, dictEntry, added: false }
        } catch {
          return { arabic, dictEntry: null, added: false }
        }
      }))
      setDetectedWords(results)
      setShowWordPanel(true)
      // Load user decks for the "add to deck" dropdown
      if (!userDecks) {
        try {
          const decks = await getUserDecks(currentUser.id)
          setUserDecks(decks)
          if (decks.length > 0) setSelectedDeckId(decks[0].id)
        } catch { /* ignore */ }
      }
    } catch (err) {
      alert('Word detection failed: ' + (err.message || 'Unknown error'))
    }
    setDetecting(false)
  }

  const handleAddWordToDeck = async (wordIndex) => {
    if (!selectedDeckId || !detectedWords) return
    const word = detectedWords[wordIndex]
    if (word.added) return
    setAddingWord(wordIndex)
    try {
      await createWord(currentUser.id, {
        deckId: selectedDeckId,
        arabic: word.arabic,
        english: word.dictEntry?.definition || '',
        root: word.dictEntry?.root || '',
        partOfSpeech: word.dictEntry?.pos || '',
      })
      setDetectedWords(prev => prev.map((w, i) => i === wordIndex ? { ...w, added: true } : w))
    } catch (err) {
      alert('Failed to add word: ' + (err.message || 'Unknown error'))
    }
    setAddingWord(null)
  }

  const handleAddAllWords = async () => {
    if (!selectedDeckId || !detectedWords) return
    const unadded = detectedWords.filter(w => !w.added)
    if (unadded.length === 0) return
    setAddingWord(-1) // indicate bulk adding
    try {
      for (let i = 0; i < detectedWords.length; i++) {
        if (detectedWords[i].added) continue
        await createWord(currentUser.id, {
          deckId: selectedDeckId,
          arabic: detectedWords[i].arabic,
          english: detectedWords[i].dictEntry?.definition || '',
          root: detectedWords[i].dictEntry?.root || '',
          partOfSpeech: detectedWords[i].dictEntry?.pos || '',
        })
        setDetectedWords(prev => prev.map((w, j) => j === i ? { ...w, added: true } : w))
      }
    } catch (err) {
      alert('Failed to add some words: ' + (err.message || 'Unknown error'))
    }
    setAddingWord(null)
  }

  // Close menus on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = () => setMenuOpen(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [menuOpen])

  if (loading) {
    return (
      <div className="notebook-page">
        <div className="loading-screen" style={{ minHeight: 'auto', padding: 60 }}>
          <div className="spinner" />
          <span>Loading notebook…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="notebook-page">
      {/* Left panel: class/lesson tree (overlay when open) */}
      {sidebarOpen && (
        <>
          <div className="notebook-panel-backdrop" onClick={() => setSidebarOpen(false)} />
          <div className="notebook-panel notebook-panel-open">
            <div className="notebook-panel-header">
              <h3>Notebook</h3>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowNewClass(true)} title="New Class">
                  <Plus size={16} />
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setSidebarOpen(false)} title="Close panel">
                  <PanelLeftClose size={16} />
                </button>
              </div>
            </div>

            {/* New class form */}
            {showNewClass && (
              <div className="notebook-inline-form">
                <input
                  autoFocus
                  className="form-input"
                  placeholder="Class name"
                  value={newClassTitle}
                  onChange={e => setNewClassTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateClass(); if (e.key === 'Escape') setShowNewClass(false) }}
                />
                <div className="notebook-inline-form-actions">
                  <button className="btn btn-primary btn-sm" onClick={handleCreateClass}>Add</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowNewClass(false)}><X size={14} /></button>
                </div>
              </div>
            )}

            {classes.length === 0 && !showNewClass && (
              <div className="notebook-empty-panel">
                <BookOpen size={32} strokeWidth={1} />
                <p>No classes yet</p>
                <button className="btn btn-primary btn-sm" onClick={() => setShowNewClass(true)}>Create a class</button>
              </div>
            )}

            <div className="notebook-class-list">
              {classes.map(cls => (
                <div key={cls.id} className="notebook-class">
                  <div className="notebook-class-header" onClick={() => toggleClass(cls.id)}>
                    {expandedClassIds.has(cls.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="notebook-class-title">{cls.title}</span>
                    <div className="notebook-menu-anchor" onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === `class-${cls.id}` ? null : `class-${cls.id}`) }}>
                      <MoreVertical size={14} />
                      {menuOpen === `class-${cls.id}` && (
                        <div className="notebook-menu" onClick={e => e.stopPropagation()}>
                          <button onClick={() => { setEditingClass(cls); setEditClassTitle(cls.title); setMenuOpen(null) }}>
                            <Pencil size={13} /> Rename
                          </button>
                          <button onClick={() => { setShowNewLesson(cls.id); setMenuOpen(null) }}>
                            <Plus size={13} /> New Lesson
                          </button>
                          <button className="danger" onClick={() => handleDeleteClass(cls.id)}>
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {editingClass?.id === cls.id && (
                    <div className="notebook-inline-form">
                      <input
                        autoFocus
                        className="form-input"
                        value={editClassTitle}
                        onChange={e => setEditClassTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleUpdateClass(); if (e.key === 'Escape') setEditingClass(null) }}
                      />
                      <div className="notebook-inline-form-actions">
                        <button className="btn btn-primary btn-sm" onClick={handleUpdateClass}>Save</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditingClass(null)}><X size={14} /></button>
                      </div>
                    </div>
                  )}

                  {expandedClassIds.has(cls.id) && (
                    <div className="notebook-lesson-list">
                      {showNewLesson === cls.id && (
                        <div className="notebook-inline-form" style={{ marginLeft: 20 }}>
                          <input
                            autoFocus
                            className="form-input"
                            placeholder="Lesson title"
                            value={newLessonTitle}
                            onChange={e => setNewLessonTitle(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleCreateLesson(cls.id); if (e.key === 'Escape') setShowNewLesson(null) }}
                          />
                          <input type="date" className="form-input" value={newLessonDate} onChange={e => setNewLessonDate(e.target.value)} />
                          <div className="notebook-inline-form-actions">
                            <button className="btn btn-primary btn-sm" onClick={() => handleCreateLesson(cls.id)}>Add</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowNewLesson(null)}><X size={14} /></button>
                          </div>
                        </div>
                      )}

                      {(lessonsMap[cls.id] || []).map(lesson => (
                        <div
                          key={lesson.id}
                          className={`notebook-lesson-item${selectedLessonId === lesson.id ? ' active' : ''}`}
                          onClick={() => selectLesson(lesson)}
                        >
                          <FileText size={13} />
                          <div className="notebook-lesson-info">
                            <span className="notebook-lesson-title">{lesson.title}</span>
                            <span className="notebook-lesson-date">{lesson.date}</span>
                          </div>

                          {editingLesson?.id === lesson.id && (
                            <div className="notebook-inline-form" onClick={e => e.stopPropagation()} style={{ position: 'absolute', left: 0, right: 0, top: 0, zIndex: 5, background: 'var(--color-surface)' }}>
                              <input autoFocus className="form-input" value={editLessonTitle} onChange={e => setEditLessonTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleUpdateLesson(); if (e.key === 'Escape') setEditingLesson(null) }} />
                              <input type="date" className="form-input" value={editLessonDate} onChange={e => setEditLessonDate(e.target.value)} />
                              <div className="notebook-inline-form-actions">
                                <button className="btn btn-primary btn-sm" onClick={handleUpdateLesson}>Save</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setEditingLesson(null)}><X size={14} /></button>
                              </div>
                            </div>
                          )}

                          <div className="notebook-menu-anchor" onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === `lesson-${lesson.id}` ? null : `lesson-${lesson.id}`) }}>
                            <MoreVertical size={13} />
                            {menuOpen === `lesson-${lesson.id}` && (
                              <div className="notebook-menu" onClick={e => e.stopPropagation()}>
                                <button onClick={() => { setEditingLesson(lesson); setEditLessonTitle(lesson.title); setEditLessonDate(lesson.date); setMenuOpen(null) }}>
                                  <Pencil size={13} /> Rename
                                </button>
                                <button className="danger" onClick={() => handleDeleteLesson(lesson)}>
                                  <Trash2 size={13} /> Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}

                      {(lessonsMap[cls.id] || []).length === 0 && showNewLesson !== cls.id && (
                        <button className="notebook-add-lesson-btn" onClick={() => setShowNewLesson(cls.id)}>
                          <Plus size={13} /> Add lesson
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Right panel: canvas or empty state */}
      <div className="notebook-main">
        {selectedLesson && strokes !== null ? (
          <>
            <div className="notebook-lesson-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                {!sidebarOpen && (
                  <button
                    className="notebook-tool-btn"
                    onClick={() => setSidebarOpen(true)}
                    title="Open notebook panel"
                    style={{ marginRight: 4 }}
                  >
                    <PanelLeftOpen size={18} />
                  </button>
                )}
                <h2 style={{ margin: 0 }}>{selectedLesson.title}</h2>
                <span className="notebook-lesson-header-date">{selectedLesson.date}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Detect Words */}
                <button
                  className="notebook-tool-btn"
                  onClick={handleDetectWords}
                  disabled={detecting}
                  title="Detect Arabic words in this note"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', padding: '4px 8px' }}
                >
                  {detecting ? <Loader2 size={14} className="spin" /> : <ScanSearch size={14} />}
                  <span>Detect Words</span>
                </button>
                {/* Template selector */}
                <select
                  className="form-input"
                  style={{ fontSize: '0.8rem', padding: '4px 8px', width: 'auto' }}
                  value={selectedLesson.template || 'lined'}
                  onChange={e => handleTemplateChange(e.target.value)}
                >
                  {TEMPLATES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <NotebookCanvas
              ref={canvasRef}
              lessonId={selectedLessonId}
              initialStrokes={strokes}
              template={selectedLesson.template || 'lined'}
            />
          </>
        ) : selectedLesson && strokes === null ? (
          <div className="notebook-empty-state">
            <div className="spinner" />
            <span>Loading notes…</span>
          </div>
        ) : (
          <div className="notebook-empty-state">
            {!sidebarOpen && (
              <button
                className="notebook-tool-btn"
                onClick={() => setSidebarOpen(true)}
                title="Open notebook panel"
                style={{ position: 'absolute', top: 12, left: 12 }}
              >
                <PanelLeftOpen size={18} />
              </button>
            )}
            <BookOpen size={48} strokeWidth={1} style={{ color: 'var(--color-text-muted)' }} />
            <p>Select a lesson to start writing</p>
            {classes.length === 0 && (
              <button className="btn btn-primary btn-sm" onClick={() => { setSidebarOpen(true); setShowNewClass(true) }}>
                Create your first class
              </button>
            )}
          </div>
        )}
      </div>

      {/* Word detection results panel */}
      {showWordPanel && detectedWords && (
        <ModalPortal>
          <div className="modal-overlay" onClick={() => setShowWordPanel(false)}>
            <div className="modal" style={{ maxWidth: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ScanSearch size={18} /> Detected Words
                </h2>
                <button className="modal-close" onClick={() => setShowWordPanel(false)}><X size={16} /></button>
              </div>

              {detectedWords.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  No Arabic words detected. Try writing more clearly or with darker strokes.
                </div>
              ) : (
                <>
                  {/* Deck selector + Add All */}
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }}>Add to:</label>
                    <select
                      className="form-input"
                      style={{ flex: 1, fontSize: '0.8rem', padding: '4px 8px' }}
                      value={selectedDeckId || ''}
                      onChange={e => setSelectedDeckId(Number(e.target.value))}
                    >
                      {(userDecks || []).map(d => (
                        <option key={d.id} value={d.id}>{d.title}</option>
                      ))}
                    </select>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleAddAllWords}
                      disabled={addingWord !== null || detectedWords.every(w => w.added)}
                      style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      {addingWord === -1 ? <Loader2 size={13} className="spin" /> : <BookPlus size={13} />}
                      Add All
                    </button>
                  </div>

                  {/* Word list */}
                  <div style={{ overflow: 'auto', flex: 1 }}>
                    {detectedWords.map((word, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '10px 16px',
                          borderBottom: '1px solid var(--color-border)',
                          opacity: word.added ? 0.6 : 1,
                        }}
                      >
                        {/* Arabic word */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: '"Noto Naskh Arabic", serif', fontSize: '1.2rem', direction: 'rtl' }}>
                            {word.arabic}
                          </div>
                          {word.dictEntry ? (
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                              {word.dictEntry.root && <span style={{ color: 'var(--color-brand)', marginRight: 6 }}>{word.dictEntry.root}</span>}
                              {word.dictEntry.pos && <span style={{ marginRight: 6, fontStyle: 'italic' }}>{word.dictEntry.pos}</span>}
                              {word.dictEntry.definition && (
                                <span>{word.dictEntry.definition.length > 60 ? word.dictEntry.definition.slice(0, 60) + '…' : word.dictEntry.definition}</span>
                              )}
                            </div>
                          ) : (
                            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', fontStyle: 'italic', marginTop: 2 }}>
                              Not in dictionary
                            </div>
                          )}
                        </div>

                        {/* Add button */}
                        {word.added ? (
                          <span style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
                            <Check size={14} /> Added
                          </span>
                        ) : (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleAddWordToDeck(i)}
                            disabled={addingWord !== null || !selectedDeckId}
                            title="Add to deck"
                          >
                            {addingWord === i ? <Loader2 size={14} className="spin" /> : <BookPlus size={14} />}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div style={{ padding: '10px 16px', fontSize: '0.8rem', color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)' }}>
                    {detectedWords.length} word{detectedWords.length !== 1 ? 's' : ''} detected
                    {detectedWords.filter(w => w.dictEntry).length > 0 && (
                      <> · {detectedWords.filter(w => w.dictEntry).length} found in dictionary</>
                    )}
                    {detectedWords.filter(w => w.added).length > 0 && (
                      <> · {detectedWords.filter(w => w.added).length} added</>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </ModalPortal>
      )}

    </div>
  )
}
