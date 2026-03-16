import { contextBridge, ipcRenderer } from 'electron'
import type {
  AuthStatus,
  CalendarEvent,
  ChatMessage,
  ConfluencePage,
  CreateLabelInput,
  Label,
  PendingTranscription,
  SlackChannel,
  SlackUser,
  SlackStatus,
  Synthesis,
  Transcript,
  UpdateLabelInput,
} from '../shared/types'

// Typed Electron API exposed to renderer via contextBridge
const electronAPI = {
  platform: process.platform,

  auth: {
    signIn: (): Promise<AuthStatus> => ipcRenderer.invoke('auth:signIn'),
    signOut: (): Promise<void> => ipcRenderer.invoke('auth:signOut'),
    getStatus: (): Promise<AuthStatus> => ipcRenderer.invoke('auth:getStatus'),
    onStatusChange: (cb: (status: AuthStatus) => void) => {
      const handler = (_: Electron.IpcRendererEvent, status: AuthStatus) => cb(status)
      ipcRenderer.on('auth:statusChange', handler)
      return () => ipcRenderer.removeListener('auth:statusChange', handler)
    },
  },

  calendar: {
    getTodaysEvents: (): Promise<CalendarEvent[]> =>
      ipcRenderer.invoke('calendar:getTodaysEvents'),
    getUpcomingEvents: (days: number): Promise<CalendarEvent[]> =>
      ipcRenderer.invoke('calendar:getUpcomingEvents', days),
    assignLabel: (eventId: string, labelId: string): Promise<void> =>
      ipcRenderer.invoke('calendar:assignLabel', eventId, labelId),
    removeLabel: (eventId: string, labelId: string): Promise<void> =>
      ipcRenderer.invoke('calendar:removeLabel', eventId, labelId),
  },

  recording: {
    start: (eventId: string): Promise<{ recordingId: string }> =>
      ipcRenderer.invoke('recording:start', eventId),
    stop: (recordingId: string): Promise<void> =>
      ipcRenderer.invoke('recording:stop', recordingId),
    appendChunk: (recordingId: string, chunk: ArrayBuffer): Promise<void> =>
      ipcRenderer.invoke('recording:appendChunk', recordingId, chunk),
    getStatus: (recordingId: string): Promise<string> =>
      ipcRenderer.invoke('recording:getStatus', recordingId),
    onStatusChange: (cb: (payload: { recordingId: string; status: string }) => void) => {
      const handler = (
        _: Electron.IpcRendererEvent,
        payload: { recordingId: string; status: string }
      ) => cb(payload)
      ipcRenderer.on('recording:statusChange', handler)
      return () => ipcRenderer.removeListener('recording:statusChange', handler)
    },
  },

  transcripts: {
    list: (): Promise<Transcript[]> => ipcRenderer.invoke('transcripts:list'),
    listPending: (): Promise<PendingTranscription[]> => ipcRenderer.invoke('transcripts:listPending'),
    get: (id: string): Promise<Transcript | null> => ipcRenderer.invoke('transcripts:get', id),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('transcripts:delete', id),
    onComplete: (cb: (payload: { recordingId: string; transcriptId: string }) => void) => {
      const handler = (
        _: Electron.IpcRendererEvent,
        payload: { recordingId: string; transcriptId: string }
      ) => cb(payload)
      ipcRenderer.on('transcription:complete', handler)
      return () => ipcRenderer.removeListener('transcription:complete', handler)
    },
    onModelDownloadProgress: (cb: (progress: number) => void) => {
      const handler = (_: Electron.IpcRendererEvent, progress: number) => cb(progress)
      ipcRenderer.on('transcription:modelDownloadProgress', handler)
      return () => ipcRenderer.removeListener('transcription:modelDownloadProgress', handler)
    },
  },

  synthesis: {
    ensureModel: (): Promise<string> => ipcRenderer.invoke('synthesis:ensureModel'),
    generate: (transcriptId: string): Promise<Synthesis> =>
      ipcRenderer.invoke('synthesis:generate', transcriptId),
    pushToConfluence: (synthesisId: string): Promise<{ url: string }> =>
      ipcRenderer.invoke('synthesis:pushToConfluence', synthesisId),
    get: (transcriptId: string): Promise<Synthesis | null> =>
      ipcRenderer.invoke('synthesis:get', transcriptId),
    isPending: (transcriptId: string): Promise<boolean> =>
      ipcRenderer.invoke('synthesis:isPending', transcriptId),
    updateNotes: (transcriptId: string, notes: string): Promise<void> =>
      ipcRenderer.invoke('synthesis:updateNotes', transcriptId, notes),
    onModelDownloadProgress: (cb: (p: { pct: number; downloaded: number; total: number }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, p: { pct: number; downloaded: number; total: number }) => cb(p)
      ipcRenderer.on('synthesis:modelDownloadProgress', handler)
      return () => ipcRenderer.removeListener('synthesis:modelDownloadProgress', handler)
    },
    onStarted: (cb: (payload: { transcriptId: string }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, payload: { transcriptId: string }) => cb(payload)
      ipcRenderer.on('synthesis:started', handler)
      return () => ipcRenderer.removeListener('synthesis:started', handler)
    },
    onComplete: (cb: (payload: { transcriptId: string }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, payload: { transcriptId: string }) => cb(payload)
      ipcRenderer.on('synthesis:complete', handler)
      return () => ipcRenderer.removeListener('synthesis:complete', handler)
    },
    onError: (cb: (payload: { transcriptId: string; error: string }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, payload: { transcriptId: string; error: string }) => cb(payload)
      ipcRenderer.on('synthesis:error', handler)
      return () => ipcRenderer.removeListener('synthesis:error', handler)
    },
  },

  confluence: {
    getSpacePages: (spaceKey: string): Promise<ConfluencePage[]> =>
      ipcRenderer.invoke('confluence:getSpacePages', spaceKey),
  },

  chat: {
    sendMessage: (messages: ChatMessage[]): Promise<void> =>
      ipcRenderer.invoke('chat:sendMessage', messages),
    onChunk: (cb: (text: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, text: string) => cb(text)
      ipcRenderer.on('chat:chunk', handler)
      return () => ipcRenderer.removeListener('chat:chunk', handler)
    },
    onDone: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('chat:done', handler)
      return () => ipcRenderer.removeListener('chat:done', handler)
    },
  },

  labels: {
    list: (): Promise<Label[]> => ipcRenderer.invoke('labels:list'),
    create: (input: CreateLabelInput): Promise<Label> =>
      ipcRenderer.invoke('labels:create', input),
    update: (id: string, input: UpdateLabelInput): Promise<Label> =>
      ipcRenderer.invoke('labels:update', id, input),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('labels:delete', id),
  },

  notes: {
    get: (eventId: string): Promise<string> => ipcRenderer.invoke('notes:get', eventId),
    set: (eventId: string, text: string): Promise<void> =>
      ipcRenderer.invoke('notes:set', eventId, text),
  },

  settings: {
    get: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('settings:get'),
    set: (key: string, value: unknown): Promise<void> =>
      ipcRenderer.invoke('settings:set', key, value),
  },

  cleanup: {
    deleteAllAudio: (): Promise<number> => ipcRenderer.invoke('recordings:deleteAllAudio'),
  },

  slack: {
    getStatus: (): Promise<SlackStatus> => ipcRenderer.invoke('slack:getStatus'),
    connect: (): Promise<SlackStatus> => ipcRenderer.invoke('slack:connect'),
    disconnect: (): Promise<void> => ipcRenderer.invoke('slack:disconnect'),
    getChannels: (): Promise<SlackChannel[]> => ipcRenderer.invoke('slack:getChannels'),
    getUsers: (): Promise<SlackUser[]> => ipcRenderer.invoke('slack:getUsers'),
    postMessage: (channelId: string, text: string): Promise<void> =>
      ipcRenderer.invoke('slack:postMessage', channelId, text),
  },

  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
    checkForUpdates: (): Promise<{ available: boolean; version?: string }> =>
      ipcRenderer.invoke('app:checkForUpdates'),
    installUpdate: (): Promise<void> => ipcRenderer.invoke('app:installUpdate'),
    onUpdateDownloaded: (cb: (version: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, version: string) => cb(version)
      ipcRenderer.on('app:updateDownloaded', handler)
      return () => ipcRenderer.removeListener('app:updateDownloaded', handler)
    },
    onUpdateProgress: (cb: (pct: number) => void) => {
      const handler = (_: Electron.IpcRendererEvent, pct: number) => cb(pct)
      ipcRenderer.on('app:updateProgress', handler)
      return () => ipcRenderer.removeListener('app:updateProgress', handler)
    },
  },

  whisper: {
    getStatus: (): Promise<{
      cliFound: boolean
      cliPath: string
      modelName: string
      modelFound: boolean
      modelPath: string
    }> => ipcRenderer.invoke('whisper:getStatus'),
    downloadModel: (modelName: string): Promise<void> =>
      ipcRenderer.invoke('whisper:downloadModel', modelName),
  },
}

contextBridge.exposeInMainWorld('electron', electronAPI)

export type ElectronAPI = typeof electronAPI
