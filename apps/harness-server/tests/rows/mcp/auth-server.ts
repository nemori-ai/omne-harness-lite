import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

type Code = Readonly<{ challenge: string; clientId: string; redirectUri: string; resource: string }>

export type AuthServerOptions = Readonly<{ expiresIn?: number }>

/** A local OAuth authorization server that is also the protected resource's metadata: it consents at once and counts what it was sent. */
export async function testAuthServer(options: AuthServerOptions = {}) {
  const counts = { registrations: 0, authorizations: 0, exchanges: 0, refreshes: 0, refused: 0 }
  const codes = new Map<string, Code>()
  const refreshTokens = new Set<string>()
  const accessTokens = new Set<string>()
  let serial = 0
  let refuseRefresh = false
  let base = ''

  const json = (response: ServerResponse, status: number, value: unknown) => {
    response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value))
  }
  const issue = (response: ServerResponse) => {
    serial += 1
    const access = `at-${String(serial)}`
    const refresh = `rt-${String(serial)}`
    accessTokens.add(access)
    refreshTokens.add(refresh)
    json(response, 200, {
      access_token: access,
      token_type: 'Bearer',
      expires_in: options.expiresIn ?? 3600,
      refresh_token: refresh,
    })
  }
  const exchange = (form: URLSearchParams, response: ServerResponse) => {
    const code = codes.get(form.get('code') ?? '')
    codes.delete(form.get('code') ?? '')
    const verifier = form.get('code_verifier') ?? ''
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    if (
      code === undefined ||
      code.challenge !== challenge ||
      code.redirectUri !== form.get('redirect_uri')
    )
      return json(response, 400, { error: 'invalid_grant' })
    counts.exchanges += 1
    issue(response)
  }
  const refresh = (form: URLSearchParams, response: ServerResponse) => {
    const token = form.get('refresh_token') ?? ''
    if (refuseRefresh || !refreshTokens.delete(token)) {
      counts.refused += 1
      return json(response, 400, { error: 'invalid_grant' })
    }
    counts.refreshes += 1
    issue(response)
  }
  const authorize = (url: URL, response: ServerResponse) => {
    counts.authorizations += 1
    const redirect = new URL(url.searchParams.get('redirect_uri') ?? '')
    const code = `code-${String(counts.authorizations)}`
    codes.set(code, {
      challenge: url.searchParams.get('code_challenge') ?? '',
      clientId: url.searchParams.get('client_id') ?? '',
      redirectUri: redirect.href,
      resource: url.searchParams.get('resource') ?? '',
    })
    redirect.searchParams.set('code', code)
    redirect.searchParams.set('state', url.searchParams.get('state') ?? '')
    redirect.searchParams.set('iss', base)
    response.writeHead(302, { location: redirect.href }).end()
  }
  const route = (request: IncomingMessage, body: string, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', base)
    if (url.pathname === '/.well-known/oauth-protected-resource/mcp')
      return json(response, 200, {
        resource: `${base}/mcp`,
        authorization_servers: [base],
        scopes_supported: ['read'],
      })
    if (url.pathname === '/.well-known/oauth-authorization-server')
      return json(response, 200, {
        issuer: base,
        authorization_endpoint: `${base}/authorize`,
        token_endpoint: `${base}/token`,
        registration_endpoint: `${base}/register`,
        code_challenge_methods_supported: ['S256'],
        authorization_response_iss_parameter_supported: true,
      })
    if (url.pathname === '/register') {
      counts.registrations += 1
      return json(response, 201, { client_id: `client-${String(counts.registrations)}` })
    }
    if (url.pathname === '/authorize') return authorize(url, response)
    if (url.pathname === '/token') {
      const form = new URLSearchParams(body)
      return form.get('grant_type') === 'refresh_token'
        ? refresh(form, response)
        : exchange(form, response)
    }
    response.writeHead(404).end()
  }
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', chunk => (body += String(chunk)))
    request.on('end', () => route(request, body, response))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
  return {
    base,
    target: `${base}/mcp`,
    counts,
    holds: (token: string) => accessTokens.has(token),
    /** The access token it issued last. */
    latest: () => `at-${String(serial)}`,
    refuseRefresh: () => {
      refuseRefresh = true
    },
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  }
}

/** A loopback port nobody listens on now. */
export async function freePort(): Promise<number> {
  const probe = createServer()
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve))
  const { port } = probe.address() as AddressInfo
  await new Promise(resolve => probe.close(resolve))
  return port
}
