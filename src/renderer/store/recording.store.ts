import { create } from 'zustand'

export type RecordingStatus = 'recording' | 'stopping' | 'transcribing' | 'done' | 'error'

export interface EventSession {
  recordingId: string
  status: RecordingStatus
  transcriptId?: string
  errorMessage?: string
}

interface RecordingState {
  // Which event currently holds the mic (only one at a time)
  micEventId: string | null
  mediaRecorder: MediaRecorder | null
  durationMs: number
  _intervalId: ReturnType<typeof setInterval> | null

  // Per-event sessions — multiple events can be transcribing simultaneously
  sessions: Record<string, EventSession>
}

interface RecordingActions {
  startRecording: (eventId: string) => Promise<void>
  stopRecording: (eventId: string) => Promise<void>
  setTranscriptReady: (eventId: string, transcriptId: string) => void
  setSessionError: (eventId: string, errorMessage?: string) => void
}

const initialState: RecordingState = {
  micEventId: null,
  mediaRecorder: null,
  durationMs: 0,
  _intervalId: null,
  sessions: {},
}

// Track in-flight appendChunk IPC calls so stopRecording can wait for them
const pendingChunks = new Set<Promise<void>>()

export const useRecordingStore = create<RecordingState & RecordingActions>((set, get) => ({
  ...initialState,

  setTranscriptReady: (eventId, transcriptId) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [eventId]: { ...state.sessions[eventId], status: 'done', transcriptId },
      },
    })),

  setSessionError: (eventId, errorMessage) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [eventId]: { ...state.sessions[eventId], status: 'error', errorMessage },
      },
    })),

  startRecording: async (eventId: string) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const { recordingId } = await window.electron.recording.start(eventId)

    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
    const startTime = Date.now()

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        const p: Promise<void> = e.data.arrayBuffer().then((buffer) =>
          window.electron.recording.appendChunk(recordingId, buffer)
        )
        pendingChunks.add(p)
        p.finally(() => pendingChunks.delete(p))
      }
    }

    recorder.start(1000) // Emit chunks every second

    const intervalId = setInterval(() => {
      set({ durationMs: Date.now() - startTime })
    }, 1000)

    set((state) => ({
      micEventId: eventId,
      mediaRecorder: recorder,
      durationMs: 0,
      _intervalId: intervalId,
      sessions: {
        ...state.sessions,
        [eventId]: { recordingId, status: 'recording' },
      },
    }))
  },

  stopRecording: async (eventId: string) => {
    const { mediaRecorder, sessions, _intervalId } = get()
    const session = sessions[eventId]
    if (!mediaRecorder || !session) return

    set((state) => ({
      sessions: {
        ...state.sessions,
        [eventId]: { ...session, status: 'stopping' },
      },
    }))

    if (_intervalId) clearInterval(_intervalId)

    // Stop the media recorder and wait for the stop event (fires after the final dataavailable)
    await new Promise<void>((resolve) => {
      mediaRecorder.onstop = () => resolve()
      mediaRecorder.stop()
      mediaRecorder.stream.getTracks().forEach((t) => t.stop())
    })

    // Wait for all in-flight appendChunk IPC calls to complete before closing the stream
    await Promise.all(pendingChunks)

    await window.electron.recording.stop(session.recordingId)

    // Release the mic lock and move this event to transcribing.
    // Other events can now start recording while this one transcribes.
    set((state) => ({
      micEventId: null,
      mediaRecorder: null,
      durationMs: 0,
      _intervalId: null,
      sessions: {
        ...state.sessions,
        [eventId]: { ...session, status: 'transcribing' },
      },
    }))
  },
}))
