import { Context, type Fiber } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import type { AvailabilityFrame } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import {
  connectionPlugin,
  defineProtocolClient,
  protocolServiceName,
  type AssemblyDiagnostic,
  type Connection,
  type LoginState,
  type LoginStateSource,
} from '@omne-harness/client-assembly/cordis'
import { fakeTransport, settle, type FakeTransport } from './support/fake-transport.ts'
import { ACCESS, NOTES, OTHER, notesProtocol } from './support/notes.ts'

const SERVICE = protocolServiceName(NOTES)
const HANG_MS = 60_000
const BASIS_UNAVAILABLE = {
  kind: 'answered',
  outcome: 'basis-unavailable',
  body: { kind: 'object', entries: [] },
} as const
type Notes = ClientOf<typeof notesProtocol>

function loginSource(initial: LoginState = 'signed-out') {
  let state = initial
  const listeners = new Set<(state: LoginState) => void>()
  const source: LoginStateSource = {
    state: () => state,
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  return {
    source,
    set(next: LoginState) {
      state = next
      for (const listener of listeners) listener(next)
    },
  }
}

const snapshot = (revision: number, ...protocols: { name: string; major: number }[]) =>
  ({ kind: 'snapshot', revision, protocols }) satisfies AvailabilityFrame
const added = (revision: number, protocol: { name: string; major: number }) =>
  ({ kind: 'change', revision, added: [protocol], removed: [] }) satisfies AvailabilityFrame
const removed = (revision: number, protocol: { name: string; major: number }) =>
  ({ kind: 'change', revision, added: [], removed: [protocol] }) satisfies AvailabilityFrame

const roots: Context[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await root.fiber.dispose()
})

type Tree = {
  readonly root: Context
  readonly fake: FakeTransport
  readonly diagnostics: AssemblyDiagnostic[]
  readonly delays: number[]
  readonly login: ReturnType<typeof loginSource>
  readonly module: { loaded: number; unloaded: number }
  readonly service: () => Notes | undefined
}

async function tree(
  options: {
    withoutClient?: boolean
    readRetry?: { readonly delayMs: (failures: number, elapsedMs: number) => number | null }
    backoff?: { readonly delayMs: (attempt: number) => number }
  } = {},
): Promise<Tree> {
  const root = new Context()
  roots.push(root)
  const fake = fakeTransport()
  const diagnostics: AssemblyDiagnostic[] = []
  const delays: number[] = []
  const login = loginSource()
  await root.plugin(
    connectionPlugin({
      transport: fake.transport,
      login: login.source,
      diagnostics: event => diagnostics.push(event),
      ...(options.readRetry === undefined ? {} : { readRetry: options.readRetry }),
      ...(options.backoff === undefined ? {} : { backoff: options.backoff }),
      sleep: async (ms, signal) => {
        delays.push(ms)
        if (ms !== HANG_MS) return new Promise(resolve => setImmediate(resolve))
        if (!signal.aborted)
          await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
      },
    }),
  )
  if (options.withoutClient !== true) await root.plugin(defineProtocolClient(notesProtocol))
  const module = { loaded: 0, unloaded: 0 }
  await root.plugin({
    name: 'notes-module',
    inject: [SERVICE],
    apply(ctx: Context) {
      module.loaded += 1
      ctx.effect(() => () => {
        module.unloaded += 1
      })
    },
  })
  await settle()
  return { root, fake, diagnostics, delays, login, module, service: () => root.get(SERVICE) }
}

describe('the connection follows the availability', () => {
  it('subscribes at once and takes the snapshot', async () => {
    const t = await tree()
    expect(t.fake.subscriptions).toHaveLength(1)
    t.fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    const connection = t.root.get('connection')!
    expect([...connection.availability.current()].map(key => key.name)).toEqual(['access', 'notes'])
    expect(connection.availability.isOpen(NOTES)).toBe(true)
  })

  it('客户端收到基础对不上的变化帧时不应用，改为重新订阅', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS))
    await settle()
    t.fake.push(added(3, NOTES))
    await settle()
    expect(t.service()).toBeUndefined()
    expect(t.fake.subscriptions).toHaveLength(2)
    expect(t.fake.subscriptions[0]!.signal.aborted).toBe(true)
    expect(t.delays).toEqual([])
    t.fake.push(snapshot(3, ACCESS, NOTES))
    await settle()
    expect(t.service()).toBeDefined()
  })

  it('reconnects with backoff when the observation breaks, and keeps the protocol clients meanwhile', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    const before = t.service()
    t.fake.breakStream()
    await settle()
    t.fake.breakStream()
    await settle()
    expect(t.delays).toEqual([200, 400])
    expect(t.fake.subscriptions).toHaveLength(3)
    expect(t.service()).toBe(before)
    t.fake.push(snapshot(2, ACCESS))
    await settle()
    expect(t.service()).toBeUndefined()
    t.fake.breakStream()
    await settle()
    expect(t.delays).toEqual([200, 400, 200])
  })

  it('stops following when the connection unloads', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    await t.root.fiber.dispose()
    roots.splice(roots.indexOf(t.root), 1)
    expect(t.fake.subscriptions.every(subscription => subscription.signal.aborted)).toBe(true)
  })
})

