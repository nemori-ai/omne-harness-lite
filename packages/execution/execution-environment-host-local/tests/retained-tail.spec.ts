import { describe, expect, it } from 'vitest'
import type { RetainedStreamTail } from '@omne-harness/execution-environment-contract'
import { createRetainedTail, type TailStream } from '../src/retained-tail.ts'

/** A small deterministic generator, so a failing round can be replayed from its seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The reference: every observed byte of one stream after `savedFrom`, `null` for a dropped one. */
type Model = { savedFrom: number; observed: (number | null)[] }

/** What the tail must save: the newest unbroken run of observed bytes, cut to the capacity. */
function expectedSaved(model: Model, capacity: number): number[] {
  const run: number[] = []
  for (let i = model.observed.length - 1; i >= 0 && run.length < capacity; i--) {
    const byte = model.observed[i]
    if (byte === null || byte === undefined) break
    run.unshift(byte)
  }
  return run
}

// Bytes that make multi-byte UTF-8 likely: ASCII, a two-byte and a three-byte character.
const alphabet = [...new TextEncoder().encode('abé✓\n')]

function checkStream(
  tail: RetainedStreamTail,
  model: Model,
  capacity: number,
  from: number | undefined,
  label: string,
): void {
  const saved = expectedSaved(model, capacity)
  const end = model.savedFrom + model.observed.length
  const firstSaved = end - saved.length
  const start = Math.min(Math.max(from ?? firstSaved, firstSaved), end)
  const data = saved.slice(start - firstSaved)
  let skipped = 0
  while (skipped < 3 && (data[skipped] ?? 0) >> 6 === 0b10) skipped++
  const actual = {
    savedFrom: tail.savedFrom,
    end: tail.end,
    discardedBytes: tail.discardedBytes,
    start: tail.start,
    data: tail.data.join(','),
    textStart: tail.text.start,
    text: tail.text.value,
  }
  const expected = {
    savedFrom: model.savedFrom,
    end,
    discardedBytes: firstSaved - model.savedFrom,
    start,
    data: data.join(','),
    textStart: start + skipped,
    text: new TextDecoder().decode(Uint8Array.from(data.slice(skipped))),
  }
  if (JSON.stringify(actual) !== JSON.stringify(expected)) expect(actual, label).toEqual(expected)
}

