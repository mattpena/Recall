import React, { useState } from 'react'
import {
  Box, Typography, Button, Card, CardContent, IconButton, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Grid, Alert, CircularProgress,
} from '@mui/material'
import { Autocomplete } from '@mui/material'
import { Add, Edit, Delete, Search } from '@mui/icons-material'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ConfluencePage, CreateLabelInput, Label } from '../../../shared/types'

const PRESET_COLORS = [
  '#1976d2', '#388e3c', '#f57c00', '#7b1fa2', '#c62828',
  '#00838f', '#558b2f', '#e64a19', '#5c6bc0', '#00695c',
]

interface LabelFormData {
  name: string
  color: string
  confluenceSpaceKey: string
  confluencePageId: string
  confluencePageName: string
}

const emptyForm: LabelFormData = {
  name: '',
  color: PRESET_COLORS[0],
  confluenceSpaceKey: '',
  confluencePageId: '',
  confluencePageName: '',
}

export default function Labels(): React.ReactElement {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingLabel, setEditingLabel] = useState<Label | null>(null)
  const [form, setForm] = useState<LabelFormData>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)

  // Confluence page picker state
  const [pages, setPages] = useState<ConfluencePage[]>([])
  const [pagesLoading, setPagesLoading] = useState(false)
  const [pagesError, setPagesError] = useState<string | null>(null)
  const [pagesBrowsed, setPagesBrowsed] = useState(false)

  const queryClient = useQueryClient()

  const { data: labels, isLoading } = useQuery<Label[]>({
    queryKey: ['labels'],
    queryFn: () => window.electron.labels.list(),
  })

  const createMutation = useMutation({
    mutationFn: (input: CreateLabelInput) => window.electron.labels.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels'] })
      handleClose()
    },
    onError: (err) => setFormError((err as Error).message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateLabelInput }) =>
      window.electron.labels.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels'] })
      handleClose()
    },
    onError: (err) => setFormError((err as Error).message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => window.electron.labels.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['labels'] }),
  })

  function openCreate(): void {
    setEditingLabel(null)
    setForm(emptyForm)
    setFormError(null)
    resetPagePicker()
    setDialogOpen(true)
  }

  function openEdit(label: Label): void {
    setEditingLabel(label)
    setForm({
      name: label.name,
      color: label.color,
      confluenceSpaceKey: label.confluenceSpaceKey ?? '',
      confluencePageId: label.confluencePageId ?? '',
      confluencePageName: label.confluencePageName ?? '',
    })
    setFormError(null)
    resetPagePicker()
    setDialogOpen(true)
  }

  function handleClose(): void {
    setDialogOpen(false)
    setEditingLabel(null)
    setForm(emptyForm)
    setFormError(null)
    resetPagePicker()
  }

  function resetPagePicker(): void {
    setPages([])
    setPagesLoading(false)
    setPagesError(null)
    setPagesBrowsed(false)
  }

  async function handleBrowsePages(): Promise<void> {
    const key = form.confluenceSpaceKey.trim()
    if (!key) return
    setPagesLoading(true)
    setPagesError(null)
    setPagesBrowsed(false)
    setPages([])
    try {
      const result = await window.electron.confluence.getSpacePages(key)
      setPages(result)
      setPagesBrowsed(true)
    } catch (err) {
      setPagesError((err as Error).message)
    } finally {
      setPagesLoading(false)
    }
  }

  function handleSubmit(): void {
    if (!form.name.trim()) {
      setFormError('Label name is required')
      return
    }
    const input: CreateLabelInput = {
      name: form.name.trim(),
      color: form.color,
      confluenceSpaceKey: form.confluenceSpaceKey.trim() || undefined,
      confluencePageId: form.confluencePageId.trim() || undefined,
      confluencePageName: form.confluencePageName.trim() || undefined,
    }
    if (editingLabel) {
      updateMutation.mutate({ id: editingLabel.id, input })
    } else {
      createMutation.mutate(input)
    }
  }

  // The currently selected page object (for Autocomplete value)
  const selectedPage: ConfluencePage | null =
    form.confluencePageId
      ? (pages.find((p) => p.id === form.confluencePageId) ?? {
          id: form.confluencePageId,
          title: form.confluencePageName || form.confluencePageId,
        })
      : null

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={600}>Project Labels</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={openCreate}>
          New Label
        </Button>
      </Box>

      {isLoading && <CircularProgress />}

      {labels && labels.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="text.secondary">No project labels yet</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Create labels to classify your meetings and link them to Confluence spaces
          </Typography>
          <Button variant="outlined" startIcon={<Add />} onClick={openCreate}>
            Create your first label
          </Button>
        </Box>
      )}

      <Grid container spacing={2}>
        {labels?.map((label) => (
          <Grid item xs={12} sm={6} md={4} key={label.id}>
            <Card variant="outlined" sx={{ borderRadius: 2 }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Chip
                    label={label.name}
                    sx={{
                      backgroundColor: label.color + '22',
                      color: label.color,
                      border: `1px solid ${label.color}`,
                      fontWeight: 600,
                    }}
                  />
                  <Box>
                    <IconButton size="small" onClick={() => openEdit(label)}>
                      <Edit fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => deleteMutation.mutate(label.id)}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>

                {label.confluenceSpaceKey && (
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">Confluence</Typography>
                    <Typography variant="body2" noWrap>
                      Space: <strong>{label.confluenceSpaceKey}</strong>
                    </Typography>
                    {(label.confluencePageName || label.confluencePageId) && (
                      <Typography variant="body2" noWrap>
                        Parent: <strong>{label.confluencePageName || label.confluencePageId}</strong>
                      </Typography>
                    )}
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>{editingLabel ? 'Edit Label' : 'New Label'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          {formError && <Alert severity="error">{formError}</Alert>}

          <TextField
            label="Label name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            fullWidth
            autoFocus
          />

          <Box>
            <Typography variant="body2" gutterBottom>Color</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {PRESET_COLORS.map((color) => (
                <Box
                  key={color}
                  onClick={() => setForm((f) => ({ ...f, color }))}
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    bgcolor: color,
                    cursor: 'pointer',
                    border: form.color === color ? '3px solid #333' : '3px solid transparent',
                    outline: form.color === color ? `2px solid ${color}` : 'none',
                  }}
                />
              ))}
            </Box>
          </Box>

          <Typography variant="subtitle2" sx={{ mt: 1 }}>
            Confluence Destination (optional)
          </Typography>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              label="Space Key"
              placeholder="e.g. ENG"
              value={form.confluenceSpaceKey}
              onChange={(e) => {
                setForm((f) => ({ ...f, confluenceSpaceKey: e.target.value }))
                resetPagePicker()
              }}
              size="small"
              sx={{ flex: 1 }}
            />
            <Button
              variant="outlined"
              size="small"
              onClick={handleBrowsePages}
              disabled={!form.confluenceSpaceKey.trim() || pagesLoading}
              startIcon={pagesLoading ? <CircularProgress size={14} /> : <Search />}
              sx={{ whiteSpace: 'nowrap' }}
            >
              {pagesLoading ? 'Loading…' : 'Browse Pages'}
            </Button>
          </Box>

          {pagesError && (
            <Alert severity="error" sx={{ py: 0.5 }}>{pagesError}</Alert>
          )}

          {/* Page autocomplete — shown once pages are loaded or if we have a saved page */}
          {(pagesBrowsed || form.confluencePageId) && (
            pages.length === 0 && pagesBrowsed ? (
              <Typography variant="body2" color="text.secondary">
                No pages found in this space.
              </Typography>
            ) : (
              <Autocomplete<ConfluencePage>
                options={pages}
                getOptionLabel={(option) => option.title}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                value={selectedPage}
                onChange={(_, newValue) => {
                  setForm((f) => ({
                    ...f,
                    confluencePageId: newValue?.id ?? '',
                    confluencePageName: newValue?.title ?? '',
                  }))
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Parent Page"
                    placeholder="Search pages…"
                    size="small"
                    helperText={
                      pages.length > 0
                        ? `${pages.length} pages loaded — type to filter`
                        : 'Browse pages first to select a parent'
                    }
                  />
                )}
                noOptionsText="No matching pages"
                clearOnEscape
                size="small"
              />
            )
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={isSaving}
            startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {isSaving ? 'Saving…' : editingLabel ? 'Save Changes' : 'Create Label'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
