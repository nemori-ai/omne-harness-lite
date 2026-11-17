import { describe, expect, it } from 'vitest'
import { createSkillCatalog } from '@omne-harness/skill'
import { isSkillName, sameCapability } from '@omne-harness/skill-contract'
import type { SkillReadCheck } from '@omne-harness/skill-contract/provider'
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

const ranking = { k1: 1.2, b: 0.75 }

type Sample = Readonly<{ name: string; description?: string; readable?: boolean }>

function catalogOf(samples: readonly Sample[]) {
  const checked: string[] = []
  const resolution = createMemoryResolution<Principal, Scope>(
    samples.map(sample => ({
      capability: capability(sample.name),
      visible: () => true,
      state: {
        kind: 'adopted',
        current: {
          ref: { capability: capability(sample.name), layer: 'tenant', locator: reviewLocator },
          declared: {
            name: granted(isSkillName, sample.name),
            ...(sample.description === undefined ? {} : { description: sample.description }),
            tools: [],
          },
        },
      },
    })),
  )
  const readCheck: SkillReadCheck<Principal, Scope> = {
    async check(_who, _at, item) {
      checked.push(item.name)
      const sample = samples.find(candidate => sameCapability(capability(candidate.name), item))
      return sample?.readable === false ? { kind: 'refused' } : { kind: 'granted' }
    },
  }
  const catalog = createSkillCatalog({ resolution, readCheck }, { ranking })
  return {
    checked,
    async search(text: string) {
      const answer = await catalog.search(alice, scope, { text })
      if (!('ok' in answer)) throw new Error('search answered unknown')
      return answer.ok.map(entry => entry.name)
    },
  }
}

const library: readonly Sample[] = [
  { name: 'weekly-report', description: '生成周报：每周五汇总本周的提交与卡片' },
  { name: 'invoice-sorter', description: '整理发票：把发票按月归档' },
  { name: 'meeting-notes', description: 'Write meeting notes from a recording' },
]

describe('Skill search ranks by relevance with the shared BM25 rules', () => {
  it('finds the weekly report Skill for a Chinese request that shares characters with its description', async () => {
    expect(await catalogOf(library).search('帮我出周报')).toEqual(['weekly-report'])
  })

  it('matches the name and the description in English, case-insensitively', async () => {
    const search = catalogOf(library)
    expect(await search.search('Meeting')).toEqual(['meeting-notes'])
    expect(await search.search('RECORDING')).toEqual(['meeting-notes'])
    expect(await search.search('invoice')).toEqual(['invoice-sorter'])
  })

  it('puts the better match first and keeps every Skill that shares a word with the query', async () => {
    const search = catalogOf([
      { name: 'notes', description: 'notes' },
      { name: 'meeting-notes', description: 'meeting notes and meeting actions' },
      { name: 'unrelated', description: 'something else' },
    ])
    expect(await search.search('meeting notes')).toEqual(['meeting-notes', 'notes'])
  })

  it('orders equal scores by name', async () => {
    const search = catalogOf([
      { name: 'zeta', description: 'shared word' },
      { name: 'alpha', description: 'shared word' },
      { name: 'mid', description: 'shared word' },
    ])
    expect(await search.search('shared')).toEqual(['alpha', 'mid', 'zeta'])
  })

  it('lists every Skill by name for an empty query', async () => {
    expect(await catalogOf(library).search('  ')).toEqual([
      'invoice-sorter',
      'meeting-notes',
      'weekly-report',
    ])
  })

  it('checks the read permission only of Skills that score above zero', async () => {
    const search = catalogOf(library)
    expect(await search.search('发票')).toEqual(['invoice-sorter'])
    expect(search.checked).toEqual(['invoice-sorter'])
  })

  it('ranks only among the Skills the reader may read, so an unreadable Skill does not move the order', async () => {
    const readable: Sample[] = [
      { name: 'aaa', description: 'meeting' },
      { name: 'bbb', description: 'notes notes' },
    ]
    const hidden: Sample = { name: 'hidden', description: 'notes notes plan', readable: false }
    expect(await catalogOf(readable).search('meeting notes')).toEqual(['bbb', 'aaa'])
    expect(await catalogOf([...readable, hidden]).search('meeting notes')).toEqual(['bbb', 'aaa'])
  })

  it('finds a Skill without a description by its name only', async () => {
    const search = catalogOf([{ name: 'bare-skill' }])
    expect(await search.search('bare')).toEqual(['bare-skill'])
    expect(await search.search('here')).toEqual([])
  })

  it('refuses ranking parameters out of range when the catalog is made', () => {
    const resolution = createMemoryResolution<Principal, Scope>([])
    const readCheck: SkillReadCheck<Principal, Scope> = { check: async () => ({ kind: 'granted' }) }
    expect(() =>
      createSkillCatalog({ resolution, readCheck }, { ranking: { k1: 0, b: 0.75 } }),
    ).toThrow(TypeError)
    expect(() =>
      createSkillCatalog({ resolution, readCheck }, { ranking: { k1: 1.2, b: 2 } }),
    ).toThrow(TypeError)
  })
})
