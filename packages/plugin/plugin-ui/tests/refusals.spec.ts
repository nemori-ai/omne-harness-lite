import { describe, expect, it } from 'vitest'
import type { Trouble } from '@omne-harness/shell-contract'
import { createRefusals, troublesOf } from '../src/refusals.ts'
import { beforeRevisionFour, beforeRevisionThree, reportsOf, type Reported } from '../src/report.ts'

const why = (given: string) => ({ at: ['city'], given, allows: 'a city the service knows' })

describe('what a plugin was refused lately', () => {
  it('keeps the last twenty of each plugin, tells each one, and a load of it again starts empty', () => {
    let told = 0
    let tick = 0
    const refusals = createRefusals(
      () => `2026-11-28T00:00:${String(tick++).padStart(2, '0')}Z`,
      () => void (told += 1),
    )
    for (let at = 0; at < 25; at += 1) refusals.note('weather', 'weather/v1/look', why(`"${at}"`))
    refusals.note('notes', 'notes/v1/add', why('"x"'))
    expect(told).toBe(26)
    const kept = refusals.of('weather')
    expect(kept).toHaveLength(20)
    expect(kept[0]).toEqual({
      at: '2026-11-28T00:00:05Z',
      target: 'weather/v1/look',
      rejection: why('"5"'),
    })
    expect(kept.at(-1)?.rejection.given).toBe('"24"')
    refusals.clear('weather')
    expect(refusals.of('weather')).toEqual([])
    expect(refusals.of('notes')).toHaveLength(1)
  })

  it('is said of each plugin that has any, and not said to a server before revision 4', () => {
    const refused = [
      { at: '2026-11-28T00:00:00Z', target: 'weather/v1/look', rejection: why('"P"') },
    ]
    const states = new Map([
      ['weather', { kind: 'loaded', version: 'v1' }],
      ['notes', { kind: 'loaded', version: 'v1' }],
    ] as const)
    const plugins = reportsOf(states as never, [], name => (name === 'weather' ? refused : []))
    expect(plugins).toEqual([
      { name: 'notes', version: 'v1', state: 'loaded', reason: null },
      { name: 'weather', version: 'v1', state: 'loaded', reason: null, refused },
    ])
    const reported: Reported = { plugins, points: [], parts: [] }
    for (const older of [beforeRevisionFour(reported), beforeRevisionThree(reported)])
      expect(older.plugins.every(plugin => !('refused' in plugin))).toBe(true)
  })
})

describe('what the host could not read, as the refused of the plugin that put it', () => {
  const icon = (id: string): Trouble => ({
    point: 'shell.pages',
    key: '',
    id,
    at: ['icon'],
    given: '"weather"',
    allows: 'a name the kit knows',
  })

  it('is said of the plugin that put the item, from the first time it was seen until it is gone', () => {
    const seen = new Map<string, string>()
    let now = '2026-11-28T01:00:00Z'
    const owner = (trouble: Trouble) => (trouble.id === 'weather' ? 'weather' : undefined)
    const first = troublesOf([icon('weather'), icon('home')], owner, seen, () => now)
    expect([...first]).toEqual([
      [
        'weather',
        [
          {
            at: '2026-11-28T01:00:00Z',
            target: 'shell.pages「weather」',
            rejection: { at: ['icon'], given: '"weather"', allows: 'a name the kit knows' },
          },
        ],
      ],
    ])
    now = '2026-11-28T02:00:00Z'
    expect(troublesOf([icon('weather')], owner, seen, () => now).get('weather')?.[0]?.at).toBe(
      '2026-11-28T01:00:00Z',
    )
    expect([...troublesOf([], owner, seen, () => now)]).toEqual([])
    expect(troublesOf([icon('weather')], owner, seen, () => now).get('weather')?.[0]?.at).toBe(
      '2026-11-28T02:00:00Z',
    )
  })
})
