import { describe, expect, it } from 'vitest'
import {
  INITIAL_ASSETS,
  stepAssets,
  type AssetsEvent,
  type AssetsState,
  type Described,
} from '../src/model/assets-machine.ts'

const ROW = {
  category: 'skill',
  name: 'review',
  version: 'sha256:00',
  selection: 'follow',
  enabled: true,
  holding: 'held-1',
  origin: 'customized',
  summary: null,
} as const
const DESCRIBED: Described = {
  item: ROW,
  revision: 2,
  content: { kind: 'data', body: { kind: 'null' } },
  standing: { kind: 'selected' },
  settings: false,
}

function run(state: AssetsState, ...events: AssetsEvent[]) {
  let current = state
  const effects = []
  for (const event of events) {
    const step = stepAssets(current, event)
    current = step.state
    effects.push(...step.effects)
  }
  return { state: current, effects }
}

function listed(items = [ROW]) {
  const reading = run(INITIAL_ASSETS, { kind: 'read-list' })
  return run(reading.state, {
    kind: 'list-answered',
    token: reading.state.issued,
    answer: { outcome: 'succeeded', body: { items, next: null, completeness: 'complete' } },
  }).state
}

const submitting = (state = listed(), operation = 'op-1') =>
  run(state, { kind: 'change', name: 'review', request: { kind: 'disable' }, operation })

describe('reading the list', () => {
  it('reads every page with the cursor of the last, and keeps the list shown while it reads again', () => {
    const first = run(INITIAL_ASSETS, { kind: 'read-list' })
    expect(first.effects).toEqual([{ kind: 'list', token: 1, after: null }])
    const paged = run(first.state, {
      kind: 'list-answered',
      token: 1,
      answer: {
        outcome: 'succeeded',
        body: { items: [ROW], next: 'review', completeness: 'complete' },
      },
    })
    expect(paged.effects).toEqual([{ kind: 'list', token: 1, after: 'review' }])
    const done = run(paged.state, {
      kind: 'list-answered',
      token: 1,
      answer: {
        outcome: 'succeeded',
        body: { items: [{ ...ROW, name: 'zeta' }], next: null, completeness: 'partial' },
      },
    })
    expect(done.state.list).toEqual({
      kind: 'read',
      items: [ROW, { ...ROW, name: 'zeta' }],
      partial: true,
    })
    const again = run(done.state, { kind: 'read-list' })
    expect(again.state.list).toMatchObject({
      kind: 'reading',
      shown: { items: [ROW, { ...ROW, name: 'zeta' }], partial: true },
    })
  })

  it('a first read shows nothing before it answers; a page marked partial keeps the whole list partial', () => {
    const first = run(INITIAL_ASSETS, { kind: 'read-list' })
    expect(first.state.list).toMatchObject({ kind: 'reading', shown: null })
    const partialFirst = run(first.state, {
      kind: 'list-answered',
      token: 1,
      answer: {
        outcome: 'succeeded',
        body: { items: [ROW], next: 'review', completeness: 'partial' },
      },
    })
    const done = run(partialFirst.state, {
      kind: 'list-answered',
      token: 1,
      answer: { outcome: 'succeeded', body: { items: [], next: null, completeness: 'complete' } },
    })
    expect(done.state.list).toEqual({ kind: 'read', items: [ROW], partial: true })
  })

  it('an answer to an older read counts for nothing', () => {
    const twice = run(INITIAL_ASSETS, { kind: 'read-list' }, { kind: 'read-list' })
    const stale = run(twice.state, {
      kind: 'list-answered',
      token: 1,
      answer: {
        outcome: 'succeeded',
        body: { items: [ROW], next: null, completeness: 'complete' },
      },
    })
    expect(stale.state).toBe(twice.state)
  })

  it('a refused read is failed with a sentence, never an empty list', () => {
    const reading = run(INITIAL_ASSETS, { kind: 'read-list' })
    const failed = run(reading.state, {
      kind: 'list-answered',
      token: 1,
      answer: { outcome: 'basis-unavailable' },
    })
    expect(failed.state.list).toEqual({
      kind: 'failed',
      notice: { kind: 'refused', text: '服务端暂时读不出需要的依据，稍后再试。' },
    })
  })
})

describe('a detail', () => {
  it('opens by reading the asset, and a late answer to an earlier opening counts for nothing', () => {
    const opened = run(listed(), { kind: 'open', name: 'review' }, { kind: 'open', name: 'review' })
    const late = run(opened.state, {
      kind: 'detail-answered',
      name: 'review',
      token: opened.state.issued - 1,
      answer: { outcome: 'succeeded', body: DESCRIBED },
    })
    expect(late.state).toBe(opened.state)
    const read = run(opened.state, {
      kind: 'detail-answered',
      name: 'review',
      token: opened.state.issued,
      answer: { outcome: 'succeeded', body: DESCRIBED },
    })
    expect(read.state.details.get('review')).toEqual({ kind: 'read', asset: DESCRIBED })
  })

  it('an asset that is not there any more is absent', () => {
    const opened = run(listed(), { kind: 'open', name: 'review' })
    const gone = run(opened.state, {
      kind: 'detail-answered',
      name: 'review',
      token: opened.state.issued,
      answer: { outcome: 'not-found', body: {} },
    })
    expect(gone.state.details.get('review')).toEqual({ kind: 'absent' })
  })
})