describe('one protocol client on the tree', () => {
  it('开放了，装了插件，服务未提供：提供服务，依赖它的模块加载', async () => {
    const t = await tree()
    expect(t.service()).toBeUndefined()
    expect(t.module.loaded).toBe(0)
    t.fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    expect(await t.service()!.ping({})).toEqual({ outcome: 'succeeded', body: {} })
    expect(t.module.loaded).toBe(1)
  })

  it('开放了，装了插件，服务已提供：不变', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    const before = t.service()
    t.fake.push(added(2, OTHER))
    await settle()
    expect(t.service()).toBe(before)
    expect(t.module).toEqual({ loaded: 1, unloaded: 0 })
  })

  it('开放了，没装插件，服务未提供：不变，记一条诊断', async () => {
    const t = await tree({ withoutClient: true })
    t.fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    expect(t.service()).toBeUndefined()
    expect(t.diagnostics).toEqual([
      { code: 'protocol-client-missing', protocol: ACCESS },
      { code: 'protocol-client-missing', protocol: NOTES },
    ])
    t.fake.push(added(2, OTHER))
    await settle()
    expect(t.diagnostics.map(event => event.protocol.name)).toEqual(['access', 'notes', 'other'])
  })

  it('撤下了，服务未提供：不变', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS, OTHER))
    t.fake.push(removed(2, OTHER))
    await settle()
    expect(t.service()).toBeUndefined()
    expect(t.module).toEqual({ loaded: 0, unloaded: 0 })
  })

  it('撤下了，服务已提供：服务立刻不可见，依赖它的模块卸载，订阅句柄结束', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    const notes = t.service()!
    const watching = notes.observe['watch-all']({}, { signal: new AbortController().signal })
    const ended = watching.next()
    await settle()
    t.fake.push(removed(2, NOTES))
    await settle()
    expect(t.service()).toBeUndefined()
    expect(t.module).toEqual({ loaded: 1, unloaded: 1 })
    expect(await ended).toEqual({ done: true, value: { kind: 'aborted' } })
  })

  it('在途调用遇到服务收回，服务已提供，字节可能已发出：本地答 uncertain，不等传输', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    const notes = t.service()!
    const inFlight = notes.hold({})
    await settle()
    t.fake.push(removed(2, NOTES))
    expect(await inFlight).toEqual({ outcome: 'uncertain' })
    expect(t.fake.sent).toHaveLength(1)
  })

  it('在途调用遇到服务收回，服务已提供，字节没发出：本地答不可用，收回之后不再送', async () => {
    const t = await tree()
    t.fake.heldOnAbort = 'not-sent'
    t.fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    const notes = t.service()!
    const inFlight = notes.hold({})
    await settle()
    t.fake.push(removed(2, NOTES))
    expect(await inFlight).toEqual({ outcome: 'unavailable' })
    expect(t.fake.sent).toEqual([])
  })

  it('在途调用遇到连接断开，服务已提供：传输拿不准的答 uncertain，不重发', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    const notes = t.service()!
    const inFlight = notes.hold({})
    await settle()
    t.fake.breakStream()
    t.fake.hold!.settle({ kind: 'uncertain' })
    expect(await inFlight).toEqual({ outcome: 'uncertain' })
    expect(t.fake.calls).toHaveLength(1)
    expect(t.service()).toBe(notes)
  })

  it('外部代码留着的旧方法句柄，在服务收回之后调用，本地拒绝', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    const { ping } = t.service()!
    const watch = t.service()!.observe['watch-all']
    t.fake.push(removed(2, NOTES))
    await settle()
    expect(await ping({})).toEqual({ outcome: 'unavailable' })
    const frames = watch({}, { signal: new AbortController().signal })
    expect(await frames.next()).toEqual({ done: true, value: { kind: 'unavailable' } })
    expect(t.fake.calls).toEqual([])
  })

  it('连接闪断，服务已提供：不变，服务不收回', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    const before = t.service()
    t.fake.breakStream()
    await settle()
    expect(t.service()).toBe(before)
    expect(t.module).toEqual({ loaded: 1, unloaded: 0 })
  })

  it('连接闪断，服务未提供：不变', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS))
    await settle()
    t.fake.breakStream()
    await settle()
    expect(t.service()).toBeUndefined()
    expect(t.module.loaded).toBe(0)
  })

  it('连接没有接上，服务已提供：调用由传输答没发出，得到不可用；服务不收回', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    const notes = t.service()!
    t.fake.breakStream()
    await settle()
    t.fake.script.push({ kind: 'not-sent' }, { kind: 'not-sent' })
    expect(await notes.ping({})).toEqual({ outcome: 'unavailable' })
    expect(t.fake.sent).toEqual([])
    expect(t.service()).toBe(notes)
  })

  it('连接恢复，可用性给出新快照，服务未提供：按差异提供', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS))
    await settle()
    t.fake.breakStream()
    await settle()
    t.fake.push(snapshot(4, ACCESS, NOTES))
    await settle()
    expect(t.service()).toBeDefined()
    expect(t.module).toEqual({ loaded: 1, unloaded: 0 })
  })

  it('连接恢复，可用性给出新快照，服务已提供：按差异收回，或不变', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    const before = t.service()
    t.fake.breakStream()
    await settle()
    t.fake.push(snapshot(4, ACCESS, NOTES))
    await settle()
    expect(t.service()).toBe(before)
    t.fake.breakStream()
    await settle()
    t.fake.push(snapshot(6, ACCESS))
    await settle()
    expect(t.service()).toBeUndefined()
    expect(t.module).toEqual({ loaded: 1, unloaded: 1 })
  })

  it('换登录或换租户，服务未提供：不变', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS))
    await settle()
    t.login.set('signed-in')
    await settle()
    expect(t.service()).toBeUndefined()
    expect(t.module.loaded).toBe(0)
    expect(t.fake.subscriptions).toHaveLength(1)
  })

  it('换登录或换租户，服务已提供：不变', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    const before = t.service()
    t.login.set('signed-in')
    await settle()
    expect(t.service()).toBe(before)
    expect(t.root.get('connection')!.login.state()).toBe('signed-in')
    expect(t.fake.subscriptions).toHaveLength(1)
  })

  it('unloads the protocol client plugin: the service goes and the module unloads', async () => {
    const root = new Context()
    roots.push(root)
    const fake = fakeTransport()
    await root.plugin(connectionPlugin({ transport: fake.transport, login: loginSource().source }))
    let client: Fiber | undefined
    await root.plugin({
      name: 'host',
      apply(ctx: Context) {
        client = ctx.fiber
        ctx.plugin(defineProtocolClient(notesProtocol))
      },
    })
    fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    expect(root.get(SERVICE)).toBeDefined()
    await client!.dispose()
    expect(root.get(SERVICE)).toBeUndefined()
  })
})

