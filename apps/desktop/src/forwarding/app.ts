import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { LogoutResult } from '../shared/channel.ts'
import { answerPageFile, type PageFileReader } from '../shared/page-files.ts'
import { PLUGIN_FILES } from '../shared/plugin-path.ts'
import { pluginFileAt } from './plugin-files.ts'
import {
  BRIDGE,
  WIRE_LIMITS,
  readAttach,
  readCall,
  readCredentials,
  readDetach,
  writeLoginStanding,
  writePageEvent,
  writeReport,
  writeResult,
  type Attach,
  type LoginStandingAnswer,
  type ObserveEvent,
} from '../shared/wire.ts'
import {
  LOGIN_COOKIE,
  LOGIN_COOKIE_ATTRIBUTES,
  LOGIN_COOKIE_MAX_AGE_S,
  readCookieLogin,
  writeCookieLogin,
  type CookieLogin,
} from './login-cookie.ts'
import type { ForwardingRules } from './rules.ts'

export type ForwardingOptions = {
  readonly rules: ForwardingRules
  readonly readPageFile?: PageFileReader
  readonly log?: (line: string) => void
}

export interface Forwarding {
  fetch(request: Request): Promise<Response>
  close(): void
}

export const BRIDGE_PREFIX = '/bridge/'

export const STREAM_BACKLOG_BYTES = 1_048_576

const BASE_HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }

const text = (status: number, body: string, type = 'text/plain'): Response =>
  new Response(body, { status, headers: { 'content-type': type, ...BASE_HEADERS } })

const isJson = (contentType: string | undefined): boolean =>
  contentType?.split(';')[0]?.trim() === 'application/json'

class TooLarge extends Error {}

