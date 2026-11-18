import { describe, expect, it } from 'vitest'
import {
  createIndependentSettingsPoint,
  createSettingsRegistry,
  type SettingDefinitions,
} from '../src/index.ts'

function declaration(
  providerId: string,
  definitionId: string,
  item: Partial<SettingDefinitions['items'][number]> = {},
): SettingDefinitions {
  return {
    providerId,
    definitionId,
    version: '1',
    groups: [{ id: 'general', parentId: null, title: '通用', description: '通用设置', order: 0 }],
    items: [
      {
        id: 'mode',
        groupId: 'general',
        category: 'preference',
        presentation: {
          title: '方式',
          description: '怎样做',
          impact: '之后按这个方式做',
          clear: '回到默认方式',
          adoption: 'next-read',
        },
        valueSchema: { type: 'string' },
        default: { kind: 'value', value: 'ask' },
        merge: 'override',
        sensitivity: 'ordinary',
        ...item,
      },
    ],
  }
}

function open(capacity = 8) {
  const registry = createSettingsRegistry({ capacity })
  return { registry, point: createIndependentSettingsPoint(registry) }
}

describe('the contribution point of independent settings (table five)', () => {
  it('contributing a valid declaration lists it and takes one registry lease', () => {
    const { registry, point } = open()
    point.contribute(declaration('calendar', 'environment'))
    expect(point.list()).toEqual([declaration('calendar', 'environment')])
    expect(registry.snapshot()).toMatchObject({ revision: 1 })
  })

  it('a second declaration under the same key throws and leaves the first in place', () => {
    const { point } = open()
    point.contribute(declaration('calendar', 'environment'))
    expect(() =>
      point.contribute({ ...declaration('calendar', 'environment'), version: '2' }),
    ).toThrow(/already contributed/)
    expect(point.list()).toEqual([declaration('calendar', 'environment')])
  })

  it.each([
    [
      'a declaration that breaks the rules',
      { ...declaration('calendar', 'environment'), items: 1 },
      /declaration rejected/,
    ],
    [
      'a governance item',
      declaration('calendar', 'environment', { category: 'governance' }),
      /no governance item/,
    ],
    [
      'a secret item',
      declaration('calendar', 'environment', {
        category: 'binding',
        sensitivity: 'secret',
        default: { kind: 'absent' },
      }),
      /no secret item/,
    ],
    [
      'a governance item beside an ordinary one',
      {
        ...declaration('calendar', 'environment'),
        items: [
          ...declaration('calendar', 'environment').items,
          {
            ...declaration('calendar', 'environment').items[0]!,
            id: 'rule',
            category: 'governance',
          },
        ],
      },
      /no governance item/,
    ],
    [
      'a secret item beside an ordinary one',
      {
        ...declaration('calendar', 'environment'),
        items: [
          ...declaration('calendar', 'environment').items,
          {
            ...declaration('calendar', 'environment').items[0]!,
            id: 'key',
            category: 'binding',
            sensitivity: 'secret',
            default: { kind: 'absent' },
          },
        ],
      },
      /no secret item/,
    ],
  ])('%s throws and changes nothing', (_case, value, refusal) => {
    const { registry, point } = open()
    expect(() => point.contribute(value)).toThrow(refusal)
    expect(point.list()).toEqual([])
    expect(registry.snapshot().revision).toBe(0)
  })

  it('a closed or full registry throws and changes nothing', () => {
    const closed = open()
    closed.registry.close()
    expect(() => closed.point.contribute(declaration('calendar', 'environment'))).toThrow(
      /not registered: closing/,
    )
    expect(closed.point.list()).toEqual([])
    const full = open(1)
    full.point.contribute(declaration('calendar', 'environment'))
    expect(() => full.point.contribute(declaration('schedule', 'agent-authoring'))).toThrow(
      /not registered: limit_exceeded/,
    )
    expect(full.point.list()).toEqual([declaration('calendar', 'environment')])
  })

  it('withdrawing releases the lease; withdrawing twice changes nothing more', () => {
    const { registry, point } = open()
    const withdraw = point.contribute(declaration('calendar', 'environment'))
    withdraw()
    expect(point.list()).toEqual([])
    expect(registry.snapshot()).toEqual({ revision: 2, definitions: [] })
    withdraw()
    expect(registry.snapshot().revision).toBe(2)
    point.contribute(declaration('calendar', 'environment'))
    expect(point.list()).toEqual([declaration('calendar', 'environment')])
  })

  it('a withdrawn handle never withdraws the contribution that took its key afterwards', () => {
    const { point } = open()
    const first = point.contribute(declaration('calendar', 'environment'))
    first()
    point.contribute(declaration('calendar', 'environment'))
    first()
    expect(point.list()).toEqual([declaration('calendar', 'environment')])
  })

  it('lists by provider, then definition, in code-unit order', () => {
    const { point } = open()
    for (const [provider, definition] of [
      ['schedule', 'agent-authoring'],
      ['calendar', 'environment'],
      ['calendar', 'Zone'],
    ] as const)
      point.contribute(declaration(provider, definition))
    expect(point.list().map(d => [d.providerId, d.definitionId])).toEqual([
      ['calendar', 'Zone'],
      ['calendar', 'environment'],
      ['schedule', 'agent-authoring'],
    ])
  })

  it('the order does not depend on the order of contribution', () => {
    const keys = [
      ['d', 'x'],
      ['c', 'x'],
      ['b', 'x'],
      ['a', 'y'],
      ['a', 'x'],
    ] as const
    for (const order of [keys, [...keys].reverse()]) {
      const { point } = open()
      for (const [provider, definition] of order)
        point.contribute(declaration(provider, definition))
      expect(point.list().map(d => `${d.providerId}/${d.definitionId}`)).toEqual([
        'a/x',
        'a/y',
        'b/x',
        'c/x',
        'd/x',
      ])
    }
  })
})
