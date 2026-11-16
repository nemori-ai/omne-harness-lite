import { describe, expect, it } from 'vitest'
import { identityProtocol } from '@omne-harness/identity-protocol'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { createInProcessTransport } from '@omne-harness/sdk/core'
import { memoryCredentialStore, openLoginSession } from '../src/main-core/index.ts'
import { HOST_IPC } from '../src/shared/host-bridge.ts'
import { PROOF_SENTINEL, fakeServer, gate, settle, value } from './support/fake-server.ts'
import { FakePage, serveFakeIpc } from './support/ipc.ts'

const CALL = {
  protocol: { name: 'session', major: 1 },
  operation: 'read-history',
  messageId: 'm-1',
  body: { tenant: 't', session: 's' },
}
const OBSERVE = {
  protocol: { name: 'session', major: 1 },
  observation: 'observe-session',
  messageId: 'm-2',
  open: { session: 's' },
}
const CREDENTIALS = JSON.stringify({ loginIdentifier: 'alice', credential: 'pw' })

async function start(connect = fakeServer().connect) {
  const session = await openLoginSession({
    connect,
    store: memoryCredentialStore(),
    contracts: [identityProtocol, sessionProtocol],
  })
  return { ...serveFakeIpc(session), session }
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !check(); i += 1) await new Promise(r => setTimeout(r, 10))
  expect(check()).toBe(true)
}

const observeEvents = (page: FakePage): { id: number; text: string }[] =>
  page.events(HOST_IPC.observeEvent) as { id: number; text: string }[]

describe('桥在主进程一侧：通道与来源', () => {
  it('只登记声明过的通道名', async () => {
    const { handlers } = await start()
    expect([...handlers.keys()].sort()).toEqual(
      [
        HOST_IPC.call,
        HOST_IPC.observe,
        HOST_IPC.observeClose,
        HOST_IPC.login,
        HOST_IPC.logout,
        HOST_IPC.loginState,
      ].sort(),
    )
  })

  it('发消息的页面不是本应用的窗口就拒绝，什么也不转发', async () => {
    const server = fakeServer()
    const { invoke } = await start(server.connect)
    const origins = [
      undefined,
      'https://evil.example/',
      'omne-app://app.evil.example/',
      'omne-app://evil/index.html',
      'file:///etc/passwd',
    ]
    for (const frameUrl of origins) {
      const page = new FakePage(1)
      expect(await invoke(HOST_IPC.call, page, [JSON.stringify(CALL)], { frameUrl })).toEqual({
        refused: true,
      })
      expect(await invoke(HOST_IPC.observe, page, [JSON.stringify(OBSERVE)], { frameUrl })).toEqual(
        {
          refused: true,
        },
      )
      expect(await invoke(HOST_IPC.observeClose, page, [1], { frameUrl })).toBe(false)
      expect(await invoke(HOST_IPC.login, page, [CREDENTIALS], { frameUrl })).toEqual({
        refused: true,
      })
      expect(await invoke(HOST_IPC.logout, page, [], { frameUrl })).toEqual({ refused: true })
      expect(await invoke(HOST_IPC.loginState, page, [], { frameUrl })).toEqual({ refused: true })
      expect(page.sent).toEqual([])
    }
    expect(server.seen).toEqual([])
  })

  it('正文读不出就拒绝，不把页面给的对象原样交给宿主核心', async () => {
    const server = fakeServer()
    const { invoke } = await start(server.connect)
    const page = new FakePage(1)
    for (const channel of [HOST_IPC.call, HOST_IPC.observe, HOST_IPC.login]) {
      expect(await invoke(channel, page, ['{"not":"a message"}'])).toEqual({ refused: true })
      expect(await invoke(channel, page, [{ protocol: CALL.protocol }])).toEqual({ refused: true })
      expect(await invoke(channel, page, [])).toEqual({ refused: true })
    }
    expect(server.seen).toEqual([])
  })
})

