import { describe, expect, it } from 'vitest'
import {
  forkPointAfterRows,
  forkPointText,
  judgeForkPoint,
  ownPositionAfter,
  parseForkPoint,
  type ForkFacts,
  type ForkPoint,
} from '@omne-harness/session-contract'

const POINT: ForkPoint = { epoch: 'key/epoch:0', upper: '4', position: '40' }
const FACTS: ForkFacts = {
  rows: '6',
  next: 'assistant',
  current: true,
  running: true,
  floor: '38',
  tail: '44',
}

type Cell = Readonly<{
  name: string
  point?: Partial<ForkPoint>
  facts?: Partial<ForkFacts>
  answer: ReturnType<typeof judgeForkPoint>
}>

const CELLS: readonly Cell[] = [
  { name: 'the rows before an assistant message are a boundary', answer: 'boundary' },
  {
    name: 'the whole view of an idle source is a boundary',
    point: { upper: '6' },
    facts: { next: null, running: false },
    answer: 'boundary',
  },
  {
    name: 'the whole view is no boundary while a Run of the source is unfinished',
    point: { upper: '6' },
    facts: { next: null, running: true },
    answer: 'not-a-boundary',
  },
  {
    name: 'the whole of an epoch the source left is no boundary',
    point: { upper: '6' },
    facts: { next: null, running: false, current: false },
    answer: 'not-a-boundary',
  },
  {
    name: 'rows before a tool message are no boundary',
    facts: { next: 'tool' },
    answer: 'not-a-boundary',
  },
  {
    name: 'rows before a user message are no boundary',
    facts: { next: 'user' },
    answer: 'not-a-boundary',
  },
  {
    name: 'an epoch the source never had is refused',
    facts: { rows: null },
    answer: 'unknown-epoch',
  },
  {
    name: 'an upper bound past the rows of the epoch is refused',
    point: { upper: '7' },
    answer: 'out-of-bounds',
  },
  { name: 'no row at all is refused', point: { upper: '0' }, answer: 'out-of-bounds' },
  {
    name: 'an upper bound that is no number is refused',
    point: { upper: 'x' },
    answer: 'out-of-bounds',
  },
  {
    name: 'a position past the log of the source is refused',
    point: { position: '45' },
    answer: 'out-of-bounds',
  },
  {
    name: 'a position below an entry of the prefix is refused',
    point: { position: '37' },
    answer: 'out-of-bounds',
  },
  {
    name: 'the position of the last entry of the prefix is accepted',
    point: { position: '38' },
    answer: 'boundary',
  },
  {
    name: 'the tail of the source log is accepted',
    point: { position: '44' },
    answer: 'boundary',
  },
  {
    name: 'an upper bound with a number in it is refused',
    point: { upper: '4x' },
    answer: 'out-of-bounds',
  },
  {
    name: 'an upper bound that ends in a number is refused',
    point: { upper: 'x4' },
    answer: 'out-of-bounds',
  },
  {
    name: 'a position that starts as a number is refused',
    point: { position: '40x' },
    answer: 'out-of-bounds',
  },
  {
    name: 'part of the view of an idle source is no boundary',
    facts: { next: null, running: false },
    answer: 'not-a-boundary',
  },
  {
    name: 'the last row is no boundary while a row is said to follow it',
    point: { upper: '6' },
    facts: { next: 'user', running: false },
    answer: 'not-a-boundary',
  },
  {
    name: 'a position that is no number is refused',
    point: { position: '' },
    answer: 'out-of-bounds',
  },
]

describe('a fork point is the input of one model request (SF-4)', () => {
  it.each(CELLS)('$name', cell => {
    expect(judgeForkPoint({ ...POINT, ...cell.point }, { ...FACTS, ...cell.facts })).toBe(
      cell.answer,
    )
  })
})

describe('the position axis of a forked session goes on after the fork point (SF-3)', () => {
  it('numbers the first entry after the position of the point, and later ones after its own last', () => {
    expect(ownPositionAfter(null, null)).toBe(1n)
    expect(ownPositionAfter(null, POINT)).toBe(41n)
    expect(ownPositionAfter('57', POINT)).toBe(58n)
    expect(ownPositionAfter('3', null)).toBe(4n)
  })

  it('names the point before the latest assistant message by the rows behind it', () => {
    const rows = [
      { seq: '1', role: 'user' },
      { seq: '2', role: 'assistant' },
      { seq: '3', role: 'tool' },
      { seq: '4', role: 'assistant' },
      { seq: '5', role: 'tool' },
    ] as const
    expect(forkPointAfterRows('key/epoch:0', rows, '44')).toEqual({
      epoch: 'key/epoch:0',
      upper: '3',
      position: '44',
    })
    expect(forkPointAfterRows('key/epoch:0', rows.slice(0, 2), '44')?.upper).toBe('1')
    expect(forkPointAfterRows('key/epoch:0', rows.slice(0, 1), '44')).toBeNull()
    expect(forkPointAfterRows('key/epoch:0', [{ seq: '1', role: 'assistant' }], '44')).toBeNull()
  })
})

describe('a fork point travels as one text', () => {
  it('reads back the point it wrote and nothing else', () => {
    const text = forkPointText(POINT)
    expect(text).toBe(JSON.stringify([POINT.epoch, POINT.upper, POINT.position]))
    expect(parseForkPoint(text)).toEqual(POINT)
    const bad = ['', '[]', '["e","1"]', '["e","1","2","3"]', '[1,"1","2"]', '["e",1,"2"]']
    for (const value of [...bad, '["e","1",2]', '{"epoch":"e"}', 'null'])
      expect(parseForkPoint(value)).toBeNull()
  })
})
