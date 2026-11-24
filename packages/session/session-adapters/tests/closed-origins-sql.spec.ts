import { expect, it } from 'vitest'
import { decodeActionId, type PendingCall } from '@omne-harness/agent-contract'
import { sampleReceivedModelResult } from '@omne-harness/agent-contract/testing'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { evidence } from '@omne-harness/session-contract/testing'
import { readExecutionInterpretation } from '../src/cordis/journal-state.ts'
import { ok, operation } from './fixtures/common-journal.ts'
import { sqlScene } from './fixtures/sql-scene.ts'

// One call from its wait to the processing of its result; `cold` commits the processing through
// a provider that has read nothing of the wait.
async function consequences(name: string, cold: boolean) {
  const s = await sqlScene(name)
  try {
    const journal = s.view.journal
    const { authority } = ok(await journal.open(s.openInput))
    const load = async () => ok(await journal.load({ ...s.access, execution: s.execution }))
    const commit = async (id: string, change: object, view = s.view) => {
      const loaded = await load()
      ok(
        await view.journal.commit({
          ...s.access,
          execution: s.execution,
          operation: operation(id),
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
    const result = sampleReceivedModelResult(s.access.tenant, 'origins')
    if (result.delivery.producer !== 'model' || result.delivery.key.kind !== 'result')
      throw new Error('fixture: a Model result entry')
    const { key } = result.delivery
    const pending: Extract<PendingCall, { kind: 'model' }> = {
      kind: 'model',
      purpose: 'main',
      action: ok(decodeActionId('action')),
      reference: key.reference,
      consumption: result.consumption,
      position: result.consumer,
      fixed: evidence('request'),
    }
    const waits = [{ kind: 'producer' as const, pending }]
    await commit('wait', {
      checkpoint: { ...(await load()).checkpoint, calls: [pending] },
      state: { kind: 'waiting', waits },
      events: [{ kind: 'waiting', waits }],
      effects: [{ action: pending.action, pending, authority }],
    })
    const { material: _material, ...draft } = result
    ok(
      await s.view.received!.commit({
        ...s.access,
        execution: s.execution,
        operation: operation('received'),
        entry: draft,
        material: {
          kind: 'facts',
          schema: { owner: 'suite', name: 'payload', revision: '1', digest: 'fixture' },
          value: { kind: 'string', value: 'delivered' },
        },
      }),
    )
    await commit(
      'processed',
      {
        checkpoint: { ...(await load()).checkpoint, calls: [] },
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
      },
      cold ? s.fresh() : s.view,
    )
    const read = await readExecutionInterpretation(
      {
        storage: s.storage,
        tenantDomainLookup: { lookup: () => Promise.resolve({ kind: 'ready', domain: s.domain }) },
      },
      { tenant: s.access.tenant, session: s.access.session, execution: s.execution, after: '0' },
    )
    if (read.kind !== 'read' || read.execution === null) throw new Error('the events are not read')
    return read.execution.events.map(event => ({
      sequence: event.sequence,
      kinds: event.consequences?.map(item => item.kind) ?? null,
    }))
  } finally {
    await s.close()
  }
}

it('a provider that read nothing of a call gives its later events the same consequences', async () => {
  const warm = await consequences('origins-warm', false)
  expect(warm.at(-1)?.kinds).not.toBeNull()
  expect(await consequences('origins-cold', true)).toEqual(warm)
})
