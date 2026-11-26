import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  decide,
  expectedRevision,
  judgeRunStart,
  runStartInputs,
  type BoundedClose,
  type InputId,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { evidence, operationId, refused, succeeded } from '@omne-harness/session-contract/testing'
import { decodeEntry, type SessionEntry } from '../src/entries.ts'
import { reduce } from '../src/reduce.ts'
import { scene } from './scene.ts'

type Scene = ReturnType<typeof scene>

const NAMES = ['a', 'b', 'c', 'd', 'e'] as const
const ids = (names: readonly string[]): InputId[] => names.map(name => name as InputId)

async function dormant(): Promise<WorkSnapshot> {
  const s = scene()
  await s.create()
  return s.read()
}

function written(s: Scene, kind: SessionEntry['kind']): SessionEntry[] {
  return s.port.controls
    .entriesOf(s.base.tenant, s.base.session)
    .filter(row => row.kind === kind)
    .map(row => {
      const decoded = decodeEntry(row)
      if (!('ok' in decoded)) throw new Error(`undecodable ${kind}`)
      return decoded.ok
    })
}

async function close(s: Scene, bounded: BoundedClose) {
  const { run } = await s.active()
  return s.commit({
    kind: 'finishRun',
    input: {
      ...s.base,
      operation: operationId('close'),
      run: run.run,
      expected: expectedRevision(await s.read(), 'finishRun'),
      bounded,
    },
  })
}

async function started(batch: readonly string[], later: readonly string[]): Promise<Scene> {
  const s = scene()
  await s.create()
  for (const name of batch) await s.accept(name)
  await s.start()
  for (const name of later) await s.accept(name)
  return s
}

describe('the batch a Run starts from', () => {
  it('is every pending input that is not held back, in the order accepted, when one of them can start a Run', async () => {
    const base = await dormant()
    fc.assert(
      fc.property(
        fc.shuffledSubarray([...NAMES]),
        fc.subarray([...NAMES]),
        fc.subarray([...NAMES]),
        (pending, quietOf, heldOf) => {
          const quiet = pending.filter(name => quietOf.includes(name))
          const held = pending.filter(name => heldOf.includes(name) && !quiet.includes(name))
          const snapshot: WorkSnapshot = {
            ...base,
            pending: ids(pending),
            quietInputs: ids(quiet),
            deferredInputs: ids(held).map(input => ({ input, run: null })),
          }
          const wakes = pending.some(name => !quiet.includes(name) && !held.includes(name))
          expect(judgeRunStart(snapshot, 'interactive')).toEqual(
            wakes
              ? { kind: 'eligible', initial: ids(pending.filter(name => !held.includes(name))) }
              : { kind: 'no-input' },
          )
        },
      ),
      { numRuns: 500 },
    )
  })

  it('is recorded by the commit that starts the Run and stays with the Run', async () => {
    const s = await started(['a', 'b', 'c'], ['later'])
    const { run, snapshot } = await s.active()
    expect(run.initial).toEqual(['a', 'b', 'c'])
    expect(snapshot.pending).toEqual(['a', 'b', 'c', 'later'])
    expect(written(s, 'run.started')).toEqual([
      expect.objectContaining({ run: run.run, initial: ['a', 'b', 'c'] }),
    ])
  })

  it('a log whose Run starts from an input that is not pending, or from one held back, is not taken', async () => {
    const s = scene()
    await s.create()
    await s.accept('a')
    await s.accept('b')
    const before = await s.read()
    const { revision } = (await s.start()).receipt
    const entries = s.port.controls
      .entriesOf(s.base.tenant, s.base.session)
      .filter(row => row.revision === revision)
    const replayed = (snapshot: WorkSnapshot) => reduce(snapshot, { revision, entries })
    expect(replayed(before)).toMatchObject({ kind: 'reduced' })
    expect(replayed({ ...before, pending: ids(['a']) })).toMatchObject({
      kind: 'quarantined',
      diagnostic: expect.stringContaining('an initial input of the Run is not pending'),
    })
    const held = ids(['b', 'ghost']).map(input => ({ input, run: null }))
    expect(replayed({ ...before, deferredInputs: held })).toMatchObject({
      kind: 'quarantined',
      diagnostic: expect.stringContaining(
        'an initial input of the Run is held back until a Run ends',
      ),
    })
  })
})

