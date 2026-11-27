import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { EndpointHolding } from '@omne-harness/mcp-contract'
import type {
  GrantKey,
  OAuthAnswer,
  OAuthBody,
  OAuthFetch,
} from '@omne-harness/mcp-contract/provider'
import {
  createMemoryAuthorizationRecords,
  createMemoryGrantSecrets,
} from '@omne-harness/mcp-contract/testing'
import { createMcpAuthorization, type McpAuthorizationDeps } from '@omne-harness/mcp-authorization'

export const RESOURCE = 'https://mcp.example/mcp'
export const ISSUER = 'https://auth.example'
export const REDIRECT = 'http://127.0.0.1:7801/callback'

export function tenantOf(last: string): TenantId {
  const organization = organizationCodec.parse(`org_0123456789abcdefghjkmnpqr${last}`)
  const account = accountCodec.parse(`acc_0123456789abcdefghjkmnpqr${last}`)
  if (!organization.ok || !account.ok) throw new TypeError('bad tenant sample')
  return tenant(organization.value, account.value)
}

export const keyOf = (last = 's', holding = 'holding-1'): GrantKey => ({
  tenant: tenantOf(last),
  holding: holding as EndpointHolding,
})

export function serverMetadata(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/authorize`,
    token_endpoint: `${ISSUER}/token`,
    registration_endpoint: `${ISSUER}/register`,
    code_challenge_methods_supported: ['S256'],
    authorization_response_iss_parameter_supported: true,
    scopes_supported: ['read', 'write'],
    ...overrides,
  }
}

type TokenAnswer = OAuthAnswer | 'no-answer' | (() => Promise<OAuthAnswer | 'no-answer'>)

export type Sent = Readonly<{
  method: 'GET' | 'POST'
  url: string
  body?: OAuthBody
  headers?: Readonly<Record<string, string>>
}>

/** A scripted authorization server and protected resource: answers by address, counts what it was sent. */
export function scriptedServer() {
  const sent: Sent[] = []
  const documents = new Map<string, unknown>([
    [
      `https://mcp.example/.well-known/oauth-protected-resource/mcp`,
      { resource: RESOURCE, authorization_servers: [ISSUER], scopes_supported: ['read'] },
    ],
    [`${ISSUER}/.well-known/oauth-authorization-server`, serverMetadata()],
  ])
  const tokens: TokenAnswer[] = []
  let registration: OAuthAnswer = { status: 201, json: { client_id: 'client-dyn' } }
  const fetch: OAuthFetch = {
    async get(url) {
      sent.push({ method: 'GET', url })
      return documents.has(url)
        ? succeed({ status: 200, json: documents.get(url) })
        : succeed({ status: 404, json: undefined })
    },
    async post(url, body, headers) {
      sent.push({ method: 'POST', url, body, headers })
      if (url === `${ISSUER}/register`) return succeed(registration)
      const next = tokens.shift() ?? 'no-answer'
      const answer = typeof next === 'function' ? await next() : next
      return answer === 'no-answer' ? fail('no-answer') : succeed(answer)
    },
  }
  return {
    fetch,
    sent,
    documents,
    /** The token endpoint answers these, one per request, in order; after them, no answer. */
    answer: (...answers: TokenAnswer[]) => tokens.push(...answers),
    registerWith: (answer: OAuthAnswer) => {
      registration = answer
    },
    tokenRequests: () => sent.filter(item => item.url === `${ISSUER}/token`),
  }
}

export const issued = (
  access: string,
  refresh?: string,
  expiresIn = 3600,
  scope?: string,
): OAuthAnswer => ({
  status: 200,
  json: {
    access_token: access,
    token_type: 'Bearer',
    expires_in: expiresIn,
    ...(refresh === undefined ? {} : { refresh_token: refresh }),
    ...(scope === undefined ? {} : { scope }),
  },
})

export const refused = (error = 'invalid_grant'): OAuthAnswer => ({ status: 400, json: { error } })

export function world(overrides: Partial<McpAuthorizationDeps> = {}) {
  const server = scriptedServer()
  const records = createMemoryAuthorizationRecords()
  const secrets = createMemoryGrantSecrets()
  let clock = 1_800_000_000_000
  let counter = 0
  const deps: McpAuthorizationDeps = {
    records,
    secrets,
    fetch: server.fetch,
    now: () => clock,
    random: bytes => Uint8Array.from({ length: bytes }, () => (counter += 1) % 256),
    pendingMs: 600_000,
    refreshLeadMs: 60_000,
    requestMs: 5_000,
    ...overrides,
  }
  const authorization = createMcpAuthorization(deps)
  return {
    authorization,
    server,
    records,
    secrets,
    deps,
    advance: (ms: number) => {
      clock += ms
    },
    now: () => clock,
  }
}

export type World = ReturnType<typeof world>

const never = new AbortController().signal

export async function beginOn(w: World, key = keyOf()) {
  const begun = await w.authorization.begin({
    key,
    target: RESOURCE,
    redirectUri: REDIRECT,
    initiator: 'alice',
    signal: never,
  })
  if (!('ok' in begun)) throw new Error(`begin failed: ${JSON.stringify(begun)}`)
  const url = new URL(begun.ok.url)
  return { url, state: url.searchParams.get('state') ?? '', begun: begun.ok }
}

/** Connects a grant: begin, a callback from the authorization server, one token answer. */
export async function connected(
  w: World,
  key = keyOf(),
  access = 'at-1',
  refresh = 'rt-1',
  expiresIn = 3600,
) {
  const { state } = await beginOn(w, key)
  w.server.answer(issued(access, refresh, expiresIn))
  const outcome = await w.authorization.callback({ state, code: 'code-1', iss: ISSUER }, never)
  if (outcome !== 'connected') throw new Error(`callback: ${outcome}`)
  return key
}

export { never }
