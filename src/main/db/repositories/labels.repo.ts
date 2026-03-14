import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../index'
import type { Label, CreateLabelInput, UpdateLabelInput } from '../../../shared/types'

interface LabelRow {
  id: string
  name: string
  color: string
  confluence_space_key: string | null
  confluence_page_id: string | null
  confluence_page_name: string | null
  created_at: string
}

function rowToLabel(row: LabelRow): Label {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    confluenceSpaceKey: row.confluence_space_key,
    confluencePageId: row.confluence_page_id,
    confluencePageName: row.confluence_page_name,
    createdAt: row.created_at,
  }
}

export const labelsRepo = {
  list(): Label[] {
    const rows = getDb().prepare('SELECT * FROM labels ORDER BY name ASC').all() as LabelRow[]
    return rows.map(rowToLabel)
  },

  getById(id: string): Label | null {
    const row = getDb().prepare('SELECT * FROM labels WHERE id = ?').get(id) as LabelRow | undefined
    return row ? rowToLabel(row) : null
  },

  create(input: CreateLabelInput): Label {
    const id = uuidv4()
    getDb()
      .prepare(
        `INSERT INTO labels (id, name, color, confluence_space_key, confluence_page_id, confluence_page_name)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.name,
        input.color,
        input.confluenceSpaceKey ?? null,
        input.confluencePageId ?? null,
        input.confluencePageName ?? null
      )
    return this.getById(id)!
  },

  update(id: string, input: UpdateLabelInput): Label {
    const current = this.getById(id)
    if (!current) throw new Error(`Label not found: ${id}`)
    getDb()
      .prepare(
        `UPDATE labels SET name = ?, color = ?, confluence_space_key = ?, confluence_page_id = ?, confluence_page_name = ?
         WHERE id = ?`
      )
      .run(
        input.name ?? current.name,
        input.color ?? current.color,
        input.confluenceSpaceKey !== undefined ? input.confluenceSpaceKey : current.confluenceSpaceKey,
        input.confluencePageId !== undefined ? input.confluencePageId : current.confluencePageId,
        input.confluencePageName !== undefined ? input.confluencePageName : current.confluencePageName,
        id
      )
    return this.getById(id)!
  },

  delete(id: string): void {
    getDb().prepare('DELETE FROM labels WHERE id = ?').run(id)
  },
}
