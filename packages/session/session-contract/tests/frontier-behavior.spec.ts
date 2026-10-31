import { describe, expect, it } from 'vitest'
import {
  decide,
  projectSessionLog,
  reduce,
  openWork,
  type ConsumptionId,
  type HistoryEntry,
  type SessionLogConsequence,
  type SessionLogObservation,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { evidence, operationId } from '@omne-harness/session-contract/testing'
import { decodeEntry, encodeEntry } from '../src/entries.ts'
import { open } from './scene.ts'

async function observed(consequences: readonly SessionLogConsequence[] = [{ kind: 'observed' }]) {
  const scene = await open()
  const { run } = await scene.active()
  const observation: SessionLogObservation = {
    ...scene.base,
    run: run.run,
    execution: run.execution.execution,
    operation: operationId('interpret-current'),
    sequence: '1',
    revision: '5',
    source: evidence('event-one'),
    executionEvidence: evidence('head-five'),
    consequences,
  }
  scene.history.observe(observation)
  const snapshot = await scene.read()
  const material = scene.history.read(
    snapshot,
    scene.port.controls.entriesOf(scene.access.tenant, scene.access.session),
    { kind: 'pending', inputs: snapshot.pending },
  )
  return { scene, snapshot, observation, reads: material.reads }
}
function committed(snapshot: WorkSnapshot, decision: ReturnType<typeof projectSessionLog>) {
  if (decision.kind !== 'entries') throw new Error(JSON.stringify(decision))
  const revision = String(BigInt(snapshot.revision) + 1n) as WorkSnapshot['revision']
  return {
    revision,
    entries: decision.entries.map((entry, index) => ({
      ...entry,
      revision,
      id: `s3-${revision}-${index}` as HistoryEntry['id'],
    })),
  }
}
const consumption = 'consumption-original' as ConsumptionId

async function registered() {
  const fixture = await observed()
  const active = fixture.snapshot.run
  if (active.kind !== 'active' || active.advance === null) throw new Error('active fixture')
  const registration = {
    kind: 'tool-intent' as const,
    action: 'action',
    consumer: { owner: 'owner', work: 'work', position: 'position', purpose: 'action' },
    request: evidence('fixed-request'),
    initiatingAttempt: active.advance.attempt,
    purpose: 'action' as const,
  }
  const observation = {
    ...fixture.observation,
    consequences: [
      { kind: 'call-registration' as const, consumption, registration },
      {
        kind: 'registered-waiting' as const,
        calls: [{ consumption, position: 'position' }],
        other: [],
      },
    ],
  }
  // A separate original source supplies this event; the first fixture only supplied observed.
  const index = fixture.snapshot.historyIndex
  if (index === undefined) throw new Error('history fixture')
  const snapshot = {
    ...fixture.snapshot,
    historyIndex: {
      ...index,
      executions: index.executions.map(item => ({
        ...item,
        facts: [
          {
            sequence: '1',
            source: observation.source,
            kinds: observation.consequences.map(item => item.kind),
          },
        ],
      })),
    },
  }
  return { ...fixture, snapshot, observation, registration }
}

describe('same-root Session frontier', () => {
  it('does not accept a forged root, fabricated attempt, or omitted original event consequences', async () => {
    const f = await registered()
    expect(
      projectSessionLog(f.snapshot, f.observation, {
        ...f.reads,
        root: { ...f.reads.root, position: '999' },
      }),
    ).toMatchObject({ kind: 'rejected', failure: { kind: 'changed' } })
    expect(
      projectSessionLog(f.snapshot, f.observation, {
        ...f.reads,
        attempts: [{ ...f.reads.attempts[0]!, attempt: 'forged' as never }],
      }),
    ).toMatchObject({ kind: 'rejected', failure: { kind: 'invalid', field: 'history.attempts' } })
    expect(
      projectSessionLog(
        f.snapshot,
        { ...f.observation, consequences: f.observation.consequences.slice(1) },
        f.reads,
      ),
    ).toMatchObject({ kind: 'rejected', failure: { kind: 'invalid', field: 'consequences' } })
  })
  it('keeps head evidence and event source separate, with no cursor-only commit', async () => {
    const empty = await observed()
    expect(projectSessionLog(empty.snapshot, empty.observation, empty.reads)).toEqual({
      kind: 'entries',
      entries: [],
    })
    const f = await registered()
    const decision = projectSessionLog(f.snapshot, f.observation, f.reads)
    const batch = committed(f.snapshot, decision)
    expect(batch.entries.every(entry => entry.origin.source === f.observation.source)).toBe(true)
    const result = reduce(f.snapshot, batch, f.reads)
    expect(result).toMatchObject({
      kind: 'reduced',
      snapshot: {
        run: { execution: { revision: '5', evidence: evidence('head-five'), readThrough: '1' } },
      },
    })
    if (result.kind !== 'reduced') throw new Error(result.diagnostic)
    expect(result.snapshot.callRegistrations?.[0]?.registered.record).toBe(`s3-${batch.revision}-0`)
    expect(openWork(result.snapshot).unassociatedWaiting).toEqual([
      { consumption, position: 'position' },
    ])
    expect(
      reduce(f.snapshot, { ...batch, entries: batch.entries.slice(1) }, f.reads),
    ).toMatchObject({ kind: 'quarantined' })
    expect(
      projectSessionLog(
        f.snapshot,
        { ...f.observation, executionEvidence: evidence('fake') },
        f.reads,
      ),
    ).toMatchObject({ kind: 'rejected', failure: { kind: 'invalid', field: 'executionEvidence' } })
  })
  it('echoes only the current Session operation for a fixed-binding conflict', async () => {
    const f = await registered()
    const snapshot = {
      ...f.snapshot,
      callRegistrations: [
        {
          consumption,
          registration: { ...f.registration, action: 'different' },
          registered: evidence('old-Session-registration'),
          association: null,
        },
      ],
    }
    expect(projectSessionLog(snapshot, f.observation, f.reads)).toEqual({
      kind: 'rejected',
      failure: { kind: 'conflict', operation: f.observation.operation },
    })
    const { operation: _operation, ...omitted } = f.observation
    expect(projectSessionLog(snapshot, omitted, f.reads)).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'unavailable', owner: '@omne-harness/session-contract' },
    })
    expect(projectSessionLog(f.snapshot, omitted, f.reads).kind).toBe('entries')
    expect(
      projectSessionLog(snapshot, { ...f.observation, operation: '' as never }, f.reads),
    ).toMatchObject({ kind: 'rejected', failure: { kind: 'invalid', field: 'operation' } })
    expect(
      projectSessionLog(
        snapshot,
        { ...f.observation, session: 'foreign' as never, operation: '' as never },
        f.reads,
      ),
    ).toMatchObject({ kind: 'rejected', failure: { kind: 'denied' } })
    expect(snapshot.callRegistrations).toHaveLength(1)
    expect(snapshot.callRegistrations[0]?.registration.action).toBe('different')
  })
  it('requires explicit purpose and original initiating attempt for old calls', async () => {
    const f = await observed()
    const binding = {
      producer: { kind: 'model' as const, call: 'model-reference' },
      action: 'action',
      consumer: { owner: 'o', work: 'w', position: 'p', purpose: 'extension' },
      request: evidence('request'),
      initiatingAttempt: f.snapshot.run.kind === 'active' ? f.snapshot.run.advance!.attempt : null,
    }
    const observation = {
      ...f.observation,
      sequence: null,
      consequences: [{ kind: 'call' as const, consumption, binding }],
    }
    expect(projectSessionLog(f.snapshot, observation, f.reads)).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'unavailable' },
    })
    expect(
      projectSessionLog(
        f.snapshot,
        {
          ...observation,
          consequences: [
            {
              kind: 'call-registration',
              consumption,
              registration: {
                kind: 'associated',
                binding: { ...binding, initiatingAttempt: 'guess-from-id' as never },
                purpose: 'extension',
              },
            },
          ],
        },
        f.reads,
      ),
    ).toMatchObject({ kind: 'rejected', failure: { kind: 'unavailable' } })
    expect(
      projectSessionLog(
        f.snapshot,
        {
          ...observation,
          consequences: [
            {
              kind: 'call-registration',
              consumption,
              registration: { kind: 'associated', binding, purpose: 'extension' },
            },
            {
              kind: 'producer',
              consumption,
              binding,
              result: {
                producer: { kind: 'model', call: 'different' },
                version: '1',
                delivery: null,
                source: evidence('result'),
              },
            },
          ],
        },
        f.reads,
      ),
    ).toMatchObject({ kind: 'rejected', failure: { kind: 'invalid', field: 'result.producer' } })
  })
  it('does not let final-root equality excuse uncommitted prefix effects or partial SE38', async () => {
    const f = await observed()
    const index = f.snapshot.historyIndex!
    const attempt = index.attempts[0]!
    const boundary = index.executions[0]!
    const input = f.snapshot.pending[0]!
    const accepted = evidence('original-accepted')
    const member = {
      ordinal: '0',
      run: attempt.run,
      execution: attempt.execution,
      operation: 'original-submit',
      accepted,
      attempt: attempt.attempt,
    }
    const inputs = index.inputs.map(item =>
      item.input === input ? { ...item, count: '1', version: '1', members: [member] } : item,
    )
    const snapshot = {
      ...f.snapshot,
      run: {
        kind: 'terminal' as const,
        terminal: { run: attempt.run, outcome: 'cancelled' as const, evidence: evidence('cancel') },
      },
      historyIndex: {
        ...index,
        inputs,
        executions: [
          {
            ...boundary,
            facts: [{ sequence: '1', source: f.observation.source, kinds: ['producer' as const] }],
          },
        ],
      },
    }
    const reads = {
      ...f.reads,
      admissions: [
        {
          input,
          directory: inputs[0]!.directory,
          version: '1',
          offset: '0',
          next: null,
          records: [
            {
              ...member,
              runStarted: boundary.started,
              attemptStarted: attempt.started,
              attachment: 'attachment-original',
              grant: evidence('grant-original'),
            },
          ],
        },
      ],
    }
    const command = {
      kind: 'freeze' as const,
      input: {
        ...f.scene.base,
        operation: operationId('freeze'),
        verdict: { cause: 'tool-shape-lost' as const, evidence: evidence('shape-lost') },
      },
    }
    const result = decide(snapshot, command, [], null, { compaction: null, history: reads })
    expect(result).toMatchObject({ kind: 'rejected', failure: { kind: 'unavailable' } })
    const revision = String(BigInt(snapshot.revision) + 1n) as WorkSnapshot['revision']
    const rows = [
      encodeEntry(
        { kind: 'session.frozen', evidence: evidence('shape-lost') },
        { owner: 'session', via: 'test', source: evidence('freeze') },
      ),
    ].map((entry, i) => ({ ...entry, id: String(i) as HistoryEntry['id'], revision }))
    expect(reduce(snapshot, { revision, entries: rows }, reads)).toMatchObject({
      kind: 'quarantined',
    })
  })
})

