import { join } from 'path'
import { app } from 'electron'
import { mkdirSync, existsSync, createWriteStream } from 'fs'
import https from 'https'
import Store from 'electron-store'
import { transcriptsRepo } from '../db/repositories/transcripts.repo'
import { synthesisRepo } from '../db/repositories/synthesis.repo'
import type { Synthesis } from '../../shared/types'

const store = new Store()

let mainWindow: Electron.BrowserWindow | null = null

export function setMainWindow(win: Electron.BrowserWindow): void {
  mainWindow = win
}

// Cache the loaded model/context across calls to avoid reload on every synthesis
let cachedLlama: {
  llama: unknown
  model: unknown
  grammar: unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  LlamaChatSession: new (opts: { contextSequence: unknown }) => any
} | null = null
let cachedModelPath: string | null = null

const MODEL_FILENAME = 'Llama-3.2-3B-Instruct-Q4_K_M.gguf'
const MODEL_URL =
  'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf'

export function getModelPath(): string {
  // In a packaged build the model is bundled as an extraResource under Resources/models/
  if (app.isPackaged) {
    const bundled = join(process.resourcesPath, 'models', MODEL_FILENAME)
    if (existsSync(bundled)) return bundled
  }
  // Dev / first-run fallback: auto-download location in userData
  const dir = join(app.getPath('userData'), 'models')
  mkdirSync(dir, { recursive: true })
  return join(dir, MODEL_FILENAME)
}

