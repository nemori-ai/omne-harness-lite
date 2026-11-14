// One case per reachable cell of SPEC.md「全化表」. Case names start with the row id.
import { describe, expect, it } from 'vitest'
import {
  INITIAL,
  reconnectDelay,
  step,
  type Event,
  type Open,
  type State,
} from '../src/model/session-machine.ts'
import { stepList, UNREAD, type SessionList } from '../src/model/session-list.ts'
import { INITIAL_WORKSPACE, stepWorkspace, type Workspace } from '../src/model/workspace.ts'
import {
  assistantEntry,
  listed,
  listPage,
  page,
  snapshotTree,
  deltaTree,
  stateFrame,
  userEntry,
} from './fixtures/frames.ts'

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

function open(): Open {
  const created = run(
    INITIAL,
    { kind: 'create', createCallId: 'c1' },
    {
      kind: 'create-answered',
      createCallId: 'c1',
      answer: { outcome: 'succeeded', body: { session: S, recovered: false } },
    },
  ).state
  if (created.kind !== 'open') throw new Error('not open')
  return created
}

function asOpen(state: State): Open {
  if (state.kind !== 'open') throw new Error(`expected open, got ${state.kind}`)
  return state
}

function running(runId = 'run_1'): Open {
  return asOpen(
    step(open(), { kind: 'frame', session: S, generation: 1, frame: stateFrame(runId, '5') }).state,
  )
}

function cancelling(): Open {
  return asOpen(step(running(), { kind: 'cancel', controlId: 'k1' }).state)
}

const send: Event = {
  kind: 'send',
  text: '你好',
  acceptId: 'a1',
  inputId: 'i1',
  messageId: 'msg_x',
}

describe('R1 新建会话', () => {
  it('R1 还没有会话：转到建会话中，发 create-session', () => {
    const next = step(INITIAL, { kind: 'create', createCallId: 'c1' })
    expect(next.state).toMatchObject({ kind: 'creating', createCallId: 'c1', confirm: 'no' })
    expect(next.effects).toEqual([{ kind: 'create-session', createCallId: 'c1' }])
  })
  it('R1 建会话中：不变，不发第二次', () => {
    const creating = step(INITIAL, { kind: 'create', createCallId: 'c1' }).state
    expect(step(creating, { kind: 'create', createCallId: 'c2' })).toEqual({
      state: creating,
      effects: [],
    })
  })
  it('R1 会话就绪、进行中、取消中：收掉当前观察，转到建会话中', () => {
    for (const state of [open(), running(), cancelling()]) {
      const next = step(state, { kind: 'create', createCallId: 'c2' })
      expect(next.state.kind).toBe('creating')
      expect(next.effects).toEqual([
        { kind: 'stop-observing', generation: 1 },
        { kind: 'create-session', createCallId: 'c2' },
      ])
    }
  })
  it('R1 会话不可用：转到建会话中', () => {
    const unavailable = step(open(), {
      kind: 'observation-ended',
      session: S,
      generation: 1,
      end: { kind: 'ended', reason: 'denied' },
    }).state
    expect(step(unavailable, { kind: 'create', createCallId: 'c3' }).state.kind).toBe('creating')
  })
})

describe('R2–R5 建会话的答复', () => {
  it('R2 成功：会话就绪，开观察并读历史', () => {
    const next = run(
      INITIAL,
      { kind: 'create', createCallId: 'c1' },
      {
        kind: 'create-answered',
        createCallId: 'c1',
        answer: { outcome: 'succeeded', body: { session: S, recovered: false } },
      },
    )
    expect(next.state).toMatchObject({
      kind: 'open',
      session: S,
      run: { kind: 'idle' },
      observation: { kind: 'connecting' },
    })
    expect(next.effects.slice(1)).toEqual([
      { kind: 'observe', session: S, generation: 1 },
      { kind: 'read-history', session: S, token: 1, request: { cursor: null } },
    ])
  })
  it('R3 被拒：回到还没有会话，带一句人话', () => {
    for (const outcome of [
      'limited',
      'invalid',
      'conflict',
      'denied',
      'protocol-rejected',
      'basis-unavailable',
    ] as const) {
      const answer =
        outcome === 'limited'
          ? { outcome, body: { resource: 'pending-inputs' as const, limit: 1 } }
          : outcome === 'invalid' || outcome === 'conflict'
            ? { outcome, body: {} }
            : { outcome }
      const next = run(
        INITIAL,
        { kind: 'create', createCallId: 'c1' },
        { kind: 'create-answered', createCallId: 'c1', answer },
      )
      expect(next.state).toMatchObject({ kind: 'none', notice: { kind: 'refused' } })
    }
  })
  it('R4 本地 unavailable：回到还没有会话，说明没有发出去', () => {
    const next = run(
      INITIAL,
      { kind: 'create', createCallId: 'c1' },
      { kind: 'create-answered', createCallId: 'c1', answer: { outcome: 'unavailable' } },
    )
    expect(next.state).toMatchObject({ kind: 'none', notice: { kind: 'unavailable' } })
  })
  it('R5 unknown 或 uncertain：不重发，用同一个调用编号认回', () => {
    for (const outcome of ['unknown', 'uncertain'] as const) {
      const next = run(
        INITIAL,
        { kind: 'create', createCallId: 'c1' },
        { kind: 'create-answered', createCallId: 'c1', answer: { outcome } },
      )
      expect(next.state).toMatchObject({
        kind: 'creating',
        confirm: 'asking',
        notice: { kind: 'unknown', text: '建会话的结果未知，正在确认。' },
      })
      expect(next.effects.at(-1)).toEqual({ kind: 'query-create-session', createCallId: 'c1' })
      expect(
        next.effects.filter(effect => (effect as { kind: string }).kind === 'create-session'),
      ).toHaveLength(1)
    }
  })
  it('R2 作废：别的调用编号或别的状态里到的答复不改状态', () => {
    const creating = step(INITIAL, { kind: 'create', createCallId: 'c1' }).state
    const stale: Event = {
      kind: 'create-answered',
      createCallId: 'c0',
      answer: { outcome: 'succeeded', body: { session: S, recovered: false } },
    }
    expect(step(creating, stale).state).toBe(creating)
    expect(step(INITIAL, stale).state).toBe(INITIAL)
  })
})

