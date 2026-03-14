import { getDb } from '../index'
import type { CalendarEvent, Attendee, Label } from '../../../shared/types'

interface EventRow {
  id: string
  calendar_id: string
  title: string
  description: string | null
  start_time: string
  end_time: string
  attendees: string | null
  raw_json: string
  last_synced: string
}

interface LabelRow {
  id: string
  name: string
  color: string
  confluence_space_key: string | null
  confluence_page_id: string | null
  created_at: string
}

function rowToLabel(row: LabelRow): Label {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    confluenceSpaceKey: row.confluence_space_key,
    confluencePageId: row.confluence_page_id,
    createdAt: row.created_at,
  }
}

function rowToEvent(row: EventRow, labels: Label[] = []): CalendarEvent {
  let location: string | null = null
  let conferenceUrl: string | null = null

  try {
    const raw = JSON.parse(row.raw_json) as {
      location?: string
      hangoutLink?: string
      conferenceData?: {
        entryPoints?: Array<{ entryPointType: string; uri: string }>
      }
    }
    location = raw.location ?? null
    // Prefer hangoutLink (Google Meet), fall back to conferenceData video entry point
    conferenceUrl =
      raw.hangoutLink ??
      raw.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')?.uri ??
      null
  } catch {
    // raw_json unparseable — leave location/conferenceUrl null
  }

  return {
    id: row.id,
    calendarId: row.calendar_id,
    title: row.title,
    description: row.description,
    startTime: row.start_time,
    endTime: row.end_time,
    attendees: row.attendees ? (JSON.parse(row.attendees) as Attendee[]) : [],
    labels,
    location,
    conferenceUrl,
  }
}

export const eventsRepo = {
  upsert(event: {
    id: string
    calendarId: string
    title: string
    description: string | null
    startTime: string
    endTime: string
    attendees: Attendee[]
    rawJson: string
  }): void {
    getDb()
      .prepare(
        `INSERT INTO calendar_events
           (id, calendar_id, title, description, start_time, end_time, attendees, raw_json, last_synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           description = excluded.description,
           start_time = excluded.start_time,
           end_time = excluded.end_time,
           attendees = excluded.attendees,
           raw_json = excluded.raw_json,
           last_synced = excluded.last_synced`
      )
      .run(
        event.id,
        event.calendarId,
        event.title,
        event.description,
        event.startTime,
        event.endTime,
        JSON.stringify(event.attendees),
        event.rawJson
      )
  },

  getById(id: string): CalendarEvent | null {
    const row = getDb()
      .prepare('SELECT * FROM calendar_events WHERE id = ?')
      .get(id) as EventRow | undefined
    if (!row) return null
    const labels = this.getLabelsForEvent(id)
    return rowToEvent(row, labels)
  },

  getLabelsForEvent(eventId: string): Label[] {
    const rows = getDb()
      .prepare(
        `SELECT l.* FROM labels l
         JOIN event_labels el ON el.label_id = l.id
         WHERE el.event_id = ?`
      )
      .all(eventId) as LabelRow[]
    return rows.map(rowToLabel)
  },

  listForDateRange(startTime: string, endTime: string): CalendarEvent[] {
    const rows = getDb()
      .prepare(
        `SELECT * FROM calendar_events
         WHERE start_time >= ? AND start_time < ?
         ORDER BY start_time ASC`
      )
      .all(startTime, endTime) as EventRow[]

    return rows.map((row) => rowToEvent(row, this.getLabelsForEvent(row.id)))
  },

  /** Remove events in a date range whose IDs are not in `keepIds` (deleted from calendar). */
  pruneForRange(startTime: string, endTime: string, keepIds: string[]): void {
    if (keepIds.length === 0) {
      // No events returned — remove all in range
      getDb()
        .prepare(
          `DELETE FROM calendar_events WHERE start_time >= ? AND start_time < ?`
        )
        .run(startTime, endTime)
      return
    }
    const placeholders = keepIds.map(() => '?').join(', ')
    getDb()
      .prepare(
        `DELETE FROM calendar_events
         WHERE start_time >= ? AND start_time < ?
           AND id NOT IN (${placeholders})`
      )
      .run(startTime, endTime, ...keepIds)
  },

  assignLabel(eventId: string, labelId: string): void {
    getDb()
      .prepare(
        `INSERT OR IGNORE INTO event_labels (event_id, label_id) VALUES (?, ?)`
      )
      .run(eventId, labelId)
  },

  removeLabel(eventId: string, labelId: string): void {
    getDb()
      .prepare('DELETE FROM event_labels WHERE event_id = ? AND label_id = ?')
      .run(eventId, labelId)
  },
}
