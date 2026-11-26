import { describe, expect, it } from 'vitest'
import { judgeStamp, parseStamp, type Stamp } from '../src/index.ts'

type Random = () => number
function randomOf(seed: number): Random {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

const KNOWN = { 'state-directory': 1, 'session-composite': 23 }
const stamp = (formats: Record<string, number>, writtenBy = 'server@1.4.0'): Stamp => ({
  writtenBy,
  formats,
})

describe('judgeStamp：这一版认不认得这份状态目录', () => {
  it('没有戳：照常，起来之后写一份', () => {
    expect(judgeStamp(undefined, KNOWN)).toEqual({ kind: 'absent' })
  })

  it('戳里的格式都认得，号也一样：照常，不用改戳', () => {
    expect(judgeStamp(stamp({ ...KNOWN }), KNOWN)).toEqual({ kind: 'current' })
  })

  it('有比自己旧的号，或有自己知道而戳里没有的格式：要迁，点名是哪些', () => {
    expect(judgeStamp(stamp({ 'state-directory': 1, 'session-composite': 22 }), KNOWN)).toEqual({
      kind: 'migrate',
      formats: ['session-composite'],
    })
    expect(judgeStamp(stamp({ 'session-composite': 23 }), KNOWN)).toEqual({
      kind: 'migrate',
      formats: ['state-directory'],
    })
  })

  it('有比自己新的号：拒绝，写明是哪一版写的、哪些格式', () => {
    expect(judgeStamp(stamp({ 'state-directory': 1, 'session-composite': 24 }), KNOWN)).toEqual({
      kind: 'refused',
      writtenBy: 'server@1.4.0',
      formats: ['session-composite'],
    })
  })

  it('有自己不认得的格式名：拒绝', () => {
    expect(judgeStamp(stamp({ ...KNOWN, 'page-bundles': 1 }), KNOWN)).toEqual({
      kind: 'refused',
      writtenBy: 'server@1.4.0',
      formats: ['page-bundles'],
    })
  })

  it('既有新的又有旧的：拒绝，不先迁', () => {
    expect(judgeStamp(stamp({ 'state-directory': 2, 'session-composite': 20 }), KNOWN)).toEqual({
      kind: 'refused',
      writtenBy: 'server@1.4.0',
      formats: ['state-directory'],
    })
  })
})

describe('parseStamp', () => {
  it('读回写出的那一份', () => {
    const written = stamp({ ...KNOWN })
    expect(parseStamp(JSON.stringify(written))).toEqual(written)
  })

  it.each([
    ['不是 JSON', '{'],
    ['不是对象', '[]'],
    ['没有写它的版本', '{"formats":{}}'],
    ['写它的版本是空的', '{"writtenBy":"","formats":{}}'],
    ['格式不是对象', '{"writtenBy":"a","formats":[]}'],
    ['号不是正整数', '{"writtenBy":"a","formats":{"x":0}}'],
    ['号不是整数', '{"writtenBy":"a","formats":{"x":1.5}}'],
    ['号是字符串', '{"writtenBy":"a","formats":{"x":"1"}}'],
  ])('%s：读不成', (_, text) => {
    expect(parseStamp(text)).toBeUndefined()
  })
})

describe('AS-21：一份状态目录不被不认得它的格式的版本打开', () => {
  it('随机的戳与随机的已知格式：三种结局互斥、穷尽，并且照定义', () => {
    const random = randomOf(1702)
    const names = ['a', 'b', 'c', 'd']
    const seen = new Set<string>()
    const kinds = new Map<string, number>()
    for (let run = 0; run < 4000; run += 1) {
      const draw = (): Record<string, number> =>
        Object.fromEntries(
          names.filter(() => random() < 0.6).map(name => [name, 1 + Math.floor(random() * 3)]),
        )
      const [formats, known] = [draw(), draw()]
      seen.add(JSON.stringify([formats, known]))
      const verdict = judgeStamp(stamp(formats), known)
      kinds.set(verdict.kind, (kinds.get(verdict.kind) ?? 0) + 1)
      const newer = Object.keys(formats)
        .filter(name => known[name] === undefined || (formats[name] as number) > known[name])
        .sort()
      const older = Object.keys(known)
        .filter(name => formats[name] === undefined || formats[name] < (known[name] as number))
        .sort()
      if (newer.length > 0)
        expect(verdict).toEqual({ kind: 'refused', writtenBy: 'server@1.4.0', formats: newer })
      else if (older.length > 0) expect(verdict).toEqual({ kind: 'migrate', formats: older })
      else expect(verdict).toEqual({ kind: 'current' })
      // A build that knows everything the stamp names, at numbers not lower, never refuses.
      const wider = {
        ...known,
        ...Object.fromEntries(
          Object.entries(formats).map(([k, v]) => [k, Math.max(v, known[k] ?? 0)]),
        ),
      }
      expect(judgeStamp(stamp(formats), wider).kind).not.toBe('refused')
    }
    console.log(
      `judgeStamp property: ${String(seen.size)} distinct inputs of 4000; ${JSON.stringify([...kinds])}`,
    )
    expect(seen.size).toBeGreaterThan(1500)
  })
})
