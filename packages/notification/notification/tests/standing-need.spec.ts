import { describe, expect, it } from 'vitest'
import { standingReadOf, type StandingBlockRead } from '@omne-harness/notification'

const item = (id: string) => ({
  id,
  source: 'notification.system',
  type: 'delivery-blocked',
  subject: id,
  title: `blocked ${id}`,
  locator: null,
  since: '2026-11-18T00:00:00.000Z',
})

const read = (blocks: readonly StandingBlockRead[], bound = true) =>
  standingReadOf({ kind: 'read', bound, blocks })

describe('the standing items of every bound block (INV-NO12)', () => {
  it('gives the items of all blocks in order', () => {
    expect(
      read([
        { kind: 'value', value: [item('a')] },
        { kind: 'value', value: [] },
        { kind: 'value', value: [item('b'), item('c')] },
      ]),
    ).toEqual({ kind: 'ok', items: [item('a'), item('b'), item('c')] })
  })

  it('is ok with no items only when every bound block read and held none', () => {
    expect(read([{ kind: 'value', value: [] }])).toEqual({ kind: 'ok', items: [] })
  })

  it('is missing, never empty, when no block is bound to the need', () => {
    expect(read([], false)).toEqual({ kind: 'missing' })
  })

  it.each([
    ['missing', 'missing'],
    ['none', 'missing'],
    ['unknown', 'unknown'],
  ] as const)('a block that reads %s makes the whole read %s', (kind, answer) => {
    expect(read([{ kind: 'value', value: [item('a')] }, { kind }])).toEqual({ kind: answer })
  })

  it.each([
    ['is not a list', { items: [] }],
    ['holds something that is not an item', [{ id: 'a' }]],
    ['holds an item with an unknown field', [{ ...item('a'), extra: true }]],
    ['holds an item without an id', [{ ...item('a'), id: '' }]],
  ])('a block whose value %s is unknown, never an empty list', (_label, value) => {
    expect(read([{ kind: 'value', value }])).toEqual({ kind: 'unknown' })
  })

  it.each(['refused', 'unknown'] as const)('a read that was %s stays %s', kind => {
    expect(standingReadOf({ kind })).toEqual({ kind })
  })
})