describe('R6–R8 认回建会话', () => {
  const asking = run(
    INITIAL,
    { kind: 'create', createCallId: 'c1' },
    { kind: 'create-answered', createCallId: 'c1', answer: { outcome: 'uncertain' } },
  ).state
  it('R6 认回成功：会话就绪', () => {
    const next = step(asking, {
      kind: 'create-confirmed',
      createCallId: 'c1',
      answer: { outcome: 'succeeded', body: { session: S } },
    })
    expect(next.state).toMatchObject({ kind: 'open', session: S })
  })
  it('R7 认回仍不知道：停在未知，可以再确认', () => {
    for (const outcome of [
      'unknown',
      'uncertain',
      'unavailable',
      'denied',
      'basis-unavailable',
    ] as const) {
      const next = step(asking, {
        kind: 'create-confirmed',
        createCallId: 'c1',
        answer: { outcome },
      })
      expect(next.state).toMatchObject({
        kind: 'creating',
        confirm: 'unknown',
        notice: { kind: 'unknown' },
      })
      expect(next.effects).toEqual([])
    }
  })
  it('R8 再确认：只在未知时发 query-create-session', () => {
    const unknown = step(asking, {
      kind: 'create-confirmed',
      createCallId: 'c1',
      answer: { outcome: 'unknown' },
    }).state
    expect(step(unknown, { kind: 'create-confirm' }).effects).toEqual([
      { kind: 'query-create-session', createCallId: 'c1' },
    ])
    expect(step(asking, { kind: 'create-confirm' }).effects).toEqual([])
  })
})

describe('R9–R15 发消息与认回', () => {
  it('R9 就绪、进行中、取消中：加一条发送中的输入，发 send-input', () => {
    for (const state of [open(), running(), cancelling()]) {
      const next = step(state, send)
      expect(asOpen(next.state).inputs).toMatchObject([{ acceptId: 'a1', status: 'sending' }])
      expect(next.effects).toEqual([
        {
          kind: 'send-input',
          session: S,
          acceptId: 'a1',
          inputId: 'i1',
          text: '你好',
        },
      ])
    }
  })
  it('R9 没有会话、建会话中：不可达（没有输入框），不变', () => {
    const creating = step(INITIAL, { kind: 'create', createCallId: 'c1' }).state
    for (const state of [INITIAL, creating])
      expect(step(state, send)).toEqual({ state, effects: [] })
  })
  it('R9 空白的消息：不变', () => {
    const state = open()
    expect(step(state, { ...send, text: '  \n' }).state).toBe(state)
  })
  it('R10 成功：已受理', () => {
    const next = run(open(), send, {
      kind: 'send-answered',
      session: S,
      acceptId: 'a1',
      answer: { outcome: 'succeeded', body: { recovered: false } },
    })
    expect(asOpen(next.state).inputs[0]).toMatchObject({ status: 'accepted', notice: null })
  })
  it('R11 unknown 或 uncertain：不重发，用同一个受理编号认回，显示未知', () => {
    for (const outcome of ['unknown', 'uncertain'] as const) {
      const next = run(open(), send, {
        kind: 'send-answered',
        session: S,
        acceptId: 'a1',
        answer: { outcome },
      })
      expect(asOpen(next.state).inputs[0]).toMatchObject({
        status: 'confirming',
        notice: { kind: 'unknown', text: '发送的结果未知，正在确认。' },
      })
      expect(next.effects).toEqual([
        expect.objectContaining({ kind: 'send-input' }),
        { kind: 'query-send-input', session: S, acceptId: 'a1' },
      ])
    }
  })
  it('R12 本地 unavailable：没有发出去', () => {
    const next = run(open(), send, {
      kind: 'send-answered',
      session: S,
      acceptId: 'a1',
      answer: { outcome: 'unavailable' },
    })
    expect(asOpen(next.state).inputs[0]).toMatchObject({
      status: 'refused',
      notice: { kind: 'unavailable' },
    })
  })
  it('R13 被拒：每种拒绝一句人话', () => {
    for (const outcome of [
      'invalid',
      'archived',
      'frozen',
      'conflict',
      'denied',
      'protocol-rejected',
      'basis-unavailable',
    ] as const) {
      const answer =
        outcome === 'denied' || outcome === 'protocol-rejected' || outcome === 'basis-unavailable'
          ? { outcome }
          : { outcome, body: {} }
      const next = run(open(), send, { kind: 'send-answered', session: S, acceptId: 'a1', answer })
      const input = asOpen(next.state).inputs[0]
      expect(input?.status).toBe('refused')
      expect(input?.notice?.text).toMatch(/^没有发出：.+。$/)
    }
  })
  it('R14 认回：succeeded 已受理，not-committed 确认没受理，其余仍未知', () => {
    const confirming = run(open(), send, {
      kind: 'send-answered',
      session: S,
      acceptId: 'a1',
      answer: { outcome: 'uncertain' },
    }).state
    const answer = (outcome: string) =>
      step(confirming, {
        kind: 'send-confirmed',
        session: S,
        acceptId: 'a1',
        answer: { outcome } as never,
      })
    expect(asOpen(answer('succeeded').state).inputs[0]?.status).toBe('accepted')
    expect(asOpen(answer('not-committed').state).inputs[0]?.status).toBe('not-committed')
    for (const outcome of ['unknown', 'uncertain', 'unavailable', 'basis-unavailable', 'denied'])
      expect(asOpen(answer(outcome).state).inputs[0]?.status).toBe('unknown')
  })
  it('R15 再确认：只在未知时，用同一个受理编号', () => {
    const confirming = run(open(), send, {
      kind: 'send-answered',
      session: S,
      acceptId: 'a1',
      answer: { outcome: 'uncertain' },
    }).state
    const unknown = step(confirming, {
      kind: 'send-confirmed',
      session: S,
      acceptId: 'a1',
      answer: { outcome: 'unknown' },
    }).state
    expect(step(unknown, { kind: 'send-confirm', acceptId: 'a1' }).effects).toEqual([
      { kind: 'query-send-input', session: S, acceptId: 'a1' },
    ])
    expect(step(confirming, { kind: 'send-confirm', acceptId: 'a1' }).effects).toEqual([])
  })
})

