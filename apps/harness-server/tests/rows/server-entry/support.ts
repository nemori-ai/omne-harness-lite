// Shared fixtures of the `server-entry` row tests: the contract-double rows that stand next to the
// row in a `serve` tree (identity operations, the Session faces, the definition mapping), the
// HTTP helpers, and a harness that keeps the tree open while a test talks to the loopback port.
import { createHash } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { connect, createServer } from 'node:net'
import { Service, type Context, type Plugin } from '@deepseek-ai/cordis'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { IdentityOperationsService, principalVerifierKey } from '@omne-harness/identity/cordis'
import {
  adjustableLoginTerms,
  inProcessIdentityOperations,
  manualIdentityClock,
} from '@omne-harness/identity/testing'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  DefinitionMappingsService,
  definitionMappingsKey,
  type DefinitionMappingEntry,
} from '@omne-harness/server-entry/cordis'
import { evidence } from '@omne-harness/session-contract/testing'
import { SessionService, sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { parseDuration, parseInstant } from '@omne-harness/utc-instant'
import { stubPlugin } from '../../../src/cordis.ts'
import { entryObjects } from '../../../src/entry/index.ts'
import { defineRow } from '../../../src/row.ts'
import { serverEntryRow } from '../../../src/rows/server-entry/index.ts'
import { serveOnce, type ServeRun } from '../../fixtures/serve/harness.ts'

export const GOVERNANCE_PATH = '/governance-public/1'
export const SESSION_PATH = '/session-public/1'
export const DEFINITION = 'assistant'

export function governance(operation: string, body: unknown, messageId = 'm-1'): string {
  return JSON.stringify({ protocolVersion: 'governance-public/1', messageId, operation, body })
}

export function sessionMessage(
  operation: string,
  body: unknown,
  extra: Record<string, unknown> = {},
  messageId = 'm-1',
): string {
  return JSON.stringify({
    protocolVersion: 'session-public/1',
    messageId,
    operation,
    body,
    ...extra,
  })
}

export type Reply = Readonly<{ status: number; body: string; json: unknown }>

/** One HTTP POST to the loopback port. */
export function post(port: number, path: string, body: string): Promise<Reply> {
  const bytes = Buffer.from(body, 'utf8')
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        method: 'POST',
        path,
        agent: false,
        headers: { 'content-type': 'application/json', 'content-length': String(bytes.length) },
      },
      res => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const answer = Buffer.concat(chunks).toString('utf8')
          let json: unknown
          try {
            json = answer === '' ? undefined : JSON.parse(answer)
          } catch {
            json = undefined
          }
          resolve({ status: res.statusCode ?? 0, body: answer, json })
        })
        res.on('error', reject)
      },
    )
    req.on('error', reject)
    req.end(bytes)
  })
}

/** A port that was free a moment ago. The row needs a fixed port, so the test picks one first. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      probe.close(() => resolve(port))
    })
  })
}

/** Whether a TCP connection to `host:port` succeeds right now. */
export function connectable(host: string, port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = connect({ host, port, timeout: 1000 }, () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.on('error', () => resolve(false))
  })
}

export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

export async function until(
  ready: () => boolean | Promise<boolean>,
  what: string,
  ms = 5000,
): Promise<void> {
  const deadline = Date.now() + ms
  while (!(await ready())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await sleep(10)
  }
}

// --- identity operations (row `identity`, contract double) -------------------------------------

function identityOperations() {
  const start = parseInstant('2026-11-02T00:00:00Z')
  const lifetime = parseDuration('PT3600S')
  const idle = parseDuration('PT600S')
  if (!start.ok || !lifetime.ok || !idle.ok) throw new Error('fixture time did not parse')
  return inProcessIdentityOperations({
    clock: manualIdentityClock(start.value).clock,
    terms: adjustableLoginTerms({ maxLifetime: lifetime.value, idlePeriod: idle.value }).source,
  })
}

class IdentityDouble extends IdentityOperationsService {
  readonly registerAndActivate: IdentityOperationsService['registerAndActivate']
  readonly issueLogin: IdentityOperationsService['issueLogin']
  readonly recognizeLogin: IdentityOperationsService['recognizeLogin']
  constructor(ctx: Context) {
    super(ctx)
    const operations = identityOperations()
    this.registerAndActivate = input => operations.registerAndActivate(input)
    this.issueLogin = input => operations.issueLogin(input)
    this.recognizeLogin = input => operations.recognizeLogin(input)
  }
}

export const identityDoubleRow = defineRow({
  row: 'identity',
  implementation: 'contract-double',
  manifest: { provides: [IdentityOperationsService.provide], injects: [], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'identity-double',
    apply(ctx: Context) {
      new IdentityDouble(ctx)
    },
  },
})

