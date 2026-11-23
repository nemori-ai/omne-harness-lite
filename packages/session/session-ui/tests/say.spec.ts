import { describe, expect, it } from 'vitest'
import { BUSY, NO_WORDS, sayFate, type Said } from '../src/model/say.ts'
import { SessionDriver } from '../src/model/session-driver.ts'
import {
  INITIAL,
  step,
  type Event,
  type Open,
  type SayTo,
  type State,
  type Words,
} from '../src/model/session-machine.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { page, userEntry } from './fixtures/frames.ts'

const S = 'ses_1'
const T = 'ses_2'
const TENANT = { organization: 'org_0', account: 'acc_0' } as never

const WORDS: Words = { text: '你好', acceptId: 'a1', inputId: 'i1', messageId: 'msg_x' }
const NEW: SayTo = { kind: 'new', createCallId: 'c9' }
const TO_S: SayTo = { kind: 'session', session: S }
const say = (to: SayTo, words: Words = WORDS): Event => ({ kind: 'say', to, words })

function run(state: State, ...events: Event[]): { state: State; effects: unknown[] } {
  let current = state
  const effects: unknown[] = []
  for (const event of events) {
    const next = step(current, event)
    current = next.state
    effects.push(...next.effects)
  }
  return { state: current, effects }
}

const asOpen = (state: State): Open => {
  if (state.kind !== 'open') throw new Error(`expected open, got ${state.kind}`)
  return state
}
const created = (session: string, createCallId = 'c1'): Event => ({
  kind: 'create-answered',
  createCallId,
  answer: { outcome: 'succeeded', body: { session, recovered: false } },
})
const opened = (session: string): Open =>
  asOpen(run(INITIAL, { kind: 'create', createCallId: 'c1' }, created(session)).state)
const creating = (): State => step(INITIAL, { kind: 'create', createCallId: 'c1' }).state
const creatingUnknown = (): State =>
  run(
    creating(),
    { kind: 'create-answered', createCallId: 'c1', answer: { outcome: 'unknown' } },
    { kind: 'create-confirmed', createCallId: 'c1', answer: { outcome: 'unknown' } },
  ).state
const unavailable = (): State =>
  step(opened(S), {
    kind: 'observation-ended',
    session: S,
    generation: 1,
    end: { kind: 'ended', reason: 'denied' },
  }).state

const SEND = { kind: 'send-input', acceptId: 'a1', inputId: 'i1', text: '你好', attachments: [] }
const CREATE = { kind: 'create-session', createCallId: 'c9' }
const OPEN = (session: string) => [
  { kind: 'observe', session, generation: 1 },
  { kind: 'read-history', session, token: 1, request: { cursor: null } },
]
const LEAVE = { kind: 'stop-observing', generation: 1 }

