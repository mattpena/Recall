CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS labels (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL UNIQUE,
  color                 TEXT NOT NULL DEFAULT '#1976d2',
  confluence_space_key  TEXT,
  confluence_page_id    TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id           TEXT PRIMARY KEY,
  calendar_id  TEXT NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  start_time   TEXT NOT NULL,
  end_time     TEXT NOT NULL,
  attendees    TEXT,
  raw_json     TEXT NOT NULL,
  last_synced  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_labels (
  event_id  TEXT NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  label_id  TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, label_id)
);

CREATE TABLE IF NOT EXISTS recordings (
  id          TEXT PRIMARY KEY,
  event_id    TEXT REFERENCES calendar_events(id) ON DELETE SET NULL,
  file_path   TEXT NOT NULL,
  duration_ms INTEGER,
  started_at  TEXT NOT NULL,
  ended_at    TEXT,
  status      TEXT NOT NULL DEFAULT 'recording'
              CHECK(status IN ('recording', 'stopped', 'transcribing', 'done', 'error'))
);

CREATE TABLE IF NOT EXISTS transcripts (
  id           TEXT PRIMARY KEY,
  recording_id TEXT NOT NULL UNIQUE REFERENCES recordings(id) ON DELETE CASCADE,
  raw_text     TEXT NOT NULL,
  language     TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS synthesis (
  id                    TEXT PRIMARY KEY,
  transcript_id         TEXT NOT NULL UNIQUE REFERENCES transcripts(id) ON DELETE CASCADE,
  meeting_summary       TEXT,
  attendees_summary     TEXT,
  discussion            TEXT,
  key_insights          TEXT,
  next_steps            TEXT,
  pushed_to_confluence  INTEGER NOT NULL DEFAULT 0,
  confluence_url        TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_recordings_event     ON recordings(event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_transcripts_recording ON transcripts(recording_id);
CREATE INDEX IF NOT EXISTS idx_synthesis_transcript  ON synthesis(transcript_id);
