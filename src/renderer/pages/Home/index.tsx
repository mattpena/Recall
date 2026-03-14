import React, { useState } from 'react'
import { Box, Typography, CircularProgress, Alert, IconButton, Tooltip } from '@mui/material'
import { Refresh } from '@mui/icons-material'
import { useQuery } from '@tanstack/react-query'
import CalendarEventCard from './CalendarEventCard'
import NotesPanel from './NotesPanel'
import type { CalendarEvent } from '../../../shared/types'

export default function Home(): React.ReactElement {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const { data: events, isLoading, error, refetch } = useQuery<CalendarEvent[]>({
    queryKey: ['calendar', 'today'],
    queryFn: () => window.electron.calendar.getTodaysEvents(),
    staleTime: 5 * 60 * 1000,
  })

  const selectedEvent = events?.find((e) => e.id === selectedEventId) ?? null

  return (
    <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
      {/* Left column — calendar list */}
      <Box
        sx={{
          width: 380,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: 1,
          borderColor: 'divider',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ p: 2.5, pb: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h6" fontWeight={600}>{today}</Typography>
            <Typography variant="caption" color="text.secondary">Today's meetings</Typography>
          </Box>
          <Tooltip title="Refresh calendar">
            <span>
              <IconButton
                size="small"
                onClick={() => refetch()}
                disabled={isLoading}
                sx={{ mt: 0.5 }}
              >
                {isLoading
                  ? <CircularProgress size={16} />
                  : <Refresh sx={{ fontSize: 18 }} />
                }
              </IconButton>
            </span>
          </Tooltip>
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          )}

          {error && (
            <Alert severity="error" sx={{ m: 1 }}>
              Failed to load calendar: {(error as Error).message}
            </Alert>
          )}

          {events && events.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Typography variant="body2" color="text.secondary">
                No meetings scheduled for today
              </Typography>
            </Box>
          )}

          {events?.map((event) => (
            <CalendarEventCard
              key={event.id}
              event={event}
              selected={event.id === selectedEventId}
              onSelect={() => setSelectedEventId(event.id === selectedEventId ? null : event.id)}
              onUpdate={() => refetch()}
            />
          ))}
        </Box>
      </Box>

      {/* Right column — notes panel */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <NotesPanel event={selectedEvent} />
      </Box>
    </Box>
  )
}
