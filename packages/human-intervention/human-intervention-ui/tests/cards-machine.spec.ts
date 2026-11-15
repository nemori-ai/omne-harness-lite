import { describe, expect, it } from 'vitest'
import {
  ALREADY_DECIDED,
  CONFIRMING,
  INITIAL,
  NOT_COMMITTED,
  STILL_UNKNOWN,
  SUBMITTED,
  keyOf,
  step,
  type Event,
  type ReplyAnswer,
  type State,
} from '../src/model/cards-machine.ts'
import { approvalItem, page, questionItem } from './fixtures/cards.ts'

const run = (state: State, ...events: Event[]) =>
  events.reduce<{ state: State; effects: readonly unknown[] }>(
    (acc, event) => step(acc.state, event),
    { state, effects: [] },
  )

const ITEM = questionItem()
const KEY = keyOf(ITEM.card.ref)
const OTHER = approvalItem()
const OTHER_KEY = keyOf(OTHER.card.ref)
const SELECT = { kind: 'selection', optionId: 'main' } as const

function listed(items = [ITEM]): State {
  return run(
    INITIAL,
    { kind: 'read-list' },
    { kind: 'list-answered', token: 1, answer: page(items) },
  ).state
}

function submitted(state = listed(), replyId = 'r-1'): State {
  return step(state, { kind: 'submit', key: KEY, reply: SELECT, replyId }).state
}

const answered = (state: State, answer: ReplyAnswer, replyId = 'r-1') =>
  step(state, { kind: 'reply-answered', key: KEY, replyId, answer })

const submitOf = (state: State, key = KEY) => state.entries.find(entry => entry.key === key)?.submit

function unknownOnce(): State {
  return answered(submitted(), { outcome: 'unknown' }).state
}

function stillUnknown(): State {
  return answered(unknownOnce(), { outcome: 'unknown' }).state
}

describe('读列表', () => {
  it('M1 打开时发第一页：只要待定的卡，不带游标', () => {
    const next = step(INITIAL, { kind: 'read-list' })
    expect(next.effects).toEqual([{ kind: 'list', token: 1, cursor: null }])
    expect(next.state.read).toMatchObject({ kind: 'reading', token: 1 })
  })

  it('M2 正在读时再要读不另发', () => {
    const reading = step(INITIAL, { kind: 'read-list' }).state
    expect(step(reading, { kind: 'read-list' })).toEqual({ state: reading, effects: [] })
  })

  it('M3 读完、读失败之后都可以再读，令牌往后走', () => {
    const again = step(listed(), { kind: 'read-list' })
    expect(again.effects).toEqual([{ kind: 'list', token: 2, cursor: null }])
    const failed = run(
      INITIAL,
      { kind: 'read-list' },
      { kind: 'list-answered', token: 1, answer: { outcome: 'denied' } },
    ).state
    expect(step(failed, { kind: 'read-list' }).effects).toEqual([
      { kind: 'list', token: 2, cursor: null },
    ])
  })

  it('M4 过期令牌的答复不算数', () => {
    const reading = step(listed(), { kind: 'read-list' }).state
    const stale = step(reading, { kind: 'list-answered', token: 1, answer: page([]) })
    expect(stale.state).toBe(reading)
  })

  it('M5 不在读的时候来的答复不算数', () => {
    const state = listed()
    expect(step(state, { kind: 'list-answered', token: 1, answer: page([]) }).state).toBe(state)
  })

  it('M6 读失败：记下原因，读不出来与被拒的语气不同', () => {
    const reading = step(INITIAL, { kind: 'read-list' }).state
    const denied = step(reading, { kind: 'list-answered', token: 1, answer: { outcome: 'denied' } })
    expect(denied.state.read).toEqual({
      kind: 'failed',
      notice: { kind: 'refused', text: '没有权限，或登录已失效。' },
    })
    const lost = step(reading, {
      kind: 'list-answered',
      token: 1,
      answer: { outcome: 'unavailable' },
    })
    expect(lost.state.read).toEqual({
      kind: 'failed',
      notice: { kind: 'unavailable', text: '没有发出去。' },
    })
  })

  it('M7 有下一页就接着取，带上游标；取完才换上列表', () => {
    const reading = step(INITIAL, { kind: 'read-list' }).state
    const first = step(reading, { kind: 'list-answered', token: 1, answer: page([ITEM], 'c-2') })
    expect(first.effects).toEqual([{ kind: 'list', token: 1, cursor: 'c-2' }])
    expect(first.state.entries).toEqual([])
    const last = step(first.state, {
      kind: 'list-answered',
      token: 1,
      answer: page([OTHER], null, 'partial'),
    })
    expect(last.state.entries.map(entry => entry.key)).toEqual([KEY, OTHER_KEY])
    expect(last.state.read).toEqual({ kind: 'read', partial: true })
  })

  it('M8 前一页不全，整份列表算不全', () => {
    const reading = step(INITIAL, { kind: 'read-list' }).state
    const first = step(reading, {
      kind: 'list-answered',
      token: 1,
      answer: page([ITEM], 'c-2', 'partial'),
    }).state
    const last = step(first, { kind: 'list-answered', token: 1, answer: page([]) })
    expect(last.state.read).toEqual({ kind: 'read', partial: true })
  })

  it('M9 重新读：还在列表里的卡留住提交状态；不在了的只留正在提交或结果未知的', () => {
    const refused = answered(submitted(), { outcome: 'denied' }).state
    const withOther = step(listed([ITEM, OTHER]), {
      kind: 'submit',
      key: OTHER_KEY,
      reply: { kind: 'selection', optionId: 'allow' },
      replyId: 'r-2',
    }).state
    const kept = run(
      withOther,
      { kind: 'read-list' },
      { kind: 'list-answered', token: 2, answer: page([ITEM]) },
    ).state
    expect(kept.entries.map(entry => [entry.key, entry.submit.kind])).toEqual([
      [KEY, 'none'],
      [OTHER_KEY, 'submitting'],
    ])
    const again = run(
      refused,
      { kind: 'read-list' },
      { kind: 'list-answered', token: 2, answer: page([ITEM]) },
    ).state
    expect(submitOf(again)?.kind).toBe('refused')
    const gone = run(
      refused,
      { kind: 'read-list' },
      { kind: 'list-answered', token: 2, answer: page([]) },
    ).state
    expect(gone.entries).toEqual([])
  })
})