async function bodyText(request: Request): Promise<string> {
  if (request.body === null) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  const reader = request.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > WIRE_LIMITS.maxBytes) {
      void reader.cancel().catch(() => {})
      throw new TooLarge()
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

type EventStream = {
  readonly response: Response
  send(data: string): Promise<void>
  end(): void
}

const encoder = new TextEncoder()

function eventStream(open: Set<EventStream>, ended: () => void): EventStream {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined
  let over = false
  let waiting: (() => void)[] = []
  const release = (): void => {
    const woken = waiting
    waiting = []
    for (const wake of woken) wake()
  }
  const finish = (): boolean => {
    if (over) return false
    over = true
    open.delete(stream)
    release()
    ended()
    return true
  }
  const body = new ReadableStream<Uint8Array>(
    {
      start(started) {
        controller = started
      },
      pull: release,
      cancel() {
        finish()
      },
    },
    new ByteLengthQueuingStrategy({ highWaterMark: STREAM_BACKLOG_BYTES }),
  )
  // A frame goes in only when it fits; a frame larger than the limit goes in alone.
  const fits = (bytes: number): boolean => {
    const room = controller?.desiredSize ?? 0
    return room >= bytes || room >= STREAM_BACKLOG_BYTES
  }
  const stream: EventStream = {
    response: new Response(body, {
      headers: { 'content-type': 'text/event-stream', ...BASE_HEADERS },
    }),
    async send(data) {
      const bytes = encoder.encode(`data: ${data}\n\n`)
      while (!over && !fits(bytes.byteLength))
        await new Promise<void>(resolve => waiting.push(resolve))
      if (!over) controller?.enqueue(bytes)
    },
    end() {
      if (finish()) controller?.close()
    },
  }
  open.add(stream)
  return stream
}

type Observation = { readonly controller: AbortController; readonly proof: string | undefined }

type PageStream = {
  stream?: EventStream
  readonly observations: Map<string, Observation>
}

const LOGIN_GONE = Symbol('login gone')

type Env = { Variables: { login: CookieLogin | undefined } }

const COOKIE = { ...LOGIN_COOKIE_ATTRIBUTES, maxAge: LOGIN_COOKIE_MAX_AGE_S }
const clearLogin = (c: Context<Env>): void =>
  void deleteCookie(c, LOGIN_COOKIE, LOGIN_COOKIE_ATTRIBUTES)

// One event stream per page carries all of its observations. The headers leave before anything
// upstream is asked; a frame is written only when the page has read, so upstream is not pulled.
function pageObservations(
  app: Hono<Env>,
  rules: ForwardingRules,
  open: Set<EventStream>,
  log: (line: string) => void,
) {
  const pages = new Map<string, PageStream>()

  app.get(BRIDGE.events, c => {
    const page = c.req.query('page')
    if (page === undefined || page === '') return text(400, 'no page')
    pages.get(page)?.stream?.end()
    const entry: PageStream = { observations: new Map() }
    entry.stream = eventStream(open, () => {
      if (entry.observations.size > 0)
        log(`page stream closed with ${entry.observations.size} observation(s) on it`)
      for (const observation of entry.observations.values()) observation.controller.abort()
      if (pages.get(page) === entry) pages.delete(page)
    })
    pages.set(page, entry)
    return entry.stream.response
  })

  async function forward(
    entry: PageStream,
    attach: Attach,
    controller: AbortController,
    login: CookieLogin | undefined,
  ): Promise<void> {
    const { signal } = controller
    const write = (observed: ObserveEvent): Promise<void> =>
      entry.stream?.send(writePageEvent(attach.id, observed)) ?? Promise.resolve()
    const frames = rules.observe({ ...attach.request, signal }, login)
    const stop = (): void => void frames.return({ kind: 'aborted' })
    signal.addEventListener('abort', stop)
    try {
      for (;;) {
        const next = await frames.next()
        if (signal.aborted) {
          if (signal.reason === LOGIN_GONE)
            await write({ end: { kind: 'ended', reason: 'denied' } })
          return
        }
        if (next.done === true) {
          const { protocol, observation } = attach.request
          log(
            `observation ${protocol.name}/v${protocol.major} ${observation} ended: ${next.value.kind}`,
          )
          return void (await write({ end: next.value }))
        }
        await write({ frame: next.value })
      }
    } catch {
      if (!signal.aborted) await write({ end: { kind: 'uncertain' } })
    } finally {
      signal.removeEventListener('abort', stop)
      if (entry.observations.get(attach.id)?.controller === controller)
        entry.observations.delete(attach.id)
    }
  }

  app.post(BRIDGE.observe, async c => {
    const attach = readAttach(await bodyText(c.req.raw))
    if (attach === undefined) return text(400, 'bad observation')
    const entry = pages.get(attach.page)
    if (entry === undefined) {
      log('observation refused: the page has no event stream')
      return text(409, 'no event stream')
    }
    const controller = new AbortController()
    const login = c.get('login')
    const { protocol, observation } = attach.request
    entry.observations.get(attach.id)?.controller.abort()
    entry.observations.set(attach.id, {
      controller,
      proof: rules.observationCarriesLogin(protocol, observation) ? login?.proof : undefined,
    })
    void forward(entry, attach, controller, login)
    return c.json({})
  })

  app.post(BRIDGE.unobserve, async c => {
    const detach = readDetach(await bodyText(c.req.raw))
    if (detach === undefined) return text(400, 'bad detach')
    pages.get(detach.page)?.observations.get(detach.id)?.controller.abort()
    return c.json({})
  })

  return {
    /** The observations opened with this login end now, on every page: they do not outlive it. */
    endFor(login: CookieLogin): void {
      for (const entry of pages.values())
        for (const observation of entry.observations.values())
          if (observation.proof === login.proof) observation.controller.abort(LOGIN_GONE)
    },
  }
}

const jsonBody = (c: Context<Env>, body: string): Response =>
  c.body(body, 200, { 'content-type': 'application/json', ...BASE_HEADERS })

type Log = (line: string) => void
type Observations = ReturnType<typeof pageObservations>

/** Refuses a `POST` from another origin, then reads the login the request's cookie carries. */
function guardBridge(app: Hono<Env>, log: Log): void {
  app.use(`${BRIDGE_PREFIX}*`, async (c, next) => {
    if (c.req.method === 'POST') {
      // This check stops another origin. `SameSite` does not: it ignores the port.
      const origin = c.req.header('origin')
      if (origin !== new URL(c.req.url).origin || !isJson(c.req.header('content-type'))) {
        log(`refused POST ${c.req.path}: origin=${origin ?? ''}`)
        return text(403, 'forbidden')
      }
    }
    const raw = getCookie(c, LOGIN_COOKIE)
    const login = raw === undefined ? undefined : readCookieLogin(raw)
    c.set('login', login)
    if (raw !== undefined && login === undefined) clearLogin(c)
    return next()
  })
}

function callRoute(app: Hono<Env>, rules: ForwardingRules): void {
  app.post(BRIDGE.call, async c => {
    const message = readCall(await bodyText(c.req.raw))
    if (message === undefined) return text(400, 'bad call')
    const report = await rules.call({ ...message, signal: c.req.raw.signal }, c.get('login'))
    return jsonBody(c, writeReport(report))
  })
}

function loginRoutes(app: Hono<Env>, rules: ForwardingRules, observations: Observations): void {
  app.post(BRIDGE.login, async c => {
    const credentials = readCredentials(await bodyText(c.req.raw))
    if (credentials === undefined) return text(400, 'bad credentials')
    if (c.get('login') !== undefined) return jsonBody(c, writeResult('unavailable'))
    const answer = await rules.login(credentials)
    if (answer.result === 'signed-in')
      setCookie(c, LOGIN_COOKIE, writeCookieLogin(answer.login), COOKIE)
    return jsonBody(c, writeResult(answer.result))
  })

  app.post(BRIDGE.logout, async c => {
    await bodyText(c.req.raw)
    const login = c.get('login')
    if (login === undefined) return jsonBody(c, writeResult('signed-out'))
    let revoked: LogoutResult = 'unknown'
    try {
      revoked = await rules.logout(login)
    } finally {
      clearLogin(c)
      observations.endFor(login)
    }
    return jsonBody(c, writeResult(revoked))
  })
}

const STANDING_ANSWERS: Readonly<Record<'valid' | 'invalid' | 'unverified', LoginStandingAnswer>> =
  {
    valid: { state: 'signed-in' },
    unverified: { state: 'signed-in', note: 'unverified' },
    invalid: { state: 'signed-out', note: 'expired' },
  }

function standingRoute(app: Hono<Env>, rules: ForwardingRules, observations: Observations): void {
  app.post(BRIDGE.loginStanding, async c => {
    await bodyText(c.req.raw)
    const login = c.get('login')
    if (login === undefined)
      return jsonBody(c, writeLoginStanding({ state: 'signed-out' }, rules.protocols))
    const standing = await rules.standing(login)
    if (standing === 'invalid') {
      clearLogin(c)
      observations.endFor(login)
    }
    return jsonBody(c, writeLoginStanding(STANDING_ANSWERS[standing], rules.protocols))
  })
}

const PLUGIN_STATUS = { 'not-found': 404, denied: 403, unavailable: 503 } as const

function bodyOf(parts: AsyncIterableIterator<Uint8Array>): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await parts.next()
        if (next.done === true) controller.close()
        else controller.enqueue(new Uint8Array(next.value))
      } catch (error) {
        controller.error(error)
      }
    },
    async cancel() {
      await parts.return?.()
    },
  })
}

