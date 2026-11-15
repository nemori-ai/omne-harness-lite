import { createHash } from 'node:crypto'
import { request as httpRequest, type IncomingMessage } from 'node:http'
import { connect } from 'node:net'
import {
  inProcessPrincipalAuthority,
  type IdentityGovernance,
  type IdentityOperations,
  type PrincipalIssuer,
} from '@omne-harness/identity'
import {
  adjustableInvitationTerms,
  adjustableLoginTerms,
  inProcessIdentity,
  manualIdentityClock,
  recordStoreFaults,
  type ManualIdentityClock,
  type RecordStoreFaultControl,
} from '@omne-harness/identity/testing'
import { parseDuration, parseInstant } from '@omne-harness/utc-instant'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  createServerEntry,
  type ResolvedDefinition,
  type ServerEntry,
  type ServerEntryConfig,
  type ServerEntryDependencies,
  type ServerEntryAccess,
  type ServerEntryDiagnostic,
} from '../../src/index.ts'
import { createSessionDouble, type SessionDouble } from './session-double.ts'

export const GOVERNANCE_PATH = '/governance-public/1'
export const SESSION_PATH = '/session-public/1'

export const encoder = new TextEncoder()
export const decoder = new TextDecoder()

export const DEFINITION = 'assistant'

export const INITIAL_MODEL_SELECTION = {
  name: 'fixture/model',
  basis: { owner: 'fixture', record: 'model-selection', revision: '1', digest: 'sha256:selection' },
} as const

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
    initialModelSelection: INITIAL_MODEL_SELECTION,
  }
}

export function baseConfig(overrides: Partial<ServerEntryConfig> = {}): ServerEntryConfig {
  return {
    listenAddress: '127.0.0.1',
    listenPort: 0,
    maxInFlightRequests: 64,
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
  governance: IdentityGovernance
  clock: ManualIdentityClock
  faults: RecordStoreFaultControl
  issuer: PrincipalIssuer
  session: SessionDouble
  diagnostics: ServerEntryDiagnostic[]
  members: Map<string, Set<string>>
  stop(): Promise<void>
}>

export type FixtureOptions = Readonly<{
  config?: Partial<ServerEntryConfig>
  identity?: (base: IdentityOperations) => IdentityOperations
  governance?: (base: IdentityGovernance) => IdentityGovernance
  issuer?: (base: PrincipalIssuer) => PrincipalIssuer
  dependencies?: Partial<ServerEntryDependencies>
  access?: ServerEntryAccess
}>

export const IDLE_PERIOD = 'PT600S'
export const MAX_LIFETIME = 'PT3600S'

function duration(text: string) {
  const parsed = parseDuration(text)
  if (!parsed.ok) throw new Error(`fixture duration ${text} did not parse`)
  return parsed.value
}

export type IdentityDouble = Readonly<{
  operations: IdentityOperations
  governance: IdentityGovernance
  clock: ManualIdentityClock
  faults: RecordStoreFaultControl
}>

export function identityDouble(): IdentityDouble {
  const start = parseInstant('2026-11-02T00:00:00Z')
  if (!start.ok) throw new Error('fixture time did not parse')
  const clock = manualIdentityClock(start.value)
  const faults = recordStoreFaults()
  const identity = inProcessIdentity({
    clock: clock.clock,
    terms: adjustableLoginTerms({
      maxLifetime: duration(MAX_LIFETIME),
      idlePeriod: duration(IDLE_PERIOD),
    }).source,
    invitationTerms: adjustableInvitationTerms({
      defaultDuration: duration('PT604800S'),
      maxDuration: duration('PT2592000S'),
    }).source,
    faults: faults.faults,
  })
  return { operations: identity.operations, governance: identity.governance, clock, faults }
}

export async function startFixture(options: FixtureOptions = {}): Promise<Fixture> {
  const members = new Map<string, Set<string>>()
  const session = createSessionDouble({ members })
  const double = identityDouble()
  const identity = options.identity?.(double.operations) ?? double.operations
  const governance =
    options.governance === undefined ? double.governance : options.governance(double.governance)
  const authority = inProcessPrincipalAuthority()
  const issuer = options.issuer?.(authority.issuer) ?? authority.issuer
  const diagnostics: ServerEntryDiagnostic[] = []
  const entry = createServerEntry({
    config: baseConfig(options.config),
    dependencies: {
      identity,
      governance,
      issuer,
      session: session.faces,
      resolveDefinition,
      diagnostics: event => diagnostics.push(event),
      ...options.dependencies,
    },
    ...(options.access === undefined ? {} : { access: options.access }),
  })
  const listening = await entry.start()
  return {
    entry,
    port: listening.port,
    identity,
    governance: double.governance,
    clock: double.clock,
    faults: double.faults,
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
  loginId: string
  tenant: TenantId
  tenantText: string
  accountText: string
  loginIdentifier: string
  credential: string
}>

export async function login(
  fixture: Pick<Fixture, 'port' | 'members'>,
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
  const body = (issued.json as { body: { loginProof: string; tenantId: string; loginId: string } })
    .body
  const tenant = tenantCodec.parse(body.tenantId)
  if (!tenant.ok) throw new Error('issued tenant did not parse')
  const accountText = tenant.value.account.text
  const key = `${tenant.value.organization.text}/${accountText}`
  const existing = fixture.members.get(key) ?? new Set<string>()
  existing.add(accountText)
  fixture.members.set(key, existing)
  return {
    loginProof: body.loginProof,
    loginId: body.loginId,
    tenant: tenant.value,
    tenantText: body.tenantId,
    accountText,
    loginIdentifier: identifier,
    credential,
  }
}

export async function anotherLogin(fixture: Fixture, who: Login): Promise<Login> {
  const issued = await send(fixture.port, GOVERNANCE_PATH, {
    body: governance('issue-login', {
      loginIdentifier: who.loginIdentifier,
      credential: who.credential,
    }),
  })
  if (issued.status !== 200) throw new Error(`issue-login failed: ${issued.text}`)
  const body = (issued.json as { body: { loginProof: string; tenantId: string; loginId: string } })
    .body
  return { ...who, loginProof: body.loginProof, loginId: body.loginId }
}

export function governed(
  who: Login,
  operation: string,
  body: unknown,
  acting: string | null = who.tenantText,
  messageId = 'm-1',
): string {
  return governance(
    operation,
    body,
    { loginProof: who.loginProof, ...(acting === null ? {} : { actingTenant: acting }) },
    messageId,
  )
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

export type SseClient = Readonly<{
  status: Promise<number>
  headers: Promise<IncomingMessage['headers']>
  chunks: string[]
  events: () => readonly unknown[]
  waitForEvents(count: number, timeoutMs?: number): Promise<readonly unknown[]>
  waitForText(needle: string, timeoutMs?: number): Promise<void>
  ended: Promise<void>
  close(): void
}>

export type SseOptions = Readonly<{
  path?: string
  headers?: Readonly<Record<string, string>>
}>

export function openSse(port: number, body: string, options: SseOptions = {}): SseClient {
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
      path: options.path ?? SESSION_PATH,
      headers: {
        'content-type': 'application/json',
        'content-length': String(bytes.byteLength),
        ...options.headers,
      },
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