describe('R16–R19 取消这一轮', () => {
  it('R16 就绪：没有一轮，不变', () => {
    const state = open()
    expect(step(state, { kind: 'cancel', controlId: 'k1' }).state).toBe(state)
  })
  it('R16 进行中：转到取消中，带状态帧给的编号发 cancel-run', () => {
    const next = step(running(), { kind: 'cancel', controlId: 'k1' })
    expect(asOpen(next.state).run).toEqual({
      kind: 'cancelling',
      run: 'run_1',
      controlId: 'k1',
      unknown: false,
    })
    expect(next.effects).toEqual([
      { kind: 'cancel-run', session: S, run: 'run_1', controlId: 'k1' },
    ])
  })
  it('R16 取消中：不发第二次', () => {
    const state = cancelling()
    expect(step(state, { kind: 'cancel', controlId: 'k2' }).effects).toEqual([])
  })
  it('R16 取消结果未知：再点一次用同一个控制编号', () => {
    const unknown = step(cancelling(), {
      kind: 'cancel-answered',
      session: S,
      controlId: 'k1',
      answer: { outcome: 'uncertain' },
    }).state
    expect(step(unknown, { kind: 'cancel', controlId: 'k9' }).effects).toEqual([
      { kind: 'cancel-run', session: S, run: 'run_1', controlId: 'k1' },
    ])
  })
  it('R17 成功：requested 仍在取消中，ended 回到就绪', () => {
    const requested = step(cancelling(), {
      kind: 'cancel-answered',
      session: S,
      controlId: 'k1',
      answer: { outcome: 'succeeded', body: { kind: 'requested', controlId: 'k1', run: 'run_1' } },
    })
    expect(asOpen(requested.state).run.kind).toBe('cancelling')
    const ended = step(cancelling(), {
      kind: 'cancel-answered',
      session: S,
      controlId: 'k1',
      answer: {
        outcome: 'succeeded',
        body: {
          kind: 'ended',
          controlId: 'k1',
          run: 'run_1',
          terminal: {
            outcome: 'cancelled',
            source: { owner: 'o', record: 'r', revision: '1', digest: 'd' },
          },
        },
      },
    })
    expect(asOpen(ended.state).run).toEqual({ kind: 'idle' })
  })
  it('R18 unknown 或 uncertain：取消中且标为未知', () => {
    for (const outcome of ['unknown', 'uncertain'] as const) {
      const next = step(cancelling(), {
        kind: 'cancel-answered',
        session: S,
        controlId: 'k1',
        answer: { outcome },
      })
      expect(asOpen(next.state).run).toMatchObject({ kind: 'cancelling', unknown: true })
      expect(asOpen(next.state).notice?.kind).toBe('unknown')
    }
  })
  it('R19 被拒或没发出：回到进行中，带一句人话', () => {
    for (const answer of [
      { outcome: 'unavailable' },
      { outcome: 'not-found', body: {} },
      { outcome: 'conflict', body: {} },
      { outcome: 'denied' },
    ] as const) {
      const next = step(cancelling(), {
        kind: 'cancel-answered',
        session: S,
        controlId: 'k1',
        answer,
      })
      expect(asOpen(next.state).run).toEqual({ kind: 'running', run: 'run_1' })
      expect(asOpen(next.state).notice).not.toBeNull()
    }
  })
})

