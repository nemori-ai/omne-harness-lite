// @vitest-environment happy-dom
import { act, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SayItem, SayOutcome } from '@omne-harness/shell-contract'
import { SessionDriver } from '../src/model/session-driver.ts'
import type { Event } from '../src/model/session-machine.ts'
import type { CompanionDrawing } from '../src/parts.ts'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'
import { listed, listPage, page, userEntry } from './fixtures/frames.ts'
import { mountModule } from './fixtures/shell.tsx'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const OTHER =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000002"}'
const TENANT_CHANGED = '租户换了，这句话没有交出去。'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

async function mounted(fake: FakeClient) {
  const made = await mountModule(fake.client, TENANT)
  await settle()
  const [item] = made.shell.items('say')
  if (item === undefined) throw new Error('the session module put nothing on shell.say')
  return { ...made, item }
}

async function listedAs(fake: FakeClient, ...sessions: ReturnType<typeof listed>[]) {
  ;(await fake.next('list-sessions')).answer(listPage(sessions))
  await settle()
}

async function opened(fake: FakeClient, item: SayItem, session: string) {
  act(() => item.show(TENANT, session))
  ;(await fake.next('read-history')).answer({
    outcome: 'succeeded',
    body: page([userEntry('1', '1', '早')], '1'),
  })
  await settle()
}

const sends = (fake: FakeClient) => fake.calls.filter(call => call.operation === 'send-input')

describe('会话往说话位放的一项', () => {
  it('只放一项，标识是 session', async () => {
    const { shell } = await mounted(createFakeClient())
    expect(shell.items('say').map(item => item.id)).toEqual(['session'])
    expect(shell.conflicts('say')).toEqual([])
  })

  it('没有协议客户端时不放', async () => {
    const fake = createFakeClient()
    const made = await mounted(fake)
    await made.withdraw()
    await settle()
    expect(made.shell.items('say')).toEqual([])
  })
})

describe('说给谁：候选与缺省', () => {
  it('列表还没读到：候选答 undefined，不答空表；读到后是列表现在显示的会话，没有名字的同列表的写法', async () => {
    const fake = createFakeClient()
    const { item } = await mounted(fake)
    expect(item.targets(TENANT)).toBeUndefined()
    await listedAs(fake, listed('ses_a', '甲'), listed('ses_b'))
    expect(item.targets(TENANT)).toEqual([
      { key: 'ses_a', label: '甲' },
      { key: 'ses_b', label: '未命名的会话 ses_b' },
    ])
  })

  it('目录没读到：候选答 undefined', async () => {
    const fake = createFakeClient()
    const { item } = await mounted(fake)
    ;(await fake.next('list-sessions')).answer({ outcome: 'unavailable' })
    await settle()
    expect(item.targets(TENANT)).toBeUndefined()
  })

  it('读到了，一个会话也没有：候选是空表', async () => {
    const fake = createFakeClient()
    const { item } = await mounted(fake)
    await listedAs(fake)
    expect(item.targets(TENANT)).toEqual([])
  })

  it('列表没变时候选是同一个表', async () => {
    const fake = createFakeClient()
    const { item } = await mounted(fake)
    await listedAs(fake, listed('ses_a', '甲'))
    expect(item.targets(TENANT)).toBe(item.targets(TENANT))
  })

  it('缺省：没有打开着的会话答 undefined，打开了答它', async () => {
    const fake = createFakeClient()
    const { item } = await mounted(fake)
    await listedAs(fake, listed('ses_a', '甲'))
    expect(item.current(TENANT)).toBeUndefined()
    await opened(fake, item, 'ses_a')
    expect(item.current(TENANT)).toBe('ses_a')
  })

  it('候选或缺省变了叫一声；退订之后不叫', async () => {
    const fake = createFakeClient()
    const { item } = await mounted(fake)
    let told = 0
    const stop = item.subscribe(() => (told += 1))
    await listedAs(fake, listed('ses_a', '甲'))
    expect(told).toBe(1)
    await opened(fake, item, 'ses_a')
    expect(told).toBe(2)
    stop()
    act(() => item.show(TENANT, 'ses_b'))
    await settle()
    expect(item.current(TENANT)).toBe('ses_b')
    expect(told).toBe(2)
  })
})

