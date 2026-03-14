import React, { useState, useEffect } from 'react'
import {
  Card, CardContent, Box, Typography, Chip, IconButton,
  Menu, MenuItem, Button, CircularProgress, Collapse, Avatar, Tooltip,
} from '@mui/material'
import {
  FiberManualRecord, CheckCircle, People, AccessTime, Label,
  ExpandMore, ExpandLess, LocationOn, Videocam, VideoCall,
} from '@mui/icons-material'
import { useQuery } from '@tanstack/react-query'
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
  const [labelAnchor, setLabelAnchor] = useState<HTMLElement | null>(null)
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()

  const {
    status, eventId, transcriptId, durationMs,
    startRecording, stopRecording, setTranscriptReady,
  } = useRecordingStore()

  const { data: labels } = useQuery({
    queryKey: ['labels'],
    queryFn: () => window.electron.labels.list(),
    staleTime: 60_000,
  })

  const isThisEvent = eventId === event.id
  const isOtherBusy = !isThisEvent && (
    status === 'recording' || status === 'stopping' || status === 'transcribing'
  )

  useEffect(() => {
    if (status !== 'transcribing' || !isThisEvent) return
    const unsubscribe = window.electron.transcripts.onComplete(({ transcriptId: tid }) => {
      setTranscriptReady(tid)
    })
    return unsubscribe
  }, [status, isThisEvent, setTranscriptReady])

  const startTime = new Date(event.startTime)
  const endTime = new Date(event.endTime)
  const timeStr = `${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`

  function formatDuration(ms: number): string {
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  async function handleLabelSelect(labelId: string): Promise<void> {
    setLabelAnchor(null)
    const alreadyAssigned = event.labels.some((l) => l.id === labelId)
    if (alreadyAssigned) {
      await window.electron.calendar.removeLabel(event.id, labelId)
    } else {
      await window.electron.calendar.assignLabel(event.id, labelId)
    }
    onUpdate()
  }

  function renderRecordButton(): React.ReactElement {
    if (isThisEvent && status === 'done' && transcriptId) {
      return (
        <Button
          variant="contained"
          size="small"
          color="success"
          startIcon={<CheckCircle />}
          onClick={(e) => { e.stopPropagation(); navigate(`/transcripts/${transcriptId}`) }}
          sx={{ whiteSpace: 'nowrap', textTransform: 'none', fontWeight: 600 }}
        >
          View Transcript
        </Button>
      )
    }

    if (isThisEvent && (status === 'stopping' || status === 'transcribing')) {
      return (
        <Button
          variant="outlined"
          size="small"
          disabled
          startIcon={<CircularProgress size={12} color="inherit" />}
          sx={{ whiteSpace: 'nowrap', textTransform: 'none' }}
        >
          Processing...
        </Button>
      )
    }

    if (isThisEvent && status === 'recording') {
      return (
        <Button
          variant="contained"
          size="small"
          color="error"
          onClick={(e) => { e.stopPropagation(); stopRecording() }}
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
            <Tooltip title="Assign project label">
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); setLabelAnchor(e.currentTarget) }}
              >
                <Label sx={{ fontSize: 15 }} />
              </IconButton>
            </Tooltip>
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

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
          {renderRecordButton()}
        </Box>
      </CardContent>

      <Menu anchorEl={labelAnchor} open={Boolean(labelAnchor)} onClose={() => setLabelAnchor(null)}>
        {labels && labels.length > 0 ? (
          labels.map((label) => (
            <MenuItem
              key={label.id}
              onClick={() => handleLabelSelect(label.id)}
              selected={event.labels.some((l) => l.id === label.id)}
            >
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: label.color, mr: 1.5 }} />
              {label.name}
            </MenuItem>
          ))
        ) : (
          <MenuItem disabled>No project labels — create one in Project Labels</MenuItem>
        )}
      </Menu>
    </Card>
  )
}