describe('R20–R22 观察的帧', () => {
  it('R20 state 帧带 run：就绪转进行中，观察转在连', () => {
    const next = step(open(), {
      kind: 'frame',
      session: S,
      generation: 1,
      frame: stateFrame('run_1', '5'),
    })
    expect(asOpen(next.state).run).toEqual({ kind: 'running', run: 'run_1' })
    expect(asOpen(next.state).observation).toEqual({ kind: 'live', generation: 1 })
  })
  it('R20 state 帧 run 为空：进行中、取消中都回到就绪', () => {
    for (const state of [running(), cancelling()]) {
      const next = step(state, {
        kind: 'frame',
        session: S,
        generation: 1,
        frame: stateFrame(null, '6'),
      })
      expect(asOpen(next.state).run).toEqual({ kind: 'idle' })
    }
  })
  it('R20 取消中收到同一轮的 state 帧：仍在取消中', () => {
    const next = step(cancelling(), {
      kind: 'frame',
      session: S,
      generation: 1,
      frame: stateFrame('run_1', '6'),
    })
    expect(asOpen(next.state).run.kind).toBe('cancelling')
  })
  it('R20 revision 超过读到的位置：读历史；读的时候再变大，读完再读一次', () => {
    const loaded = step(open(), {
      kind: 'history-read',
      session: S,
      token: 1,
      answer: { outcome: 'succeeded', body: page([], '3') },
    }).state
    const reading = step(loaded, {
      kind: 'frame',
      session: S,
      generation: 1,
      frame: stateFrame('run_1', '5'),
    })
    expect(reading.effects).toEqual([
      { kind: 'read-history', session: S, token: 2, request: { cursor: null } },
    ])
    const again = step(reading.state, {
      kind: 'frame',
      session: S,
      generation: 1,
      frame: stateFrame('run_1', '7'),
    })
    expect(again.effects).toEqual([])
    const done = step(again.state, {
      kind: 'history-read',
      session: S,
      token: 2,
      answer: { outcome: 'succeeded', body: page([], '5') },
    })
    expect(done.effects).toEqual([
      { kind: 'read-history', session: S, token: 3, request: { cursor: null } },
    ])
  })
  it('R20 历史新不新只看这一轮读取的 upper：读到了就不再读，不看扫描位置', () => {
    // The page's scan position (the fixture's 900) is on another axis and decides nothing.
    const read = step(open(), {
      kind: 'history-read',
      session: S,
      token: 1,
      answer: { outcome: 'succeeded', body: page([], '5') },
    }).state
    expect(asOpen(read).content.readThrough).toBe('5')
    for (const revision of ['4', '5'])
      expect(
        step(read, {
          kind: 'frame',
          session: S,
          generation: 1,
          frame: stateFrame('run_1', revision),
        }).effects,
      ).toEqual([])
    expect(
      step(read, { kind: 'frame', session: S, generation: 1, frame: stateFrame('run_1', '6') })
        .effects,
    ).toEqual([{ kind: 'read-history', session: S, token: 2, request: { cursor: null } }])
  })
  it('R21 snapshot 与 delta：进行中的回复按块更新', () => {
    const live = run(
      running(),
      {
        kind: 'frame',
        session: S,
        generation: 1,
        frame: {
          kind: 'snapshot',
          projection: 'model-output-v1',
          value: snapshotTree('1', '1', [['0', '你']]),
        },
      },
      {
        kind: 'frame',
        session: S,
        generation: 1,
        frame: {
          kind: 'delta',
          projection: 'model-output-v1',
          value: deltaTree({ cursor: '1', revision: '1' }, '2', '2', [['0', '你好']]),
        },
      },
    ).state
    expect(asOpen(live).content.live?.blocks).toEqual([
      { kind: 'growing', index: '0', mode: 'append', content: 'text', value: '你好' },
    ])
  })
  it('R21 delta 的基线对不上：不应用，换一代重新观察', () => {
    const next = step(running(), {
      kind: 'frame',
      session: S,
      generation: 1,
      frame: {
        kind: 'delta',
        projection: 'model-output-v1',
        value: deltaTree({ cursor: '9', revision: '9' }, '10', '10', [['0', 'x']]),
      },
    })
    expect(asOpen(next.state).content.live).toBeNull()
    expect(asOpen(next.state).observation).toEqual({ kind: 'connecting', generation: 2 })
    expect(next.effects).toEqual([
      { kind: 'stop-observing', generation: 1 },
      { kind: 'observe', session: S, generation: 2 },
    ])
  })
  const refreshingFrame: Event = {
    kind: 'frame',
    session: S,
    generation: 1,
    frame: { kind: 'refreshing' },
  }
  it('R22 refreshing：这一轮进行中标成「在等内容」；没有进行中的一轮时不标', () => {
    expect(asOpen(step(running(), refreshingFrame).state).content.liveStatus).toEqual({
      kind: 'refreshing',
    })
    // The observation sends it on every idle interval too: it says nothing about a reply then.
    const idle = step(open(), refreshingFrame).state
    expect(asOpen(idle).content.liveStatus).toBeNull()
  })
  it('R22 这一轮结束、没有进行中的回复：「在等内容」的标记收掉', () => {
    const waiting = step(running(), refreshingFrame).state
    const ended = step(waiting, {
      kind: 'frame',
      session: S,
      generation: 1,
      frame: stateFrame(null, '6'),
    }).state
    expect(asOpen(ended).run).toEqual({ kind: 'idle' })
    expect(asOpen(ended).content.liveStatus).toBeNull()
  })
  it('R22 gap：标在进行中的回复上，跟着来的 refreshing 不改它，下一个快照清掉', () => {
    const gap = step(running(), {
      kind: 'frame',
      session: S,
      generation: 1,
      frame: { kind: 'gap', reason: 'buffer' },
    }).state
    expect(asOpen(gap).content.liveStatus).toEqual({ kind: 'gap', reason: 'buffer' })
    const refreshing = step(gap, refreshingFrame).state
    expect(asOpen(refreshing).content.liveStatus).toEqual({ kind: 'gap', reason: 'buffer' })
    const fresh = step(refreshing, {
      kind: 'frame',
      session: S,
      generation: 1,
      frame: { kind: 'snapshot', projection: 'model-output-v1', value: snapshotTree('1', '1', []) },
    }).state
    expect(asOpen(fresh).content.liveStatus).toBeNull()
  })
  it('R20 作废：旧一代或别的会话的帧不改状态', () => {
    const state = running()
    expect(
      step(state, { kind: 'frame', session: S, generation: 0, frame: stateFrame(null, '9') }).state,
    ).toBe(state)
    expect(
      step(state, { kind: 'frame', session: 'other', generation: 1, frame: stateFrame(null, '9') })
        .state,
    ).toBe(state)
  })
})

