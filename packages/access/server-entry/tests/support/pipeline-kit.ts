import type {
  AccessContribution,
  AccessIdentity,
  ActForResult,
  CallContext,
  FrameSource,
  LoginIdentity,
  LoginResult,
  ObservationContext,
  Principal,
} from '@omne-harness/access-cordis-contract'
import {
  createAccessRegistry,
  type AccessDiagnostic,
  type Entered,
  type AccessRegistry,
  type ServerEntryDiagnostic,
} from '../../src/index.ts'
import {
  encoder,
  openSse,
  raw,
  send,
  startFixture,
  type Fixture,
  type FixtureOptions,
  type SseClient,
} from './harness.ts'
import { manualClock, type ManualClock } from './manual-clock.ts'
import { pipelineNotesProtocol, type PipelineNotesProtocol } from './test-contribution.ts'

export const PROOF = 'proof-alice-7f3c'
export const OTHER_PROOF = 'proof-bob-91aa'
export const TENANT = 'tenant-acme'
export const MESSAGE_ID = 'msg-0001'
export const GRACE_MS = 60_000
export const FRAME_QUEUE_BYTES = 64 * 1024
export const AVAILABILITY_BACKLOG = 4

export type Held<T> = {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
  readonly reject: (error: unknown) => void
}

export function held<T>(): Held<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle
    reject = fail
  })
  return { promise, resolve, reject }
}

export type Behaviour<T> =
  | { readonly kind: 'answer'; readonly value: T }
  | { readonly kind: 'throw' }
  | { readonly kind: 'reject' }
  | { readonly kind: 'hold'; readonly held: Held<T> }

export type IdentityCall =
  | { readonly method: 'identifyLogin'; readonly proof: string }
  | { readonly method: 'actFor'; readonly login: LoginIdentity; readonly tenant: string }
  | { readonly method: 'reportAccess'; readonly login: LoginIdentity }

export type TestIdentity = {
  readonly port: AccessIdentity
  readonly calls: IdentityCall[]
  readonly logins: ReadonlyMap<string, LoginIdentity>
  readonly principalOf: (login: LoginIdentity, tenant: string) => Principal
  identifyLogin?: Behaviour<LoginResult>
  actFor?: Behaviour<ActForResult>
  reportAccess?: Behaviour<void>
  readonly called: (method: IdentityCall['method'], count?: number) => Promise<void>
  readonly returned: (method: IdentityCall['method'], count?: number) => Promise<void>
}

function opaque<T>(label: string): T {
  return { label } as unknown as T
}

function run<T>(behaviour: Behaviour<T>): Promise<T> {
  switch (behaviour.kind) {
    case 'answer':
      return Promise.resolve(behaviour.value)
    case 'throw':
      throw new Error(`identity fault carrying ${PROOF}`)
    case 'reject':
      return Promise.reject(new Error(`identity fault carrying ${PROOF}`))
    case 'hold':
      return behaviour.held.promise
  }
}

export function testIdentity(): TestIdentity {
  const logins = new Map<string, LoginIdentity>([
    [PROOF, opaque<LoginIdentity>('login-alice')],
    [OTHER_PROOF, opaque<LoginIdentity>('login-bob')],
  ])
  const principals = new Map<string, Principal>()
  const watchers: {
    method: string
    count: number
    kind: 'called' | 'returned'
    done: () => void
  }[] = []
  const counts = { called: new Map<string, number>(), returned: new Map<string, number>() }
  const bump = (kind: 'called' | 'returned', method: string): void => {
    const next = (counts[kind].get(method) ?? 0) + 1
    counts[kind].set(method, next)
    for (const watcher of watchers.slice())
      if (watcher.kind === kind && watcher.method === method && next >= watcher.count) {
        watchers.splice(watchers.indexOf(watcher), 1)
        watcher.done()
      }
  }
  const wait = (kind: 'called' | 'returned', method: string, count = 1): Promise<void> => {
    if ((counts[kind].get(method) ?? 0) >= count) return Promise.resolve()
    return new Promise(done => watchers.push({ method, count, kind, done }))
  }
  const principalOf = (login: LoginIdentity, tenant: string): Principal => {
    const key = `${(login as unknown as { label: string }).label}@${tenant}`
    let principal = principals.get(key)
    if (principal === undefined) {
      principal = opaque<Principal>(`principal-${key}`)
      principals.set(key, principal)
    }
    return principal
  }
  const traced = <T>(method: IdentityCall['method'], work: () => Promise<T>): Promise<T> => {
    bump('called', method)
    let result: Promise<T>
    try {
      result = work()
    } catch (error) {
      bump('returned', method)
      throw error
    }
    return result.finally(() => bump('returned', method))
  }
  const identity: TestIdentity = {
    calls: [],
    logins,
    principalOf,
    called: (method, count) => wait('called', method, count),
    returned: (method, count) => wait('returned', method, count),
    port: {
      identifyLogin: proof =>
        traced('identifyLogin', () => {
          identity.calls.push({ method: 'identifyLogin', proof })
          if (identity.identifyLogin !== undefined) return run(identity.identifyLogin)
          const login = logins.get(proof)
          return Promise.resolve<LoginResult>(
            login === undefined ? { outcome: 'denied' } : { outcome: 'identified', login },
          )
        }),
      actFor: (login, tenant) =>
        traced('actFor', () => {
          identity.calls.push({ method: 'actFor', login, tenant })
          if (identity.actFor !== undefined) return run(identity.actFor)
          return Promise.resolve<ActForResult>({
            outcome: 'issued',
            principal: principalOf(login, tenant),
          })
        }),
      reportAccess: login =>
        traced('reportAccess', () => {
          identity.calls.push({ method: 'reportAccess', login })
          if (identity.reportAccess !== undefined) return run(identity.reportAccess)
          return Promise.resolve()
        }),
    },
  }
  return identity
}

