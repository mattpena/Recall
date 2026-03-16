import { shell } from 'electron'
import { OAuth2Client } from 'google-auth-library'
import { createServer, IncomingMessage, ServerResponse } from 'http'
import crypto from 'crypto'
import Store from 'electron-store'
import type { AuthStatus } from '../../shared/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getKeytar(): Promise<any> {
  const mod = await import('keytar')
  return (mod as any).default ?? mod
}

const store = new Store()

function getGoogleCredentials(): { clientId: string; clientSecret: string } {
  const clientId = store.get('googleClientId', '') as string
  const clientSecret = store.get('googleClientSecret', '') as string
  if (!clientId || !clientSecret) {
    throw new Error(
      'Google OAuth credentials are not configured. Please enter your Client ID and Secret in Settings.'
    )
  }
  return { clientId, clientSecret }
}

interface TokenData {
  accessToken: string
  refreshToken: string
  expiresAt: number
  email: string
  name: string
}

let tokenData: TokenData | null = null
let oauthClient: OAuth2Client | null = null

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]

function getOAuthClient(redirectUri?: string): OAuth2Client {
  const { clientId, clientSecret } = getGoogleCredentials()
  if (redirectUri) {
    return new OAuth2Client({ clientId, clientSecret, redirectUri })
  }
  if (!oauthClient) {
    oauthClient = new OAuth2Client({ clientId, clientSecret })
  }
  return oauthClient
}

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

/** Start a temporary HTTP server on a random port, return the port and a promise that resolves with the auth code */
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
            ? `<h2>Authentication failed</h2><p>${error}</p>`
            : `<h2>Authentication successful!</h2><p>You can close this tab and return to Recall.</p>`) +
          `</body></html>`
      )

      server.close()

      if (error) rejectCode(new Error(`OAuth error: ${error}`))
      else if (code) resolveCode(code)
      else rejectCode(new Error('No code received from Google'))
    })

    // Port 0 → OS picks a random available port
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number }
      resolvePort({ port: addr.port, codeProm })
    })
  })
}

async function loadStoredToken(): Promise<void> {
  try {
    const keytar = await getKeytar()
    const refreshToken = await keytar.getPassword('recall', 'google-refresh-token')
    const email = await keytar.getPassword('recall', 'google-email')
    const name = await keytar.getPassword('recall', 'google-name')
    if (refreshToken && email) {
      const client = getOAuthClient()
      client.setCredentials({ refresh_token: refreshToken })
      const { credentials } = await client.refreshAccessToken()
      tokenData = {
        accessToken: credentials.access_token!,
        refreshToken: credentials.refresh_token ?? refreshToken,
        expiresAt: credentials.expiry_date ?? Date.now() + 3600_000,
        email,
        name: name ?? email,
      }
      oauthClient = client
    }
  } catch {
    tokenData = null
  }
}

export async function initialize(): Promise<void> {
  await loadStoredToken()
}

export async function getAuthStatus(): Promise<AuthStatus> {
  return {
    isSignedIn: tokenData !== null,
    userEmail: tokenData?.email ?? null,
    userName: tokenData?.name ?? null,
  }
}

export async function getAccessToken(): Promise<string> {
  if (!tokenData) throw new Error('Not signed in')
  if (Date.now() > tokenData.expiresAt - 60_000) {
    await refreshAccessToken()
  }
  return tokenData.accessToken
}

async function refreshAccessToken(): Promise<void> {
  const client = getOAuthClient()
  client.setCredentials({ refresh_token: tokenData!.refreshToken })
  const { credentials } = await client.refreshAccessToken()
  tokenData!.accessToken = credentials.access_token!
  tokenData!.expiresAt = credentials.expiry_date ?? Date.now() + 3600_000
}

export async function signIn(): Promise<AuthStatus> {
  const { port, codeProm } = await startLoopbackServer()
  const redirectUri = `http://127.0.0.1:${port}`

  const verifier = generateCodeVerifier()
  const challenge = generateCodeChallenge(verifier)
  const client = getOAuthClient(redirectUri)

  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'consent',
  })

  await shell.openExternal(authUrl)

  const code = await Promise.race([
    codeProm,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('OAuth sign-in timed out after 5 minutes')), 300_000)
    ),
  ])

  const { tokens } = await client.getToken({ code, codeVerifier: verifier, redirect_uri: redirectUri })
  client.setCredentials(tokens)
  oauthClient = client

  const { google } = await import('googleapis')
  const oauth2 = google.oauth2({ version: 'v2', auth: client })
  const { data } = await oauth2.userinfo.get()

  const keytar = await getKeytar()
  await keytar.setPassword('recall', 'google-refresh-token', tokens.refresh_token!)
  await keytar.setPassword('recall', 'google-email', data.email!)
  await keytar.setPassword('recall', 'google-name', data.name ?? data.email!)

  tokenData = {
    accessToken: tokens.access_token!,
    refreshToken: tokens.refresh_token!,
    expiresAt: tokens.expiry_date ?? Date.now() + 3600_000,
    email: data.email!,
    name: data.name ?? data.email!,
  }

  return getAuthStatus()
}

export async function signOut(): Promise<void> {
  const keytar = await getKeytar()
  await keytar.deletePassword('recall', 'google-refresh-token')
  await keytar.deletePassword('recall', 'google-email')
  await keytar.deletePassword('recall', 'google-name')
  tokenData = null
  oauthClient = null
}