function downloadModel(destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath)

    function doRequest(url: string): void {
      https.get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          doRequest(res.headers.location!)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Model download failed: HTTP ${res.statusCode}`))
          return
        }

        const total = parseInt(res.headers['content-length'] ?? '0', 10)
        let downloaded = 0

        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length
          if (total > 0) {
            const pct = Math.round((downloaded / total) * 100)
            mainWindow?.webContents.send('synthesis:modelDownloadProgress', { pct, downloaded, total })
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

    doRequest(MODEL_URL)
  })
}

export async function ensureModel(): Promise<string> {
  const modelPath = getModelPath()
  if (!existsSync(modelPath)) {
    mainWindow?.webContents.send('synthesis:modelDownloadProgress', { pct: 0, downloaded: 0, total: 0 })
    await downloadModel(modelPath)
    mainWindow?.webContents.send('synthesis:modelDownloadProgress', { pct: 100, downloaded: 0, total: 0 })
    // Invalidate cache since the model file changed
    cachedLlama = null
    cachedModelPath = null
  }
  return modelPath
}

const SYNTHESIS_SCHEMA = {
  type: 'object' as const,
  properties: {
    meeting_summary: { type: 'string' as const },
    attendees_summary: { type: 'string' as const },
    discussion: { type: 'string' as const },
    key_decisions: { type: 'array' as const, items: { type: 'string' as const } },
    next_steps: { type: 'array' as const, items: { type: 'string' as const } },
  },
  required: [
    'meeting_summary',
    'attendees_summary',
    'discussion',
    'key_decisions',
    'next_steps',
  ] as string[],
}

interface SynthesisOutput {
  meeting_summary: string
  attendees_summary: string
  discussion: string
  key_decisions: string[]
  next_steps: string[]
}

export async function getOrLoadModel(modelPath: string): Promise<typeof cachedLlama> {
  if (cachedLlama && cachedModelPath === modelPath) return cachedLlama

  // node-llama-cpp is ESM-only — use dynamic import
  const { getLlama, LlamaChatSession, LlamaJsonSchemaGrammar } = await import('node-llama-cpp')

  const llama = await getLlama()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = await (llama as any).loadModel({ modelPath })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grammar = new LlamaJsonSchemaGrammar(llama as any, SYNTHESIS_SCHEMA)

  cachedLlama = { llama, model, grammar, LlamaChatSession }
  cachedModelPath = modelPath
  return cachedLlama
}

export async function generateSynthesis(transcriptId: string): Promise<Synthesis> {
  const modelPath = await ensureModel()

  const transcript = transcriptsRepo.getById(transcriptId, true)
  if (!transcript) throw new Error(`Transcript not found: ${transcriptId}`)

  const event = transcript.event
  const notes = event ? ((store.get(`notes.${event.id}`, '') as string) || '') : ''

  // Build rich event context for the LLM
  const eventDate = event ? new Date(event.startTime).toLocaleString() : ''
  const attendeeList = event ? event.attendees.map((a) => a.name || a.email).join(', ') : ''
  const eventContext = event
    ? `Meeting: ${event.title}\nDate/Time: ${eventDate}\nAttendees: ${attendeeList}${event.description ? `\nDescription: ${event.description}` : ''}\n\n`
    : ''
  const notesContext = notes.trim()
    ? `Pre-meeting notes:\n${notes.trim()}\n\n`
    : ''

  const { model, grammar, LlamaChatSession } = (await getOrLoadModel(modelPath))!

  const prompt =
    `Analyze the following meeting transcript and return a JSON object with these exact fields:\n` +
    `- meeting_summary: 2-3 sentence overview\n` +
    `- attendees_summary: who attended and their contributions\n` +
    `- discussion: detailed narrative of what was discussed\n` +
    `- key_decisions: array of 3-7 key decisions made or conclusions reached\n` +
    `- next_steps: array of action items with owners if mentioned\n\n` +
    `${eventContext}${notesContext}Transcript:\n${transcript.rawText}`

  // Each synthesis gets a fresh context sequence to avoid cross-contamination.
  // Explicit contextSize prevents the library from auto-detecting a value that overflows VRAM.
  // Dispose the context when done to free VRAM for subsequent calls.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const context = await (model as any).createContext({ contextSize: 4096 })
  let raw: string
  try {
    const session = new LlamaChatSession({ contextSequence: context.getSequence() })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw = await session.prompt(prompt, { grammar: grammar as any })
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (context as any).dispose()
  }

  let parsed: SynthesisOutput
  try {
    parsed = JSON.parse(raw) as SynthesisOutput
  } catch {
    throw new Error(`Model returned invalid JSON. Raw output: ${raw.slice(0, 300)}`)
  }

  return synthesisRepo.create({
    transcriptId,
    meetingSummary: parsed.meeting_summary,
    attendeesSummary: parsed.attendees_summary,
    discussion: parsed.discussion,
    keyDecisions: Array.isArray(parsed.key_decisions) ? parsed.key_decisions : [],
    nextSteps: Array.isArray(parsed.next_steps) ? parsed.next_steps : [],
    notes: notes.trim() || undefined,
  })
}

// Track which transcript IDs are currently being synthesized so the UI can
// query this state when navigating to a detail page mid-synthesis.
const activeSynthesis = new Set<string>()

export function isSynthesisPending(transcriptId: string): boolean {
  return activeSynthesis.has(transcriptId)
}

/** Auto-trigger synthesis from transcription pipeline — fires IPC events for status. */
export async function triggerAutoSynthesis(transcriptId: string): Promise<void> {
  activeSynthesis.add(transcriptId)
  try {
    mainWindow?.webContents.send('synthesis:started', { transcriptId })
    await generateSynthesis(transcriptId)
    mainWindow?.webContents.send('synthesis:complete', { transcriptId })
  } catch (err) {
    console.error('[synthesis] auto-synthesis failed:', err)
    mainWindow?.webContents.send('synthesis:error', {
      transcriptId,
      error: (err as Error).message,
    })
  } finally {
    activeSynthesis.delete(transcriptId)
  }
}

export function getSynthesis(transcriptId: string): Synthesis | null {
  return synthesisRepo.getByTranscriptId(transcriptId)
}

export function updateSynthesisNotes(transcriptId: string, notes: string): void {
  const synthesis = synthesisRepo.getByTranscriptId(transcriptId)
  if (synthesis) {
    synthesisRepo.updateNotes(synthesis.id, notes)
  }
}

/** @deprecated No longer needed — model path is managed automatically */
export function invalidateModel(): void {
  cachedLlama = null
  cachedModelPath = null
}
