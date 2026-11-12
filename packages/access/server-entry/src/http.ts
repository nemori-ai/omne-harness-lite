// The HTTP layer of the entry (binding page「请求与响应规则」, SPEC「服务端的 HTTP 层责任」): the
// loopback listener, the five steps before the message, the body limit per path, the dispatch to
// the three locations, the answer writing, and stop. A failure of this layer or of the entry itself
// is the empty status 500 and a closed connection.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type {
  ActingForTenantPrincipal,
  IdentityGovernance,
  IdentityOperations,
  PrincipalIssuer,
} from '@omne-harness/identity'
import type { Answer, JsonAnswer } from './answers.ts'
import {
  LOOPBACK_ADDRESS,
  OUTPUT_LIMITS,
  ServerEntryConfigError,
  checkConfig,
  readLimits,
  type ServerEntryConfig,
} from './config.ts'
import { emit, type DiagnosticSink } from './diagnostics.ts'
import type {
  DefinitionResolver,
  HitlEntryPrincipals,
  HitlIngressFaces,
  SessionIngressFaces,
} from './faces.ts'
import { governanceProtocolRejected, handleGovernance } from './governance.ts'
import { HITL_PATH, handleHitl, hitlProtocolRejected, type HitlInstallation } from './hitl.ts'
import { createIdentitySteps } from './identity-steps.ts'
import type { SettingsGovernance } from './settings.ts'
import { createObservationRegistry } from './observation.ts'
import { handleSession } from './session.ts'
import { sessionProtocolRejected } from './session-codec.ts'
import { createDiagnosticsCursors, type DiagnosticPorts } from './session-view/index.ts'
import { SseStream } from './observation-hub/sse.ts'
import { pathOf } from './pipeline/address.ts'
import { readBody } from './pipeline/body.ts'
import { contentTypeAccepted, hostAccepted } from './pipeline/headers.ts'
import {
  createPipeline,
  type PipelineAccess,
  type Pipeline,
  type RequestSlots,
} from './pipeline/pipeline.ts'

export const GOVERNANCE_PATH = '/governance-public/1'
export const SESSION_PATH = '/session-public/1'

export type ServerEntryDependencies = Readonly<{
  identity: IdentityOperations
  /**
   * Identity's governance port over the same records as `identity`, so a revocation or a switch is
   * what the next login recognition reads. The eighteen governed operations and the report of a
   * successful business access go to it. An assembly that reads the provider per call answers
   * `basis-unavailable` from the port while the provider is absent (R2-D235 S1).
   */
  governance: IdentityGovernance
  issuer: PrincipalIssuer
  session: SessionIngressFaces<ActingForTenantPrincipal>
  resolveDefinition: DefinitionResolver
  /**
   * HITL 入口面（SPEC「HITL 位置」）。缺席时 HITL 位置的四个操作都答 `stage-not-provided`。
   * 给了它，配置就必须有 `hitlLocationRef`。
   */
  hitl?: HitlIngressFaces<ActingForTenantPrincipal>
  /** 入口主体持有者 `hitlEntryPrincipals`。缺席时 HITL 位置在第 3 步答 `basis-unavailable`。 */
  hitlEntryPrincipals?: HitlEntryPrincipals
  /**
   * The settings of the acting tenant (SPEC「设置项」). Absent: the four setting operations answer
   * `stage-not-provided`.
   */
  settings?: SettingsGovernance
  diagnostics?: DiagnosticSink
}> &
  /**
   * The read ports of the session diagnostics projection (SPEC「会话诊断投影」): Agent's finish
   * read, Model's call lookup and attempt diagnostics, Tool's call lookup and account. Each may
   * be absent; the projection then writes the corresponding gap with reason `unsupported`.
   */
  DiagnosticPorts<ActingForTenantPrincipal>

export type Listening = Readonly<{ address: string; port: number }>

/**
 * What turns the new address `/api/<protocol>/v<major>/<name>` on: the registry's pipeline side,
 * the identity port and the grace, all three or none (SPEC「管道」). Absent, `/api/...` answers 404.
 */
export type ServerEntryAccess = PipelineAccess

export interface ServerEntry {
  /** Listens on the loopback address. Rejects with `ServerEntryConfigError` for another address. Idempotent while listening. */
  start(): Promise<Listening>
  /** Stops accepting, ends every observation with `ended(unavailable)`, waits for in-flight requests, closes. */
  stop(): Promise<void>
}

type Location = Readonly<{
  path: typeof GOVERNANCE_PATH | typeof SESSION_PATH | typeof HITL_PATH
  maxBytes: number
  protocolRejected: () => JsonAnswer
}>

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8'

