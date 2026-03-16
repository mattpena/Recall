import React, { useState } from 'react'
import {
  Box, Typography, Chip, Button, CircularProgress, Select, MenuItem,
  FormControl, InputLabel, Divider, Alert, Tooltip, IconButton, ListSubheader,
} from '@mui/material'
import { OpenInNew, AutoAwesome, Add, Tag, Forum, CheckCircle } from '@mui/icons-material'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Transcript, Label, SlackChannel, SlackUser } from '../../../shared/types'

interface Props {
  transcript: Transcript
  transcriptId: string
  synthesisPending: boolean
  onSynthesize: () => void
  onPushToConfluence: () => void
  pushPending: boolean
  pushError: Error | null
  synthesizeError: string | null
}

export default function ActionsPanel({
  transcript,
  transcriptId,
  synthesisPending,
  onSynthesize,
  onPushToConfluence,
  pushPending,
  pushError,
  synthesizeError,
}: Props): React.ReactElement {
  const queryClient = useQueryClient()
  const { synthesis, event } = transcript

  // ── Labels ────────────────────────────────────────────────────────────────
  const { data: allLabels = [] } = useQuery<Label[]>({
    queryKey: ['labels'],
    queryFn: () => window.electron.labels.list(),
  })

  const assignedIds = new Set((event?.labels ?? []).map((l) => l.id))
  const unassignedLabels = allLabels.filter((l) => !assignedIds.has(l.id))

  const assignMutation = useMutation({
    mutationFn: (labelId: string) =>
      window.electron.calendar.assignLabel(event!.id, labelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transcripts', transcriptId] })
    },
  })

  const removeMutation = useMutation({
    mutationFn: (labelId: string) =>
      window.electron.calendar.removeLabel(event!.id, labelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transcripts', transcriptId] })
    },
  })

  // ── Slack ─────────────────────────────────────────────────────────────────
  const { data: slackStatus } = useQuery({
    queryKey: ['slack:status'],
    queryFn: () => window.electron.slack.getStatus(),
    staleTime: 30_000,
  })

  const { data: slackChannels = [] } = useQuery<SlackChannel[]>({
    queryKey: ['slack:channels'],
    queryFn: () => window.electron.slack.getChannels(),
    enabled: Boolean(slackStatus?.connected && synthesis),
    staleTime: 60_000,
  })

  const { data: slackUsers = [] } = useQuery<SlackUser[]>({
    queryKey: ['slack:users'],
    queryFn: () => window.electron.slack.getUsers(),
    enabled: Boolean(slackStatus?.connected && synthesis),
    staleTime: 60_000,
  })

  const [selectedTarget, setSelectedTarget] = useState('')
  // Track each send as { label, success/error } so the UI stays unlocked
  const [sendHistory, setSendHistory] = useState<{ label: string; ok: boolean }[]>([])

  function labelForTarget(id: string): string {
    const ch = slackChannels.find((c) => c.id === id)
    if (ch) return `#${ch.name}`
    const u = slackUsers.find((u) => u.id === id)
    if (u) return `@${u.name || u.realName}`
    return id
  }

  const slackMutation = useMutation({
    mutationFn: () => {
      const title = event?.title ?? 'Meeting'
      const lines: string[] = [`📋 *${title}*`]
      if (synthesis?.meetingSummary) lines.push(synthesis.meetingSummary)
      if (synthesis?.nextSteps?.length) {
        lines.push('*Next Steps:*')
        synthesis.nextSteps.forEach((s) => lines.push(`• ${s}`))
      }
      if (synthesis?.confluenceUrl) lines.push(`_Full notes: ${synthesis.confluenceUrl}_`)
      return window.electron.slack.postMessage(selectedTarget, lines.join('\n'))
    },
    onSuccess: () => {
      setSendHistory((h) => [...h, { label: labelForTarget(selectedTarget), ok: true }])
      slackMutation.reset()
    },
    onError: (err: Error) => {
      setSendHistory((h) => [...h, { label: labelForTarget(selectedTarget), ok: false }])
      console.error(err)
    },
  })

  const showSlack = slackStatus?.connected && Boolean(synthesis)

  return (
    <Box
      sx={{
        width: 260,
        flexShrink: 0,
        position: 'sticky',
        top: 24,
        alignSelf: 'flex-start',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      {/* ── Labels section ─────────────────────────────────────────────── */}
      {event && (
        <>
          <Box sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
              <Tag sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="subtitle2" fontWeight={600} color="text.secondary">
                Labels
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
              {(event.labels ?? []).length === 0 && (
                <Typography variant="caption" color="text.disabled">No labels</Typography>
              )}
              {(event.labels ?? []).map((label) => (
                <Chip
                  key={label.id}
                  label={label.name}
                  size="small"
                  onDelete={() => removeMutation.mutate(label.id)}
                  sx={{
                    bgcolor: label.color,
                    color: getContrastColor(label.color),
                    '& .MuiChip-deleteIcon': { color: getContrastColor(label.color) },
                    height: 22,
                    fontSize: '0.7rem',
                  }}
                />
              ))}
            </Box>

            {unassignedLabels.length > 0 && (
              <FormControl size="small" fullWidth>
                <InputLabel sx={{ fontSize: '0.75rem' }}>Add label…</InputLabel>
                <Select
                  value=""
                  label="Add label…"
                  onChange={(e) => {
                    if (e.target.value) assignMutation.mutate(e.target.value as string)
                  }}
                  sx={{ fontSize: '0.8rem' }}
                  startAdornment={<Add sx={{ fontSize: 16, mr: 0.5, color: 'text.secondary' }} />}
                >
                  {unassignedLabels.map((label) => (
                    <MenuItem key={label.id} value={label.id} sx={{ fontSize: '0.85rem' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box
                          sx={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            bgcolor: label.color,
                            flexShrink: 0,
                          }}
                        />
                        {label.name}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Box>
          <Divider />
        </>
      )}

      {/* ── Publish section ─────────────────────────────────────────────── */}
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
          <OpenInNew sx={{ fontSize: 16, color: 'text.secondary' }} />
          <Typography variant="subtitle2" fontWeight={600} color="text.secondary">
            Publish
          </Typography>
        </Box>

        {synthesis ? (
          <>
            {synthesis.pushedToConfluence ? (
              <Chip
                label="Published to Confluence"
                color="success"
                size="small"
                icon={<OpenInNew sx={{ fontSize: '14px !important' }} />}
                onClick={() => synthesis.confluenceUrl && window.open(synthesis.confluenceUrl)}
                clickable={Boolean(synthesis.confluenceUrl)}
                sx={{ mb: 1, fontSize: '0.75rem', height: 24 }}
              />
            ) : (
              <Button
                variant="outlined"
                size="small"
                fullWidth
                onClick={onPushToConfluence}
                disabled={pushPending}
                startIcon={pushPending ? <CircularProgress size={12} /> : <OpenInNew sx={{ fontSize: 14 }} />}
                sx={{ mb: 1, fontSize: '0.75rem' }}
              >
                Push to Confluence
              </Button>
            )}

            {pushError && (
              <Alert severity="error" sx={{ mb: 1, fontSize: '0.72rem', py: 0.5 }}>
                {(pushError as Error).message}
              </Alert>
            )}

            <Tooltip title="Re-run AI synthesis">
              <Button
                variant="text"
                size="small"
                fullWidth
                onClick={onSynthesize}
                disabled={synthesisPending}
                startIcon={
                  synthesisPending
                    ? <CircularProgress size={12} color="inherit" />
                    : <AutoAwesome sx={{ fontSize: 14 }} />
                }
                sx={{ color: 'text.secondary', fontSize: '0.72rem', justifyContent: 'flex-start' }}
              >
                Regenerate notes
              </Button>
            </Tooltip>

            {synthesizeError && (
              <Alert severity="error" sx={{ mt: 0.5, fontSize: '0.72rem', py: 0.5 }}>
                {synthesizeError}
              </Alert>
            )}
          </>
        ) : (
          <Typography variant="caption" color="text.disabled">
            Available after synthesis
          </Typography>
        )}
      </Box>

      {/* ── Slack section ────────────────────────────────────────────────── */}
      {showSlack && (
        <>
          <Divider />
          <Box sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
              <Forum sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="subtitle2" fontWeight={600} color="text.secondary">
                Share to Slack
              </Typography>
            </Box>

            <FormControl size="small" fullWidth sx={{ mb: 1 }}>
              <InputLabel sx={{ fontSize: '0.75rem' }}>Channel or person…</InputLabel>
              <Select
                value={selectedTarget}
                label="Channel or person…"
                onChange={(e) => setSelectedTarget(e.target.value as string)}
                sx={{ fontSize: '0.8rem' }}
              >
                {slackChannels.length > 0 && (
                  <ListSubheader sx={{ fontSize: '0.7rem', lineHeight: '28px' }}>
                    Channels
                  </ListSubheader>
                )}
                {slackChannels.map((ch) => (
                  <MenuItem key={ch.id} value={ch.id} sx={{ fontSize: '0.85rem' }}>
                    #{ch.name}
                  </MenuItem>
                ))}
                {slackUsers.length > 0 && (
                  <ListSubheader sx={{ fontSize: '0.7rem', lineHeight: '28px' }}>
                    People
                  </ListSubheader>
                )}
                {slackUsers.map((u) => (
                  <MenuItem key={u.id} value={u.id} sx={{ fontSize: '0.85rem' }}>
                    @{u.name || u.realName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {slackMutation.error && (
              <Alert severity="error" sx={{ mb: 1, fontSize: '0.72rem', py: 0.5 }}>
                {(slackMutation.error as Error).message}
              </Alert>
            )}

            <Button
              variant="outlined"
              size="small"
              fullWidth
              onClick={() => slackMutation.mutate()}
              disabled={!selectedTarget || slackMutation.isPending}
              startIcon={slackMutation.isPending ? <CircularProgress size={12} /> : <Forum sx={{ fontSize: 14 }} />}
              sx={{ fontSize: '0.75rem' }}
            >
              {slackMutation.isPending ? 'Sending…' : 'Send'}
            </Button>

            {/* Send history — stays visible so the user can see what was sent */}
            {sendHistory.length > 0 && (
              <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {sendHistory.map((entry, i) => (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <CheckCircle sx={{ fontSize: 12, color: entry.ok ? 'success.main' : 'error.main' }} />
                    <Typography variant="caption" color={entry.ok ? 'success.main' : 'error.main'}>
                      {entry.ok ? `Sent to ${entry.label}` : `Failed: ${entry.label}`}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </>
      )}
    </Box>
  )
}

// Returns black or white based on background luminance
function getContrastColor(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  // WCAG relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#000000' : '#ffffff'
}
