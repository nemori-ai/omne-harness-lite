import {
  accept,
  complete,
  fullName,
  indexOf,
  judge,
  lookupOf,
  recognize,
  viewOf,
} from '@omne-harness/slash-command-contract'
import { expect, it } from 'vitest'
import { entries } from './fixture.ts'

const all = lookupOf({ entries, missing: [] })
const index = indexOf(all)
const pieces = [
  '/',
  '\\',
  ' ',
  '\n',
  '`',
  '```',
  '。',
  '，',
  '用',
  '看',
  'a',
  'Z',
  '9',
  '-',
  ':',
  '.',
  '_',
  '(',
  ')',
  'http://',
  're',
  'view',
  'review',
  'tmp',
  'commit',
  'reload',
  'status',
  'skill:',
  'omne-official:',
  'prompt:',
  'nope',
  'old-style',
  'secret-skill',
  '@',
  '#',
  '=',
  '*',
  '<',
  '>',
]

function random(seed: number): (n: number) => number {
  let state = seed
  return n => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) % n
  }
}

it('seven properties hold on random inputs, and the inputs are really different', () => {
  const pick = random(20261124)
  const text = (): string =>
    Array.from({ length: 1 + pick(7) }, () => pieces[pick(pieces.length)]).join('')
  const broken: Record<string, string[]> = {
    noSlashNoCommand: [],
    allEscapedIsText: [],
    unchangedShownIsTaken: [],
    changedIsRefused: [],
    removedNeverBinds: [],
    spansSpellTheirEntry: [],
    takenCompletionIsSeen: [],
  }
  const distinct = new Set<string>()
  const total = 300_000
  for (let n = 0; n < total; n += 1) {
    const input = text()
    distinct.add(input)
    const now = recognize(input, all)
    if (!input.includes('/') && now.kind !== 'message') broken['noSlashNoCommand']?.push(input)
    if (now.kind === 'message' && !input.includes('/') && now.references.length > 0)
      broken['noSlashNoCommand']?.push(input)
    const escaped = recognize(input.replaceAll('\\', '').replaceAll('/', '\\/'), all)
    if (escaped.kind !== 'message' || escaped.references.length > 0)
      broken['allEscapedIsText']?.push(input)
    if (now.kind === 'message')
      for (const reference of now.references)
        if (
          input[reference.span[0]] !== '/' ||
          all.mid.get(input.slice(reference.span[0] + 1, reference.span[1]).toLowerCase())?.full !==
            reference.name
        )
          broken['spansSpellTheirEntry']?.push(input)
    if (now.kind !== 'refused' && judge(input, all, viewOf(now)).kind !== 'accepted')
      broken['unchangedShownIsTaken']?.push(input)
    const gone = entries[pick(entries.length)]
    if (gone === undefined) continue
    const less = lookupOf({ entries: entries.filter(entry => entry !== gone), missing: [] })
    const after = viewOf(recognize(input, less))
    if (after.command === fullName(gone) || after.references.includes(fullName(gone)))
      broken['removedNeverBinds']?.push(input)
    const before = viewOf(now)
    const changed = JSON.stringify(before) !== JSON.stringify(after)
    if (changed && judge(input, less, before).kind === 'accepted')
      broken['changedIsRefused']?.push(input)
  }
  let taken = 0
  for (let n = 0; n < 80_000; n += 1) {
    const head = pick(3) === 0 ? '' : text().replaceAll('/', '')
    const tail = pick(3) === 0 ? '' : text()
    const typed =
      ['r', 're', 'rev', 'de', 't', 'co', 'rel', 'st', 'sta', 'skill:s', ''][pick(11)] ?? ''
    const input = `${head}/${typed}${tail}`
    const hit = complete(input, head.length + 1 + typed.length, index, all)
    const item = hit?.items[pick(Math.max(hit.items.length, 1))]
    if (hit === null || item === undefined || item.entry.unavailable !== undefined) continue
    taken += 1
    const after = recognize(accept(input, hit, item).text, all)
    const seen =
      (after.kind === 'command' && after.name === item.entry.full) ||
      (after.kind === 'message' &&
        after.references.some(reference => reference.name === item.entry.full))
    if (!seen) broken['takenCompletionIsSeen']?.push(input)
  }
  console.log(`random inputs ${total}, distinct ${distinct.size}, completions taken ${taken}`)
  expect(distinct.size).toBeGreaterThan(150_000)
  expect(taken).toBeGreaterThan(20_000)
  expect(
    Object.fromEntries(Object.entries(broken).map(([name, found]) => [name, found.slice(0, 3)])),
  ).toEqual(Object.fromEntries(Object.keys(broken).map(name => [name, []])))
})