describe('桥在主进程一侧：调用、登录与退出', () => {
  it('调用：答复经现有的写法，带凭据的操作经这条通道被拒', async () => {
    const server = fakeServer()
    const { invoke } = await start(server.connect)
    const page = new FakePage(1)
    const answer = (await invoke(HOST_IPC.call, page, [JSON.stringify(CALL)])) as { text: string }
    expect(JSON.parse(answer.text)).toMatchObject({ kind: 'answered', outcome: 'succeeded' })
    const credentialed = await invoke(HOST_IPC.call, page, [
      JSON.stringify({
        ...CALL,
        protocol: { name: 'identity', major: 1 },
        operation: 'issue-login',
        body: { loginIdentifier: 'alice', credential: 'pw' },
      }),
    ])
    expect(JSON.parse((credentialed as { text: string }).text)).toEqual({ kind: 'not-sent' })
    expect(server.seen.map(item => item.target)).toEqual(['session/v1 read-history'])
  })

  it('登录与退出的答复里只有结果，没有登录证明', async () => {
    const server = fakeServer()
    const { invoke } = await start(server.connect)
    const page = new FakePage(1)
    const login = await invoke(HOST_IPC.login, page, [CREDENTIALS])
    expect(login).toEqual({ text: JSON.stringify({ result: 'signed-in' }) })
    await invoke(HOST_IPC.call, page, [JSON.stringify(CALL)])
    expect(server.seen.at(-1)?.credentials.proof).toBe(PROOF_SENTINEL)
    const logout = await invoke(HOST_IPC.logout, page)
    expect(logout).toEqual({ text: JSON.stringify({ result: 'signed-out' }) })
    expect(JSON.stringify([login, logout, page.sent])).not.toContain(PROOF_SENTINEL)
  })

  it('调用抛出：页面读到抛出，不是一个答复', async () => {
    const { invoke } = await start(() =>
      createInProcessTransport({
        call: () => Promise.reject(new Error(PROOF_SENTINEL)),
        observe: () => {
          throw new Error(PROOF_SENTINEL)
        },
      }),
    )
    const page = new FakePage(1)
    await expect(invoke(HOST_IPC.call, page, [JSON.stringify(CALL)])).rejects.toThrow()
  })
})

describe('桥在主进程一侧：登录状态', () => {
  it('订阅先给当前状态，变了再给；重复订阅不重复发送', async () => {
    const { invoke } = await start()
    const page = new FakePage(1)
    expect(await invoke(HOST_IPC.loginState, page)).toEqual({ subscribed: true })
    expect(await invoke(HOST_IPC.loginState, page)).toEqual({ subscribed: true })
    await invoke(HOST_IPC.login, page, [CREDENTIALS])
    const states = page.events(HOST_IPC.loginStateEvent).map(text => JSON.parse(text as string))
    expect(states).toEqual([
      { state: 'signed-out' },
      { state: 'signed-out' },
      { state: 'signing-in' },
      { state: 'signed-in' },
    ])
  })

  it('页面没了就退订', async () => {
    const { invoke, session } = await start()
    const page = new FakePage(1)
    await invoke(HOST_IPC.loginState, page)
    const before = page.sent.length
    page.gone()
    await session.login({ loginIdentifier: 'alice', credential: 'pw' })
    expect(page.sent).toHaveLength(before)
  })
})