describe('读类调用对「现在读不到」按策略再问', () => {
  const policy = { delayMs: (): number => HANG_MS }

  it('等待在可用性送来新的一帧时立刻结束，并再问一次，不等到点', async () => {
    const t = await tree({ readRetry: policy })
    t.fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    t.fake.script.push(BASIS_UNAVAILABLE)
    const answered = t.service()!.ping({})
    await settle()
    expect(t.fake.calls).toHaveLength(1)
    expect(t.delays).toEqual([HANG_MS])
    t.fake.push(added(2, OTHER))
    expect(await answered).toEqual({ outcome: 'succeeded', body: {} })
    expect(t.fake.calls).toHaveLength(2)
    expect(t.fake.calls[0]!.messageId).not.toBe(t.fake.calls[1]!.messageId)
  })

  it('等待中调用方的信号中止：等待结束，返回手里的答复，不再问', async () => {
    const t = await tree({ readRetry: policy })
    t.fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    t.fake.script.push(BASIS_UNAVAILABLE)
    const controller = new AbortController()
    const answered = t.service()!.ping({}, { signal: controller.signal })
    await settle()
    controller.abort()
    expect(await answered).toEqual({ outcome: 'basis-unavailable' })
    expect(t.fake.calls).toHaveLength(1)
  })

  it('等待中协议被撤回：返回手里的答复，不再问', async () => {
    const t = await tree({ readRetry: policy })
    t.fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    t.fake.script.push(BASIS_UNAVAILABLE)
    const answered = t.service()!.ping({})
    await settle()
    t.fake.push(removed(2, NOTES))
    expect(await answered).toEqual({ outcome: 'basis-unavailable' })
    expect(t.fake.calls).toHaveLength(1)
  })

  it('没给策略的连接：读类调用答依据不可用时只问一次', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    t.fake.script.push(BASIS_UNAVAILABLE)
    expect(await t.service()!.ping({})).toEqual({ outcome: 'basis-unavailable' })
    expect(t.fake.calls).toHaveLength(1)
    expect(t.delays).toEqual([])
  })
})