describe('an invoke that is refused for good closes the Run as failed', () => {
  it('one input that admission rejects loses its standing; the rest of the batch and what came later stay pending', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        fc.nat(),
        fc.integer({ min: 0, max: 2 }),
        async (size, pick, after) => {
          const batch = NAMES.slice(0, size)
          const later = Array.from({ length: after }, (_, at) => `later-${String(at)}`)
          const rejected = batch[pick % size] as string
          const s = await started(batch, later)
          const rejection = evidence(`rejection/${rejected}`)
          succeeded(
            await close(s, { kind: 'admission-rejected', input: rejected as InputId, rejection }),
            'finishRun',
          )
          const after_ = await s.read()
          expect(after_.run).toMatchObject({ kind: 'terminal', terminal: { outcome: 'failed' } })
          expect(after_.pending).toEqual([...batch.filter(name => name !== rejected), ...later])
          expect(after_.awaitingPerson).toBe(true)
          expect(written(s, 'intake.handed-over')).toEqual([
            expect.objectContaining({
              input: rejected,
              result: { kind: 'rejected', reason: 'admission-rejected', rejection },
            }),
          ])
        },
      ),
      { numRuns: 40 },
    )
  })

  it('a refusal that names no input rejects every input the invoke carried; what came later stays pending', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 0, max: 2 }),
        async (size, after) => {
          const batch = NAMES.slice(0, size)
          const later = Array.from({ length: after }, (_, at) => `later-${String(at)}`)
          const s = await started(batch, later)
          const { run } = await s.active()
          succeeded(
            await close(s, {
              kind: 'drive-refused',
              failure: 'unsupported',
              field: null,
              reason: null,
              inputs: run.initial,
            }),
            'finishRun',
          )
          expect((await s.read()).pending).toEqual(later)
          expect(
            written(s, 'intake.handed-over').map(entry => 'input' in entry && entry.input),
          ).toEqual(batch)
        },
      ),
      { numRuns: 20 },
    )
  })

  it('an input that is not of the batch cannot be named as the rejected one', async () => {
    const s = await started(['a', 'b'], ['later'])
    expect(
      refused(
        await close(s, {
          kind: 'admission-rejected',
          input: 'later' as InputId,
          rejection: evidence('rejection/later'),
        }),
        'finishRun',
      ),
    ).toMatchObject({
      kind: 'invalid',
      field: 'bounded.input',
      reason: 'not an initial input of the Run',
    })
    expect((await s.read()).run.kind).toBe('active')
  })

  it('an input of the batch that waits no more cannot be named either', async () => {
    const s = await started(['a', 'b'], [])
    const { run, snapshot } = await s.active()
    const decision = decide(
      { ...snapshot, pending: ['b' as InputId] },
      {
        kind: 'finishRun',
        input: {
          ...s.base,
          operation: operationId('close'),
          run: run.run,
          expected: expectedRevision(snapshot, 'finishRun'),
          bounded: {
            kind: 'admission-rejected',
            input: 'a' as InputId,
            rejection: evidence('rejection/a'),
          },
        },
      },
      [],
      null,
      { compaction: null },
    )
    expect(decision).toMatchObject({
      kind: 'rejected',
      failure: {
        kind: 'invalid',
        field: 'bounded.input',
        reason: 'an initial input is no longer pending',
      },
    })
  })

  it('an uninterpretable close with incomplete evidence names its evidence', async () => {
    const s = await started(['a'], [])
    expect(
      refused(
        await close(s, { kind: 'uninterpretable', evidence: { ...evidence('u'), digest: '' } }),
        'finishRun',
      ),
    ).toMatchObject({ kind: 'invalid', field: 'bounded.evidence' })
  })
})

describe('the batch of a session that is not there', () => {
  it('is empty', () => {
    expect(runStartInputs(null)).toEqual([])
    expect(runStartInputs(undefined)).toEqual([])
  })
})