describe('说一句话：全化表', () => {
  describe('说给新会话', () => {
    it('还没有：建会话，带着这句话', () => {
      const next = step(INITIAL, say(NEW))
      expect(next.state).toEqual({
        kind: 'creating',
        createCallId: 'c9',
        confirm: 'no',
        notice: null,
        first: WORDS,
      })
      expect(next.effects).toEqual([CREATE])
    })

    it('建会话中，在途：不受理', () => {
      const state = creating()
      expect(step(state, say(NEW))).toEqual({ state, effects: [] })
    })

    it('建会话中，结果仍未知：不受理', () => {
      const state = creatingUnknown()
      expect(state).toMatchObject({ kind: 'creating', confirm: 'unknown' })
      expect(step(state, say(NEW))).toEqual({ state, effects: [] })
    })

    it('已打开一个会话：离开它，建会话，带着这句话', () => {
      const next = step(opened(S), say(NEW))
      expect(next.state).toMatchObject({ kind: 'creating', createCallId: 'c9', first: WORDS })
      expect(next.effects).toEqual([LEAVE, CREATE])
    })

    it('不可用：建会话，带着这句话', () => {
      const next = step(unavailable(), say(NEW))
      expect(next.state).toMatchObject({ kind: 'creating', createCallId: 'c9', first: WORDS })
      expect(next.effects).toEqual([CREATE])
    })
  })

  describe('说给会话 S', () => {
    it('还没有：打开 S，这句话已经在发', () => {
      const next = step(INITIAL, say(TO_S))
      expect(asOpen(next.state).session).toBe(S)
      expect(asOpen(next.state).inputs).toMatchObject([
        { acceptId: 'a1', inputId: 'i1', messageId: 'msg_x', text: '你好', status: 'sending' },
      ])
      expect(next.effects).toEqual([...OPEN(S), { ...SEND, session: S }])
    })

    it('建会话中，在途：不受理', () => {
      const state = creating()
      expect(step(state, say(TO_S))).toEqual({ state, effects: [] })
    })

    it('建会话中，结果仍未知：打开 S，发这句话', () => {
      const next = step(creatingUnknown(), say(TO_S))
      expect(asOpen(next.state).session).toBe(S)
      expect(asOpen(next.state).inputs).toMatchObject([{ acceptId: 'a1', status: 'sending' }])
      expect(next.effects).toEqual([...OPEN(S), { ...SEND, session: S }])
    })

    it('已打开 S：发这句话，和输入框发的相同，不重开', () => {
      const before = opened(S)
      const next = step(before, say(TO_S))
      const viaComposer = step(before, { kind: 'send', ...WORDS })
      expect(next).toEqual(viaComposer)
      expect(next.effects).toEqual([{ ...SEND, session: S }])
    })

    it('已打开别的会话：离开它，打开 S，发这句话', () => {
      const next = step(opened(T), say(TO_S))
      expect(asOpen(next.state).session).toBe(S)
      expect(asOpen(next.state).inputs).toMatchObject([{ acceptId: 'a1', status: 'sending' }])
      expect(next.effects).toEqual([LEAVE, ...OPEN(S), { ...SEND, session: S }])
    })

    it('不可用：打开 S，发这句话', () => {
      const next = step(unavailable(), say(TO_S))
      expect(asOpen(next.state).inputs).toMatchObject([{ acceptId: 'a1', status: 'sending' }])
      expect(next.effects).toEqual([...OPEN(S), { ...SEND, session: S }])
    })
  })

  it('没有字的话在哪一格都不受理', () => {
    const blank = { ...WORDS, text: '  \n' }
    for (const state of [INITIAL, creating(), creatingUnknown(), opened(S), unavailable()])
      for (const to of [NEW, TO_S])
        expect(step(state, say(to, blank))).toEqual({ state, effects: [] })
  })
})

describe('建会话，带着这句话', () => {
  const saying = step(INITIAL, say(NEW)).state

  it('建成了：会话打开时这句话已经在发', () => {
    const next = step(saying, created(S, 'c9'))
    expect(asOpen(next.state).inputs).toMatchObject([{ acceptId: 'a1', status: 'sending' }])
    expect(next.effects).toEqual([...OPEN(S), { ...SEND, session: S }])
  })

  it('答复不知道，认回成了：这句话在发', () => {
    const asked = step(saying, {
      kind: 'create-answered',
      createCallId: 'c9',
      answer: { outcome: 'unknown' },
    })
    expect(asked.state).toMatchObject({ kind: 'creating', confirm: 'asking', first: WORDS })
    const next = step(asked.state, {
      kind: 'create-confirmed',
      createCallId: 'c9',
      answer: { outcome: 'succeeded', body: { session: S } },
    })
    expect(asOpen(next.state).inputs).toMatchObject([{ acceptId: 'a1', status: 'sending' }])
    expect(next.effects).toEqual([...OPEN(S), { ...SEND, session: S }])
  })

  it('没建成：这句话没有发出', () => {
    const next = step(saying, {
      kind: 'create-answered',
      createCallId: 'c9',
      answer: { outcome: 'denied' },
    })
    expect(next.state.kind).toBe('none')
    expect(next.effects).toEqual([])
  })

  it('从列表新建的会话不带话', () => {
    expect(creating()).toMatchObject({ first: null })
    expect(asOpen(step(creating(), created(S)).state).inputs).toEqual([])
  })
})

