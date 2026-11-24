import { expect, it } from 'vitest'
import type { ReceivedEntry } from '@omne-harness/agent-contract'
import { resolveToolInvocationRef } from '@omne-harness/tool-contract'
import { decodeToolResultVersion } from '@omne-harness/tool-contract/provider'
import { evidence } from '@omne-harness/session-contract/testing'
import { heldBy, holdText, resultKey } from '../src/journal/index.ts'
import { ok, operation } from './fixtures/common-journal.ts'
import { endOpened, refusedByModel } from './fixtures/finish.ts'
import { handed, sqlScene } from './fixtures/sql-scene.ts'
import { keptToolCall, toolCall } from './fixtures/tool-call.ts'

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

// A call that went to the background: its placeholder is received and processed, and the call has
// left the checkpoint. What the tests need to go on from there.
async function backgrounded(name: string) {
  const s = await sqlScene(name)
  const journal = s.view.journal
  const opened = ok(await journal.open(s.openInput))
  ok(await handed(s, String(s.initial.id), opened.receipt.evidence))
  const { authority } = opened
  const load = async () => ok(await journal.load({ ...s.access, execution: s.execution }))
  const commit = async (step: string, change: object) => {
    const loaded = await load()
    ok(
      await journal.commit({
        ...s.access,
        execution: s.execution,
        operation: operation(step),
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
  const entryOf = (key: object): ReceivedEntry =>
    ({ ...tool.entry, delivery: { producer: 'tool', key } }) as ReceivedEntry
  const versioned = (version: string) =>
    entryOf({
      kind: 'result',
      producer: 'tool',
      reference,
      result: ok(decodeToolResultVersion(version)),
      account: null,
    })
  const waits = [{ kind: 'producer' as const, pending }]
  await commit('wait', {
    checkpoint: { ...(await load()).checkpoint, calls: [pending] },
    state: { kind: 'waiting', waits },
    events: [{ kind: 'waiting', waits }],
    effects: [{ action: pending.action, pending, authority }],
  })
  const receive = async (step: string, entry: ReceivedEntry, view = s.view) => {
    const { material: _material, ...draft } = entry
    const committed = ok(
      await view.received!.commit({
        ...s.access,
        execution: s.execution,
        operation: operation(step),
        entry: draft,
        material: MATERIAL,
      }),
    )
    if (committed.kind !== 'committed') throw new Error(`received ${committed.kind}`)
    return committed.value
  }
  const placed = await receive(
    'placeholder',
    entryOf({ kind: 'placeholder', producer: 'tool', reference }),
  )
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
  const receivedOf = async (view = s.view) =>
    ok(
      await view.entries.receivedOf({
        ...s.access,
        execution: s.execution,
        consumption: pending.consumption,
      }),
    )
  return { s, journal, opened, authority, load, commit, receive, versioned, placed, receivedOf }
}

it('results that come after the execution ended each take the next place, whichever replica keeps them', async () => {
  const b = await backgrounded('closed-background-ended')
  const { s } = b
  try {
    await endOpened(s, b.journal, b.opened, refusedByModel())
    expect((await b.load()).state.kind).toBe('ended')
    // The call ends after its execution did, and reports twice. Each report reaches a replica
    // that has only the store: the second must not take the place of the first.
    const first = await b.receive('outcome', b.versioned('tres_1'), s.fresh())
    const second = await b.receive('late-version', b.versioned('tres_2'), s.fresh())
    expect(await b.receivedOf(s.fresh())).toEqual([b.placed.entry, first.entry, second.entry])
  } finally {
    await s.close()
  }
})

const WIDE = 40

it('the outcome of a backgrounded call is read with its placeholder after a step that waits on many calls', async () => {
  const b = await backgrounded('closed-background-wide')
  const { s } = b
  try {
    for (const step of [1, 2, 3]) await b.commit(`later-${String(step)}`, {})
    const closed = s.controls
      ?.select(`SELECT open FROM er_item WHERE family = 'result' AND execution = '${s.execution}'`)
      .rows.map(row => Number(row[0]))
    expect(new Set(closed)).toEqual(new Set([0]))
    // The Run goes on to a step that waits on many calls at once: what the checkpoint holds is
    // still known, whatever its size.
    const tools = []
    for (let at = 0; at < WIDE; at += 1)
      tools.push(
        await keptToolCall(
          { view: s.view, access: s.access, execution: s.execution },
          `wide-${String(at)}`,
        ),
      )
    const first = tools[0]!
    const waits = tools.map(tool => ({ kind: 'producer' as const, pending: tool.pending }))
    await b.commit('wide-wait', {
      checkpoint: {
        ...(await b.load()).checkpoint,
        batch: {
          ...first.batch,
          actions: tools.flatMap(tool => tool.batch.actions),
          barrier: {
            kind: 'open',
            evidence: evidence('action-barrier'),
            approved: [first.pending.action, ...tools.slice(1).map(tool => tool.pending.action)],
          },
          slots: tools.flatMap(tool => tool.batch.slots),
        },
      },
      state: { kind: 'waiting', waits },
      events: [{ kind: 'waiting', waits }],
      effects: tools.map(tool => ({
        action: tool.pending.action,
        pending: tool.pending,
        authority: b.authority,
      })),
    })
    // The store keeps one open item for each thing the checkpoint holds, no more and no fewer.
    const openHolds = () =>
      (
        s.controls?.select(
          `SELECT item FROM er_item WHERE family = 'hold' AND open = 1 AND execution = '${s.execution}'`,
        ).rows ?? []
      )
        .map(row => String(row[0]).replace(/@\d+$/u, ''))
        .sort()
    const heldNow = async () =>
      heldBy((await b.load()).checkpoint)
        .map(holdText)
        .sort()
    expect(openHolds()).toEqual(await heldNow())
    expect(openHolds().length).toBeGreaterThan(2 * WIDE)

    const final = await b.receive('outcome', b.versioned('tres_1'), s.fresh())
    expect(await b.receivedOf(s.fresh())).toEqual([b.placed.entry, final.entry])
    expect(await b.receivedOf()).toEqual([b.placed.entry, final.entry])

    // The step lets every call go: what it held closes with that commit, on whichever replica.
    await b.commit('wide-done', {
      checkpoint: { ...(await b.load()).checkpoint, batch: null, calls: [] },
    })
    expect(openHolds()).toEqual(await heldNow())
    const openIntents = s.controls?.select(
      `SELECT count(*) FROM er_item WHERE family = 'intent' AND open = 1 AND execution = '${s.execution}'`,
    ).rows[0]?.[0]
    expect(Number(openIntents)).toBe(0)
    const cold = ok(await s.fresh().journal.load({ ...s.access, execution: s.execution }))
    expect(cold.checkpoint).toEqual((await b.load()).checkpoint)
  } finally {
    await s.close()
  }
})
