import fc from 'fast-check'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InputId, RunId, WorkSnapshot } from '@omne-harness/session-contract'
import { succeeded } from '@omne-harness/session-contract/testing'
import { advanceStep, type AdvanceStep } from '../src/advance.ts'
import { createKnownHandovers } from '../src/known-handovers.ts'
import { memoryBackend } from './fixtures/backends.ts'
import { harness, type Harness } from './fixtures/harness.ts'

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})

const NAMES = ['a', 'b', 'c', 'd', 'e'] as const
const ids = (names: readonly string[]): InputId[] => names.map(name => name as InputId)
const NOTHING: ReadonlySet<InputId> = new Set()

async function activeSnapshot(): Promise<WorkSnapshot> {
  const h = await harness({ backend: memoryBackend, advance: true })
  open.push(h)
  await h.create()
  await h.accept('a')
  const read = async () => succeeded(await h.backend.transactions.readWork(h.access()), 'read')
  await vi.waitFor(async () => expect((await read()).handed).toEqual(['a']))
  return read()
}

/** Whether the step after the process lost what it noted does at least what the step before it did. */
function coveredBy(before: AdvanceStep, after: AdvanceStep, noted: ReadonlySet<InputId>): boolean {
  switch (before.kind) {
    case 'open':
      return after.kind === 'open' && after.opener === before.opener
    case 'replay':
      return after.kind === 'replay'
    case 'hand-in':
      if (after.kind === 'replay') return true
      return (
        after.kind === 'hand-in' &&
        before.inputs.every(input => after.inputs.includes(input)) &&
        after.inputs.every(input => before.inputs.includes(input) || noted.has(input))
      )
    case 'none':
      if (after.kind === 'none') return true
      if (after.kind === 'replay') return after.run.initial.some(input => noted.has(input))
      return after.kind === 'hand-in' && after.inputs.every(input => noted.has(input))
  }
}

describe('the next step of the advance coordinator is a function of the log', () => {
  it('a process that lost what it noted replays an invoke or submits an input again, and never does less', async () => {
    const base = await activeSnapshot()
    if (base.run.kind !== 'active') throw new Error('no active Run')
    const run = base.run
    fc.assert(
      fc.property(
        fc.shuffledSubarray([...NAMES]),
        fc.subarray([...NAMES], { minLength: 1 }),
        fc.subarray([...NAMES]),
        fc.subarray([...NAMES]),
        fc.subarray([...NAMES]),
        fc.constantFrom('active', 'released', 'ended', 'waiting'),
        (pending, initial, handedOf, heldOf, notedOf, state) => {
          const [first, ...rest] = ids(initial)
          if (first === undefined) throw new Error('an initial batch is never empty')
          const snapshot: WorkSnapshot = {
            ...base,
            pending: ids(pending),
            handed: ids(pending.filter(name => handedOf.includes(name))),
            deferredInputs: ids(pending.filter(name => heldOf.includes(name))).map(input => ({
              input,
              run: run.run,
            })),
            run:
              state === 'active' || state === 'released'
                ? {
                    ...run,
                    initial: [first, ...rest],
                    advance: state === 'released' ? null : run.advance,
                  }
                : { kind: 'none' },
            ...(state === 'waiting' ? { awaitingPerson: true } : {}),
          }
          const noted = new Set(ids(notedOf))
          expect(
            coveredBy(advanceStep(snapshot, noted), advanceStep(snapshot, NOTHING), noted),
          ).toBe(true)
        },
      ),
      { numRuns: 2000 },
    )
  })

  it('a Run that waits to be invoked is replayed with the batch of its start, whatever is pending now', async () => {
    const base = await activeSnapshot()
    if (base.run.kind !== 'active') throw new Error('no active Run')
    const snapshot: WorkSnapshot = {
      ...base,
      pending: ids(['a', 'b', 'late']),
      handed: [],
      run: { ...base.run, initial: [ids(['a'])[0] as InputId, ids(['b'])[0] as InputId] },
    }
    const step = advanceStep(snapshot, NOTHING)
    expect(step).toMatchObject({ kind: 'replay', run: { initial: ['a', 'b'] } })
    const invoked = advanceStep(snapshot, new Set(ids(['a', 'b'])))
    expect(invoked).toMatchObject({ kind: 'hand-in', inputs: ['late'] })
  })

  it('one input of the batch the log shows as handed over is enough: the invoke is not replayed', async () => {
    const base = await activeSnapshot()
    if (base.run.kind !== 'active') throw new Error('no active Run')
    const [a, b] = ids(['a', 'b']) as [InputId, InputId]
    const snapshot: WorkSnapshot = {
      ...base,
      pending: [a, b],
      handed: [a],
      run: { ...base.run, initial: [a, b] },
    }
    expect(advanceStep(snapshot, NOTHING)).toEqual({ kind: 'none' })
  })

  it('a Run whose advance was released is neither replayed nor handed inputs', async () => {
    const base = await activeSnapshot()
    if (base.run.kind !== 'active') throw new Error('no active Run')
    const snapshot: WorkSnapshot = {
      ...base,
      pending: ids(['a', 'late']),
      handed: [],
      run: { ...base.run, advance: null },
    }
    expect(advanceStep(snapshot, NOTHING)).toEqual({ kind: 'none' })
  })
})

describe('what the process noted of an invoke', () => {
  it('belongs to one Run: noting for the next Run forgets the inputs of the one before', async () => {
    const base = await activeSnapshot()
    if (base.run.kind !== 'active') throw new Error('no active Run')
    const ref = { tenant: base.tenant, session: base.session }
    const known = createKnownHandovers()
    const [a, b] = ids(['a', 'b']) as [InputId, InputId]
    known.note(ref, 'another-run' as RunId, [a])
    known.note(ref, base.run.run, [b])
    expect([...known.of(ref, base)]).toEqual([b])
    known.note(ref, base.run.run, [a])
    expect([...known.of(ref, base)]).toEqual([b, a])
  })
})
