import { ipcMain } from 'electron'
import * as authService from '../services/google-auth.service'
import * as calendarService from '../services/calendar.service'
import * as recordingService from '../services/recording.service'
import * as transcriptionService from '../services/transcription.service'
import * as synthesisService from '../services/synthesis.service'
import * as confluenceService from '../services/confluence.service'
import * as chatService from '../services/chat.service'
import * as cleanupService from '../services/cleanup.service'
import { labelsRepo } from '../db/repositories/labels.repo'
import { transcriptsRepo } from '../db/repositories/transcripts.repo'
import { recordingsRepo } from '../db/repositories/recordings.repo'
import { eventsRepo } from '../db/repositories/events.repo'
import { synthesisRepo } from '../db/repositories/synthesis.repo'
import { getDb } from '../db/index'
import Store from 'electron-store'

const store = new Store()

export function registerAllIpcHandlers(): void {
  // Auth
  ipcMain.handle('auth:signIn', () => authService.signIn())
  ipcMain.handle('auth:signOut', () => authService.signOut())
  ipcMain.handle('auth:getStatus', () => authService.getAuthStatus())

  // Calendar
  ipcMain.handle('calendar:getTodaysEvents', () => calendarService.getTodaysEvents())
  ipcMain.handle('calendar:getUpcomingEvents', (_, days: number) =>
    calendarService.getUpcomingEvents(days)
  )
  ipcMain.handle('calendar:assignLabel', (_, eventId: string, labelId: string) =>
    calendarService.assignLabel(eventId, labelId)
  )
  ipcMain.handle('calendar:removeLabel', (_, eventId: string, labelId: string) =>
    calendarService.removeLabel(eventId, labelId)
  )

  // Recording
  ipcMain.handle('recording:start', (_, eventId: string) => {
    const recording = recordingService.startRecording(eventId)
    return { recordingId: recording.id }
  })
  ipcMain.handle('recording:stop', async (_, recordingId: string) => {
    const wavPath = await recordingService.stopRecording(recordingId)
    // Trigger transcription asynchronously
    transcriptionService.transcribeRecording(recordingId, wavPath).catch(console.error)
  })
  ipcMain.handle('recording:appendChunk', (_, recordingId: string, chunk: ArrayBuffer) =>
    recordingService.appendChunk(recordingId, chunk)
  )

  // Transcripts
  ipcMain.handle('transcripts:list', () => transcriptsRepo.list())
  ipcMain.handle('transcripts:get', (_, id: string) => transcriptsRepo.getById(id, true))
  ipcMain.handle('transcripts:delete', (_, id: string) => transcriptsRepo.delete(id))
  ipcMain.handle('transcripts:listPending', () =>
    recordingsRepo.listTranscribing().map((r) => ({
      recordingId: r.id,
      startedAt: r.startedAt,
      event: r.eventId ? (eventsRepo.getById(r.eventId) ?? undefined) : undefined,
    }))
  )

  // Synthesis
  ipcMain.handle('synthesis:generate', (_, transcriptId: string) =>
    synthesisService.generateSynthesis(transcriptId)
  )
  ipcMain.handle('synthesis:pushToConfluence', (_, synthesisId: string) =>
    confluenceService.pushSynthesis(synthesisId)
  )
  ipcMain.handle('synthesis:get', (_, transcriptId: string) =>
    synthesisService.getSynthesis(transcriptId)
  )
  ipcMain.handle('synthesis:isPending', (_, transcriptId: string) =>
    synthesisService.isSynthesisPending(transcriptId)
  )
  ipcMain.handle('synthesis:updateNotes', (_, transcriptId: string, notes: string) => {
    synthesisService.updateSynthesisNotes(transcriptId, notes)
    // Sync back to electron-store so the Home screen notes field stays in sync
    const transcript = transcriptsRepo.getById(transcriptId, true)
    if (transcript?.event?.id) {
      if (notes) {
        store.set(`notes.${transcript.event.id}`, notes)
      } else {
        store.delete(`notes.${transcript.event.id}` as never)
      }
    }
  })

  // Confluence
  ipcMain.handle('confluence:getSpacePages', (_, spaceKey: string) =>
    confluenceService.getSpacePages(spaceKey)
  )

  // Chat
  ipcMain.handle('chat:sendMessage', (_, messages) => chatService.streamChat(messages))

  // Labels
  ipcMain.handle('labels:list', () => labelsRepo.list())
  ipcMain.handle('labels:create', (_, input) => labelsRepo.create(input))
  ipcMain.handle('labels:update', (_, id: string, input) => labelsRepo.update(id, input))
  ipcMain.handle('labels:delete', (_, id: string) => labelsRepo.delete(id))

  // Notes (per calendar event, keyed by eventId)
  ipcMain.handle('notes:get', (_, eventId: string) => {
    return (store.get(`notes.${eventId}`, '') as string) || ''
  })
  ipcMain.handle('notes:set', (_, eventId: string, text: string) => {
    if (text) {
      store.set(`notes.${eventId}`, text)
    } else {
      store.delete(`notes.${eventId}` as never)
    }
    // Keep synthesis notes in sync if synthesis already exists for this event
    const row = getDb()
      .prepare(
        `SELECT s.id FROM synthesis s
         JOIN transcripts t ON t.id = s.transcript_id
         JOIN recordings r ON r.id = t.recording_id
         WHERE r.event_id = ?
         ORDER BY t.created_at DESC
         LIMIT 1`
      )
      .get(eventId) as { id: string } | undefined
    if (row) {
      synthesisRepo.updateNotes(row.id, text)
    }
  })

  // Settings
  ipcMain.handle('settings:get', () => store.store)
  ipcMain.handle('settings:set', (_, key: string, value: unknown) => {
    store.set(key, value)
  })

  // Manual recording cleanup
  ipcMain.handle('recordings:deleteAllAudio', () => cleanupService.deleteAllAudioFiles())
}
