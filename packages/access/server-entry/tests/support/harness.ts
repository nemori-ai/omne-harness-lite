// The test harness: a server entry on a loopback port with the identity reference double, the
// in-process principal authority and the Session double, plus the HTTP helpers that the cases use.
import { createHash } from 'node:crypto'
import { request as httpRequest, type IncomingMessage } from 'node:http'
import { connect } from 'node:net'
import {
  inProcessPrincipalAuthority,
  type IdentityOperations,
  type PrincipalIssuer,
} from '@omne-harness/identity'
import {
  adjustableLoginTerms,
  inProcessIdentityOperations,
  manualIdentityClock,
} from '@omne-harness/identity/testing'
import { parseDuration, parseInstant } from '@omne-harness/utc-instant'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  createServerEntry,
  type ResolvedDefinition,
  type ServerEntry,
  type ServerEntryConfig,
  type ServerEntryDependencies,
  type ServerEntryDiagnostic,
} from '../../src/index.ts'
import { createSessionDouble, type SessionDouble } from './session-double.ts'

export const GOVERNANCE_PATH = '/governance-public/1'
export const SESSION_PATH = '/session-public/1'

export const encoder = new TextEncoder()
export const decoder = new TextDecoder()

export const DEFINITION = 'assistant'

export function resolveDefinition(name: string): ResolvedDefinition | undefined {
  if (name !== DEFINITION) return undefined
  return {
    candidate: { owner: 'fixture', name: 'assistant@1', revision: '1', digest: 'sha256:assistant' },
    execution: { owner: 'fixture', name: 'execution', revision: '1', digest: 'sha256:execution' },
    entryContract: { owner: 'fixture', name: 'entry', revision: '1', digest: 'sha256:entry' },
    requiredIdentities: [],
    tenantDefaults: {
      owner: 'fixture',
      name: 'defaults',
      revision: '1',
      digest: 'sha256:defaults',
    },
  }
}

export function baseConfig(overrides: Partial<ServerEntryConfig> = {}): ServerEntryConfig {
  return {
    listenAddress: '127.0.0.1',
    listenPort: 0,
    maxBodyBytes: { small: 2048, input: 65536 },
    heartbeatIntervalMs: 40,
    jsonBudgets: {
      maxDepth: 16,
      maxItems: 4096,
      maxMembers: 256,
      maxStringLength: 65536,
      maxNumberLength: 32,
    },
    maxPageBytes: 65536,
    historyKinds: ['message.user', 'message.assistant'],
    observation: { perLogin: 2, perInstance: 8, cancelRetentionMs: 200 },
    ...overrides,
  }
}

export type Fixture = Readonly<{
  entry: ServerEntry
  port: number
  identity: IdentityOperations
  issuer: PrincipalIssuer
  session: SessionDouble
  diagnostics: ServerEntryDiagnostic[]
  members: Map<string, Set<string>>
  stop(): Promise<void>
}>

export type FixtureOptions = Readonly<{
  config?: Partial<ServerEntryConfig>
  identity?: (base: IdentityOperations) => IdentityOperations
  issuer?: (base: PrincipalIssuer) => PrincipalIssuer
  dependencies?: Partial<ServerEntryDependencies>
}>

export function identityDouble(): IdentityOperations {
  const start = parseInstant('2026-11-02T00:00:00Z')
  const lifetime = parseDuration('PT3600S')
  const idle = parseDuration('PT600S')
  if (!start.ok || !lifetime.ok || !idle.ok) throw new Error('fixture time did not parse')
  return inProcessIdentityOperations({
    clock: manualIdentityClock(start.value).clock,
    terms: adjustableLoginTerms({ maxLifetime: lifetime.value, idlePeriod: idle.value }).source,
  })
}

