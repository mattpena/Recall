import React, { useState, useMemo } from 'react'
import {
  Box, Typography, Button, Card, CardContent, IconButton, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Grid, Alert, CircularProgress, InputAdornment, List, ListItemButton,
  ListItemText, Collapse,
} from '@mui/material'
import {
  Add, Edit, Delete, Search, ChevronRight, ExpandMore as ExpandMoreIcon, Clear, Folder, Article,
} from '@mui/icons-material'
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

// ── Tree browser ─────────────────────────────────────────────────────────────

interface PageTreeNodeProps {
  page: ConfluencePage
  allPages: ConfluencePage[]
  depth: number
  selectedId: string
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
  onSelect: (page: ConfluencePage) => void
}

function PageTreeNode({
  page, allPages, depth, selectedId, expandedIds, onToggleExpand, onSelect,
}: PageTreeNodeProps): React.ReactElement {
  const children = allPages.filter((p) => p.parentId === page.id)
  const hasChildren = children.length > 0
  const isExpanded = expandedIds.has(page.id)
  const isSelected = selectedId === page.id

  return (
    <>
      <ListItemButton
        selected={isSelected}
        onClick={() => onSelect(page)}
        dense
        sx={{ pl: 1 + depth * 2, pr: 1, py: 0.25, borderRadius: 0.5 }}
      >
        {/* Expand/collapse toggle */}
        <Box
          onClick={(e) => {
            if (!hasChildren) return
            e.stopPropagation()
            onToggleExpand(page.id)
          }}
          sx={{
            width: 20,
            height: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            cursor: hasChildren ? 'pointer' : 'default',
            mr: 0.5,
            color: 'text.secondary',
            '&:hover': hasChildren ? { color: 'primary.main' } : {},
          }}
        >
          {hasChildren ? (
            isExpanded
              ? <ExpandMoreIcon sx={{ fontSize: 16 }} />
              : <ChevronRight sx={{ fontSize: 16 }} />
          ) : (
            <Box sx={{ width: 16 }} />
          )}
        </Box>

        {(page.isFolder || hasChildren)
          ? <Folder sx={{ fontSize: 15, color: 'warning.main', mr: 0.75, flexShrink: 0 }} />
          : <Article sx={{ fontSize: 15, color: 'text.disabled', mr: 0.75, flexShrink: 0 }} />
        }

        <ListItemText
          primary={page.title}
          primaryTypographyProps={{ variant: 'body2', noWrap: true }}
        />
      </ListItemButton>

      {hasChildren && (
        <Collapse in={isExpanded} unmountOnExit>
          {children
            .slice()
            .sort((a, b) => a.title.localeCompare(b.title))
            .map((child) => (
              <PageTreeNode
                key={child.id}
                page={child}
                allPages={allPages}
                depth={depth + 1}
                selectedId={selectedId}
                expandedIds={expandedIds}
                onToggleExpand={onToggleExpand}
                onSelect={onSelect}
              />
            ))}
        </Collapse>
      )}
    </>
  )
}

interface PageTreeBrowserProps {
  pages: ConfluencePage[]
  selectedId: string
  onSelect: (page: ConfluencePage | null) => void
}

function PageTreeBrowser({ pages, selectedId, onSelect }: PageTreeBrowserProps): React.ReactElement {
  const [search, setSearch] = useState('')

  // Root pages: those whose parentId doesn't match any page in the list
  // (handles both null parentId and pages where the parent is the space root)
  const pageIds = useMemo(() => new Set(pages.map((p) => p.id)), [pages])
  const rootPages = useMemo(
    () => pages.filter((p) => !p.parentId || !pageIds.has(p.parentId)),
    [pages, pageIds]
  )

  // Start fully expanded so the complete tree is visible — user can collapse sections as needed
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(pages.map((p) => p.id))
  )

  function toggleExpand(id: string): void {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // When searching, show a filtered flat list with paths instead of the tree
  const searchTerm = search.toLowerCase().trim()
  const filteredPages = searchTerm
    ? pages.filter(
        (p) =>
          p.title.toLowerCase().includes(searchTerm) ||
          p.path.toLowerCase().includes(searchTerm)
      )
    : null

  const selectedPage = pages.find((p) => p.id === selectedId)

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
      {/* Search bar */}
      <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider' }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Search pages…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ fontSize: 16, color: 'text.secondary' }} />
              </InputAdornment>
            ),
            endAdornment: search ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearch('')}>
                  <Clear sx={{ fontSize: 14 }} />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          }}
          sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.8125rem' } }}
        />
      </Box>

      {/* Selected page indicator */}
      {selectedPage && (
        <Box
          sx={{
            px: 1.5, py: 0.75,
            borderBottom: 1, borderColor: 'divider',
            bgcolor: 'primary.50',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="primary.main" fontWeight={600}>
              Selected:
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', fontSize: '0.7rem' }}>
              {selectedPage.path}
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => onSelect(null)} sx={{ ml: 1, flexShrink: 0 }}>
            <Clear sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>
      )}

      {/* Tree or search results */}
      <List
        dense
        disablePadding
        sx={{ maxHeight: 280, overflowY: 'auto', py: 0.5 }}
      >
        {filteredPages ? (
          filteredPages.length === 0 ? (
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography variant="body2" color="text.secondary">No matching pages</Typography>
            </Box>
          ) : (
            filteredPages
              .slice()
              .sort((a, b) => a.path.localeCompare(b.path))
              .map((page) => (
                <ListItemButton
                  key={page.id}
                  selected={selectedId === page.id}
                  onClick={() => onSelect(page)}
                  dense
                  sx={{ px: 1.5, py: 0.25, borderRadius: 0.5 }}
                >
                  <ListItemText
                    primary={page.title}
                    secondary={page.path !== page.title ? page.path : undefined}
                    primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                    secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
                  />
                </ListItemButton>
              ))
          )
        ) : (
          rootPages
            .slice()
            .sort((a, b) => a.title.localeCompare(b.title))
            .map((page) => (
              <PageTreeNode
                key={page.id}
                page={page}
                allPages={pages}
                depth={0}
                selectedId={selectedId}
                expandedIds={expandedIds}
                onToggleExpand={toggleExpand}
                onSelect={onSelect}
              />
            ))
        )}
      </List>
    </Box>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

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

  function handleSelectPage(page: ConfluencePage | null): void {
    setForm((f) => ({
      ...f,
      confluencePageId: page?.id ?? '',
      confluencePageName: page?.title ?? '',
    }))
  }

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
                      <Typography variant="body2" noWrap title={label.confluencePageName || label.confluencePageId}>
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

          {/* Tree browser — shown once pages are loaded */}
          {pagesBrowsed && (
            pages.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No pages found in this space.
              </Typography>
            ) : (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  {pages.length} pages — click to select a parent location. Use{' '}
                  <strong>▶</strong> to expand sections.
                </Typography>
                <PageTreeBrowser
                  pages={pages}
                  selectedId={form.confluencePageId}
                  onSelect={handleSelectPage}
                />
              </Box>
            )
          )}

          {/* If a page was previously saved but not yet browsed, show it */}
          {!pagesBrowsed && form.confluencePageId && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Currently set to: <strong>{form.confluencePageName || form.confluencePageId}</strong>
              </Typography>
              <Button
                size="small"
                variant="text"
                color="error"
                onClick={() => handleSelectPage(null)}
              >
                Clear
              </Button>
            </Box>
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
