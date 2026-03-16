// Shared types used by both main and renderer processes

export interface Label {
  id: string
  name: string
  color: string
  confluenceSpaceKey: string | null
  confluencePageId: string | null
  confluencePageName: string | null
  createdAt: string
}

export interface CalendarEvent {
  id: string
  calendarId: string
  title: string
  description: string | null
  startTime: string
  endTime: string
  attendees: Attendee[]
  labels: Label[]
  location: string | null
  conferenceUrl: string | null
}

export interface Attendee {
  name: string | null
  email: string
  self?: boolean
}

export interface Recording {
  id: string
  eventId: string | null
  filePath: string
  durationMs: number | null
  startedAt: string
  endedAt: string | null
  status: 'recording' | 'stopped' | 'transcribing' | 'done' | 'error'
}

export interface Transcript {
  id: string
  recordingId: string
  rawText: string
  language: string | null
  createdAt: string
  recording?: Recording
  event?: CalendarEvent
  synthesis?: Synthesis
}

export interface Synthesis {
  id: string
  transcriptId: string
  meetingSummary: string | null
  attendeesSummary: string | null
  discussion: string | null
  keyDecisions: string[]
  nextSteps: string[]
  notes: string | null
  pushedToConfluence: boolean
  confluenceUrl: string | null
  createdAt: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AuthStatus {
  isSignedIn: boolean
  userEmail: string | null
  userName: string | null
}

export interface AppSettings {
  anthropicApiKey: string        // Used only for Chat
  confluenceBaseUrl: string
  confluenceEmail: string
  confluenceApiToken: string
  whisperModel: 'tiny.en' | 'base.en' | 'medium.en' | 'large'
  googleClientId: string
  googleClientSecret: string
  recordingRetentionDays: number // Days to keep audio files before auto-deletion (default 30)
  slackClientId: string
  slackClientSecret: string
  slackRedirectUri: string
}

export interface PendingTranscription {
  recordingId: string
  startedAt: string
  event?: CalendarEvent
}

export interface CreateLabelInput {
  name: string
  color: string
  confluenceSpaceKey?: string
  confluencePageId?: string
  confluencePageName?: string
}

export interface UpdateLabelInput extends Partial<CreateLabelInput> {}

export interface ConfluencePage {
  id: string
  title: string
  /** ID of the immediate parent page/folder, or null for root-level items */
  parentId: string | null
  /** Full hierarchy path, e.g. "Engineering / Backend / API Design" */
  path: string
  /** True when this item is a Confluence folder (not a page) */
  isFolder?: boolean
}

export interface SlackChannel {
  id: string
  name: string
}

export interface SlackStatus {
  connected: boolean
  teamName: string | null
  userName: string | null
}
