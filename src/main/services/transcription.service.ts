import { join } from 'path'
import { existsSync, createWriteStream, mkdirSync } from 'fs'
import https from 'https'
import { app } from 'electron'
import { recordingsRepo } from '../db/repositories/recordings.repo'
import { transcriptsRepo } from '../db/repositories/transcripts.repo'
import { triggerAutoSynthesis } from './synthesis.service'
import type { Transcript } from '../../shared/types'
import Store from 'electron-store'

const store = new Store<{ whisperModel: string }>()

let mainWindow: Electron.BrowserWindow | null = null

export function setMainWindow(win: Electron.BrowserWindow): void {
  mainWindow = win
}

// nodejs-whisper expects model and binary in its own package directory.
// In a packaged build node_modules live in app.asar.unpacked (not inside the asar archive)
// so executables can actually be spawned by the OS.
function getWhisperPackageDir(): string {
  const nodeModulesBase = app.isPackaged
    ? join(process.resourcesPath, 'app.asar.unpacked', 'node_modules')
    : join(__dirname, '..', '..', 'node_modules')
  return join(nodeModulesBase, 'nodejs-whisper', 'cpp', 'whisper.cpp')
}

function getWhisperCliPath(): string {
  return join(getWhisperPackageDir(), 'build', 'bin', 'whisper-cli')
}

function getModelPath(modelName: string): string {
  const modelFile = `ggml-${modelName}.bin`
  return join(getWhisperPackageDir(), 'models', modelFile)
}

const MODEL_URLS: Record<string, string> = {
  'tiny.en': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
  'base.en': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
  'medium.en': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin',
  'large': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin',
}

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    mkdirSync(join(destPath, '..'), { recursive: true })
    const file = createWriteStream(destPath)

    function doRequest(requestUrl: string): void {
      https.get(requestUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          doRequest(res.headers.location!)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode} for ${requestUrl}`))
          return
        }

        const total = parseInt(res.headers['content-length'] ?? '0', 10)
        let downloaded = 0

        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length
          if (total > 0) {
            const pct = Math.round((downloaded / total) * 100)
            mainWindow?.webContents.send('transcription:modelDownloadProgress', { pct, downloaded, total })
          }
        })

        res.pipe(file)
        res.on('end', () => {
          file.close()
          resolve()
        })
        res.on('error', reject)
      }).on('error', reject)
    }

    doRequest(url)
  })
}

async function ensureModel(modelName: string): Promise<void> {
  const modelPath = getModelPath(modelName)
  if (existsSync(modelPath)) return

  const url = MODEL_URLS[modelName]
  if (!url) throw new Error(`No download URL for model: ${modelName}`)

  mainWindow?.webContents.send('transcription:modelDownloadProgress', { pct: 0, downloaded: 0, total: 0 })
  await downloadFile(url, modelPath)
  mainWindow?.webContents.send('transcription:modelDownloadProgress', { pct: 100, downloaded: 0, total: 0 })
}

export function getWhisperStatus(): {
  cliFound: boolean
  cliPath: string
  modelName: string
  modelFound: boolean
  modelPath: string
} {
  const modelName = (store.get('whisperModel', 'base.en') as string) || 'base.en'
  const cliPath = getWhisperCliPath()
  const modelPath = getModelPath(modelName)
  return {
    cliFound: existsSync(cliPath),
    cliPath,
    modelName,
    modelFound: existsSync(modelPath),
    modelPath,
  }
}

export async function downloadModelManually(modelName: string): Promise<void> {
  // Force re-download by calling ensureModel (it skips if already present,
  // but callers wanting a fresh download should delete the file first — this
  // handles the common case of "model missing, click Download")
  await ensureModel(modelName)
}

export async function transcribeRecording(recordingId: string, wavPath: string): Promise<Transcript> {
  recordingsRepo.updateStatus(recordingId, 'transcribing')
  mainWindow?.webContents.send('recording:statusChange', { recordingId, status: 'transcribing' })

  const modelName = (store.get('whisperModel', 'base.en') as string) || 'base.en'

  // Check whisper-cli binary
  const cliPath = getWhisperCliPath()
  if (!existsSync(cliPath)) {
    const err = new Error(
      `whisper-cli binary not found at ${cliPath}. ` +
      `Run: cd node_modules/nodejs-whisper/cpp/whisper.cpp && cmake -B build -DGGML_SVE=OFF -DGGML_MACHINE_SUPPORTS_sve=0 && make -C build whisper-cli`
    )
    recordingsRepo.updateStatus(recordingId, 'error')
    mainWindow?.webContents.send('recording:statusChange', { recordingId, status: 'error' })
    throw err
  }

  // Download model if needed
  await ensureModel(modelName)

  try {
    const { nodewhisper } = await import('nodejs-whisper')

    const result = await nodewhisper(wavPath, {
      modelName,
      whisperOptions: {
        outputInText: true,
        language: 'en',
      },
    })

    const rawText = typeof result === 'string' ? result : JSON.stringify(result)

    const transcript = transcriptsRepo.create({
      recordingId,
      rawText,
      language: 'en',
    })

    recordingsRepo.updateStatus(recordingId, 'done')
    mainWindow?.webContents.send('recording:statusChange', { recordingId, status: 'done' })
    mainWindow?.webContents.send('transcription:complete', {
      recordingId,
      transcriptId: transcript.id,
    })

    // Kick off synthesis automatically — runs in background, sends synthesis:complete or synthesis:error
    triggerAutoSynthesis(transcript.id).catch(console.error)

    return transcript
  } catch (error) {
    recordingsRepo.updateStatus(recordingId, 'error')
    mainWindow?.webContents.send('recording:statusChange', { recordingId, status: 'error' })
    throw error
  }
}
