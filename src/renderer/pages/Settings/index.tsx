// Set to true when the Slack app has public distribution enabled in api.slack.com/apps
const SLACK_ENABLED = false

import React, { useState, useEffect } from 'react'
import {
  Box, Typography, TextField, Button, Divider, Alert, CircularProgress,
  Select, MenuItem, FormControl, InputLabel, InputAdornment, IconButton,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  LinearProgress, Chip,
} from '@mui/material'
import {
  Visibility, VisibilityOff, Save, DeleteForever, CheckCircle,
  SystemUpdateAlt, WarningAmber,
} from '@mui/icons-material'
import { useAuthStore } from '../../store/auth.store'
import type { SlackStatus } from '../../../shared/types'

interface Settings {
  confluenceBaseUrl: string
  confluenceEmail: string
  confluenceApiToken: string
  whisperModel: string
  recordingRetentionDays: number
}

const DEFAULT_SETTINGS: Settings = {
  confluenceBaseUrl: '',
  confluenceEmail: '',
  confluenceApiToken: '',
  whisperModel: 'base.en',
  recordingRetentionDays: 30,
}

interface WhisperStatus {
  cliFound: boolean
  cliPath: string
  modelName: string
  modelFound: boolean
  modelPath: string
}

export default function Settings(): React.ReactElement {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteResult, setDeleteResult] = useState<string | null>(null)
  const { isSignedIn, userEmail, setAuthStatus } = useAuthStore()

  const [slackStatus, setSlackStatus] = useState<SlackStatus | null>(null)
  const [slackConnecting, setSlackConnecting] = useState(false)
  const [slackError, setSlackError] = useState<string | null>(null)
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false)

  // App version & updates
  const [appVersion, setAppVersion] = useState<string>('')
  const [updateStatus, setUpdateStatus] = useState<
    'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'error'
  >('idle')
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [downloadPct, setDownloadPct] = useState(0)

  // Whisper status
  const [whisperStatus, setWhisperStatus] = useState<WhisperStatus | null>(null)
  const [whisperChecking, setWhisperChecking] = useState(false)
  const [whisperInstalling, setWhisperInstalling] = useState(false)
  const [whisperInstallError, setWhisperInstallError] = useState<string | null>(null)
  const [whisperInstalled, setWhisperInstalled] = useState(false)
  const [modelDownloading, setModelDownloading] = useState(false)
  const [modelDownloadPct, setModelDownloadPct] = useState(0)
  const [modelDownloadError, setModelDownloadError] = useState<string | null>(null)

  useEffect(() => {
    window.electron.settings.get().then((s) => {
      setSettings((prev) => ({ ...prev, ...(s as Partial<Settings>) }))
    })
    window.electron.slack.getStatus().then(setSlackStatus)
    window.electron.app.getVersion().then(setAppVersion)
    loadWhisperStatus()

    const unsubDownloaded = window.electron.app.onUpdateDownloaded((version) => {
      setUpdateStatus('ready')
      setUpdateVersion(version)
    })
    const unsubProgress = window.electron.app.onUpdateProgress((pct) => {
      setUpdateStatus('downloading')
      setDownloadPct(pct)
    })
    const unsubModelProgress = window.electron.transcripts.onModelDownloadProgress((p) => {
      if (p.pct < 100) {
        setModelDownloadPct(p.pct)
      } else {
        setModelDownloading(false)
        setModelDownloadPct(100)
        loadWhisperStatus()
      }
    })

    return () => {
      unsubDownloaded()
      unsubProgress()
      unsubModelProgress()
    }
  }, [])

  async function loadWhisperStatus(): Promise<void> {
    setWhisperChecking(true)
    try {
      const status = await window.electron.whisper.getStatus()
      setWhisperStatus(status)
    } finally {
      setWhisperChecking(false)
    }
  }

  async function handleInstallWhisper(): Promise<void> {
    setWhisperInstalling(true)
    setWhisperInstallError(null)
    setWhisperInstalled(false)
    try {
      await window.electron.whisper.install()
      setWhisperInstalled(true)
      await loadWhisperStatus()
    } catch (err) {
      setWhisperInstallError((err as Error).message)
    } finally {
      setWhisperInstalling(false)
    }
  }

  async function handleDownloadModel(): Promise<void> {
    if (!whisperStatus) return
    setModelDownloading(true)
    setModelDownloadPct(0)
    setModelDownloadError(null)
    try {
      await window.electron.whisper.downloadModel(whisperStatus.modelName)
      await loadWhisperStatus()
    } catch (err) {
      setModelDownloadError((err as Error).message)
    } finally {
      setModelDownloading(false)
    }
  }

  async function handleCheckForUpdates(): Promise<void> {
    setUpdateStatus('checking')
    setUpdateError(null)
    try {
      const result = await window.electron.app.checkForUpdates()
      if (result.available && result.version) {
        setUpdateStatus('available')
        setUpdateVersion(result.version)
      } else {
        setUpdateStatus('up-to-date')
      }
    } catch (err) {
      setUpdateStatus('error')
      setUpdateError((err as Error).message)
    }
  }

  async function handleSave(): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      for (const [key, value] of Object.entries(settings)) {
        await window.electron.settings.set(key, value)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSignOut(): Promise<void> {
    await window.electron.auth.signOut()
    const status = await window.electron.auth.getStatus()
    setAuthStatus(status)
  }

  async function handleSlackConnect(): Promise<void> {
    setSlackConnecting(true)
    setSlackError(null)
    try {
      const status = await window.electron.slack.connect()
      setSlackStatus(status)
    } catch (err) {
      setSlackError((err as Error).message)
    } finally {
      setSlackConnecting(false)
    }
  }

  async function handleSlackDisconnect(): Promise<void> {
    await window.electron.slack.disconnect()
    setSlackStatus({ connected: false, teamName: null, userName: null })
    setDisconnectDialogOpen(false)
  }

  async function handleDeleteAllAudio(): Promise<void> {
    setDeleting(true)
    try {
      const count = await window.electron.cleanup.deleteAllAudio()
      setDeleteResult(
        count === 0
          ? 'No audio files found to delete.'
          : `Deleted audio files from ${count} recording${count === 1 ? '' : 's'}.`
      )
      setTimeout(() => setDeleteResult(null), 5000)
    } catch (err) {
      setDeleteResult(`Error: ${(err as Error).message}`)
    } finally {
      setDeleting(false)
      setDeleteDialogOpen(false)
    }
  }

  function toggleSecret(key: string): void {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function field(
    key: keyof Settings,
    label: string,
    placeholder?: string,
    isSecret = false,
    helperText?: string
  ): React.ReactElement {
    return (
      <TextField
        key={key}
        label={label}
        placeholder={placeholder}
        value={settings[key]}
        onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))}
        fullWidth
        size="small"
        type={isSecret && !showSecrets[key] ? 'password' : 'text'}
        helperText={helperText}
        InputProps={
          isSecret
            ? {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => toggleSecret(key)}>
                      {showSecrets[key] ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }
            : undefined
        }
      />
    )
  }

  return (
    <Box sx={{ p: 3, maxWidth: 600 }}>
      <Typography variant="h5" fontWeight={600} gutterBottom>
        Settings
      </Typography>

      {saved && <Alert severity="success" sx={{ mb: 2 }}>Settings saved!</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Google Account */}
      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>Google Account</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        {isSignedIn ? (
          <>
            <Typography variant="body2" color="success.main">✓ Signed in as {userEmail}</Typography>
            <Button size="small" variant="outlined" color="error" onClick={handleSignOut}>
              Sign out
            </Button>
          </>
        ) : (
          <Typography variant="body2" color="text.secondary">Not signed in</Typography>
        )}
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* Confluence */}
      <Typography variant="h6" gutterBottom>Atlassian Confluence</Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
        {field('confluenceBaseUrl', 'Confluence Base URL', 'https://your-org.atlassian.net')}
        {field('confluenceEmail', 'Confluence Email', 'you@company.com')}
        {field(
          'confluenceApiToken',
          'Confluence API Token',
          '',
          true,
          'Create at id.atlassian.com/manage-profile/security/api-tokens'
        )}
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* Whisper transcription model */}
      <Typography variant="h6" gutterBottom>Transcription (Whisper)</Typography>
      <FormControl fullWidth size="small" sx={{ mb: 1 }}>
        <InputLabel>Whisper Model</InputLabel>
        <Select
          value={settings.whisperModel}
          label="Whisper Model"
          onChange={(e) => setSettings((s) => ({ ...s, whisperModel: e.target.value }))}
        >
          <MenuItem value="tiny.en">tiny.en — 75 MB, fastest, English only</MenuItem>
          <MenuItem value="base.en">base.en — 150 MB, fast, English only (recommended)</MenuItem>
          <MenuItem value="medium.en">medium.en — 1.5 GB, accurate, English only</MenuItem>
          <MenuItem value="large">large — 3 GB, multilingual, most accurate</MenuItem>
        </Select>
      </FormControl>

      {/* Whisper status */}
      <Box sx={{ mt: 1.5, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" fontWeight={500}>Whisper Status</Typography>
          <Button size="small" variant="text" onClick={loadWhisperStatus} disabled={whisperChecking}>
            {whisperChecking ? 'Checking…' : 'Refresh'}
          </Button>
        </Box>

        {whisperStatus ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>

            {/* CLI install row */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {whisperStatus.cliFound ? (
                <>
                  <Chip
                    icon={<CheckCircle sx={{ fontSize: '14px !important' }} />}
                    label="Whisper CLI ready"
                    size="small"
                    color="success"
                    variant="outlined"
                  />
                  <Button
                    size="small"
                    variant="text"
                    disabled={whisperInstalling}
                    onClick={handleInstallWhisper}
                    sx={{ fontSize: '0.72rem' }}
                  >
                    {whisperInstalling ? 'Reinstalling…' : 'Reinstall'}
                  </Button>
                </>
              ) : (
                <>
                  <Chip
                    icon={<WarningAmber sx={{ fontSize: '14px !important' }} />}
                    label="Whisper CLI not found"
                    size="small"
                    color="error"
                    variant="outlined"
                  />
                  <Alert severity="error" sx={{ py: 0, px: 1, fontSize: '0.72rem' }}>
                    Binary missing — try reinstalling the app.
                  </Alert>
                </>
              )}
            </Box>

            {whisperStatus.cliFound && (
              <>
                {whisperInstallError && (
                  <Alert severity="error" sx={{ fontSize: '0.72rem', py: 0.5 }}>
                    {whisperInstallError}
                  </Alert>
                )}
                {whisperInstalled && (
                  <Alert severity="success" sx={{ fontSize: '0.72rem', py: 0.5 }}>
                    Whisper installed successfully. Transcription should now work.
                  </Alert>
                )}
              </>
            )}

            {/* Model row */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {whisperStatus.modelFound ? (
                <Chip
                  icon={<CheckCircle sx={{ fontSize: '14px !important' }} />}
                  label={`Model ${whisperStatus.modelName} downloaded`}
                  size="small"
                  color="success"
                  variant="outlined"
                />
              ) : (
                <>
                  <Chip
                    icon={<WarningAmber sx={{ fontSize: '14px !important' }} />}
                    label={`Model ${whisperStatus.modelName} not downloaded`}
                    size="small"
                    color="warning"
                    variant="outlined"
                  />
                  {!modelDownloading && (
                    <Button size="small" variant="outlined" onClick={handleDownloadModel}>
                      Download
                    </Button>
                  )}
                </>
              )}
            </Box>

          </Box>
        ) : (
          whisperChecking && <CircularProgress size={16} />
        )}

        {modelDownloading && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Downloading model… {modelDownloadPct}%
            </Typography>
            <LinearProgress variant="determinate" value={modelDownloadPct} sx={{ mt: 0.5 }} />
          </Box>
        )}
        {modelDownloadError && (
          <Alert severity="error" sx={{ mt: 1 }}>{modelDownloadError}</Alert>
        )}
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* Recording retention */}
      <Typography variant="h6" gutterBottom>Recording Retention</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Audio files are large and not needed after transcription. Recall will automatically delete
        them after the specified number of days. Transcripts and meeting notes are never deleted.
      </Typography>
      <FormControl fullWidth size="small" sx={{ mb: 1 }}>
        <InputLabel>Auto-delete audio after</InputLabel>
        <Select
          value={settings.recordingRetentionDays}
          label="Auto-delete audio after"
          onChange={(e) =>
            setSettings((s) => ({ ...s, recordingRetentionDays: Number(e.target.value) }))
          }
        >
          <MenuItem value={7}>7 days</MenuItem>
          <MenuItem value={14}>14 days</MenuItem>
          <MenuItem value={30}>30 days (recommended)</MenuItem>
          <MenuItem value={60}>60 days</MenuItem>
          <MenuItem value={90}>90 days</MenuItem>
          <MenuItem value={0}>Never (keep forever)</MenuItem>
        </Select>
      </FormControl>
      <Typography variant="caption" color="text.secondary">
        Applied at startup. Only the .webm and .wav audio files are removed — all notes and
        transcripts remain intact.
      </Typography>

      <Box sx={{ mt: 2 }}>
        <Button
          variant="outlined"
          color="error"
          size="small"
          startIcon={deleting ? <CircularProgress size={14} color="inherit" /> : <DeleteForever />}
          onClick={() => setDeleteDialogOpen(true)}
          disabled={deleting}
        >
          Delete All Audio Recordings Now
        </Button>
        {deleteResult && (
          <Alert severity="info" sx={{ mt: 1.5 }} onClose={() => setDeleteResult(null)}>
            {deleteResult}
          </Alert>
        )}
      </Box>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete All Audio Recordings?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete all stored audio files (.webm and .wav) from every
            recording. Transcripts, meeting notes, and synthesis output will not be affected.
            <br /><br />
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteAllAudio}
            color="error"
            variant="contained"
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={14} color="inherit" /> : <DeleteForever />}
          >
            {deleting ? 'Deleting…' : 'Delete All'}
          </Button>
        </DialogActions>
      </Dialog>

      <Divider sx={{ my: 3 }} />

      {/* Slack — hidden until public distribution is approved in api.slack.com/apps */}
      {SLACK_ENABLED && (
        <>
          <Typography variant="h6" gutterBottom>Slack</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Connect Slack to share meeting notes with your team after publishing to Confluence.
            Messages are posted from your own Slack account.
          </Typography>

          {slackError && <Alert severity="error" sx={{ mb: 2 }}>{slackError}</Alert>}

          {slackStatus?.connected ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'success.main' }}>
                <CheckCircle sx={{ fontSize: 18 }} />
                <Typography variant="body2" fontWeight={500}>
                  {slackStatus.userName
                    ? `${slackStatus.userName} · ${slackStatus.teamName}`
                    : slackStatus.teamName ?? 'Connected'}
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                color="error"
                onClick={() => setDisconnectDialogOpen(true)}
              >
                Disconnect
              </Button>
            </Box>
          ) : (
            <Button
              variant="outlined"
              onClick={handleSlackConnect}
              disabled={slackConnecting}
              startIcon={slackConnecting ? <CircularProgress size={14} color="inherit" /> : undefined}
            >
              {slackConnecting ? 'Connecting…' : 'Connect Slack'}
            </Button>
          )}

          <Dialog open={disconnectDialogOpen} onClose={() => setDisconnectDialogOpen(false)} maxWidth="xs" fullWidth>
            <DialogTitle>Disconnect Slack?</DialogTitle>
            <DialogContent>
              <DialogContentText>
                Recall will no longer be able to post Slack messages. You can reconnect at any time.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDisconnectDialogOpen(false)}>Cancel</Button>
              <Button color="error" variant="contained" onClick={handleSlackDisconnect}>
                Disconnect
              </Button>
            </DialogActions>
          </Dialog>

          <Divider sx={{ my: 3 }} />
        </>
      )}

      <Divider sx={{ my: 3 }} />

      {/* App version & updates */}
      <Typography variant="h6" gutterBottom>App Version</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Recall {appVersion || '…'}
        </Typography>
        {updateStatus === 'up-to-date' && (
          <Chip
            icon={<CheckCircle sx={{ fontSize: '14px !important' }} />}
            label="Up to date"
            size="small"
            color="success"
            variant="outlined"
          />
        )}
        {updateStatus === 'available' && updateVersion && (
          <Chip
            label={`v${updateVersion} available`}
            size="small"
            color="primary"
            variant="outlined"
          />
        )}
        {updateStatus === 'ready' && (
          <Chip
            label="Ready to install"
            size="small"
            color="success"
          />
        )}
      </Box>

      {updateStatus === 'downloading' && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Downloading update… {downloadPct}%
          </Typography>
          <LinearProgress variant="determinate" value={downloadPct} sx={{ mt: 0.5 }} />
        </Box>
      )}

      {updateError && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setUpdateError(null)}>
          {updateError.includes('publish') || updateError.includes('provider')
            ? 'Auto-update not configured. Check GitHub releases manually for new versions.'
            : updateError}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 1 }}>
        {updateStatus !== 'ready' && (
          <Button
            variant="outlined"
            size="small"
            startIcon={
              updateStatus === 'checking'
                ? <CircularProgress size={14} color="inherit" />
                : <SystemUpdateAlt />
            }
            onClick={handleCheckForUpdates}
            disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
          >
            {updateStatus === 'checking' ? 'Checking…' : 'Check for Updates'}
          </Button>
        )}
        {updateStatus === 'ready' && (
          <Button
            variant="contained"
            size="small"
            color="primary"
            startIcon={<SystemUpdateAlt />}
            onClick={() => window.electron.app.installUpdate()}
          >
            Restart to Update
          </Button>
        )}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        Requires the app to be distributed via GitHub Releases with auto-update configured.
      </Typography>

      <Divider sx={{ my: 3 }} />

      <Button
        variant="contained"
        onClick={handleSave}
        disabled={saving}
        startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Save />}
        size="large"
      >
        {saving ? 'Saving…' : 'Save Settings'}
      </Button>
    </Box>
  )
}