describe('R23–R26 观察结束与重连', () => {
  it('R23 denied（结束原因或拒绝）：会话不可用', () => {
    for (const end of [
      { kind: 'ended', reason: 'denied' },
      { kind: 'refused', outcome: 'denied' },
    ] as const) {
      const next = step(running(), { kind: 'observation-ended', session: S, generation: 1, end })
      expect(next.state).toMatchObject({ kind: 'unavailable', notice: { kind: 'refused' } })
    }
  })
  it('R24 aborted：是自己收的，不变', () => {
    const state = running()
    expect(
      step(state, {
        kind: 'observation-ended',
        session: S,
        generation: 1,
        end: { kind: 'aborted' },
      }).state,
    ).toBe(state)
  })
  it('R25 refresh-exhausted、unavailable、uncertain、其他拒绝：观察断开在重连，按退避', () => {
    const ends = [
      { kind: 'ended', reason: 'refresh-exhausted' },
      { kind: 'ended', reason: 'unavailable' },
      { kind: 'unavailable' },
      { kind: 'uncertain' },
      { kind: 'refused', outcome: 'basis-unavailable' },
    ] as const
    for (const end of ends) {
      const next = step(running(), { kind: 'observation-ended', session: S, generation: 1, end })
      expect(asOpen(next.state).observation).toEqual({
        kind: 'reconnecting',
        generation: 2,
        attempt: 1,
      })
      expect(asOpen(next.state).run.kind).toBe('running')
      expect(next.effects).toEqual([
        { kind: 'stop-observing', generation: 1 },
        { kind: 'reconnect-later', session: S, generation: 2, delayMs: 1000 },
      ])
    }
  })
  it('R25 重连中再失败：退避加倍，有上界', () => {
    const first = step(running(), {
      kind: 'observation-ended',
      session: S,
      generation: 1,
      end: { kind: 'uncertain' },
    }).state
    const second = step(first, {
      kind: 'observation-ended',
      session: S,
      generation: 2,
      end: { kind: 'uncertain' },
    })
    expect(asOpen(second.state).observation).toEqual({
      kind: 'reconnecting',
      generation: 3,
      attempt: 2,
    })
    expect(second.effects.at(-1)).toMatchObject({ delayMs: 2000 })
    expect(reconnectDelay(10)).toBe(15_000)
  })
  it('R26 到点：同一代重新开观察；第一帧到了转在连', () => {
    const waiting = step(running(), {
      kind: 'observation-ended',
      session: S,
      generation: 1,
      end: { kind: 'uncertain' },
    }).state
    const due = step(waiting, { kind: 'reconnect-due', session: S, generation: 2 })
    expect(due.effects).toEqual([{ kind: 'observe', session: S, generation: 2 }])
    const back = step(due.state, {
      kind: 'frame',
      session: S,
      generation: 2,
      frame: stateFrame('run_1', '5'),
    })
    expect(asOpen(back.state).observation).toEqual({ kind: 'live', generation: 2 })
  })
  it('R26 作废：旧一代的到点不开观察', () => {
    const waiting = step(running(), {
      kind: 'observation-ended',
      session: S,
      generation: 1,
      end: { kind: 'uncertain' },
    }).state
    expect(step(waiting, { kind: 'reconnect-due', session: S, generation: 1 }).effects).toEqual([])
  })
})

describe('R27–R29 读历史', () => {
  it('R27 一页没读到已知条目且没读完：接着读下一页', () => {
    const next = step(open(), {
      kind: 'history-read',
      session: S,
      token: 1,
      answer: {
        outcome: 'succeeded',
        body: page([userEntry('1', '1', 'hi', 'msg_x')], '1', 'cur-2'),
      },
    })
    expect(next.effects).toEqual([
      { kind: 'read-history', session: S, token: 1, request: { cursor: 'cur-2' } },
    ])
    // The traversal is not finished: history is not yet read through its pinned revision.
    expect(asOpen(next.state).content.readThrough).toBeNull()
  })
  it('R27 读完：条目合并；已提交的输入不再挂着', () => {
    const sent = step(open(), send).state
    const next = step(sent, {
      kind: 'history-read',
      session: S,
      token: 1,
      answer: { outcome: 'succeeded', body: page([userEntry('1', '1', '你好', 'msg_x')], '1') },
    })
    const state = asOpen(next.state)
    expect(state.content.entries.map(entry => entry.entryId)).toEqual(['1'])
    expect(state.inputs).toEqual([])
    expect(state.history.reading).toBeNull()
  })
  it('R27 助手消息提交之后：用历史里的那一条替换进行中的那一条', () => {
    const live = run(running(), {
      kind: 'frame',
      session: S,
      generation: 1,
      frame: {
        kind: 'snapshot',
        projection: 'model-output-v1',
        value: snapshotTree('1', '1', [['0', '你好']]),
      },
    }).state
    expect(asOpen(live).content.live).not.toBeNull()
    const committed = run(
      live,
      {
        kind: 'history-read',
        session: S,
        token: 1,
        answer: { outcome: 'succeeded', body: page([], '5') },
      },
      { kind: 'frame', session: S, generation: 1, frame: stateFrame('run_1', '6') },
      {
        kind: 'history-read',
        session: S,
        token: 2,
        answer: { outcome: 'succeeded', body: page([assistantEntry('2', '6', '你好！')], '6') },
      },
    ).state
    expect(asOpen(committed).content.live).toBeNull()
    expect(asOpen(committed).content.entries.map(entry => entry.kind)).toEqual([
      'message.assistant',
    ])
  })
  it('R28 denied：会话不可用', () => {
    const next = step(open(), {
      kind: 'history-read',
      session: S,
      token: 1,
      answer: { outcome: 'denied' },
    })
    expect(next.state).toMatchObject({ kind: 'unavailable' })
  })
  it('R29 其他失败：记下读不到，不结束会话', () => {
    for (const answer of [
      { outcome: 'unavailable' },
      { outcome: 'uncertain' },
      { outcome: 'basis-unavailable' },
      { outcome: 'invalid', body: {} },
    ] as const) {
      const next = step(open(), { kind: 'history-read', session: S, token: 1, answer })
      expect(asOpen(next.state).history).toMatchObject({
        reading: null,
        failure: { kind: expect.any(String) },
      })
    }
  })
  it('R27 作废：别的读取编号的答复不改状态', () => {
    const state = open()
    expect(
      step(state, { kind: 'history-read', session: S, token: 9, answer: { outcome: 'denied' } })
        .state,
    ).toBe(state)
  })
})

