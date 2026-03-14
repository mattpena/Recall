import { createWriteStream, WriteStream, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { spawn } from 'child_process'
import { recordingsRepo } from '../db/repositories/recordings.repo'
import type { Recording } from '../../shared/types'

// Get the ffmpeg binary path.
// In a packaged ASAR build the path returned by ffmpeg-static points into the virtual ASAR
// filesystem which cannot be spawned by the OS. Redirect to the real unpacked location.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegPath: string = (require('ffmpeg-static') as string).replace(
  'app.asar',
  'app.asar.unpacked'
)

const activeStreams = new Map<string, WriteStream>()

function getRecordingsDir(): string {
  const dir = join(app.getPath('userData'), 'recordings')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function startRecording(eventId: string | null): Recording {
  const fileName = `recording-${Date.now()}.webm`
  const filePath = join(getRecordingsDir(), fileName)
  const recording = recordingsRepo.create({ eventId, filePath })
  const stream = createWriteStream(filePath)
  activeStreams.set(recording.id, stream)
  return recording
}

export function appendChunk(recordingId: string, chunk: ArrayBuffer): void {
  const stream = activeStreams.get(recordingId)
  if (!stream) throw new Error(`No active recording: ${recordingId}`)
  stream.write(Buffer.from(chunk))
}

export async function stopRecording(recordingId: string): Promise<string> {
  const stream = activeStreams.get(recordingId)
  if (!stream) throw new Error(`No active recording: ${recordingId}`)

  await new Promise<void>((resolve) => stream.end(resolve))
  activeStreams.delete(recordingId)

  const recording = recordingsRepo.getById(recordingId)
  if (!recording) throw new Error(`Recording not found: ${recordingId}`)

  const endedAt = new Date().toISOString()
  recordingsRepo.updateStatus(recordingId, 'stopped', { endedAt })

  // Convert WebM to WAV for Whisper
  const wavPath = recording.filePath.replace('.webm', '.wav')
  await convertToWav(recording.filePath, wavPath)

  // Update the file path to the converted WAV
  return wavPath
}

function convertToWav(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      '-i', inputPath,
      '-ar', '16000',    // 16kHz sample rate (required by Whisper)
      '-ac', '1',        // mono
      '-f', 'wav',
      outputPath,
      '-y',              // overwrite if exists
    ])

    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited with code ${code}`))
    })

    proc.on('error', reject)
  })
}
