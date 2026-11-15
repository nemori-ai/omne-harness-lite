import { describe, expect, it } from 'vitest'
import { INITIAL, step, type Event, type Open, type State } from '../src/model/session-machine.ts'
import {
  causeSentence,
  NO_WAITING,
  readWaiting,
  retry,
  retryAnswered,
  waitingRead,
  type RetryAnswer,
  type Waiting,
  type WaitingAnswer,
} from '../src/model/waiting.ts'
import { page, plainEntry, stateFrame, userEntry } from './fixtures/frames.ts'

const S = 'ses_1'

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

function asOpen(state: State): Open {
  if (state.kind !== 'open') throw new Error(`expected open, got ${state.kind}`)
  return state
}

function open(): Open {
  return asOpen(
    run(
      INITIAL,
      { kind: 'create', createCallId: 'c1' },
      {
        kind: 'create-answered',
        createCallId: 'c1',
        answer: { outcome: 'succeeded', body: { session: S, recovered: false } },
      },
    ).state,
  )
}

const failed = (entryId: string, runId = 'run_1') =>
  plainEntry(entryId, entryId, 'run.terminal', { terminal: { run: runId, outcome: 'failed' } })
const completed = (entryId: string) =>
  plainEntry(entryId, entryId, 'run.terminal', { terminal: { run: 'run_0', outcome: 'completed' } })

function historyRead(state: Open, entries: ReturnType<typeof failed>[], upper: string): Event {
  return {
    kind: 'history-read',
    session: S,
    token: state.history.reading ?? -1,
    answer: { outcome: 'succeeded', body: page(entries, upper) },
  }
}

const readsWaiting = (effects: unknown[]) =>
  effects.filter(effect => (effect as { kind: string }).kind === 'read-waiting')

const waitingAnswer = (pending: number): WaitingAnswer => ({
  outcome: 'succeeded',
  body: { waiting: { run: 'run_1', pending, cause: null } },
})

const NO_CAUSE = waitingAnswer(0)

describe('什么时候读等人', () => {
  it('读历史读到一条新的失败终结：读一次', () => {
    const next = run(open(), historyRead(open(), [failed('1')], '1'))
    expect(readsWaiting(next.effects)).toEqual([{ kind: 'read-waiting', session: S, token: 1 }])
  })

  it('失败终结已经在手里、或终结不是失败：不读', () => {
    const first = run(open(), historyRead(open(), [failed('1')], '1'))
    const again = asOpen(
      step(first.state, {
        kind: 'frame',
        session: S,
        generation: 1,
        frame: stateFrame('run_2', '2'),
      }).state,
    )
    const reread = step(again, historyRead(again, [failed('1')], '2'))
    expect(readsWaiting([...reread.effects])).toEqual([])
    expect(readsWaiting(run(open(), historyRead(open(), [completed('1')], '1')).effects)).toEqual(
      [],
    )
  })

  it('状态帧说没有进行中的一轮、最近的终结是失败：读；最近的终结是完成：不读', () => {
    const read = asOpen(
      run(open(), historyRead(open(), [failed('1')], '1'), {
        kind: 'waiting-read',
        session: S,
        token: 1,
        answer: NO_CAUSE,
      }).state,
    )
    const frame: Event = { kind: 'frame', session: S, generation: 1, frame: stateFrame(null, '1') }
    expect(readsWaiting([...step(read, frame).effects])).toHaveLength(1)
    const done = asOpen(run(open(), historyRead(open(), [completed('1')], '1')).state)
    expect(readsWaiting([...step(done, frame).effects])).toEqual([])
  })

  it('发送有了答复：在等人时读，没在等人时不读', () => {
    const base = asOpen(
      run(open(), historyRead(open(), [failed('1')], '1'), {
        kind: 'waiting-read',
        session: S,
        token: 1,
        answer: waitingAnswer(1),
      }).state,
    )
    const sent = run(
      base,
      { kind: 'send', text: '再来', acceptId: 'a1', inputId: 'i1', messageId: 'm1' },
      { kind: 'send-answered', session: S, acceptId: 'a1', answer: { outcome: 'denied' } },
    )
    expect(readsWaiting(sent.effects)).toHaveLength(1)
    const quiet = run(
      open(),
      { kind: 'send', text: '再来', acceptId: 'a1', inputId: 'i1', messageId: 'm1' },
      {
        kind: 'send-answered',
        session: S,
        acceptId: 'a1',
        answer: { outcome: 'succeeded', body: { recovered: false } },
      },
    )
    expect(readsWaiting(quiet.effects)).toEqual([])
  })

  it('读着的时候又要读：记下，答复回来后再读一次', () => {
    const first = readWaiting(NO_WAITING, S)
    const second = readWaiting(first.waiting, S)
    expect(second.effects).toEqual([])
    const answered = waitingRead(second.waiting, S, 1, NO_CAUSE)
    expect(answered.effects).toEqual([{ kind: 'read-waiting', session: S, token: 2 }])
  })

  it('换了会话以后到的答复不算', () => {
    const next = step(open(), {
      kind: 'waiting-read',
      session: 'ses_other',
      token: 1,
      answer: NO_CAUSE,
    })
    expect(asOpen(next.state).waiting).toEqual(NO_WAITING)
  })
})

