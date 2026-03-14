import { transcriptsRepo } from '../db/repositories/transcripts.repo'
import { eventsRepo } from '../db/repositories/events.repo'
import { labelsRepo } from '../db/repositories/labels.repo'
import { ensureModel, getOrLoadModel } from './synthesis.service'
import { fetchSpaceSummariesForChat } from './confluence.service'
import type { ChatMessage } from '../../shared/types'

let mainWindow: Electron.BrowserWindow | null = null

export function setMainWindow(win: Electron.BrowserWindow): void {
  mainWindow = win
}

/** Build a text context block from recent meeting notes and Confluence pages. */
async function buildContext(): Promise<string> {
  const sections: string[] = []

  // Recent meeting notes — last 10 that have synthesis output
  const transcripts = transcriptsRepo.list().filter((t) => t.synthesis).slice(0, 10)
  if (transcripts.length > 0) {
    sections.push('## Meeting Notes')
    for (const t of transcripts) {
      const title = t.event?.title ?? 'Untitled Meeting'
      const date = new Date(t.createdAt).toLocaleDateString()
      const s = t.synthesis!
      const parts: string[] = [`### ${title} (${date})`]
      if (s.meetingSummary) parts.push(`Summary: ${s.meetingSummary}`)
      if (s.keyDecisions.length > 0) parts.push(`Key Decisions: ${s.keyDecisions.join('; ')}`)
      if (s.nextSteps.length > 0) parts.push(`Next Steps: ${s.nextSteps.join('; ')}`)
      if (s.notes) parts.push(`Notes: ${s.notes}`)
      sections.push(parts.join('\n'))
    }
  }

  // Confluence knowledge base — pages from label-configured spaces
  const labels = labelsRepo.list()
  const spaceKeys = [
    ...new Set(labels.map((l) => l.confluenceSpaceKey).filter((k): k is string => Boolean(k))),
  ]
  if (spaceKeys.length > 0) {
    try {
      const confluenceContent = await fetchSpaceSummariesForChat(spaceKeys)
      if (confluenceContent) {
        sections.push('## Confluence Knowledge Base')
        sections.push(confluenceContent)
      }
    } catch {
      // Confluence not configured or network unavailable — skip silently
    }
  }

  // Upcoming calendar events (next 7 days)
  const start = new Date()
  const end = new Date()
  end.setDate(end.getDate() + 7)
  const upcoming = eventsRepo.listForDateRange(start.toISOString(), end.toISOString())
  if (upcoming.length > 0) {
    sections.push('## Upcoming Meetings')
    for (const ev of upcoming.slice(0, 7)) {
      const time = new Date(ev.startTime).toLocaleString()
      const attendees = ev.attendees.map((a) => a.name || a.email).join(', ')
      sections.push(`- **${ev.title}** at ${time}${attendees ? ` with ${attendees}` : ''}`)
    }
  }

  return sections.join('\n\n')
}

export async function streamChat(messages: ChatMessage[]): Promise<void> {
  if (messages.length === 0) return

  const modelPath = await ensureModel()
  const context = await buildContext()

  const systemPrompt = context
    ? `You are Recall, an AI assistant that helps users understand their meetings and projects.\n\nContext from the user's workspace:\n${context}\n\nAnswer questions based on this context. Be concise and specific.`
    : `You are Recall, an AI assistant that helps users understand their meetings and projects. Answer questions helpfully.`

  const { model, LlamaChatSession } = (await getOrLoadModel(modelPath))!

  // Cap history at last 8 messages (4 exchanges) to stay within context limits
  const previousMessages = messages.slice(-9, -1)
  const chatHistory = previousMessages.map((m) =>
    m.role === 'user'
      ? { type: 'user' as const, text: m.content }
      : { type: 'model' as const, response: [m.content] }
  )

  const lastMessage = messages[messages.length - 1].content

  // Create a context with an explicit size so the library never auto-detects a value that
  // exceeds available VRAM (which causes the "context size N is too large" error).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = await (model as any).createContext({ contextSize: 2048 })
  try {
    const session = new LlamaChatSession({
      contextSequence: ctx.getSequence(),
      systemPrompt,
      ...(chatHistory.length > 0 ? { chatHistory } : {}),
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (session as any).prompt(lastMessage, {
      onTextChunk: (text: string) => {
        mainWindow?.webContents.send('chat:chunk', text)
      },
    })
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ctx as any).dispose()
  }

  mainWindow?.webContents.send('chat:done')
}