const names = (diagnostics: readonly AssemblyDiagnostic[]): string[] =>
  diagnostics.map(event => event.protocol.name)

describe('the claims on a protocol and the missing-client diagnostic', () => {
  it('keeps a protocol claimed while any claimer is left, and reports it once the last one has left', async () => {
    const t = await tree({ withoutClient: true })
    const connection = t.root.get('connection')!
    const first = connection.claim(NOTES)
    const second = connection.claim(NOTES)
    t.fake.push(snapshot(1, NOTES))
    await settle()
    expect(t.diagnostics).toEqual([])
    first()
    t.fake.push(added(2, OTHER))
    await settle()
    expect(names(t.diagnostics)).toEqual(['other'])
    second()
    t.fake.push(removed(3, OTHER))
    await settle()
    expect(names(t.diagnostics)).toEqual(['other', 'notes'])
  })

  it('counts a claim given back twice once', async () => {
    const t = await tree({ withoutClient: true })
    const connection = t.root.get('connection')!
    const first = connection.claim(NOTES)
    connection.claim(NOTES)
    first()
    first()
    t.fake.push(snapshot(1, NOTES))
    await settle()
    expect(t.diagnostics).toEqual([])
  })

  it('does not let a surplus give-back make the count negative for the next claimer', async () => {
    const t = await tree({ withoutClient: true })
    const connection = t.root.get('connection')!
    const gone = connection.claim(NOTES)
    gone()
    gone()
    connection.claim(NOTES)
    t.fake.push(snapshot(1, NOTES))
    await settle()
    expect(t.diagnostics).toEqual([])
  })

  it('reports an unclaimed protocol once, again after it was withdrawn and came back, never for a claimed one', async () => {
    const t = await tree({ withoutClient: true })
    t.fake.push(snapshot(1, NOTES))
    await settle()
    t.fake.push(added(2, ACCESS))
    await settle()
    t.fake.push(removed(3, NOTES))
    await settle()
    t.fake.push(added(4, NOTES))
    await settle()
    t.fake.push(added(5, OTHER))
    await settle()
    expect(names(t.diagnostics)).toEqual(['notes', 'access', 'notes', 'other'])
  })

  it('does not report the protocol that has a client on the tree', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    expect(names(t.diagnostics)).toEqual(['access'])
  })
})

describe('the wait of a read retry', () => {
  const policy = { delayMs: (): number => HANG_MS }

  function spyOnSubscriptions(connection: Connection) {
    const face = connection.availability as { subscribe: Connection['availability']['subscribe'] }
    const real = face.subscribe
    const counts = { subscribed: 0, left: 0 }
    face.subscribe = listener => {
      counts.subscribed += 1
      const leave = real(listener)
      return () => {
        counts.left += 1
        leave()
      }
    }
    return counts
  }

  it('returns at once for a signal that is already aborted, without sleeping or listening', async () => {
    const t = await tree({ readRetry: policy })
    const connection = t.root.get('connection')!
    const counts = spyOnSubscriptions(connection)
    const aborted = new AbortController()
    aborted.abort()
    await connection.readRetry!.wait(HANG_MS, aborted.signal)
    expect(t.delays).toEqual([])
    expect(counts).toEqual({ subscribed: 0, left: 0 })
  })

  it('listens to the availability while it sleeps, and stops listening exactly once when it ends', async () => {
    const t = await tree({ readRetry: policy })
    t.fake.push(snapshot(1, ACCESS))
    await settle()
    const connection = t.root.get('connection')!
    const counts = spyOnSubscriptions(connection)
    const byFrame = connection.readRetry!.wait(HANG_MS, undefined)
    await settle()
    expect(t.delays).toEqual([HANG_MS])
    expect(counts).toEqual({ subscribed: 1, left: 0 })
    t.fake.push(added(2, OTHER))
    await byFrame
    expect(counts).toEqual({ subscribed: 1, left: 1 })
    const controller = new AbortController()
    const byAbort = connection.readRetry!.wait(HANG_MS, controller.signal)
    await settle()
    controller.abort()
    await byAbort
    expect(counts).toEqual({ subscribed: 2, left: 2 })
  })
})

