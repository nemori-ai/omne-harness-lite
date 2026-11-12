// The pipeline's test kit (#1233): a test implementation of the identity port, a registry that
// records every `enter` and `leave`, a contribution whose handlers each case scripts, and the
// helpers that send requests to the new address. None of it is in any release.
import type {
  AccessContribution,
  AccessIdentity,
  ActForResult,
  CallContext,
  LoginIdentity,
  LoginResult,
  Principal,
} from '@omne-harness/access-cordis-contract'
import { createAccessRegistry, type Entered, type RegistryForPipeline } from '../../src/index.ts'
import { encoder, raw, send, startFixture, type Fixture, type FixtureOptions } from './harness.ts'
import { manualClock, type ManualClock } from './manual-clock.ts'
import { pipelineNotesProtocol, type PipelineNotesProtocol } from './test-contribution.ts'

export const PROOF = 'proof-alice-7f3c'
export const OTHER_PROOF = 'proof-bob-91aa'
export const TENANT = 'tenant-acme'
export const MESSAGE_ID = 'msg-0001'
/** Long enough that only the case's own clock can end it. */
export const GRACE_MS = 60_000

/** A deferred value the case settles by hand. */
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

/** What one method of the test identity does on its next calls. */
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
  /** The login object each known proof is recognised as. */
  readonly logins: ReadonlyMap<string, LoginIdentity>
  /** The principal `actFor` issues for a login, the same object each time. */
  readonly principalOf: (login: LoginIdentity, tenant: string) => Principal
  identifyLogin?: Behaviour<LoginResult>
  actFor?: Behaviour<ActForResult>
  reportAccess?: Behaviour<void>
  /** Settles once the method has been called `count` times in all. */
  readonly called: (method: IdentityCall['method'], count?: number) => Promise<void>
  /** Settles once a call of the method has returned or thrown `count` times in all. */
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

/**
 * The identity port of the cases: a table from proof to login. An unknown proof is `denied`;
 * `actFor` issues for any non-empty tenant. A case can set what a method does next.
 */
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
  readonly registry: RegistryForPipeline
  /** One line per `enter` that returned a member, and whether its `leave` has been called. */
  readonly entries: { readonly name: string; left: boolean }[]
  /** The abort signals `enter` handed out, one per mount. */
  readonly signals: Set<AbortSignal>
}

/** Wraps a registry so a case can see each `enter` and `leave` the pipeline makes. */
export function recordingRegistry(inner: RegistryForPipeline): RegistryLog {
  const entries: { name: string; left: boolean }[] = []
  const signals = new Set<AbortSignal>()
  return {
    entries,
    signals,
    registry: {
      subscribe: listener => inner.subscribe(listener),
      enter: (key, name) => {
        const entered = inner.enter(key, name)
        if (entered === undefined) return undefined
        const line = { name, left: false }
        entries.push(line)
        signals.add(entered.signal)
        const wrapped: Entered = {
          ...entered,
          leave: () => {
            line.left = true
            entered.leave()
          },
        }
        return wrapped
      },
    },
  }
}

type Operations = PipelineNotesProtocol['operations']
type Script = (call: CallContext<any>, body: any) => Promise<any>

export type HandlerCall = {
  readonly operation: keyof Operations & string
  readonly call: CallContext<any>
  readonly body: unknown
}

export type ScriptedNotes = {
  readonly contribution: AccessContribution<PipelineNotesProtocol>
  readonly calls: HandlerCall[]
  /** What an operation does on its next calls; absent, it answers `succeeded`. */
  readonly scripts: Partial<Record<keyof Operations & string, Script>>
  /** Settles once handlers have been called `count` times in all. */
  readonly called: (count?: number) => Promise<void>
}

export function scriptedNotes(): ScriptedNotes {
  const calls: HandlerCall[] = []
  const scripts: ScriptedNotes['scripts'] = {}
  const watchers: { count: number; done: () => void }[] = []
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
        'watch-note': async () => ({ outcome: 'basis-unavailable' }),
      },
    },
  }
}

export type AccessFixture = Fixture & {
  readonly accessIdentity: TestIdentity
  readonly log: RegistryLog
  readonly notes: ScriptedNotes
  readonly accessClock: ManualClock
  /** Takes the notes protocol down; settles when its last in-flight call has left. */
  readonly takeDown: () => Promise<void>
}

/** An entry given `access`, with the scripted notes protocol mounted. */
export async function startAccessFixture(options: FixtureOptions = {}): Promise<AccessFixture> {
  const registry = createAccessRegistry()
  const log = recordingRegistry(registry)
  const identity = testIdentity()
  const notes = scriptedNotes()
  const accessClock = manualClock()
  const takeDown = registry.mount(notes.contribution)
  const fixture = await startFixture({
    ...options,
    access: {
      registry: log.registry,
      identity: identity.port,
      graceMs: GRACE_MS,
      clock: accessClock,
    },
  })
  return { ...fixture, accessIdentity: identity, log, notes, accessClock, takeDown }
}

export type ApiOptions = Readonly<{
  method?: string
  /** Replaces the four default headers; `undefined` drops one. */
  headers?: Readonly<Record<string, string | undefined>>
  body?: string | Uint8Array
}>

/** The four headers of a legal call. */
export function callHeaders(): Record<string, string> {
  return {
    authorization: `Bearer ${PROOF}`,
    'omne-acting-tenant': TENANT,
    'omne-message-id': MESSAGE_ID,
    'content-type': 'application/json',
  }
}

/** One request to `/api/notes/v1/<name>` with legal headers unless the case changes them. */
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

/** A raw request: the request line, the header lines as given, and the body text. */
export function rawCall(
  port: number,
  target: string,
  headerLines: readonly string[],
  body = '',
): Promise<string> {
  return raw(port, [`POST ${target} HTTP/1.1`, ...headerLines, '', body].join('\r\n'))
}

/** The header lines of a legal raw call, with `Host` and the body length. */
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

/** Lets pending I/O callbacks run once; not a timed wait. */
export function turn(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}
