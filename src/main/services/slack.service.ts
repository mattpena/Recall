import { shell } from 'electron'
import { createServer, IncomingMessage, ServerResponse } from 'http'
import Store from 'electron-store'
import type { SlackChannel, SlackStatus } from '../../shared/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getKeytar(): Promise<any> {
  const mod = await import('keytar')
  return (mod as any).default ?? mod
}

// Local listener port — must match the port the relay page redirects to
const SLACK_LOCAL_PORT = 47822

function getSlackCredentials(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = store.get('slackClientId', '') as string
  const clientSecret = store.get('slackClientSecret', '') as string
  const redirectUri = store.get('slackRedirectUri', '') as string
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Slack app credentials are not configured. Please enter your Slack Client ID, Secret, and Redirect URI in Settings.'
    )
  }
  return { clientId, clientSecret, redirectUri }
}

const KEYTAR_SERVICE = 'recall'
const KEYTAR_ACCOUNT = 'slack-token'
const STORE_TEAM_KEY = 'slackTeamName'
const STORE_USER_KEY = 'slackUserName'

const store = new Store()

function startLoopbackServer(): Promise<{ port: number; codeProm: Promise<string> }> {
  return new Promise((resolvePort) => {
    let resolveCode: (code: string) => void
    let rejectCode: (err: Error) => void

    const codeProm = new Promise<string>((res, rej) => {
      resolveCode = res
      rejectCode = rej
    })

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1`)
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(
        `<html><body style="font-family:sans-serif;text-align:center;padding-top:60px">` +
          (error
            ? `<h2>Slack connection failed</h2><p>${error}</p>`
            : `<h2>Slack connected!</h2><p>You can close this tab and return to Recall.</p>`) +
          `</body></html>`
      )

      server.close()

      if (error) rejectCode(new Error(`Slack OAuth error: ${error}`))
      else if (code) resolveCode(code)
      else rejectCode(new Error('No code received from Slack'))
    })

    server.listen(SLACK_LOCAL_PORT, '127.0.0.1', () => {
      const addr = server.address() as { port: number }
      resolvePort({ port: addr.port, codeProm })
    })
  })
}

export async function getStatus(): Promise<SlackStatus> {
  const keytar = await getKeytar()
  const token = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT)
  return {
    connected: Boolean(token),
    teamName: token ? ((store.get(STORE_TEAM_KEY) as string) ?? null) : null,
    userName: token ? ((store.get(STORE_USER_KEY) as string) ?? null) : null,
  }
}

export async function startOAuth(): Promise<SlackStatus> {
  const { clientId, clientSecret, redirectUri } = getSlackCredentials()

  const { codeProm } = await startLoopbackServer()

  const params = new URLSearchParams({
    client_id: clientId,
    scope: '',
    user_scope: 'channels:read,groups:read,chat:write',
    redirect_uri: redirectUri,
  })
  const authUrl = `https://slack.com/oauth/v2/authorize?${params.toString()}`
  await shell.openExternal(authUrl)

  const code = await Promise.race([
    codeProm,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Slack sign-in timed out after 5 minutes')), 300_000)
    ),
  ])

  // Exchange code for token
  const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }).toString(),
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await tokenRes.json()) as any
  if (!data.ok) throw new Error(`Slack token exchange failed: ${data.error}`)

  const userToken: string = data.authed_user?.access_token
  if (!userToken) throw new Error('No user token returned from Slack')

  const teamName: string = data.team?.name ?? ''
  const userName: string = data.authed_user?.id ?? ''

  // Resolve user display name
  let displayName = userName
  try {
    const profileRes = await fetch('https://slack.com/api/users.profile.get', {
      headers: { Authorization: `Bearer ${userToken}` },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profileData = (await profileRes.json()) as any
    if (profileData.ok) {
      displayName = profileData.profile?.display_name || profileData.profile?.real_name || userName
    }
  } catch {
    // non-fatal — fall back to user ID
  }

  const keytar = await getKeytar()
  await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, userToken)
  store.set(STORE_TEAM_KEY, teamName)
  store.set(STORE_USER_KEY, displayName)

  return { connected: true, teamName, userName: displayName }
}

export async function disconnect(): Promise<void> {
  const keytar = await getKeytar()
  await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT)
  store.delete(STORE_TEAM_KEY as never)
  store.delete(STORE_USER_KEY as never)
}

export async function getChannels(): Promise<SlackChannel[]> {
  const keytar = await getKeytar()
  const token = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT)
  if (!token) throw new Error('Slack not connected')

  const params = new URLSearchParams({
    types: 'public_channel,private_channel',
    exclude_archived: 'true',
    limit: '200',
  })
  const res = await fetch(`https://slack.com/api/conversations.list?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await res.json()) as any
  if (!data.ok) throw new Error(`Failed to fetch Slack channels: ${data.error}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.channels as any[]).map((c) => ({ id: c.id as string, name: c.name as string }))
}

export async function postMessage(channelId: string, text: string): Promise<void> {
  const keytar = await getKeytar()
  const token = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT)
  if (!token) throw new Error('Slack not connected')

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ channel: channelId, text }),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await res.json()) as any
  if (!data.ok) throw new Error(`Failed to post Slack message: ${data.error}`)
}
