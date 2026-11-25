import { describe, expect, it, vi } from 'vitest'
import { createSkillCatalog } from '@omne-harness/skill'
import { isSkillName } from '@omne-harness/skill-contract'
import { createMemoryResolution } from '@omne-harness/skill-contract/testing'
import {
  alice,
  capability,
  granted,
  reviewLocator,
  scope,
  type Principal,
  type Scope,
} from './access-world.ts'

const built = vi.hoisted(() => ({ corpora: 0 }))
vi.mock('@omne-harness/text-search', async importOriginal => {
  const actual = await importOriginal<typeof import('@omne-harness/text-search')>()
  return {
    ...actual,
    buildCorpus: (...args: Parameters<typeof actual.buildCorpus>) => {
      built.corpora += 1
      return actual.buildCorpus(...args)
    },
  }
})

const ranking = { k1: 1.2, b: 0.75 }

function catalogOver(described: () => string) {
  const resolution = createMemoryResolution<Principal, Scope>(
    ['weekly-report', 'meeting-notes'].map(name => ({
      capability: capability(name),
      visible: () => true,
      get state() {
        return {
          kind: 'adopted' as const,
          current: {
            ref: { capability: capability(name), layer: 'tenant' as const, locator: reviewLocator },
            declared: { name: granted(isSkillName, name), description: described(), tools: [] },
          },
        }
      },
    })),
  )
  const catalog = createSkillCatalog(
    { resolution, readCheck: { check: async () => ({ kind: 'granted' }) } },
    { ranking },
  )
  return (text: string) => catalog.search(alice, scope, { text })
}

describe('the search corpus is built once for the same documents', () => {
  it('builds no corpus for a second search with the same Skills and the same words', async () => {
    const search = catalogOver(() => 'weekly notes')
    const first = await search('notes')
    const before = built.corpora
    expect(await search('notes')).toEqual(first)
    expect(built.corpora).toBe(before)
  })

  it('builds the corpus again once a description changes, and ranks by the new one', async () => {
    let description = 'gathers plover sightings'
    const search = catalogOver(() => description)
    expect(await search('plover')).toMatchObject({ ok: [{}, {}] })
    const before = built.corpora
    description = 'a summary of the week'
    expect(await search('plover')).toEqual({ ok: [] })
    expect(built.corpora).toBeGreaterThan(before)
  })
})