describe('租户不是这个模块当前的租户', () => {
  it('候选与缺省答 undefined，说话答没发出、原因是租户换了，什么都不发', async () => {
    const fake = createFakeClient()
    const { item } = await mounted(fake)
    await listedAs(fake, listed('ses_a', '甲'))
    const before = fake.calls.length
    expect(item.targets(OTHER)).toBeUndefined()
    expect(item.current(OTHER)).toBeUndefined()
    await expect(item.say(OTHER, { kind: 'new' }, '你好')).resolves.toEqual({
      kind: 'failed',
      reason: TENANT_CHANGED,
    })
    expect(fake.calls.length).toBe(before)
  })

  it('外壳的租户换了：旧租户的说话答租户换了，新租户的候选按新租户读', async () => {
    const fake = createFakeClient()
    const made = await mounted(fake)
    await listedAs(fake, listed('ses_a', '甲'))
    act(() => made.rerender(OTHER))
    await settle()
    await expect(made.item.say(TENANT, { kind: 'new' }, '你好')).resolves.toEqual({
      kind: 'failed',
      reason: TENANT_CHANGED,
    })
    expect(made.item.targets(OTHER)).toBeUndefined()
    const reread = await fake.next('list-sessions')
    expect(JSON.stringify(reread.body)).toContain('acc_00000000000000000000000002')
    reread.answer(listPage([listed('ses_z', '乙')]))
    await settle()
    expect(made.item.targets(OTHER)).toEqual([{ key: 'ses_z', label: '乙' }])
  })
})