describe('不可达与作废的格', () => {
  const events: Event[] = [
    { kind: 'frame', session: S, generation: 1, frame: stateFrame('r', '1') },
    { kind: 'observation-ended', session: S, generation: 1, end: { kind: 'uncertain' } },
    { kind: 'reconnect-due', session: S, generation: 1 },
    { kind: 'history-read', session: S, token: 1, answer: { outcome: 'denied' } },
    { kind: 'cancel', controlId: 'k' },
    { kind: 'cancel-answered', session: S, controlId: 'k', answer: { outcome: 'uncertain' } },
    { kind: 'send-answered', session: S, acceptId: 'a', answer: { outcome: 'uncertain' } },
    { kind: 'send-confirm', acceptId: 'a' },
  ]
  it('还没有会话、建会话中、会话不可用：会话的事件都不改状态', () => {
    const creating = step(INITIAL, { kind: 'create', createCallId: 'c1' }).state
    const unavailable = step(open(), {
      kind: 'observation-ended',
      session: S,
      generation: 1,
      end: { kind: 'ended', reason: 'denied' },
    }).state
    for (const state of [INITIAL, creating, unavailable])
      for (const event of events) expect(step(state, event)).toEqual({ state, effects: [] })
  })
})

describe('R30 打开会话', () => {
  const OTHER = 'ses_2'
  const pick: Event = { kind: 'open-session', session: OTHER }
  const opening = [
    { kind: 'observe', session: OTHER, generation: 1 },
    { kind: 'read-history', session: OTHER, token: 1, request: { cursor: null } },
  ]
  it('R30 还没有会话：和建会话成功走同一条路，开观察，从末尾读历史', () => {
    const next = step(INITIAL, pick)
    expect(next.state).toMatchObject({
      kind: 'open',
      session: OTHER,
      run: { kind: 'idle' },
      observation: { kind: 'connecting', generation: 1 },
      inputs: [],
    })
    expect(next.effects).toEqual(opening)
    const created = run(
      INITIAL,
      { kind: 'create', createCallId: 'c1' },
      {
        kind: 'create-answered',
        createCallId: 'c1',
        answer: { outcome: 'succeeded', body: { session: OTHER, recovered: false } },
      },
    ).state
    expect(next.state).toEqual(created)
  })
  it('R30 建会话的调用在途：不变', () => {
    const sent = step(INITIAL, { kind: 'create', createCallId: 'c1' }).state
    const asking = step(sent, {
      kind: 'create-answered',
      createCallId: 'c1',
      answer: { outcome: 'uncertain' },
    }).state
    for (const state of [sent, asking]) expect(step(state, pick)).toEqual({ state, effects: [] })
  })
  it('R30 建会话仍未知：打开点的那个，之后到的认回作废', () => {
    const unknown = run(
      INITIAL,
      { kind: 'create', createCallId: 'c1' },
      { kind: 'create-answered', createCallId: 'c1', answer: { outcome: 'uncertain' } },
      { kind: 'create-confirmed', createCallId: 'c1', answer: { outcome: 'unknown' } },
    ).state
    const next = step(unknown, pick)
    expect(next.state).toMatchObject({ kind: 'open', session: OTHER })
    expect(next.effects).toEqual(opening)
    expect(step(next.state, { kind: 'create-confirm' }).state).toBe(next.state)
  })
  it('R30 就绪、进行中、取消中点别的会话：停掉原会话的观察，新会话从头开始', () => {
    for (const state of [open(), running(), cancelling()]) {
      const next = step(step(state, send).state, pick)
      expect(next.effects).toEqual([{ kind: 'stop-observing', generation: 1 }, ...opening])
      expect(next.state).toMatchObject({ kind: 'open', session: OTHER, inputs: [] })
      expect(asOpen(next.state).content.entries).toEqual([])
      // The old session's answers carry its id and are dropped, as after R1.
      const late = step(next.state, {
        kind: 'send-answered',
        session: S,
        acceptId: 'a1',
        answer: { outcome: 'succeeded', body: { recovered: false } },
      })
      expect(late.state).toBe(next.state)
    }
  })
  it('R30 点的是已经打开的会话：不变', () => {
    const state = running()
    expect(step(state, { kind: 'open-session', session: S })).toEqual({ state, effects: [] })
  })
  it('R30 会话不可用：打开点的那个，同一个会话也重开', () => {
    const unavailable = step(open(), {
      kind: 'observation-ended',
      session: S,
      generation: 1,
      end: { kind: 'ended', reason: 'denied' },
    }).state
    const again = step(unavailable, { kind: 'open-session', session: S })
    expect(again.state).toMatchObject({ kind: 'open', session: S })
    expect(again.effects).toEqual([
      { kind: 'observe', session: S, generation: 1 },
      { kind: 'read-history', session: S, token: 1, request: { cursor: null } },
    ])
  })
})

function list(...events: Parameters<typeof stepList>[1][]): {
  list: SessionList
  effects: unknown[]
} {
  let current = UNREAD
  const effects: unknown[] = []
  for (const event of events) {
    const next = stepList(current, event)
    current = next.list
    effects.push(...next.effects)
  }
  return { list: current, effects }
}

