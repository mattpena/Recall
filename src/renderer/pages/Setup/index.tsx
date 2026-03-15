import React, { useState, useEffect } from 'react'
import {
  Box, Typography, Button, Stepper, Step, StepLabel, TextField,
  LinearProgress, Alert, CircularProgress, Paper, InputAdornment, IconButton,
} from '@mui/material'
import { CheckCircle, Visibility, VisibilityOff } from '@mui/icons-material'
import { useAuthStore } from '../../store/auth.store'

interface Props {
  onComplete: () => void
}

const STEPS = ['Welcome', 'Connect Google', 'Confluence', 'AI Model', 'Done']

export default function SetupWizard({ onComplete }: Props): React.ReactElement {
  const [step, setStep] = useState(0)

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 3,
      }}
    >
      <Paper
        elevation={3}
        sx={{ width: '100%', maxWidth: 560, p: 4, borderRadius: 3 }}
      >
        <Typography variant="h5" fontWeight={700} gutterBottom align="center">
          Set up Recall
        </Typography>

        <Stepper activeStep={step} sx={{ mb: 4, mt: 2 }}>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {step === 0 && <WelcomeStep onNext={() => setStep(1)} />}
        {step === 1 && <GoogleStep onNext={() => setStep(2)} />}
        {step === 2 && <ConfluenceStep onNext={() => setStep(3)} />}
        {step === 3 && <ModelStep onNext={() => setStep(4)} />}
        {step === 4 && <DoneStep onComplete={onComplete} />}
      </Paper>
    </Box>
  )
}

// ── Step 0: Welcome ────────────────────────────────────────────────────────

function WelcomeStep({ onNext }: { onNext: () => void }): React.ReactElement {
  return (
    <Box sx={{ textAlign: 'center' }}>
      <Typography variant="h6" gutterBottom>Welcome to Recall</Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        Recall records and transcribes your meetings, then uses on-device AI to extract
        key decisions, action items, and summaries — all private, all local.
        Let&apos;s get you set up in a few quick steps.
      </Typography>
      <Button variant="contained" size="large" onClick={onNext}>
        Get Started
      </Button>
    </Box>
  )
}

// ── Step 1: Google Sign-In ─────────────────────────────────────────────────

function GoogleStep({ onNext }: { onNext: () => void }): React.ReactElement {
  const { isSignedIn, userEmail, setAuthStatus } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsub = window.electron.auth.onStatusChange(setAuthStatus)
    return unsub
  }, [setAuthStatus])

  async function handleSignIn(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const status = await window.electron.auth.signIn()
      setAuthStatus(status)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ textAlign: 'center' }}>
      <Typography variant="h6" gutterBottom>Connect Google Calendar</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Recall integrates with Google Calendar to show your meetings and auto-match
        recordings. Your calendar data never leaves your device.
      </Typography>

      {isSignedIn ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'success.main' }}>
            <CheckCircle />
            <Typography fontWeight={600}>Signed in as {userEmail}</Typography>
          </Box>
          <Button variant="contained" onClick={onNext}>Continue</Button>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          {error && <Alert severity="error" sx={{ width: '100%', textAlign: 'left' }}>{error}</Alert>}
          <Button
            variant="contained"
            size="large"
            onClick={handleSignIn}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {loading ? 'Opening browser…' : 'Sign in with Google'}
          </Button>
          <Typography variant="caption" color="text.secondary">
            A browser window will open to complete sign-in
          </Typography>
        </Box>
      )}
    </Box>
  )
}

// ── Step 2: Confluence ─────────────────────────────────────────────────────

