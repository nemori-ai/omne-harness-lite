import { describe, expect, it } from 'vitest'
import type { PendingCall, PendingHandoff } from '@omne-harness/agent-contract'
import { decodeActionId } from '@omne-harness/agent-contract'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { sampleReceivedModelResult } from '@omne-harness/agent-contract/testing'
import { assistantMessage, evidence } from '@omne-harness/session-contract/testing'
import {
  EXECUTION_FIELDS,
  fieldTexts,
  fieldsDiff,
  projectExecution,
  projectFragments,
  projectOperations,
  projectReceiving,
  type ExecutionField,
} from '../src/testing/journal-records.ts'
import { canonical } from '../src/testing/canonical.ts'
import { fullViewOf } from '../src/testing/closed-items.ts'
import { JOURNAL_OWNER } from '../src/testing/journal-values.ts'
import { ok, operation, scene } from './fixtures/common-journal.ts'

const PROJECTED: readonly ExecutionField[] = [
  'id',
  'tenant',
  'revision',
  'state',
  'checkpoint',
  'attachments',
  'inputs',
  'inputRevisions',
  'retainedFrom',
  'acknowledged',
  'acknowledgedAt',
  'controls',
  'results',
  'effects',
  'observations',
  'stageReceipts',
  'observed',
  'admissions',
  'entries',
  'events',
  'finishing',
  'resultRevisions',
  'admissionLedger',
  'handoffs',
  'custodyAttempts',
  'serial',
]