describe('L1–L5 会话列表', () => {
  const A = listed('ses_a', '第一个')
  const B = listed('ses_b', '第二个')
  const C = listed('ses_c', '第三个')
  it('L1 未读：读第一页，cursor 为空，不传 limit 与 includeArchived', () => {
    const next = stepList(UNREAD, { kind: 'list-load' })
    expect(next.list).toMatchObject({ kind: 'reading', cursor: null, shown: null })
    expect(next.effects).toEqual([{ kind: 'list-sessions', token: 1, cursor: null }])
  })
  it('L3 读首页答 succeeded：用这一页替换', () => {
    const first = list(
      { kind: 'list-load' },
      { kind: 'list-read', token: 1, answer: listPage([A, B]) },
    )
    const again = list(
      { kind: 'list-load' },
      { kind: 'list-read', token: 1, answer: listPage([A, B]) },
      { kind: 'list-load' },
      { kind: 'list-read', token: 2, answer: listPage([C]) },
    )
    expect(first.list).toMatchObject({ kind: 'read', page: { sessions: [A, B] } })
    expect(again.list).toMatchObject({ kind: 'read', page: { sessions: [C] } })
  })
  it('L1 读首页时再读：换一个编号重发，旧答复作废', () => {
    const next = list(
      { kind: 'list-load' },
      { kind: 'list-load' },
      { kind: 'list-read', token: 1, answer: listPage([A]) },
    )
    expect(next.effects).toEqual([
      { kind: 'list-sessions', token: 1, cursor: null },
      { kind: 'list-sessions', token: 2, cursor: null },
    ])
    expect(next.list).toMatchObject({ kind: 'reading', cursor: null })
    const done = stepList(next.list, { kind: 'list-read', token: 2, answer: listPage([B]) })
    expect(done.list).toMatchObject({ kind: 'read', page: { sessions: [B] } })
  })
  it('L1 已读时再读：读首页，照样显示已读到的', () => {
    const read = list(
      { kind: 'list-load' },
      { kind: 'list-read', token: 1, answer: listPage([A]) },
    ).list
    const next = stepList(read, { kind: 'list-load' })
    expect(next.list).toMatchObject({ kind: 'reading', cursor: null, shown: { sessions: [A] } })
  })
  it('L2 已读且 next 不为空：读下一页；L3 接在后面，不重复', () => {
    const read = list(
      { kind: 'list-load' },
      { kind: 'list-read', token: 1, answer: listPage([A, B], 'cur-2') },
    ).list
    const more = stepList(read, { kind: 'list-more' })
    expect(more.effects).toEqual([{ kind: 'list-sessions', token: 2, cursor: 'cur-2' }])
    expect(more.list).toMatchObject({
      kind: 'reading',
      cursor: 'cur-2',
      shown: { sessions: [A, B] },
    })
    const done = stepList(more.list, {
      kind: 'list-read',
      token: 2,
      answer: listPage([B, C], null),
    })
    expect(done.list).toEqual({
      kind: 'read',
      issued: 2,
      page: { sessions: [A, B, C], next: null, completeness: 'complete' },
    })
  })
  it('L3 读过的页有一页 partial：列表就是 partial', () => {
    const next = list(
      { kind: 'list-load' },
      { kind: 'list-read', token: 1, answer: listPage([A], 'cur-2', 'partial') },
      { kind: 'list-more' },
      { kind: 'list-read', token: 2, answer: listPage([B], null, 'complete') },
    )
    expect(next.list).toMatchObject({ kind: 'read', page: { completeness: 'partial' } })
  })
  it('L2 next 为空、读着、未读、读失败：不可达，不变', () => {
    const read = list({ kind: 'list-load' }, { kind: 'list-read', token: 1, answer: listPage([A]) })
    const reading = list({ kind: 'list-load' })
    const failed = list(
      { kind: 'list-load' },
      { kind: 'list-read', token: 1, answer: { outcome: 'basis-unavailable' } },
    )
    for (const state of [UNREAD, read.list, reading.list, failed.list])
      expect(stepList(state, { kind: 'list-more' })).toEqual({ list: state, effects: [] })
  })
  it('L1 读下页时再读首页：下页的答复作废', () => {
    const next = list(
      { kind: 'list-load' },
      { kind: 'list-read', token: 1, answer: listPage([A], 'cur-2') },
      { kind: 'list-more' },
      { kind: 'list-load' },
      { kind: 'list-read', token: 2, answer: listPage([C]) },
    )
    expect(next.list).toMatchObject({ kind: 'reading', cursor: null, shown: { sessions: [A] } })
  })
  it('L4 denied：读失败，不给重试，不再显示列表项', () => {
    const next = list(
      { kind: 'list-load' },
      { kind: 'list-read', token: 1, answer: listPage([A]) },
      { kind: 'list-load' },
      { kind: 'list-read', token: 2, answer: { outcome: 'denied' } },
    )
    expect(next.list).toMatchObject({
      kind: 'failed',
      retry: false,
      shown: null,
      notice: { kind: 'refused', text: '没有权限，或登录已失效。' },
    })
  })
  it('L5 其他失败：读失败，给重试，照样显示已读到的；重试读第一页', () => {
    for (const answer of [
      { outcome: 'basis-unavailable' },
      { outcome: 'unavailable' },
      { outcome: 'uncertain' },
      { outcome: 'invalid', body: {} },
      { outcome: 'protocol-rejected' },
    ] as const) {
      const next = list(
        { kind: 'list-load' },
        { kind: 'list-read', token: 1, answer: listPage([A], 'cur-2') },
        { kind: 'list-more' },
        { kind: 'list-read', token: 2, answer },
      )
      expect(next.list).toMatchObject({
        kind: 'failed',
        retry: true,
        shown: { sessions: [A] },
        notice: { text: '会话列表暂时读不到。' },
      })
      expect(stepList(next.list, { kind: 'list-load' }).effects).toEqual([
        { kind: 'list-sessions', token: 3, cursor: null },
      ])
    }
  })
  it('L3–L5 作废：未读、已读、读失败里到的答复，以及编号对不上的答复', () => {
    const read = list({ kind: 'list-load' }, { kind: 'list-read', token: 1, answer: listPage([A]) })
    const reading = list({ kind: 'list-load' })
    for (const [state, token] of [
      [UNREAD, 1],
      [read.list, 1],
      [reading.list, 9],
    ] as const)
      expect(stepList(state, { kind: 'list-read', token, answer: listPage([B]) })).toEqual({
        list: state,
        effects: [],
      })
  })
})