describe('说一句话', () => {
  let minted = 0
  beforeEach(() => {
    minted = 0
    vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(
      () => `00000000-0000-4000-8000-${String((minted += 1)).padStart(12, '0')}` as never,
    )
  })

  /** The say events the state machine took while the words were handed over, the ids minted from the same start. */
  async function sayEvents(hand: () => Promise<unknown>): Promise<Event[]> {
    const seen = vi.spyOn(SessionDriver.prototype, 'dispatch')
    minted = 100
    void hand()
    await settle()
    const events = seen.mock.calls.map(([event]) => event).filter(event => event.kind === 'say')
    seen.mockRestore()
    return events
  }

  type Way = Readonly<{
    companion: (port: CompanionDrawing) => Promise<unknown>
    item: (item: SayItem) => Promise<unknown>
  }>

  /** The same words said once through the companion and once through the item, each from a fresh module with the same list. */
  async function bothWays(way: Way): Promise<readonly [Event[], Event[]]> {
    const fake = createFakeClient()
    const made = await mounted(fake)
    await listedAs(fake, listed('ses_a', '甲'))
    const seen: CompanionDrawing[] = []
    made.shell.putRender<CompanionDrawing>('session.companion', given => {
      seen.push(given.props)
      return null
    })
    act(() => made.rerender(TENANT))
    const companion = await sayEvents(() => way.companion(seen.at(-1)!))
    cleanup()
    const other = createFakeClient()
    const { item } = await mounted(other)
    await listedAs(other, listed('ses_a', '甲'))
    return [companion, await sayEvents(() => way.item(item))]
  }

  it('说给新会话：经随身入口与经说话位，状态机收到的事件逐字相同', async () => {
    const [companion, item] = await bothWays({
      companion: port => port.say({ kind: 'new' }, '你好'),
      item: sayItem => sayItem.say(TENANT, { kind: 'new' }, '你好'),
    })
    expect(companion).toHaveLength(1)
    expect(item).toEqual(companion)
  })

  it('说给列表里的会话：经两条路收到的事件逐字相同', async () => {
    const [companion, item] = await bothWays({
      companion: port => port.say({ kind: 'session', session: 'ses_a' }, '在吗'),
      item: sayItem => sayItem.say(TENANT, { kind: 'target', key: 'ses_a' }, '在吗'),
    })
    expect(companion).toHaveLength(1)
    expect(companion[0]).toMatchObject({ to: { kind: 'session', session: 'ses_a' } })
    expect(item).toEqual(companion)
  })

  it('受理了：答受理并带会话的键，说给的会话成为打开着的会话，只发一次', async () => {
    const fake = createFakeClient()
    const { item } = await mounted(fake)
    await listedAs(fake, listed('ses_a', '甲'))
    const answer = item.say(TENANT, { kind: 'target', key: 'ses_a' }, '在吗')
    const send = await fake.next('send-input')
    expect(send.body).toMatchObject({ session: 'ses_a' })
    send.answer({ outcome: 'succeeded', body: {} })
    await expect(answer).resolves.toEqual({ kind: 'sent', key: 'ses_a' })
    expect(item.current(TENANT)).toBe('ses_a')
    expect(sends(fake)).toHaveLength(1)
  })

  it('说给新会话：建成后发这句话，答受理并带新会话的键', async () => {
    const fake = createFakeClient()
    const { item } = await mounted(fake)
    const answer = item.say(TENANT, { kind: 'new' }, '你好')
    ;(await fake.next('create-session')).answer({
      outcome: 'succeeded',
      body: { session: 'ses_n', recovered: false },
    })
    ;(await fake.next('send-input')).answer({ outcome: 'succeeded', body: {} })
    await expect(answer).resolves.toEqual({ kind: 'sent', key: 'ses_n' })
  })

  it('被拒：答没发出与原因', async () => {
    const fake = createFakeClient()
    const { item } = await mounted(fake)
    const answer = item.say(TENANT, { kind: 'target', key: 'ses_a' }, '在吗')
    ;(await fake.next('send-input')).answer({ outcome: 'archived' })
    await expect(answer).resolves.toEqual({
      kind: 'failed',
      reason: '没有发出：这个会话已归档，不能再发消息。',
    })
  })

  it('不知道：答不知道，只落定一次，不重发', async () => {
    const fake = createFakeClient()
    const { item } = await mounted(fake)
    const fates: SayOutcome[] = []
    const answer = item.say(TENANT, { kind: 'target', key: 'ses_a' }, '在吗').then(fate => {
      fates.push(fate)
      return fate
    })
    ;(await fake.next('send-input')).answer({ outcome: 'unknown' })
    ;(await fake.next('query-send-input')).answer({ outcome: 'unknown' })
    await expect(answer).resolves.toEqual({ kind: 'unknown' })
    act(() => item.show(TENANT, 'ses_b'))
    await settle()
    expect(fates).toEqual([{ kind: 'unknown' }])
    expect(sends(fake)).toHaveLength(1)
  })

  it('撤下这一项之后，已经交出去的那一次照它自己的结局落定一次，不取消、不重发', async () => {
    const fake = createFakeClient()
    const made = await mounted(fake)
    const fates: SayOutcome[] = []
    void made.item.say(TENANT, { kind: 'target', key: 'ses_a' }, '在吗').then(fate => {
      fates.push(fate)
    })
    await fake.next('send-input')
    await made.withdraw()
    await settle()
    expect(made.shell.items('say')).toEqual([])
    expect(fates).toEqual([{ kind: 'unknown' }])
    expect(sends(fake)).toHaveLength(1)
    expect(fake.calls.filter(call => call.operation.startsWith('cancel'))).toEqual([])
  })

  it('没有字：答没发出，什么都不发', async () => {
    const fake = createFakeClient()
    const { item } = await mounted(fake)
    const before = fake.calls.length
    await expect(item.say(TENANT, { kind: 'new' }, '  ')).resolves.toEqual({
      kind: 'failed',
      reason: '没有字，没有发出。',
    })
    expect(fake.calls.length).toBe(before)
  })
})

describe('打开那个对象', () => {
  it('打开那个会话，再把对话页切到前面', async () => {
    const fake = createFakeClient()
    const { item, shell } = await mounted(fake)
    await listedAs(fake, listed('ses_a', '甲'))
    act(() => item.show(TENANT, 'ses_a'))
    expect((await fake.next('read-history')).body).toMatchObject({ session: 'ses_a' })
    expect(item.current(TENANT)).toBe('ses_a')
    expect(shell.navigated).toEqual(['conversation'])
  })

  it('租户不是当前的：什么都不做', async () => {
    const fake = createFakeClient()
    const { item, shell } = await mounted(fake)
    act(() => item.show(OTHER, 'ses_a'))
    await settle()
    expect(fake.calls.filter(call => call.operation === 'read-history')).toEqual([])
    expect(shell.navigated).toEqual([])
  })
})
