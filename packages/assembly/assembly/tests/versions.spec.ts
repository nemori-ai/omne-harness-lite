import { describe, expect, it } from 'vitest'
import {
  noVersions,
  parsePointer,
  standingOfVersion,
  stepVersions,
  type VersionEvent,
  type VersionOutcome,
  type Versions,
} from '../src/index.ts'

const after = (events: readonly VersionEvent[], from: Versions = noVersions): Versions =>
  events.reduce((versions, event) => stepVersions(versions, event).versions, from)
const install = (version: string): VersionEvent[] => [
  { kind: 'begin', version },
  { kind: 'finish', version },
]
const use = (version: string): VersionEvent[] => [
  ...install(version),
  { kind: 'switch', version },
  { kind: 'settled' },
]
const unchanged = (versions: Versions, event: VersionEvent, outcome: VersionOutcome) =>
  expect(stepVersions(versions, event)).toEqual({ versions, outcome })
const RUNNING = [{ kind: 'settled' }, { kind: 'fell' }, { kind: 'fell-to-limit' }] as const

describe('一版的全化表', () => {
  it('没装：开始装到装到一半；切到它被拒；别的不可达', () => {
    expect(standingOfVersion(noVersions, 'a')).toBe('absent')
    const begun = stepVersions(noVersions, { kind: 'begin', version: 'a' })
    expect(begun).toEqual({
      versions: { installed: { a: 'partial' }, pointer: null },
      outcome: 'moved',
    })
    unchanged(noVersions, { kind: 'switch', version: 'a' }, 'not-complete')
    unchanged(noVersions, { kind: 'finish', version: 'a' }, 'unreachable')
    unchanged(noVersions, { kind: 'interrupted', version: 'a' }, 'unreachable')
    for (const event of RUNNING) unchanged(noVersions, event, 'unreachable')
  })

  it('装到一半：装完到装好；再开始装与中断都停在装到一半；切到它被拒', () => {
    const partial = after([{ kind: 'begin', version: 'a' }])
    expect(standingOfVersion(partial, 'a')).toBe('partial')
    unchanged(partial, { kind: 'begin', version: 'a' }, 'same')
    unchanged(partial, { kind: 'interrupted', version: 'a' }, 'same')
    unchanged(partial, { kind: 'switch', version: 'a' }, 'not-complete')
    expect(stepVersions(partial, { kind: 'finish', version: 'a' })).toEqual({
      versions: { installed: { a: 'complete' }, pointer: null },
      outcome: 'moved',
    })
  })

  it('装好：开始装与装完幂等；切到它进入试用，指针指它，退路不变', () => {
    const complete = after([...use('a'), ...install('b')])
    expect(standingOfVersion(complete, 'b')).toBe('complete')
    unchanged(complete, { kind: 'begin', version: 'b' }, 'same')
    unchanged(complete, { kind: 'finish', version: 'b' }, 'same')
    unchanged(complete, { kind: 'interrupted', version: 'b' }, 'unreachable')
    const switched = stepVersions(complete, { kind: 'switch', version: 'b' })
    expect(switched.outcome).toBe('moved')
    expect(switched.versions.pointer).toEqual({ current: 'b', previous: 'a', settled: false })
    expect(standingOfVersion(switched.versions, 'b')).toBe('trial')
    expect(standingOfVersion(switched.versions, 'a')).toBe('settled')
  })

  it('试用中：起稳了就定下并成为退路；倒了只记一次；连着倒到上限指针退回上一份定下的', () => {
    const trial = after([...use('a'), ...install('b'), { kind: 'switch', version: 'b' }])
    unchanged(trial, { kind: 'begin', version: 'b' }, 'in-use')
    unchanged(trial, { kind: 'finish', version: 'b' }, 'same')
    unchanged(trial, { kind: 'interrupted', version: 'b' }, 'unreachable')
    unchanged(trial, { kind: 'switch', version: 'b' }, 'same')
    unchanged(trial, { kind: 'fell' }, 'same')
    const settled = stepVersions(trial, { kind: 'settled' })
    expect(settled.outcome).toBe('moved')
    expect(settled.versions.pointer).toEqual({ current: 'b', previous: 'b', settled: true })
    const back = stepVersions(trial, { kind: 'fell-to-limit' })
    expect(back.outcome).toBe('rolled-back')
    expect(back.versions.pointer).toEqual({ current: 'a', previous: 'a', settled: true })
    expect(standingOfVersion(back.versions, 'b')).toBe('complete')
  })

  it('试用中而没有定下过的版本：连着倒到上限没有退路，指针不动', () => {
    const first = after([...install('a'), { kind: 'switch', version: 'a' }])
    expect(first.pointer).toEqual({ current: 'a', previous: null, settled: false })
    unchanged(first, { kind: 'fell-to-limit' }, 'no-fallback')
  })

  it('定下：开始装被拒；别的幂等；连着倒到上限没有更早的退路', () => {
    const settled = after(use('a'))
    expect(standingOfVersion(settled, 'a')).toBe('settled')
    unchanged(settled, { kind: 'begin', version: 'a' }, 'in-use')
    unchanged(settled, { kind: 'finish', version: 'a' }, 'same')
    unchanged(settled, { kind: 'interrupted', version: 'a' }, 'unreachable')
    unchanged(settled, { kind: 'switch', version: 'a' }, 'same')
    unchanged(settled, { kind: 'settled' }, 'same')
    unchanged(settled, { kind: 'fell' }, 'same')
    unchanged(settled, { kind: 'fell-to-limit' }, 'no-fallback')
  })

  it('定下的退路：开始装被拒；切回它，它还是定下的', () => {
    const trial = after([...use('a'), ...install('b'), { kind: 'switch', version: 'b' }])
    unchanged(trial, { kind: 'begin', version: 'a' }, 'in-use')
    const back = stepVersions(trial, { kind: 'switch', version: 'a' })
    expect(back.outcome).toBe('moved')
    expect(back.versions.pointer).toEqual({ current: 'a', previous: 'a', settled: true })
  })
})

