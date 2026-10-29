import { describe, expect, it } from 'vitest'
import {
  decide,
  projectSessionLog,
  reduce,
  type Decision,
  type HistoryEntry,
  type SessionCommand,
  type SessionExecutionPrefix,
  type SessionHistoryReads,
  type SessionLogConsequence,
  type SessionLogObservation,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  evidence,
  memoryOtherAccess,
  operationId,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { decodeEntry } from '../src/entries.ts'
import { open } from './scene.ts'

async function observedTail() {
  const s = await open()
  const { run } = await s.active()
  const handover = async (input: typeof run.first) =>
    succeeded(
      await s.commit({
        kind: 'receive',
        input: {
          ...s.base,
          operation: operationId(`handover-${input}`),
          fact: {
            kind: 'input-handover',
            execution: run.execution.execution,
            input,
            result: { kind: 'accepted', receipt: evidence(`accepted-${input}`) },
          },
        },
      }),
      'handover',
    )
  await handover(run.first)
  const observation = (sequence: string, consequences: readonly SessionLogConsequence[]) =>
    ({
      ...s.base,
      run: run.run,
      execution: run.execution.execution,
      sequence,
      revision: String(BigInt(sequence) + 1n),
      source: evidence(`event-${sequence}`),
      executionEvidence: evidence(`head-${sequence}`),
      consequences,
    }) satisfies SessionLogObservation
  succeeded(
    await s.project(
      observation('1', [
        {
          kind: 'input-taken',
          batch: {
            id: 'original-batch' as never,
            watermark: evidence('original-watermark'),
            ordered: [run.first],
          },
        },
      ]),
      operationId('interpret-taken'),
    ),
    'interpret taken',
  )
  await s.accept('second')
  const second = (await s.read()).pending[0]
  if (second === undefined) throw new Error('second input missing')
  await handover(second)
  succeeded(
    await s.commit({
      kind: 'freeze',
      input: {
        ...s.base,
        operation: operationId('freeze'),
        verdict: { cause: 'tool-shape-lost', evidence: evidence('freeze') },
      },
    }),
    'freeze',
  )
  const observations = ['2', '3'].map(sequence => observation(sequence, [{ kind: 'observed' }]))
  for (const original of observations) s.history.observe(original)
  const snapshot = await s.read()
  const material = s.history.read(
    snapshot,
    s.port.controls.entriesOf(s.access.tenant, s.access.session),
    { kind: 'pending', inputs: snapshot.pending },
  )
  const prefix: SessionExecutionPrefix = {
    execution: run.execution.execution,
    run: run.run,
    after: '1',
    through: '3',
    facts: observations.map(original => ({
      sequence: original.sequence,
      source: original.source,
      consequences: original.consequences,
    })),
  }
  const reads = { ...material.reads, prefixes: [prefix] }
  const command: SessionCommand = {
    kind: 'control',
    input: {
      ...s.base,
      operation: operationId('cancel'),
      intent: { kind: 'cancel-run', run: run.run, urgency: 'force' },
    },
  }
  return { snapshot, reads, prefix, command, observations, run, second }
}

type Fixture = Awaited<ReturnType<typeof observedTail>>
function cancel(f: Fixture, reads: SessionHistoryReads | undefined = f.reads) {
  return decide(f.snapshot, f.command, [], null, { compaction: null, history: reads })
}
function committed(snapshot: WorkSnapshot, decision: Decision) {
  if (decision.kind !== 'entries') throw new Error(JSON.stringify(decision))
  const revision = String(BigInt(snapshot.revision) + 1n) as WorkSnapshot['revision']
  return {
    revision,
    entries: decision.entries.map((entry, index) => ({
      ...entry,
      revision,
      id: `observed-tail-${index}` as HistoryEntry['id'],
    })),
  }
}
function withConsequences(f: Fixture, consequences: readonly SessionLogConsequence[]): Fixture {
  const index = f.snapshot.historyIndex
  if (index === undefined) throw new Error('history index missing')
  return {
    ...f,
    snapshot: {
      ...f.snapshot,
      historyIndex: {
        ...index,
        executions: index.executions.map(boundary => ({
          ...boundary,
          facts: boundary.facts.map(fact =>
            fact.sequence === '2' ? { ...fact, kinds: consequences.map(item => item.kind) } : fact,
          ),
        })),
      },
    },
    reads: {
      ...f.reads,
      prefixes: [
        {
          ...f.prefix,
          facts: f.prefix.facts.map(fact =>
            fact.sequence === '2' ? { ...fact, consequences } : fact,
          ),
        },
      ],
    },
  }
}

describe('final decisions after an observed-only tail', () => {
  it('releases only the remaining input without committing a cursor or replaying the taken batch', async () => {
    const f = await observedTail()
    const before = JSON.stringify(f.snapshot)
    expect(f.snapshot.pending).toEqual([f.second])
    expect(f.snapshot.historyIndex?.taken).toHaveLength(1)
    expect(f.snapshot.historyIndex?.executions[0]).toMatchObject({
      readThrough: '1',
      emittedThrough: '3',
    })
    expect(
      projectSessionLog(
        f.snapshot,
        { ...f.observations[0]!, revision: '4', executionEvidence: evidence('head-3') },
        f.reads,
      ),
    ).toEqual({ kind: 'entries', entries: [] })
    const batch = committed(f.snapshot, cancel(f))
    const result = reduce(f.snapshot, batch, f.reads)
    expect(result).toMatchObject({
      kind: 'reduced',
      snapshot: { pending: [], run: { terminal: { outcome: 'cancelled' } } },
    })
    if (result.kind !== 'reduced') throw new Error(result.diagnostic)
    expect(result.snapshot.executions?.map(item => item.execution)).toEqual(
      f.snapshot.executions?.map(item => item.execution),
    )
    expect(result.snapshot.historyIndex).toEqual(f.snapshot.historyIndex)
    expect(
      batch.entries.some(
        entry => entry.kind === 'run.batch-taken' || entry.kind === 'history.annotated',
      ),
    ).toBe(false)
    const release = batch.entries.find(entry => entry.kind === 'intake.released')
    if (release === undefined) throw new Error('release missing')
    expect(decodeEntry(release)).toMatchObject({ ok: { inputs: [f.second] } })
    expect(JSON.stringify(f.snapshot)).toBe(before)
  })

  it.each(['finish', 'archive'] as const)(
    'uses the same observed-tail proof for frozen %s',
    async kind => {
      const f = await observedTail()
      const input = {
        tenant: f.snapshot.tenant,
        session: f.snapshot.session,
        operation: operationId(kind),
      }
      const command: SessionCommand =
        kind === 'finish'
          ? {
              kind: 'finishRun',
              input: {
                ...input,
                run: f.run.run,
                expected: f.snapshot.revision,
                bounded: { kind: 'uninterpretable', evidence: evidence('bounded') },
              },
            }
          : { kind: 'control', input: { ...input, intent: { kind: 'archive' } } }
      const decision = decide(f.snapshot, command, [], null, { compaction: null, history: f.reads })
      const result = reduce(f.snapshot, committed(f.snapshot, decision), f.reads)
      expect(result).toMatchObject({
        kind: 'reduced',
        snapshot: {
          pending: [],
          run: { terminal: { outcome: kind === 'finish' ? 'failed' : 'cancelled' } },
        },
      })
      if (result.kind !== 'reduced') throw new Error(result.diagnostic)
      expect(result.snapshot.executions?.map(item => item.execution)).toEqual(
        f.snapshot.executions?.map(item => item.execution),
      )
    },
  )

  it('still requires the original committed taken effect and complete batch', async () => {
    const f = await observedTail()
    expect(cancel(f).kind).toBe('entries')
    const index = f.snapshot.historyIndex
    if (index === undefined) throw new Error('history index missing')
    const missing = {
      ...f,
      snapshot: { ...f.snapshot, historyIndex: { ...index, taken: [] } },
      reads: { ...f.reads, taken: [] },
    }
    expect(cancel(missing)).toMatchObject({
      kind: 'rejected',
      failure: {
        kind: 'quarantined',
        diagnostic: expect.stringContaining('no original taken effect'),
      },
    })
    const altered = {
      ...f,
      snapshot: {
        ...f.snapshot,
        historyIndex: {
          ...index,
          batches: index.batches.map(batch => ({
            ...batch,
            batch: { ...batch.batch, id: 'other-batch' as never },
          })),
        },
      },
    }
    expect(cancel(altered)).toMatchObject({
      kind: 'rejected',
      failure: {
        kind: 'quarantined',
        diagnostic: expect.stringContaining('no original taken effect'),
      },
    })
  })

  it('does not replace a necessary prefix with its index, an empty prefix, or a partial suffix', async () => {
    const f = await observedTail()
    expect(cancel(f).kind).toBe('entries')
    const short = { ...f.prefix, through: '2', facts: f.prefix.facts.slice(0, 1) }
    const empty = { ...f.prefix, through: '1', facts: [] }
    for (const prefixes of [[], [short], [empty]]) {
      const reads = { ...f.reads, prefixes }
      expect(cancel(f, reads)).toMatchObject({
        kind: 'rejected',
        failure: {
          kind: 'unavailable',
          diagnostic: expect.stringContaining('committedConsequences'),
        },
      })
      expect(reduce(f.snapshot, committed(f.snapshot, cancel(f)), reads).kind).toBe('quarantined')
    }
    expect(decide(f.snapshot, f.command, [], null, { compaction: null })).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'unavailable' },
    })
  })

  it('retains the root, original Run, source, kind, and continuity checks', async () => {
    const f = await observedTail()
    expect(cancel(f).kind).toBe('entries')
    const malformed: readonly [SessionHistoryReads, object][] = [
      [{ ...f.reads, root: { ...f.reads.root, position: '999' } }, { kind: 'changed' }],
      [
        { ...f.reads, root: { ...f.reads.root, tenant: memoryOtherAccess('foreign').tenant } },
        { kind: 'denied' },
      ],
      [{ ...f.reads, root: { ...f.reads.root, session: 'foreign' as never } }, { kind: 'denied' }],
      [
        { ...f.reads, prefixes: [{ ...f.prefix, run: 'foreign' as never }] },
        { kind: 'invalid', field: 'history.execution.run' },
      ],
      [{ ...f.reads, prefixes: [{ ...f.prefix, execution: 'foreign' }] }, { kind: 'unavailable' }],
      [
        { ...f.reads, prefixes: [{ ...f.prefix, after: '0' }] },
        { kind: 'invalid', field: 'history.prefix' },
      ],
      [
        { ...f.reads, prefixes: [{ ...f.prefix, through: '4' }] },
        { kind: 'invalid', field: 'history.prefix' },
      ],
      [
        { ...f.reads, prefixes: [{ ...f.prefix, facts: f.prefix.facts.slice(1) }] },
        { kind: 'invalid', field: 'history.prefix.facts' },
      ],
      [
        { ...f.reads, prefixes: [{ ...f.prefix, facts: f.prefix.facts.toReversed() }] },
        { kind: 'invalid', field: 'history.prefix.sequence' },
      ],
      [
        {
          ...f.reads,
          prefixes: [
            {
              ...f.prefix,
              facts: f.prefix.facts.map(fact => ({ ...fact, source: evidence('foreign') })),
            },
          ],
        },
        { kind: 'invalid', field: 'history.prefix.consequences' },
      ],
      [
        {
          ...f.reads,
          prefixes: [
            { ...f.prefix, facts: f.prefix.facts.map(fact => ({ ...fact, consequences: [] })) },
          ],
        },
        { kind: 'invalid', field: 'history.prefix.consequences' },
      ],
    ]
    for (const [reads, failure] of malformed) {
      expect(cancel(f, reads)).toMatchObject({ kind: 'rejected', failure })
      expect(reduce(f.snapshot, committed(f.snapshot, cancel(f)), reads).kind).toBe('quarantined')
    }
  })

  it('does not treat an explicitly empty consequence list as observed even when the index agrees', async () => {
    const f = await observedTail()
    expect(cancel(f).kind).toBe('entries')
    expect(cancel(withConsequences(f, []))).toMatchObject({
      kind: 'rejected',
      failure: {
        kind: 'unavailable',
        diagnostic: expect.stringContaining('committedConsequences'),
      },
    })
  })

  it('does not use a prepared prefix instead of committing real Session consequences', async () => {
    const f = await observedTail()
    expect(cancel(f).kind).toBe('entries')
    const binding = {
      producer: { kind: 'model' as const, call: 'original-call' },
      action: 'action',
      consumer: { owner: 'owner', work: 'work', position: 'position', purpose: 'main' },
      request: evidence('request'),
      initiatingAttempt: f.run.advance!.attempt,
      purpose: 'main' as const,
    }
    const effects: readonly SessionLogConsequence[] = [
      {
        kind: 'input-taken',
        batch: {
          id: 'second-batch' as never,
          watermark: evidence('second-batch'),
          ordered: [f.second],
        },
      },
      { kind: 'producer', consumption: 'consumption' as never, binding, result: null },
      { kind: 'waiting', waiting: [] },
      { kind: 'registered-waiting', calls: [], other: [] },
      {
        kind: 'control',
        progress: {
          operation: operationId('prior-control'),
          target: { kind: 'run', run: f.run.run },
          intent: {
            kind: 'control',
            value: { kind: 'cancel-run', run: f.run.run, urgency: 'force' },
          },
          state: 'committed',
          pending: [],
        },
      },
    ]
    for (const effect of effects) {
      const changed = withConsequences(f, [{ kind: 'observed' }, effect])
      expect(cancel(changed)).toMatchObject({
        kind: 'rejected',
        failure: {
          kind: 'unavailable',
          diagnostic: expect.stringContaining('committedConsequences'),
        },
      })
      expect(reduce(changed.snapshot, committed(f.snapshot, cancel(f)), changed.reads).kind).toBe(
        'quarantined',
      )
    }
  })

  it('stops preparation before ended and leaves its interpretation for the normal interpreter', async () => {
    const f = await observedTail()
    const index = f.snapshot.historyIndex
    if (index === undefined) throw new Error('history index missing')
    const ended = {
      sequence: '4',
      source: evidence('ended'),
      consequences: [
        {
          kind: 'ended' as const,
          outcome: 'completed' as const,
          cause: null,
          disposition: evidence('disposition'),
        },
      ],
    }
    const snapshot = {
      ...f.snapshot,
      historyIndex: {
        ...index,
        executions: index.executions.map(boundary => ({
          ...boundary,
          emittedThrough: '4',
          ended: { sequence: ended.sequence, source: ended.source },
          facts: [
            ...boundary.facts,
            { sequence: ended.sequence, source: ended.source, kinds: ['ended' as const] },
          ],
        })),
      },
    }
    for (const prefix of [
      f.prefix,
      { ...f.prefix, through: '4', facts: [...f.prefix.facts, ended] },
    ]) {
      const changed = { ...f, snapshot, reads: { ...f.reads, prefixes: [prefix] } }
      const batch = committed(snapshot, cancel(changed))
      expect(batch.entries.some(entry => entry.origin.source?.record === ended.source.record)).toBe(
        false,
      )
      expect(reduce(snapshot, batch, changed.reads)).toMatchObject({
        kind: 'reduced',
        snapshot: { run: { terminal: { outcome: 'cancelled' } } },
      })
      expect(snapshot.historyIndex.executions[0]?.readThrough).toBe('1')
    }
  })
})
