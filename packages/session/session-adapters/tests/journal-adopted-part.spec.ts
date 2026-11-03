// The `a` part of the production session-log Journal (FIXED-FACTS F4, SPEC K-8 分区存储): the
// publication of a main-purpose M0 (a checkpoint whose `adoptedRequest` is new) writes the request
// it recorded, its adoption order, its execution and the coverage evidence of the same checkpoint
// into the `a` part of the session, in the same storage commit as the Agent records. What is
// checked, on the node:sqlite double that runs the published modules: a failure after the `x:`
// part leaves neither; a publication that does not change an `adoptedRequest` does not write `a`;
// the order goes up by one across executions and is not an execution revision; a cold provider
// reads what the warm one wrote, and the loser of a publication race reads the same after it read
// the records again; over 200 rounds the bytes of `a` do not grow and each round writes the same
// number of part rows.
import { describe, expect, it } from 'vitest'
import type { AgentCheckpoint, AgentJournal } from '@omne-harness/agent-contract'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import type { ContextTarget } from '@omne-harness/request-context-contract'
import { evidence } from '@omne-harness/session-contract/testing'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { createSessionLogJournal } from '../src/cordis/agent-journal.ts'
import { ADOPTED_PART, recordsPart } from '../src/cordis/journal-parts.ts'
import { m0Checkpoint } from './fixtures/adopted-request.ts'
import { ok, operation } from './fixtures/common-journal.ts'
import { nextRun, sqlScene, type SqlScene } from './fixtures/sql-scene.ts'

type Journal = AgentJournal<string>
type Authority = Parameters<Journal['commit']>[0]['authority']

const scope = ok(decodeScopeRef({ ref: 'scope:adopted-part' }))
const targetOf = (s: SqlScene): ContextTarget => ({ tenant: s.access.tenant, scope })

async function opened(name: string) {
  const s = await sqlScene(name)
  const open = ok(await s.view.journal.open(s.openInput))
  return { s, authority: open.authority }
}

/** One commit of `s.execution` whose checkpoint is the loaded one with `change` applied. */
async function commit(
  s: SqlScene,
  journal: Journal,
  authority: Authority,
  name: string,
  change: (checkpoint: AgentCheckpoint) => AgentCheckpoint = checkpoint => checkpoint,
) {
  const loaded = ok(await journal.load({ ...s.access, execution: s.execution }))
  return journal.commit({
    ...s.access,
    execution: s.execution,
    operation: operation(name),
    authority,
    expected: loaded.revision,
    checkpoint: change(loaded.checkpoint),
    state: { kind: 'advancing' },
    events: [],
    effects: [],
    caller: { kind: 'none' },
    replyAdmission: null,
    handoff: null,
    finish: null,
  })
}

/** A checkpoint change that moves the position: a commit that makes a new revision. */
const moved =
  (position: string) =>
  (checkpoint: AgentCheckpoint): AgentCheckpoint => ({ ...checkpoint, position })

/** The commit of one main-purpose M0: a new `adoptedRequest` and its `adoptedContext`. */
function m0(s: SqlScene, journal: Journal, authority: Authority, tag: string) {
  const { adoptedRequest, adoptedContext } = m0Checkpoint(targetOf(s), tag)
  return commit(s, journal, authority, `m0-${tag}`, checkpoint => ({
    ...checkpoint,
    adoptedRequest,
    adoptedContext,
  }))
}

type PartRow = Readonly<{ state: string | null; published: bigint }>

/** The stored row of one part of the scene's session, or undefined. */
function partRow(s: SqlScene, part: string): PartRow | undefined {
  const rows = s.controls?.select(
    `SELECT state, published FROM er_state_part WHERE session = '${s.access.session}' AND part = '${part}'`,
  ).rows
  const row = rows?.[0]
  return row === undefined ? undefined : { state: row[0] as string | null, published: row[1] as bigint }
}

/** The publication count of the scene's session. */
function published(s: SqlScene): bigint {
  const row = s.controls?.select(
    `SELECT published FROM er_root WHERE session = '${s.access.session}'`,
  ).rows[0]
  return (row?.[0] as bigint | undefined) ?? 0n
}

/** The number of part rows the last publication of the scene's session wrote. */
function partsWritten(s: SqlScene): number {
  const count = published(s)
  const rows = s.controls?.select(
    `SELECT COUNT(*) FROM er_state_part WHERE session = '${s.access.session}' AND published = ${count}`,
  ).rows
  return Number(rows?.[0]?.[0] ?? -1)
}

