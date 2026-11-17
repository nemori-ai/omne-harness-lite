import { describe, expect, it } from 'vitest'
import {
  ALREADY_DECIDED,
  CONFIRMING,
  EMPTY_DRAFT,
  INITIAL,
  NOT_COMMITTED,
  STILL_UNKNOWN,
  keyOf,
  replyOf,
  sheetOf,
  step,
  submittable,
  type Draft,
  type Effect,
  type Event,
  type ReplyAnswer,
  type State,
} from '../src/model/cards-machine.ts'
import { approvalItem, page, questionItem } from './fixtures/cards.ts'

const run = (state: State, ...events: Event[]) =>
  events.reduce<{ state: State; effects: readonly Effect[] }>(
    (acc, event) => {
      const next = step(acc.state, event)
      return { state: next.state, effects: [...acc.effects, ...next.effects] }
    },
    { state, effects: [] },
  )

const ITEM = questionItem()
const KEY = keyOf(ITEM.card.ref)
const OTHER = approvalItem()
const OTHER_KEY = keyOf(OTHER.card.ref)
const SELECT = { kind: 'selection', optionId: 'main' } as const
const PICK_MAIN: Draft = { choice: { kind: 'option', optionId: 'main' }, text: '' }
const PICK_ALLOW: Draft = { choice: { kind: 'option', optionId: 'allow' }, text: '' }
const SESSION = 'ses_0123456789abcdef'

function listed(items = [ITEM]): State {
  return run(
    INITIAL,
    { kind: 'read-list' },
    { kind: 'list-answered', token: 1, answer: page(items) },
  ).state
}

