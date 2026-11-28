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