describe('the action slot of one asset', () => {
  it('none: a change is sent with its operation and the holding of the asset', () => {
    const sent = submitting()
    expect(sent.effects).toEqual([
      {
        kind: 'change',
        name: 'review',
        sent: { operation: 'op-1', holding: 'held-1', request: { kind: 'disable' } },
      },
    ])
  })

  it('an asset the page does not know is not changed', () => {
    expect(submitting(INITIAL_ASSETS).effects).toEqual([])
  })

  it('submitting: a second change is not sent', () => {
    const first = submitting()
    expect(submitting(first.state, 'op-2').effects).toEqual([])
  })

  it.each([
    ['succeeded', { outcome: 'succeeded', body: {} }, { kind: 'done', text: '已禁用。' }, true],
    [
      'no-change',
      { outcome: 'no-change', body: {} },
      { kind: 'done', text: '没有变化：已经是这个状态。' },
      true,
    ],
    [
      'not-writable official',
      { outcome: 'not-writable', body: { reason: 'official' } },
      {
        kind: 'refused',
        notice: { kind: 'refused', text: '这一份是部署装的官方资产，不能停用或移除。' },
      },
      false,
    ],
    [
      'conflict',
      { outcome: 'conflict', body: {} },
      {
        kind: 'refused',
        notice: { kind: 'refused', text: '这一份在别处改过了，没有改动。已重新读取。' },
      },
      true,
    ],
    [
      'denied',
      { outcome: 'denied' },
      { kind: 'refused', notice: { kind: 'refused', text: '没有权限，或登录已失效。' } },
      false,
    ],
    [
      'not sent',
      { outcome: 'unavailable' },
      { kind: 'refused', notice: { kind: 'unavailable', text: '没有发出去。' } },
      false,
    ],
  ] as const)(
    'submitting, answered %s: the slot records it, and reads again when it changed something',
    (_label, answer, action, reread) => {
      const sent = submitting()
      const answered = run(sent.state, {
        kind: 'change-answered',
        name: 'review',
        operation: 'op-1',
        answer: answer as never,
      })
      expect(answered.state.actions.get('review')).toEqual(action)
      expect(answered.effects.some(effect => effect.kind === 'list')).toBe(reread)
    },
  )

  it('submitting, answered for another operation: counts for nothing', () => {
    const sent = submitting()
    const stale = run(sent.state, {
      kind: 'change-answered',
      name: 'review',
      operation: 'op-0',
      answer: { outcome: 'succeeded', body: {} },
    })
    expect(stale.state).toBe(sent.state)
  })

  it.each([['unknown'], ['uncertain']] as const)(
    'answered %s: the slot is unknown, keeps the operation, and a recall asks with it',
    outcome => {
      const unknown = run(submitting().state, {
        kind: 'change-answered',
        name: 'review',
        operation: 'op-1',
        answer: { outcome } as never,
      })
      expect(unknown.state.actions.get('review')).toMatchObject({
        kind: 'unknown',
        confirming: false,
      })
      expect(submitting(unknown.state, 'op-2').effects).toEqual([])
      const recall = run(unknown.state, { kind: 'confirm', name: 'review' })
      expect(recall.effects).toEqual([
        {
          kind: 'recall',
          name: 'review',
          sent: { operation: 'op-1', holding: 'held-1', request: { kind: 'disable' } },
        },
      ])
      expect(run(recall.state, { kind: 'confirm', name: 'review' }).effects).toEqual([])
    },
  )

  function recalling() {
    const unknown = run(submitting().state, {
      kind: 'change-answered',
      name: 'review',
      operation: 'op-1',
      answer: { outcome: 'unknown' },
    })
    return run(unknown.state, { kind: 'confirm', name: 'review' }).state
  }

  it.each([
    ['succeeded', { outcome: 'succeeded', body: {} }, { kind: 'done', text: '已禁用。' }],
    [
      'not-committed',
      { outcome: 'not-committed', body: {} },
      { kind: 'refused', notice: { kind: 'unavailable', text: '上一次没有生效，可以再试一次。' } },
    ],
    ['basis-unavailable', { outcome: 'basis-unavailable' }, { kind: 'unknown', confirming: false }],
  ] as const)('a recall answered %s', (_label, answer, action) => {
    const answered = run(recalling(), {
      kind: 'confirm-answered',
      name: 'review',
      operation: 'op-1',
      answer: answer as never,
    })
    expect(answered.state.actions.get('review')).toMatchObject(action)
  })

  it('a recall answered for another operation counts for nothing', () => {
    const state = recalling()
    expect(
      run(state, {
        kind: 'confirm-answered',
        name: 'review',
        operation: 'op-0',
        answer: { outcome: 'succeeded', body: {} },
      }).state,
    ).toBe(state)
  })
})

describe('a change elsewhere', () => {
  it('reads the list again and every open detail', () => {
    const opened = run(listed(), { kind: 'open', name: 'review' }).state
    const changed = run(opened, { kind: 'changed' })
    expect(changed.effects.map(effect => effect.kind)).toEqual(['list', 'describe'])
  })
})