function submitted(state = listed(), replyId = 'r-1'): State {
  return run(
    state,
    { kind: 'draft', key: KEY, draft: PICK_MAIN },
    { kind: 'submit-group', group: SESSION, planned: [{ key: KEY, replyId }] },
  ).state
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
    const withOther = run(
      listed([ITEM, OTHER]),
      { kind: 'draft', key: OTHER_KEY, draft: PICK_ALLOW },
      { kind: 'submit-group', group: '', planned: [{ key: OTHER_KEY, replyId: 'r-2' }] },
    ).state
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

const group = (state: State, planned: readonly { key: string; replyId: string }[]) =>
  step(state, { kind: 'submit-group', group: SESSION, planned })

describe('提交', () => {
  it('S1 提交带上卡的修订号、卡的引用与草稿算出的答复', () => {
    const drafted = step(listed(), { kind: 'draft', key: KEY, draft: PICK_MAIN }).state
    const next = group(drafted, [{ key: KEY, replyId: 'r-1' }])
    const sent = { card: ITEM.card.ref, expectedRevision: '3', reply: SELECT, replyId: 'r-1' }
    expect(next.effects).toEqual([{ kind: 'submit', key: KEY, sent }])
    expect(submitOf(next.state)).toEqual({ kind: 'submitting', sent })
  })

  it('S2 正在提交的卡、结果未知的卡都不再提交', () => {
    const busy = submitted()
    expect(group(busy, [{ key: KEY, replyId: 'r-2' }]).state).toBe(busy)
    const unknown = stillUnknown()
    expect(group(unknown, [{ key: KEY, replyId: 'r-2' }]).state).toBe(unknown)
  })

  it('S3 被拒之后草稿还在，可以再提交', () => {
    const refused = answered(submitted(), { outcome: 'denied' }).state
    expect(refused.drafts[KEY]).toEqual(PICK_MAIN)
    const again = group(refused, [{ key: KEY, replyId: 'r-2' }])
    expect(again.effects).toHaveLength(1)
  })
})

describe('提交的答复', () => {
  it('R1 决定了：卡与草稿去掉，不留被关掉的题，重新读列表', () => {
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
    expect(next.state.drafts).toEqual({})
    expect(next.state.closed).toEqual([])
    expect(next.state.batches).toEqual({})
    expect(next.effects).toEqual([{ kind: 'list', token: 2, cursor: null }])
  })

  it('R2 已在别处答了：卡变成被关掉的题，留着草稿与原因，重新读列表', () => {
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
    expect(next.state.drafts).toEqual({})
    expect(next.state.closed).toEqual([
      { key: KEY, item: ITEM, draft: PICK_MAIN, notice: ALREADY_DECIDED },
    ])
    expect(next.effects).toEqual([{ kind: 'list', token: 2, cursor: null }])
  })

  it('R3 提问已经关掉：变成被关掉的题，说出原因；不认识的原因说一句通用的', () => {
    const known = answered(submitted(), {
      outcome: 'succeeded',
      body: { kind: 'invalidated', reason: 'archived' },
    })
    expect(known.state.entries).toEqual([])
    expect(known.state.closed.map(closed => closed.notice)).toEqual([
      { kind: 'done', text: '这次提问已经关掉：会话已归档。' },
    ])
    expect(known.effects).toEqual([{ kind: 'list', token: 2, cursor: null }])
    const other = answered(submitted(), {
      outcome: 'succeeded',
      body: { kind: 'invalidated', reason: 'something-new' },
    })
    expect(other.state.closed[0]?.notice).toEqual({ kind: 'done', text: '这次提问已经关掉。' })
  })

  it('R4 被拒、不可用：显示原因，不重读', () => {
    const denied = answered(submitted(), { outcome: 'denied' })
    expect(submitOf(denied.state)).toEqual({
      kind: 'refused',
      notice: { kind: 'refused', text: '没有权限，或登录已失效。这一题没有记上。' },
    })
    expect(denied.effects).toEqual([])
    const lost = answered(submitted(), { outcome: 'unavailable' })
    expect(submitOf(lost.state)).toEqual({
      kind: 'refused',
      notice: { kind: 'unavailable', text: '没有发出去，这一题没有记上。' },
    })
  })

  it('R5 卡在别处变了：显示原因并重读列表', () => {
    const next = answered(submitted(), { outcome: 'conflict', body: {} })
    expect(submitOf(next.state)).toEqual({
      kind: 'refused',
      notice: { kind: 'refused', text: '这张卡在别处变了，这一题没有记上。已重新读取。' },
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
    expect(next.state.closed[0]?.notice.text).toBe('这次提问已经关掉：那一轮被取消了。')
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
    const confirming = unknownOnce()
    expect(answered(confirming, { outcome: 'denied' }, 'r-other').state).toBe(confirming)
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

const UNAVAILABLE = { kind: 'unavailable' } as const

function watching(): State {
  return run(INITIAL, { kind: 'watch' }, { kind: 'list-answered', token: 1, answer: page([]) })
    .state
}

function retrying(): State {
  return step(watching(), { kind: 'observation-ended', generation: 1, end: UNAVAILABLE }).state
}

function denied(): State {
  return step(watching(), {
    kind: 'observation-ended',
    generation: 1,
    end: { kind: 'ended', reason: 'denied' },
  }).state
}

describe('跟上变化', () => {
  it('L1 watch，现在 off：开始观察，代次加一，读列表并建立观察', () => {
    const next = step(INITIAL, { kind: 'watch' })
    expect(next.state.live).toEqual({ kind: 'on', generation: 1, attempt: 0 })
    expect(next.effects).toEqual([
      { kind: 'list', token: 1, cursor: null },
      { kind: 'observe', generation: 1 },
    ])
  })

  it('L2 watch，现在不是 off：不变', () => {
    for (const state of [watching(), retrying(), denied()])
      expect(step(state, { kind: 'watch' })).toEqual({ state, effects: [] })
  })

  it('L3 unwatch，现在 off：不变', () => {
    expect(step(INITIAL, { kind: 'unwatch' })).toEqual({ state: INITIAL, effects: [] })
  })

  it('L4 unwatch，现在不是 off：变 off，停止观察', () => {
    for (const state of [watching(), retrying(), denied()]) {
      const next = step(state, { kind: 'unwatch' })
      expect(next.state.live).toEqual({ kind: 'off' })
      expect(next.effects).toEqual([{ kind: 'stop-observing' }])
    }
  })

  it('L5 一帧的代次不是当前的，或现在不在观察：不变', () => {
    const stale = watching()
    expect(step(stale, { kind: 'frame', generation: 0 }).state).toBe(stale)
    for (const state of [INITIAL, retrying(), denied()])
      expect(step(state, { kind: 'frame', generation: 1 }).state).toBe(state)
  })

  it('L6 一帧来时正在读列表：记下要再读一遍，不另发', () => {
    const reading = step(INITIAL, { kind: 'watch' }).state
    const next = step(reading, { kind: 'frame', generation: 1 })
    expect(next.state.again).toBe(true)
    expect(next.effects).toEqual([])
  })

  it('L7 一帧来时没在读：读列表', () => {
    const next = step(watching(), { kind: 'frame', generation: 1 })
    expect(next.effects).toEqual([{ kind: 'list', token: 2, cursor: null }])
    expect(next.state.again).toBe(false)
  })

  it('L8 读完最后一页或读失败时要再读：清掉记号，再读一遍', () => {
    const reading = run(INITIAL, { kind: 'watch' }, { kind: 'frame', generation: 1 }).state
    const done = step(reading, { kind: 'list-answered', token: 1, answer: page([ITEM]) })
    expect(done.state.again).toBe(false)
    expect(done.state.entries.map(entry => entry.key)).toEqual([KEY])
    expect(done.effects).toEqual([{ kind: 'list', token: 2, cursor: null }])
    const failed = step(reading, {
      kind: 'list-answered',
      token: 1,
      answer: { outcome: 'basis-unavailable' },
    })
    expect(failed.state.again).toBe(false)
    expect(failed.effects).toEqual([{ kind: 'list', token: 2, cursor: null }])
  })

  it('L9 读的过程中来三帧：读完只再读一遍', () => {
    const reading = run(
      INITIAL,
      { kind: 'watch' },
      { kind: 'frame', generation: 1 },
      { kind: 'frame', generation: 1 },
      { kind: 'frame', generation: 1 },
    ).state
    const first = step(reading, { kind: 'list-answered', token: 1, answer: page([]) })
    expect(first.effects).toEqual([{ kind: 'list', token: 2, cursor: null }])
    const second = step(first.state, { kind: 'list-answered', token: 2, answer: page([]) })
    expect(second.effects).toEqual([])
  })

  it('L10 观察结束的代次不是当前的，或现在 off、denied：不变', () => {
    const state = watching()
    expect(step(state, { kind: 'observation-ended', generation: 2, end: UNAVAILABLE }).state).toBe(
      state,
    )
    for (const other of [INITIAL, denied()])
      expect(
        step(other, { kind: 'observation-ended', generation: 1, end: UNAVAILABLE }).state,
      ).toBe(other)
  })

  it('L11 观察被拒：变 denied，不重连', () => {
    for (const end of [
      { kind: 'ended', reason: 'denied' },
      { kind: 'refused', outcome: 'denied' },
    ] as const) {
      const next = step(watching(), { kind: 'observation-ended', generation: 1, end })
      expect(next.state.live).toEqual({ kind: 'denied' })
      expect(next.effects).toEqual([])
    }
  })

  it('L12 观察是被中止的：不变', () => {
    const state = watching()
    expect(
      step(state, { kind: 'observation-ended', generation: 1, end: { kind: 'aborted' } }).state,
    ).toBe(state)
  })

  it('L13 观察因别的原因结束：变 retrying，次数加一，稍后重连', () => {
    for (const end of [
      UNAVAILABLE,
      { kind: 'uncertain' },
      { kind: 'ended', reason: 'unavailable' },
      { kind: 'refused', outcome: 'limited' },
    ] as const) {
      const next = step(watching(), { kind: 'observation-ended', generation: 1, end })
      expect(next.state.live).toEqual({ kind: 'retrying', generation: 1, attempt: 1 })
      expect(next.effects).toEqual([{ kind: 'reconnect-later', generation: 1, attempt: 1 }])
    }
    const again = step(retrying(), { kind: 'observation-ended', generation: 1, end: UNAVAILABLE })
    expect(again.state.live).toEqual({ kind: 'retrying', generation: 1, attempt: 2 })
    expect(again.effects).toEqual([{ kind: 'reconnect-later', generation: 1, attempt: 2 }])
  })

  it('L14 到点重连，代次相同：变 on，代次加一，次数留着，读列表并建立观察', () => {
    const next = step(retrying(), { kind: 'reconnect-due', generation: 1 })
    expect(next.state.live).toEqual({ kind: 'on', generation: 2, attempt: 1 })
    expect(next.effects).toEqual([
      { kind: 'list', token: 2, cursor: null },
      { kind: 'observe', generation: 2 },
    ])
  })

  it('L17 重连之后一帧都没收到又断了：次数接着加，间隔跟着变长', () => {
    const reconnected = step(retrying(), { kind: 'reconnect-due', generation: 1 }).state
    const next = step(reconnected, { kind: 'observation-ended', generation: 2, end: UNAVAILABLE })
    expect(next.state.live).toEqual({ kind: 'retrying', generation: 2, attempt: 2 })
    expect(next.effects).toEqual([{ kind: 'reconnect-later', generation: 2, attempt: 2 }])
  })

  it('L18 重连之后收到一帧：次数清零，之后再断从第一次算起', () => {
    const reconnected = run(
      retrying(),
      { kind: 'reconnect-due', generation: 1 },
      { kind: 'list-answered', token: 2, answer: page([]) },
    ).state
    const framed = step(reconnected, { kind: 'frame', generation: 2 })
    expect(framed.state.live).toEqual({ kind: 'on', generation: 2, attempt: 0 })
    expect(framed.effects).toEqual([{ kind: 'list', token: 3, cursor: null }])
    const next = step(framed.state, { kind: 'observation-ended', generation: 2, end: UNAVAILABLE })
    expect(next.state.live).toEqual({ kind: 'retrying', generation: 2, attempt: 1 })
  })

  it('L15 到点重连，但不在 retrying 或代次不同：不变', () => {
    const state = retrying()
    expect(step(state, { kind: 'reconnect-due', generation: 0 }).state).toBe(state)
    for (const other of [INITIAL, watching(), denied()])
      expect(step(other, { kind: 'reconnect-due', generation: 1 }).state).toBe(other)
  })

  it('L16 停了再开：代次接着往上走，旧代次的帧不算数', () => {
    const reopened = run(watching(), { kind: 'unwatch' }, { kind: 'watch' }).state
    expect(reopened.live).toEqual({ kind: 'on', generation: 2, attempt: 0 })
    const answered = step(reopened, { kind: 'list-answered', token: 2, answer: page([]) }).state
    expect(step(answered, { kind: 'frame', generation: 1 }).state).toBe(answered)
  })

  it('L17 被关掉的题归在卡来源的会话那一组；没有会话的卡归在空的那一组', () => {
    const closedBy = {
      outcome: 'succeeded',
      body: { kind: 'invalidated', reason: 'archived' },
    } as const
    const mine = answered(submitted(), closedBy).state
    expect(sheetOf(mine, SESSION).closed).toHaveLength(1)
    expect(sheetOf(mine, '').closed).toHaveLength(0)
    const other = run(
      listed([OTHER]),
      { kind: 'draft', key: OTHER_KEY, draft: PICK_ALLOW },
      { kind: 'submit-group', group: '', planned: [{ key: OTHER_KEY, replyId: 'r-2' }] },
      { kind: 'reply-answered', key: OTHER_KEY, replyId: 'r-2', answer: closedBy },
    ).state
    expect(sheetOf(other, '').closed.map(closed => closed.notice.text)).toEqual([
      '这次提问已经关掉：会话已归档。',
    ])
  })

  it('L18 帧只触发重读：不改任何一张卡的提交状态', () => {
    const state = step(submitted(watchingWith([ITEM])), { kind: 'frame', generation: 1 }).state
    expect(submitOf(state)?.kind).toBe('submitting')
  })
})

const A = questionItem('card-a')
const B = questionItem('card-b')
const C = questionItem('card-c')
const [KA, KB, KC] = [A, B, C].map(item => keyOf(item.card.ref)) as [string, string, string]
const TEXT_DRAFT: Draft = { choice: { kind: 'none' }, text: '用 8080' }
const DECLINE_DRAFT: Draft = { choice: { kind: 'decline' }, text: '' }
const DECIDED = {
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
} as const
const ELSEWHERE = {
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
} as const
const CLOSED_ROUND = {
  outcome: 'succeeded',
  body: { kind: 'invalidated', reason: 'cancelled' },
} as const

function drafted(items = [A, B, C]): State {
  return run(
    listed(items),
    { kind: 'draft', key: KA, draft: PICK_MAIN },
    { kind: 'draft', key: KB, draft: TEXT_DRAFT },
    { kind: 'draft', key: KC, draft: DECLINE_DRAFT },
  ).state
}

const PLAN = [
  { key: KA, replyId: 'r-a' },
  { key: KB, replyId: 'r-b' },
  { key: KC, replyId: 'r-c' },
]

const sentKeys = (effects: readonly Effect[]) =>
  effects.flatMap(effect => (effect.kind === 'submit' ? [effect.key] : []))

const reply = (key: string, replyId: string, answer: ReplyAnswer): Event => ({
  kind: 'reply-answered',
  key,
  replyId,
  answer,
})

describe('一组的作答', () => {
  it('G1 草稿算出答复：选项、不回答、写了字；只写了空白算没答', () => {
    expect(replyOf(PICK_MAIN)).toEqual(SELECT)
    expect(replyOf(DECLINE_DRAFT)).toEqual({ kind: 'decline' })
    expect(replyOf(TEXT_DRAFT)).toEqual({ kind: 'text', text: '用 8080' })
    expect(replyOf({ choice: { kind: 'none' }, text: '   ' })).toBeNull()
    expect(replyOf(EMPTY_DRAFT)).toBeNull()
    expect(replyOf(undefined)).toBeNull()
  })

  it('G2 没答齐不能提交：还差哪几题按列表的次序列出', () => {
    const half = step(listed([A, B, C]), { kind: 'draft', key: KB, draft: PICK_MAIN }).state
    const sheet = sheetOf(half, SESSION)
    expect(sheet.ready).toBe(false)
    expect(sheet.missing).toEqual([KA, KC])
    expect(step(half, { kind: 'submit-group', group: SESSION, planned: PLAN }).state).toBe(half)
  })

  it('G3 三题一次交：依次发出，前一题有了结局才发下一题；全记下后这一组什么都不剩', () => {
    const first = step(drafted(), { kind: 'submit-group', group: SESSION, planned: PLAN })
    expect(sentKeys(first.effects)).toEqual([KA])
    expect(sheetOf(first.state, SESSION).running).toBe(true)
    const second = step(first.state, reply(KA, 'r-a', DECIDED))
    expect(sentKeys(second.effects)).toEqual([KB])
    const sentB = second.effects.find(effect => effect.kind === 'submit')
    expect(sentB).toMatchObject({ sent: { reply: { kind: 'text', text: '用 8080' } } })
    const third = step(second.state, reply(KB, 'r-b', DECIDED))
    expect(sentKeys(third.effects)).toEqual([KC])
    expect(third.effects.find(effect => effect.kind === 'submit')).toMatchObject({
      sent: { reply: { kind: 'decline' } },
    })
    const done = step(third.state, reply(KC, 'r-c', DECIDED)).state
    const sheet = sheetOf(done, SESSION)
    expect(sheet.entries).toEqual([])
    expect(sheet.closed).toEqual([])
    expect(sheet.running).toBe(false)
    expect(done.drafts).toEqual({})
  })

  it('G4 一题已在别处答了、一题所在的提问已关掉、一题记下：结局逐题，没记上的留着人填的', () => {
    const done = run(
      drafted(),
      { kind: 'submit-group', group: SESSION, planned: PLAN },
      reply(KA, 'r-a', ELSEWHERE),
      reply(KB, 'r-b', CLOSED_ROUND),
      reply(KC, 'r-c', DECIDED),
    )
    expect(sentKeys(done.effects)).toEqual([KA, KB, KC])
    expect(done.state.closed).toEqual([
      { key: KA, item: A, draft: PICK_MAIN, notice: ALREADY_DECIDED },
      {
        key: KB,
        item: B,
        draft: TEXT_DRAFT,
        notice: { kind: 'done', text: '这次提问已经关掉：那一轮被取消了。' },
      },
    ])
    expect(done.state.entries).toEqual([])
    expect(done.state.batches).toEqual({})
  })

  it('G5 一题结果不知道：只那一题用原来的答复编号认回，后面的照常发出', () => {
    const next = run(
      drafted(),
      { kind: 'submit-group', group: SESSION, planned: PLAN },
      reply(KA, 'r-a', DECIDED),
      reply(KB, 'r-b', { outcome: 'unknown' }),
    )
    const tail = next.effects.slice(-2)
    expect(tail).toEqual([
      expect.objectContaining({
        kind: 'query',
        key: KB,
        sent: expect.objectContaining({ replyId: 'r-b' }),
      }),
      expect.objectContaining({ kind: 'submit', key: KC }),
    ])
    expect(submitOf(next.state, KB)).toMatchObject({ kind: 'unknown', confirming: true })
    const after = run(next.state, reply(KC, 'r-c', DECIDED), reply(KB, 'r-b', DECIDED))
    expect(sentKeys(after.effects)).toEqual([])
    expect(after.state.entries).toEqual([])
  })

  it('G6 提交中整组不能再改，也不能再提交；新来的卡接在最后，不进这一次', () => {
    const running = step(drafted(), { kind: 'submit-group', group: SESSION, planned: PLAN }).state
    expect(step(running, { kind: 'draft', key: KC, draft: PICK_MAIN }).state).toBe(running)
    expect(step(running, { kind: 'submit-group', group: SESSION, planned: PLAN }).state).toBe(
      running,
    )
    const late = questionItem('card-d')
    const reread = run(
      running,
      { kind: 'read-list' },
      { kind: 'list-answered', token: 2, answer: page([A, B, C, late]) },
    ).state
    expect(reread.entries.map(entry => entry.key)).toEqual([KA, KB, KC, keyOf(late.card.ref)])
    const finished = run(
      reread,
      reply(KA, 'r-a', DECIDED),
      reply(KB, 'r-b', DECIDED),
      reply(KC, 'r-c', DECIDED),
    )
    expect(sentKeys(finished.effects)).toEqual([KB, KC])
    expect(finished.state.batches).toEqual({})
    const lateKey = keyOf(late.card.ref)
    expect(
      step(finished.state, { kind: 'draft', key: lateKey, draft: PICK_MAIN }).state.drafts[lateKey],
    ).toEqual(PICK_MAIN)
  })

  it('G7 排着队的卡在重读时不在列表里了：留着，轮到它照发，由服务端说出原因', () => {
    const running = step(drafted(), { kind: 'submit-group', group: SESSION, planned: PLAN }).state
    const reread = run(
      running,
      { kind: 'read-list' },
      { kind: 'list-answered', token: 2, answer: page([A, B]) },
    ).state
    expect(reread.entries.map(entry => entry.key)).toEqual([KA, KB, KC])
    const next = run(reread, reply(KA, 'r-a', DECIDED), reply(KB, 'r-b', DECIDED))
    expect(sentKeys(next.effects)).toEqual([KB, KC])
  })

  it('G8 提交的计划和这一组对不上，或答复编号重复：不提交', () => {
    const state = drafted()
    const reordered = [PLAN[1]!, PLAN[0]!, PLAN[2]!]
    expect(step(state, { kind: 'submit-group', group: SESSION, planned: reordered }).state).toBe(
      state,
    )
    expect(
      step(state, { kind: 'submit-group', group: SESSION, planned: PLAN.slice(0, 2) }).state,
    ).toBe(state)
    const repeated = PLAN.map(item => ({ ...item, replyId: 'same' }))
    expect(step(state, { kind: 'submit-group', group: SESSION, planned: repeated }).state).toBe(
      state,
    )
    expect(step(state, { kind: 'submit-group', group: 'ses_other', planned: PLAN }).state).toBe(
      state,
    )
  })

  it('G9 被拒的那一题留着草稿；下一次提交只交没记上的', () => {
    const refused = run(
      drafted(),
      { kind: 'submit-group', group: SESSION, planned: PLAN },
      reply(KA, 'r-a', DECIDED),
      reply(KB, 'r-b', { outcome: 'denied' }),
      reply(KC, 'r-c', DECIDED),
    ).state
    expect(refused.drafts[KB]).toEqual(TEXT_DRAFT)
    expect(sheetOf(refused, SESSION)).toMatchObject({ ready: true, missing: [] })
    const again = step(refused, {
      kind: 'submit-group',
      group: SESSION,
      planned: [{ key: KB, replyId: 'r-b2' }],
    })
    expect(sentKeys(again.effects)).toEqual([KB])
  })

  it('G10 结果不知道的那一题不算还差的，也不进下一次提交', () => {
    const waiting = run(
      drafted([A, B]),
      { kind: 'submit-group', group: SESSION, planned: PLAN.slice(0, 2) },
      reply(KA, 'r-a', { outcome: 'unknown' }),
    ).state
    expect(sheetOf(waiting, SESSION).running).toBe(true)
    const after = step(waiting, reply(KB, 'r-b', { outcome: 'denied' })).state
    expect(sheetOf(after, SESSION)).toMatchObject({ running: false, ready: true, missing: [] })
  })

  it('G11 被关掉的题点「知道了」就去掉；别的键不变', () => {
    const closed = answered(submitted(), ELSEWHERE).state
    expect(step(closed, { kind: 'dismiss', key: 'x' }).state).toBe(closed)
    expect(step(closed, { kind: 'dismiss', key: KEY }).state.closed).toEqual([])
  })

  it('G12 填草稿：不认识的卡、在途的卡不变；被拒的卡可以改草稿', () => {
    const state = listed()
    expect(step(state, { kind: 'draft', key: 'x', draft: PICK_MAIN }).state).toBe(state)
    const busy = submitted()
    expect(step(busy, { kind: 'draft', key: KEY, draft: TEXT_DRAFT }).state).toBe(busy)
    const refused = answered(submitted(), { outcome: 'denied' }).state
    const edited = step(refused, { kind: 'draft', key: KEY, draft: TEXT_DRAFT }).state
    expect(edited.drafts[KEY]).toEqual(TEXT_DRAFT)
    expect(submitOf(edited)?.kind).toBe('refused')
  })

  it('G14 能交的卡：没齐时一张都不交；结果不知道的那一题不在里面', () => {
    const half = step(listed([A, B]), { kind: 'draft', key: KA, draft: PICK_MAIN }).state
    expect(submittable(half, SESSION)).toEqual([])
    expect(submittable(listed([]), SESSION)).toEqual([])
    const waiting = run(
      drafted([A, B]),
      { kind: 'submit-group', group: SESSION, planned: PLAN.slice(0, 2) },
      reply(KA, 'r-a', { outcome: 'unknown' }),
      reply(KB, 'r-b', { outcome: 'denied' }),
    ).state
    expect(submittable(waiting, SESSION)).toEqual([KB])
  })

  it('G15 一组没有能交的卡时，空的计划也不提交', () => {
    const empty = listed([A])
    expect(step(empty, { kind: 'submit-group', group: 'ses_none', planned: [] }).state).toBe(empty)
  })

  it('G16 提交中重读：只留排着队的卡；不在这次提交里的卡不在列表里了就去掉', () => {
    const elsewhere = { ...questionItem('card-z'), origin: { kind: 'tool' as const, sessionRef: 'ses_other' } }
    const running = step(drafted([A, B, C, elsewhere]), {
      kind: 'submit-group',
      group: SESSION,
      planned: PLAN,
    }).state
    const reread = run(
      running,
      { kind: 'read-list' },
      { kind: 'list-answered', token: 2, answer: page([A]) },
    ).state
    expect(reread.entries.map(entry => entry.key)).toEqual([KA, KB, KC])
  })

  it('G17 认回的答复在另一题在途时到了：不推进，在途的那一题有了结局才发下一题', () => {
    const next = run(
      drafted(),
      { kind: 'submit-group', group: SESSION, planned: PLAN },
      reply(KA, 'r-a', { outcome: 'unknown' }),
    )
    expect(sentKeys(next.effects)).toEqual([KA, KB])
    const recognized = step(next.state, reply(KA, 'r-a', DECIDED))
    expect(sentKeys(recognized.effects)).toEqual([])
    expect(submitOf(recognized.state, KB)?.kind).toBe('submitting')
    expect(sentKeys(step(recognized.state, reply(KB, 'r-b', DECIDED)).effects)).toEqual([KC])
  })

  it('G18 每种拒绝与每种关掉的原因各有自己的一句', () => {
    const texts = (['invalid', 'limited', 'protocol-rejected', 'basis-unavailable'] as const).map(
      outcome => (submitOf(answered(submitted(), { outcome } as ReplyAnswer).state) as { notice: { text: string } })
        .notice.text,
    )
    expect(texts).toEqual([
      '服务端认为这份答复不合这张卡的规定，这一题没有记上。',
      '答复超出了服务端的上限，这一题没有记上。',
      '服务端不认这个请求的格式，这一题没有记上。',
      '服务端暂时读不出需要的依据，这一题没有记上。稍后再试。',
    ])
    const reasons = ['cancelled', 'archived', 'origin-terminal', 'continuity-lost'].map(
      reason =>
        answered(submitted(), { outcome: 'succeeded', body: { kind: 'invalidated', reason } } as ReplyAnswer)
          .state.closed[0]?.notice.text,
    )
    expect(reasons).toEqual([
      '这次提问已经关掉：那一轮被取消了。',
      '这次提问已经关掉：会话已归档。',
      '这次提问已经关掉：提问的那一方已经结束。',
      '这次提问已经关掉：提问的那一方接不上了。',
    ])
  })

  it('G13 卡不在列表里了：草稿跟着去掉', () => {
    const state = step(listed([A, B]), { kind: 'draft', key: KB, draft: PICK_MAIN }).state
    const gone = run(
      state,
      { kind: 'read-list' },
      { kind: 'list-answered', token: 2, answer: page([A]) },
    ).state
    expect(gone.drafts).toEqual({})
  })
})

function watchingWith(items: Parameters<typeof page>[0]): State {
  return run(INITIAL, { kind: 'watch' }, { kind: 'list-answered', token: 1, answer: page(items) })
    .state
}
