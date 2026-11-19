import { describe, expect, it } from 'vitest'
import type { HistoryEntry, WorkSnapshot } from '@omne-harness/session-contract'
import { evidence, operationId, succeeded } from '@omne-harness/session-contract/testing'
import type { SessionCall } from '../src/call-settlement.ts'
import { decodeEntry } from '../src/entries.ts'
import { callScene } from './call-scene.ts'

const held = (snapshot: WorkSnapshot, consumption: string) => ({
  consumption: snapshot.consumptions.some(item => item.id === consumption),
  registration: (snapshot.callRegistrations ?? []).some(item => item.consumption === consumption),
  references: (snapshot.workEntryIndex?.calls ?? []).some(item => item.consumption === consumption),
})
const gone = { consumption: false, registration: false, references: false }
const there = { consumption: true, registration: true, references: true }

describe('the work snapshot holds the open calls', () => {
  it('a call stays while its result is not processed, and leaves when it is', async () => {
    const s = await callScene()
    expect(held(await s.read(), s.consumption)).toEqual(there)
    succeeded(await s.preserve('preserve'), 'preserve')
    expect(held(await s.read(), s.consumption)).toEqual(there)
    succeeded(await s.process('process'), 'process')
    expect(held(await s.read(), s.consumption)).toEqual(gone)
  })

  it('a call with no result yet stays after the terminal of its Run: it is still out', async () => {
    const s = await callScene()
    await s.cancel()
    const after = await s.read()
    expect(after.run.kind).toBe('terminal')
    expect(held(after, s.consumption)).toEqual(there)
  })
})

describe('a fact about a call that left the snapshot', () => {
  it('the same confirmation again answers the original one, and the call stays out', async () => {
    const s = await callScene()
    const first = succeeded(await s.preserve('preserve'), 'preserve')
    succeeded(await s.process('process'), 'process')
    expect(succeeded(await s.preserve('preserve'), 'the same custody')).toEqual(first)
    expect(held(await s.read(), s.consumption)).toEqual(gone)
  })

  it('a late release of the processed result is recorded once, and the call stays out', async () => {
    const s = await callScene()
    succeeded(await s.preserve('preserve'), 'preserve')
    succeeded(await s.process('process'), 'process')
    const before = (await s.read()).revision
    const released = succeeded(await s.release('release'), 'release')
    const after = await s.read()
    expect(BigInt(after.revision)).toBe(BigInt(before) + 1n)
    expect(held(after, s.consumption)).toEqual(gone)
    expect(succeeded(await s.release('release'), 'the same release')).toEqual({
      ...released,
      recovered: true,
    })
    expect((await s.read()).revision).toBe(after.revision)
  })

  it('the same binding from outside a Run, bound again, answers the original consumption', async () => {
    const s = await callScene(true)
    succeeded(await s.processExternal('process'), 'process')
    expect(held(await s.read(), s.consumption)).toEqual(gone)
    const again = succeeded(
      await s.commit({
        kind: 'bindExternalCall',
        input: {
          ...s.base,
          operation: operationId('bind-again'),
          expected: (await s.read()).revision,
          binding: { ...s.binding, initiatingAttempt: null },
          qualification: evidence('qualified'),
        },
      }),
      'the same binding again',
    )
    expect(again.consumption).toBe(s.consumption)
    expect(held(await s.read(), s.consumption)).toEqual(gone)
  })

  it('a custody that names another receipt for the processed result is refused, as before', async () => {
    const s = await callScene()
    succeeded(await s.preserve('preserve'), 'preserve')
    succeeded(await s.process('process'), 'process')
    const other = await s.preserve('preserve-other', {
      owner: 'agent',
      record: 'custody-other',
      revision: '1',
      digest: `sha256:${'9'.repeat(64)}`,
    })
    expect(other).toHaveProperty('failure')
    expect(held(await s.read(), s.consumption)).toEqual(gone)
  })
})

describe('a stop of a call that left the snapshot', () => {
  it('answers that no such call is out, writes no control, and the call stays out', async () => {
    const s = await callScene()
    succeeded(await s.preserve('preserve'), 'preserve')
    succeeded(await s.process('process'), 'process')
    const before = await s.read()
    const stopped = succeeded(
      await s.commit({
        kind: 'stopCall',
        input: { ...s.base, operation: operationId('stop'), producer: s.binding.producer },
      }),
      'stop',
    )
    expect(stopped).toMatchObject({ answer: { kind: 'not-found' } })
    const after = await s.read()
    expect(after.controls).toEqual(before.controls)
    expect(held(after, s.consumption)).toEqual(gone)
  })
})

// The record of a call is what the entries that name it say. This reads it from the log alone.
function fromLog(entries: readonly HistoryEntry[], consumption: string) {
  const results = new Map<
    string,
    { custody: string | null; completion: string | null; release: string }
  >()
  const at = (version: string) => {
    const held = results.get(version) ?? { custody: null, completion: null, release: 'pending' }
    results.set(version, held)
    return held
  }
  for (const row of entries) {
    if (!row.kind.startsWith('call.') && row.kind !== 'account.linked') continue
    const decoded = decodeEntry(row)
    if (!('ok' in decoded)) throw new Error(`an entry of the log does not decode: ${row.kind}`)
    const entry = decoded.ok
    if (entry.kind === 'call.result-preserved' && entry.consumption === consumption)
      at(entry.result.version).custody ??= entry.custody.digest
    if (entry.kind === 'call.result-processed' && entry.consumption === consumption)
      at(entry.result.version).completion ??= entry.completion.digest
    if (entry.kind !== 'call.execution-fact' && entry.kind !== 'account.linked') continue
    if (entry.consumption === consumption && entry.result != null) at(entry.result.version)
    if (entry.fact.kind === 'release' && entry.fact.consumption === consumption)
      at(entry.fact.result.version).release = 'confirmed'
  }
  return [...results].sort(([left], [right]) => left.localeCompare(right))
}

const asKnown = (call: SessionCall | null) =>
  (call?.consumed?.results ?? [])
    .map(
      item =>
        [
          item.result.version,
          {
            custody: item.custody?.digest ?? null,
            completion: item.completion?.digest ?? null,
            release: item.release,
          },
        ] as const,
    )
    .sort(([left], [right]) => left.localeCompare(right))

// A small deterministic generator: the cases are the same on every run.
function order(seed: number, length: number): number[] {
  let state = seed
  return Array.from({ length }, () => {
    state = (state * 1103515245 + 12345) % 2147483648
    return state % 5
  })
}

describe('a call asked by its key answers what the log says about it', () => {
  it.each(Array.from({ length: 40 }, (_, seed) => [seed + 1]))(
    'steps in the order of seed %i: the record follows the log, and a call that left stays out',
    async seed => {
      const s = await callScene(seed % 2 === 0)
      const steps = [
        (n: number) => s.preserve(`preserve-${n}`),
        (n: number) =>
          seed % 2 === 0 ? s.processExternal(`process-${n}`) : s.process(`process-${n}`),
        (n: number) => s.release(`release-${n}`),
        () => s.preserve('preserve-again'),
        () => s.release('release-again'),
      ]
      let left = false
      for (const [n, pick] of order(seed, 9).entries()) {
        await (steps[pick] as (n: number) => Promise<unknown>)(n)
        const entries = s.port.controls.entriesOf(s.access.tenant, s.access.session)
        expect(asKnown(s.call(s.consumption))).toEqual(fromLog(entries, s.consumption))
        const here = held(await s.read(), s.consumption).registration
        expect(left && here).toBe(false)
        left ||= !here
      }
    },
  )
})