describe('读等人的答复', () => {
  const reading = readWaiting(NO_WAITING, S).waiting

  it('没有在等人', () => {
    const next = waitingRead(reading, S, 1, { outcome: 'succeeded', body: { waiting: null } })
    expect(next.waiting.fact).toEqual({ kind: 'not-waiting' })
  })

  it('在等人：一轮、条数、成因原样放进模型', () => {
    const cause = { kind: 'no-reply', detail: 'http-400' }
    const next = waitingRead(reading, S, 1, {
      outcome: 'succeeded',
      body: { waiting: { run: 'run_9', pending: 3, cause } },
    })
    expect(next.waiting.fact).toEqual({ kind: 'waiting', run: 'run_9', pending: 3, cause })
  })

  it.each([
    { outcome: 'basis-unavailable' },
    { outcome: 'stage-not-provided' },
    { outcome: 'unavailable' },
    { outcome: 'denied' },
  ] as WaitingAnswer[])('$outcome：退回只显示失败', answer => {
    expect(waitingRead(reading, S, 1, answer).waiting.fact).toEqual({ kind: 'unread' })
  })

  it('不是在读的那一次：不变', () => {
    expect(waitingRead(reading, S, 7, NO_CAUSE).waiting).toBe(reading)
  })
})

function waitingWith(pending: number): Waiting {
  return waitingRead(readWaiting(NO_WAITING, S).waiting, S, 1, waitingAnswer(pending)).waiting
}

describe('重试', () => {
  it('在等人且条数不为零：点名那一轮发 retry-run', () => {
    expect(retry(waitingWith(2), S, 'k1').effects).toEqual([
      { kind: 'retry-run', session: S, run: 'run_1', controlId: 'k1' },
    ])
  })

  it('条数为零、没在等人、已经在发：不发', () => {
    expect(retry(waitingWith(0), S, 'k1').effects).toEqual([])
    expect(retry(NO_WAITING, S, 'k1').effects).toEqual([])
    const sending = retry(waitingWith(2), S, 'k1').waiting
    expect(retry(sending, S, 'k2').effects).toEqual([])
  })

  const sending = retry(waitingWith(2), S, 'k1').waiting
  const answer = (value: RetryAnswer) => retryAnswered(sending, S, 'k1', value)

  it.each([
    { outcome: 'succeeded', body: { recovered: false } },
    { outcome: 'conflict', body: {} },
    { outcome: 'not-found', body: {} },
  ] as RetryAnswer[])('$outcome：重新读等人', value => {
    const next = answer(value)
    expect(next.waiting.retry).toEqual({ kind: 'idle', notice: null })
    expect(next.effects).toEqual([{ kind: 'read-waiting', session: S, token: 2 }])
  })

  it('没有变化：显示发新消息的那句提示', () => {
    expect(answer({ outcome: 'no-change', body: {} }).waiting.retry).toEqual({ kind: 'no-change' })
  })

  it.each([{ outcome: 'unknown' }, { outcome: 'uncertain' }] as RetryAnswer[])(
    '$outcome：如实显示，再问一次用同一个编号',
    value => {
      const unknown = answer(value).waiting
      expect(unknown.retry).toEqual({ kind: 'unknown', run: 'run_1', controlId: 'k1' })
      expect(retry(unknown, S, 'k9').effects).toEqual([
        { kind: 'retry-run', session: S, run: 'run_1', controlId: 'k1' },
      ])
    },
  )

  it('连不上：没有发出去，可以再按', () => {
    const next = answer({ outcome: 'unavailable' }).waiting
    expect(next.retry).toEqual({
      kind: 'idle',
      notice: { kind: 'unavailable', text: '连不上服务，重试没有发出去。' },
    })
    expect(retry(next, S, 'k2').effects).toHaveLength(1)
  })

  it('被拒绝：写明原因', () => {
    expect(answer({ outcome: 'archived', body: {} }).waiting.retry).toEqual({
      kind: 'idle',
      notice: { kind: 'refused', text: '没有重试：这个会话已归档，不能再发消息。' },
    })
  })

  it('别的编号的答复不算；重试不知道时读到的等人不清掉它', () => {
    expect(retryAnswered(sending, S, 'k2', { outcome: 'no-change', body: {} }).waiting).toBe(
      sending,
    )
    const unknown = answer({ outcome: 'unknown' }).waiting
    const reread = readWaiting(unknown, S).waiting
    expect(waitingRead(reread, S, 2, NO_CAUSE).waiting.retry).toEqual(unknown.retry)
  })
})

describe('成因的一句话', () => {
  it('表里有的照表；带诊断的接在后面', () => {
    expect(causeSentence({ kind: 'cannot-fit', detail: null })).toBe(
      '对话太长，压缩之后也装不进模型的上下文。',
    )
    expect(causeSentence({ kind: 'no-reply', detail: 'http-400' })).toBe(
      '模型没有给出有效的回复。诊断：http-400',
    )
  })

  it('表里没有的：通用的一句加诊断；没有成因：只说失败了', () => {
    expect(causeSentence({ kind: 'brand-new', detail: 'x-1' })).toBe(
      '这一轮失败了，原因是「brand-new」。诊断：x-1',
    )
    expect(causeSentence(null)).toBe('这一轮失败了。')
  })
})

it('用户输入的条目不会被当成终结', () => {
  const next = run(open(), historyRead(open(), [userEntry('1', '1', '你好', 'm') as never], '1'))
  expect(readsWaiting(next.effects)).toEqual([])
})
