import React, { useEffect, useState } from 'react'
import {
  Box, Typography, Card, CardContent, CardActionArea, Chip,
  CircularProgress, Alert, LinearProgress, Accordion, AccordionSummary,
  AccordionDetails, IconButton, Dialog, DialogTitle, DialogContent,
  DialogContentText, DialogActions, Button, Tooltip,
} from '@mui/material'
import { Description, CheckCircle, Sync, GraphicEq, ExpandMore, DeleteOutline } from '@mui/icons-material'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { PendingTranscription, Transcript } from '../../../shared/types'

// Group transcripts by local date, newest first
interface DateGroup {
  label: string
  dateKey: string
  items: Transcript[]
}

function groupByDate(transcripts: Transcript[]): DateGroup[] {
  const groups = new Map<string, Transcript[]>()

  for (const t of transcripts) {
    const key = new Date(t.createdAt).toLocaleDateString('en-CA') // YYYY-MM-DD
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(t)
  }

  const todayKey = new Date().toLocaleDateString('en-CA')
  const yesterdayKey = new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA')

  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a)) // newest date first
    .map(([key, items]) => ({
      dateKey: key,
      label:
        key === todayKey
          ? 'Today'
          : key === yesterdayKey
            ? 'Yesterday'
            : new Date(`${key}T12:00:00`).toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              }),
      items,
    }))
}

export default function Transcripts(): React.ReactElement {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [deleteTarget, setDeleteTarget] = useState<Transcript | null>(null)

  const { data: transcripts, isLoading, error } = useQuery<Transcript[]>({
    queryKey: ['transcripts'],
    queryFn: () => window.electron.transcripts.list(),
    refetchInterval: 10_000,
  })

  const { data: pending } = useQuery<PendingTranscription[]>({
    queryKey: ['transcripts', 'pending'],
    queryFn: () => window.electron.transcripts.listPending(),
    refetchInterval: 3_000,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => window.electron.transcripts.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transcripts'] })
      setDeleteTarget(null)
    },
  })

  useEffect(() => {
    const unsubscribe = window.electron.transcripts.onComplete(() => {
      queryClient.invalidateQueries({ queryKey: ['transcripts'] })
    })
    return unsubscribe
  }, [queryClient])

  const hasPending = pending && pending.length > 0
  const isEmpty = !hasPending && (!transcripts || transcripts.length === 0)
  const groups = groupByDate(transcripts ?? [])

  function toggleGroup(dateKey: string): void {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(dateKey)) next.delete(dateKey)
      else next.add(dateKey)
      return next
    })
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={600} gutterBottom>
        Meeting Notes
      </Typography>

      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error">{(error as Error).message}</Alert>}

      {isEmpty && !isLoading && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Description sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">No meeting notes yet</Typography>
          <Typography variant="body2" color="text.secondary">
            Start a recording from the Today view to generate meeting notes
          </Typography>
        </Box>
      )}

      <Box sx={{ maxWidth: 800 }}>
        {/* In-progress cards always float at top */}
        {hasPending && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
            {pending!.map((p) => <PendingCard key={p.recordingId} pending={p} />)}
          </Box>
        )}

        {/* Date-grouped accordions, newest first */}
        {groups.map((group, idx) => {
          const isExpanded = !collapsed.has(group.dateKey)
          return (
            <Accordion
              key={group.dateKey}
              expanded={isExpanded}
              onChange={() => toggleGroup(group.dateKey)}
              disableGutters
              elevation={0}
              sx={{
                mb: 1.5,
                border: 1,
                borderColor: 'divider',
                borderRadius: '8px !important',
                '&:before': { display: 'none' },
                overflow: 'hidden',
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMore />}
                sx={{
                  minHeight: 48,
                  bgcolor: idx === 0 ? 'action.hover' : 'background.paper',
                  '& .MuiAccordionSummary-content': { my: 0.5 },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Typography variant="subtitle2" fontWeight={600}>
                    {group.label}
                  </Typography>
                  <Chip
                    label={group.items.length}
                    size="small"
                    sx={{ height: 18, fontSize: '0.65rem', fontWeight: 600 }}
                  />
                </Box>
              </AccordionSummary>

              <AccordionDetails sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {group.items.map((t) => (
                  <TranscriptCard
                    key={t.id}
                    transcript={t}
                    onClick={() => navigate(`/transcripts/${t.id}`)}
                    onDelete={() => setDeleteTarget(t)}
                  />
                ))}
              </AccordionDetails>
            </Accordion>
          )
        })}
      </Box>

      {/* Delete confirmation dialog */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete meeting notes?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            <strong>{deleteTarget?.event?.title ?? 'Untitled Recording'}</strong>
            {' '}will be permanently deleted, including the transcript and any generated synthesis. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleteMutation.isPending}
            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
          >
            {deleteMutation.isPending ? <CircularProgress size={16} color="inherit" /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function TranscriptCard({
  transcript: t,
  onClick,
  onDelete,
}: {
  transcript: Transcript
  onClick: () => void
  onDelete: () => void
}): React.ReactElement {
  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 2,
        '&:hover .delete-btn': { opacity: 1 },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'stretch' }}>
        <CardActionArea onClick={onClick} sx={{ flex: 1 }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" fontWeight={600} noWrap>
                  {t.event?.title ?? 'Untitled Recording'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Typography>
                {t.synthesis?.meetingSummary && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }} noWrap>
                    {t.synthesis.meetingSummary}
                  </Typography>
                )}
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5, flexShrink: 0 }}>
                {t.synthesis ? (
                  <Chip icon={<CheckCircle />} label="Synthesized" size="small" color="success" variant="outlined" />
                ) : (
                  <Chip icon={<Sync />} label="Pending" size="small" variant="outlined" />
                )}
                {t.synthesis?.pushedToConfluence && (
                  <Chip label="In Confluence" size="small" color="primary" variant="outlined" />
                )}
              </Box>
            </Box>
          </CardContent>
        </CardActionArea>

        {/* Delete button — fades in on card hover */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            pr: 0.5,
            borderLeft: 1,
            borderColor: 'divider',
          }}
        >
          <Tooltip title="Delete">
            <IconButton
              className="delete-btn"
              size="small"
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              sx={{ opacity: 0, transition: 'opacity 0.15s', color: 'text.secondary', '&:hover': { color: 'error.main' } }}
            >
              <DeleteOutline fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    </Card>
  )
}

function PendingCard({ pending }: { pending: PendingTranscription }): React.ReactElement {
  const startedAt = new Date(pending.startedAt)
  const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000)
  const elapsedStr = elapsed < 60 ? `${elapsed}s ago` : `${Math.floor(elapsed / 60)}m ago`

  return (
    <Card variant="outlined" sx={{ borderRadius: 2, borderColor: 'primary.light', opacity: 0.85 }}>
      <CardContent>
        <LinearProgress sx={{ mb: 1.5, borderRadius: 1 }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <GraphicEq sx={{ color: 'primary.main', fontSize: 20 }} />
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>
                {pending.event?.title ?? 'Untitled Recording'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Recording started {elapsedStr}
              </Typography>
            </Box>
          </Box>
          <Chip
            icon={<CircularProgress size={12} />}
            label="Transcribing…"
            size="small"
            color="primary"
            variant="outlined"
          />
        </Box>
      </CardContent>
    </Card>
  )
}