/** The `a` part as the provider reads it back. */
async function adoptedOf(s: SqlScene, journals = s.journals) {
  const read = await journals.readAdopted({ tenant: s.access.tenant, session: s.access.session })
  if (read.kind !== 'value') throw new Error(`not read: ${read.diagnostic}`)
  return read.value
}

describe('a main-purpose M0 writes the a part in the same commit as the Agent records', () => {
  it('a failure after the x: part was written leaves neither the x: part nor a, and the same M0 then writes both', async () => {
    const { s, authority } = await opened('adopted-joint')
    const before = { x: partRow(s, recordsPart(s.execution)), a: partRow(s, ADOPTED_PART) }
    expect(before.a).toBeUndefined()
    let fired = false
    let xWritten = false
    s.controls?.failWriteWhen((sql, params) => {
      if (!/INTO er_state_part/.test(sql)) return false
      if (params[2] === recordsPart(s.execution)) xWritten = true
      if (params[2] !== ADOPTED_PART) return false
      fired = true
      return true
    })
    const failed = await m0(s, s.view.journal, authority, '1')
    expect(failed).toHaveProperty('failure')
    // The injected failure hit the a write after the x: write of the same transaction.
    expect(fired).toBe(true)
    expect(xWritten).toBe(true)
    expect(partRow(s, recordsPart(s.execution))).toEqual(before.x)
    expect(partRow(s, ADOPTED_PART)).toBeUndefined()
    expect(await adoptedOf(s)).toBeNull()
    expect(await adoptedOf(s, createSessionLogJournal(sceneOptions(s)))).toBeNull()

    ok(await m0(s, s.view.journal, authority, '1'))
    const a = partRow(s, ADOPTED_PART)
    expect(a?.published).toBe(published(s))
    expect(partRow(s, recordsPart(s.execution))?.published).toBe(published(s))
    const { adoptedRequest, adoptedContext } = m0Checkpoint(targetOf(s), '1')
    expect(await adoptedOf(s)).toEqual({
      order: '1',
      execution: s.execution,
      reference: adoptedRequest.reference,
      fixed: adoptedRequest.fixed,
      coverage: adoptedContext,
      schema: adoptedRequest.schema,
      record: adoptedRequest.record,
    })
  })

  it('a publication that leaves the adoptedRequest as it was writes no a part', async () => {
    const { s, authority } = await opened('adopted-unchanged')
    ok(await commit(s, s.view.journal, authority, 'plain-1'))
    expect(partRow(s, ADOPTED_PART)).toBeUndefined()
    ok(await m0(s, s.view.journal, authority, '1'))
    const written = partRow(s, ADOPTED_PART)
    const count = published(s)
    // Two later publications of the same execution keep the request of the checkpoint as it is.
    ok(await commit(s, s.view.journal, authority, 'plain-2'))
    ok(await commit(s, s.view.journal, authority, 'plain-3', c => ({ ...c, position: 'E4' })))
    expect(published(s)).toBe(count + 2n)
    expect(partRow(s, ADOPTED_PART)).toEqual(written)
    expect((await adoptedOf(s))?.order).toBe('1')
  })
})

describe('the adoption order', () => {
  it('goes up by one with each M0 across two executions, and is not an execution revision', async () => {
    const { s, authority } = await opened('adopted-order')
    // The first M0 comes at revision 4 of its execution, the second at revision 3 of its own: an
    // order made of execution revisions would go down.
    ok(await commit(s, s.view.journal, authority, 'plain-1', moved('E4')))
    ok(await commit(s, s.view.journal, authority, 'plain-2', moved('E5')))
    ok(await m0(s, s.view.journal, authority, '1'))
    const first = await adoptedOf(s)
    const firstRevision = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
      .revision
    const t = await nextRun(s, 2)
    const second = ok(await t.view.journal.open(t.openInput))
    ok(await commit(t, t.view.journal, second.authority, 'plain-3', moved('E4')))
    ok(await m0(t, t.view.journal, second.authority, '2'))
    const after = await adoptedOf(t)
    const secondRevision = ok(await t.view.journal.load({ ...t.access, execution: t.execution }))
      .revision
    expect(first?.execution).toBe(s.execution)
    expect(after?.execution).toBe(t.execution)
    expect(BigInt(after?.order ?? '0')).toBe(BigInt(first?.order ?? '0') + 1n)
    expect([first?.order, after?.order]).toEqual(['1', '2'])
    expect([firstRevision, secondRevision].map(String)).toEqual(['4', '3'])
    for (const order of [first?.order, after?.order])
      expect([String(firstRevision), String(secondRevision)]).not.toContain(order)
  })
})

