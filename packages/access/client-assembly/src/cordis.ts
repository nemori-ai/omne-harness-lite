// The client assembly on Cordis (RFC-0015 §6「客户端装配」, §13「客户端：树上的一个协议客户端」,
// #1249 C16, C17). `connectionPlugin` provides the service `connection`: the transport, the
// availability view, and the login state. It subscribes to `access/v1` at once, resubscribes on a
// change frame off its base, and reconnects with backoff when the observation breaks; while it
// reconnects the view stays and no protocol client is withdrawn. `defineProtocolClient` gives a
// plugin that provides `protocol:<name>/v<major>` while the view says the protocol is open, and
// withdraws it when it closes: first it marks the client, so its methods answer `unavailable`
// locally, then it unregisters the service.
import { Service, type Context, type Plugin } from '@deepseek-ai/cordis'
import { accessProtocol, type ProtocolContract } from '@omne-harness/public-contract'
import { createClient, type ClientOf, type ReadRetry, type Transport } from '@omne-harness/sdk/core'
import {
  applyFrame,
  defaultBackoff,
  keyText,
  type AvailabilityView,
  type Backoff,
  type ProtocolKey,
} from './availability.ts'

export type LoginState = 'signed-out' | 'signing-in' | 'signed-in' | 'signing-out'

/** Where the login state comes from. How a login happens is the identity protocol's; not here. */
export interface LoginStateSource {
  state(): LoginState
  subscribe(listener: (state: LoginState) => void): () => void
}

/** One diagnostic of the client assembly. */
export type AssemblyDiagnostic = {
  /** The view says a protocol is open and no protocol client of it is on the tree. */
  readonly code: 'protocol-client-missing'
  readonly protocol: ProtocolKey
}

export interface Connection {
  readonly transport: Transport
  readonly availability: {
    /** The protocols open in the last view; empty before the first snapshot. */
    current(): ReadonlySet<ProtocolKey>
    isOpen(key: ProtocolKey): boolean
    subscribe(listener: (open: ReadonlySet<ProtocolKey>) => void): () => void
  }
  readonly login: {
    state(): LoginState
    subscribe(listener: (state: LoginState) => void): () => void
  }
  /** A protocol client says it is on the tree; returns the way to say it left. */
  readonly claim: (key: ProtocolKey) => () => void
  readonly readRetry: ReadRetry | undefined
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    connection: ConnectionService
  }
}

export type ConnectionOptions = {
  readonly transport: Transport
  readonly login: LoginStateSource
  readonly backoff?: Backoff
  readonly diagnostics?: (event: AssemblyDiagnostic) => void
  /** Waits `ms`, or less when `signal` aborts. Absent: `setTimeout`. */
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>
  readonly readRetry?: Pick<ReadRetry, 'delayMs'>
}

function timerSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done)
    function done(): void {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
  })
}

