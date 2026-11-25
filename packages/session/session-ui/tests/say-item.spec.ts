// @vitest-environment happy-dom
import { act, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SayItem, SayOutcome, SayPicture, SayTo } from '@omne-harness/shell-contract'
import { SessionDriver } from '../src/model/session-driver.ts'
import type { PictureIntake, PicturesTaken } from '../src/model/pictures.ts'
import type { Event } from '../src/model/session-machine.ts'
import type { CompanionDrawing } from '../src/parts.ts'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'
import { listed, listPage, page, userEntry } from './fixtures/frames.ts'
import { mountModule, providerOf, TAKEN } from './fixtures/shell.tsx'

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

const PNG: SayPicture = { name: 'a.png', bytes: new Uint8Array([137, 80, 78, 71]) }
const JPG: SayPicture = { name: 'b.jpg', bytes: new Uint8Array([255, 216, 255]) }
const refOf = (key: string) => ({
  kind: 'image' as const,
  ref: { storage: 'local', key, mediaType: 'image/png', bytes: '4', digest: `sha256:${key}` },
})
const ALL_TAKEN: PicturesTaken = { kind: 'taken', attachments: [refOf('k1'), refOf('k2')] }
const ONE_FAILED: PicturesTaken = { kind: 'failed', reason: '「b.jpg」：超过大小上限' }
const NO_PICTURES = '现在发不了图，这句话没有交出去。'
const PICTURES_GONE = '现在收不了图，这句话没有交出去。'
const PICTURES_NOT_TAKEN = '图没有收下，这句话没有交出去。'

/** A stand-in for what media provides: each take waits until the case answers it. */
function intakeStandIn() {
  const calls: { tenant: string; pictures: readonly SayPicture[] }[] = []
  const waiting: ((answer: PicturesTaken) => void)[] = []
  const mode = { throws: false }
  const intake: PictureIntake = {
    take: (tenant, pictures) => {
      if (mode.throws) throw new Error('the intake broke')
      calls.push({ tenant, pictures })
      return new Promise(resolve => waiting.push(resolve))
    },
  }
  const answer = async (taken: PicturesTaken) => {
    await settle()
    waiting.shift()?.(taken)
    await settle()
  }
  return { intake, calls, answer, mode }
}

async function withIntake(fake: FakeClient, present: boolean) {
  const made = await mounted(fake)
  await listedAs(fake, listed('ses_a', '甲'))
  const standIn = intakeStandIn()
  const provider = providerOf(made.root, TAKEN.pictureIntake)
  let leave = (): void => undefined
  const come = async () => {
    leave = provider.attach(standIn.intake)
    await settle()
  }
  if (present) await come()
  return { ...made, ...standIn, fake, come, leave: async () => (leave(), await settle()) }
}

const kindsOf = (body: unknown) => {
  type Tree = { entries: { key: string; value: { value?: string; items?: Tree[] } }[] }
  const { message } = body as { message: Tree }
  const blocks = message.entries.find(each => each.key === 'blocks')?.value.items ?? []
  return blocks.map(block => block.entries.find(each => each.key === 'kind')?.value.value)
}

describe('这一项认不认识图：现读媒体的那个点', () => {
  it('点不在答假；点来了答真并叫一声；点走了答假并再叫一声', async () => {
    const fake = createFakeClient()
    const made = await withIntake(fake, false)
    let told = 0
    made.item.subscribe(() => (told += 1))
    expect(made.item.pictures?.(TENANT)).toBe(false)
    await made.come()
    expect(made.item.pictures?.(TENANT)).toBe(true)
    expect(told).toBe(1)
    await made.leave()
    expect(made.item.pictures?.(TENANT)).toBe(false)
    expect(told).toBe(2)
  })

  it('点在，问的不是这个模块当前的租户或没有租户：答假', async () => {
    const made = await withIntake(createFakeClient(), true)
    expect(made.item.pictures?.(TENANT)).toBe(true)
    expect(made.item.pictures?.(OTHER)).toBe(false)
    expect(made.item.pictures?.(undefined)).toBe(false)
  })
})