describe('the end of the connection', () => {
  it('interrupts the backoff sleep when it unloads, resubscribes no more, and applies no later frame', async () => {
    const t = await tree({ backoff: { delayMs: () => HANG_MS } })
    t.fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    const connection = t.root.get('connection')!
    t.fake.breakStream()
    await settle()
    expect(t.delays).toEqual([HANG_MS])
    expect(t.fake.subscriptions).toHaveLength(1)
    await t.root.fiber.dispose()
    roots.splice(roots.indexOf(t.root), 1)
    t.fake.push(snapshot(2, ACCESS))
    await settle()
    expect(t.fake.subscriptions).toHaveLength(1)
    expect([...connection.availability.current()].map(key => key.name)).toEqual(['access', 'notes'])
  })
})

describe('the protocol client when its plugin unloads', () => {
  async function hosted() {
    const root = new Context()
    roots.push(root)
    const fake = fakeTransport()
    const diagnostics: AssemblyDiagnostic[] = []
    await root.plugin(
      connectionPlugin({
        transport: fake.transport,
        login: loginSource().source,
        diagnostics: event => diagnostics.push(event),
        sleep: () => new Promise(resolve => setImmediate(resolve)),
      }),
    )
    let client: Fiber | undefined
    await root.plugin({
      name: 'host',
      apply(ctx: Context) {
        client = ctx.fiber
        ctx.plugin(defineProtocolClient(notesProtocol))
      },
    })
    const module = { unloaded: 0 }
    await root.plugin({
      name: 'notes-module',
      inject: [SERVICE],
      apply(ctx: Context) {
        ctx.effect(() => () => {
          module.unloaded += 1
        })
      },
    })
    fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    return { root, fake, diagnostics, module, client: client! }
  }

  it('ends the open observations of the client and stops listening to the availability', async () => {
    const t = await hosted()
    const notes = t.root.get(SERVICE) as Notes
    const watching = notes.observe['watch-all']({}, { signal: new AbortController().signal })
    const ended = watching.next()
    await settle()
    await t.client.dispose()
    expect(await ended).toEqual({ done: true, value: { kind: 'aborted' } })
    expect(t.module.unloaded).toBe(1)
    t.fake.push(added(2, OTHER))
    await settle()
    expect(t.root.get(SERVICE)).toBeUndefined()
    expect(t.module.unloaded).toBe(1)
  })

  it('gives its claim back: the protocol it served is reported missing at the next change', async () => {
    const t = await hosted()
    expect(names(t.diagnostics)).toEqual(['access'])
    await t.client.dispose()
    t.fake.push(added(2, OTHER))
    await settle()
    expect(names(t.diagnostics)).toEqual(['access', 'notes', 'other'])
  })
})

describe('what the guarded client passes through', () => {
  it('ends an observation when its own caller aborts, and leaves the service on the tree', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    const controller = new AbortController()
    const frames = t.service()!.observe['watch-all']({}, { signal: controller.signal })
    const ended = frames.next()
    await settle()
    controller.abort()
    expect(await ended).toEqual({ done: true, value: { kind: 'aborted' } })
    expect(t.module).toEqual({ loaded: 1, unloaded: 0 })
  })

  it('ends a call when its own caller aborts, and leaves the service on the tree', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    const controller = new AbortController()
    const inFlight = t.service()!.hold({}, { signal: controller.signal })
    await settle()
    controller.abort()
    expect(await inFlight).toEqual({ outcome: 'uncertain' })
    expect(t.module).toEqual({ loaded: 1, unloaded: 0 })
  })

  it('opens an observation with the message id the caller gave', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    const controller = new AbortController()
    const frames = t
      .service()!
      .observe['watch-all']({}, { signal: controller.signal, messageId: 'm-watch' })
    const ended = frames.next()
    await settle()
    expect(t.fake.observed).toEqual([{ observation: 'watch-all', messageId: 'm-watch' }])
    controller.abort()
    await ended
  })

  it('sends the message id the caller gave', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    await t.service()!.ping({}, { messageId: 'm-given' })
    expect(t.fake.calls.map(call => call.messageId)).toEqual(['m-given'])
  })
})
