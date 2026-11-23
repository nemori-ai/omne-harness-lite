import { describe, expect, it } from 'vitest'
import { declare } from '@omne-harness/dynamis'
import { createRevisions } from '@omne-harness/plugin-tools'
import { contract, registryOf } from './world.ts'

const declaring = (name: string) =>
  registryOf([name.split('.')[0] as string, [declare(contract(name))]])

describe('createRevisions', () => {
  it('numbers each recorded registry in this process', () => {
    const revisions = createRevisions({ process: 'p' })
    expect(revisions.current()).toBe('p.0')
    revisions.record(registryOf())
    revisions.record(declaring('a.one'))
    expect(revisions.current()).toBe('p.2')
    expect(revisions.since('p.1')).toEqual([
      expect.objectContaining({
        kind: 'point',
        sign: '+',
        point: 'a.one',
        side: 'server',
        by: 'a#1',
      }),
    ])
    expect(revisions.since('p.2')).toEqual([])
  })

  it('a removed point is a minus line', () => {
    const revisions = createRevisions({ process: 'p' })
    revisions.record(declaring('a.one'))
    revisions.record(registryOf())
    expect(revisions.since('p.1')).toEqual([
      expect.objectContaining({ kind: 'point', sign: '-', point: 'a.one', after: 'absent' }),
    ])
  })

  it('keeps the latest limit, dropping the earliest', () => {
    const revisions = createRevisions({ process: 'p', limit: 2 })
    for (const name of ['a.one', 'b.two', 'c.three']) revisions.record(declaring(name))
    expect(revisions.since('p.1')).toBe('unknown')
    expect(revisions.since('p.2')).toEqual([
      expect.objectContaining({ sign: '+', point: 'c.three' }),
      expect.objectContaining({ sign: '-', point: 'b.two' }),
    ])
  })

  it('keeps 64 by default', () => {
    const revisions = createRevisions({ process: 'p' })
    for (let at = 0; at < 65; at += 1) revisions.record(registryOf())
    expect(revisions.since('p.1')).toBe('unknown')
    expect(revisions.since('p.2')).toEqual([])
  })

  it.each(['q.1', 'p.x', 'p.', 'p.3', 'p.-1', 'p'])('%s is unknown', revision => {
    const revisions = createRevisions({ process: 'p' })
    revisions.record(registryOf())
    expect(revisions.since(revision)).toBe('unknown')
  })
})