describe('结局是对状态的一次读', () => {
  const SAID_NEW: Said = { to: NEW, acceptId: 'a1', messageId: 'msg_x' }
  const SAID_S: Said = { to: TO_S, acceptId: 'a1', messageId: 'msg_x' }
  const saidNew = step(INITIAL, say(NEW)).state
  const sending = step(INITIAL, say(TO_S)).state
  const answered = (outcome: string): State =>
    step(sending, {
      kind: 'send-answered',
      session: S,
      acceptId: 'a1',
      answer: { outcome } as never,
    }).state

  it('建会话中，是这句话带的那一次，在途或在认回：未定', () => {
    expect(sayFate(saidNew, SAID_NEW)).toBeNull()
    const asking = step(saidNew, {
      kind: 'create-answered',
      createCallId: 'c9',
      answer: { outcome: 'uncertain' },
    }).state
    expect(sayFate(asking, SAID_NEW)).toBeNull()
  })

  it('建会话中，是那一次，结果仍未知：不知道', () => {
    const still = run(
      saidNew,
      { kind: 'create-answered', createCallId: 'c9', answer: { outcome: 'unknown' } },
      { kind: 'create-confirmed', createCallId: 'c9', answer: { outcome: 'unknown' } },
    ).state
    expect(sayFate(still, SAID_NEW)).toEqual({ kind: 'unknown' })
  })

  it('建会话中，是别的一次：不知道', () => {
    expect(sayFate(creating(), SAID_NEW)).toEqual({ kind: 'unknown' })
    expect(sayFate(creating(), SAID_S)).toEqual({ kind: 'unknown' })
  })

  it('还没有，是说给新会话的：没发出，原因是状态上的那一句', () => {
    const refused = step(saidNew, {
      kind: 'create-answered',
      createCallId: 'c9',
      answer: { outcome: 'denied' },
    }).state
    expect(sayFate(refused, SAID_NEW)).toEqual({
      kind: 'failed',
      reason: '没有建成会话：没有权限，或登录已失效。',
    })
  })

  it('还没有，是说给已有会话的：不知道', () => {
    expect(sayFate(INITIAL, SAID_S)).toEqual({ kind: 'unknown' })
  })

  it('已打开，在待定的输入里，发送中、在认回：未定', () => {
    expect(sayFate(sending, SAID_S)).toBeNull()
    expect(sayFate(answered('unknown'), SAID_S)).toBeNull()
  })

  it('已打开，已受理：受理，带会话的标识', () => {
    expect(sayFate(answered('succeeded'), SAID_S)).toEqual({ kind: 'sent', session: S })
  })

  it('已打开，结果仍未知：不知道', () => {
    const still = step(answered('uncertain'), {
      kind: 'send-confirmed',
      session: S,
      acceptId: 'a1',
      answer: { outcome: 'unknown' } as never,
    }).state
    expect(sayFate(still, SAID_S)).toEqual({ kind: 'unknown' })
  })

  it('已打开，被拒、连不上、已确认没有受理：没发出，原因是这条输入上的那一句', () => {
    expect(sayFate(answered('frozen'), SAID_S)).toEqual({
      kind: 'failed',
      reason: '没有发出：这个会话已冻结，暂时不能发消息。',
    })
    expect(sayFate(answered('unavailable'), SAID_S)).toEqual({
      kind: 'failed',
      reason: '连不上服务，这条消息没有发出去。',
    })
    const notCommitted = step(answered('unknown'), {
      kind: 'send-confirmed',
      session: S,
      acceptId: 'a1',
      answer: { outcome: 'not-committed' } as never,
    }).state
    expect(sayFate(notCommitted, SAID_S)).toEqual({
      kind: 'failed',
      reason: '已确认：这条消息没有被受理。可以重新发送。',
    })
  })

  it('已打开，不在待定的输入里，历史里有这条消息：受理', () => {
    const committed = step(sending, {
      kind: 'history-read',
      session: S,
      token: 1,
      answer: { outcome: 'succeeded', body: page([userEntry('e1', '1', '你好', 'msg_x')], '1') },
    }).state
    expect(asOpen(committed).inputs).toEqual([])
    expect(sayFate(committed, SAID_S)).toEqual({ kind: 'sent', session: S })
  })

  it('已打开，不在待定的输入里，历史里也没有：不知道', () => {
    expect(sayFate(opened(T), SAID_S)).toEqual({ kind: 'unknown' })
  })

  it('不可用：不知道', () => {
    expect(sayFate(unavailable(), SAID_S)).toEqual({ kind: 'unknown' })
  })
})