describe('活动之后重读列表；列表与会话互不干扰', () => {
  function workspace(state: State): Workspace {
    return { session: state, list: { kind: 'read', issued: 1, page: listPage([]).body } }
  }
  const reload = { kind: 'list-sessions', token: 2, cursor: null }
  it('挂上：读第一页', () => {
    expect(stepWorkspace(INITIAL_WORKSPACE, { kind: 'list-load' }).effects).toEqual([
      { kind: 'list-sessions', token: 1, cursor: null },
    ])
  })
  it('活动 建会话成功（R2、R6）：重读第一页', () => {
    const creating = workspace(step(INITIAL, { kind: 'create', createCallId: 'c1' }).state)
    const created = stepWorkspace(creating, {
      kind: 'create-answered',
      createCallId: 'c1',
      answer: { outcome: 'succeeded', body: { session: S, recovered: false } },
    })
    expect(created.effects).toContainEqual(reload)
    const asking = workspace(
      run(
        INITIAL,
        { kind: 'create', createCallId: 'c1' },
        { kind: 'create-answered', createCallId: 'c1', answer: { outcome: 'uncertain' } },
      ).state,
    )
    const confirmed = stepWorkspace(asking, {
      kind: 'create-confirmed',
      createCallId: 'c1',
      answer: { outcome: 'succeeded', body: { session: S } },
    })
    expect(confirmed.effects).toContainEqual(reload)
  })
  it('活动 建会话仍未知时点一项（R30）：重读第一页，由列表说明建没建成', () => {
    const unknown = workspace(
      run(
        INITIAL,
        { kind: 'create', createCallId: 'c1' },
        { kind: 'create-answered', createCallId: 'c1', answer: { outcome: 'uncertain' } },
        { kind: 'create-confirmed', createCallId: 'c1', answer: { outcome: 'unknown' } },
      ).state,
    )
    expect(
      stepWorkspace(unknown, { kind: 'open-session', session: 'ses_2' }).effects,
    ).toContainEqual(reload)
  })
  it('活动 输入受理（R10、R14）：重读第一页', () => {
    const sending = workspace(step(open(), send).state)
    const accepted = stepWorkspace(sending, {
      kind: 'send-answered',
      session: S,
      acceptId: 'a1',
      answer: { outcome: 'succeeded', body: { recovered: false } },
    })
    expect(accepted.effects).toEqual([reload])
    const confirming = workspace(
      run(open(), send, {
        kind: 'send-answered',
        session: S,
        acceptId: 'a1',
        answer: { outcome: 'uncertain' },
      }).state,
    )
    const confirmed = stepWorkspace(confirming, {
      kind: 'send-confirmed',
      session: S,
      acceptId: 'a1',
      answer: { outcome: 'succeeded', body: {} },
    })
    expect(confirmed.effects).toEqual([reload])
  })
  it('活动 一轮结束（R20、R17）：重读第一页', () => {
    const ended = stepWorkspace(workspace(running()), {
      kind: 'frame',
      session: S,
      generation: 1,
      frame: stateFrame(null, '5'),
    })
    expect(ended.effects).toContainEqual(reload)
    const cancelled = stepWorkspace(workspace(cancelling()), {
      kind: 'cancel-answered',
      session: S,
      controlId: 'k1',
      answer: {
        outcome: 'succeeded',
        body: {
          kind: 'ended',
          controlId: 'k1',
          run: 'run_1',
          terminal: {
            outcome: 'cancelled',
            source: { owner: 'o', record: 'r', revision: '1', digest: 'd' },
          },
        },
      },
    })
    expect(cancelled.effects).toEqual([reload])
  })
  it('不是活动的转移不重读：一轮开始、作废的答复、换会话、没受理', () => {
    const idle = workspace(open())
    for (const [state, event] of [
      [idle, { kind: 'frame', session: S, generation: 1, frame: stateFrame('run_1', '0') }],
      [
        idle,
        {
          kind: 'create-answered',
          createCallId: 'c0',
          answer: { outcome: 'succeeded', body: { session: S, recovered: false } },
        },
      ],
      [idle, { kind: 'open-session', session: 'ses_2' }],
      [
        workspace(step(open(), send).state),
        { kind: 'send-answered', session: S, acceptId: 'a1', answer: { outcome: 'unavailable' } },
      ],
    ] as const)
      expect(stepWorkspace(state, event).effects).not.toContainEqual(
        expect.objectContaining({ kind: 'list-sessions' }),
      )
  })
  it('列表读失败：已打开的会话一点不变', () => {
    const session = running()
    const reading = stepWorkspace(workspace(session), { kind: 'list-load' }).workspace
    for (const answer of [{ outcome: 'denied' }, { outcome: 'basis-unavailable' }] as const) {
      const next = stepWorkspace(reading, { kind: 'list-read', token: 2, answer })
      expect(next.workspace.session).toBe(session)
      expect(next.workspace.list.kind).toBe('failed')
      expect(next.effects).toEqual([])
    }
  })
  it('打开会话走会话那条轴，列表不变', () => {
    const before = workspace(open())
    const next = stepWorkspace(before, { kind: 'open-session', session: 'ses_2' })
    expect(next.workspace.list).toBe(before.list)
    expect(next.workspace.session).toMatchObject({ kind: 'open', session: 'ses_2' })
    expect(next.effects).toEqual([
      { kind: 'stop-observing', generation: 1 },
      { kind: 'observe', session: 'ses_2', generation: 1 },
      { kind: 'read-history', session: 'ses_2', token: 1, request: { cursor: null } },
    ])
  })
})
