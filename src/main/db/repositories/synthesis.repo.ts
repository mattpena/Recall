import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../index'
import type { Synthesis } from '../../../shared/types'

interface SynthesisRow {
  id: string
  transcript_id: string
  meeting_summary: string | null
  attendees_summary: string | null
  discussion: string | null
  key_insights: string | null
  next_steps: string | null
  notes: string | null
  pushed_to_confluence: number
  confluence_url: string | null
  created_at: string
}

function rowToSynthesis(row: SynthesisRow): Synthesis {
  return {
    id: row.id,
    transcriptId: row.transcript_id,
    meetingSummary: row.meeting_summary,
    attendeesSummary: row.attendees_summary,
    discussion: row.discussion,
    keyDecisions: row.key_insights ? JSON.parse(row.key_insights) : [],
    nextSteps: row.next_steps ? JSON.parse(row.next_steps) : [],
    notes: row.notes,
    pushedToConfluence: row.pushed_to_confluence === 1,
    confluenceUrl: row.confluence_url,
    createdAt: row.created_at,
  }
}

export const synthesisRepo = {
  create(input: {
    transcriptId: string
    meetingSummary: string
    attendeesSummary: string
    discussion: string
    keyDecisions: string[]
    nextSteps: string[]
    notes?: string
  }): Synthesis {
    const id = uuidv4()
    getDb()
      .prepare(
        `INSERT INTO synthesis
           (id, transcript_id, meeting_summary, attendees_summary, discussion, key_insights, next_steps, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.transcriptId,
        input.meetingSummary,
        input.attendeesSummary,
        input.discussion,
        JSON.stringify(input.keyDecisions),
        JSON.stringify(input.nextSteps),
        input.notes ?? null
      )
    return this.getById(id)!
  },

  getById(id: string): Synthesis | null {
    const row = getDb()
      .prepare('SELECT * FROM synthesis WHERE id = ?')
      .get(id) as SynthesisRow | undefined
    return row ? rowToSynthesis(row) : null
  },

  getByTranscriptId(transcriptId: string): Synthesis | null {
    const row = getDb()
      .prepare('SELECT * FROM synthesis WHERE transcript_id = ?')
      .get(transcriptId) as SynthesisRow | undefined
    return row ? rowToSynthesis(row) : null
  },

  updateNotes(id: string, notes: string): void {
    getDb()
      .prepare('UPDATE synthesis SET notes = ? WHERE id = ?')
      .run(notes || null, id)
  },

  markPushed(id: string, confluenceUrl: string): void {
    getDb()
      .prepare(
        'UPDATE synthesis SET pushed_to_confluence = 1, confluence_url = ? WHERE id = ?'
      )
      .run(confluenceUrl, id)
  },
}