function generator(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

const NAMES = ['a', 'b', 'c', 'd'] as const
const KINDS = ['begin', 'finish', 'interrupted', 'switch', 'settled', 'fell', 'fell-to-limit']
function anyEvent(next: () => number): VersionEvent {
  const version = NAMES[Math.floor(next() * NAMES.length)] as string
  const kind = KINDS[Math.floor(next() * KINDS.length)] as VersionEvent['kind']
  return kind === 'settled' || kind === 'fell' || kind === 'fell-to-limit'
    ? { kind }
    : { kind, version }
}
/** Half the time an operation that moves this state on, so the sequences reach trials and fallbacks. */
function randomEvent(next: () => number, versions: Versions): VersionEvent {
  if (next() < 0.5) return anyEvent(next)
  const version = NAMES[Math.floor(next() * NAMES.length)] as string
  const standing = standingOfVersion(versions, version)
  if (standing === 'absent') return { kind: 'begin', version }
  if (standing === 'partial') return { kind: 'finish', version }
  if (standing === 'complete') return { kind: 'switch', version }
  return { kind: next() < 0.5 ? 'settled' : 'fell-to-limit' }
}

describe('随机的操作序列：指针只指装完的版本（C24）', () => {
  it('每一步之后指针指着的与退路都是装完的；退路定下过；装到一半中断不改指针', () => {
    const next = generator(20261126)
    const distinct = new Set<string>()
    let switched = 0
    let rolledBack = 0
    let interruptedPartial = 0
    for (let run = 0; run < 4000; run += 1) {
      let versions = noVersions
      const everSettled = new Set<string>()
      const sequence: VersionEvent[] = []
      const length = 4 + Math.floor(next() * 28)
      for (let index = 0; index < length; index += 1) {
        const event = randomEvent(next, versions)
        sequence.push(event)
        const before = versions
        const step = stepVersions(versions, event)
        versions = step.versions
        const { pointer, installed } = versions
        if (event.kind === 'settled' && step.outcome === 'moved')
          everSettled.add((pointer as NonNullable<typeof pointer>).current)
        if (event.kind === 'interrupted') {
          expect(versions).toEqual(before)
          if (step.outcome === 'same') interruptedPartial += 1
        }
        if (event.kind === 'switch' && step.outcome === 'moved') switched += 1
        if (step.outcome === 'rolled-back') rolledBack += 1
        if (pointer === null) continue
        expect(installed[pointer.current], JSON.stringify(sequence)).toBe('complete')
        if (pointer.settled) expect(pointer.previous).toBe(pointer.current)
        if (pointer.previous !== null) {
          expect(installed[pointer.previous]).toBe('complete')
          expect(everSettled.has(pointer.previous)).toBe(true)
        }
      }
      distinct.add(JSON.stringify(sequence))
    }
    console.log(
      `版本指针：${String(distinct.size)} 条不同的序列；切换 ${String(switched)} 次，退回 ${String(rolledBack)} 次，装到一半中断 ${String(interruptedPartial)} 次`,
    )
    expect(distinct.size).toBeGreaterThan(3900)
    expect(switched).toBeGreaterThan(500)
    expect(rolledBack).toBeGreaterThan(50)
    expect(interruptedPartial).toBeGreaterThan(500)
  })
})

describe('指针文件的内容', () => {
  it('读得出三样；不是指针的内容答没有', () => {
    const pointer = { current: 'b', previous: 'a', settled: false }
    expect(parsePointer(JSON.stringify(pointer))).toEqual(pointer)
    expect(parsePointer('{"current":"a","previous":null,"settled":false}')).toEqual({
      current: 'a',
      previous: null,
      settled: false,
    })
    for (const text of [
      '',
      '{"current":"a"',
      '[]',
      '{"current":"","previous":null,"settled":false}',
      '{"current":"a","previous":3,"settled":false}',
      '{"current":"a","previous":null,"settled":"no"}',
      '{"current":"a","previous":"b","settled":true}',
    ])
      expect(parsePointer(text), text).toBeUndefined()
  })
})
