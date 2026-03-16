import { shell } from 'electron'
import { OAuth2Client } from 'google-auth-library'
import { createServer, IncomingMessage, ServerResponse } from 'http'
import crypto from 'crypto'
import type { AuthStatus } from '../../shared/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getKeytar(): Promise<any> {
  const mod = await import('keytar')
  return (mod as any).default ?? mod
}

// Public — safe to ship in the binary. The client_secret never leaves the worker.
// TODO: replace with your new GCP OAuth client ID after re-creating it in the console.
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com'

// Cloudflare Worker URL — handles token exchange and refresh with the secret server-side.
// TODO: replace with your deployed worker URL after running `cd recall-oauth && npm run deploy`
const OAUTH_WORKER_URL = 'https://recall-oauth.YOUR_SUBDOMAIN.workers.dev'

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

// Client ID is public; the secret lives only in the worker.
function getOAuthClient(redirectUri?: string): OAuth2Client {
  if (redirectUri) {
    return new OAuth2Client({ clientId: GOOGLE_CLIENT_ID, redirectUri })
  }
  if (!oauthClient) {
    oauthClient = new OAuth2Client({ clientId: GOOGLE_CLIENT_ID })
  }
  return oauthClient
}

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

/** Exchange auth code for tokens via the Cloudflare worker (which holds the client_secret). */
async function exchangeCodeViaWorker(
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const res = await fetch(`${OAUTH_WORKER_URL}/google/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: redirectUri, code_verifier: codeVerifier }),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await res.json()) as any
  if (data.error) throw new Error(`Google token exchange failed: ${data.error_description ?? data.error}`)
  return data
}

/** Refresh an access token via the worker. */
async function refreshViaWorker(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(`${OAUTH_WORKER_URL}/google/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await res.json()) as any
  if (data.error) throw new Error(`Google token refresh failed: ${data.error_description ?? data.error}`)
  return data
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
      const refreshed = await refreshViaWorker(refreshToken)
      const client = getOAuthClient()
      client.setCredentials({
        access_token: refreshed.access_token,
        refresh_token: refreshToken,
        expiry_date: Date.now() + refreshed.expires_in * 1000,
      })
      tokenData = {
        accessToken: refreshed.access_token,
        refreshToken,
        expiresAt: Date.now() + refreshed.expires_in * 1000,
        email,
        name: name ?? email,
      }
      oauthClient = client
    }
  } catch {
    // Token expired or worker unreachable — user will need to sign in again
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
  const refreshed = await refreshViaWorker(tokenData!.refreshToken)
  tokenData!.accessToken = refreshed.access_token
  tokenData!.expiresAt = Date.now() + refreshed.expires_in * 1000
  const client = getOAuthClient()
  client.setCredentials({
    access_token: refreshed.access_token,
    expiry_date: tokenData!.expiresAt,
  })
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

  // Exchange code via worker — client_secret stays server-side
  const tokens = await exchangeCodeViaWorker(code, redirectUri, verifier)

  client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: Date.now() + tokens.expires_in * 1000,
  })
  oauthClient = client

  const { google } = await import('googleapis')
  const oauth2 = google.oauth2({ version: 'v2', auth: client })
  const { data } = await oauth2.userinfo.get()

  const keytar = await getKeytar()
  await keytar.setPassword('recall', 'google-refresh-token', tokens.refresh_token)
  await keytar.setPassword('recall', 'google-email', data.email!)
  await keytar.setPassword('recall', 'google-name', data.name ?? data.email!)

  tokenData = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
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
