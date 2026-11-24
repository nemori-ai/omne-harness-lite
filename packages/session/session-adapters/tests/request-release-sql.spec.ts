import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type {
  ActionBatch,
  AgentCheckpoint,
  AgentEventBody,
  AgentJournal,
  DurableEvidence,
  EventPage,
  JournalCommit,
  Material,
  PendingCall,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { canonical } from '../src/testing/canonical.ts'
import { evidence, ok, operation } from './fixtures/common-journal.ts'
import { sqlScene, type SqlScene } from './fixtures/sql-scene.ts'
import { toolCall } from './fixtures/tool-call.ts'

type Associated = Extract<PendingCall, { kind: 'tool'; association: 'associated' }>
type Commit = JournalCommit<string>

const requestOf = (name: string): Material<ContentBlock> => ({
  kind: 'facts',
  schema: {
    owner: 'agent',
    name: 'fixed-tool-request',
    revision: '1',
    digest: 'agent:fixed-tool-request/1',
  },
  value: { kind: 'string', value: name },
})

const rowDigest = (value: unknown) =>
  `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`

const quoted = (text: string) => `'${text.replaceAll("'", "''")}'`

const count = (s: SqlScene, sql: string): number =>
  Number(s.controls?.select(sql).rows[0]?.[0] ?? -1)

const contents = (s: SqlScene, source: DurableEvidence) =>
  count(
    s,
    `SELECT COUNT(*) FROM er_item_content WHERE family = 'material' AND item = ${quoted(canonical(source))}`,
  )

const shared = (s: SqlScene, value: unknown) =>
  count(s, `SELECT COUNT(*) FROM sl_blob WHERE digest = ${quoted(rowDigest(value))}`)

const open = (s: SqlScene, source: DurableEvidence) =>
  count(
    s,
    `SELECT open FROM er_item WHERE family = 'material' AND item = ${quoted(canonical(source))}`,
  )

async function events(journal: AgentJournal<string>, s: SqlScene) {
  const bodies: AgentEventBody[] = []
  let after: string | null = null
  for (;;) {
    const page: EventPage = ok(
      await journal.output.read({ ...s.access, execution: s.execution, after, limit: 100 }),
    )
    if (page.kind !== 'page') throw new Error('event gap')
    bodies.push(...page.events.map(event => event.body))
    if (page.caughtUp || page.events.length === 0) return bodies
    after = page.next
  }
}

async function dispatching(name: string) {
  const s = await sqlScene(name)
  const journal = s.view.journal
  const { authority } = ok(await journal.open(s.openInput))
  const tool = toolCall(s.access.tenant, name)
  const value = requestOf(name)
  const request = ok(
    await s.view.materials.preserve({
      ...s.access,
      execution: s.execution,
      identity: 'request',
      consumer: tool.pending.position,
      value,
      readers: 'until-release',
    }),
  )
  const { reference: _reference, acceptance: _acceptance, ...rest } = tool.pending
  const intent: PendingCall = { ...rest, association: 'intent', fixed: request }
  const associated = (acceptance: Associated['acceptance']): PendingCall => ({
    ...tool.pending,
    fixed: request,
    acceptance,
  })
  const [action] = tool.batch.actions
  if (action === undefined) throw new Error('fixture: one action')
  const batchWith = (call: PendingCall | null): ActionBatch => ({
    ...tool.batch,
    actions: [
      {
        ...action,
        judgment: { kind: 'allowed', evidence: evidence('allowed'), request },
        call,
      },
    ],
    slots: call?.kind === 'tool' && call.association === 'associated' ? tool.batch.slots : [],
  })
  const commit = async (
    step: string,
    checkpoint: Partial<AgentCheckpoint>,
    more: Partial<Pick<Commit, 'state' | 'events' | 'effects' | 'finish'>> = {},
  ) => {
    const loaded = ok(await journal.load({ ...s.access, execution: s.execution }))
    return ok(
      await journal.commit({
        ...s.access,
        execution: s.execution,
        operation: operation(step),
        authority,
        expected: loaded.revision,
        checkpoint: { ...loaded.checkpoint, ...checkpoint },
        state: { kind: 'advancing' },
        events: [],
        effects: [],
        caller: { kind: 'none' },
        replyAdmission: null,
        handoff: null,
        finish: null,
        ...more,
      } as Commit),
    )
  }
  await commit('judged', { batch: batchWith(null), calls: [] })
  await commit(
    'intent',
    { batch: batchWith(intent), calls: [intent] },
    {
      state: { kind: 'waiting', waits: [{ kind: 'producer', pending: intent }] },
      events: [{ kind: 'waiting', waits: [{ kind: 'producer', pending: intent }] }],
      effects: [{ pending: intent, action: intent.action, authority }],
    },
  )
  const associate = (acceptance: Associated['acceptance']) =>
    commit('associate', {
      batch: batchWith(associated(acceptance)),
      calls: [associated(acceptance)],
    })
  const settle = (step: 'F1' | 'F2', checkpoint: Partial<AgentCheckpoint>) =>
    commit(
      `settle-${step}`,
      { ...checkpoint, position: step },
      {
        state: { kind: 'settling' },
        finish:
          step === 'F1'
            ? {
                origin: evidence('end-origin'),
                conclusion: { kind: 'complete' },
                failure: null,
                inputWatermark: evidence('replaced'),
                conditions: evidence('end-conditions'),
              }
            : null,
      },
    )
  const read = (view = s.view) => view.materials.read({ ...s.access, source: request })
  return { s, value, request, intent, batchWith, associate, settle, commit, read }
}

describe('the request of a Tool action, preserved with no reader once its holding ends', () => {
  it('is kept by the key of its item, not in the shared block table, while the action may still send it', async () => {
    const d = await dispatching('request-held')
    try {
      expect(contents(d.s, d.request)).toBe(1)
      expect(shared(d.s, d.value)).toBe(0)
      expect(ok(await d.read(d.s.fresh()))).toEqual(d.value)
    } finally {
      await d.s.close()
    }
  })

  it('is let go in the commit that records the Tool accepted it: its content row is gone, its facts stay', async () => {
    const d = await dispatching('request-accepted')
    try {
      await d.associate('accepted')
      expect(contents(d.s, d.request)).toBe(0)
      expect(open(d.s, d.request)).toBe(0)
      expect(count(d.s, `SELECT COUNT(*) FROM er_fact WHERE kind = 'material.preserved'`)).toBe(1)
      expect(await d.read()).toEqual({ failure: { kind: 'reclaimed' } })
      expect(await d.read(d.s.fresh())).toEqual({ failure: { kind: 'reclaimed' } })
    } finally {
      await d.s.close()
    }
  })

  it('stays held when the commit of the Tool is unknown, reads the same after a restart, and goes once the call ends', async () => {
    const d = await dispatching('request-unknown')
    try {
      await d.associate('unknown')
      expect(contents(d.s, d.request)).toBe(1)
      expect(open(d.s, d.request)).toBe(1)
      expect(ok(await d.read(d.s.fresh()))).toEqual(d.value)
      await d.commit('call-ended', { batch: null, calls: [] })
      expect(contents(d.s, d.request)).toBe(0)
    } finally {
      await d.s.close()
    }
  })

  it('stays held as an intent when the association is unknown, so the same request is read to send again', async () => {
    const d = await dispatching('request-association-unknown')
    try {
      const fresh = d.s.fresh()
      ok(await fresh.journal.load({ ...d.s.access, execution: d.s.execution }))
      expect(ok(await d.read(fresh))).toEqual(d.value)
      expect(contents(d.s, d.request)).toBe(1)
    } finally {
      await d.s.close()
    }
  })

  it('goes when the Run settles without sending it, also when the holding ends after settling began', async () => {
    const d = await dispatching('request-cancelled')
    try {
      await d.settle('F1', {})
      expect(contents(d.s, d.request)).toBe(1)
      await d.settle('F2', { batch: null, calls: [] })
      expect(contents(d.s, d.request)).toBe(0)
      const fresh = d.s.fresh()
      ok(await fresh.journal.load({ ...d.s.access, execution: d.s.execution }))
      expect(await d.read(fresh)).toEqual({ failure: { kind: 'reclaimed' } })
    } finally {
      await d.s.close()
    }
  })

  it('leaves a material with readers and the same content as it was: its block stays shared and reads', async () => {
    const d = await dispatching('request-same-content')
    try {
      const kept = ok(
        await d.s.view.materials.preserve({
          ...d.s.access,
          execution: d.s.execution,
          identity: 'kept',
          consumer: { owner: 'suite', work: 'work', position: 'at', purpose: 'action' },
          value: d.value,
        }),
      )
      expect(kept).not.toEqual(d.request)
      expect(shared(d.s, d.value)).toBe(1)
      await d.associate('accepted')
      expect(contents(d.s, d.request)).toBe(0)
      expect(shared(d.s, d.value)).toBe(1)
      expect(ok(await d.s.fresh().materials.read({ ...d.s.access, source: kept }))).toEqual(d.value)
      expect(await d.read(d.s.fresh())).toEqual({ failure: { kind: 'reclaimed' } })
    } finally {
      await d.s.close()
    }
  })

  it('leaves the events as they were, and a Run that settles after the Tool accepted loads cold', async () => {
    const d = await dispatching('request-events')
    try {
      const before = await events(d.s.fresh().journal, d.s)
      expect(before.length).toBeGreaterThan(0)
      await d.associate('accepted')
      expect(await events(d.s.fresh().journal, d.s)).toEqual(before)
      await d.settle('F1', {})
      const fresh = d.s.fresh()
      const loaded = ok(await fresh.journal.load({ ...d.s.access, execution: d.s.execution }))
      expect(loaded.state.kind).toBe('settling')
      expect(await events(fresh.journal, d.s)).toEqual(before)
      expect(await d.read(fresh)).toEqual({ failure: { kind: 'reclaimed' } })
    } finally {
      await d.s.close()
    }
  })

  it('reports a held request whose content is gone, and does not take it as released', async () => {
    const d = await dispatching('request-lost')
    try {
      d.s.controls?.select(
        `DELETE FROM er_item_content WHERE item = ${quoted(canonical(d.request))}`,
      )
      const fresh = d.s.fresh()
      const loaded = await fresh.journal.load({ ...d.s.access, execution: d.s.execution })
      expect(loaded).toMatchObject({ failure: { kind: 'unavailable' } })
      expect(await d.read(fresh)).toMatchObject({ failure: { kind: 'unavailable' } })
    } finally {
      await d.s.close()
    }
  })
})