describe('unassociated control responsibility', () => {
  it('cancel clears business waiting; association preserves the original control until an explicit progress fact', async () => {
    const f = await registered()
    const initial = reduce(
      f.snapshot,
      committed(f.snapshot, projectSessionLog(f.snapshot, f.observation, f.reads)),
      f.reads,
    )
    if (initial.kind !== 'reduced') throw new Error(initial.diagnostic)
    const snapshot = initial.snapshot
    const request = {
      kind: 'control' as const,
      input: {
        ...f.scene.base,
        operation: operationId('cancel-original'),
        intent: { kind: 'cancel-run' as const, run: f.observation.run, urgency: 'force' as const },
      },
    }
    const decision = decide(snapshot, request, [], null, { compaction: null })
    const cancelled = reduce(snapshot, committed(snapshot, decision))
    if (cancelled.kind !== 'reduced') throw new Error(cancelled.diagnostic)
    expect(cancelled.snapshot.callWaits).toEqual([])
    expect(cancelled.snapshot.waiting).toEqual([])
    expect(openWork(cancelled.snapshot).unassociatedWaiting).toEqual([
      { consumption, position: 'position' },
    ])
    expect(openWork(cancelled.snapshot).unsettledControls).toEqual([request.input.operation])
    const binding = {
      ...f.registration,
      producer: { kind: 'tool' as const, call: 'real-tool-reference' },
    }
    const observation = {
      ...f.observation,
      sequence: null,
      revision: '6',
      executionEvidence: evidence('head-six'),
      source: evidence('original-association'),
      consequences: [
        {
          kind: 'call-association' as const,
          consumption,
          binding,
          source: evidence('original-association'),
        },
      ],
    }
    const index = f.snapshot.historyIndex!
    const current = {
      ...cancelled.snapshot,
      historyIndex: {
        ...index,
        executions: index.executions.map(item => ({
          ...item,
          readThrough: '1',
          interpreted: evidence('interpret-one'),
          revision: '6',
          executionEvidence: evidence('head-six'),
        })),
      },
    }
    const associated = reduce(
      current,
      committed(current, projectSessionLog(current, observation, f.reads)),
      f.reads,
    )
    if (associated.kind !== 'reduced') throw new Error(associated.diagnostic)
    expect(associated.snapshot.waiting).toEqual([])
    expect(associated.snapshot.controls[0]).toMatchObject({
      operation: request.input.operation,
      pendingUnassociatedWaiting: [],
      pending: [binding.producer],
      state: 'propagating',
    })
    expect(openWork(associated.snapshot).unassociatedWaiting).toEqual([])
    expect(openWork(associated.snapshot).unsettledControls).toEqual([request.input.operation])
    expect(associated.snapshot.callRegistrations?.[0]?.registered).toEqual(
      snapshot.callRegistrations?.[0]?.registered,
    )
    const progress = associated.snapshot.controls[0]!
    const unknown = { ...observation, consequences: [{ kind: 'observed' as const }] }
    expect(projectSessionLog(associated.snapshot, unknown, f.reads)).toEqual({
      kind: 'entries',
      entries: [],
    })
    const settled = {
      ...observation,
      consequences: [
        {
          kind: 'control' as const,
          progress: { ...progress, state: 'reconciled' as const, pending: [] },
        },
      ],
    }
    const final = reduce(
      associated.snapshot,
      committed(associated.snapshot, projectSessionLog(associated.snapshot, settled, f.reads)),
      f.reads,
    )
    if (final.kind !== 'reduced') throw new Error(final.diagnostic)
    expect(openWork(final.snapshot).unsettledControls).toEqual([])
  })
  it('does not treat a missing intent waiting projection as an empty idle set', async () => {
    const f = await registered()
    const { callWaits: _waits, ...withoutWaits } = f.snapshot
    const snapshot = {
      ...withoutWaits,
      run: { kind: 'none' as const },
      pending: [],
      handed: [],
      callRegistrations: [
        {
          consumption,
          registration: f.registration,
          registered: evidence('registration'),
          association: null,
        },
      ],
    }
    const { judgeIdle } = await import('@omne-harness/session-contract')
    const coverage = {
      own: evidence('own'),
      relations: evidence('relations'),
      children: [],
      calls: [],
      completeScope: evidence('scope'),
    }
    expect(
      judgeIdle(snapshot, {
        policy: { kind: 'enabled', idleMs: '1' },
        observation: {
          kind: 'interval',
          started: '0',
          through: {
            at: '2',
            protocol: { owner: 'clock', name: 'fixture', revision: '1', digest: 'fixture' },
            source: evidence('sample'),
          },
          elapsedMs: '2',
          source: evidence('clock'),
          coverage,
        },
        coverage,
      }),
    ).toMatchObject({ kind: 'unavailable' })
  })
})

