import {
  type CommandEntry,
  indexOf,
  lookupOf,
  search,
  tierOf,
  TIERS,
} from '@omne-harness/slash-command-contract'
import { describe, expect, it } from 'vitest'

describe('the tier a name falls in for a query', () => {
  it('has seven tiers, most alike first', () => {
    expect(TIERS).toEqual([
      '一模一样',
      '开头相同',
      '某一段的开头',
      '名字里任意位置有',
      '各段的首字母',
      '字母按顺序跳着出现',
      '说明里有',
    ])
  })

  it.each([
    ['review', 'review', 0],
    ['rev', 'review', 1],
    ['', 'review', 1],
    ['review', 'code-review', 2],
    ['auth', 'skin-authoring', 2],
    ['thor', 'skin-authoring', 3],
    ['oring', 'skin-authoring', 3],
    ['in-au', 'skin-authoring', 3],
    ['sa', 'skin-authoring', 4],
    ['dc', 'deploy-check', 4],
    ['sknauth', 'skin-authoring', 5],
    ['kauth', 'skin-authoring', 5],
    ['ka', 'skin-authoring', null],
    ['zz', 'skin-authoring', null],
    ['skin-authoringx', 'skin-authoring', null],
  ] as const)('%j in %j is tier %j', (query, name, tier) => {
    expect(tierOf(query, name, '-')).toBe(tier)
  })

  it.each([
    ['astra', 'openai/gpt-6-astra', 2],
    ['gpt', 'openai/gpt-6-astra', 2],
    ['6-ast', 'openai/gpt-6-astra', 2],
    ['pena', 'openai/gpt-6-astra', 3],
    ['og6a', 'openai/gpt-6-astra', 4],
    ['oga', 'openai/gpt-6-astra', 5],
  ] as const)('with / as a separator too, %j in %j is tier %j', (query, name, tier) => {
    expect(tierOf(query, name, '-/')).toBe(tier)
  })
})

const skill = (name: string, title = name): CommandEntry => ({
  space: 'skill',
  name,
  kind: 'reference',
  title,
})

describe('searching the list', () => {
  const index = indexOf(
    lookupOf({
      entries: [
        skill('skin-authoring', 'How a skin is written'),
        skill('skill-authoring', 'How a skill is written'),
        skill('thorough'),
        skill('code-review'),
        skill('status', '周报'),
      ],
      missing: [],
    }),
  )
  const found = (query: string) =>
    search(index, query, 'mid', 20).items.map(item => [item.entry.name, item.tier])

  it('finds a name by any run of its letters, and ranks a prefix above a run inside', () => {
    expect(found('thor')).toEqual([
      ['thorough', 1],
      ['skin-authoring', 3],
      ['skill-authoring', 3],
    ])
    expect(found('oring')).toEqual([
      ['skin-authoring', 3],
      ['skill-authoring', 3],
    ])
  })

  it('finds a name by letters that come in order, and by the title last', () => {
    expect(found('sknauth')).toEqual([['skin-authoring', 5]])
    expect(found('周报')).toEqual([['status', 6]])
    expect(found('written')).toEqual([
      ['skin-authoring', 6],
      ['skill-authoring', 6],
    ])
  })
})
