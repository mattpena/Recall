import React, { useState, useEffect, useRef } from 'react'
import {
  Box, Typography, Button, CircularProgress, Alert, Accordion, AccordionSummary,
  AccordionDetails, Chip, List, ListItem, ListItemText, Divider, Paper, LinearProgress,
  TextField, Avatar, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  Tooltip, IconButton,
} from '@mui/material'
import { ExpandMore, OpenInNew, AutoAwesome, People, AccessTime, Notes, DeleteOutline } from '@mui/icons-material'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Transcript } from '../../../shared/types'
import ActionsPanel from './ActionsPanel'

export default function TranscriptDetail(): React.ReactElement {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [modelDownload, setModelDownload] = useState<{ pct: number; total: number } | null>(null)
  const [synthesisPending, setSynthesisPending] = useState(false)
  const [synthesisError, setSynthesisError] = useState<string | null>(null)

  // Notes editing state
  const [notesValue, setNotesValue] = useState<string>('')
  const [notesSaveStatus, setNotesSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const notesSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notesForSynthesisId = useRef<string | null>(null)
  const lastTranscriptId = useRef<string | null>(null)

  useEffect(() => {
    const unsubDownload = window.electron.synthesis.onModelDownloadProgress((p) => {
      if (p.pct >= 100) setModelDownload(null)
      else setModelDownload({ pct: p.pct, total: p.total })
    })
    const unsubStarted = window.electron.synthesis.onStarted(({ transcriptId }) => {
      if (transcriptId === id) setSynthesisPending(true)
    })
    const unsubComplete = window.electron.synthesis.onComplete(({ transcriptId }) => {
      if (transcriptId === id) {
        setSynthesisPending(false)
        setSynthesisError(null)
        queryClient.invalidateQueries({ queryKey: ['transcripts', id] })
      }
    })
    const unsubError = window.electron.synthesis.onError(({ transcriptId, error }) => {
      if (transcriptId === id) {
        setSynthesisPending(false)
        setSynthesisError(error)
      }
    })
    return () => {
      unsubDownload()
      unsubStarted()
      unsubComplete()
      unsubError()
    }
  }, [id, queryClient])

  const { data: transcript, isLoading, error } = useQuery<Transcript>({
    queryKey: ['transcripts', id],
    queryFn: () => window.electron.transcripts.get(id!) as Promise<Transcript>,
    enabled: Boolean(id),
    refetchInterval: (query) =>
      query.state.data?.synthesis ? false : 5000,
  })

  useEffect(() => {
    if (!id) return
    window.electron.synthesis.isPending(id).then((pending) => {
      if (pending) setSynthesisPending(true)
    }).catch(() => {/* ignore */})
  }, [id])

  useEffect(() => {
    if (id !== lastTranscriptId.current) {
      lastTranscriptId.current = id ?? null
      notesForSynthesisId.current = null
      setNotesValue('')
      setNotesSaveStatus('idle')
      setSynthesisPending(false)
      setSynthesisError(null)
    }

    if (transcript?.synthesis?.id && transcript.synthesis.id !== notesForSynthesisId.current) {
      notesForSynthesisId.current = transcript.synthesis.id
      setNotesValue(transcript.synthesis.notes ?? '')
    }
  }, [id, transcript?.synthesis?.id])

  function handleNotesChange(value: string): void {
    setNotesValue(value)
    setNotesSaveStatus('saving')
    if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current)
    notesSaveTimer.current = setTimeout(async () => {
      if (!transcript) return
      await window.electron.synthesis.updateNotes(transcript.id, value)
      setNotesSaveStatus('saved')
    }, 600)
  }

  const synthesizeMutation = useMutation({
    mutationFn: () => window.electron.synthesis.generate(id!),
    onSuccess: () => {
      setSynthesisError(null)
      queryClient.invalidateQueries({ queryKey: ['transcripts', id] })
    },
    onError: (err) => setSynthesisError((err as Error).message),
  })

  const pushMutation = useMutation({
    mutationFn: () => window.electron.synthesis.pushToConfluence(transcript!.synthesis!.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transcripts', id] }),
  })

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const deleteMutation = useMutation({
    mutationFn: () => window.electron.transcripts.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transcripts'] })
      navigate('/transcripts')
    },
  })

  if (isLoading) return <Box sx={{ p: 3 }}><CircularProgress /></Box>
  if (error || !transcript) return (
    <Box sx={{ p: 3 }}>
      <Alert severity="error">{error ? (error as Error).message : 'Transcript not found'}</Alert>
      <Button onClick={() => navigate('/transcripts')} sx={{ mt: 2 }}>Back</Button>
    </Box>
  )

  const { synthesis, event } = transcript

  return (
    <Box sx={{ display: 'flex', gap: 3, p: 3, alignItems: 'flex-start' }}>
      {/* ── Left: main content ─────────────────────────────────────────── */}
      <Box sx={{ flex: 1, minWidth: 0, maxWidth: 660 }}>
        {/* Back + delete row */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Button onClick={() => navigate('/transcripts')} size="small">
            ← Back
          </Button>
          <Tooltip title="Delete meeting notes">
            <IconButton
              size="small"
              onClick={() => setShowDeleteDialog(true)}
              sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}
            >
              <DeleteOutline />
            </IconButton>
          </Tooltip>
        </Box>

        <Typography variant="h5" fontWeight={600} gutterBottom>
          {event?.title ?? 'Untitled Recording'}
        </Typography>

        {/* Event metadata */}
        {event && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AccessTime sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary">
                {new Date(event.startTime).toLocaleString([], {
                  weekday: 'short', month: 'short', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
                {' – '}
                {new Date(event.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Typography>
            </Box>
            {event.attendees.length > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <People sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {event.attendees.map((a) => (
                    <Chip
                      key={a.email}
                      avatar={<Avatar sx={{ fontSize: '0.6rem !important' }}>{(a.name ?? a.email)[0].toUpperCase()}</Avatar>}
                      label={a.name ?? a.email}
                      size="small"
                      variant="outlined"
                      color={a.self ? 'primary' : 'default'}
                      sx={{ height: 22, fontSize: '0.7rem' }}
                    />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        )}

        {event?.description && (
          <Paper variant="outlined" sx={{ p: 1.5, mb: 3, borderRadius: 2, bgcolor: 'background.paper' }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" gutterBottom>
              Meeting Description
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {event.description}
            </Typography>
          </Paper>
        )}

        {/* Synthesis section */}
        {synthesis ? (
          <Box sx={{ mb: 3 }}>
            <Accordion defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography fontWeight={600}>Meeting Summary</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography>{synthesis.meetingSummary}</Typography>
              </AccordionDetails>
            </Accordion>

            <Accordion>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography fontWeight={600}>Attendees</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography>{synthesis.attendeesSummary}</Typography>
              </AccordionDetails>
            </Accordion>

            <Accordion>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography fontWeight={600}>Discussion</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography sx={{ whiteSpace: 'pre-wrap' }}>{synthesis.discussion}</Typography>
              </AccordionDetails>
            </Accordion>

            <Accordion>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography fontWeight={600}>Key Decisions</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <List dense disablePadding>
                  {synthesis.keyDecisions.map((decision, i) => (
                    <ListItem key={i} disableGutters>
                      <ListItemText primary={`• ${decision}`} />
                    </ListItem>
                  ))}
                </List>
              </AccordionDetails>
            </Accordion>

            <Accordion>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography fontWeight={600}>Next Steps</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <List dense disablePadding>
                  {synthesis.nextSteps.map((step, i) => (
                    <ListItem key={i} disableGutters>
                      <ListItemText primary={`☐ ${step}`} />
                    </ListItem>
                  ))}
                </List>
              </AccordionDetails>
            </Accordion>

            {/* Notes — editable passthrough */}
            <Accordion defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                  <Notes sx={{ fontSize: 18 }} />
                  <Typography fontWeight={600}>Notes</Typography>
                  {notesSaveStatus === 'saving' && (
                    <Chip label="Saving…" size="small" sx={{ ml: 'auto', mr: 1, height: 20, fontSize: '0.65rem' }} />
                  )}
                  {notesSaveStatus === 'saved' && (
                    <Chip label="Saved" size="small" color="success" sx={{ ml: 'auto', mr: 1, height: 20, fontSize: '0.65rem' }} />
                  )}
                </Box>
              </AccordionSummary>
              <AccordionDetails onClick={(e) => e.stopPropagation()}>
                <TextField
                  multiline
                  minRows={3}
                  fullWidth
                  placeholder="Add notes about this meeting…"
                  value={notesValue}
                  onChange={(e) => handleNotesChange(e.target.value)}
                  variant="outlined"
                  size="small"
                />
              </AccordionDetails>
            </Accordion>
          </Box>
        ) : (
          <Box sx={{ mb: 3, p: 3, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 2 }}>
            <AutoAwesome sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
            <>
              <Typography variant="h6" gutterBottom>Generating Meeting Notes…</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Analyzing your transcript and extracting key decisions
              </Typography>
              <CircularProgress size={28} sx={{ mb: 1 }} />
              {modelDownload && (
                <Box sx={{ mt: 2, width: '100%', maxWidth: 400, mx: 'auto' }}>
                  <Typography variant="caption" color="text.secondary" gutterBottom>
                    Downloading synthesis model ({Math.round(modelDownload.total / 1024 / 1024)}MB)… {modelDownload.pct}%
                  </Typography>
                  <LinearProgress variant="determinate" value={modelDownload.pct} sx={{ borderRadius: 1 }} />
                </Box>
              )}
            </>
            {synthesisError && (
              <Box sx={{ mt: 2 }}>
                <Alert severity="error" sx={{ textAlign: 'left', mb: 2 }}>
                  {synthesisError}
                </Alert>
                <Button
                  variant="contained"
                  onClick={() => { setSynthesisError(null); synthesizeMutation.mutate() }}
                  disabled={synthesizeMutation.isPending}
                  startIcon={synthesizeMutation.isPending ? <CircularProgress size={14} color="inherit" /> : <AutoAwesome />}
                >
                  Try Again
                </Button>
              </Box>
            )}
          </Box>
        )}

        <Divider sx={{ my: 3 }} />

        {/* Raw transcript */}
        <Typography variant="h6" fontWeight={600} gutterBottom>
          Raw Transcript
        </Typography>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, maxHeight: 400, overflow: 'auto' }}>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', lineHeight: 1.8 }}>
            {transcript.rawText}
          </Typography>
        </Paper>
      </Box>

      {/* ── Right: actions panel ───────────────────────────────────────── */}
      <ActionsPanel
        transcript={transcript}
        transcriptId={id!}
        synthesisPending={synthesisPending || synthesizeMutation.isPending}
        onSynthesize={() => synthesizeMutation.mutate()}
        onPushToConfluence={() => pushMutation.mutate()}
        pushPending={pushMutation.isPending}
        pushError={pushMutation.error as Error | null}
        synthesizeError={synthesisError}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onClose={() => setShowDeleteDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete meeting notes?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            <strong>{event?.title ?? 'Untitled Recording'}</strong>
            {' '}will be permanently deleted, including the transcript and any generated synthesis. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            {deleteMutation.isPending ? <CircularProgress size={16} color="inherit" /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
