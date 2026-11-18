import { describe, expect, it } from 'vitest'
import {
  renderChangeReminder,
  renderSnapshotReminder,
  type BlockEntry,
  type ChangeEntry,
  type ChangeMaterial,
} from '@omne-harness/runtime-context-contract'

const scope = { ref: 'scope-1' } as BlockEntry['evidence']['scope']
function entry(key: string, revision: number, state: BlockEntry['state']): BlockEntry {
  return {
    key: key as BlockEntry['key'],
    revision: revision as BlockEntry['revision'],
    state,
    evidence: {
      key: key as BlockEntry['key'],
      revision: revision as BlockEntry['revision'],
      scope,
      generation: null,
    },
    volatility: 'stable',
  }
}

describe('the text of a context snapshot reminder', () => {
  it('lists the blocks with a value by key, each value as JSON with sorted keys', () => {
    const text = renderSnapshotReminder([
      entry('session.modes', 3, {
        kind: 'value',
        value: { b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } },
      }),
      entry('a.first', 1, { kind: 'value', value: 'x' }),
      entry('z.empty', 2, { kind: 'none' }),
    ])
    expect(text).toBe(
      [
        'Runtime context: the current values. They hold from here until a later runtime context reminder changes them.',
        '<block key="a.first" revision="1">',
        '"x"',
        '</block>',
        '<block key="session.modes" revision="3">',
        '{"a":{"c":[3,{"e":5,"f":4}],"d":2},"b":1}',
        '</block>',
      ].join('\n'),
    )
  })

  it('is null when no block has a value', () => {
    expect(renderSnapshotReminder([entry('z.empty', 2, { kind: 'none' })])).toBeNull()
    expect(renderSnapshotReminder([])).toBeNull()
  })

  it('is the same for the same blocks in another order', () => {
    const a = entry('a', 1, { kind: 'value', value: 1 })
    const b = entry('b', 1, { kind: 'value', value: 2 })
    expect(renderSnapshotReminder([a, b])).toBe(renderSnapshotReminder([b, a]))
  })
})

describe('the text of a context change reminder', () => {
  const changed = (key: string, revision: number, state: ChangeEntry['state']): ChangeEntry => {
    const { volatility: _volatility, ...rest } = entry(key, revision, state)
    return rest
  }
  const material = (
    key: string,
    from: number | null,
    to: number,
    previous: ChangeMaterial['previous'],
  ): ChangeMaterial => ({
    key: key as ChangeMaterial['key'],
    from: from as ChangeMaterial['from'],
    to: to as ChangeMaterial['to'],
    previous,
  })

  it('names each changed block with its revisions, new value and the previous value it may carry', () => {
    const text = renderChangeReminder(
      [
        changed('session.modes', 4, { kind: 'value', value: { mode: 'ask' } }),
        changed('b.gone', 2, { kind: 'none' }),
        changed('c.unchanged', 1, { kind: 'value', value: 0 }),
      ],
      [
        material('session.modes', 3, 4, { kind: 'value', value: { mode: 'auto' } }),
        material('b.gone', 1, 2, { kind: 'withheld' }),
      ],
    )
    expect(text).toBe(
      [
        'Runtime context: these values changed. The new values hold from here.',
        '<block key="b.gone" from="1" to="2">',
        '(no value)',
        '</block>',
        '<block key="session.modes" from="3" to="4">',
        '{"mode":"ask"}',
        '<previous>{"mode":"auto"}</previous>',
        '</block>',
      ].join('\n'),
    )
  })

  it('writes a first revision as from none and is null without materials', () => {
    const text = renderChangeReminder(
      [changed('k', 1, { kind: 'value', value: true })],
      [material('k', null, 1, { kind: 'withheld' })],
    )
    expect(text).toContain('<block key="k" from="none" to="1">')
    expect(renderChangeReminder([changed('k', 1, { kind: 'value', value: true })], [])).toBeNull()
  })
})