describe('提交', () => {
  it('S1 提交带上卡的修订号、卡的引用与答复', () => {
    const next = step(listed(), { kind: 'submit', key: KEY, reply: SELECT, replyId: 'r-1' })
    const sent = { card: ITEM.card.ref, expectedRevision: '3', reply: SELECT, replyId: 'r-1' }
    expect(next.effects).toEqual([{ kind: 'submit', key: KEY, sent }])
    expect(submitOf(next.state)).toEqual({ kind: 'submitting', sent })
  })

  it('S2 不认识的卡、正在提交的卡、结果未知的卡都不再提交', () => {
    const state = listed()
    expect(step(state, { kind: 'submit', key: 'x', reply: SELECT, replyId: 'r' }).state).toBe(state)
    const busy = submitted()
    expect(step(busy, { kind: 'submit', key: KEY, reply: SELECT, replyId: 'r-2' }).state).toBe(busy)
    const unknown = stillUnknown()
    expect(step(unknown, { kind: 'submit', key: KEY, reply: SELECT, replyId: 'r-2' }).state).toBe(
      unknown,
    )
  })

  it('S3 被拒之后可以再提交', () => {
    const refused = answered(submitted(), { outcome: 'denied' }).state
    const again = step(refused, { kind: 'submit', key: KEY, reply: SELECT, replyId: 'r-2' })
    expect(again.effects).toHaveLength(1)
  })
})

