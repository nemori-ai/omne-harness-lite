// One case per reachable cell of SPEC.md「全化表」. Case names start with the row id.
import { describe, expect, it } from 'vitest'
import {
  INITIAL,
  keyOf,
  step,
  type Event,
  type Row,
  type State,
} from '../src/model/settings-machine.ts'
import { permissionView } from './fixtures/views.ts'

const VIEW = permissionView()
const KEY = keyOf(VIEW)
const TARGET = { asset: VIEW.asset, item: VIEW.item }

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

function listed(): State {
  return run(
    INITIAL,
    { kind: 'read-list' },
    {
      kind: 'list-answered',
      token: 1,
      answer: {
        outcome: 'succeeded',
        body: { items: [VIEW], next: null, completeness: 'complete' },
      },
    },
  ).state
}

function rowIn(state: State): Row {
  if (state.list.kind !== 'read') throw new Error(`list is ${state.list.kind}`)
  const row = state.list.rows.find(candidate => candidate.key === KEY)
  if (row === undefined) throw new Error('no row')
  return row
}

/** Picks `auto` with operation `op-1`: the row is submitting. */
function submitting(): State {
  return run(listed(), { kind: 'set', key: KEY, pick: 'auto', operation: 'op-1' }).state
}

const SENT_SET = {
  operation: 'op-1',
  expectedRevision: '1',
  request: { kind: 'set', pick: 'auto' },
} as const

/** The first answer was unknown: the recognition is in flight. */
function confirming(): State {
  return run(submitting(), {
    kind: 'write-answered',
    key: KEY,
    operation: 'op-1',
    answer: { outcome: 'unknown' },
  }).state
}

/** The recognition could not tell either: still unknown. */
function stillUnknown(): State {
  return run(confirming(), {
    kind: 'write-answered',
    key: KEY,
    operation: 'op-1',
    answer: { outcome: 'uncertain' },
  }).state
}

describe('整张表', () => {
  it('L1 挂上：读中，列出第一页', () => {
    const { state, effects } = run(INITIAL, { kind: 'read-list' })
    expect(state.list.kind).toBe('reading')
    expect(effects).toEqual([{ kind: 'list', token: 1, after: null }])
  })

  it('L1 读中、已读时再挂上不变', () => {
    const reading = run(INITIAL, { kind: 'read-list' }).state
    expect(step(reading, { kind: 'read-list' }).state).toBe(reading)
    const read = listed()
    expect(step(read, { kind: 'read-list' }).state).toBe(read)
  })

  it('L2 读失败时点「重试」：从第一页重读，旧的读取编号作废', () => {
    const failed = run(
      INITIAL,
      { kind: 'read-list' },
      { kind: 'list-answered', token: 1, answer: { outcome: 'basis-unavailable' } },
    ).state
    const { state, effects } = run(failed, { kind: 'read-list' })
    expect(effects).toEqual([{ kind: 'list', token: 2, after: null }])
    const late = step(state, {
      kind: 'list-answered',
      token: 1,
      answer: {
        outcome: 'succeeded',
        body: { items: [VIEW], next: null, completeness: 'complete' },
      },
    })
    expect(late.state).toBe(state)
  })

  it('L3 有 next：收下这一页，按 next 读下一页', () => {
    const { state, effects } = run(
      INITIAL,
      { kind: 'read-list' },
      {
        kind: 'list-answered',
        token: 1,
        answer: {
          outcome: 'succeeded',
          body: { items: [VIEW], next: 'p2', completeness: 'complete' },
        },
      },
    )
    expect(state.list).toMatchObject({ kind: 'reading', rows: [{ key: KEY }] })
    expect(effects).toContainEqual({ kind: 'list', token: 1, after: 'p2' })
  })

  it('L4 next 为空：已读；有一页 partial 就标不全', () => {
    const second = permissionView({ item: 'other' })
    const { state } = run(
      INITIAL,
      { kind: 'read-list' },
      {
        kind: 'list-answered',
        token: 1,
        answer: {
          outcome: 'succeeded',
          body: { items: [VIEW], next: 'p2', completeness: 'partial' },
        },
      },
      {
        kind: 'list-answered',
        token: 1,
        answer: {
          outcome: 'succeeded',
          body: { items: [second], next: null, completeness: 'complete' },
        },
      },
    )
    expect(state.list).toMatchObject({ kind: 'read', partial: true })
    if (state.list.kind !== 'read') throw new Error('not read')
    expect(state.list.rows.map(row => row.view.item)).toEqual(['call-permission', 'other'])
  })

  it.each([
    'denied',
    'not-visible',
    'conflict',
    'basis-unavailable',
    'unavailable',
    'uncertain',
  ] as const)('L5 列出答 %s：读失败，带一句话', outcome => {
    const { state } = run(
      INITIAL,
      { kind: 'read-list' },
      { kind: 'list-answered', token: 1, answer: { outcome } },
    )
    expect(state.list.kind).toBe('failed')
    if (state.list.kind !== 'failed') return
    expect(state.list.notice.text.length).toBeGreaterThan(0)
  })

  it('L5 denied 写「没有权限，或登录已失效」', () => {
    const { state } = run(
      INITIAL,
      { kind: 'read-list' },
      { kind: 'list-answered', token: 1, answer: { outcome: 'denied' } },
    )
    expect(state.list).toMatchObject({
      kind: 'failed',
      notice: { text: '没有权限，或登录已失效。' },
    })
  })
})

