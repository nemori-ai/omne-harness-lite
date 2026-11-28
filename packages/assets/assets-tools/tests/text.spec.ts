import { memberName } from '@omne-harness/plugin-protocol'
import { describe, expect, it } from 'vitest'
import { impactLine, placedLines } from '../src/text.ts'

const weather = {
  point: 'shell.pages',
  key: '',
  id: 'weather',
  title: '天气',
  pointTitle: '一级页面',
} as const

describe('OmneExtensions names a member as memberName does, as the Plugin page does', () => {
  it('in a line of an impact', () => {
    expect(impactLine({ ...weather, mark: '-', of: null, says: '' })).toBe(
      `  - ${memberName(weather)}   `,
    )
    expect(memberName(weather)).toBe('「天气」（一级页面）')
  })

  it('in a line of where it is placed', () => {
    const placed = placedLines({
      kind: 'placed',
      places: [{ ...weather, side: 'client', standing: 'in effect', says: '' }],
      clients: null,
      advice: null,
    })
    expect(placed).toEqual(['places:', `  ${memberName(weather)}   [in effect]`])
  })
})

describe('OmneExtensions show says what each client refused of a plugin lately', () => {
  it('under the client, one line each: when, what, where, what was given, what is allowed', () => {
    const placed = placedLines({
      kind: 'placed',
      places: [],
      clients: [
        {
          label: 'desktop-1, connected',
          says: 'loaded',
          refused: [
            {
              at: '2026-11-28T06:00:00.000Z',
              target: 'weather/v1/look',
              rejection: { at: ['days'], given: '30', allows: 'a whole number from 1 to 7' },
            },
          ],
        },
        { label: 'laptop, connected', says: 'loaded' },
      ],
      advice: null,
    })
    expect(placed).toEqual([
      'places: none',
      'clients:',
      '  desktop-1, connected   loaded',
      '    refused:',
      '      2026-11-28T06:00:00.000Z   weather/v1/look   days is 30; allows a whole number from 1 to 7',
      '  laptop, connected      loaded',
    ])
  })
})
