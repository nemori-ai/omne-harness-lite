import { describe, expect, it } from 'vitest'
import type { HistoryEntry, WorkSnapshot } from '@omne-harness/session-contract'
import { evidence, operationId, succeeded } from '@omne-harness/session-contract/testing'
import type { SessionCall } from '../src/call-settlement.ts'
import { decodeEntry } from '../src/entries.ts'
import { callScene, callsScene, intentScene } from './call-scene.ts'

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

describe('the open rule on the lists that name a call', () => {
  it('a call with two result versions leaves when the first of them is processed', async () => {
    const s = await callScene()
    succeeded(await s.preserve('preserve-1'), 'the first version')
    succeeded(
      await s.preserve('preserve-2', evidence('custody-2'), null, '2'),
      'the second version',
    )
    expect(held(await s.read(), s.consumption)).toEqual(there)
    succeeded(await s.process('process'), 'process')
    expect(held(await s.read(), s.consumption)).toEqual(gone)
    expect(s.call(s.consumption)?.consumed?.results.map(item => item.completion !== null)).toEqual([
      true,
      false,
    ])
  })

  it('a call that a stop refers to stays after its result is processed, while the stop is not reconciled', async () => {
    const s = await callScene()
    succeeded(await s.preserve('preserve'), 'preserve')
    const stopped = succeeded(
      await s.commit({
        kind: 'stopCall',
        input: { ...s.base, operation: operationId('stop'), producer: s.binding.producer },
      }),
      'stop',
    )
    expect(stopped).toMatchObject({ answer: { kind: 'requested' } })
    succeeded(await s.process('process'), 'process')
    expect(held(await s.read(), s.consumption)).toEqual(there)
  })

  it('the binding of a producer is answered from the snapshot while the call is open, and none for another producer', async () => {
    const s = await callScene()
    const bound = (call: string) =>
      s.port.readCall({ ...s.access, producer: { kind: 'tool', call } })
    expect(succeeded(await bound(s.binding.producer.call), 'the open call')).toEqual({
      consumption: s.consumption,
      binding: s.binding,
    })
    expect(succeeded(await bound('another-call'), 'another producer')).toBeNull()
  })

  it('an intent that a control took over stays after the terminal of its Run', async () => {
    const s = await intentScene(true)
    await s.cancel()
    const after = await s.read()
    expect(after.run.kind).toBe('terminal')
    expect(held(after, s.consumption).registration).toBe(true)
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

describe('the final delivery of a call', () => {
  it.each(['model', 'tool'] as const)(
    'a %s call leaves once its final delivery is in the log, though the Agent never processed it',
    async kind => {
      const s = await callScene(false, kind)
      succeeded(await s.deliver('deliver'), 'deliver')
      expect(held(await s.read(), s.consumption)).toEqual(gone)
    },
  )

  it('a Model call that a stop refers to stays after its final delivery, while the stop is not reconciled', async () => {
    const s = await callScene(false, 'model')
    succeeded(
      await s.commit({
        kind: 'stopCall',
        input: { ...s.base, operation: operationId('stop'), producer: s.binding.producer },
      }),
      'stop',
    )
    succeeded(await s.deliver('deliver'), 'deliver')
    expect(held(await s.read(), s.consumption)).toEqual(there)
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

describe('an intent that left with its Run and is associated afterwards', () => {
  it('leaves at the terminal of its Run when nobody waits for it', async () => {
    const s = await intentScene()
    expect(held(await s.read(), s.consumption).registration).toBe(true)
    await s.cancel()
    expect(held(await s.read(), s.consumption)).toEqual(gone)
    expect(s.call(s.consumption)?.record.registration.kind).toBe('tool-intent')
  })

  it('the association is recorded as history: the call stays out, and its producer answers the binding', async () => {
    const s = await intentScene()
    await s.cancel()
    expect(succeeded(await s.bound(), 'before the association')).toBeNull()
    succeeded(await s.associate('associate'), 'associate')
    expect(held(await s.read(), s.consumption)).toEqual(gone)
    expect(s.call(s.consumption)?.record.registration).toMatchObject({
      kind: 'associated',
      binding: s.binding,
    })
    expect(succeeded(await s.bound(), 'after the association')).toEqual({
      consumption: s.consumption,
      binding: s.binding,
    })
  })

  it('the result of the invocation is kept under the call, and the call stays out', async () => {
    const s = await intentScene()
    await s.cancel()
    succeeded(await s.associate('associate'), 'associate')
    const kept = succeeded(await s.preserve('preserve'), 'preserve')
    expect(succeeded(await s.preserve('preserve'), 'the same custody')).toEqual(kept)
    expect(s.call(s.consumption)?.consumed?.results.map(item => item.custody?.digest)).toEqual([
      evidence('custody').digest,
    ])
    expect(held(await s.read(), s.consumption)).toEqual(gone)
  })

  it('another invocation for the same intent is refused, as before', async () => {
    const s = await intentScene()
    await s.cancel()
    succeeded(await s.associate('associate'), 'associate')
    const other = await s.associate('associate-other', s.bindingTo('another-invocation'), '3')
    expect(other).toHaveProperty('failure')
    expect(succeeded(await s.bound(), 'the original binding')).toMatchObject({ binding: s.binding })
    expect(
      succeeded(await s.bound({ kind: 'tool', call: 'another-invocation' }), 'the other'),
    ).toBeNull()
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

describe('several calls of one session', () => {
  it.each([[false], [true]])(
    'one leaves and the others stay as they were (bound outside a Run: %s)',
    async external => {
      const [first, second, third] = await callsScene(external, 3)
      if (first === undefined || second === undefined || third === undefined)
        throw new Error('three calls')
      const others = () =>
        JSON.stringify([first.call(first.consumption), third.call(third.consumption)])
      const before = others()
      succeeded(await second.preserve('preserve-second'), 'preserve')
      succeeded(
        await (external
          ? second.processExternal('process-second')
          : second.process('process-second')),
        'process',
      )
      const after = await second.read()
      expect(held(after, second.consumption)).toEqual(gone)
      expect(held(after, first.consumption)).toEqual(there)
      expect(held(after, third.consumption)).toEqual(there)
      expect(others()).toBe(before)
      succeeded(await second.release('release-second'), 'a late fact of the one that left')
      const later = await second.read()
      expect(held(later, second.consumption)).toEqual(gone)
      expect(held(later, first.consumption)).toEqual(there)
      expect(others()).toBe(before)
      expect(second.call(second.consumption)?.consumed?.results[0]?.release).toBe('confirmed')
      expect(first.call(first.consumption)?.consumed?.results).toEqual([])
    },
  )

  it.each(Array.from({ length: 24 }, (_, seed) => [seed + 1]))(
    'steps on three calls in the order of seed %i: every record follows the log, none comes back',
    async seed => {
      const external = seed % 2 === 0
      const calls = await callsScene(external, 3)
      const left = calls.map(() => false)
      for (const [n, pick] of order(seed, 18).entries()) {
        const at = (seed + n * 7 + pick) % calls.length
        const c = calls[at]
        if (c === undefined) throw new Error('a call')
        const steps = [
          () => c.preserve(`preserve-${n}`),
          () => (external ? c.processExternal(`process-${n}`) : c.process(`process-${n}`)),
          () => c.release(`release-${n}`),
          () => c.preserve(`preserve-again-${at}`),
          () => c.release(`release-again-${at}`),
        ]
        await (steps[pick] as () => Promise<unknown>)()
        const entries = c.port.controls.entriesOf(c.access.tenant, c.access.session)
        const snapshot = await c.read()
        for (const [index, each] of calls.entries()) {
          expect(asKnown(each.call(each.consumption))).toEqual(fromLog(entries, each.consumption))
          const here = held(snapshot, each.consumption).registration
          expect(left[index] && here).toBe(false)
          left[index] ||= !here
        }
      }
      const log = calls[0]?.port.controls.entriesOf(calls[0].access.tenant, calls[0].access.session)
      const processed = calls.map(each =>
        fromLog(log ?? [], each.consumption).some(([, result]) => result.completion !== null),
      )
      expect(left).toEqual(processed)
    },
  )
})