function writeEmpty(
  res: ServerResponse,
  status: number,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, { 'cache-control': 'no-store', 'content-length': '0', ...headers })
  res.end()
}

function writeJson(res: ServerResponse, answer: JsonAnswer, close: boolean): void {
  res.writeHead(answer.status, {
    'content-type': JSON_CONTENT_TYPE,
    'cache-control': 'no-store',
    'content-length': String(answer.bytes.byteLength),
    ...(close ? { connection: 'close' } : {}),
  })
  res.end(answer.bytes)
}

/** Status 500 with no body: the entry has no trustworthy answer. The connection closes. */
function writeNoAnswer(res: ServerResponse): void {
  writeEmpty(res, 500, { connection: 'close' })
}

/** HITL 入口面与位置引用一起出现：给了入口面却没有位置引用，是配置错误。 */
function hitlInstallation(
  config: ServerEntryConfig,
  dependencies: ServerEntryDependencies,
): HitlInstallation | undefined {
  if (dependencies.hitl === undefined) return undefined
  if (config.hitlLocationRef === undefined)
    throw new ServerEntryConfigError(
      'server-entry: hitlLocationRef is required when the HITL faces are given',
    )
  return { faces: dependencies.hitl, locationRef: config.hitlLocationRef }
}

export function createServerEntry(input: {
  readonly config: ServerEntryConfig
  readonly dependencies: ServerEntryDependencies
  readonly access?: ServerEntryAccess
}): ServerEntry {
  const config = checkConfig(input.config)
  const { dependencies } = input
  const hitl = hitlInstallation(config, dependencies)
  const diagnostics = dependencies.diagnostics
  const steps = createIdentitySteps({
    identity: dependencies.identity,
    governance: dependencies.governance,
    issuer: dependencies.issuer,
    diagnostics,
  })
  const registry = createObservationRegistry({
    limits: config.observation,
    // This stage has no locate or refresh round: one round is one heartbeat interval (docs/internals.md).
    loginCheckIntervalMs: config.heartbeatIntervalMs,
    diagnostics,
  })
  const ports: DiagnosticPorts<ActingForTenantPrincipal> = dependencies
  // The cursor key lives as long as this entry: a cursor of another instance is `invalid`.
  const cursors = createDiagnosticsCursors()
  const locations: readonly Location[] = [
    {
      path: GOVERNANCE_PATH,
      maxBytes: config.maxBodyBytes.small,
      protocolRejected: governanceProtocolRejected,
    },
    {
      path: SESSION_PATH,
      maxBytes: config.maxBodyBytes.input,
      protocolRejected: () => sessionProtocolRejected(),
    },
    {
      path: HITL_PATH,
      maxBytes: config.maxBodyBytes.input,
      protocolRejected: () => hitlProtocolRejected(),
    },
  ]

  let server: Server | undefined
  let listening: Listening | undefined
  let stopping = false
  let inFlight = 0
  let activeRequests = 0
  const drained: (() => void)[] = []

  /** The in-flight budget of every path: taken before the body is read, released once. */
  const slots: RequestSlots = {
    take: res => {
      if (activeRequests >= config.maxInFlightRequests) return undefined
      activeRequests += 1
      let held = true
      const release = (): void => {
        if (!held) return
        held = false
        activeRequests -= 1
        res.off('close', release)
      }
      res.once('close', release)
      return release
    },
  }
  const pipeline: Pipeline | undefined =
    input.access === undefined
      ? undefined
      : createPipeline(input.access, {
          loopback: LOOPBACK_ADDRESS,
          bodyLimits: config.maxBodyBytes,
          readLimits: maxBytes => readLimits(config, maxBytes),
          writeLimits: OUTPUT_LIMITS,
          slots,
          observations: config.observation,
          heartbeatMs: config.heartbeatIntervalMs,
        })

  const settle = (): void => {
    inFlight -= 1
    if (inFlight === 0) for (const resolve of drained.splice(0)) resolve()
  }

  const answerOf = async (location: Location, bytes: Uint8Array): Promise<Answer> => {
    switch (location.path) {
      case GOVERNANCE_PATH:
        return handleGovernance(bytes, {
          identity: dependencies.identity,
          governance: dependencies.governance,
          steps,
          endObservationsOf: loginText => registry.endLogin(loginText, 'denied'),
          settings: dependencies.settings,
          readLimits: readLimits(config, location.maxBytes),
          diagnostics,
        })
      case SESSION_PATH:
        return handleSession(bytes, {
          config,
          faces: dependencies.session,
          steps,
          resolveDefinition: dependencies.resolveDefinition,
          registry,
          readLimits: readLimits(config, location.maxBytes),
          diagnostics,
          ports,
          cursors,
        })
      case HITL_PATH:
        return handleHitl(bytes, {
          installation: hitl,
          entryPrincipals: dependencies.hitlEntryPrincipals,
          steps,
          readLimits: readLimits(config, location.maxBytes),
          diagnostics,
        })
    }
  }

  const write = (res: ServerResponse, answer: Answer): void => {
    switch (answer.kind) {
      case 'json':
        writeJson(res, answer, answer.close === true)
        // The answer is out before any follow-up starts, so a follow-up that never settles cannot
        // hold the answer or `stop()` (SPEC「成功业务访问的报告」).
        answer.afterWrite?.()
        return
      case 'no-answer':
        writeNoAnswer(res)
        return
      case 'sse': {
        const stream = new SseStream(res, config.heartbeatIntervalMs)
        stream.open(answer.status, answer.first)
        if (answer.attach === undefined) stream.end()
        else answer.attach(stream)
        return
      }
    }
  }

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = req.url ?? ''
    const query = url.indexOf('?')
    const path = query === -1 ? url : url.slice(0, query)
    const location = locations.find(known => known.path === path)
    if (location === undefined || (query !== -1 && url.length > query + 1)) {
      writeEmpty(res, 404)
      return
    }
    if (req.method !== 'POST') {
      writeEmpty(res, 405, { allow: 'POST' })
      return
    }
    if (!hostAccepted(req, LOOPBACK_ADDRESS)) {
      writeEmpty(res, 421)
      return
    }
    if (!contentTypeAccepted(req)) {
      writeJson(res, { ...location.protocolRejected(), status: 415 }, false)
      return
    }
    const releaseSlot = slots.take(res)
    if (releaseSlot === undefined) {
      writeEmpty(res, 429, { connection: 'close', 'x-omne-limit': 'in-flight-requests' })
      return
    }
    try {
      const body = await readBody(req, location.maxBytes)
      if (body.kind === 'aborted') {
        res.destroy()
        return
      }
      if (body.kind === 'over') {
        writeJson(res, { ...location.protocolRejected(), status: 413 }, true)
        return
      }
      write(res, await answerOf(location, body.bytes))
    } finally {
      releaseSlot()
    }
  }

  const isLocation = (target: string): boolean =>
    locations.some(known => known.path === pathOf(target))

  const onRequest = (req: IncomingMessage, res: ServerResponse): void => {
    if (stopping) {
      res.destroy()
      return
    }
    inFlight += 1
    const finished = new Promise<void>(resolve => {
      res.once('close', resolve)
    })
    // A path that is none of the three locations goes to the pipeline when it is given (SPEC「管道」).
    const route = pipeline === undefined || isLocation(req.url ?? '') ? handle : pipeline.handle
    route(req, res)
      .catch(() => {
        emit(diagnostics, { code: 'request.fault', path: pathOf(req.url ?? '') })
        if (!res.headersSent) writeNoAnswer(res)
        else res.destroy()
      })
      .finally(() => {
        void finished.then(settle)
      })
  }

  return {
    start() {
      if (listening !== undefined) return Promise.resolve(listening)
      if (config.listenAddress !== LOOPBACK_ADDRESS)
        return Promise.reject(
          new ServerEntryConfigError(
            `server-entry: listenAddress must be ${LOOPBACK_ADDRESS}; the entry does not rewrite another address`,
          ),
        )
      stopping = false
      const created = createServer(
        // Step 3 of the binding page judges Host itself, so the host's own Host check is off.
        { requireHostHeader: false, requestTimeout: 0, headersTimeout: 60_000 },
        onRequest,
      )
      server = created
      return new Promise<Listening>((resolve, reject) => {
        created.once('error', reject)
        created.listen(config.listenPort, LOOPBACK_ADDRESS, () => {
          created.off('error', reject)
          const address = created.address()
          if (address === null || typeof address === 'string') {
            reject(new ServerEntryConfigError('server-entry: the listener has no address'))
            return
          }
          listening = { address: address.address, port: address.port }
          resolve(listening)
        })
      })
    },
    async stop() {
      const current = server
      if (current === undefined) return
      stopping = true
      server = undefined
      listening = undefined
      const closed = new Promise<void>(resolve => {
        current.close(() => resolve())
      })
      await Promise.all([registry.endAll('unavailable'), pipeline?.endObservations()])
      if (inFlight > 0) await new Promise<void>(resolve => drained.push(resolve))
      current.closeAllConnections()
      await closed
    },
  }
}
