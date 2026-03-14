import React, { useState } from 'react'
import { Box, Button, Typography, CircularProgress, Alert, Paper } from '@mui/material'
import { Google } from '@mui/icons-material'
import { useAuthStore } from '../../store/auth.store'

export default function SignIn(): React.ReactElement {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { setAuthStatus } = useAuthStore()

  async function handleSignIn(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const status = await window.electron.auth.signIn()
      setAuthStatus(status)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box
      sx={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1e1e2e 0%, #2d2d44 100%)',
      }}
    >
      <Paper sx={{ p: 5, textAlign: 'center', maxWidth: 400, width: '100%' }}>
        <Typography variant="h4" fontWeight={700} color="primary" gutterBottom letterSpacing={2}>
          RECALL
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          Capture, transcribe, and synthesize your meeting knowledge
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }}>
            {error}
          </Alert>
        )}

        <Button
          variant="contained"
          size="large"
          startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <Google />}
          onClick={handleSignIn}
          disabled={loading}
          fullWidth
          sx={{ py: 1.5 }}
        >
          {loading ? 'Signing in…' : 'Sign in with Google'}
        </Button>

        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
          Google Calendar access required to view your meetings
        </Typography>
      </Paper>
    </Box>
  )
}