export type RegistryLog = {
  readonly registry: AccessRegistry
  readonly entries: { readonly name: string; left: boolean }[]
  readonly leaveCounts: number[]
  readonly signals: Set<AbortSignal>
}

export function recordingRegistry(inner: AccessRegistry): RegistryLog {
  const entries: { name: string; left: boolean }[] = []
  const leaveCounts: number[] = []
  const signals = new Set<AbortSignal>()
  return {
    entries,
    leaveCounts,
    signals,
    registry: {
      mount: contribution => inner.mount(contribution),
      subscribe: listener => inner.subscribe(listener),
      enter: (key, name) => {
        const entered = inner.enter(key, name)
        if (entered === undefined) return undefined
        const line = { name, left: false }
        const index = entries.push(line) - 1
        leaveCounts.push(0)
        signals.add(entered.signal)
        const wrapped: Entered = {
          ...entered,
          leave: () => {
            line.left = true
            leaveCounts[index] = (leaveCounts[index] ?? 0) + 1
            entered.leave()
          },
        }
        return wrapped
      },
    },
  }
}

type Operations = PipelineNotesProtocol['operations']
type Observations = PipelineNotesProtocol['observations']
type ObservationName = keyof Observations & string

export type Feed = {
  readonly name: ObservationName
  readonly context: ObservationContext<any>
  readonly open: unknown
  readonly push: (frame: unknown) => void
  readonly finish: (reason: string) => void
  readonly fail: () => void
  readonly returned: Promise<void>
  taken: number
}

type FeedItem =
  | Readonly<{ kind: 'frame'; value: unknown }>
  | Readonly<{ kind: 'end'; reason: string }>
  | Readonly<{ kind: 'fail' }>

function frameFeed(name: ObservationName, context: ObservationContext<any>, open: unknown) {
  const queue: FeedItem[] = []
  let wake: (() => void) | undefined
  let wound: () => void = () => {}
  const returned = new Promise<void>(resolve => {
    wound = resolve
  })
  const put = (item: FeedItem): void => {
    queue.push(item)
    wake?.()
    wake = undefined
  }
  context.signal.addEventListener('abort', () => put({ kind: 'end', reason: 'unavailable' }))
  const feed: Feed = {
    name,
    context,
    open,
    push: value => put({ kind: 'frame', value }),
    finish: reason => put({ kind: 'end', reason }),
    fail: () => put({ kind: 'fail' }),
    returned,
    taken: 0,
  }
  async function* frames(): AsyncGenerator<unknown, any> {
    try {
      for (;;) {
        while (queue.length === 0) await new Promise<void>(resolve => (wake = resolve))
        const item = queue.shift()!
        if (item.kind === 'fail') throw new Error(`frame source fault carrying ${PROOF}`)
        if (item.kind === 'end') return item.reason
        feed.taken += 1
        yield item.value
      }
    } finally {
      wound()
    }
  }
  return { feed, frames: frames() }
}
type Script = (call: CallContext<any>, body: any) => Promise<any>

export type HandlerCall = {
  readonly operation: keyof Operations & string
  readonly call: CallContext<any>
  readonly body: unknown
}

export type ScriptedNotes = {
  readonly contribution: AccessContribution<PipelineNotesProtocol>
  readonly calls: HandlerCall[]
  readonly feeds: Feed[]
  readonly sources: Partial<Record<ObservationName, FrameSource<any>>>
  readonly opened: (count?: number) => Promise<Feed>
  readonly scripts: Partial<Record<keyof Operations & string, Script>>
  readonly called: (count?: number) => Promise<void>
}