describe('whole release batches and historical taken', () => {
  it('requires the exact SE38 set and keeps PM-02 rejected input out of the remainder', async () => {
    const s = await open()
    await s.accept('second')
    const first = await s.active()
    const frozen = await s.commit({
      kind: 'freeze',
      input: {
        ...s.base,
        operation: operationId('freeze-active'),
        verdict: { cause: 'tool-shape-lost', evidence: evidence('freeze') },
      },
    })
    expect('ok' in frozen).toBe(true)
    const snapshot = await s.read()
    const material = s.history.read(
      snapshot,
      s.port.controls.entriesOf(s.access.tenant, s.access.session),
      { kind: 'pending', inputs: snapshot.pending },
    )
    const command = {
      kind: 'finishRun' as const,
      input: {
        ...s.base,
        operation: operationId('reject-first'),
        run: first.run.run,
        expected: snapshot.revision,
        bounded: {
          kind: 'admission-rejected' as const,
          input: first.run.first,
          rejection: evidence('not-created'),
        },
      },
    }
    const decision = decide(snapshot, command, [], null, {
      compaction: null,
      history: material.reads,
    })
    const batch = committed(snapshot, decision)
    const result = reduce(snapshot, batch, material.reads)
    expect(result).toMatchObject({
      kind: 'reduced',
      snapshot: { pending: [], run: { terminal: { outcome: 'failed' } } },
    })
    const release = batch.entries.find(entry => entry.kind === 'intake.released')
    if (release === undefined) throw new Error('missing SE38')
    expect(decodeEntry(release)).toMatchObject({ ok: { inputs: ['second'] } })
    expect(
      reduce(
        snapshot,
        { ...batch, entries: batch.entries.filter(entry => entry.kind !== 'intake.released') },
        material.reads,
      ),
    ).toMatchObject({ kind: 'quarantined' })
    const standalone = {
      ...batch,
      entries: batch.entries.filter(entry => entry.kind === 'intake.released'),
    }
    expect(reduce(snapshot, standalone, material.reads)).toMatchObject({ kind: 'quarantined' })
    expect(snapshot.pending).toEqual(['first', 'second'])
  })
  it('late original SE14 removes only its input and leaves a successor advance, taken and waiting intact', async () => {
    const s = await open()
    const { run, advance } = await s.active()
    await s.commit({
      kind: 'receive',
      input: {
        ...s.base,
        operation: operationId('original-submit'),
        fact: {
          kind: 'input-handover',
          execution: run.execution.execution,
          input: run.first,
          result: { kind: 'accepted', receipt: evidence('accepted') },
        },
      },
    })
    const observation: SessionLogObservation = {
      ...s.base,
      run: run.run,
      execution: run.execution.execution,
      sequence: '1',
      revision: '2',
      source: evidence('taken-event'),
      executionEvidence: evidence('taken-head'),
      consequences: [
        {
          kind: 'input-taken',
          batch: {
            id: 'original-batch' as never,
            ordered: [run.first],
            watermark: evidence('original-watermark'),
          },
        },
      ],
    }
    s.history.observe(observation)
    const previous = await s.read()
    const successor = {
      ...run,
      run: 'successor' as typeof run.run,
      advance: {
        ...advance,
        run: 'successor' as typeof run.run,
        attempt: 'successor-attempt' as typeof advance.attempt,
      },
      execution: {
        execution: 'successor-execution',
        revision: null,
        evidence: null,
        readThrough: '0',
      },
    }
    const snapshot = {
      ...previous,
      run: successor,
      handed: [],
      taken: ['successor-input' as never],
    }
    const material = s.history.read(
      previous,
      s.port.controls.entriesOf(s.access.tenant, s.access.session),
      { kind: 'selected', inputs: [run.first] },
    )
    const result = reduce(
      snapshot,
      committed(snapshot, projectSessionLog(snapshot, observation, material.reads)),
      material.reads,
    )
    if (result.kind !== 'reduced') throw new Error(result.diagnostic)
    expect(result.snapshot.pending).toEqual([])
    expect(result.snapshot.run).toEqual(successor)
    expect(result.snapshot.taken).toEqual(snapshot.taken)
    expect(result.snapshot.waiting).toEqual(snapshot.waiting)
    const badOrder = {
      ...observation,
      consequences: [
        {
          kind: 'input-taken' as const,
          batch: {
            id: 'original-batch' as never,
            ordered: [run.first, 'invented' as never],
            watermark: evidence('original-watermark'),
          },
        },
      ],
    }
    expect(projectSessionLog(snapshot, badOrder, material.reads)).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'batch' },
    })
  })
})

