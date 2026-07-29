// v2.8.0
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api, getToken, setToken, clearToken } from '../lib/api'
import { initialSync, syncQuranLexicon } from '../lib/syncService'
import { batchImportDeck, startAppSession, endAppSession } from '../lib/dataService'

const APP_SESSION_ID_KEY    = 'kalimat_app_session_id'
const APP_SESSION_START_KEY = 'kalimat_app_session_start'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading]         = useState(true)
  const [isGuest, setIsGuest]         = useState(false)
  const [guestData, setGuestData]     = useState({ decks: [], words: [], srsCards: [] })

  // Start a new app session, closing any stale one first
  function startSession(userId) {
    const prevId = localStorage.getItem(APP_SESSION_ID_KEY)
    if (prevId) {
      endAppSession(Number(prevId), null)
    }
    startAppSession(userId).then(id => {
      if (id != null) {
        localStorage.setItem(APP_SESSION_ID_KEY,    String(id))
        localStorage.setItem(APP_SESSION_START_KEY, String(Date.now()))
      }
    }).catch(() => {})
  }

  // On mount, check for existing JWT and restore session
  useEffect(() => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }

    // Validate token + fetch current user
    api.get('/auth/me')
      .then(data => {
        const user = {
          id:       data.user.id,
          email:    data.user.email,
          username: data.user.username,
        }
        // Refresh token if server returned a new one
        if (data.token) setToken(data.token)
        setCurrentUser(user)
        startSession(user.id)
        initialSync(user.id).catch(() => {})
        syncQuranLexicon().catch(() => {})
      })
      .catch(() => {
        // Token invalid/expired
        clearToken()
        setCurrentUser(null)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  const loginAsGuest = useCallback(() => {
    setIsGuest(true)
    setLoading(false)
  }, [])

  const importGuestDeck = useCallback((deckData, words) => {
    const deckId = `gd-${Date.now()}`
    const today  = new Date().toISOString().slice(0, 10)
    const newDeck = { id: deckId, title: deckData.title, description: deckData.description || '' }
    const newWords = words.map((w, i) => ({
      id:             `gw-${Date.now()}-${i}`,
      deckId,
      arabic:         w.arabic || '',
      english:        w.english || '',
      root:           w.root || '',
      partOfSpeech:   w.part_of_speech || w.partOfSpeech || '',
      exampleSentence:w.example_sentence || w.exampleSentence || '',
      notes:          '',
    }))
    const newCards = newWords.map((w, i) => ({
      id:             `gc-${Date.now()}-${i}`,
      wordId:         w.id,
      deckId,
      repetitions:    0,
      easeFactor:     2.5,
      interval:       1,
      nextReviewDate: today,
      lastReviewed:   null,
      word:           w,
    }))
    setGuestData(prev => ({
      decks:    [...prev.decks, newDeck],
      words:    [...prev.words, ...newWords],
      srsCards: [...prev.srsCards, ...newCards],
    }))
    return { deck: newDeck, words: newWords, srsCards: newCards }
  }, [])

  const updateGuestSrsCard = useCallback((cardId, updates) => {
    setGuestData(prev => ({
      ...prev,
      srsCards: prev.srsCards.map(c =>
        c.id === cardId ? { ...c, ...updates, word: c.word } : c
      ),
    }))
  }, [])

  const login = useCallback(async (email, password) => {
    const data = await api.post('/auth/login', {
      email: email.trim().toLowerCase(),
      password,
    })
    setToken(data.token)
    const user = {
      id:       data.user.id,
      email:    data.user.email,
      username: data.user.username,
    }
    setCurrentUser(user)
    startSession(user.id)
    initialSync(user.id).catch(() => {})
    syncQuranLexicon().catch(() => {})
    return user
  }, [])

  const register = useCallback(async (username, email, password) => {
    const data = await api.post('/auth/register', {
      username: username.trim(),
      email:    email.trim().toLowerCase(),
      password,
    })
    setToken(data.token)
    const user = {
      id:       data.user.id,
      email:    data.user.email,
      username: data.user.username,
    }

    // Migrate any guest decks to the new account
    if (isGuest && guestData.decks.length > 0) {
      try {
        for (const deck of guestData.decks) {
          const deckWords = guestData.words.filter(w => w.deckId === deck.id)
          await batchImportDeck(user.id, deck, deckWords, null)
        }
      } catch (err) {
        console.error('Guest data migration failed:', err)
      }
    }

    setIsGuest(false)
    setGuestData({ decks: [], words: [], srsCards: [] })
    setCurrentUser(user)
    startSession(user.id)
    initialSync(user.id).catch(() => {})
    syncQuranLexicon().catch(() => {})
    return user
  }, [isGuest, guestData])

  const logout = useCallback(async () => {
    if (isGuest) {
      setIsGuest(false)
      setGuestData({ decks: [], words: [], srsCards: [] })
      return
    }
    // End app session before clearing token
    const sessionId    = localStorage.getItem(APP_SESSION_ID_KEY)
    const sessionStart = Number(localStorage.getItem(APP_SESSION_START_KEY) || 0)
    if (sessionId) {
      await endAppSession(Number(sessionId), sessionStart ? Date.now() - sessionStart : null)
      localStorage.removeItem(APP_SESSION_ID_KEY)
      localStorage.removeItem(APP_SESSION_START_KEY)
    }
    clearToken()
    setCurrentUser(null)
  }, [isGuest])

  const updateUser = useCallback(async (updates) => {
    if (!currentUser) return
    await api.put('/auth/update', updates)
    setCurrentUser(prev => ({ ...prev, ...updates }))
  }, [currentUser])

  const deleteAccount = useCallback(async () => {
    if (!currentUser) return
    await api.del('/auth/delete')
    clearToken()
    setCurrentUser(null)
  }, [currentUser])

  return (
    <AuthContext.Provider value={{
      currentUser, loading, login, register, logout, updateUser, deleteAccount,
      isGuest, loginAsGuest, guestData, importGuestDeck, updateGuestSrsCard,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
