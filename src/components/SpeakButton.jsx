// v2.8.0
import React, { useState } from 'react'
import { Volume2 } from 'lucide-react'

let _currentUtterance = null

function getArabicVoice() {
  const voices = speechSynthesis.getVoices()
  return voices.find(v => v.lang.startsWith('ar')) || null
}

function parseRate(rate) {
  if (typeof rate === 'number') return rate
  const match = String(rate).match(/^([+-]?\d+)%$/)
  if (!match) return 1
  return 1 + parseInt(match[1], 10) / 100
}

export function speakArabic(text, { rate = '-15%' } = {}) {
  if (!text?.trim()) return
  speechSynthesis.cancel()
  _currentUtterance = null

  const utterance = new SpeechSynthesisUtterance(text.trim())
  utterance.lang = 'ar-SA'
  const voice = getArabicVoice()
  if (voice) utterance.voice = voice
  utterance.rate = parseRate(rate)
  utterance.onend = () => { _currentUtterance = null }
  _currentUtterance = utterance
  speechSynthesis.speak(utterance)
}

export default function SpeakButton({ text, size = 14, rate = '-15%', className = '' }) {
  const [speaking, setSpeaking] = useState(false)
  if (!text) return null

  const handleClick = e => {
    e.stopPropagation()
    if (speaking) {
      speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    setSpeaking(true)
    speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text.trim())
    utterance.lang = 'ar-SA'
    const voice = getArabicVoice()
    if (voice) utterance.voice = voice
    utterance.rate = parseRate(rate)
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    speechSynthesis.speak(utterance)
  }

  return (
    <button className={`speak-btn${className ? ' ' + className : ''}`} title="Pronounce" onClick={handleClick}>
      <Volume2 size={size} />
    </button>
  )
}