describe('original admission directory pages', () => {
  it('rejects missing, duplicate, shifted, altered and incomplete pages before interpreting a taken batch', async () => {
    const s = await open()
    const { run } = await s.active()
    const accepted = await s.commit({
      kind: 'receive',
      input: {
        ...s.base,
        operation: operationId('submit-page'),
        fact: {
          kind: 'input-handover',
          execution: run.execution.execution,
          input: run.first,
          result: { kind: 'accepted', receipt: evidence('page-admission') },
        },
      },
    })
    expect('ok' in accepted).toBe(true)
    const observation: SessionLogObservation = {
      ...s.base,
      run: run.run,
      execution: run.execution.execution,
      revision: '9007199254740993',
      sequence: '1',
      source: evidence('taken-original'),
      executionEvidence: evidence('head-original'),
      consequences: [
        {
          kind: 'input-taken',
          batch: {
            id: 'page-batch' as never,
            ordered: [run.first],
            watermark: evidence('watermark'),
          },
        },
      ],
    }
    s.history.observe(observation)
    const snapshot = await s.read()
    const reads = s.history.read(
      snapshot,
      s.port.controls.entriesOf(s.access.tenant, s.access.session),
      { kind: 'selected', inputs: [run.first] },
    ).reads
    expect(projectSessionLog(snapshot, observation, reads).kind).toBe('entries')
    const page = reads.admissions[0]!
    const record = page.records[0]!
    const variants = [
      [],
      [page, page],
      [{ ...page, offset: '1' }],
      [{ ...page, next: '0' }],
      [{ ...page, version: 'other' }],
      [{ ...page, records: [{ ...record, accepted: evidence('replaced') }] }],
      [{ ...page, records: [{ ...record, grant: { ...record.grant, revision: '' } }] }],
    ]
    for (const admissions of variants)
      expect(projectSessionLog(snapshot, observation, { ...reads, admissions }).kind).toBe(
        'rejected',
      )
    expect(
      projectSessionLog(snapshot, { ...observation, revision: '9007199254740992' }, reads),
    ).toMatchObject({ kind: 'rejected', failure: { kind: 'invalid', field: 'revision' } })
    expect(
      projectSessionLog(snapshot, observation, {
        ...reads,
        scope: { kind: 'selected', inputs: [] },
      }),
    ).toMatchObject({ kind: 'rejected', failure: { kind: 'invalid', field: 'history.scope' } })
    expect(snapshot.pending).toEqual([run.first])
  })
})