describe('一项', () => {
  it('R1 闲时点「设置」：交，带这一项的修订号与挑选', () => {
    const { state, effects } = run(listed(), {
      kind: 'set',
      key: KEY,
      pick: 'auto',
      operation: 'op-1',
    })
    expect(rowIn(state).write).toEqual({ kind: 'submitting', sent: SENT_SET })
    expect(effects).toEqual([{ kind: 'write', key: KEY, target: TARGET, sent: SENT_SET }])
  })

  it('R1 交、认、疑、重时点「设置」不变', () => {
    for (const state of [submitting(), confirming(), stillUnknown()])
      expect(step(state, { kind: 'set', key: KEY, pick: 'deny', operation: 'op-2' }).state).toBe(
        state,
      )
    const rereading = run(submitting(), {
      kind: 'write-answered',
      key: KEY,
      operation: 'op-1',
      answer: { outcome: 'succeeded', body: { revision: '2' } },
    }).state
    expect(step(rereading, { kind: 'clear', key: KEY, operation: 'op-2' }).state).toBe(rereading)
  })

  it('R2 闲时点「清除」：交，带这一项的修订号', () => {
    const { state, effects } = run(listed(), { kind: 'clear', key: KEY, operation: 'op-1' })
    const sent = { operation: 'op-1', expectedRevision: '1', request: { kind: 'clear' } }
    expect(rowIn(state).write).toEqual({ kind: 'submitting', sent })
    expect(effects).toEqual([{ kind: 'write', key: KEY, target: TARGET, sent }])
  })

  it('R3 写答 succeeded：成功，重读这一项', () => {
    const { state, effects } = run(submitting(), {
      kind: 'write-answered',
      key: KEY,
      operation: 'op-1',
      answer: { outcome: 'succeeded', body: { revision: '2' } },
    })
    const row = rowIn(state)
    expect(row.write).toEqual({ kind: 'succeeded', change: 'written' })
    expect(row.read).toEqual({ kind: 'reading', token: 2 })
    expect(effects).toEqual([{ kind: 'describe', key: KEY, token: 2, target: TARGET }])
  })

  it('R3 认回答 succeeded：同交', () => {
    const { state } = run(confirming(), {
      kind: 'write-answered',
      key: KEY,
      operation: 'op-1',
      answer: { outcome: 'succeeded', body: { revision: '2' } },
    })
    expect(rowIn(state).write).toEqual({ kind: 'succeeded', change: 'written' })
    expect(rowIn(state).read.kind).toBe('reading')
  })

  it('R3 别的操作编号的答复作废', () => {
    const state = submitting()
    const late = step(state, {
      kind: 'write-answered',
      key: KEY,
      operation: 'op-0',
      answer: { outcome: 'succeeded', body: { revision: '2' } },
    })
    expect(late.state).toBe(state)
  })

  it('R4 写答 no-change：成功（无变化），不重读', () => {
    const { state, effects } = run(submitting(), {
      kind: 'write-answered',
      key: KEY,
      operation: 'op-1',
      answer: { outcome: 'no-change' },
    })
    expect(rowIn(state)).toMatchObject({
      read: { kind: 'read' },
      write: { kind: 'succeeded', change: 'no-change' },
    })
    expect(effects).toEqual([])
  })

  it('R5 写答 conflict：被拒，一句原因，重读这一项', () => {
    const { state, effects } = run(submitting(), {
      kind: 'write-answered',
      key: KEY,
      operation: 'op-1',
      answer: { outcome: 'conflict' },
    })
    const row = rowIn(state)
    expect(row.write).toMatchObject({
      kind: 'refused',
      notice: { text: expect.stringContaining('在别处改过了') },
    })
    expect(row.read.kind).toBe('reading')
    expect(effects).toEqual([{ kind: 'describe', key: KEY, token: 2, target: TARGET }])
  })

  it.each([
    ['locked', '被上层锁定'],
    ['out-of-bound', '越过了上层允许的范围'],
    ['prohibited-above', '上层已经主动禁止'],
    ['not-a-source', '这一层不能配这一项'],
  ] as const)('R6 写答 not-writable（%s）：被拒，按原因写', (reason, text) => {
    const { state, effects } = run(submitting(), {
      kind: 'write-answered',
      key: KEY,
      operation: 'op-1',
      answer: { outcome: 'not-writable', body: { reason } },
    })
    expect(rowIn(state).write).toMatchObject({
      kind: 'refused',
      notice: { text: expect.stringContaining(text) },
    })
    expect(effects).toEqual([])
  })

  it.each(['invalid', 'not-visible'] as const)('R6 写答 %s：被拒', outcome => {
    const { state } = run(submitting(), {
      kind: 'write-answered',
      key: KEY,
      operation: 'op-1',
      answer: { outcome },
    })
    expect(rowIn(state).write.kind).toBe('refused')
  })

  it.each(['denied', 'basis-unavailable', 'protocol-rejected', 'unavailable'] as const)(
    'R7 交时写答 %s：被拒',
    outcome => {
      const { state, effects } = run(submitting(), {
        kind: 'write-answered',
        key: KEY,
        operation: 'op-1',
        answer: { outcome },
      })
      expect(rowIn(state).write.kind).toBe('refused')
      expect(effects).toEqual([])
    },
  )

  it.each(['denied', 'basis-unavailable', 'protocol-rejected', 'unavailable'] as const)(
    'R7 认回答 %s：仍未知，不写成失败',
    outcome => {
      const { state, effects } = run(confirming(), {
        kind: 'write-answered',
        key: KEY,
        operation: 'op-1',
        answer: { outcome },
      })
      expect(rowIn(state).write).toMatchObject({
        kind: 'unknown',
        confirming: false,
        sent: SENT_SET,
      })
      expect(effects).toEqual([])
    },
  )

  it.each(['unknown', 'uncertain'] as const)(
    'R8 交时写答 %s：认，原样再送同一次，不发新的一次',
    outcome => {
      const { state, effects } = run(submitting(), {
        kind: 'write-answered',
        key: KEY,
        operation: 'op-1',
        answer: { outcome },
      })
      expect(rowIn(state).write).toEqual({
        kind: 'unknown',
        sent: SENT_SET,
        confirming: true,
        notice: { kind: 'unknown', text: '结果未知，正在确认。' },
      })
      expect(effects).toEqual([{ kind: 'write', key: KEY, target: TARGET, sent: SENT_SET }])
    },
  )

  it('R8 认回又答 unknown：疑，不再自动送', () => {
    const { state, effects } = run(confirming(), {
      kind: 'write-answered',
      key: KEY,
      operation: 'op-1',
      answer: { outcome: 'unknown' },
    })
    expect(rowIn(state).write).toMatchObject({ kind: 'unknown', confirming: false })
    expect(effects).toEqual([])
  })

  it('R8 疑时迟到的答复作废', () => {
    const state = stillUnknown()
    expect(
      step(state, {
        kind: 'write-answered',
        key: KEY,
        operation: 'op-1',
        answer: { outcome: 'no-change' },
      }).state,
    ).toBe(state)
  })

  it('R9 疑时点「再确认一次」：认，原样再送同一次', () => {
    const { state, effects } = run(stillUnknown(), { kind: 'confirm', key: KEY })
    expect(rowIn(state).write).toMatchObject({ kind: 'unknown', confirming: true, sent: SENT_SET })
    expect(effects).toEqual([{ kind: 'write', key: KEY, target: TARGET, sent: SENT_SET }])
  })

  it('R9 别的列点「再确认一次」不变', () => {
    for (const state of [listed(), submitting(), confirming()])
      expect(step(state, { kind: 'confirm', key: KEY }).state).toBe(state)
  })

  it('R10 查看答 succeeded：闲，按读到的视图重画（清除之后显示外层来的值）', () => {
    const cleared = permissionView({
      revision: '3',
      own: null,
      effective: { kind: 'value', value: 'ask', source: 'organization' },
    })
    const { state } = run(
      listed(),
      { kind: 'clear', key: KEY, operation: 'op-1' },
      {
        kind: 'write-answered',
        key: KEY,
        operation: 'op-1',
        answer: { outcome: 'succeeded', body: { revision: '3' } },
      },
      {
        kind: 'describe-answered',
        key: KEY,
        token: 2,
        answer: { outcome: 'succeeded', body: { item: cleared } },
      },
    )
    const row = rowIn(state)
    expect(row.read).toEqual({ kind: 'read' })
    expect(row.view).toBe(cleared)
    expect(row.write).toEqual({ kind: 'succeeded', change: 'written' })
  })

  it('R10 旧读取编号的答复作废', () => {
    const rereading = run(submitting(), {
      kind: 'write-answered',
      key: KEY,
      operation: 'op-1',
      answer: { outcome: 'conflict' },
    }).state
    const late = step(rereading, {
      kind: 'describe-answered',
      key: KEY,
      token: 1,
      answer: { outcome: 'succeeded', body: { item: VIEW } },
    })
    expect(late.state).toBe(rereading)
  })

  it('R11 查看答别的：败，带一句话', () => {
    const { state } = run(
      submitting(),
      { kind: 'write-answered', key: KEY, operation: 'op-1', answer: { outcome: 'conflict' } },
      { kind: 'describe-answered', key: KEY, token: 2, answer: { outcome: 'denied' } },
    )
    expect(rowIn(state).read).toEqual({
      kind: 'failed',
      notice: { kind: 'refused', text: '没有权限，或登录已失效。' },
    })
  })

  it('R12 败时点这一项的「重试」：重，发查看', () => {
    const failed = run(
      submitting(),
      { kind: 'write-answered', key: KEY, operation: 'op-1', answer: { outcome: 'conflict' } },
      { kind: 'describe-answered', key: KEY, token: 2, answer: { outcome: 'basis-unavailable' } },
    ).state
    const { state, effects } = run(failed, { kind: 'retry-row', key: KEY })
    expect(rowIn(state).read).toEqual({ kind: 'reading', token: 3 })
    expect(effects).toEqual([{ kind: 'describe', key: KEY, token: 3, target: TARGET }])
  })

  it('R12 闲时点「重试」不变', () => {
    const state = listed()
    expect(step(state, { kind: 'retry-row', key: KEY }).state).toBe(state)
  })
})