export async function startFixture(options: FixtureOptions = {}): Promise<Fixture> {
  const members = new Map<string, Set<string>>()
  const session = createSessionDouble({ members })
  const baseIdentity = identityDouble()
  const identity = options.identity?.(baseIdentity) ?? baseIdentity
  const authority = inProcessPrincipalAuthority()
  const issuer = options.issuer?.(authority.issuer) ?? authority.issuer
  const diagnostics: ServerEntryDiagnostic[] = []
  const entry = createServerEntry({
    config: baseConfig(options.config),
    dependencies: {
      identity,
      issuer,
      session: session.faces,
      resolveDefinition,
      diagnostics: event => diagnostics.push(event),
      ...options.dependencies,
    },
  })
  const listening = await entry.start()
  return {
    entry,
    port: listening.port,
    identity,
    issuer,
    session,
    diagnostics,
    members,
    stop: () => entry.stop(),
  }
}

export type HttpReply = Readonly<{
  status: number
  headers: IncomingMessage['headers']
  body: Uint8Array
  text: string
  json: unknown
}>

export type RequestOptions = Readonly<{
  method?: string
  path?: string
  headers?: Readonly<Record<string, string>>
  body?: Uint8Array | string
}>

/** One HTTP request to the fixture. Headers default to a legal JSON POST on `path`. */
export function send(port: number, path: string, options: RequestOptions = {}): Promise<HttpReply> {
  const body =
    options.body === undefined
      ? new Uint8Array()
      : typeof options.body === 'string'
        ? encoder.encode(options.body)
        : options.body
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'content-length': String(body.byteLength),
    ...options.headers,
  }
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        method: options.method ?? 'POST',
        path: options.path ?? path,
        headers,
      },
      res => {
        const chunks: Uint8Array[] = []
        res.on('data', (chunk: Uint8Array) => chunks.push(chunk))
        res.on('end', () => {
          const bytes = Buffer.concat(chunks)
          const text = decoder.decode(bytes)
          let json: unknown
          try {
            json = text === '' ? undefined : JSON.parse(text)
          } catch {
            json = undefined
          }
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: bytes, text, json })
        })
        res.on('error', reject)
      },
    )
    req.on('error', reject)
    req.end(body)
  })
}

/** One raw HTTP/1.1 exchange over a socket, for header edge cases. Returns the full response text. */
export function raw(port: number, text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port }, () => socket.write(text))
    const chunks: Uint8Array[] = []
    socket.on('data', (chunk: Uint8Array) => chunks.push(chunk))
    socket.on('end', () => resolve(decoder.decode(Buffer.concat(chunks))))
    socket.on('close', () => resolve(decoder.decode(Buffer.concat(chunks))))
    socket.on('error', reject)
  })
}

export function message(fields: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(fields)
}

export function governance(
  operation: string,
  body: unknown,
  extra: Readonly<Record<string, unknown>> = {},
  messageId = 'm-1',
): string {
  return message({ protocolVersion: 'governance-public/1', messageId, operation, body, ...extra })
}

export function sessionMessage(
  operation: string,
  body: unknown,
  extra: Readonly<Record<string, unknown>> = {},
  messageId = 'm-1',
): string {
  return message({ protocolVersion: 'session-public/1', messageId, operation, body, ...extra })
}

export type Login = Readonly<{
  loginProof: string
  tenant: TenantId
  tenantText: string
  accountText: string
  loginIdentifier: string
  credential: string
}>

/** Registers an account and issues one login through the governance location. */
export async function login(
  fixture: Fixture,
  identifier: string,
  credential = 'pw-secret-1',
): Promise<Login> {
  const registered = await send(fixture.port, GOVERNANCE_PATH, {
    body: governance('register-and-activate', { loginIdentifier: identifier, credential }),
  })
  if (registered.status !== 200) throw new Error(`register failed: ${registered.text}`)
  const issued = await send(fixture.port, GOVERNANCE_PATH, {
    body: governance('issue-login', { loginIdentifier: identifier, credential }),
  })
  if (issued.status !== 200) throw new Error(`issue-login failed: ${issued.text}`)
  const body = (issued.json as { body: { loginProof: string; tenantId: string } }).body
  const tenant = tenantCodec.parse(body.tenantId)
  if (!tenant.ok) throw new Error('issued tenant did not parse')
  const accountText = tenant.value.account.text
  const key = `${tenant.value.organization.text}/${accountText}`
  const existing = fixture.members.get(key) ?? new Set<string>()
  existing.add(accountText)
  fixture.members.set(key, existing)
  return {
    loginProof: body.loginProof,
    tenant: tenant.value,
    tenantText: body.tenantId,
    accountText,
    loginIdentifier: identifier,
    credential,
  }
}

