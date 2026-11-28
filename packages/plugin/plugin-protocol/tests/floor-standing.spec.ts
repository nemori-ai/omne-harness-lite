import { describe, expect, it } from 'vitest'
import { fiberOf, heldOf, standingOf } from '../src/floor.ts'

describe('the names the floor keeps', () => {
  it('are the plugin and its version, and read back to the two', () => {
    expect(fiberOf('brand', 'v1')).toBe('plugin:brand@v1')
    expect(heldOf(['plugin:brand@v1', 'plugin:two-words@0123abcd'])).toEqual(
      new Map([
        ['brand', 'v1'],
        ['two-words', '0123abcd'],
      ]),
    )
  })

  it('leave out what is not such a name', () => {
    expect(
      heldOf(['session-ui', 'xplugin:brand@v1', 'plugin:brand@v1@', 'plugin:brand']).size,
    ).toBe(0)
  })
})

describe('what the states of the loader come to for the floor', () => {
  it('keeps what is loaded, what is being loaded and what is held; a failed one is not kept', () => {
    const standing = standingOf(
      new Map([
        ['a', { kind: 'loaded', version: 'v1' }],
        ['b', { kind: 'held', version: 'v2' }],
        ['c', { kind: 'failed', version: 'v3', reason: 'broke' }],
      ]),
    )
    expect([...standing.wanted].sort()).toEqual(['plugin:a@v1', 'plugin:b@v2'])
    expect([...standing.held]).toEqual(['plugin:b@v2'])
    expect(standing.loading).toBe(false)
  })

  it('keeps the older generation as well while the new one is being loaded', () => {
    const changing = standingOf(
      new Map([['a', { kind: 'loading', version: 'v2', next: 'keep', over: 'v1' }]]),
    )
    expect([...changing.wanted].sort()).toEqual(['plugin:a@v1', 'plugin:a@v2'])
    expect(changing.loading).toBe(true)
    const first = standingOf(new Map([['a', { kind: 'loading', version: 'v2', next: 'keep' }]]))
    expect([...first.wanted]).toEqual(['plugin:a@v2'])
  })
})
