import { describe, expect, it } from 'vitest'
import { staticScopeOf } from '@omne-harness/static-scope-holder'
import { chainOf, contentOf, stepsBetween } from '../src/content.ts'
import { KIND, block, need, tenantA, tenantB } from './support.ts'

const A = block('test.a')
const B = block('test.b')
const at = (tenant = tenantA) => ({ scope: staticScopeOf(KIND, tenant), tenant })

function content(
  blocks: readonly ReturnType<typeof block>[],
  needs: ReturnType<typeof need>[] = [],
) {
  const result = contentOf({ blocks, needs })
  if ('failure' in result) throw new Error(result.failure)
  return result.ok
}

const commits = (...args: Parameters<typeof chainOf>) =>
  chainOf(...args).map(item => item.commit.commit)

describe('the registration chain of a static scope (CX-45)', () => {
  it('is the same for the same content, in whatever order the contributions came', () => {
    const forward = content([A, B], [need('n1', 'test.a'), need('n2', 'test.a')])
    const backward = content([B, A], [need('n2', 'test.a'), need('n1', 'test.a')])
    expect(chainOf(at(), forward)).toEqual(chainOf(at(), backward))
    expect([...forward.keys()]).toEqual(['test.a', 'test.b'])
  })

  it('chains each commit after the one before, from revision zero, adding every block as not required', () => {
    const chain = chainOf(at(), content([A, B]))
    expect(chain.map(item => item.change)).toMatchObject([
      { kind: 'add', key: 'test.a', basedOn: 0, creating: false, required: false },
      { kind: 'add', key: 'test.b', basedOn: 1, creating: false, required: false },
    ])
    const alone = commits(at(), content([B]))
    expect(commits(at(), content([A, B]))[1]).not.toBe(alone[0])
  })

  it('names a different first commit for each different content or tenant', () => {
    const variants = [
      commits(at(), content([A])),
      commits(at(tenantB), content([A])),
      commits(at(), content([block('test.a', { required: false })])),
      commits(at(), content([A], [need('n1', 'test.a')])),
      commits(at(), content([A], [need('n2', 'test.a')])),
      commits(at(), content([A], [need('n1', 'test.a', { translated: true })])),
      commits(at(), content([A], [need('n1', 'test.a', { consumer: 'extension' })])),
      commits(at(), content([A], [need('n1', 'test.a'), need('n2', 'test.a')])),
    ]
    expect(new Set(variants.map(chain => chain[0])).size).toBe(variants.length)
    expect(variants.every(chain => chain.length === 1)).toBe(true)
  })

  it('steps from what is registered to what is wanted: removals, then changes, then additions', () => {
    const before = content([A, B])
    const registered = new Map([...before].map(([key, entry]) => [key, entry.digest]))
    registered.set('test.z' as never, 'gone')
    registered.set('test.0' as never, 'gone')
    const wanted = content([B, block('test.c')], [need('n1', 'test.b')])
    expect(stepsBetween(registered, wanted).map(step => [step.kind, step.key])).toEqual([
      ['remove', 'test.0'],
      ['remove', 'test.a'],
      ['remove', 'test.z'],
      ['update', 'test.b'],
      ['add', 'test.c'],
    ])
    expect(stepsBetween(registered, before).map(step => step.kind)).toEqual(['remove', 'remove'])
  })
})