export function sha256Hex(parts: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}

export function sessionTextOf(tenantText: string, createCallId: string): string {
  return sha256Hex(['session-public/1:session', tenantText, createCallId])
}

export function userMessageWire(text: string): Record<string, unknown> {
  return {
    id: 'msg_abcdefghijklmnopqrstuv',
    role: 'user',
    blocks: [
      {
        kind: 'text',
        id: 'block-1',
        visibility: { toHuman: true, toModel: true },
        text,
      },
    ],
  }
}

/** Creates a session for `login` and returns its session text. */
export async function createSession(
  fixture: Fixture,
  who: Login,
  createCallId = 'create-1',
): Promise<string> {
  const reply = await send(fixture.port, SESSION_PATH, {
    body: sessionMessage(
      'create-session',
      { createCallId, definition: DEFINITION, purpose: 'test' },
      { loginProof: who.loginProof, actingTenant: who.tenantText },
    ),
  })
  if (reply.status !== 200) throw new Error(`create-session failed: ${reply.text}`)
  return (reply.json as { body: { session: string } }).body.session
}

/** Opens an SSE response and collects events as they arrive. */
export type SseClient = Readonly<{
  status: Promise<number>
  headers: Promise<IncomingMessage['headers']>
  /** Every raw chunk of the response body, in order. */
  chunks: string[]
  events: () => readonly unknown[]
  /** Resolves when the response has at least `count` events. */
  waitForEvents(count: number, timeoutMs?: number): Promise<readonly unknown[]>
  /** Resolves when the raw body contains `needle`. */
  waitForText(needle: string, timeoutMs?: number): Promise<void>
  ended: Promise<void>
  close(): void
}>

export function openSse(port: number, body: string): SseClient {
  const chunks: string[] = []
  let resolveStatus: (status: number) => void = () => {}
  let resolveHeaders: (headers: IncomingMessage['headers']) => void = () => {}
  let resolveEnded: () => void = () => {}
  const status = new Promise<number>(resolve => {
    resolveStatus = resolve
  })
  const headers = new Promise<IncomingMessage['headers']>(resolve => {
    resolveHeaders = resolve
  })
  const ended = new Promise<void>(resolve => {
    resolveEnded = resolve
  })
  const bytes = encoder.encode(body)
  const req = httpRequest(
    {
      host: '127.0.0.1',
      port,
      method: 'POST',
      path: SESSION_PATH,
      headers: { 'content-type': 'application/json', 'content-length': String(bytes.byteLength) },
    },
    res => {
      resolveStatus(res.statusCode ?? 0)
      resolveHeaders(res.headers)
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => chunks.push(chunk))
      res.on('end', () => resolveEnded())
      res.on('close', () => resolveEnded())
    },
  )
  req.on('error', () => resolveEnded())
  req.end(bytes)
  const text = () => chunks.join('')
  const events = (): readonly unknown[] =>
    text()
      .split('\n\n')
      .filter(block => block.startsWith('data: '))
      .map(block => JSON.parse(block.slice('data: '.length)) as unknown)
  const until = async (ready: () => boolean, timeoutMs: number, what: string): Promise<void> => {
    const deadline = Date.now() + timeoutMs
    while (!ready()) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}: ${text()}`)
      await new Promise(resolve => setTimeout(resolve, 5))
    }
  }
  return {
    status,
    headers,
    chunks,
    events,
    waitForEvents: async (count, timeoutMs = 2000) => {
      await until(() => events().length >= count, timeoutMs, `${count} events`)
      return events()
    },
    waitForText: (needle, timeoutMs = 2000) =>
      until(() => text().includes(needle), timeoutMs, `text ${needle}`),
    ended,
    close: () => req.destroy(),
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
