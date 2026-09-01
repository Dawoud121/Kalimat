// v2.9.0
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../auth/AuthContext'
import {
  getNotebookClasses, createNotebookClass, updateNotebookClass, deleteNotebookClass,
  getNotebookLessons, createNotebookLesson, updateNotebookLesson, deleteNotebookLesson,
  getNotebookStrokes, updateLessonTemplate,
} from '../lib/dataService'
import NotebookCanvas from '../components/notebook/NotebookCanvas'
import HandwritingRecognizer from '../components/notebook/HandwritingRecognizer'
import {
  ChevronDown, ChevronRight, Plus, Pencil, Trash2, BookOpen, FileText, MoreVertical, X,
  PanelLeftOpen, PanelLeftClose, ScanText,
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

  // Handwriting recognizer
  const [showRecognizer, setShowRecognizer] = useState(false)

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

  // ── Handwriting recognition insert ──
  function handleRecognizedText(text) {
    // Insert as a text element on the canvas via the toolbar text tool
    // For simplicity, we'll trigger text tool mode and let user place it
    // Or we can directly add it — but we need canvas access
    // For now, just copy to clipboard and notify
    navigator.clipboard?.writeText(text)
    alert('Text copied to clipboard. Use the Text tool (T) to place it on the canvas.')
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
                {/* Handwriting recognition */}
                <button
                  className="notebook-tool-btn"
                  onClick={() => setShowRecognizer(true)}
                  title="Handwriting Recognition"
                >
                  <ScanText size={16} />
                </button>
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

      {/* Handwriting recognizer modal */}
      {showRecognizer && (
        <HandwritingRecognizer
          onRecognized={handleRecognizedText}
          onClose={() => setShowRecognizer(false)}
        />
      )}
    </div>
  )
}