/** The Journal options of the scene, over `storage` (the scene's storage when absent). */
function sceneOptions(s: SqlScene, storage: SqlStorage = s.storage) {
  return {
    storage,
    tenantDomainLookup: {
      lookup: () => Promise.resolve({ kind: 'ready' as const, domain: s.domain }),
    },
    sessionAccessCheck: {
      check: () => Promise.resolve({ kind: 'allowed' as const, evidence: evidence('access') }),
    },
    combination: s.combination,
  }
}

describe('a provider that did not write the a part reads it as the writer does', () => {
  it('a cold provider reads the a part of the warm one, and its next M0 takes the next order', async () => {
    const { s, authority } = await opened('adopted-cold')
    ok(await m0(s, s.view.journal, authority, '1'))
    const warm = await adoptedOf(s)
    const cold = createSessionLogJournal<string>(sceneOptions(s))
    expect(await adoptedOf(s, cold)).toEqual(warm)
    // The cold provider rebuilds its copy from the parts, the a part with them.
    const coldView = cold.forSession(s.access)
    ok(await m0(s, coldView.journal, authority, '2'))
    expect((await adoptedOf(s, cold))?.order).toBe('2')
    expect(await adoptedOf(s)).toEqual(await adoptedOf(s, cold))
  })

  it('the loser of a publication race (K-20) reads the a part of the winner after it reads again', async () => {
    const { s, authority } = await opened('adopted-race')
    const winner = s.view.journal
    // The loser prepared its M0 on a copy; the winner commits another M0 just before the loser's
    // commit reaches the storage, so the loser's publication loses the count (K-20).
    let race: ReturnType<typeof m0> | null = null
    const outcomes: string[] = []
    const raced: SqlStorage = {
      registerCombination: input => s.storage.registerCombination(input),
      query: identity => s.storage.query(identity),
      read: (request, options) => s.storage.read(request, options),
      commit: async request => {
        if (race === null) {
          race = m0(s, winner, authority, 'w')
          ok(await race)
        }
        const outcome = await s.storage.commit(request)
        outcomes.push(outcome.kind)
        return outcome
      },
    }
    const losing = createSessionLogJournal<string>(sceneOptions(s, raced))
    const loser = losing.forSession(s.access).journal
    const lost = await m0(s, loser, authority, 'l')
    expect(outcomes[0]).toBe('rolled_back')
    // Read again, the loser's M0 names a revision that is gone: the Journal refuses it.
    expect(lost).toHaveProperty('failure')
    const won = await adoptedOf(s)
    expect(won?.order).toBe('1')
    expect(won?.reference).toBe(m0Checkpoint(targetOf(s), 'w').adoptedRequest.reference)
    expect(await adoptedOf(s, losing)).toEqual(won)
    // The loser's next M0, on the records it read again, takes the next order; both read it.
    ok(await m0(s, loser, authority, 'l2'))
    expect((await adoptedOf(s, losing))?.order).toBe('2')
    expect(await adoptedOf(s)).toEqual(await adoptedOf(s, losing))
  })
})

describe('the a part does not grow with the rounds of a session', () => {
  it('200 rounds: the bytes of a and the part rows each round writes stay the same', { timeout: 240_000 }, async () => {
    const { s, authority } = await opened('adopted-rounds')
    const sizes: number[] = []
    const rows: number[] = []
    for (let round = 1; round <= 200; round += 1) {
      ok(await m0(s, s.view.journal, authority, `r${String(round).padStart(3, '0')}`))
      sizes.push(partRow(s, ADOPTED_PART)?.state?.length ?? -1)
      rows.push(partsWritten(s))
    }
    // Every round names its request by a tag of the same length; only the order text grows, from
    // one digit to three.
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(2)
    expect(sizes.at(-1)! - sizes[19]!).toBeLessThanOrEqual(1)
    expect(new Set(rows)).toEqual(new Set([rows[0]]))
    expect((await adoptedOf(s))?.order).toBe('200')
  })
})