describe('提交的答复', () => {
  it('R1 决定了：卡去掉，显示「已提交」，重新读列表', () => {
    const next = answered(submitted(), {
      outcome: 'succeeded',
      body: {
        kind: 'decided',
        decisionRef: {
          card: ITEM.card.ref,
          decisionId: 'd-1',
          submission: { tenantRef: 't', actorRef: 'a', operationId: 'o' },
        },
        revision: '4',
        delivery: 'pending',
      },
    })
    expect(next.state.entries).toEqual([])
    expect(next.state.last).toEqual(SUBMITTED)
    expect(next.effects).toEqual([{ kind: 'list', token: 2, cursor: null }])
  })

  it('R2 别人已经决定：卡去掉，照实说，重新读列表', () => {
    const next = answered(submitted(), {
      outcome: 'succeeded',
      body: {
        kind: 'already-decided',
        decision: {
          ref: {
            card: ITEM.card.ref,
            decisionId: 'd-0',
            submission: { tenantRef: 't', actorRef: 'b', operationId: 'o0' },
          },
          reply: { kind: 'decline' },
          basisRef: 'b',
          commitReceipt: 'c',
        },
      },
    })
    expect(next.state.entries).toEqual([])
    expect(next.state.last).toEqual(ALREADY_DECIDED)
    expect(next.effects).toEqual([{ kind: 'list', token: 2, cursor: null }])
  })

  it('R3 已经作废：卡去掉，说出作废的原因；不认识的原因说一句通用的', () => {
    const known = answered(submitted(), {
      outcome: 'succeeded',
      body: { kind: 'invalidated', reason: 'archived' },
    })
    expect(known.state.entries).toEqual([])
    expect(known.state.last).toEqual({ kind: 'done', text: '这张卡已经作废：会话已归档。' })
    expect(known.effects).toEqual([{ kind: 'list', token: 2, cursor: null }])
    const other = answered(submitted(), {
      outcome: 'succeeded',
      body: { kind: 'invalidated', reason: 'something-new' },
    })
    expect(other.state.last).toEqual({ kind: 'done', text: '这张卡已经作废。' })
  })

  it('R4 被拒、不可用：显示原因，不重读', () => {
    const denied = answered(submitted(), { outcome: 'denied' })
    expect(submitOf(denied.state)).toEqual({
      kind: 'refused',
      notice: { kind: 'refused', text: '没有权限，或登录已失效。没有提交。' },
    })
    expect(denied.effects).toEqual([])
    const lost = answered(submitted(), { outcome: 'unavailable' })
    expect(submitOf(lost.state)).toEqual({
      kind: 'refused',
      notice: { kind: 'unavailable', text: '没有发出去。' },
    })
  })

  it('R5 卡在别处变了：显示原因并重读列表', () => {
    const next = answered(submitted(), { outcome: 'conflict', body: {} })
    expect(submitOf(next.state)).toEqual({
      kind: 'refused',
      notice: { kind: 'refused', text: '这张卡在别处变了，没有提交。已重新读取。' },
    })
    expect(next.effects).toEqual([{ kind: 'list', token: 2, cursor: null }])
  })

  it('R6 结果未知：用同一份正文认回', () => {
    const before = submitted()
    const sent = (submitOf(before) as { sent: unknown }).sent
    for (const outcome of ['unknown', 'uncertain'] as const) {
      const next = answered(before, { outcome })
      expect(next.effects).toEqual([{ kind: 'query', key: KEY, sent }])
      expect(submitOf(next.state)).toEqual({
        kind: 'unknown',
        sent,
        confirming: true,
        notice: CONFIRMING,
      })
    }
  })

  it('R7 认回仍然不知道，或认回本身被拒：仍未知，等人再确认，不自动再发', () => {
    for (const answer of [
      { outcome: 'unknown' },
      { outcome: 'uncertain' },
      { outcome: 'denied' },
      { outcome: 'conflict', body: {} },
    ] as ReplyAnswer[]) {
      const next = answered(unknownOnce(), answer)
      expect(next.effects).toEqual([])
      expect(submitOf(next.state)).toMatchObject({
        kind: 'unknown',
        confirming: false,
        notice: STILL_UNKNOWN,
      })
    }
  })

  it('R8 认回说原来那次没有提交上：可以再提交', () => {
    const next = answered(unknownOnce(), { outcome: 'not-committed', body: {} })
    expect(submitOf(next.state)).toEqual({ kind: 'refused', notice: NOT_COMMITTED })
  })

  it('R9 认回得出确定的结果：卡去掉，照实说', () => {
    const next = answered(unknownOnce(), {
      outcome: 'succeeded',
      body: { kind: 'invalidated', reason: 'cancelled' },
    })
    expect(next.state.entries).toEqual([])
    expect(next.state.last?.text).toBe('这张卡已经作废：那一轮被取消了。')
  })

  it('R10 不认识的卡、不在途的提交、别的答复标识：答复不算数', () => {
    const state = submitted()
    expect(
      step(state, {
        kind: 'reply-answered',
        key: 'x',
        replyId: 'r-1',
        answer: { outcome: 'denied' },
      }).state,
    ).toBe(state)
    expect(answered(state, { outcome: 'denied' }, 'r-other').state).toBe(state)
    const idle = listed()
    expect(answered(idle, { outcome: 'denied' }).state).toBe(idle)
    const waiting = stillUnknown()
    expect(answered(waiting, { outcome: 'denied' }).state).toBe(waiting)
  })
})

describe('再确认', () => {
  it('C1 仍未知时可以再确认一次：同一份正文认回', () => {
    const state = stillUnknown()
    const sent = (submitOf(state) as { sent: unknown }).sent
    const next = step(state, { kind: 'confirm', key: KEY })
    expect(next.effects).toEqual([{ kind: 'query', key: KEY, sent }])
    expect(submitOf(next.state)).toMatchObject({ confirming: true, notice: CONFIRMING })
  })

  it('C2 正在确认、不是未知、不认识的卡：不再确认', () => {
    const confirming = unknownOnce()
    expect(step(confirming, { kind: 'confirm', key: KEY }).state).toBe(confirming)
    const idle = listed()
    expect(step(idle, { kind: 'confirm', key: KEY }).state).toBe(idle)
    const state = stillUnknown()
    expect(step(state, { kind: 'confirm', key: 'x' }).state).toBe(state)
  })
})
