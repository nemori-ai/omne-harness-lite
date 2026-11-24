import {
  complete,
  indexOf,
  judge,
  lookupOf,
  recognize,
  search,
  viewOf,
} from '@omne-harness/slash-command-contract'
import { describe, expect, it } from 'vitest'
import { entries } from './fixture.ts'

const all = lookupOf({ entries, missing: [] })
const without = (name: string) =>
  lookupOf({
    entries: entries.filter(entry => `${entry.space}:${entry.name}` !== name),
    missing: [],
  })

describe('the accepting side', () => {
  it('takes what the sender was shown when the list did not change', () => {
    const shown = viewOf(recognize('先 /review 再 /deploy-check，再 /review', all))
    expect(shown).toEqual({ command: null, references: ['skill:review', 'skill:deploy-check'] })
    expect(judge('先 /review 再 /deploy-check，再 /review', all, shown).kind).toBe('accepted')
  })

  it('refuses the whole input and says what changed when an entry went away before intake', () => {
    const shown = viewOf(recognize('帮我用 /review 看一下', all))
    expect(judge('帮我用 /review 看一下', without('skill:review'), shown)).toEqual({
      kind: 'changed',
      was: { command: null, references: ['skill:review'] },
      now: { command: null, references: [] },
    })
  })

  it('takes what it recognizes when the sender showed nothing', () => {
    expect(judge('帮我用 /review 看一下', without('skill:review'))).toMatchObject({
      kind: 'accepted',
      view: { references: [] },
    })
  })

  it('answers the same for a name nobody may see and a name that does not exist', () => {
    expect(judge('/secret-skill 用一下', all)).toEqual({
      kind: 'refused',
      reason: 'no-such-command',
      name: 'secret-skill',
    })
    expect(judge('/omne-official:compact', all)).toEqual({
      kind: 'refused',
      reason: 'unavailable',
      name: 'omne-official:compact',
      why: '一轮在跑，等它结束',
    })
  })

  it('drops both entries that claim one full name', () => {
    const twice = lookupOf({
      entries: [...entries, { space: 'skill', name: 'review', kind: 'reference', title: '另一份' }],
      missing: ['plugin'],
    })
    expect(twice.mid.has('review')).toBe(false)
    expect(twice.missing).toEqual(['plugin'])
  })
})

describe('completion', () => {
  const index = indexOf(all)

  it('ranks by tier: exact, prefix, a later part, first letters, the title', () => {
    expect(search(index, 'review', 'mid').items.map(item => [item.entry.full, item.tier])).toEqual([
      ['skill:review', 0],
      ['skill:code-review', 2],
    ])
    expect(search(index, 'dc', 'mid').items.map(item => item.entry.full)).toEqual([
      'skill:deploy-check',
    ])
    expect(search(index, '周报', 'mid').items.map(item => [item.entry.full, item.tier])).toEqual([
      ['skill:status', 4],
    ])
  })

  it('lists commands only at the head, and spells a shadowed skill by its full name there', () => {
    const atHead = complete('/sta', 4, index, all)
    expect(atHead?.items.map(item => item.shown)).toEqual(['status', 'skill:status'])
    expect(complete('看 /sta', 6, index, all)?.items.map(item => item.shown)).toEqual(['status'])
  })

  it('offers nothing inside the argument of a command', () => {
    expect(complete('/commit 参考 /re', 14, index, all)).toBeNull()
  })
})
