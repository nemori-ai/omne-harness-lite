import { expect, it } from 'vitest'
import { decodeActionId, type PendingCall } from '@omne-harness/agent-contract'
import { sampleReceivedModelResult } from '@omne-harness/agent-contract/testing'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { evidence } from '@omne-harness/session-contract/testing'
import { ok, operation } from './fixtures/common-journal.ts'
import { sqlScene } from './fixtures/sql-scene.ts'

it('a delivery of a result that has closed is recognized from the store, by a cold provider too', async () => {
  const s = await sqlScene('closed-delivery')
  try {
    const journal = s.view.journal
    const { authority } = ok(await journal.open(s.openInput))
    const load = async () => ok(await journal.load({ ...s.access, execution: s.execution }))
    const commit = async (name: string, change: object) => {
      const loaded = await load()
      ok(
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
    const result = sampleReceivedModelResult(s.access.tenant, 'closed-delivery')
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
    const commitReceived = async (name: string, view = s.view) => {
      const answer = ok(
        await view.received!.commit({
          ...s.access,
          execution: s.execution,
          operation: operation(name),
          entry: draft,
          material: {
            kind: 'facts',
            schema: { owner: 'suite', name: 'payload', revision: '1', digest: 'fixture' },
            value: { kind: 'string', value: 'delivered' },
          },
        }),
      )
      if (answer.kind !== 'committed') throw new Error(`received ${answer.kind}`)
      return answer.value
    }
    const first = await commitReceived('received')
    const record = (name: string, view = s.view) =>
      view.entries.record({
        ...s.access,
        execution: s.execution,
        operation: operation(name),
        authority: null,
        entry: first.entry,
      })
    // The step is done with the call: once processed, its intent and result close.
    await commit('processed', {
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
    })
    const open = (family: string, item: string) =>
      s.controls
        ?.select(`SELECT open FROM er_item WHERE family = '${family}' AND item = '${item}'`)
        .rows.map(row => Number(row[0]))
    // The result is processed and the call is no longer held: result and binding are closed.
    expect(open('result', result.consumption)).toEqual([0])
    expect(open('binding', key.reference)).toEqual([0])

    expect(await commitReceived('again')).toEqual(first)
    expect(ok(await record('again-recorded'))).toEqual(first.receipt)
    const cold = s.fresh()
    expect(await commitReceived('again-cold', cold)).toEqual(first)
    const query = { access: s.access, consumer: result.consumer, reference: key.reference }
    const target = ok(await s.view.targets.resolve({ ...query, execution: s.execution }))
    expect(target).toMatchObject({ execution: s.execution, pending })
    expect(ok(await s.fresh().targets.resolve({ ...query, execution: s.execution }))).toEqual(
      target,
    )
  } finally {
    await s.close()
  }
})
