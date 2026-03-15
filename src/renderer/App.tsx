import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './components/Layout/AppShell'
import Home from './pages/Home'
import Transcripts from './pages/Transcripts'
import TranscriptDetail from './pages/Transcripts/TranscriptDetail'
import Chat from './pages/Chat'
import Labels from './pages/Labels'
import Settings from './pages/Settings'
import { useAuthStore } from './store/auth.store'
import SignIn from './pages/SignIn'
import SetupWizard from './pages/Setup'

export default function App(): React.ReactElement {
  const { isSignedIn, setAuthStatus } = useAuthStore()
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null)
  const [authLoaded, setAuthLoaded] = useState(false)

  useEffect(() => {
    window.electron.auth.getStatus().then((status) => {
      setAuthStatus(status)
      setAuthLoaded(true)
    })
    const unsubscribe = window.electron.auth.onStatusChange(setAuthStatus)
    return unsubscribe
  }, [setAuthStatus])

  useEffect(() => {
    window.electron.settings.get().then((s) => {
      setOnboardingComplete(Boolean(s['onboardingComplete']))
    })
  }, [])

  // Wait for both auth status and settings to resolve before routing
  if (!authLoaded || onboardingComplete === null) return <></>

  // New user: not onboarded and not signed in → show wizard
  if (!onboardingComplete && !isSignedIn) {
    return (
      <SetupWizard
        onComplete={() => {
          window.electron.settings.set('onboardingComplete', true)
          setOnboardingComplete(true)
        }}
      />
    )
  }

  // Signed out after completing onboarding
  if (!isSignedIn) {
    return <SignIn />
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<Home />} />
        <Route path="/transcripts" element={<Transcripts />} />
        <Route path="/transcripts/:id" element={<TranscriptDetail />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/labels" element={<Labels />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </AppShell>
  )
}
