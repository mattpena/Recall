import React, { useState, useEffect } from 'react'
import {
  Box, Typography, TextField, Button, Divider, Alert, CircularProgress,
  Select, MenuItem, FormControl, InputLabel, InputAdornment, IconButton,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
} from '@mui/material'
import { Visibility, VisibilityOff, Save, DeleteForever } from '@mui/icons-material'
import { useAuthStore } from '../../store/auth.store'

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

  useEffect(() => {
    window.electron.settings.get().then((s) => {
      setSettings((prev) => ({ ...prev, ...(s as Partial<Settings>) }))
    })
  }, [])

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
      <Typography variant="h6" gutterBottom>Transcription Model (on-device)</Typography>
      <FormControl fullWidth size="small" sx={{ mb: 1 }}>
        <InputLabel>Whisper Model</InputLabel>
        <Select
          value={settings.whisperModel}
          label="Whisper Model"
          onChange={(e) => setSettings((s) => ({ ...s, whisperModel: e.target.value }))}
        >
          <MenuItem value="tiny.en">tiny.en — 75MB, fastest, English only</MenuItem>
          <MenuItem value="base.en">base.en — 150MB, fast, English only (recommended)</MenuItem>
          <MenuItem value="medium.en">medium.en — 1.5GB, accurate, English only</MenuItem>
          <MenuItem value="large">large — 3GB, multilingual, most accurate</MenuItem>
        </Select>
      </FormControl>
      <Typography variant="caption" color="text.secondary">
        Downloaded automatically on first use. Runs fully on-device.
      </Typography>

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
