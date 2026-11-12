// A protocol client on the client tree, on real Cordis 4.0.4 (#1249 C16, C17). The C16 cases are
// named after the cells of RFC-0015 §13「客户端：树上的一个协议客户端」: event, then the state of
// the service. Cells the table marks unreachable have no case.
import { Context, type Fiber } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import type { AvailabilityFrame } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import {
  connectionPlugin,
  defineProtocolClient,
  protocolServiceName,
  type AssemblyDiagnostic,
  type LoginState,
  type LoginStateSource,
} from '@omne-harness/client-assembly/cordis'
import { fakeTransport, settle, type FakeTransport } from './support/fake-transport.ts'
import { ACCESS, NOTES, OTHER, notesProtocol } from './support/notes.ts'

const SERVICE = protocolServiceName(NOTES)
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
  /** How many times the module that depends on the service loaded and unloaded. */
  readonly module: { loaded: number; unloaded: number }
  readonly service: () => Notes | undefined
}

/** A tree with the connection, the notes protocol client unless left out, and a module using it. */
async function tree(options: { withoutClient?: boolean } = {}): Promise<Tree> {
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
      // The backoff waits no real time: it records the delay and yields once.
      sleep: async ms => {
        delays.push(ms)
        await new Promise(resolve => setImmediate(resolve))
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

describe('C17: the connection follows the availability', () => {
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
    // Revision 3 does not sit on revision 1: a change was missed.
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
    // A subscription that saw a frame starts the backoff over.
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

describe('C16: one protocol client on the tree', () => {
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
    // `access/v1` has no protocol client on this tree either.
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

  it('在途调用遇到服务收回：字节没发出的答不可用，可能发出的答 uncertain，不重发', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS, NOTES))
    await settle()
    const notes = t.service()!
    const inFlight = notes.hold({})
    await settle()
    t.fake.push(removed(2, NOTES))
    await settle()
    t.fake.hold!.settle({ kind: 'uncertain' })
    expect(await inFlight).toEqual({ outcome: 'uncertain' })
    const sends = t.fake.calls.length
    expect(await notes.ping({})).toEqual({ outcome: 'unavailable' })
    expect(t.fake.calls).toHaveLength(sends)
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

  it('连接恢复，可用性给出新快照：按差异提供或收回', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS))
    await settle()
    t.fake.breakStream()
    await settle()
    t.fake.push(snapshot(4, ACCESS, NOTES))
    await settle()
    expect(t.service()).toBeDefined()
    t.fake.breakStream()
    await settle()
    t.fake.push(snapshot(6, ACCESS))
    await settle()
    expect(t.service()).toBeUndefined()
    expect(t.module).toEqual({ loaded: 1, unloaded: 1 })
  })

  it('换登录或换租户：不变', async () => {
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
