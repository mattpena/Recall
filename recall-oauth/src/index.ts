/**
 * Recall OAuth Worker
 *
 * Proxies OAuth token exchanges so the client secrets never ship in the desktop app.
 * The desktop app sends the auth code; this worker adds the secret and returns the token.
 *
 * Endpoints:
 *   POST /google/token   — exchange auth code for Google tokens
 *   POST /google/refresh — refresh a Google access token
 *   POST /slack/token    — exchange auth code for Slack user token
 *
 * Required Worker environment variables (set via wrangler secret put or dashboard):
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   SLACK_CLIENT_ID
 *   SLACK_CLIENT_SECRET
 */

export interface Env {
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  SLACK_CLIENT_ID: string
  SLACK_CLIENT_SECRET: string
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204 })
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405)
    }

    // ── Google: exchange auth code ────────────────────────────────────────────
    if (url.pathname === '/google/token') {
      const { code, redirect_uri, code_verifier } = await request.json<{
        code: string
        redirect_uri: string
        code_verifier: string
      }>()

      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          code,
          redirect_uri,
          grant_type: 'authorization_code',
          code_verifier,
        }),
      })

      const data = await res.json()
      return json(data, res.status)
    }

    // ── Google: refresh access token ──────────────────────────────────────────
    if (url.pathname === '/google/refresh') {
      const { refresh_token } = await request.json<{ refresh_token: string }>()

      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          refresh_token,
          grant_type: 'refresh_token',
        }),
      })

      const data = await res.json()
      return json(data, res.status)
    }

    // ── Slack: exchange auth code ─────────────────────────────────────────────
    if (url.pathname === '/slack/token') {
      const { code, redirect_uri } = await request.json<{
        code: string
        redirect_uri: string
      }>()

      const res = await fetch('https://slack.com/api/oauth.v2.access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.SLACK_CLIENT_ID,
          client_secret: env.SLACK_CLIENT_SECRET,
          code,
          redirect_uri,
        }),
      })

      const data = await res.json()
      return json(data, res.status)
    }

    return json({ error: 'Not found' }, 404)
  },
}
