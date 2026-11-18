import { expect, it } from 'vitest'
import type { ReceivedEntry } from '@omne-harness/agent-contract'
import { resolveToolInvocationRef } from '@omne-harness/tool-contract'
import { decodeToolResultVersion } from '@omne-harness/tool-contract/provider'
import { evidence } from '@omne-harness/session-contract/testing'
import { resultKey } from '../src/journal/index.ts'
import { ok, operation } from './fixtures/common-journal.ts'
import { sqlScene } from './fixtures/sql-scene.ts'
import { toolCall } from './fixtures/tool-call.ts'

const MATERIAL = {
  kind: 'facts' as const,
  schema: { owner: 'suite', name: 'payload', revision: '1', digest: 'fixture' },
  value: { kind: 'string' as const, value: 'delivered' },
}

it('the outcome of a backgrounded call is kept as a result of its own, after the placeholder closed', async () => {
  const s = await sqlScene('closed-background')
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
    const tool = toolCall(s.access.tenant, 'background')
    const { pending } = tool
    if (tool.entry.delivery.producer !== 'tool') throw new Error('fixture: a Tool entry')
    const { reference } = tool.entry.delivery.key
    const placeholder: ReceivedEntry = {
      ...tool.entry,
      delivery: { producer: 'tool', key: { kind: 'placeholder', producer: 'tool', reference } },
    }
    const outcome: ReceivedEntry = {
      ...tool.entry,
      delivery: {
        producer: 'tool',
        key: {
          kind: 'result',
          producer: 'tool',
          reference,
          result: ok(decodeToolResultVersion('tres_1')),
        },
        account: null,
      },
    }
    const waits = [{ kind: 'producer' as const, pending }]
    await commit('wait', {
      checkpoint: { ...(await load()).checkpoint, calls: [pending] },
      state: { kind: 'waiting', waits },
      events: [{ kind: 'waiting', waits }],
      effects: [{ action: pending.action, pending, authority }],
    })
    const receive = async (name: string, entry: ReceivedEntry, view = s.view) => {
      const { material: _material, ...draft } = entry
      const answer = ok(
        await view.received!.commit({
          ...s.access,
          execution: s.execution,
          operation: operation(name),
          entry: draft,
          material: MATERIAL,
        }),
      )
      if (answer.kind !== 'committed') throw new Error(`received ${answer.kind}`)
      return answer.value
    }
    const placed = await receive('placeholder', placeholder)
    // The loop fills the slot with the placeholder and moves on: the call leaves the checkpoint.
    await commit('placeholder-processed', {
      checkpoint: { ...(await load()).checkpoint, calls: [] },
      events: [
        {
          kind: 'producer',
          result: {
            producer: {
              kind: 'tool',
              call: ok(resolveToolInvocationRef(reference, s.access.tenant)).call,
            },
            version: 'placeholder',
            delivery: 'tdel_0',
            source: evidence('placeholder'),
          },
          consumption: pending.consumption,
        },
      ],
    })
    for (const step of [1, 2, 3]) await commit(`later-${String(step)}`, {})
    const open = (family: string, item: string) =>
      s.controls
        ?.select(`SELECT open FROM er_item WHERE family = '${family}' AND item = '${item}'`)
        .rows.map(row => Number(row[0]))
    // The step is done with the call: the placeholder it took and the route of the call are closed.
    const taken = resultKey(pending.consumption, 'placeholder')
    expect(open('result', taken)).toEqual([0])
    expect(open('binding', reference)).toEqual([0])

    // The outcome comes to the same place, to a provider that has only the store. It is another
    // result of the consumption: kept, closed from the start, and the placeholder is as it was.
    const before = s.controls?.select(`SELECT pub FROM er_item WHERE item = '${taken}'`).rows
    const final = await receive('outcome', outcome, s.fresh())
    expect(open('result', resultKey(pending.consumption, 'tres_1'))).toEqual([0])
    expect(s.controls?.select(`SELECT pub FROM er_item WHERE item = '${taken}'`).rows).toEqual(
      before,
    )
    const receivedOf = async (view = s.view) =>
      ok(
        await view.entries.receivedOf({
          ...s.access,
          execution: s.execution,
          consumption: pending.consumption,
        }),
      )
    expect(await receivedOf()).toEqual([placed.entry, final.entry])
    expect(await receivedOf(s.fresh())).toEqual([placed.entry, final.entry])
    // Each delivery is recognized again by its own key, and a late account is one more result.
    expect(await receive('outcome-again', outcome, s.fresh())).toEqual(final)
    expect(await receive('placeholder-again', placeholder, s.fresh())).toEqual(placed)
    const account = await receive('account', tool.entry, s.fresh())
    expect(await receivedOf(s.fresh())).toEqual([placed.entry, final.entry, account.entry])
  } finally {
    await s.close()
  }
})