describe('桥在主进程一侧：观察', () => {
  function held() {
    const server = fakeServer()
    const release = gate<void>()
    const state = { cancelled: false, signal: undefined as AbortSignal | undefined }
    server.stream('session/v1 observe-session', async function* (request) {
      state.signal = request.signal
      try {
        yield value({ n: 1 })
        await release.promise
        yield value({ n: 2 })
        return { kind: 'ended', reason: 'refresh-exhausted' }
      } finally {
        state.cancelled = request.signal.aborted
      }
    })
    return { server, release, state }
  }

  async function open(invoke: Awaited<ReturnType<typeof start>>['invoke'], page: FakePage) {
    const reply = (await invoke(HOST_IPC.observe, page, [JSON.stringify(OBSERVE)])) as {
      id: number
    }
    expect(typeof reply.id).toBe('number')
    return reply.id
  }

  it('没开：关答「没有这个观察」，不报错；页面没了无事', async () => {
    const { invoke } = await start()
    const page = new FakePage(1)
    expect(await invoke(HOST_IPC.observeClose, page, [99])).toBe(false)
    expect(await invoke(HOST_IPC.observeClose, page, ['x'])).toBe(false)
    page.gone()
    expect(page.sent).toEqual([])
  })

  it('开着：一帧一个带编号的事件，上游结束发一次结束事件，之后关答没有这个观察', async () => {
    const { server, release } = held()
    const { invoke } = await start(server.connect)
    const page = new FakePage(1)
    const id = await open(invoke, page)
    await until(() => observeEvents(page).length === 1)
    release.open()
    await until(() => observeEvents(page).length === 3)
    expect(observeEvents(page).map(item => ({ id: item.id, ...JSON.parse(item.text) }))).toEqual([
      { id, kind: 'frame', frame: { n: 1 } },
      { id, kind: 'frame', frame: { n: 2 } },
      { id, kind: 'end', end: { kind: 'ended', reason: 'refresh-exhausted' } },
    ])
    expect(await invoke(HOST_IPC.observeClose, page, [id])).toBe(false)
    await settle()
    expect(observeEvents(page)).toHaveLength(3)
  })

  it('被拒的观察以结束事件答复', async () => {
    const { invoke } = await start()
    const page = new FakePage(1)
    const id = await open(invoke, page)
    await until(() => observeEvents(page).length === 1)
    expect(JSON.parse(observeEvents(page)[0]!.text)).toEqual({
      kind: 'end',
      end: { kind: 'refused', outcome: 'basis-unavailable' },
    })
    expect(observeEvents(page)[0]!.id).toBe(id)
  })

  it('每个观察的编号不重复', async () => {
    const { server } = held()
    const { invoke } = await start(server.connect)
    const page = new FakePage(1)
    const ids = [await open(invoke, page), await open(invoke, page), await open(invoke, page)]
    expect(new Set(ids).size).toBe(3)
  })

  it('开着、页面关：取消上游，不发结束事件，帧到了也丢弃', async () => {
    const { server, release, state } = held()
    const { invoke } = await start(server.connect)
    const page = new FakePage(1)
    const id = await open(invoke, page)
    await until(() => observeEvents(page).length === 1)
    expect(await invoke(HOST_IPC.observeClose, page, [id])).toBe(true)
    expect(state.signal?.aborted).toBe(true)
    release.open()
    await until(() => state.cancelled)
    await settle()
    expect(observeEvents(page)).toHaveLength(1)
    expect(await invoke(HOST_IPC.observeClose, page, [id])).toBe(false)
  })

  it('开着、页面没了：取消上游，不再发任何事件', async () => {
    const { server, release, state } = held()
    const { invoke } = await start(server.connect)
    const page = new FakePage(1)
    await open(invoke, page)
    await until(() => observeEvents(page).length === 1)
    page.gone()
    expect(state.signal?.aborted).toBe(true)
    release.open()
    await until(() => state.cancelled)
    await settle()
    expect(observeEvents(page)).toHaveLength(1)
  })

  it('一个页面不能关另一个页面开的观察', async () => {
    const { server, state } = held()
    const { invoke } = await start(server.connect)
    const owner = new FakePage(1)
    const other = new FakePage(2)
    const id = await open(invoke, owner)
    expect(await invoke(HOST_IPC.observeClose, other, [id])).toBe(false)
    expect(state.signal?.aborted).toBe(false)
  })

  it('页面重新加载后再用：重新登记页面没了的回调', async () => {
    const { server, state } = held()
    const { invoke } = await start(server.connect)
    const page = new FakePage(1)
    await open(invoke, page)
    page.gone()
    expect(state.signal?.aborted).toBe(true)
    await open(invoke, page)
    expect(page.goneListeners).toHaveLength(1)
  })

  it('上游抛出时发「不确定」结束事件', async () => {
    const server = fakeServer()
    server.stream('session/v1 observe-session', async function* () {
      yield value({ n: 1 })
      throw new Error('boom')
    })
    const { invoke } = await start(server.connect)
    const page = new FakePage(1)
    await open(invoke, page)
    await until(() => observeEvents(page).length === 2)
    expect(JSON.parse(observeEvents(page)[1]!.text)).toEqual({
      kind: 'end',
      end: { kind: 'uncertain' },
    })
  })

  it('调用在途时页面没了：取消这次调用', async () => {
    let signal: AbortSignal | undefined
    const { invoke } = await start(() =>
      createInProcessTransport({
        call: request =>
          new Promise(resolve => {
            signal = request.signal
            request.signal?.addEventListener('abort', () => resolve({ kind: 'uncertain' }))
          }),
        observe: () => {
          throw new Error('unused')
        },
      }),
    )
    const page = new FakePage(1)
    const pending = invoke(HOST_IPC.call, page, [JSON.stringify(CALL)])
    await until(() => signal !== undefined)
    page.gone()
    expect(signal?.aborted).toBe(true)
    expect(JSON.parse(((await pending) as { text: string }).text)).toEqual({ kind: 'uncertain' })
  })
})
