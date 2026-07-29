// v2.8.0
import React, { useState } from 'react'
import { Volume2, Loader } from 'lucide-react'
import { api } from '../lib/api'

const stripHarakat = t =>
  t.replace(/[\u064B-\u065F\u0610-\u061A\u0670\u06D6-\u06DC\u06DF-\u06E4\u06EA-\u06ED]/g, '').trim()

const API_BASE = import.meta.env.VITE_API_URL || '/api'

// In-memory cache: clean text → blob URL (instant same-session replay)
const _session = new Map()
let _currentAudio = null

async function toCacheKey(text) {
  if (!crypto?.subtle) return null
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 20) + '.mp3'
}

export async function speakArabic(text, { rate = '-15%', keepHarakat = false } = {}) {
  if (!text) return
  const clean = keepHarakat ? text.trim() : stripHarakat(text)
  if (!clean) return

  if (_currentAudio) { _currentAudio.pause(); _currentAudio = null }

  const cacheInput = clean + '|' + rate

  // 1 — Session cache: instant, no network
  if (_session.has(cacheInput)) {
    play(_session.get(cacheInput))
    return
  }

  let blob
  const key = await toCacheKey(cacheInput)

  // 2 — Server cache: check if cached audio file exists
  if (key) {
    const cacheRes = await fetch(`${API_BASE}/tts/cache/${key}`).catch(() => null)
    if (cacheRes?.ok) blob = await cacheRes.blob()
  }

  // 3 — TTS API: calls Azure, caches to filesystem, returns audio
  if (!blob) {
    blob = await api.postBlob('/tts/speak', { text: clean, rate })
  }

  const url = URL.createObjectURL(blob)
  _session.set(cacheInput, url)
  play(url)
}

function play(url) {
  if (_currentAudio) { _currentAudio.pause(); _currentAudio = null }
  const audio = new Audio(url)
  _currentAudio = audio
  audio.play()
  audio.onended = () => { _currentAudio = null }
}

export default function SpeakButton({ text, size = 14, rate = '-15%', keepHarakat = false, className = '' }) {
  const [loading, setLoading] = useState(false)
  if (!text) return null

  const handleClick = async e => {
    e.stopPropagation()
    if (loading) return
    setLoading(true)
    try { await speakArabic(text, { rate, keepHarakat }) } catch (err) { console.error('TTS:', err) }
    finally { setLoading(false) }
  }

  return (
    <button className={`speak-btn${className ? ' ' + className : ''}`} title="Pronounce" onClick={handleClick} disabled={loading}>
      {loading
        ? <Loader size={size} className="speak-spinner" />
        : <Volume2 size={size} />}
    </button>
  )
}
