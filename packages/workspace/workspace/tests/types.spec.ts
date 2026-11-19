import { describe, expect, it } from 'vitest'
import { createManagementTypes } from '@omne-harness/workspace'
import { fakeWorld } from '@omne-harness/workspace/testing'

describe('management types are contributions', () => {
  it('orders the types so that the one that extends the most is first', () => {
    const things = fakeWorld()
    const types = createManagementTypes()
    types.contribute(things.type('base'))
    types.contribute(things.type('leaf', { extends: 'middle' }))
    types.contribute(things.type('middle', { extends: 'base' }))
    types.contribute(things.type('aside'))
    expect(types.specificFirst().map(type => type.name)).toEqual([
      'leaf',
      'middle',
      'aside',
      'base',
    ])
  })

  it('counts every type a type extends, and a cycle no further than itself', () => {
    const things = fakeWorld()
    const types = createManagementTypes()
    types.contribute(things.type('a-middle', { extends: 'root' }))
    types.contribute(things.type('z-leaf', { extends: 'a-middle' }))
    types.contribute(things.type('root'))
    types.contribute(things.type('ring-a', { extends: 'ring-b' }))
    types.contribute(things.type('ring-b', { extends: 'ring-a' }))
    expect(types.specificFirst().map(type => type.name)).toEqual([
      'z-leaf',
      'a-middle',
      'ring-a',
      'ring-b',
      'root',
    ])
  })

  it('a second type of the same name is an assembly error', () => {
    const things = fakeWorld()
    const types = createManagementTypes()
    types.contribute(things.type('base'))
    expect(() => types.contribute(things.type('base'))).toThrow(/already contributed/)
  })

  it('releasing withdraws that contribution and no other', () => {
    const things = fakeWorld()
    const types = createManagementTypes()
    const base = types.contribute(things.type('base'))
    types.contribute(things.type('other'))
    base.release()
    base.release()
    expect(types.named('base')).toBeNull()
    expect(types.specificFirst().map(type => type.name)).toEqual(['other'])
    const again = things.type('base')
    types.contribute(again)
    base.release()
    expect(types.named('base')).toBe(again)
  })

  it('a type that extends itself, or a type that is not there, still has an order', () => {
    const things = fakeWorld()
    const types = createManagementTypes()
    types.contribute(things.type('loop', { extends: 'loop' }))
    types.contribute(things.type('orphan', { extends: 'missing' }))
    expect(types.specificFirst().map(type => type.name)).toEqual(['orphan', 'loop'])
  })
})
