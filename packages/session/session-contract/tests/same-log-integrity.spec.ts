import { describe, expect, it } from 'vitest'
import {
  projectSessionLog,
  reduce,
  type ConsumptionId,
  type HistoryEntry,
  type SessionCallRegistration,
  type SessionLogObservation,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { evidence, operationId, succeeded } from '@omne-harness/session-contract/testing'
import { decodeEntry, encodeEntry } from '../src/entries.ts'
import { applyExtended } from '../src/reduce-extended.ts'
import { open } from './scene.ts'

const consumption = 'original-consumption' as ConsumptionId

async function twoRuns() {
  const scene = await open()
  const old = await scene.active()
  succeeded(
    await scene.commit({
      kind: 'control',
      input: {
        ...scene.base,
        operation: operationId('cancel-old'),
        intent: { kind: 'cancel-run', run: old.run.run, urgency: 'force' },
      },
    }),
    'cancel',
  )
  await scene.start('successor')
  const current = await scene.active()
  const registration: SessionCallRegistration = {
    kind: 'associated',
    binding: {
      producer: { kind: 'model', call: 'original-model' },
      action: 'original-action',
      consumer: {
        owner: 'agent',
        work: 'original-work',
        position: 'original-position',
        purpose: 'main',
      },
      request: evidence('original-request'),
      initiatingAttempt: current.advance.attempt,
    },
    purpose: 'main',
  }
  const observation: SessionLogObservation = {
    ...scene.base,
    run: current.run.run,
    execution: current.run.execution.execution,
    operation: operationId('interpret-current'),
    sequence: '1',
    revision: '5',
    source: evidence('original-event'),
    executionEvidence: evidence('original-head'),
    consequences: [{ kind: 'call-registration', consumption, registration }],
  }
  return { scene, old, current, registration, observation }
}
async function material(
  scene: Awaited<ReturnType<typeof open>>,
  observation: SessionLogObservation,
) {
  scene.history.observe(observation)
  const snapshot = await scene.read()
  const reads = scene.history.read(
    snapshot,
    scene.port.controls.entriesOf(scene.access.tenant, scene.access.session),
    { kind: 'pending', inputs: snapshot.pending },
  ).reads
  return { snapshot, reads }
}
function batch(
  snapshot: WorkSnapshot,
  observation: SessionLogObservation,
  reads: ReturnType<Awaited<ReturnType<typeof open>>['history']['read']>['reads'],
) {
  const decision = projectSessionLog(snapshot, observation, reads)
  if (decision.kind !== 'entries') throw new Error(JSON.stringify(decision))
  const revision = String(BigInt(snapshot.revision) + 1n) as WorkSnapshot['revision']
  return {
    revision,
    entries: decision.entries.map((entry, index) => ({
      ...entry,
      revision,
      id: `integrity-${revision}-${index}` as HistoryEntry['id'],
    })),
  }
}

describe('atomic interpretation of original Session history', () => {
  it('quarantines a direct registration with a real attempt from another Run without publishing state', async () => {
    const f = await twoRuns()
    const { snapshot, reads } = await material(f.scene, f.observation)
    const before = structuredClone(snapshot)
    const valid = batch(snapshot, f.observation, reads)
    expect(reduce(snapshot, valid, reads).kind).toBe('reduced')
    const altered = valid.entries.map(row => {
      const value = decodeEntry(row)
      if (!('ok' in value) || value.ok.kind !== 'call.bound' || !('registration' in value.ok))
        return row
      const registration = value.ok.registration
      if (registration.kind !== 'associated') throw new Error('associated fixture')
      return {
        ...encodeEntry(
          {
            ...value.ok,
            registration: {
              ...f.registration,
              binding: { ...f.registration.binding, initiatingAttempt: f.old.advance.attempt },
            },
          },
          row.origin,
        ),
        id: row.id,
        revision: row.revision,
      }
    })
    expect(reduce(snapshot, { ...valid, entries: altered }, reads)).toMatchObject({
      kind: 'quarantined',
      diagnostic: expect.stringContaining('belongs to another Run'),
    })
    expect(snapshot).toEqual(before)
    expect(await f.scene.read()).toEqual(before)
  })

  it('requires both the whole original consequence set and matching execution progress', async () => {
    const f = await twoRuns()
    const observation: SessionLogObservation = {
      ...f.observation,
      consequences: [
        ...f.observation.consequences,
        {
          kind: 'registered-waiting',
          calls: [{ consumption, position: 'original-position' }],
          other: [],
        },
      ],
    }
    const { snapshot, reads } = await material(f.scene, observation)
    const before = structuredClone(snapshot)
    const valid = batch(snapshot, observation, reads)
    expect(reduce(snapshot, valid, reads).kind).toBe('reduced')
    for (const kind of ['history.annotated', 'call.bound', 'extension.passage']) {
      const result = reduce(
        snapshot,
        { ...valid, entries: valid.entries.filter(row => row.kind !== kind) },
        reads,
      )
      expect(result).toMatchObject({ kind: 'quarantined' })
      expect('snapshot' in result).toBe(false)
    }
    const cursorOnly = valid.entries.filter(row => row.kind === 'history.annotated')
    expect(reduce(snapshot, { ...valid, entries: cursorOnly }, reads).kind).toBe('quarantined')
    expect(snapshot).toEqual(before)
  })

  it('accepts entries and results reconciliation without inventing an event cursor', async () => {
    const f = await twoRuns()
    const binding = f.registration.binding
    const result = {
      producer: binding.producer,
      version: 'result-one',
      delivery: null,
      source: evidence('result'),
    }
    const observation: SessionLogObservation = {
      ...f.observation,
      sequence: null,
      source: evidence('entries-and-results'),
      consequences: [
        ...f.observation.consequences,
        { kind: 'producer', consumption, binding, result },
      ],
    }
    const { snapshot, reads } = await material(f.scene, observation)
    const valid = batch(snapshot, observation, reads)
    const reduced = reduce(snapshot, valid, reads)
    expect(reduced).toMatchObject({
      kind: 'reduced',
      snapshot: {
        run: { execution: { revision: '5', readThrough: '0' } },
        consumptions: [{ id: consumption, results: [{ result }] }],
      },
    })
    expect(
      reduce(
        snapshot,
        { ...valid, entries: valid.entries.filter(row => row.kind !== 'history.annotated') },
        reads,
      ).kind,
    ).toBe('quarantined')
    succeeded(
      await f.scene.port.controls.project(observation, operationId('publish-null')),
      'publish reconciliation',
    )
    const after = await f.scene.read()
    expect(after.historyIndex?.executions[0]).toMatchObject({ readThrough: '0', interpreted: null })
    const reread = f.scene.history.read(
      after,
      f.scene.port.controls.entriesOf(f.scene.access.tenant, f.scene.access.session),
      { kind: 'pending', inputs: after.pending },
    ).reads
    expect(projectSessionLog(after, observation, reread).kind).toBe('entries')
  })

  it('keeps a legitimate late registration in its original Run without changing the successor', async () => {
    const f = await twoRuns()
    succeeded(
      await f.scene.commit({
        kind: 'receive',
        input: {
          ...f.scene.base,
          operation: operationId('successor-admission'),
          fact: {
            kind: 'input-handover',
            execution: f.current.run.execution.execution,
            input: f.current.run.first,
            result: { kind: 'accepted', receipt: evidence('successor-accepted') },
          },
        },
      }),
      'successor admission',
    )
    const waitingConsumption = 'successor-tool-intent' as ConsumptionId
    succeeded(
      await f.scene.project(
        {
          ...f.observation,
          source: evidence('successor-taken-waiting'),
          consequences: [
            {
              kind: 'input-taken',
              batch: {
                id: 'successor-batch' as never,
                ordered: [f.current.run.first],
                watermark: evidence('successor-watermark'),
              },
            },
            {
              kind: 'call-registration',
              consumption: waitingConsumption,
              registration: {
                kind: 'tool-intent',
                action: 'successor-tool',
                purpose: 'action',
                consumer: {
                  owner: 'agent',
                  work: 'successor',
                  position: 'successor-position',
                  purpose: 'action',
                },
                request: evidence('successor-tool-request'),
                initiatingAttempt: f.current.advance.attempt,
              },
            },
            {
              kind: 'registered-waiting',
              calls: [{ consumption: waitingConsumption, position: 'successor-position' }],
              other: [],
            },
          ],
        },
        operationId('successor-taken-waiting'),
      ),
      'successor taken and waiting',
    )
    const registration = {
      ...f.registration,
      binding: { ...f.registration.binding, initiatingAttempt: f.old.advance.attempt },
    }
    const observation: SessionLogObservation = {
      ...f.observation,
      run: f.old.run.run,
      execution: f.old.run.execution.execution,
      consequences: [{ kind: 'call-registration', consumption, registration }],
    }
    const { snapshot, reads } = await material(f.scene, observation)
    expect(snapshot.taken).toEqual([f.current.run.first])
    expect(snapshot.callWaits).toHaveLength(1)
    const reduced = reduce(snapshot, batch(snapshot, observation, reads), reads)
    if (reduced.kind !== 'reduced') throw new Error(reduced.diagnostic)
    expect(reduced.snapshot.run).toEqual(snapshot.run)
    expect(reduced.snapshot.taken).toEqual(snapshot.taken)
    expect(reduced.snapshot.callWaits).toEqual(snapshot.callWaits)
    expect(reduced.snapshot.waiting).toEqual(snapshot.waiting)
    expect(reduced.snapshot.executions?.find(item => item.run === f.old.run.run)?.terminal).toEqual(
      snapshot.executions?.find(item => item.run === f.old.run.run)?.terminal,
    )
  })

  it('rejects a first legacy call from another Run and recognizes a legitimate legacy event again', async () => {
    const f = await twoRuns()
    await material(f.scene, f.observation)
    succeeded(
      await f.scene.port.controls.project(f.observation, operationId('register-current')),
      'registration',
    )
    const wrong: SessionLogObservation = {
      ...f.observation,
      run: f.old.run.run,
      execution: f.old.run.execution.execution,
      source: evidence('legacy-old-event'),
      executionEvidence: evidence('legacy-old-head'),
      consequences: [{ kind: 'call', consumption, binding: f.registration.binding }],
    }
    const negative = await material(f.scene, wrong)
    expect(projectSessionLog(negative.snapshot, wrong, negative.reads)).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'initiatingAttempt', reason: 'belongs to another Run' },
    })
    const legal: SessionLogObservation = {
      ...f.observation,
      sequence: '2',
      source: evidence('legacy-current-event'),
      consequences: wrong.consequences,
    }
    const positive = await material(f.scene, legal)
    expect(
      reduce(positive.snapshot, batch(positive.snapshot, legal, positive.reads), positive.reads)
        .kind,
    ).toBe('reduced')
    succeeded(await f.scene.port.controls.project(legal, operationId('legacy-current')), 'legacy')
    const repeated = await material(f.scene, legal)
    expect(projectSessionLog(repeated.snapshot, legal, repeated.reads)).toEqual({
      kind: 'entries',
      entries: [],
    })
    expect(
      projectSessionLog(
        repeated.snapshot,
        { ...legal, source: evidence('forged') },
        repeated.reads,
      ),
    ).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'source' },
    })
  })
})