/** The availability as the connection holds it, with its listeners and the claimed keys. */
function availabilityState(diagnostics: ConnectionOptions['diagnostics']) {
  let view: AvailabilityView | undefined
  let current: ReadonlySet<ProtocolKey> = new Set()
  const listeners = new Set<(open: ReadonlySet<ProtocolKey>) => void>()
  const claimed = new Map<string, number>()
  const reported = new Set<string>()

  function reportMissing(): void {
    for (const [text, key] of view?.open ?? []) {
      if ((claimed.get(text) ?? 0) > 0 || reported.has(text)) continue
      reported.add(text)
      diagnostics?.({ code: 'protocol-client-missing', protocol: key })
    }
    for (const text of reported) if (view?.open.has(text) !== true) reported.delete(text)
  }

  return {
    view: () => view,
    set(next: AvailabilityView): void {
      view = next
      current = new Set(next.open.values())
      reportMissing()
      for (const listener of Array.from(listeners)) listener(current)
    },
    face: {
      current: () => current,
      isOpen: (key: ProtocolKey) => view?.open.has(keyText(key)) === true,
      subscribe(listener: (open: ReadonlySet<ProtocolKey>) => void): () => void {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    claim(key: ProtocolKey): () => void {
      const text = keyText(key)
      claimed.set(text, (claimed.get(text) ?? 0) + 1)
      let left = false
      return () => {
        if (left) return
        left = true
        claimed.set(text, (claimed.get(text) ?? 1) - 1)
      }
    },
  }
}

/**
 * The service `connection`: the transport, the availability view, the login state. Constructed by
 * `connectionPlugin`; it follows the availability for as long as its fiber lives.
 *
 * @owner packages/access/client-assembly
 */
export class ConnectionService extends Service implements Connection {
  readonly transport: Transport
  readonly availability: Connection['availability']
  readonly login: Connection['login']
  readonly claim: Connection['claim']
  readonly readRetry: Connection['readRetry']

  constructor(ctx: Context, options: ConnectionOptions) {
    super(ctx, 'connection')
    const backoff = options.backoff ?? defaultBackoff
    const sleep = options.sleep ?? timerSleep
    const state = availabilityState(options.diagnostics)
    const access = createClient(accessProtocol, options.transport)
    this.transport = options.transport
    this.availability = state.face
    this.login = {
      state: () => options.login.state(),
      subscribe: listener => options.login.subscribe(listener),
    }
    this.claim = key => state.claim(key)

    async function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
      if (signal?.aborted === true) return
      const ended = new AbortController()
      const end = (): void => ended.abort()
      signal?.addEventListener('abort', end)
      const unsubscribe = state.face.subscribe(end)
      try {
        await sleep(ms, ended.signal)
      } finally {
        unsubscribe()
        signal?.removeEventListener('abort', end)
      }
    }
    this.readRetry =
      options.readRetry === undefined ? undefined : { delayMs: options.readRetry.delayMs, wait }

    /** One subscription; answers whether it broke or saw a frame off its base. */
    async function follow(stopped: AbortSignal): Promise<'broke' | 'off-base'> {
      const subscription = new AbortController()
      const stop = (): void => subscription.abort()
      stopped.addEventListener('abort', stop)
      const frames = access.observe.availability({}, { signal: subscription.signal })
      try {
        for (;;) {
          const next = await frames.next()
          if (next.done === true) return 'broke'
          const step = applyFrame(state.view(), next.value)
          if (step.kind === 'resubscribe') return 'off-base'
          state.set(step.view)
        }
      } finally {
        stopped.removeEventListener('abort', stop)
        subscription.abort()
        await frames.return({ kind: 'aborted' })
      }
    }

    async function run(stopped: AbortSignal): Promise<void> {
      let attempt = 0
      while (!stopped.aborted) {
        const revision = state.view()?.revision
        const outcome = await follow(stopped)
        if (outcome === 'off-base' || stopped.aborted) continue
        // A subscription that saw a frame starts the backoff over.
        attempt = state.view()?.revision === revision ? attempt + 1 : 1
        await sleep(backoff.delayMs(attempt - 1), stopped)
      }
    }

    ctx.effect(() => {
      const stopped = new AbortController()
      const running = run(stopped.signal)
      return async () => {
        stopped.abort()
        await running
      }
    }, 'connection.availability')
  }
}

/** The plugin that puts `connection` on the tree. */
export function connectionPlugin(options: ConnectionOptions): Plugin.Object {
  return {
    name: 'connection-host',
    apply(ctx: Context) {
      ctx.plugin(ConnectionService, options)
    },
  }
}

/**
 * A client whose methods answer `unavailable` once `revoked` is set, and whose observations end.
 * A call under way when `revoked` is set ends locally: the mark aborts it, so a send that did not
 * leave answers `unavailable` and is not sent again, and one that may have left answers
 * `uncertain`.
 */
function guarded<P extends ProtocolContract>(
  protocol: P,
  client: ClientOf<P>,
  revoked: AbortSignal,
): ClientOf<P> {
  const unavailable = Object.freeze({ outcome: 'unavailable' as const })
  const raw = client as unknown as Record<
    string,
    (body: unknown, options: { signal: AbortSignal; messageId?: string }) => unknown
  >
  const guardedClient: Record<string, unknown> = {}
  for (const name of Object.keys(protocol.operations))
    guardedClient[name] = (
      body: unknown,
      options?: { signal?: AbortSignal; messageId?: string },
    ) =>
      revoked.aborted
        ? Promise.resolve(unavailable)
        : raw[name]!(body, {
            ...options,
            signal:
              options?.signal === undefined ? revoked : AbortSignal.any([options.signal, revoked]),
          })
  const observers: Record<string, unknown> = {}
  const rawObservers = client.observe as unknown as Record<
    string,
    (open: unknown, options: { signal: AbortSignal }) => AsyncGenerator<unknown, unknown>
  >
  for (const name of Object.keys(protocol.observations))
    observers[name] = (open: unknown, options: { signal: AbortSignal; messageId?: string }) => {
      if (revoked.aborted)
        return (async function* () {
          // No frame: the observation ends at once.
          yield* []
          return { kind: 'unavailable' }
        })()
      // The subscription handle ends when the protocol client is withdrawn.
      return rawObservers[name]!(open, {
        ...options,
        signal: AbortSignal.any([options.signal, revoked]),
      })
    }
  guardedClient['observe'] = observers
  return guardedClient as ClientOf<P>
}

/** The tree's service name of a protocol client. */
export const protocolServiceName = (key: ProtocolKey): string => `protocol:${keyText(key)}`

/**
 * The plugin of one protocol's client. It depends on `connection`, and provides
 * `protocol:<name>/v<major>` (value `ClientOf<P>`) while the availability says the protocol is open.
 */
export function defineProtocolClient<P extends ProtocolContract>(protocol: P): Plugin.Object {
  const key: ProtocolKey = { name: protocol.name, major: protocol.major }
  const service = protocolServiceName(key)
  return {
    name: `protocol-client:${keyText(key)}`,
    inject: ['connection'],
    apply(ctx: Context) {
      const connection = ctx.connection
      let provided: { revoke: AbortController; withdraw: () => Promise<void> } | undefined

      function withdraw(): Promise<void> {
        if (provided === undefined) return Promise.resolve()
        const { revoke, withdraw: unregister } = provided
        provided = undefined
        // Marked first: from here on every method answers `unavailable`, also through old handles.
        revoke.abort()
        return unregister()
      }

      function sync(): void {
        const open = connection.availability.isOpen(key)
        if (open && provided === undefined) {
          const revoke = new AbortController()
          const { readRetry } = connection
          const client = guarded(
            protocol,
            readRetry === undefined
              ? createClient(protocol, connection.transport)
              : createClient(protocol, connection.transport, { readRetry }),
            revoke.signal,
          )
          const unregister = ctx.reflect.provide(service, client)
          provided = { revoke, withdraw: async () => unregister() }
        } else if (!open) void withdraw()
      }

      ctx.effect(() => {
        const leave = connection.claim(key)
        const unsubscribe = connection.availability.subscribe(sync)
        sync()
        return async () => {
          unsubscribe()
          leave()
          await withdraw()
        }
      }, 'protocol-client')
    },
  }
}