describe('带图说一句话：点乘图乘说给谁', () => {
  type Whom = Readonly<{ name: string; to: SayTo; ready: (made: Made) => Promise<void> }>
  type Made = Awaited<ReturnType<typeof withIntake>>
  const OPEN_ONE: Whom = {
    name: '打开着的会话',
    to: { kind: 'target', key: 'ses_a' },
    ready: async made => {
      act(() => made.item.show(TENANT, 'ses_a'))
      ;(await made.fake.next('read-history')).answer({
        outcome: 'succeeded',
        body: page([userEntry('1', '1', '早')], '1'),
      })
      await settle()
    },
  }
  const NEW_ONE: Whom = { name: '新会话', to: { kind: 'new' }, ready: async () => undefined }

  async function start(whom: Whom, present: boolean) {
    const made = await withIntake(createFakeClient(), present)
    await whom.ready(made)
    return made
  }

  /** What the words reached the server as: the send and, for a new session, the create before it. */
  async function delivered(made: Made, whom: Whom) {
    if (whom.to.kind === 'new')
      (await made.fake.next('create-session')).answer({
        outcome: 'succeeded',
        body: { session: 'ses_n', recovered: false },
      })
    const send = await made.fake.next('send-input')
    send.answer({ outcome: 'succeeded', body: {} })
    return send.body
  }

  const sentTo = (whom: Whom) => ({ kind: 'sent', key: whom.to.kind === 'new' ? 'ses_n' : 'ses_a' })
  const outbound = (fake: FakeClient) =>
    fake.calls.filter(
      call => call.operation === 'send-input' || call.operation === 'create-session',
    )

  for (const whom of [OPEN_ONE, NEW_ONE]) {
    describe(`说给${whom.name}`, () => {
      it('点在，没有图：走原来的路，不碰收法，发出的只有字', async () => {
        const made = await start(whom, true)
        const answer = made.item.say(TENANT, whom.to, '你好')
        expect(kindsOf(await delivered(made, whom))).toEqual(['text'])
        await expect(answer).resolves.toEqual(sentTo(whom))
        expect(made.calls).toEqual([])
      })

      it('点在，图全成了：图先成为引用，再随这句话一起发出，只发一次', async () => {
        const made = await start(whom, true)
        const answer = made.item.say(TENANT, whom.to, '看这个', [PNG, JPG])
        await settle()
        expect(outbound(made.fake)).toEqual([])
        expect(made.calls).toEqual([{ tenant: TENANT, pictures: [PNG, JPG] }])
        await made.answer(ALL_TAKEN)
        const body = await delivered(made, whom)
        expect(kindsOf(body)).toEqual(['text', 'image', 'image'])
        expect(JSON.stringify(body)).toContain('"k2"')
        await expect(answer).resolves.toEqual(sentTo(whom))
        expect(sends(made.fake)).toHaveLength(1)
      })

      it('点在，有一张没成：答没发出并带媒体的原因，不建会话、不发半句', async () => {
        const made = await start(whom, true)
        const before = made.item.current(TENANT)
        const answer = made.item.say(TENANT, whom.to, '看这个', [PNG, JPG])
        await made.answer(ONE_FAILED)
        await expect(answer).resolves.toEqual({ kind: 'failed', reason: ONE_FAILED.reason })
        await settle()
        expect(outbound(made.fake)).toEqual([])
        expect(made.item.current(TENANT)).toBe(before)
      })

      it('点不在，没有图：走原来的路', async () => {
        const made = await start(whom, false)
        const answer = made.item.say(TENANT, whom.to, '你好')
        expect(kindsOf(await delivered(made, whom))).toEqual(['text'])
        await expect(answer).resolves.toEqual(sentTo(whom))
      })

      it('点不在，带着图：答没发出，原因是现在发不了图，什么都不发', async () => {
        const made = await start(whom, false)
        await expect(made.item.say(TENANT, whom.to, '看这个', [PNG])).resolves.toEqual({
          kind: 'failed',
          reason: NO_PICTURES,
        })
        await settle()
        expect(outbound(made.fake)).toEqual([])
      })

      it('收图途中点走了：答没发出；收法之后答全成了也不发', async () => {
        const made = await start(whom, true)
        const answer = made.item.say(TENANT, whom.to, '看这个', [PNG])
        await settle()
        await made.leave()
        await expect(answer).resolves.toEqual({ kind: 'failed', reason: PICTURES_GONE })
        await made.answer(ALL_TAKEN)
        expect(outbound(made.fake)).toEqual([])
      })
    })
  }

  it('收图途中点走了，又有一项来了：仍答没发出，不交给新来的那一项', async () => {
    const made = await start(OPEN_ONE, true)
    const answer = made.item.say(TENANT, OPEN_ONE.to, '看这个', [PNG])
    await settle()
    await made.leave()
    await made.come()
    await expect(answer).resolves.toEqual({ kind: 'failed', reason: PICTURES_GONE })
    expect(made.calls).toHaveLength(1)
  })

  it('没有字、只有图：受理，发出的这句话只有图', async () => {
    const made = await start(OPEN_ONE, true)
    const answer = made.item.say(TENANT, OPEN_ONE.to, '', [PNG])
    await made.answer({ kind: 'taken', attachments: [refOf('k1')] })
    expect(kindsOf(await delivered(made, OPEN_ONE))).toEqual(['image'])
    await expect(answer).resolves.toEqual({ kind: 'sent', key: 'ses_a' })
  })

  it('收法答没成却没给原因，或收法抛出：答没发出并带一句说得清的原因', async () => {
    const made = await start(OPEN_ONE, true)
    const silent = made.item.say(TENANT, OPEN_ONE.to, '看这个', [PNG])
    await made.answer({ kind: 'failed', reason: ' ' })
    await expect(silent).resolves.toEqual({ kind: 'failed', reason: PICTURES_NOT_TAKEN })
    made.mode.throws = true
    await expect(made.item.say(TENANT, OPEN_ONE.to, '看这个', [PNG])).resolves.toEqual({
      kind: 'failed',
      reason: PICTURES_NOT_TAKEN,
    })
    expect(outbound(made.fake)).toEqual([])
  })

  it('收图途中租户换了：答租户换了，什么都不发', async () => {
    const made = await start(OPEN_ONE, true)
    const answer = made.item.say(TENANT, OPEN_ONE.to, '看这个', [PNG])
    await settle()
    act(() => made.rerender(OTHER))
    await made.answer(ALL_TAKEN)
    await expect(answer).resolves.toEqual({ kind: 'failed', reason: TENANT_CHANGED })
    expect(sends(made.fake)).toEqual([])
  })

  it('问的不是这个模块当前的租户：答租户换了，不碰收法', async () => {
    const made = await start(OPEN_ONE, true)
    await expect(made.item.say(OTHER, OPEN_ONE.to, '看这个', [PNG])).resolves.toEqual({
      kind: 'failed',
      reason: TENANT_CHANGED,
    })
    expect(made.calls).toEqual([])
  })
})
