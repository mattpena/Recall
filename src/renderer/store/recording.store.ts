import { create } from 'zustand'

export type RecordingStatus = 'idle' | 'recording' | 'stopping' | 'transcribing' | 'done' | 'error'

interface RecordingState {
  status: RecordingStatus
  recordingId: string | null
  eventId: string | null
  transcriptId: string | null
  mediaRecorder: MediaRecorder | null
  durationMs: number
  _intervalId: ReturnType<typeof setInterval> | null
}

interface RecordingActions {
  startRecording: (eventId: string) => Promise<void>
  stopRecording: () => Promise<void>
  setStatus: (status: RecordingStatus) => void
  setTranscriptReady: (transcriptId: string) => void
  reset: () => void
}

const initialState: RecordingState = {
  status: 'idle',
  recordingId: null,
  eventId: null,
  transcriptId: null,
  mediaRecorder: null,
  durationMs: 0,
  _intervalId: null,
}

// Track in-flight appendChunk IPC calls so stopRecording can wait for them
const pendingChunks = new Set<Promise<void>>()

export const useRecordingStore = create<RecordingState & RecordingActions>((set, get) => ({
  ...initialState,

  setStatus: (status) => set({ status }),

  setTranscriptReady: (transcriptId: string) => set({ status: 'done', transcriptId }),

  reset: () => {
    const { _intervalId } = get()
    if (_intervalId) clearInterval(_intervalId)
    set(initialState)
  },

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

    set({
      status: 'recording',
      recordingId,
      eventId,
      transcriptId: null,
      mediaRecorder: recorder,
      durationMs: 0,
      _intervalId: intervalId,
    })
  },

  stopRecording: async () => {
    const { mediaRecorder, recordingId, _intervalId } = get()
    if (!mediaRecorder || !recordingId) return

    set({ status: 'stopping' })

    if (_intervalId) clearInterval(_intervalId)

    // Stop the media recorder and wait for the stop event (which fires after the final dataavailable)
    await new Promise<void>((resolve) => {
      mediaRecorder.onstop = () => resolve()
      mediaRecorder.stop()
      mediaRecorder.stream.getTracks().forEach((t) => t.stop())
    })

    // Wait for all in-flight appendChunk IPC calls to complete before closing the stream
    await Promise.all(pendingChunks)

    await window.electron.recording.stop(recordingId)
    set({ status: 'transcribing' })
  },
}))
