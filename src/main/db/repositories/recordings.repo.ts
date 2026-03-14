import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../index'
import type { Recording } from '../../../shared/types'

interface RecordingRow {
  id: string
  event_id: string | null
  file_path: string
  duration_ms: number | null
  started_at: string
  ended_at: string | null
  status: string
}

function rowToRecording(row: RecordingRow): Recording {
  return {
    id: row.id,
    eventId: row.event_id,
    filePath: row.file_path,
    durationMs: row.duration_ms,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status as Recording['status'],
  }
}

export const recordingsRepo = {
  create(input: { eventId: string | null; filePath: string }): Recording {
    const id = uuidv4()
    const startedAt = new Date().toISOString()
    getDb()
      .prepare(
        `INSERT INTO recordings (id, event_id, file_path, started_at, status)
         VALUES (?, ?, ?, ?, 'recording')`
      )
      .run(id, input.eventId, input.filePath, startedAt)
    return this.getById(id)!
  },

  getById(id: string): Recording | null {
    const row = getDb()
      .prepare('SELECT * FROM recordings WHERE id = ?')
      .get(id) as RecordingRow | undefined
    return row ? rowToRecording(row) : null
  },

  listTranscribing(): Recording[] {
    const rows = getDb()
      .prepare("SELECT * FROM recordings WHERE status = 'transcribing' ORDER BY started_at DESC")
      .all() as RecordingRow[]
    return rows.map(rowToRecording)
  },

  /** Return all recordings that have an audio file on disk (any status except active recording). */
  listAllWithAudio(): Recording[] {
    const rows = getDb()
      .prepare(
        `SELECT * FROM recordings
         WHERE status IN ('done', 'error', 'transcribing') AND file_path IS NOT NULL
         ORDER BY started_at ASC`
      )
      .all() as RecordingRow[]
    return rows.map(rowToRecording)
  },

  /** Return done/error recordings whose started_at is before the cutoff date */
  listOlderThan(cutoff: Date): Recording[] {
    const rows = getDb()
      .prepare(
        `SELECT * FROM recordings
         WHERE started_at < ? AND status IN ('done', 'error') AND file_path IS NOT NULL
         ORDER BY started_at ASC`
      )
      .all(cutoff.toISOString()) as RecordingRow[]
    return rows.map(rowToRecording)
  },

  updateStatus(
    id: string,
    status: Recording['status'],
    extra?: { endedAt?: string; durationMs?: number }
  ): void {
    if (extra?.endedAt !== undefined || extra?.durationMs !== undefined) {
      getDb()
        .prepare(
          `UPDATE recordings SET status = ?, ended_at = COALESCE(?, ended_at), duration_ms = COALESCE(?, duration_ms)
           WHERE id = ?`
        )
        .run(status, extra?.endedAt ?? null, extra?.durationMs ?? null, id)
    } else {
      getDb().prepare('UPDATE recordings SET status = ? WHERE id = ?').run(status, id)
    }
  },
}
