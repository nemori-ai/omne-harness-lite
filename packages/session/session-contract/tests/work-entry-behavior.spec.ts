import { describe, expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness/message'
import {
  decide,
  projectSessionLog,
  openWork,
  type ConsumptionId,
  type SessionLogObservation,
} from '@omne-harness/session-contract'
import { evidence, operationId, succeeded } from '@omne-harness/session-contract/testing'
import { compactionReads } from '../src/model-view.ts'
import { requiredWorkEntries } from '../src/work-entry-state.ts'
import { open, participation } from './scene.ts'

async function controlledIntent() {
  const s = await open()
  const { run, advance } = await s.active()
  const consumption = 'entry-index-consumption' as ConsumptionId
  const registration = {
    kind: 'tool-intent' as const,
    action: 'tool-action',
    consumer: {
      owner: 'session',
      work: 'original-work',
      position: 'original-position',
      purpose: 'action',
    },
    request: evidence('request'),
    initiatingAttempt: advance.attempt,
    purpose: 'action' as const,
  }
  const observation: SessionLogObservation = {
    ...s.base,
    run: run.run,
    execution: run.execution.execution,
    revision: '1',
    sequence: '1',
    source: evidence('intent-event'),
    executionEvidence: evidence('head-one'),
    consequences: [
      { kind: 'call-registration', consumption, registration },
      {
        kind: 'registered-waiting',
        calls: [{ consumption, position: registration.consumer.position }],
        other: [],
      },
    ],
  }
  succeeded(await s.project(observation, operationId('intent-interpretation')), 'intent')
  const original = await s.read()
  succeeded(
    await s.commit({
      kind: 'control',
      input: {
        ...s.base,
        operation: operationId('original-cancel'),
        intent: { kind: 'cancel-run', run: run.run, urgency: 'force' },
      },
    }),
    'cancel',
  )
  await s.start('successor')
  const binding = {
    producer: { kind: 'tool' as const, call: 'real-invocation' },
    action: registration.action,
    consumer: registration.consumer,
    request: registration.request,
    initiatingAttempt: registration.initiatingAttempt,
  }
  succeeded(
    await s.project(
      {
        ...observation,
        sequence: '2',
        revision: '2',
        source: evidence('association-event'),
        executionEvidence: evidence('head-two'),
        consequences: [
          {
            kind: 'call-association',
            consumption,
            binding,
            source: evidence('association-source'),
          },
        ],
      },
      operationId('association-interpretation'),
    ),
    'association',
  )
  return { s, original, observation, consumption, binding }
}

function compactionCommand(
  snapshot: Awaited<ReturnType<Awaited<ReturnType<typeof open>>['read']>>,
  from: string,
  to: string,
  retained: readonly string[],
) {
  if (snapshot.run.kind !== 'active') throw new Error('active compaction fixture')
  const message = judgeMessage({
    id: 'msg_abcdefghijklmnopqrstuv',
    role: 'compaction',
    blocks: [
      {
        kind: 'text',
        id: 'summary',
        text: 'summary',
        visibility: { toHuman: true, toModel: true },
      },
    ],
    covers: { from, to },
    retained,
    derivation: evidence('summary'),
  })
  if (!('ok' in message) || message.ok.role !== 'compaction')
    throw new Error('compaction message fixture')
  return {
    kind: 'commitDerived' as const,
    input: {
      tenant: snapshot.tenant,
      session: snapshot.session,
      operation: operationId('compact'),
      participation: participation(snapshot.run.execution.execution, 'context-transition'),
      judgment: evidence('summary'),
      value: { kind: 'compaction' as const, message: message.ok },
    },
  }
}

describe('trusted work-entry references', () => {
  it('keeps original control selection after cancellation and association, rejects each omitted lower-bound reference', async () => {
    const { s, original, observation } = await controlledIntent()
    const snapshot = await s.read()
    expect(snapshot.waiting).toEqual([])
    expect(openWork(snapshot).unassociatedWaiting).toEqual([])
    expect(openWork(snapshot).unsettledControls).toEqual([operationId('original-cancel')])
    const index = snapshot.workEntryIndex!
    expect(index.calls[0]?.registered).toBe(original.workEntryIndex?.calls[0]?.registered)
    expect(index.controls[0]?.selected[0]?.waiting).toBe(
      original.workEntryIndex?.calls[0]?.waits[0]?.entry,
    )
    expect(index.controls[0]?.selected[0]?.association).toBe(index.calls[0]?.association)
    const required = requiredWorkEntries(snapshot)
    expect(required).toHaveLength(5)
    const rows = s.port.controls.entriesOf(s.access.tenant, s.access.session)
    const firstRequired = rows.findIndex(row => required.includes(row.id))
    const through = rows[firstRequired - 1]!.id
    const user = rows.find(row => row.kind === 'message.user')!.id
    const reads = compactionReads(rows, snapshot, through)!
    const command = compactionCommand(snapshot, rows[0]!.id, through, [user])
    expect(decide(snapshot, command, [], null, { compaction: reads }).kind).toBe('entries')
    expect(reads.after.filter(row => required.some(ref => ref === String(row.ref)))).toHaveLength(5)
    expect(
      reads.after
        .filter(row => required.some(ref => ref === String(row.ref)))
        .every(row => row.message === null),
    ).toBe(true)
    expect(new Set(reads.open).size).toBe(reads.open.length)
    for (const missing of required)
      expect(
        decide(snapshot, command, [], null, {
          compaction: { ...reads, open: reads.open.filter(ref => String(ref) !== missing) },
        }),
      ).toMatchObject({
        kind: 'rejected',
        failure: { kind: 'invalid', field: 'reads.compaction.open' },
      })
    const { workEntryIndex: _index, ...missingIndex } = snapshot
    expect(decide(missingIndex, command, [], null, { compaction: reads })).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'unavailable', owner: 'session-history' },
    })
    const unknown = {
      ...observation,
      sequence: null,
      revision: '2',
      executionEvidence: evidence('head-two'),
      source: evidence('unknown-answer'),
      consequences: [{ kind: 'observed' as const }],
    }
    expect(projectSessionLog(snapshot, unknown).kind).toBe('entries')
    expect(requiredWorkEntries(snapshot)).toEqual(required)
  })
  it('recognizes an interpreted intent after association without restoring waiting, while rejecting changed identity', async () => {
    const { s, observation } = await controlledIntent()
    const snapshot = await s.read()
    const before = structuredClone(snapshot)
    const replay = {
      ...observation,
      revision: '2',
      executionEvidence: evidence('head-two'),
      operation: operationId('replay-intent'),
    }
    expect(projectSessionLog(snapshot, replay)).toEqual({ kind: 'entries', entries: [] })
    expect(
      projectSessionLog(snapshot, { ...replay, source: evidence('wrong-event') }),
    ).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'source' },
    })
    const original = replay.consequences[0]!
    if (original.kind !== 'call-registration' || original.registration.kind !== 'tool-intent')
      throw new Error('intent fixture')
    expect(
      projectSessionLog(snapshot, {
        ...replay,
        consequences: [
          { ...original, registration: { ...original.registration, action: 'changed-action' } },
          replay.consequences[1]!,
        ],
      }),
    ).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'conflict', operation: replay.operation },
    })
    expect(snapshot).toEqual(before)
  })
  it('recognizes an old control progress after settlement without reopening it, but checks its original target', async () => {
    const { s, observation } = await controlledIntent()
    const progress = (await s.read()).controls[0]!
    const oldProgress: SessionLogObservation = {
      ...observation,
      sequence: '3',
      revision: '3',
      source: evidence('old-progress'),
      executionEvidence: evidence('head-three'),
      consequences: [{ kind: 'control', progress: { ...progress, state: 'propagating' } }],
    }
    succeeded(await s.project(oldProgress, operationId('old-progress-interpretation')), 'progress')
    succeeded(
      await s.project(
        {
          ...oldProgress,
          sequence: '4',
          revision: '4',
          source: evidence('settled-progress'),
          executionEvidence: evidence('head-four'),
          consequences: [
            {
              kind: 'control',
              progress: {
                ...progress,
                state: 'reconciled',
                pending: [],
                pendingUnassociatedWaiting: [],
              },
            },
          ],
        },
        operationId('settled-progress-interpretation'),
      ),
      'settle',
    )
    const snapshot = await s.read()
    const before = structuredClone(snapshot)
    const replay = { ...oldProgress, revision: '4', executionEvidence: evidence('head-four') }
    expect(projectSessionLog(snapshot, replay)).toEqual({ kind: 'entries', entries: [] })
    expect(
      projectSessionLog(snapshot, {
        ...replay,
        consequences: [{ kind: 'control', progress: { ...progress, target: { kind: 'session' } } }],
      }),
    ).toMatchObject({ kind: 'rejected', failure: { kind: 'invalid', field: 'control' } })
    expect(snapshot).toEqual(before)
    expect(requiredWorkEntries(snapshot)).toEqual([])
  })
  it('cannot retain a required non-message as if it were model content, and releases control references only when settled', async () => {
    const { s, observation } = await controlledIntent()
    const snapshot = await s.read()
    const rows = s.port.controls.entriesOf(s.access.tenant, s.access.session)
    const required = requiredWorkEntries(snapshot)
    const user = rows.find(row => row.kind === 'message.user')!.id
    const reads = compactionReads(rows, snapshot, rows.at(-1)!.id)!
    for (const retained of [[user], [user, ...required]]) {
      const command = compactionCommand(snapshot, rows[0]!.id, rows.at(-1)!.id, retained)
      expect(decide(snapshot, command, [], null, { compaction: reads })).toMatchObject({
        kind: 'rejected',
        failure: { kind: 'invalid', field: 'value.message' },
      })
    }
    const progress = snapshot.controls[0]!
    succeeded(
      await s.project(
        {
          ...observation,
          revision: '3',
          sequence: '3',
          source: evidence('control-proof'),
          executionEvidence: evidence('head-three'),
          consequences: [
            {
              kind: 'control',
              progress: {
                ...progress,
                state: 'reconciled',
                pending: [],
                pendingUnassociatedWaiting: [],
              },
            },
          ],
        },
        operationId('settle-original'),
      ),
      'settle',
    )
    const settled = await s.read()
    expect(openWork(settled).unsettledControls).toEqual([])
    expect(requiredWorkEntries(settled)).toEqual([])
    expect(settled.waiting).toEqual([])
  })
})