// --- the Session faces (row `session-provider`, contract double) -------------------------------

export type SessionCall = Readonly<{
  face: 'create' | 'accept' | 'begin'
  /** The caller class the row asked the faces for (`intake` or `reader`). */
  caller: string | undefined
  /** What the principal verifier says about the principal that reached the face. */
  verdict: string
  /** The component name of the system actor behind the principal. */
  actorComponent: string | undefined
}>

export type SessionRecorder = Readonly<{
  calls: SessionCall[]
  /** Called inside `create` before it answers. A test holds a request open with it. */
  gate: { create: (() => Promise<void>) | undefined }
}>

export function newRecorder(): SessionRecorder {
  return { calls: [], gate: { create: undefined } }
}

type AccessLike = Readonly<{ principal: unknown; operation?: string }>

function actorComponentOf(principal: unknown): string | undefined {
  if (typeof principal !== 'object' || principal === null || !('actor' in principal))
    return undefined
  const actor: unknown = principal.actor
  if (typeof actor !== 'object' || actor === null || !('component' in actor)) return undefined
  return typeof actor.component === 'string' ? actor.component : undefined
}

const receiptOf = (operation: string, revision: string) => ({
  operation,
  revision,
  first: `entry-${revision}`,
  last: `entry-${revision}`,
  recovered: false,
  source: evidence(`double/${operation}`),
})

class SessionDouble extends SessionService<unknown> {
  readonly recorder: SessionRecorder
  readonly verifier: PrincipalVerifier
  constructor(ctx: Context, recorder: SessionRecorder, verifier: PrincipalVerifier) {
    super(ctx)
    this.recorder = recorder
    this.verifier = verifier
  }

  // The faces are read once, while the row builds its dependencies. `this.ctx` is then the context
  // the row asked with, so the caller class is fixed by that read.
  private facesFor(): Readonly<{
    caller: string | undefined
    record: (face: SessionCall['face'], access: AccessLike) => Promise<void>
  }> {
    const config: { caller?: string } = this[Service.resolveConfig]()
    const caller = config.caller
    const record = async (face: SessionCall['face'], access: AccessLike): Promise<void> => {
      const verified = await this.verifier.verify(access.principal as never)
      this.recorder.calls.push({
        face,
        caller,
        verdict: verified.kind,
        actorComponent: actorComponentOf(access.principal),
      })
    }
    return { caller, record }
  }

  get management(): SessionService<unknown>['management'] {
    const { record } = this.facesFor()
    return {
      create: async (input: AccessLike & { operation: string }) => {
        await record('create', input)
        await this.recorder.gate.create?.()
        return succeed({ receipt: receiptOf(input.operation, '1'), state: {} })
      },
    } as never
  }

  get work(): SessionService<unknown>['work'] {
    const { record } = this.facesFor()
    return {
      accept: async (input: AccessLike & { operation: string }) => {
        await record('accept', input)
        return succeed(receiptOf(input.operation, '2'))
      },
    } as never
  }

  get history(): SessionService<unknown>['history'] {
    const { record } = this.facesFor()
    return {
      begin: async (input: AccessLike) => {
        await record('begin', input)
        return succeed({
          source: 'double',
          interpreter: { owner: 'double', name: 'history', revision: '1', digest: 'sha256:h' },
          upper: '2',
          entries: [],
          scannedThrough: '0',
          next: null,
          exhausted: true,
          annotations: [],
        })
      },
      next: async () => fail({ kind: 'invalid', field: 'cursor', reason: 'foreign' }),
    } as never
  }

  get reconciliation(): SessionService<unknown>['reconciliation'] {
    return {} as never
  }
}

