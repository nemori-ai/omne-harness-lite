// The HTTP layer of the entry (binding page「请求与响应规则」, SPEC「服务端的 HTTP 层责任」): the
// loopback listener, the five steps before the message, the body limit per path, the dispatch to
// the two locations, the answer writing, and stop. A failure of this layer or of the entry itself
// is the empty status 500 and a closed connection.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type {
  IdentityOperations,
  PrincipalIssuer,
  ActingForTenantPrincipal,
} from '@omne-harness/identity'
import type { Answer, JsonAnswer } from './answers.ts'
import {
  LOOPBACK_ADDRESS,
  ServerEntryConfigError,
  checkConfig,
  readLimits,
  type ServerEntryConfig,
} from './config.ts'
import { emit, type DiagnosticSink } from './diagnostics.ts'
import type { DefinitionResolver, SessionIngressFaces } from './faces.ts'
import { governanceProtocolRejected, handleGovernance } from './governance.ts'
import { createIdentitySteps } from './identity-steps.ts'
import { createObservationRegistry } from './observation.ts'
import { handleSession } from './session.ts'
import { sessionProtocolRejected } from './session-codec.ts'
import { SseStream } from './sse.ts'

export const GOVERNANCE_PATH = '/governance-public/1'
export const SESSION_PATH = '/session-public/1'

export type ServerEntryDependencies = Readonly<{
  identity: IdentityOperations
  issuer: PrincipalIssuer
  session: SessionIngressFaces<ActingForTenantPrincipal>
  resolveDefinition: DefinitionResolver
  diagnostics?: DiagnosticSink
}>

export type Listening = Readonly<{ address: string; port: number }>

export interface ServerEntry {
  /** Listens on the loopback address. Rejects with `ServerEntryConfigError` for another address. Idempotent while listening. */
  start(): Promise<Listening>
  /** Stops accepting, ends every observation with `ended(unavailable)`, waits for in-flight requests, closes. */
  stop(): Promise<void>
}

type Location = Readonly<{
  path: typeof GOVERNANCE_PATH | typeof SESSION_PATH
  maxBytes: number
  protocolRejected: () => JsonAnswer
}>

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8'

function countHeader(req: IncomingMessage, name: string): number {
  let count = 0
  for (let index = 0; index < req.rawHeaders.length; index += 2)
    if (req.rawHeaders[index]?.toLowerCase() === name) count += 1
  return count
}

/** Step 3: exactly one Host whose host name, port removed, is 127.0.0.1 or localhost. */
function hostAccepted(req: IncomingMessage): boolean {
  if (countHeader(req, 'host') !== 1) return false
  const value = req.headers.host
  if (value === undefined) return false
  const host = value.replace(/:\d*$/, '').toLowerCase()
  return host === LOOPBACK_ADDRESS || host === 'localhost'
}

/** Step 4: exactly one Content-Type of application/json, with at most a utf-8 charset parameter. */
function contentTypeAccepted(req: IncomingMessage): boolean {
  if (countHeader(req, 'content-type') !== 1) return false
  const value = req.headers['content-type']
  if (value === undefined) return false
  const [media, ...parameters] = value.split(';').map(part => part.trim())
  if (media?.toLowerCase() !== 'application/json') return false
  if (parameters.length === 0) return true
  if (parameters.length !== 1) return false
  return /^charset=(?:utf-8|"utf-8")$/i.test(parameters[0] ?? '')
}

type BodyRead =
  | Readonly<{ kind: 'ok'; bytes: Uint8Array }>
  | Readonly<{ kind: 'over' }>
  | Readonly<{ kind: 'aborted' }>

/** Step 5: counts the bytes actually read; a Content-Length over the limit is refused unread. */
function readBody(req: IncomingMessage, maxBytes: number): Promise<BodyRead> {
  const declared = req.headers['content-length']
  if (declared !== undefined && /^\d+$/.test(declared) && Number(declared) > maxBytes)
    return Promise.resolve({ kind: 'over' })
  return new Promise(resolve => {
    const chunks: Uint8Array[] = []
    let total = 0
    let done = false
    const finish = (result: BodyRead): void => {
      if (done) return
      done = true
      req.removeAllListeners('data')
      req.pause()
      resolve(result)
    }
    req.on('data', (chunk: Uint8Array) => {
      total += chunk.byteLength
      if (total > maxBytes) {
        finish({ kind: 'over' })
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => finish({ kind: 'ok', bytes: Buffer.concat(chunks) }))
    req.on('error', () => finish({ kind: 'aborted' }))
    req.on('aborted', () => finish({ kind: 'aborted' }))
  })
}

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

export function createServerEntry(input: {
  readonly config: ServerEntryConfig
  readonly dependencies: ServerEntryDependencies
}): ServerEntry {
  const config = checkConfig(input.config)
  const { dependencies } = input
  const diagnostics = dependencies.diagnostics
  const steps = createIdentitySteps(dependencies.identity, dependencies.issuer, diagnostics)
  const registry = createObservationRegistry(config.observation, diagnostics)
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
  ]

  let server: Server | undefined
  let listening: Listening | undefined
  let stopping = false
  let inFlight = 0
  const drained: (() => void)[] = []

  const settle = (): void => {
    inFlight -= 1
    if (inFlight === 0) for (const resolve of drained.splice(0)) resolve()
  }

  const answerOf = async (location: Location, bytes: Uint8Array): Promise<Answer> =>
    location.path === GOVERNANCE_PATH
      ? handleGovernance(bytes, {
          identity: dependencies.identity,
          readLimits: readLimits(config, location.maxBytes),
          diagnostics,
        })
      : handleSession(bytes, {
          config,
          faces: dependencies.session,
          steps,
          resolveDefinition: dependencies.resolveDefinition,
          registry,
          readLimits: readLimits(config, location.maxBytes),
          diagnostics,
        })

  const write = (res: ServerResponse, answer: Answer): void => {
    switch (answer.kind) {
      case 'json':
        writeJson(res, answer, answer.close === true)
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
    if (!hostAccepted(req)) {
      writeEmpty(res, 421)
      return
    }
    if (!contentTypeAccepted(req)) {
      writeJson(res, { ...location.protocolRejected(), status: 415 }, false)
      return
    }
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
  }

  const onRequest = (req: IncomingMessage, res: ServerResponse): void => {
    if (stopping) {
      res.destroy()
      return
    }
    inFlight += 1
    const finished = new Promise<void>(resolve => {
      res.once('close', resolve)
    })
    handle(req, res)
      .catch(() => {
        emit(diagnostics, { code: 'request.fault', path: req.url ?? '' })
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
      await registry.endAll('unavailable')
      if (inFlight > 0) await new Promise<void>(resolve => drained.push(resolve))
      current.closeAllConnections()
      await closed
    },
  }
}
