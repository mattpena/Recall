import React, { useState, useEffect, useRef } from 'react'
import { Box, Typography, TextField, Chip } from '@mui/material'
import { EditNote, NoteAlt } from '@mui/icons-material'
import type { CalendarEvent } from '../../../shared/types'

interface Props {
  event: CalendarEvent | null
}

export default function NotesPanel({ event }: Props): React.ReactElement {
  const [text, setText] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentEventId = useRef<string | null>(null)

  // Load notes when selected event changes
  useEffect(() => {
    if (!event) {
      setText('')
      currentEventId.current = null
      return
    }
    currentEventId.current = event.id
    window.electron.notes.get(event.id).then((saved) => {
      // Guard against stale response if user switches events quickly
      if (currentEventId.current === event.id) {
        setText(saved)
        setSaveStatus('idle')
      }
    })
  }, [event?.id])

  function handleChange(value: string): void {
    setText(value)
    setSaveStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      if (!event) return
      await window.electron.notes.set(event.id, value)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    }, 600)
  }

  if (!event) {
    return (
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          color: 'text.disabled',
          p: 4,
          userSelect: 'none',
        }}
      >
        <NoteAlt sx={{ fontSize: 48 }} />
        <Typography variant="body2" textAlign="center">
          Select a meeting to take notes
        </Typography>
      </Box>
    )
  }

  const startTime = new Date(event.startTime)
  const endTime = new Date(event.endTime)
  const timeStr = `${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2.5, gap: 1.5 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <EditNote sx={{ color: 'primary.main', flexShrink: 0 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={600} noWrap>
              {event.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">{timeStr}</Typography>
          </Box>
        </Box>
        {saveStatus === 'saving' && (
          <Chip label="Saving..." size="small" variant="outlined" sx={{ flexShrink: 0 }} />
        )}
        {saveStatus === 'saved' && (
          <Chip label="Saved" size="small" color="success" variant="outlined" sx={{ flexShrink: 0 }} />
        )}
      </Box>

      {/* Notes textarea */}
      <TextField
        multiline
        fullWidth
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Add notes before or during the meeting — agenda, questions, context...&#10;&#10;These will be included when generating the meeting synthesis."
        variant="outlined"
        sx={{
          flex: 1,
          '& .MuiInputBase-root': {
            height: '100%',
            alignItems: 'flex-start',
            fontFamily: 'inherit',
          },
          '& .MuiInputBase-inputMultiline': {
            height: '100% !important',
            overflow: 'auto !important',
            resize: 'none',
            lineHeight: 1.7,
          },
        }}
        InputProps={{
          sx: { height: '100%' },
        }}
      />
    </Box>
  )
}
