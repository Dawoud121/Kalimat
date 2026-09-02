// v2.9.1
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../auth/AuthContext'
import {
  getNotebookClasses, createNotebookClass, updateNotebookClass, deleteNotebookClass,
  getNotebookLessons, createNotebookLesson, updateNotebookLesson, deleteNotebookLesson,
  getNotebookStrokes, updateLessonTemplate, analyzeNote, createWord, getUserDecks,
  submitContribution,
} from '../lib/dataService'
import NotebookCanvas from '../components/notebook/NotebookCanvas'
import {
  ChevronDown, ChevronRight, Plus, Pencil, Trash2, BookOpen, FileText, MoreVertical, X,
  PanelLeftOpen, PanelLeftClose, Sparkles, Send, PlusCircle, Check, RefreshCw, MessageCircleQuestion,
} from 'lucide-react'

// Simple markdown to HTML (bold, italic, lists, line breaks)
function renderMarkdown(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') // escape HTML
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n/g, '<br>')
}

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

  // AI Analysis panel
  const [analyzeOpen, setAnalyzeOpen] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeResult, setAnalyzeResult] = useState(null)
  const [analyzeHistory, setAnalyzeHistory] = useState([]) // conversation history for follow-ups
  const [analyzePrompt, setAnalyzePrompt] = useState('')
  const [addedWords, setAddedWords] = useState(new Set()) // track which words have been added
  const [userDecks, setUserDecks] = useState([])
  const [selectedDeckId, setSelectedDeckId] = useState(null)
  const analyzeChatRef = useRef(null)

  const canvasRef = useRef(null)

  // Restore cached analysis when lesson changes
  useEffect(() => {
    if (!selectedLessonId) return
    try {
      const cached = localStorage.getItem(`kalimat_analysis_${selectedLessonId}`)
      if (cached) {
        const parsed = JSON.parse(cached)
        setAnalyzeResult(parsed.result)
        setAnalyzeHistory(parsed.history || [])
        setAddedWords(new Set(parsed.addedWords || []))
      }
    } catch { /* ignore */ }
  }, [selectedLessonId])

  // Load user decks whenever the analysis panel opens
  useEffect(() => {
    if (!analyzeOpen || !currentUser || userDecks.length > 0) return
    getUserDecks(currentUser.id)
      .then(decks => {
        setUserDecks(decks)
        if (decks.length > 0 && !selectedDeckId) setSelectedDeckId(decks[0].id)
      })
      .catch(() => {})
  }, [analyzeOpen, currentUser])

  // Save analysis to localStorage when it changes
  useEffect(() => {
    if (!selectedLessonId || !analyzeResult || analyzeResult.error) return
    try {
      localStorage.setItem(`kalimat_analysis_${selectedLessonId}`, JSON.stringify({
        result: analyzeResult,
        history: analyzeHistory,
        addedWords: [...addedWords],
      }))
    } catch { /* ignore */ }
  }, [selectedLessonId, analyzeResult, analyzeHistory, addedWords])

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
    // Reset analysis state (useEffect will restore cached if available)
    setAnalyzeOpen(false)
    setAnalyzeResult(null)
    setAnalyzeHistory([])
    setAddedWords(new Set())
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

  // Close menus on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = () => setMenuOpen(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [menuOpen])

  // ── AI Analysis ──
  const autoLogWords = useCallback(async (words) => {
    if (!currentUser || !words?.length) return
    for (const w of words) {
      try {
        await submitContribution(currentUser.id, currentUser.username, {
          type: 'new_word',
          arabic: w.arabic,
          definition: w.meaning,
          root: (w.root || '').replace(/\s/g, ''),
          pos: w.partOfSpeech || '',
          source: 'gemini',
          status: 'approved',
        })
      } catch { /* ignore duplicates / errors */ }
    }
  }, [currentUser])

  const runAnalysis = useCallback(async (mode = 'full') => {
    if (!canvasRef.current || !currentUser) return
    setAnalyzeOpen(true)
    setAnalyzeHistory([])
    setAddedWords(new Set())

    // For "ask" mode, just open the panel with input — don't send yet
    if (mode === 'ask') {
      setAnalyzeResult({ _mode: 'ask', _askReady: true })
      setAnalyzing(false)
      // Load user decks
      try {
        const decks = await getUserDecks(currentUser.id)
        setUserDecks(decks)
        if (decks.length > 0 && !selectedDeckId) setSelectedDeckId(decks[0].id)
      } catch { /* ignore */ }
      return
    }

    setAnalyzing(true)
    setAnalyzeResult(null)
    // Load user decks for "add to deck" feature
    try {
      const decks = await getUserDecks(currentUser.id)
      setUserDecks(decks)
      if (decks.length > 0 && !selectedDeckId) setSelectedDeckId(decks[0].id)
    } catch { /* ignore */ }
    try {
      const imageData = canvasRef.current.getCanvasImage()
      const prompt = 'Analyze this note'
      const result = await analyzeNote(imageData, prompt, [], mode)
      setAnalyzeResult(result)
      setAnalyzeHistory([
        { role: 'user', text: prompt },
        { role: 'model', text: JSON.stringify(result) },
      ])
      // Auto-log all detected words to Gemini contributions
      autoLogWords(result.words)
    } catch (err) {
      setAnalyzeResult({ error: err.message || 'Analysis failed' })
    }
    setAnalyzing(false)
  }, [currentUser, selectedDeckId, autoLogWords])

  const handleAnalyze = useCallback((modeOrAction) => {
    // 'toggle' = just show/hide the panel
    if (modeOrAction === 'toggle') {
      setAnalyzeOpen(prev => !prev)
      return
    }
    // Otherwise it's a mode key — run analysis with that mode
    runAnalysis(modeOrAction || 'full')
  }, [runAnalysis])

  const handleRegenerate = useCallback(() => {
    // Clear cached analysis and re-run with same mode
    const currentMode = analyzeResult?._mode || 'full'
    if (selectedLessonId) {
      localStorage.removeItem(`kalimat_analysis_${selectedLessonId}`)
    }
    runAnalysis(currentMode)
  }, [selectedLessonId, runAnalysis, analyzeResult])

  const handleFollowUp = useCallback(async () => {
    const prompt = analyzePrompt.trim()
    if (!prompt || analyzing) return
    setAnalyzePrompt('')
    setAnalyzing(true)

    // If this is the first "ask" message, send with image
    const isFirstAsk = analyzeResult?._askReady && analyzeHistory.length === 0

    setAnalyzeResult(prev => ({
      ...prev,
      _askReady: false,
      followUps: [...(prev?.followUps || []), { role: 'user', text: prompt }],
    }))

    try {
      const imageData = isFirstAsk ? canvasRef.current?.getCanvasImage() : ''
      const result = await analyzeNote(imageData, prompt, analyzeHistory, isFirstAsk ? 'ask' : undefined)
      const responseText = result.response || result.explanation || result.analysis || JSON.stringify(result)
      setAnalyzeHistory(prev => [
        ...prev,
        { role: 'user', text: prompt },
        { role: 'model', text: responseText },
      ])
      setAnalyzeResult(prev => ({
        ...prev,
        followUps: [...(prev?.followUps || []), { role: 'model', text: responseText }],
      }))
      // Auto-log any words detected
      if (result.words?.length) autoLogWords(result.words)
    } catch (err) {
      setAnalyzeResult(prev => ({
        ...prev,
        followUps: [...(prev?.followUps || []), { role: 'model', text: 'Error: ' + (err.message || 'Failed') }],
      }))
    }
    setAnalyzing(false)
    setTimeout(() => analyzeChatRef.current?.scrollTo(0, analyzeChatRef.current.scrollHeight), 100)
  }, [analyzePrompt, analyzing, analyzeHistory, analyzeResult, autoLogWords])

  const handleAddWord = useCallback(async (word) => {
    if (!currentUser || !selectedDeckId || addedWords.has(word.arabic)) return
    try {
      const forms = word.forms || {}
      await createWord(currentUser.id, {
        deckId: selectedDeckId,
        arabic: word.arabic,
        english: word.meaning,
        root: (word.root || '').replace(/\s/g, ''),
        partOfSpeech: word.partOfSpeech || '',
        exampleSentence: word.exampleSentence || '',
        past: forms.past || '',
        present: forms.present || '',
        command: forms.command || '',
        masdar: forms.masdar || '',
        singular: forms.singular || '',
        dual: forms.dual || '',
        plural: forms.plural || '',
      })
      // Words are already auto-logged to contributions via autoLogWords
      setAddedWords(prev => new Set([...prev, word.arabic]))
    } catch (err) {
      console.error('Failed to add word:', err)
    }
  }, [currentUser, selectedDeckId, addedWords])

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
                {/* Template selector */}
                <select
                  className="form-input"
                  style={{ fontSize: '0.8rem', padding: '4px 8px', width: 'auto' }}
                  value={selectedLesson.template || 'arabic'}
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
              template={selectedLesson.template || 'arabic'}
              onAnalyze={handleAnalyze}
              analyzing={analyzing}
              hasAnalysis={!!analyzeResult && !analyzeResult.error}
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

      {/* AI Analysis panel */}
      {analyzeOpen && (
        <div className="notebook-analyze-panel">
          <div className="notebook-analyze-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={16} />
              <span style={{ fontWeight: 600 }}>
                {analyzeResult?._mode === 'transcribe' ? 'Transcription' :
                 analyzeResult?._mode === 'explain' ? 'Explain My Notes' :
                 analyzeResult?._mode === 'feedback' ? 'Tutor Feedback' :
                 analyzeResult?._mode === 'ask' ? 'AI Response' :
                 'AI Analysis'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleRegenerate}
                disabled={analyzing}
                title="Re-analyze note"
              >
                <RefreshCw size={14} />
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setAnalyzeOpen(false)}>
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="notebook-analyze-body" ref={analyzeChatRef}>
            {analyzing && !analyzeResult && (
              <div className="notebook-analyze-loading">
                <div className="spinner" />
                <span>Analyzing your notes…</span>
              </div>
            )}

            {analyzeResult?._askReady && (
              <div className="notebook-analyze-loading" style={{ opacity: 0.7 }}>
                <MessageCircleQuestion size={32} strokeWidth={1} />
                <span>Type your question below</span>
              </div>
            )}

            {analyzeResult?.error && (
              <div className="notebook-analyze-error">
                {analyzeResult.error}
              </div>
            )}

            {analyzeResult && !analyzeResult.error && (
              <>
                {/* Transcription — show for transcribe and full modes */}
                {analyzeResult.transcription && (analyzeResult._mode === 'transcribe' || analyzeResult._mode === 'full') && (
                  <div className="notebook-analyze-section">
                    <h4>Transcription</h4>
                    <p className="notebook-analyze-arabic" dir="rtl">{analyzeResult.transcription}</p>
                  </div>
                )}

                {/* Translation — show for transcribe and full modes */}
                {analyzeResult.translation && (analyzeResult._mode === 'transcribe' || analyzeResult._mode === 'full') && (
                  <div className="notebook-analyze-section">
                    <h4>Translation</h4>
                    <p>{analyzeResult.translation}</p>
                  </div>
                )}

                {/* Explanation — explain mode only */}
                {analyzeResult.explanation && analyzeResult._mode === 'explain' && (
                  <div className="notebook-analyze-section">
                    <h4>Study Notes</h4>
                    <div className="notebook-analyze-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(analyzeResult.explanation) }} />
                  </div>
                )}

                {/* Response — ask mode only */}
                {analyzeResult.response && analyzeResult._mode === 'ask' && (
                  <div className="notebook-analyze-section">
                    <h4>Answer</h4>
                    <div className="notebook-analyze-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(analyzeResult.response) }} />
                  </div>
                )}

                {/* Words detected */}
                {analyzeResult.words?.length > 0 && (
                  <div className="notebook-analyze-section">
                    <div className="notebook-analyze-words-header">
                      <h4>Words ({analyzeResult.words.length})</h4>
                      {userDecks.length > 0 && (
                        <select
                          className="form-input"
                          style={{ fontSize: '0.75rem', padding: '2px 6px', width: 'auto', maxWidth: 160 }}
                          value={selectedDeckId || ''}
                          onChange={e => setSelectedDeckId(Number(e.target.value))}
                        >
                          {userDecks.map(d => (
                            <option key={d.id} value={d.id}>{d.title}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="notebook-analyze-words">
                      {analyzeResult.words.map((w, i) => (
                        <div key={i} className="notebook-analyze-word">
                          <div className="notebook-analyze-word-top">
                            <div className="notebook-analyze-word-info">
                              <span className="notebook-analyze-word-arabic" dir="rtl">{w.arabic}</span>
                              {w.partOfSpeech && <span className="notebook-analyze-word-pos">{w.partOfSpeech}</span>}
                              {w.root && <span className="notebook-analyze-word-root" dir="rtl">{w.root}</span>}
                            </div>
                            <button
                              className={`btn btn-sm${addedWords.has(w.arabic) ? ' btn-ghost' : ' btn-primary'}`}
                              onClick={() => handleAddWord(w)}
                              disabled={addedWords.has(w.arabic) || !selectedDeckId}
                              title={addedWords.has(w.arabic) ? 'Added' : 'Add to deck'}
                            >
                              {addedWords.has(w.arabic) ? <Check size={14} /> : <PlusCircle size={14} />}
                            </button>
                          </div>
                          <div className="notebook-analyze-word-meaning">{w.meaning}</div>
                          {w.exampleSentence && (
                            <div className="notebook-analyze-word-example">
                              <span dir="rtl">{w.exampleSentence}</span>
                              {w.exampleTranslation && <span className="notebook-analyze-word-example-en">{w.exampleTranslation}</span>}
                            </div>
                          )}
                          {w.confidence != null && w.confidence < 0.8 && (
                            <span className="notebook-analyze-word-confidence">Confidence: {Math.round(w.confidence * 100)}%</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tutor feedback — feedback and full modes */}
                {analyzeResult.analysis && (analyzeResult._mode === 'feedback' || analyzeResult._mode === 'full') && (
                  <div className="notebook-analyze-section">
                    <h4>{analyzeResult._mode === 'feedback' ? 'Tutor Feedback' : 'Analysis'}</h4>
                    <div className="notebook-analyze-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(analyzeResult.analysis) }} />
                  </div>
                )}

                {/* Follow-up messages */}
                {analyzeResult.followUps?.map((msg, i) => (
                  <div key={`fu-${i}`} className={`notebook-analyze-followup notebook-analyze-followup-${msg.role}`}>
                    {msg.role === 'user' ? (
                      <div className="notebook-analyze-user-msg">{msg.text}</div>
                    ) : (
                      <div className="notebook-analyze-ai-msg" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }} />
                    )}
                  </div>
                ))}

                {analyzing && (
                  <div className="notebook-analyze-loading" style={{ padding: '8px 0' }}>
                    <div className="spinner" style={{ width: 16, height: 16 }} />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Follow-up input */}
          {analyzeResult && !analyzeResult.error && (
            <div className="notebook-analyze-input">
              <input
                type="text"
                className="form-input"
                placeholder={analyzeResult._askReady ? 'Ask a question about your notes…' : 'Ask a follow-up question…'}
                value={analyzePrompt}
                onChange={e => setAnalyzePrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleFollowUp() }}
                disabled={analyzing}
                autoFocus={!!analyzeResult._askReady}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={handleFollowUp}
                disabled={analyzing || !analyzePrompt.trim()}
              >
                <Send size={14} />
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