const PLUGIN_FILE_CACHE = 'private, max-age=31536000, immutable'
const SHUT_POLICY = "default-src 'none'; style-src 'unsafe-inline'; sandbox"

function pluginRoute(app: Hono<Env>, rules: ForwardingRules): void {
  app.get(`${PLUGIN_FILES}*`, async c => {
    const at = pluginFileAt(new URL(c.req.url).pathname)
    if (at === undefined) return text(404, 'not found')
    const login = c.get('login')
    if (login === undefined) return text(401, 'not signed in')
    const answer = await rules.pluginFile(at, login)
    if (answer.kind !== 'file') return text(PLUGIN_STATUS[answer.kind], answer.kind)
    const headers = {
      'content-type': at.type,
      'content-length': String(answer.bytes),
      ...BASE_HEADERS,
      'cache-control': PLUGIN_FILE_CACHE,
      ...(at.shut && { 'content-security-policy': SHUT_POLICY }),
    }
    return new Response(bodyOf(answer.parts), { headers })
  })
}

function fallbackRoutes(app: Hono<Env>, readPageFile: PageFileReader | undefined, log: Log): void {
  app.all(`${BRIDGE_PREFIX}*`, () => text(404, 'not found'))

  app.get('*', async c => {
    if (readPageFile === undefined) return text(404, 'not found')
    const file = await answerPageFile(c.req.path, readPageFile)
    if (file.status === 404) return text(404, 'not found')
    return new Response(file.body, { headers: file.headers })
  })

  app.notFound(() => text(404, 'not found'))

  app.onError((error, c) => {
    const large = error instanceof TooLarge
    log(`request failed: ${c.req.method} ${c.req.path} (${large ? 'too large' : 'error'})`)
    return text(large ? 413 : 500, 'failed')
  })
}

export function createForwarding(options: ForwardingOptions): Forwarding {
  const { rules } = options
  const log = options.log ?? (() => {})
  const open = new Set<EventStream>()
  const app = new Hono<Env>()

  guardBridge(app, log)
  const observations = pageObservations(app, rules, open, log)
  callRoute(app, rules)
  loginRoutes(app, rules, observations)
  standingRoute(app, rules, observations)
  pluginRoute(app, rules)
  fallbackRoutes(app, options.readPageFile, log)

  return {
    fetch: async request => app.fetch(request),
    close() {
      for (const stream of Array.from(open)) stream.end()
    },
  }
}
