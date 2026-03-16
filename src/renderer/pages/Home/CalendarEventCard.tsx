import React, { useState, useEffect } from 'react'
import {
  Card, CardContent, Box, Typography, Chip, IconButton,
  Button, CircularProgress, Collapse, Avatar, Tooltip,
} from '@mui/material'
import {
  FiberManualRecord, CheckCircle, People, AccessTime,
  ExpandMore, ExpandLess, LocationOn, Videocam, VideoCall, ErrorOutline, Refresh,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { useRecordingStore } from '../../store/recording.store'
import type { CalendarEvent } from '../../../shared/types'

interface Props {
  event: CalendarEvent
  selected: boolean
  onSelect: () => void
  onUpdate: () => void
}

export default function CalendarEventCard({ event, selected, onSelect, onUpdate }: Props): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()

  const {
    micEventId, durationMs, sessions,
    startRecording, stopRecording, setTranscriptReady, setSessionError,
  } = useRecordingStore()

  const session = sessions[event.id]
  const isActiveMic = micEventId === event.id
  const isOtherBusy = micEventId !== null && micEventId !== event.id

  // Listen for transcription completion and errors for this event's session
  useEffect(() => {
    if (!session || session.status !== 'transcribing') return
    const { recordingId } = session

    const unsubComplete = window.electron.transcripts.onComplete(({ recordingId: rid, transcriptId }) => {
      if (rid === recordingId) setTranscriptReady(event.id, transcriptId)
    })

    const unsubStatus = window.electron.recording.onStatusChange(({ recordingId: rid, status, error }) => {
      if (rid === recordingId && status === 'error') setSessionError(event.id, error)
    })

    return () => {
      unsubComplete()
      unsubStatus()
    }
  }, [session?.status, session?.recordingId, event.id, setTranscriptReady, setSessionError])

  const startTime = new Date(event.startTime)
  const endTime = new Date(event.endTime)
  const timeStr = `${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`

  function formatDuration(ms: number): string {
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  function renderRecordButton(): React.ReactElement {
    if (session?.status === 'done' && session.transcriptId) {
      return (
        <Button
          variant="contained"
          size="small"
          color="success"
          startIcon={<CheckCircle />}
          onClick={(e) => { e.stopPropagation(); navigate(`/transcripts/${session.transcriptId}`) }}
          sx={{ whiteSpace: 'nowrap', textTransform: 'none', fontWeight: 600 }}
        >
          View Transcript
        </Button>
      )
    }

    if (session?.status === 'error') {
      return (
        <Button
          variant="outlined"
          size="small"
          color="error"
          startIcon={<ErrorOutline />}
          endIcon={<Refresh sx={{ fontSize: '0.9rem !important' }} />}
          disabled={isOtherBusy}
          onClick={(e) => { e.stopPropagation(); startRecording(event.id) }}
          sx={{ whiteSpace: 'nowrap', textTransform: 'none' }}
        >
          Retry
        </Button>
      )
    }

    if (session?.status === 'stopping' || session?.status === 'transcribing') {
      return (
        <Button
          variant="outlined"
          size="small"
          disabled
          startIcon={<CircularProgress size={12} color="inherit" />}
          sx={{ whiteSpace: 'nowrap', textTransform: 'none' }}
        >
          Processing…
        </Button>
      )
    }

    if (isActiveMic && session?.status === 'recording') {
      return (
        <Button
          variant="contained"
          size="small"
          color="error"
          onClick={(e) => { e.stopPropagation(); stopRecording(event.id) }}
          startIcon={<FiberManualRecord />}
          sx={{
            whiteSpace: 'nowrap',
            textTransform: 'none',
            fontWeight: 600,
            '@keyframes recPulse': {
              '0%, 100%': { opacity: 1 },
              '50%': { opacity: 0.55 },
            },
            animation: 'recPulse 1.4s ease-in-out infinite',
          }}
        >
          {formatDuration(durationMs)}
        </Button>
      )
    }

    // If a video conference link is present, offer "Join and Record"
    if (event.conferenceUrl) {
      return (
        <Button
          variant="outlined"
          size="small"
          disabled={isOtherBusy}
          onClick={(e) => {
            e.stopPropagation()
            window.open(event.conferenceUrl!)
            startRecording(event.id)
          }}
          startIcon={<VideoCall sx={{ fontSize: '1rem !important' }} />}
          sx={{
            whiteSpace: 'nowrap',
            textTransform: 'none',
            ...(!isOtherBusy && {
              color: 'primary.main',
              borderColor: 'primary.light',
              '&:hover': {
                borderColor: 'primary.main',
                backgroundColor: 'primary.main',
                color: '#fff',
              },
            }),
          }}
        >
          Join &amp; Record
        </Button>
      )
    }

    return (
      <Button
        variant="outlined"
        size="small"
        disabled={isOtherBusy}
        onClick={(e) => { e.stopPropagation(); startRecording(event.id) }}
        startIcon={<FiberManualRecord sx={{ fontSize: '0.9rem !important' }} />}
        sx={{
          whiteSpace: 'nowrap',
          textTransform: 'none',
          ...(!isOtherBusy && {
            color: 'error.main',
            borderColor: 'error.light',
            '&:hover': {
              borderColor: 'error.main',
              backgroundColor: 'error.main',
              color: '#fff',
            },
          }),
        }}
      >
        Record
      </Button>
    )
  }

  const hasDetails = Boolean(event.description) || event.attendees.length > 0

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 2,
        cursor: 'pointer',
        borderColor: selected ? 'primary.main' : 'divider',
        borderWidth: selected ? 2 : 1,
        transition: 'border-color 0.15s',
        '&:hover': { borderColor: selected ? 'primary.main' : 'text.disabled' },
      }}
      onClick={onSelect}
    >
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600} noWrap title={event.title}>
              {event.title}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 0.25 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AccessTime sx={{ fontSize: 12, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary">{timeStr}</Typography>
              </Box>
              {event.attendees.length > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <People sx={{ fontSize: 12, color: 'text.secondary' }} />
                  <Typography variant="caption" color="text.secondary">
                    {event.attendees.length}
                  </Typography>
                </Box>
              )}
              {event.location && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <LocationOn sx={{ fontSize: 12, color: 'text.secondary' }} />
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 160 }} title={event.location}>
                    {event.location}
                  </Typography>
                </Box>
              )}
              {event.conferenceUrl && (
                <Box
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); window.open(event.conferenceUrl!) }}
                >
                  <Videocam sx={{ fontSize: 12, color: 'primary.main' }} />
                  <Typography variant="caption" color="primary.main" sx={{ '&:hover': { textDecoration: 'underline' } }}>
                    Video call
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
            {hasDetails && (
              <Tooltip title={expanded ? 'Collapse' : 'Details'}>
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
                >
                  {expanded ? <ExpandLess sx={{ fontSize: 15 }} /> : <ExpandMore sx={{ fontSize: 15 }} />}
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>

        {event.labels.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.75 }}>
            {event.labels.map((label) => (
              <Chip
                key={label.id}
                label={label.name}
                size="small"
                sx={{
                  height: 18,
                  fontSize: '0.65rem',
                  backgroundColor: label.color + '22',
                  color: label.color,
                  borderColor: label.color,
                  border: '1px solid',
                  fontWeight: 500,
                }}
              />
            ))}
          </Box>
        )}

        <Collapse in={expanded} unmountOnExit>
          <Box sx={{ mt: 1.25, pt: 1.25, borderTop: 1, borderColor: 'divider' }}>
            {event.description && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mb: event.attendees.length > 0 ? 1 : 0, whiteSpace: 'pre-wrap' }}
              >
                {event.description}
              </Typography>
            )}
            {event.attendees.length > 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {event.attendees.map((a) => (
                  <Box key={a.email} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Avatar sx={{ width: 20, height: 20, fontSize: '0.6rem', bgcolor: 'primary.light' }}>
                      {(a.name ?? a.email)[0].toUpperCase()}
                    </Avatar>
                    <Typography variant="caption" color={a.self ? 'primary.main' : 'text.primary'}>
                      {a.name ?? a.email}{a.self ? ' (you)' : ''}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Collapse>

        {session?.status === 'error' && (
          <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            Transcription failed{session.errorMessage ? `:\n${session.errorMessage}` : ' — check Settings → Transcription.'}
          </Typography>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
          {renderRecordButton()}
        </Box>
      </CardContent>

    </Card>
  )
}
