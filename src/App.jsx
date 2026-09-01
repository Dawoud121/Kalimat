import React, { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { flushSyncQueue } from './lib/syncService'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import Flashcards from './pages/Flashcards'
import WordBank from './pages/WordBank'
import Decks from './pages/Decks'
import Dictionary from './pages/Dictionary'
import QuranicLexicon from './pages/QuranicLexicon'
import Settings from './pages/Settings'
import Stats from './pages/Stats'
import Contributions from './pages/Contributions'
import Games from './pages/Games'
import MemoryMatch from './pages/MemoryMatch'
import MultipleChoice from './pages/MultipleChoice'
import RootGrouping from './pages/RootGrouping'
import SpeedRound from './pages/SpeedRound'
import SpellItOut from './pages/SpellItOut'
import AdminStats from './pages/AdminStats'
import Stories from './pages/Stories'
import Notebook from './pages/Notebook'

// Apply saved theme on startup
function ThemeInit() {
  useEffect(() => {
    const theme = localStorage.getItem('kalimat_theme') || 'system';
    applyTheme(theme);

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e) => {
        if (localStorage.getItem('kalimat_theme') === 'system') {
          document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        }
      };
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, []);
  return null;
}

export function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    // system
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  }
}

function ProtectedRoute({ children }) {
  const { currentUser, loading, isGuest } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <span>Loading Kalimat…</span>
      </div>
    );
  }

  if (!currentUser && !isGuest) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

function RootRedirect() {
  const { currentUser, loading, isGuest } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    );
  }

  return <Navigate to={(currentUser || isGuest) ? '/dashboard' : '/login'} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Root redirect */}
      <Route path="/" element={<RootRedirect />} />

      {/* Protected routes with sidebar layout */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="flashcards" element={<Flashcards />} />
        <Route path="word-bank" element={<WordBank />} />
        <Route path="decks" element={<Decks />} />
        <Route path="dictionary" element={<Dictionary />} />
        <Route path="quran" element={<QuranicLexicon />} />
        <Route path="community" element={<Navigate to="/decks?section=team" replace />} />
        <Route path="games" element={<Games />} />
        <Route path="games/memory" element={<MemoryMatch />} />
        <Route path="games/multiple-choice" element={<MultipleChoice />} />
        <Route path="games/root-grouping" element={<RootGrouping />} />
        <Route path="games/speed-round" element={<SpeedRound />} />
        <Route path="games/spell-it-out" element={<SpellItOut />} />
        <Route path="contributions" element={<Contributions />} />
        <Route path="stats" element={<Stats />} />
        <Route path="admin" element={<AdminStats />} />
        <Route path="stories" element={<Stories />} />
        <Route path="notebook" element={<Notebook />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// Flush any queued SRS updates as soon as the device comes back online
function OnlineSync() {
  useEffect(() => {
    const flush = () => flushSyncQueue()
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [])
  return null
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeInit />
      <OnlineSync />
      <AppRoutes />
    </AuthProvider>
  );
}