describe('the reader records projected from the fold', () => {
  it('equal the writer’s records in every projected field; the rest are reported', async () => {
    const s = await scene('records-parity')
    const journal = s.view.journal
    const authority = s.opened.authority
    const commit = async (name: string, change: object) => {
      const loaded = ok(await journal.load({ ...s.access, execution: s.execution }))
      return ok(
        await journal.commit({
          ...s.access,
          execution: s.execution,
          operation: operation(name),
          authority,
          expected: loaded.revision,
          checkpoint: loaded.checkpoint,
          state: { kind: 'advancing' },
          events: [],
          effects: [],
          caller: { kind: 'none' },
          replyAdmission: null,
          handoff: null,
          finish: null,
          ...change,
        }),
      )
    }
    const loaded = ok(await journal.load({ ...s.access, execution: s.execution }))
    await commit('move', { checkpoint: { ...loaded.checkpoint, position: 'E2' } })
    const result = sampleReceivedModelResult(s.access.tenant, 'records-parity')
    if (result.delivery.producer !== 'model') throw new Error('fixture: a Model entry')
    const pending: Extract<PendingCall, { kind: 'model' }> = {
      kind: 'model',
      purpose: 'main',
      action: ok(decodeActionId('action')),
      reference: result.delivery.key.reference,
      consumption: result.consumption,
      position: result.consumer,
      fixed: evidence('request'),
    }
    const second = sampleReceivedModelResult(s.access.tenant, 'records-parity-2')
    if (second.delivery.producer !== 'model') throw new Error('fixture: a Model entry')
    const pending2: Extract<PendingCall, { kind: 'model' }> = {
      ...pending,
      action: ok(decodeActionId('action-2')),
      reference: second.delivery.key.reference,
      consumption: second.consumption,
      position: second.consumer,
    }
    const waits = [
      { kind: 'producer' as const, pending },
      { kind: 'producer' as const, pending: pending2 },
    ]
    const waiting = ok(await journal.load({ ...s.access, execution: s.execution }))
    await commit('wait', {
      checkpoint: { ...waiting.checkpoint, calls: [pending, pending2] },
      state: { kind: 'waiting', waits },
      events: [{ kind: 'waiting', waits }],
      effects: [
        { action: pending.action, pending, authority },
        { action: pending2.action, pending: pending2, authority },
      ],
    })
    ok(
      await s.view.entries.record({
        ...s.access,
        execution: s.execution,
        operation: operation('received'),
        authority: null,
        entry: result,
      }),
    )
    const { material: _material, ...draft } = second
    const committed = ok(
      await s.view.received.commit({
        ...s.access,
        execution: s.execution,
        operation: operation('received-2'),
        entry: draft,
        material: {
          kind: 'facts',
          schema: { owner: 'suite', name: 'payload', revision: '1', digest: 'fixture' },
          value: { kind: 'string', value: 'delivered' },
        },
      }),
    )
    if (committed.kind !== 'committed') throw new Error(`received ${committed.kind}`)
    ok(
      await s.view.entries.record({
        ...s.access,
        execution: s.execution,
        operation: operation('received-2-again'),
        authority: null,
        entry: committed.value.entry,
      }),
    )
    const { key } = result.delivery
    if (key.kind !== 'result') throw new Error('fixture: a Model result key')
    const handled = ok(await journal.load({ ...s.access, execution: s.execution }))
    await commit('processed', {
      // The step is done with the first call: its result closes once processed.
      checkpoint: { ...handled.checkpoint, calls: [pending2] },
      events: [
        {
          kind: 'producer',
          result: {
            producer: {
              kind: 'model',
              call: ok(resolveModelInvocationRef(key.reference, s.access.tenant)).call,
            },
            version: key.result,
            delivery: null,
            source: evidence('produced'),
          },
          consumption: result.consumption,
        },
      ],
    })
    const replyCall = ok(resolveModelInvocationRef(key.reference, s.access.tenant)).call
    ok(
      await journal.control({
        ...s.access,
        execution: s.execution,
        operation: operation('interrupt'),
        command: { kind: 'interrupt-model', call: replyCall, reason: evidence('interrupt') },
      }),
    )
    const atReply = ok(await journal.load({ ...s.access, execution: s.execution }))
    const step = atReply.checkpoint.step
    const request: PendingHandoff = {
      kind: 'execution',
      reference: { kind: 'execution', execution: s.execution, operation: operation('reply') },
      predecessor: atReply.revision,
      position: { step, node: 'I3', slot: null },
      source: {
        kind: 'model-reply',
        step,
        action: pending.action,
        call: replyCall,
        result: {
          producer: { kind: 'model', call: replyCall },
          version: key.result,
          delivery: null,
          source: evidence('reply-result'),
        },
      },
      candidate: assistantMessage('a reply the admission rejects'),
      originalAdvance: authority,
      predecessorHandoff: null,
    }
    await commit('prepare-reply', {
      checkpoint: { ...atReply.checkpoint, position: 'Q2', currentHandoff: request.reference },
      handoff: { kind: 'prepare', request },
    })
    const beforeJa = ok(await journal.load({ ...s.access, execution: s.execution }))
    await commit('reject-reply', {
      checkpoint: { ...beforeJa.checkpoint, position: 'Q4', currentHandoff: null },
      replyAdmission: {
        step,
        action: pending.action,
        call: replyCall,
        resultVersion: key.result,
        decision: 'rejected',
        source: evidence('rejected'),
      },
      handoff: {
        kind: 'resolve',
        outcome: {
          request,
          origin: null,
          provider: { owner: 'suite', name: 'handoff', revision: '1', digest: 'suite:handoff' },
          qualification: evidence('qualification/reply'),
          record: evidence('record/reply'),
          decision: { kind: 'rejected', reason: 'malformed', evidence: evidence('rejected') },
        },
      },
    })
    ok(
      await s.view.materials.preserve({
        ...s.access,
        execution: s.execution,
        identity: 'kept',
        consumer: { owner: 'suite', work: 'work', position: 'at', purpose: 'action' },
        value: {
          kind: 'facts',
          schema: { owner: 'suite', name: 'payload', revision: '1', digest: 'fixture' },
          value: { kind: 'string', value: 'kept' },
        },
      }),
    )
    ok(
      await journal.acknowledge({
        ...s.access,
        execution: s.execution,
        operation: operation('ack'),
        through: '1',
        receipt: null,
      }),
    )
    ok(
      await journal.detach({
        ...s.access,
        execution: s.execution,
        operation: operation('detach'),
        authority,
        reason: evidence('reason'),
      }),
    )

    const { view, closed, blobs, namespace } = s.view.controls.facts()
    const written = [...s.view.controls.records().values()].find(item => item.id === s.execution)
    if (written === undefined) throw new Error('the writer keeps no record of the execution')
    const open = view.executions.get(s.execution)
    if (open === undefined) throw new Error('the fold holds no view of the execution')
    // The writer keeps every record it wrote: compare it with the projection of the whole record.
    expect(open.intents.size).toBe(1)
    const folded = fullViewOf(open, closed)
    const context = {
      tenant: s.access.tenant,
      blobs,
      mint: { owner: JOURNAL_OWNER, session: namespace },
      eventSchema: {
        owner: JOURNAL_OWNER,
        name: 'agent-event',
        revision: '1',
        digest: 'memory:agent-event',
      },
      admissionRule: {
        owner: JOURNAL_OWNER,
        name: 'reply-admission-projection',
        revision: '1',
        digest: 'memory:reply-admission-projection',
      },
    }
    const projected = projectExecution(folded, context)
    const diff = fieldsDiff(written, projected)
    // A core holds the open operations (exclusions); what one answered is a closed item.
    const writtenOps = [...s.view.controls.operations().entries()]
      .filter(([, record]) => record.kind === 'excluded')
      .map(([key, record]) => [key, { ...record, key: '' }])
      .sort()
    const projectedOps = [...projectOperations(folded, context).entries()].sort()
    const opsDiff = writtenOps.flatMap(([key, record], index) => {
      const other = projectedOps[index]
      return other !== undefined && other[0] === key && canonical(other[1]) === canonical(record)
        ? []
        : [
            `${String(key)}:\n    writer:    ${canonical(record).slice(0, 400)}\n    projected: ${other === undefined ? '(absent)' : canonical(other[1]).slice(0, 400)}`,
          ]
    })
    const report = [
      `equal (${String(diff.equal.length)}/${String(EXECUTION_FIELDS.length)}): ${diff.equal.join(', ')}`,
      `differ: ${diff.differ.join(', ')}`,
      `missing: ${diff.missing.join(', ')}`,
      `operations: ${String(writtenOps.length)} written, ${String(projectedOps.length)} projected, ${String(opsDiff.length)} differ`,
      ...opsDiff.map(line => `  ${line}`),
      ...diff.differ.map(field => {
        const { expected, actual } = fieldTexts(written, projected, field)
        return `  ${field}:\n    writer:    ${expected.slice(0, 400)}\n    projected: ${actual.slice(0, 400)}`
      }),
    ].join('\n')
    console.log(`records parity\n${report}`)
    for (const field of PROJECTED) expect(diff.equal, `${field}\n${report}`).toContain(field)
    expect(opsDiff, report).toEqual([])
    expect(projectedOps.length).toBe(writtenOps.length)

    const execution = projected as Parameters<typeof projectFragments>[0]
    const fragments = projectFragments(execution, folded, context)
    const receiving = projectReceiving([{ view: folded, execution }], context)
    const entriesOf = (map: ReadonlyMap<string, unknown>) =>
      [...map.entries()].map(([key, value]) => `${key}=${canonical(value)}`).sort()
    const compare = (
      name: string,
      written: ReadonlyMap<string, unknown>,
      value: ReadonlyMap<string, unknown>,
    ) => {
      const expected = entriesOf(written)
      const actual = entriesOf(value)
      return canonical(expected) === canonical(actual)
        ? `${name}: equal (${String(expected.length)})`
        : `${name}: DIFFER\n    writer:    ${canonical(expected).slice(0, 600)}\n    projected: ${canonical(actual).slice(0, 600)}`
    }
    const writtenFragments = s.view.controls.fragments()
    const writtenReceiving = s.view.controls.receiving()
    const lines = [
      ...(['eventReceipts', 'pendingEvents', 'callOrigins', 'human', 'indexedEvents'] as const).map(
        name => compare(name, writtenFragments[name], fragments[name]),
      ),
      ...(
        [
          'materials',
          'deliveries',
          'aliases',
          'pendingBindings',
          'targets',
          'callTargets',
          'executionTargets',
          'toolTargets',
        ] as const
      ).map(name => compare(name, writtenReceiving[name], receiving[name])),
    ]
    console.log(`fragments and receiving parity\n${lines.join('\n')}`)
    expect(lines.filter(line => line.includes('DIFFER'))).toEqual([])
    expect(writtenReceiving.deliveries.size).toBeGreaterThanOrEqual(2)
    expect(writtenReceiving.materials.size).toBeGreaterThanOrEqual(2)
    // A recognition is answered from its closed answer: only received operations keep an alias.
    expect(writtenReceiving.aliases.size).toBe(writtenReceiving.deliveries.size)
    expect(writtenReceiving.targets.size).toBe(2)
    expect(writtenFragments.callOrigins.size).toBe(2)
  })
})
