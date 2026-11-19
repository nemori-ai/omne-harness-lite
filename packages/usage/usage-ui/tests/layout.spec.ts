import { describe, expect, it } from 'vitest'
import {
  addTo,
  arrange,
  layoutOf,
  layoutsOf,
  moveAt,
  pick,
  presentAt,
  removeAt,
  resizeAt,
  type Layout,
} from '../src/model/layout.ts'
import { storedLayouts, USAGE_LAYOUTS_KEY } from '../src/model/stored.ts'

const item = (widget: string, presentation: string | null = null) => ({
  widget,
  width: 1 as const,
  presentation,
})

describe('what each item of a layout draws, by the rows of T8 (C28)', () => {
  it('shows the registered widgets in layout order and a placeholder for one no longer registered', () => {
    expect(
      arrange(
        [item('tokens'), item('removed'), item('summary')],
        new Set(['summary', 'tokens', 'extra']),
      ),
    ).toEqual([
      { kind: 'present', item: item('tokens'), index: 0 },
      { kind: 'missing', item: item('removed'), index: 1 },
      { kind: 'present', item: item('summary'), index: 2 },
    ])
  })

  it('draws the chosen presentation, else the default the widget declares with a note, else nothing', () => {
    const shape = new Set(['bars', 'lines'])
    expect(pick('lines', 'bars', shape)).toEqual({ kind: 'chosen', presentation: 'lines' })
    expect(pick(null, 'bars', shape)).toEqual({ kind: 'chosen', presentation: 'bars' })
    expect(pick('gone', 'bars', shape)).toEqual({ kind: 'fallback', presentation: 'bars' })
    expect(pick('bars', 'bars', shape)).toEqual({ kind: 'chosen', presentation: 'bars' })
    expect(pick('gone', 'missing', shape)).toEqual({ kind: 'undrawable' })
    expect(pick(null, 'missing', shape)).toEqual({ kind: 'undrawable' })
  })
})

describe('the three sources of a layout', () => {
  const module = { tenant: [item('tokens')], session: [item('summary')] }
  const assembly = { tenant: [item('summary')] }
  const user = { session: [item('tokens', 'lines')] }

  it('takes the user over the assembly over the module, whole and per position', () => {
    expect(layoutOf('tenant', { module, assembly, user })).toEqual([item('summary')])
    expect(layoutOf('session', { module, assembly, user })).toEqual([item('tokens', 'lines')])
    expect(layoutOf('tenant', { module })).toEqual([item('tokens')])
    expect(layoutOf('status', { module, assembly, user })).toEqual([])
  })
})

describe('editing a layout', () => {
  const layout: Layout = [item('a'), item('b'), item('c')]

  it('adds at the end with the widget width, removes, moves within bounds, resizes and presents', () => {
    expect(addTo(layout, 'd')).toEqual([...layout, { widget: 'd', width: 1, presentation: null }])
    expect(addTo(layout, 'd', 3).at(-1)).toEqual({ widget: 'd', width: 3, presentation: null })
    expect(removeAt(layout, 1).map(entry => entry.widget)).toEqual(['a', 'c'])
    expect(moveAt(layout, 1, -1).map(entry => entry.widget)).toEqual(['b', 'a', 'c'])
    expect(moveAt(layout, 1, 1).map(entry => entry.widget)).toEqual(['a', 'c', 'b'])
    expect(moveAt(layout, 0, -1)).toBe(layout)
    expect(moveAt(layout, 2, 1)).toBe(layout)
    expect(moveAt(layout, 5, -1)).toBe(layout)
    expect(moveAt(layout, 3, -1)).toBe(layout)
    expect(moveAt(layout, -1, 1)).toBe(layout)
    expect(presentAt(layout, 0, 'lines').slice(1)).toEqual(layout.slice(1))
    expect(resizeAt(layout, 2, 3).slice(0, 2)).toEqual(layout.slice(0, 2))
    expect(resizeAt(layout, 2, 3)[2]).toEqual({ widget: 'c', width: 3, presentation: null })
    expect(presentAt(layout, 0, 'lines')[0]).toEqual({
      widget: 'a',
      width: 1,
      presentation: 'lines',
    })
    expect(layout.map(entry => entry.widget)).toEqual(['a', 'b', 'c'])
  })

  it('reads back stored layouts and leaves out a position whose items are not of the shape', () => {
    expect(
      layoutsOf({
        tenant: [item('a', 'lines'), { widget: 'b', width: 2, presentation: null }],
        session: [{ widget: 'a', width: 4, presentation: null }],
        status: 'x',
        other: [item('a')],
      }),
    ).toEqual({ tenant: [item('a', 'lines'), { widget: 'b', width: 2, presentation: null }] })
    for (const broken of [null, 'x', 3, [{ widget: '' }]]) expect(layoutsOf(broken)).toEqual({})
    for (const bad of [
      null,
      5,
      'a',
      { widget: '', width: 1, presentation: null },
      { widget: 7, width: 1, presentation: null },
    ])
      expect(layoutsOf({ tenant: [item('a'), bad] }), JSON.stringify(bad)).toEqual({})
    expect(layoutsOf({ tenant: [{ widget: 'a', width: 1, presentation: 5 }] })).toEqual({})
  })
})

describe('layouts kept in a preference store', () => {
  it('writes them under one key and reads them back, a broken or unreadable value as none', () => {
    expect(USAGE_LAYOUTS_KEY).toBe('omne.usage-layouts')
    const kept = new Map<string, string>()
    const store = {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => void kept.set(key, value),
    }
    const layouts = storedLayouts(() => store)
    expect(layouts.read()).toEqual({})
    layouts.write({ tenant: [item('a', 'lines')] })
    expect(JSON.parse(kept.get(USAGE_LAYOUTS_KEY) ?? 'null')).toEqual({
      tenant: [item('a', 'lines')],
    })
    expect(layouts.read()).toEqual({ tenant: [item('a', 'lines')] })
    kept.set(USAGE_LAYOUTS_KEY, '{not json')
    expect(layouts.read()).toEqual({})
    const failing = storedLayouts(() => {
      throw new Error('no storage')
    })
    expect(failing.read()).toEqual({})
    expect(() => failing.write({})).not.toThrow()
  })
})