describe('one transition for a taken batch', () => {
  async function handed() {
    const f = await twoRuns()
    succeeded(
      await f.scene.commit({
        kind: 'receive',
        input: {
          ...f.scene.base,
          operation: operationId('successor-admission'),
          fact: {
            kind: 'input-handover',
            execution: f.current.run.execution.execution,
            input: f.current.run.first,
            result: { kind: 'accepted', receipt: evidence('successor-accepted') },
          },
        },
      }),
      'successor admission',
    )
    const taken = (ordered: readonly string[]): SessionLogObservation => ({
      ...f.observation,
      source: evidence('successor-taken'),
      consequences: [
        {
          kind: 'input-taken',
          batch: {
            id: 'successor-batch' as never,
            ordered: ordered as never,
            watermark: evidence('successor-watermark'),
          },
        },
      ],
    })
    const selected = async (observation: SessionLogObservation) => {
      f.scene.history.observe(observation)
      const snapshot = await f.scene.read()
      const consequence = observation.consequences[0]
      if (consequence?.kind !== 'input-taken') throw new Error('taken fixture')
      const reads = f.scene.history.read(
        snapshot,
        f.scene.port.controls.entriesOf(f.scene.access.tenant, f.scene.access.session),
        { kind: 'selected', inputs: consequence.batch.ordered },
      ).reads
      return { snapshot, reads }
    }
    return { ...f, first: f.current.run.first, taken, selected }
  }

  it('the projection and the reducer refuse a batch that repeats a member', async () => {
    const projected = await handed()
    const repeated = projected.taken([projected.first, projected.first])
    const original = await projected.selected(repeated)
    expect(projectSessionLog(original.snapshot, repeated, original.reads)).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'invalid' },
    })

    const f = await handed()
    const single = f.taken([f.first])
    const { snapshot, reads } = await f.selected(single)
    const valid = batch(snapshot, single, reads)
    expect(reduce(snapshot, valid, reads)).toMatchObject({
      kind: 'reduced',
      snapshot: { taken: [f.first], handed: [], pending: [] },
    })
    const doubled = valid.entries.map(row => {
      const value = decodeEntry(row)
      if (!('ok' in value) || value.ok.kind !== 'run.batch-taken') return row
      return {
        ...encodeEntry(
          { ...value.ok, batch: { ...value.ok.batch, ordered: [f.first, f.first] } },
          row.origin,
        ),
        id: row.id,
        revision: row.revision,
      }
    })
    expect(reduce(snapshot, { ...valid, entries: doubled }, reads)).toMatchObject({
      kind: 'quarantined',
    })
  })

  it('the shared transition keeps each input taken at most once in the current Run', async () => {
    const f = await handed()
    const { snapshot } = await f.selected(f.taken([f.first]))
    if (snapshot.run.kind !== 'active') throw new Error('no active Run')
    const run = snapshot.run.run
    const entry = (ordered: readonly string[]) => ({
      kind: 'run.batch-taken' as const,
      run,
      batch: {
        id: 'successor-batch' as never,
        ordered: ordered as never,
        watermark: evidence('successor-watermark'),
      },
    })
    const once = { ...snapshot }
    expect(applyExtended(once, entry([f.first]), evidence('taken'))).toBeNull()
    expect(once.taken).toEqual([f.first])
    expect(applyExtended({ ...snapshot }, entry([f.first, f.first]), evidence('t'))).toEqual(
      expect.any(String),
    )
    expect(applyExtended({ ...once }, entry([f.first]), evidence('again'))).toEqual(
      expect.any(String),
    )
  })
})
