import {
  type CommandEntry,
  indexOf,
  lookupOf,
  search,
  tierOf,
} from '@omne-harness/slash-command-contract'
import { expect, it } from 'vitest'

function random(seed: number): (n: number) => number {
  let state = seed
  return n => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) % n
  }
}

const LETTERS = 'abcdeiknorst'

it('any run of a name finds it; the tiers that were there before stay first; an empty query ranks as before; and the inputs differ', () => {
  const pick = random(20261125)
  const word = () =>
    Array.from({ length: 1 + pick(5) }, () => LETTERS[pick(LETTERS.length)]).join('')
  const name = () => Array.from({ length: 1 + pick(3) }, word).join('-')
  const broken: Record<string, string[]> = { runFinds: [], oldFirst: [], emptyOrder: [] }
  const distinct = new Set<string>()
  const total = 4000
  for (let n = 0; n < total; n += 1) {
    const names = [...new Set(Array.from({ length: 2 + pick(10) }, name))]
    const entries: CommandEntry[] = names.map(each => ({
      space: 'skill',
      name: each,
      kind: 'reference',
      title: each,
    }))
    const index = indexOf(lookupOf({ entries, missing: [] }))
    const target = names[pick(names.length)]!
    const from = pick(target.length)
    const query = target.slice(from, from + 1 + pick(target.length - from))
    distinct.add(`${names.join(',')}|${query}`)
    const all = search(index, query, 'mid', 1000).items
    if (!all.some(item => item.entry.name === target))
      broken['runFinds']?.push(`${target}|${query}`)
    const old = all.filter(item => item.tier <= 2)
    const top = search(index, query, 'mid', 8).items
    const kept = old.slice(0, 8).map(item => item.entry.name)
    if (
      top
        .slice(0, kept.length)
        .map(item => item.entry.name)
        .join() !== kept.join()
    )
      broken['oldFirst']?.push(query)
    for (const item of all)
      if (
        tierOf(query, item.entry.name, '-') !== item.tier &&
        item.tier !== 6 &&
        !(item.tier === 2 && item.entry.full.startsWith(query))
      )
        broken['oldFirst']?.push(`${query}:${item.entry.name}`)
    const empty = search(index, '', 'mid', 1000).items.map(item => item.entry.name)
    if (empty.join() !== [...names].sort().join()) broken['emptyOrder']?.push(names.join())
  }
  console.log(`matching inputs ${total}, distinct ${distinct.size}`)
  expect(distinct.size).toBeGreaterThan(3900)
  expect(broken).toEqual({ runFinds: [], oldFirst: [], emptyOrder: [] })
})