describe('the retained output tail against a reference model', () => {
  it('keeps the newest unbroken bytes within the capacity, whatever the appends, drops and reads', () => {
    for (let round = 0; round < 200; round++) {
      const random = mulberry32(1137 + round)
      const capacity = 1 + Math.floor(random() * 24)
      const savedFrom = { stdout: Math.floor(random() * 50), stderr: Math.floor(random() * 50) }
      const tail = createRetainedTail({ capacity, savedFrom })
      const models: Record<TailStream, Model> = {
        stdout: { savedFrom: savedFrom.stdout, observed: [] },
        stderr: { savedFrom: savedFrom.stderr, observed: [] },
      }
      let lastVersion = 0
      let lastEnd: Record<TailStream, number> = { ...savedFrom }
      for (let step = 0; step < 30; step++) {
        const stream: TailStream = random() < 0.7 ? 'stdout' : 'stderr'
        const model = models[stream]
        // An empty append and a drop of zero bytes leave the tail as it was.
        let changed: boolean
        if (random() < 0.15) {
          const count = Math.floor(random() * 5)
          tail.drop(stream, count)
          for (let i = 0; i < count; i++) model.observed.push(null)
          changed = count > 0
        } else {
          const length = Math.floor(random() * 12)
          const bytes = Uint8Array.from(
            { length },
            () => alphabet[Math.floor(random() * alphabet.length)] ?? 0x61,
          )
          tail.append(stream, bytes)
          model.observed.push(...bytes)
          changed = length > 0
        }
        const answer = tail.read()
        const seen = (['stdout', 'stderr'] as const).filter(
          name => models[name].observed.length > 0,
        )
        if (seen.length === 0) {
          expect(answer, `round ${round} step ${step}`).toEqual({ kind: 'none' })
          continue
        }
        if (answer.kind !== 'tail') throw new Error(`round ${round}: expected a tail`)
        if (changed)
          expect(answer.version, `round ${round} step ${step}`).toBeGreaterThan(lastVersion)
        else expect(answer.version, `round ${round} step ${step}`).toBe(lastVersion)
        lastVersion = answer.version
        expect(answer.streams.map(item => item.stream)).toEqual(seen)
        for (const item of answer.streams) {
          const name = item.stream
          if (name === 'terminal') throw new Error('a separate-mode tail has no terminal stream')
          const label = `round ${round} step ${step} ${name}`
          checkStream(item, models[name], capacity, undefined, label)
          expect(item.end, label).toBeGreaterThanOrEqual(lastEnd[name])
          lastEnd = { ...lastEnd, [name]: item.end }
          const from = Math.floor(random() * (item.end + 4))
          const read = tail.read({ [name]: from })
          if (read.kind !== 'tail') throw new Error(`${label}: expected a tail`)
          const again = read.streams.find(other => other.stream === name)
          if (again === undefined) throw new Error(`${label}: stream missing`)
          checkStream(again, models[name], capacity, from, `${label} from ${from}`)
        }
      }
    }
  })

  it('keeps the newest capacity of bytes when they arrive one at a time, three times the capacity over', () => {
    const capacity = 64
    const tail = createRetainedTail({ capacity, savedFrom: { stdout: 10, stderr: 0 } })
    const model: Model = { savedFrom: 10, observed: [] }
    for (let i = 0; i < 3 * capacity; i++) {
      const byte = i % 251
      tail.append('stdout', Uint8Array.from([byte]))
      model.observed.push(byte)
    }
    const read = tail.read()
    if (read.kind !== 'tail') throw new Error('expected a tail')
    const [stream] = read.streams
    if (stream === undefined) throw new Error('expected the stdout stream')
    checkStream(stream, model, capacity, undefined, 'byte by byte')
    expect([...stream.data]).toEqual(model.observed.slice(2 * capacity))
    expect(stream).toMatchObject({ start: 10 + 2 * capacity, end: 10 + 3 * capacity })
  })

  it('observes nothing once closed: the readings stay, appends and drops are ignored', () => {
    const tail = createRetainedTail({ capacity: 8, savedFrom: { stdout: 0, stderr: 0 } })
    tail.append('stdout', new TextEncoder().encode('kept'))
    expect(tail.closed()).toBe(false)
    const before = tail.read()
    tail.close()
    expect(tail.closed()).toBe(true)
    tail.append('stdout', new TextEncoder().encode('late'))
    tail.drop('stderr', 3)
    expect(tail.read()).toEqual(before)
  })

  it('raises the version only when a tail changes', () => {
    const tail = createRetainedTail({ capacity: 4, savedFrom: { stdout: 3, stderr: 0 } })
    expect(tail.read()).toEqual({ kind: 'none' })
    tail.append('stdout', new Uint8Array())
    tail.drop('stdout', 0)
    expect(tail.read()).toEqual({ kind: 'none' })
    tail.append('stdout', new Uint8Array([0x61]))
    const first = tail.read()
    tail.append('stdout', new Uint8Array())
    expect(tail.read()).toEqual(first)
    tail.drop('stdout', 2)
    const second = tail.read()
    if (first.kind !== 'tail' || second.kind !== 'tail') throw new Error('expected tails')
    expect(second.version).toBeGreaterThan(first.version)
    expect(second.streams[0]).toMatchObject({ start: 6, end: 6, discardedBytes: 3 })
  })

  it('copies appended bytes, so a reused buffer does not change the tail', () => {
    const tail = createRetainedTail({ capacity: 8, savedFrom: { stdout: 0, stderr: 0 } })
    const buffer = new Uint8Array([0x61, 0x62])
    tail.append('stdout', buffer)
    buffer.fill(0x7a)
    const read = tail.read()
    if (read.kind !== 'tail') throw new Error('expected a tail')
    expect([...(read.streams[0]?.data ?? [])]).toEqual([0x61, 0x62])
  })

  it('reports a replaced invalid sequence, not a literal replacement character', () => {
    const tail = createRetainedTail({ capacity: 16, savedFrom: { stdout: 0, stderr: 0 } })
    tail.append('stdout', new TextEncoder().encode('� ok'))
    const literal = tail.read()
    if (literal.kind !== 'tail') throw new Error('expected a tail')
    expect(literal.streams[0]?.text).toMatchObject({ value: '� ok', replaced: false })
    tail.append('stdout', new Uint8Array([0xff]))
    const invalid = tail.read()
    if (invalid.kind !== 'tail') throw new Error('expected a tail')
    expect(invalid.streams[0]?.text.replaced).toBe(true)
  })

  it('refuses a capacity that is not a positive safe integer', () => {
    for (const capacity of [0, -1, 1.5, Number.NaN])
      expect(() => createRetainedTail({ capacity, savedFrom: { stdout: 0, stderr: 0 } })).toThrow(
        RangeError,
      )
  })
})
