import { describe, expect, it } from 'vitest'
import {
  INITIAL,
  keyOf,
  step,
  type Event,
  type Row,
  type State,
} from '../src/model/settings-machine.ts'
import { secretView } from './fixtures/views.ts'

const SENTINEL = 'sentinel-secret-7f3a91c2'
const VIEW = secretView({ editable: { kind: 'yes' } })
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

const listed = (): State =>
  run(
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

function rowIn(state: State): Row {
  if (state.list.kind !== 'read') throw new Error(`list is ${state.list.kind}`)
  const row = state.list.rows.find(candidate => candidate.key === KEY)
  if (row === undefined) throw new Error('no row')
  return row
}

const SET: Event = { kind: 'set-secret', key: KEY, secret: SENTINEL, operation: 'op-1' }
const answered = (answer: unknown): Event =>
  ({ kind: 'write-answered', key: KEY, operation: 'op-1', answer }) as Event

const SENT = { operation: 'op-1', expectedRevision: '2', request: { kind: 'set-secret' } } as const

function unknownAfterSubmit(): State {
  return run(listed(), SET, answered({ outcome: 'unknown' })).state
}

describe('秘密项的设置', () => {
  it('闲时设置：交，带修订号；原文只在这一次要送出的效果里，不在状态里', () => {
    const { state, effects } = run(listed(), SET)
    expect(rowIn(state).write).toEqual({ kind: 'submitting', sent: SENT })
    expect(effects).toEqual([
      { kind: 'write', key: KEY, target: TARGET, sent: SENT, secret: SENTINEL },
    ])
    expect(JSON.stringify(state)).not.toContain(SENTINEL)
  })

  it('交、疑时再设置不变', () => {
    const submitting = run(listed(), SET).state
    expect(step(submitting, { ...SET, operation: 'op-2' } as Event).state).toBe(submitting)
    const unknown = unknownAfterSubmit()
    expect(step(unknown, { ...SET, operation: 'op-2' } as Event).state).toBe(unknown)
  })

  it('读着这一项时设置不变', () => {
    const reading = run(
      listed(),
      SET,
      answered({ outcome: 'succeeded', body: { revision: '3' } }),
    ).state
    expect(step(reading, { ...SET, operation: 'op-2' } as Event).state).toBe(reading)
  })

  it('写答 succeeded：成功，重读这一项，状态里没有原文', () => {
    const { state, effects } = run(
      listed(),
      SET,
      answered({ outcome: 'succeeded', body: { revision: '3' } }),
    )
    expect(rowIn(state).write).toEqual({ kind: 'succeeded', change: 'written' })
    expect(effects).toContainEqual({ kind: 'describe', key: KEY, token: 2, target: TARGET })
    expect(JSON.stringify(state)).not.toContain(SENTINEL)
  })

  it('写答 no-change：成功（无变化），不重读', () => {
    const { state, effects } = run(listed(), SET, answered({ outcome: 'no-change' }))
    expect(rowIn(state).write).toEqual({ kind: 'succeeded', change: 'no-change' })
    expect(effects.filter(effect => (effect as { kind: string }).kind === 'describe')).toEqual([])
  })

  it('写答 conflict：被拒，重读', () => {
    const { state, effects } = run(listed(), SET, answered({ outcome: 'conflict' }))
    expect(rowIn(state).write).toMatchObject({ kind: 'refused', notice: { kind: 'refused' } })
    expect(effects).toContainEqual({ kind: 'describe', key: KEY, token: 2, target: TARGET })
  })

  it('写答 not-writable、invalid、denied、unavailable：被拒，各一句话', () => {
    const notWritable = run(
      listed(),
      SET,
      answered({ outcome: 'not-writable', body: { reason: 'not-a-source' } }),
    ).state
    expect(rowIn(notWritable).write).toMatchObject({
      kind: 'refused',
      notice: { text: '这一层不能配这一项。' },
    })
    for (const outcome of ['invalid', 'denied', 'unavailable'] as const) {
      const { state, effects } = run(listed(), SET, answered({ outcome }))
      expect(rowIn(state).write.kind).toBe('refused')
      expect(effects.filter(effect => (effect as { kind: string }).kind === 'describe')).toEqual([])
      expect(JSON.stringify(state)).not.toContain(SENTINEL)
    }
  })

  it('写答 unknown 或 uncertain：疑，不重发（没有原文可发），状态里没有原文', () => {
    for (const outcome of ['unknown', 'uncertain'] as const) {
      const { state, effects } = run(listed(), SET, answered({ outcome }))
      expect(rowIn(state).write).toMatchObject({ kind: 'unknown', sent: SENT, confirming: false })
      expect(effects.filter(effect => (effect as { kind: string }).kind === 'write')).toHaveLength(
        1,
      )
      expect(JSON.stringify(state)).not.toContain(SENTINEL)
    }
  })

  it('疑时点「再确认一次」：只重读这一项，不发写', () => {
    const { state, effects } = run(unknownAfterSubmit(), { kind: 'confirm', key: KEY })
    expect(rowIn(state).write).toMatchObject({ kind: 'unknown', confirming: true })
    expect(rowIn(state).read).toEqual({ kind: 'reading', token: 2 })
    expect(effects).toEqual([{ kind: 'describe', key: KEY, token: 2, target: TARGET }])
  })

  it('确认的读答 succeeded：按读到的视图重画，仍标「结果未知」，闲下来', () => {
    const fresh = secretView({ editable: { kind: 'yes' }, own: 'available', revision: '3' })
    const { state } = run(
      unknownAfterSubmit(),
      { kind: 'confirm', key: KEY },
      {
        kind: 'describe-answered',
        key: KEY,
        token: 2,
        answer: { outcome: 'succeeded', body: { item: fresh } },
      },
    )
    const row = rowIn(state)
    expect(row.view).toEqual(fresh)
    expect(row.write).toMatchObject({ kind: 'unconfirmed', notice: { kind: 'unknown' } })
    expect(row.read).toEqual({ kind: 'read' })
    const again = step(state, { ...SET, operation: 'op-2' } as Event)
    expect(rowIn(again.state).write.kind).toBe('submitting')
  })

  it('确认的读答失败：读败，仍在疑；点「重试」再读', () => {
    const failed = run(
      unknownAfterSubmit(),
      { kind: 'confirm', key: KEY },
      { kind: 'describe-answered', key: KEY, token: 2, answer: { outcome: 'basis-unavailable' } },
    ).state
    expect(rowIn(failed).read.kind).toBe('failed')
    expect(rowIn(failed).write.kind).toBe('unknown')
    const { state, effects } = run(failed, { kind: 'retry-row', key: KEY })
    expect(rowIn(state).read).toEqual({ kind: 'reading', token: 3 })
    expect(effects).toEqual([{ kind: 'describe', key: KEY, token: 3, target: TARGET }])
  })

  it('疑时迟到的写答复作废；正在确认时点「再确认一次」不变', () => {
    const unknown = unknownAfterSubmit()
    expect(step(unknown, answered({ outcome: 'succeeded', body: { revision: '3' } })).state).toBe(
      unknown,
    )
    const confirming = run(unknown, { kind: 'confirm', key: KEY }).state
    expect(step(confirming, { kind: 'confirm', key: KEY }).state).toBe(confirming)
  })

  it('普通的读答不动没有疑的写', () => {
    const { state } = run(
      listed(),
      SET,
      answered({ outcome: 'succeeded', body: { revision: '3' } }),
      {
        kind: 'describe-answered',
        key: KEY,
        token: 2,
        answer: {
          outcome: 'succeeded',
          body: {
            item: secretView({ editable: { kind: 'yes' }, own: 'available', revision: '3' }),
          },
        },
      },
    )
    expect(rowIn(state).write).toEqual({ kind: 'succeeded', change: 'written' })
  })
})

describe('秘密项的清除', () => {
  it('闲时点「清除」：交，带修订号，没有原文', () => {
    const { state, effects } = run(listed(), { kind: 'clear', key: KEY, operation: 'op-1' })
    expect(effects).toEqual([
      { kind: 'write', key: KEY, target: TARGET, sent: { ...SENT, request: { kind: 'clear' } } },
    ])
    expect(rowIn(state).write.kind).toBe('submitting')
  })
})
