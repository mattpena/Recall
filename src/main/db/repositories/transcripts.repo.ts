import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../index'
import type { Transcript } from '../../../shared/types'
import { eventsRepo } from './events.repo'
import { recordingsRepo } from './recordings.repo'
import { synthesisRepo } from './synthesis.repo'

interface TranscriptRow {
  id: string
  recording_id: string
  raw_text: string
  language: string | null
  created_at: string
}

function rowToTranscript(row: TranscriptRow): Transcript {
  return {
    id: row.id,
    recordingId: row.recording_id,
    rawText: row.raw_text,
    language: row.language,
    createdAt: row.created_at,
  }
}

export const transcriptsRepo = {
  create(input: { recordingId: string; rawText: string; language?: string }): Transcript {
    const id = uuidv4()
    getDb()
      .prepare(
        `INSERT INTO transcripts (id, recording_id, raw_text, language)
         VALUES (?, ?, ?, ?)`
      )
      .run(id, input.recordingId, input.rawText, input.language ?? null)
    return this.getById(id)!
  },

  getById(id: string, withRelations = false): Transcript | null {
    const row = getDb()
      .prepare('SELECT * FROM transcripts WHERE id = ?')
      .get(id) as TranscriptRow | undefined
    if (!row) return null
    const transcript = rowToTranscript(row)
    if (withRelations) {
      const recording = recordingsRepo.getById(row.recording_id)
      transcript.recording = recording ?? undefined
      if (recording?.eventId) {
        const event = eventsRepo.getById(recording.eventId)
        transcript.event = event ?? undefined
      }
      const synthesis = synthesisRepo.getByTranscriptId(id)
      transcript.synthesis = synthesis ?? undefined
    }
    return transcript
  },

  getByRecordingId(recordingId: string): Transcript | null {
    const row = getDb()
      .prepare('SELECT * FROM transcripts WHERE recording_id = ?')
      .get(recordingId) as TranscriptRow | undefined
    return row ? rowToTranscript(row) : null
  },

  delete(id: string): void {
    getDb().prepare('DELETE FROM transcripts WHERE id = ?').run(id)
  },

  list(): Transcript[] {
    const rows = getDb()
      .prepare('SELECT * FROM transcripts ORDER BY created_at DESC')
      .all() as TranscriptRow[]
    return rows.map((row) => {
      const t = rowToTranscript(row)
      const recording = recordingsRepo.getById(row.recording_id)
      t.recording = recording ?? undefined
      if (recording?.eventId) {
        const event = eventsRepo.getById(recording.eventId)
        t.event = event ?? undefined
      }
      const synthesis = synthesisRepo.getByTranscriptId(row.id)
      t.synthesis = synthesis ?? undefined
      return t
    })
  },
}
