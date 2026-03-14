import { existsSync, unlinkSync } from 'fs'
import Store from 'electron-store'
import { recordingsRepo } from '../db/repositories/recordings.repo'
import type { Recording } from '../../shared/types'

const store = new Store()

const DEFAULT_RETENTION_DAYS = 30

/** Shared helper — deletes .webm + .wav audio files for a list of recordings. */
function deleteAudioFilesForRecordings(recordings: Recording[]): { deleted: number; total: number } {
  let deleted = 0
  for (const recording of recordings) {
    if (!recording.filePath) continue
    const isWav = recording.filePath.endsWith('.wav')
    const webmPath = isWav ? recording.filePath.replace('.wav', '.webm') : recording.filePath
    const wavPath = isWav ? recording.filePath : recording.filePath.replace('.webm', '.wav')
    for (const filePath of [webmPath, wavPath]) {
      if (existsSync(filePath)) {
        try {
          unlinkSync(filePath)
          deleted++
        } catch (err) {
          console.error(`[cleanup] Could not delete audio file ${filePath}:`, err)
        }
      }
    }
  }
  return { deleted, total: recordings.length }
}

/**
 * Delete audio files (.webm + .wav) for recordings older than the configured
 * retention period. DB records are kept so transcript/synthesis history remains intact.
 * Runs at startup and is a no-op if retention is set to 0 (disabled).
 */
export function runRetentionCleanup(): void {
  const retentionDays = Math.max(
    0,
    Number(store.get('recordingRetentionDays', DEFAULT_RETENTION_DAYS)) || DEFAULT_RETENTION_DAYS
  )

  // 0 means disabled
  if (retentionDays === 0) return

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - retentionDays)

  const oldRecordings = recordingsRepo.listOlderThan(cutoff)
  if (oldRecordings.length === 0) return

  const { deleted, total } = deleteAudioFilesForRecordings(oldRecordings)

  if (deleted > 0) {
    console.log(
      `[cleanup] Removed ${deleted} audio file(s) from ${total} recording(s) ` +
      `older than ${retentionDays} day(s).`
    )
  }
}

/**
 * Immediately delete all stored audio files regardless of age.
 * DB records, transcripts, and meeting notes are preserved.
 * Returns the number of recordings processed.
 */
export function deleteAllAudioFiles(): number {
  const all = recordingsRepo.listAllWithAudio()
  const { deleted, total } = deleteAudioFilesForRecordings(all)
  console.log(`[cleanup] Manual delete: removed ${deleted} audio file(s) from ${total} recording(s).`)
  return total
}