function ConfluenceStep({ onNext }: { onNext: () => void }): React.ReactElement {
  const [baseUrl, setBaseUrl] = useState('')
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleNext(): Promise<void> {
    setSaving(true)
    await window.electron.settings.set('confluenceBaseUrl', baseUrl)
    await window.electron.settings.set('confluenceEmail', email)
    await window.electron.settings.set('confluenceApiToken', token)
    setSaving(false)
    onNext()
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom>Atlassian Confluence</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Recall can publish meeting notes directly to Confluence. You can skip this and
        configure it later in Settings.
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
        <TextField
          label="Confluence Base URL"
          placeholder="https://your-org.atlassian.net"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          fullWidth
          size="small"
        />
        <TextField
          label="Confluence Email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          fullWidth
          size="small"
        />
        <TextField
          label="Confluence API Token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          fullWidth
          size="small"
          type={showToken ? 'text' : 'password'}
          helperText="Create at id.atlassian.com/manage-profile/security/api-tokens"
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setShowToken((v) => !v)}>
                  {showToken ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
      </Box>

      <Box sx={{ display: 'flex', gap: 2 }}>
        <Button variant="text" onClick={onNext} sx={{ color: 'text.secondary' }}>
          Skip for now
        </Button>
        <Button
          variant="contained"
          onClick={handleNext}
          disabled={saving || !baseUrl || !email || !token}
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          Save & Continue
        </Button>
      </Box>
    </Box>
  )
}

// ── Step 3: AI Model Download ──────────────────────────────────────────────

function ModelStep({ onNext }: { onNext: () => void }): React.ReactElement {
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState<{ pct: number; total: number } | null>(null)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsub = window.electron.synthesis.onModelDownloadProgress((p) => {
      if (p.pct >= 100) {
        setProgress(null)
        setDone(true)
        setDownloading(false)
      } else {
        setProgress({ pct: p.pct, total: p.total })
      }
    })
    return unsub
  }, [])

  async function handleDownload(): Promise<void> {
    setDownloading(true)
    setError(null)
    try {
      await window.electron.synthesis.ensureModel()
      setDone(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Box sx={{ textAlign: 'center' }}>
      <Typography variant="h6" gutterBottom>Download AI Model</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Recall uses an on-device AI model (~2.2 GB) to generate meeting summaries. It runs
        entirely on your Mac — no data is sent to any server. Download it now or skip
        and let it download automatically on first use.
      </Typography>

      {done ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'success.main' }}>
            <CheckCircle />
            <Typography fontWeight={600}>Model ready</Typography>
          </Box>
          <Button variant="contained" onClick={onNext}>Continue</Button>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          {error && <Alert severity="error" sx={{ width: '100%', textAlign: 'left' }}>{error}</Alert>}

          {downloading && progress && (
            <Box sx={{ width: '100%', maxWidth: 400 }}>
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Downloading… {progress.pct}%
                {progress.total > 0 && ` (${Math.round(progress.total / 1024 / 1024)} MB)`}
              </Typography>
              <LinearProgress variant="determinate" value={progress.pct} sx={{ borderRadius: 1, height: 6 }} />
            </Box>
          )}

          {downloading && !progress && (
            <CircularProgress size={28} />
          )}

          {!downloading && (
            <Button variant="contained" size="large" onClick={handleDownload}>
              Download Model
            </Button>
          )}

          <Button variant="text" onClick={onNext} sx={{ color: 'text.secondary' }} disabled={downloading}>
            Skip for now
          </Button>
        </Box>
      )}
    </Box>
  )
}

// ── Step 4: Done ───────────────────────────────────────────────────────────

function DoneStep({ onComplete }: { onComplete: () => void }): React.ReactElement {
  return (
    <Box sx={{ textAlign: 'center' }}>
      <CheckCircle sx={{ fontSize: 56, color: 'success.main', mb: 2 }} />
      <Typography variant="h6" fontWeight={600} gutterBottom>You&apos;re all set!</Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        Recall is ready. Head to the Home tab to see today&apos;s meetings and start recording.
      </Typography>
      <Button variant="contained" size="large" onClick={onComplete}>
        Open Recall
      </Button>
    </Box>
  )
}
