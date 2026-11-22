import { Service, type Context, type Plugin } from '@deepseek-ai/cordis'
import { ask, declare } from '@omne-harness/dynamis'
import type { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { accessProtocol, type ProtocolContract } from '@omne-harness/public-contract'
import { createClient, type ClientOf, type ReadRetry, type Transport } from '@omne-harness/sdk/core'
import {
  applyFrame,
  defaultBackoff,
  keyText,
  protocolStanding,
  type AvailabilityView,
  type Backoff,
  type ProtocolStanding,
  type ServerPoint,
  type ProtocolKey,
} from './availability.ts'
import {
  alwaysClient,
  CONNECTION_PROTOCOLS_POINT,
  protocolsContract,
  servedEntry,
  type ServedProtocol,
} from './protocols-point.ts'

export type LoginState = 'signed-out' | 'signing-in' | 'signed-in' | 'signing-out'

export interface LoginStateSource {
  state(): LoginState
  subscribe(listener: (state: LoginState) => void): () => void
}

export type AssemblyDiagnostic = {
  readonly code: 'protocol-client-missing'
  readonly protocol: ProtocolKey
}

export interface Connection {
  readonly transport: Transport
  readonly availability: {
    current(): ReadonlySet<ProtocolKey>
    isOpen(key: ProtocolKey): boolean
    /** The revision the server has this protocol at; nothing when it is not served or not said. */
    peerRevision(key: ProtocolKey): number | undefined
    /** The revision of the view now applied; nothing before the first one arrived. */
    revision(): number | undefined
    /** Where one protocol stands in what the server tells now. */
    standing(key: ProtocolKey): ProtocolStanding
    /** The points the server declares; and the keys now on one of them, where it makes them public. */
    points(): ReadonlyMap<string, ServerPoint>
    keys(point: string): readonly string[] | undefined
    subscribe(listener: (open: ReadonlySet<ProtocolKey>) => void): () => void
  }
  readonly login: {
    state(): LoginState
    subscribe(listener: (state: LoginState) => void): () => void
  }
  readonly claim: (key: ProtocolKey) => () => void
  readonly readRetry: ReadRetry | undefined
  /** The client of a protocol that is always there: a call goes out only while the protocol is pinned. */
  client<P extends ProtocolContract>(protocol: P): ClientOf<P>
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

const NO_POINTS: ReadonlyMap<string, ServerPoint> = new Map()

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
      peerRevision: (key: ProtocolKey) => view?.revisions.get(keyText(key)),
      revision: () => view?.revision,
      standing: (key: ProtocolKey) => protocolStanding(view, key),
      points: (): ReadonlyMap<string, ServerPoint> => view?.points ?? NO_POINTS,
      keys: (point: string) => view?.points.get(point)?.keys,
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
  private readonly clients = new Map<string, object>()

  client<P extends ProtocolContract>(protocol: P): ClientOf<P> {
    const key = keyText(protocol)
    const known = this.clients.get(key)
    if (known !== undefined) return known as ClientOf<P>
    // The root is asked at each call: the registry may come and go while this client is held.
    const registry = (): DynamisService | undefined => this.ctx.root.get('dynamis')
    const made = alwaysClient(protocol, () => {
      const tree = registry()
      return tree === undefined
        ? { kind: 'none', filtered: [] }
        : ask<ServedProtocol>(tree.registry(), CONNECTION_PROTOCOLS_POINT, key, [])
    })
    this.clients.set(key, made)
    return made
  }

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

export function connectionPlugin(options: ConnectionOptions): Plugin.Object {
  return {
    name: 'connection-host',
    apply(ctx: Context) {
      ctx.plugin(ConnectionService, options)
      ctx.plugin(protocolsPointPlugin)
    },
  }
}

const protocolsPointPlugin: Plugin.Object = {
  name: 'connection-protocols',
  inject: ['dynamis'],
  apply(ctx: Context) {
    ctx.get('dynamis')?.put([declare(protocolsContract)])
  },
}

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
          yield* []
          return { kind: 'unavailable' }
        })()
      return rawObservers[name]!(open, {
        ...options,
        signal: AbortSignal.any([options.signal, revoked]),
      })
    }
  guardedClient['observe'] = observers
  return guardedClient as ClientOf<P>
}

export const protocolServiceName = (key: ProtocolKey): string => `protocol:${keyText(key)}`

export function defineProtocolClient<P extends ProtocolContract>(protocol: P): Plugin.Object {
  const key: ProtocolKey = { name: protocol.name, major: protocol.major }
  const service = protocolServiceName(key)
  return {
    name: `protocol-client:${keyText(key)}`,
    inject: ['connection', 'dynamis'],
    apply(ctx: Context) {
      const connection = ctx.connection
      const tree = ctx.get('dynamis') as DynamisService
      let provided: { revoke: AbortController; withdraw: () => Promise<void> } | undefined

      function withdraw(): Promise<void> {
        if (provided === undefined) return Promise.resolve()
        const { revoke, withdraw: unregister } = provided
        provided = undefined
        revoke.abort()
        return unregister()
      }

      function sync(): void {
        const open = connection.availability.isOpen(key)
        if (open && provided === undefined) {
          const revoke = new AbortController()
          const { readRetry } = connection
          const peerRevision = (): number | undefined => connection.availability.peerRevision(key)
          const settings = readRetry === undefined ? { peerRevision } : { readRetry, peerRevision }
          const client = guarded(
            protocol,
            createClient(protocol, connection.transport, settings),
            revoke.signal,
          )
          const unregister = ctx.reflect.provide(service, client)
          const take = tree.put([servedEntry(key, client, peerRevision())])
          provided = {
            revoke,
            async withdraw() {
              await take()
              unregister()
            },
          }
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