export function sessionDoubleRow(recorder: SessionRecorder) {
  return defineRow({
    row: 'session-provider',
    implementation: 'contract-double',
    manifest: { provides: [sessionKey], injects: [principalVerifierKey], sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin: {
      name: 'session-double',
      inject: [principalVerifierKey],
      apply(ctx: Context) {
        new SessionDouble(ctx, recorder, ctx.principalVerifier)
      },
    },
  })
}

// --- the definition mapping (row `agent-adoptions`, contract double) ---------------------------

const adoption = (name: string) => ({
  owner: 'fixture',
  name,
  revision: '1',
  digest: `sha256:${name}`,
})

const ENTRY: DefinitionMappingEntry = {
  name: DEFINITION,
  candidate: adoption('assistant@1'),
  execution: adoption('execution'),
  entryContract: adoption('entry'),
  requiredIdentities: [],
  modes: { permission: 'never', environment: adoption('env'), collaboration: 'co-work' },
}

class MappingsDouble extends DefinitionMappingsService {
  readonly identity = createHash('sha256').update('fixture').digest('hex')
  entries() {
    return [ENTRY]
  }
  byName(name: string) {
    return name === DEFINITION ? ENTRY : undefined
  }
  byCandidate(candidate: { name: string }) {
    return candidate.name === ENTRY.candidate.name ? ENTRY : undefined
  }
}

export const mappingsDoubleRow = defineRow({
  row: 'agent-adoptions',
  implementation: 'contract-double',
  manifest: { provides: [definitionMappingsKey], injects: [], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'mappings-double',
    apply(ctx: Context) {
      new MappingsDouble(ctx)
    },
  },
})

// --- the tree ----------------------------------------------------------------------------------

export type TreeOptions = Readonly<{
  /** The row configuration of `server-entry`. */
  config: unknown
  /** Leave the identity row out. */
  withoutIdentity?: boolean
  /** Leave the Session row out. */
  withoutSession?: boolean
  /** Extra distribution rows and their plugins (for example a row that stays PENDING). */
  extraRows?: readonly { id: string; plugin: string; config?: unknown }[]
  extraPlugins?: Readonly<Record<string, Plugin>>
  readinessTimeoutMs?: number
  shutdownDeadlineMs?: number
}>

export type LiveTree = Readonly<{
  recorder: SessionRecorder
  /** Asks for the planned stop and returns the whole run. */
  stop(reason?: string): Promise<ServeRun>
  /** The run, once it ends. */
  finished: Promise<ServeRun>
}>

/** Starts the tree without waiting. The caller polls the port, then calls `stop`. */
export function startTree(options: TreeOptions): LiveTree {
  const recorder = newRecorder()
  const controller = new AbortController()
  const rows = [
    ...(options.withoutIdentity === true
      ? []
      : [{ id: 'identity', plugin: 'identityDouble', config: {} }]),
    ...(options.withoutSession === true
      ? []
      : [{ id: 'session-provider', plugin: 'sessionDouble', config: {} }]),
    { id: 'agent-adoptions', plugin: 'mappingsDouble', config: {} },
    { id: 'server-entry', plugin: 'serverEntryRow', config: options.config },
    ...(options.extraRows ?? []).map(row => ({ config: {}, ...row })),
  ]
  const finished = serveOnce({
    distribution: { rows },
    plugins: {
      stubPlugin,
      identityDouble: identityDoubleRow,
      sessionDouble: sessionDoubleRow(recorder),
      mappingsDouble: mappingsDoubleRow,
      serverEntryRow,
      ...options.extraPlugins,
    },
    entryObjects,
    stopAfterStartup: false,
    stop: controller.signal,
    readinessTimeoutMs: options.readinessTimeoutMs ?? 1500,
    shutdownDeadlineMs: options.shutdownDeadlineMs ?? 4000,
  })
  return {
    recorder,
    finished,
    stop: reason => {
      controller.abort(reason ?? 'test: stop')
      return finished
    },
  }
}

/** Waits until the port accepts connections, or the tree ends first (then it throws). */
export async function waitListening(tree: LiveTree, port: number): Promise<void> {
  let ended = false
  void tree.finished.then(
    () => (ended = true),
    () => (ended = true),
  )
  await until(async () => {
    if (ended) throw new Error('the tree ended before the entry listened')
    return connectable('127.0.0.1', port)
  }, `port ${port} to listen`)
}

export type Login = Readonly<{ loginProof: string; tenantText: string; reply: Reply }>

/** Register and activate, then issue a login. */
export async function login(port: number, identifier: string, credential: string): Promise<Login> {
  const registered = await post(
    port,
    GOVERNANCE_PATH,
    governance('register-and-activate', { loginIdentifier: identifier, credential }),
  )
  if (registered.status !== 200) throw new Error(`register failed: ${registered.status}`)
  const issued = await post(
    port,
    GOVERNANCE_PATH,
    governance('issue-login', { loginIdentifier: identifier, credential }),
  )
  if (issued.status !== 200) throw new Error(`issue-login failed: ${issued.status}`)
  const body = (issued.json as { body: { loginProof: string; tenantId: string } }).body
  return { loginProof: body.loginProof, tenantText: body.tenantId, reply: issued }
}

export function createSessionBody(who: Login, createCallId: string): string {
  return sessionMessage(
    'create-session',
    { createCallId, definition: DEFINITION, purpose: 'test' },
    { loginProof: who.loginProof, actingTenant: who.tenantText },
  )
}