describe('驱动器的 say', () => {
  const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))
  function started() {
    const fake = createFakeClient()
    let minted = 0
    const driver = new SessionDriver({
      client: fake.client,
      tenant: TENANT,
      newId: () => `id${(minted += 1)}`,
    })
    return { fake, driver }
  }
  const body = (call: { body: unknown }) => call.body as Record<string, unknown>

  it('说给新会话：建会话，建成后发这句话，受理了答受理并带会话', async () => {
    const { fake, driver } = started()
    const answer = driver.say({ kind: 'new' }, '你好')
    const create = await fake.next('create-session')
    create.answer({ outcome: 'succeeded', body: { session: S, recovered: false } })
    const send = await fake.next('send-input')
    expect(body(send)).toMatchObject({ session: S })
    expect(JSON.stringify(body(send)['message'])).toContain('你好')
    send.answer({ outcome: 'succeeded', body: {} })
    await expect(answer).resolves.toEqual({ kind: 'sent', session: S })
    expect(driver.getState().session).toMatchObject({ kind: 'open', session: S })
  })

  it('说给已有的会话：打开它并发这句话；被拒答没发出与原因', async () => {
    const { fake, driver } = started()
    const answer = driver.say({ kind: 'session', session: T }, '在吗')
    const send = await fake.next('send-input')
    expect(body(send)).toMatchObject({ session: T })
    expect(driver.getState().session).toMatchObject({ kind: 'open', session: T })
    send.answer({ outcome: 'archived' })
    await expect(answer).resolves.toEqual({
      kind: 'failed',
      reason: '没有发出：这个会话已归档，不能再发消息。',
    })
  })

  it('答复不知道、认回也不知道：答不知道，不重发', async () => {
    const { fake, driver } = started()
    const answer = driver.say({ kind: 'session', session: S }, '你好')
    ;(await fake.next('send-input')).answer({ outcome: 'unknown' })
    ;(await fake.next('query-send-input')).answer({ outcome: 'unknown' })
    await expect(answer).resolves.toEqual({ kind: 'unknown' })
    expect(fake.calls.filter(call => call.operation === 'send-input')).toHaveLength(1)
  })

  it('没有字：答没发出，什么都不发', async () => {
    const { fake, driver } = started()
    await expect(driver.say({ kind: 'new' }, '   ')).resolves.toEqual({
      kind: 'failed',
      reason: NO_WORDS,
    })
    expect(fake.calls).toEqual([])
  })

  it('正在建另一个会话：答没发出，这句话没有交出去', async () => {
    const { fake, driver } = started()
    driver.createSession()
    await fake.next('create-session')
    await expect(driver.say({ kind: 'session', session: S }, '你好')).resolves.toEqual({
      kind: 'failed',
      reason: BUSY,
    })
    await expect(driver.say({ kind: 'new' }, '你好')).resolves.toEqual({
      kind: 'failed',
      reason: BUSY,
    })
    expect(fake.calls.map(call => call.operation)).toEqual(['create-session'])
  })

  it('交出去之后换了会话：原来那句话答不知道，只落定一次', async () => {
    const { fake, driver } = started()
    let settled = 0
    const answer = driver.say({ kind: 'session', session: S }, '你好').then(fate => {
      settled += 1
      return fate
    })
    const send = await fake.next('send-input')
    driver.openSession(T)
    await expect(answer).resolves.toEqual({ kind: 'unknown' })
    send.answer({ outcome: 'succeeded', body: {} })
    driver.openSession(S)
    await settle()
    expect(settled).toBe(1)
  })

  it('收掉时还没落定的答不知道', async () => {
    const { fake, driver } = started()
    const answer = driver.say({ kind: 'session', session: S }, '你好')
    await fake.next('send-input')
    driver.dispose()
    await expect(answer).resolves.toEqual({ kind: 'unknown' })
  })

  it('已经收掉的驱动器：答没发出，什么都不发', async () => {
    const { fake, driver } = started()
    driver.dispose()
    await expect(driver.say({ kind: 'new' }, '你好')).resolves.toMatchObject({ kind: 'failed' })
    expect(fake.calls).toEqual([])
  })
})