export function scriptedNotes(): ScriptedNotes {
  const calls: HandlerCall[] = []
  const scripts: ScriptedNotes['scripts'] = {}
  const watchers: { count: number; done: () => void }[] = []
  const feeds: Feed[] = []
  const sources: ScriptedNotes['sources'] = {}
  const feedWatchers: { count: number; done: (feed: Feed) => void }[] = []
  const source =
    (name: ObservationName): FrameSource<any> =>
    async (context, open) => {
      const scripted = sources[name]
      if (scripted !== undefined) return scripted(context, open)
      const { feed, frames } = frameFeed(name, context, open)
      feeds.push(feed)
      for (const watcher of feedWatchers.slice())
        if (feeds.length >= watcher.count) {
          feedWatchers.splice(feedWatchers.indexOf(watcher), 1)
          watcher.done(feeds[watcher.count - 1]!)
        }
      return { outcome: 'succeeded', frames }
    }
  const handler =
    (operation: keyof Operations & string, fallback: Script) =>
    (call: CallContext<any>, body: any): Promise<any> => {
      calls.push({ operation, call, body })
      for (const watcher of watchers.slice())
        if (calls.length >= watcher.count) {
          watchers.splice(watchers.indexOf(watcher), 1)
          watcher.done()
        }
      return (scripts[operation] ?? fallback)(call, body)
    }
  return {
    calls,
    scripts,
    feeds,
    sources,
    opened: (count = feeds.length + 1) =>
      feeds.length >= count
        ? Promise.resolve(feeds[count - 1]!)
        : new Promise(done => feedWatchers.push({ count, done })),
    called: (count = 1) =>
      calls.length >= count
        ? Promise.resolve()
        : new Promise(done => watchers.push({ count, done })),
    contribution: {
      protocol: pipelineNotesProtocol(),
      operations: {
        'read-note': handler('read-note', async (_call, body) => ({
          outcome: 'succeeded',
          body: { noteId: body.noteId, title: 'first note' },
        })),
        'save-note': handler('save-note', async () => ({ outcome: 'succeeded', body: {} })),
        ping: handler('ping', async () => ({ outcome: 'succeeded', body: {} })),
        'tag-note': handler('tag-note', async () => ({ outcome: 'succeeded', body: {} })),
      },
      observations: {
        'watch-note': source('watch-note'),
        'watch-all': source('watch-all'),
        'watch-tenant': source('watch-tenant'),
      },
    },
  }
}

export type AccessFixture = Omit<Fixture, 'diagnostics'> & {
  readonly diagnostics: (ServerEntryDiagnostic | AccessDiagnostic)[]
  readonly accessIdentity: TestIdentity
  readonly log: RegistryLog
  readonly notes: ScriptedNotes
  readonly accessClock: ManualClock
  readonly takeDown: () => Promise<void>
}

export type AccessFixtureOptions = FixtureOptions &
  Readonly<{ frameQueueBytes?: number; availabilityBacklog?: number }>

export async function startAccessFixture(
  options: AccessFixtureOptions = {},
): Promise<AccessFixture> {
  const registry = createAccessRegistry()
  const log = recordingRegistry(registry)
  const identity = testIdentity()
  const notes = scriptedNotes()
  const accessClock = manualClock()
  const takeDown = registry.mount(notes.contribution)
  const diagnostics: (ServerEntryDiagnostic | AccessDiagnostic)[] = []
  const fixture = await startFixture({
    ...options,
    dependencies: { ...options.dependencies, diagnostics: event => diagnostics.push(event) },
    access: {
      registry: log.registry,
      identity: identity.port,
      graceMs: GRACE_MS,
      frameQueueBytes: options.frameQueueBytes ?? FRAME_QUEUE_BYTES,
      availabilityBacklog: options.availabilityBacklog ?? AVAILABILITY_BACKLOG,
      clock: accessClock,
      diagnostics: event => diagnostics.push(event),
    },
  })
  return { ...fixture, diagnostics, accessIdentity: identity, log, notes, accessClock, takeDown }
}

export type ApiOptions = Readonly<{
  method?: string
  headers?: Readonly<Record<string, string | undefined>>
  body?: string | Uint8Array
}>

export function callHeaders(): Record<string, string> {
  return {
    authorization: `Bearer ${PROOF}`,
    'omne-acting-tenant': TENANT,
    'omne-message-id': MESSAGE_ID,
    'content-type': 'application/json',
  }
}

export function call(port: number, name: string, options: ApiOptions = {}) {
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries({ ...callHeaders(), ...options.headers }))
    if (value !== undefined) headers[key] = value
  return send(port, `/api/notes/v1/${name}`, {
    ...(options.method === undefined ? {} : { method: options.method }),
    headers,
    body: options.body ?? '{}',
  })
}

export function observe(port: number, name: string, options: ApiOptions = {}): SseClient {
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries({ ...callHeaders(), ...options.headers }))
    if (value !== undefined && key !== 'content-type') headers[key] = value
  const body = options.body ?? '{"noteId":"n-1"}'
  return openSse(port, typeof body === 'string' ? body : new TextDecoder().decode(body), {
    path: `/api/notes/v1/${name}`,
    headers,
  })
}

export function rawCall(
  port: number,
  target: string,
  headerLines: readonly string[],
  body = '',
): Promise<string> {
  return raw(port, [`POST ${target} HTTP/1.1`, ...headerLines, '', body].join('\r\n'))
}

export function rawHeaders(bodyLength: number, extra: readonly string[] = []): string[] {
  return [
    'Host: 127.0.0.1',
    'Content-Type: application/json',
    `Authorization: Bearer ${PROOF}`,
    `Omne-Acting-Tenant: ${TENANT}`,
    `Omne-Message-Id: ${MESSAGE_ID}`,
    `Content-Length: ${bodyLength}`,
    ...extra,
  ]
}

export function bytes(text: string): Uint8Array {
  return encoder.encode(text)
}

export function turn(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}
