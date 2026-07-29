// v2.8.0
// API client — replaces Supabase client with direct fetch to PHP backend

const API_BASE = import.meta.env.VITE_API_URL || '/api'
const TOKEN_KEY = 'kalimat_token'

export function getToken() { return localStorage.getItem(TOKEN_KEY) }
export function setToken(t) { localStorage.setItem(TOKEN_KEY, t) }
export function clearToken() { localStorage.removeItem(TOKEN_KEY) }

async function request(method, path, body = null, options = {}) {
  const headers = {}
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  // Don't set Content-Type for non-body requests
  if (body !== null && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const fetchOpts = {
    method,
    headers,
    body: body !== null ? (body instanceof FormData ? body : JSON.stringify(body)) : null,
  }

  const res = await fetch(`${API_BASE}${path}`, fetchOpts)

  // Handle audio responses (TTS)
  if (options.responseType === 'blob') {
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(errText || `HTTP ${res.status}`)
    }
    return res.blob()
  }

  const data = await res.json()

  if (res.status === 401) {
    // Login/register errors should show the real message, not "Session expired"
    if (data.error) throw new Error(data.error)
    clearToken()
    throw new Error('Session expired')
  }

  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export const api = {
  get:  (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put:  (path, body) => request('PUT', path, body),
  del:  (path) => request('DELETE', path),
  // For TTS — returns a Blob
  postBlob: (path, body) => request('POST', path, body, { responseType: 'blob' }),
}
