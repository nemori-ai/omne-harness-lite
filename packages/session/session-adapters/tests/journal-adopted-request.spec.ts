import { describe, expect, it } from 'vitest'
import type { AgentCheckpoint, AgentJournal } from '@omne-harness/agent-contract'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import type { ContextTarget } from '@omne-harness/request-context-contract'
import { evidence } from '@omne-harness/session-contract/testing'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { createSessionLogJournal } from '../src/cordis/agent-journal.ts'
import { m0Checkpoint } from './fixtures/adopted-request.ts'
import { ok, operation } from './fixtures/common-journal.ts'
import { unpackText } from '@omne-harness/sql-contract/worker'
import { nextRun, sqlScene, type SqlScene } from './fixtures/sql-scene.ts'

type Journal = AgentJournal<string>
type Authority = Parameters<Journal['commit']>[0]['authority']

const scope = ok(decodeScopeRef({ ref: 'scope:adopted-request' }))
const targetOf = (s: SqlScene): ContextTarget => ({ tenant: s.access.tenant, scope })

async function opened(name: string) {
  const s = await sqlScene(name)
  const open = ok(await s.view.journal.open(s.openInput))
  return { s, authority: open.authority }
}

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

const moved =
  (position: string) =>
  (checkpoint: AgentCheckpoint): AgentCheckpoint => ({ ...checkpoint, position })

function m0(s: SqlScene, journal: Journal, authority: Authority, tag: string) {
  const { adoptedRequest, adoptedContext } = m0Checkpoint(targetOf(s), tag)
  return commit(s, journal, authority, `m0-${tag}`, checkpoint => ({
    ...checkpoint,
    adoptedRequest,
    adoptedContext,
  }))
}

type AdoptedRow = Readonly<{ pub: bigint; body: string }>

function adoptedRows(s: SqlScene): AdoptedRow[] {
  const rows = s.controls?.select(
    `SELECT pub, body FROM er_fact WHERE session = '${s.access.session}' AND kind = 'request.adopted' ORDER BY pub`,
  ).rows
  return (rows ?? []).map(row => ({
    pub: row[0] as bigint,
    body: unpackText(row[1] as Uint8Array),
  }))
}

function published(s: SqlScene): bigint {
  const row = s.controls?.select(
    `SELECT published FROM er_root WHERE session = '${s.access.session}'`,
  ).rows[0]
  return (row?.[0] as bigint | undefined) ?? 0n
}

function rowsWritten(s: SqlScene): number {
  const count = published(s)
  const rows = s.controls?.select(
    `SELECT COUNT(*) FROM er_fact WHERE session = '${s.access.session}' AND pub = ${count}`,
  ).rows
  return Number(rows?.[0]?.[0] ?? -1)
}

function blobHeld(s: SqlScene, digest: string): boolean {
  const rows = s.controls?.select(
    `SELECT digest FROM sl_blob WHERE digest = 'sha256:${digest}'`,
  ).rows
  return (rows?.length ?? 0) > 0
}

async function adoptedOf(s: SqlScene, journals = s.journals) {
  const read = await journals.readAdopted({ tenant: s.access.tenant, session: s.access.session })
  if (read.kind !== 'value') throw new Error(`not read: ${read.diagnostic}`)
  return read.value
}

describe('a main-purpose M0 appends the request.adopted fact in the same batch as its records', () => {
  it('a failure at the block write leaves neither the fact nor the block, and the same M0 then writes both', async () => {
    const { s, authority } = await opened('adopted-joint')
    expect(adoptedRows(s)).toEqual([])
    let fired = false
    let factsWritten = false
    s.controls?.failWriteWhen(sql => {
      if (/INSERT INTO er_fact/.test(sql)) factsWritten = true
      if (!/INTO sl_blob/.test(sql)) return false
      fired = true
      return true
    })
    const failed = await m0(s, s.view.journal, authority, '1')
    expect(failed).toHaveProperty('failure')
    expect(fired).toBe(true)
    expect(factsWritten).toBe(true)
    expect(adoptedRows(s)).toEqual([])
    expect(await adoptedOf(s)).toBeNull()
    expect(await adoptedOf(s, createSessionLogJournal(sceneOptions(s)))).toBeNull()

    ok(await m0(s, s.view.journal, authority, '1'))
    const rows = adoptedRows(s)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.pub).toBe(published(s))
    const fact = JSON.parse(rows[0]!.body) as { record: { digest: string } }
    expect(blobHeld(s, fact.record.digest)).toBe(true)
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

  it('a publication that leaves the adoptedRequest as it was appends no request.adopted fact', async () => {
    const { s, authority } = await opened('adopted-unchanged')
    ok(await commit(s, s.view.journal, authority, 'plain-1'))
    expect(adoptedRows(s)).toEqual([])
    ok(await m0(s, s.view.journal, authority, '1'))
    const written = adoptedRows(s)
    const count = published(s)
    ok(await commit(s, s.view.journal, authority, 'plain-2'))
    ok(await commit(s, s.view.journal, authority, 'plain-3', c => ({ ...c, position: 'E4' })))
    expect(published(s)).toBe(count + 2n)
    expect(adoptedRows(s)).toEqual(written)
    expect((await adoptedOf(s))?.order).toBe('1')
  })
})

describe('the adoption order', () => {
  it('goes up by one with each M0 across two executions, and is not an execution revision', async () => {
    const { s, authority } = await opened('adopted-order')
    ok(await commit(s, s.view.journal, authority, 'plain-1', moved('E4')))
    ok(await commit(s, s.view.journal, authority, 'plain-2', moved('E5')))
    ok(await m0(s, s.view.journal, authority, '1'))
    const first = await adoptedOf(s)
    const firstRevision = ok(
      await s.view.journal.load({ ...s.access, execution: s.execution }),
    ).revision
    const t = await nextRun(s, 2)
    const second = ok(await t.view.journal.open(t.openInput))
    ok(await commit(t, t.view.journal, second.authority, 'plain-3', moved('E4')))
    ok(await m0(t, t.view.journal, second.authority, '2'))
    const after = await adoptedOf(t)
    const secondRevision = ok(
      await t.view.journal.load({ ...t.access, execution: t.execution }),
    ).revision
    expect(first?.execution).toBe(s.execution)
    expect(after?.execution).toBe(t.execution)
    expect(BigInt(after?.order ?? '0')).toBe(BigInt(first?.order ?? '0') + 1n)
    expect([first?.order, after?.order]).toEqual(['1', '2'])
    expect([firstRevision, secondRevision].map(String)).toEqual(['4', '3'])
    for (const order of [first?.order, after?.order])
      expect([String(firstRevision), String(secondRevision)]).not.toContain(order)
  })
})

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

describe('a provider that did not write the request reads it as the writer does', () => {
  it('a cold provider reads the request of the warm one, and its next M0 takes the next order', async () => {
    const { s, authority } = await opened('adopted-cold')
    ok(await m0(s, s.view.journal, authority, '1'))
    const warm = await adoptedOf(s)
    const cold = createSessionLogJournal<string>(sceneOptions(s))
    expect(await adoptedOf(s, cold)).toEqual(warm)
    const coldView = cold.forSession(s.access)
    ok(await m0(s, coldView.journal, authority, '2'))
    expect((await adoptedOf(s, cold))?.order).toBe('2')
    expect(await adoptedOf(s)).toEqual(await adoptedOf(s, cold))
  })

  it('the loser of a publication race (K-20) reads the request of the winner after it reads the batches it missed', async () => {
    const { s, authority } = await opened('adopted-race')
    const winner = s.view.journal
    let race: ReturnType<typeof m0> | null = null
    const outcomes: string[] = []
    const raced: SqlStorage = {
      database: s.storage.database,
      registerCombination: input => s.storage.registerCombination(input),
      query: identity => s.storage.query(identity),
      read: s.storage.read,
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
    expect(lost).toHaveProperty('failure')
    const won = await adoptedOf(s)
    expect(won?.order).toBe('1')
    expect(won?.reference).toBe(m0Checkpoint(targetOf(s), 'w').adoptedRequest.reference)
    expect(await adoptedOf(s, losing)).toEqual(won)
    ok(await m0(s, loser, authority, 'l2'))
    expect((await adoptedOf(s, losing))?.order).toBe('2')
    expect(await adoptedOf(s)).toEqual(await adoptedOf(s, losing))
  })
})

describe('the request.adopted fact does not grow with the rounds of a session', () => {
  it(
    '200 rounds: the bytes of the fact and the rows each round appends stay the same',
    { timeout: 240_000 },
    async () => {
      const { s, authority } = await opened('adopted-rounds')
      const sizes: number[] = []
      const rows: number[] = []
      for (let round = 1; round <= 200; round += 1) {
        ok(await m0(s, s.view.journal, authority, `r${String(round).padStart(3, '0')}`))
        sizes.push(adoptedRows(s).at(-1)?.body.length ?? -1)
        rows.push(rowsWritten(s))
      }
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(2)
      expect(sizes.at(-1)! - sizes[19]!).toBeLessThanOrEqual(1)
      expect(new Set(rows.slice(1))).toEqual(new Set([rows[1]]))
      expect((await adoptedOf(s))?.order).toBe('200')
    },
  )
})

describe('the publication count after a publication that did not commit plainly', () => {
  const rootReads = (s: SqlScene): number =>
    (s.controls?.reads ?? []).filter(handler => handler === 'session.history-root').length

  it('a publication of a provider that does not share the count is found at the refused publication, and the next M0 commits', async () => {
    const { s, authority } = await opened('adopted-foreign')
    ok(await m0(s, s.view.journal, authority, '1'))
    const foreign: SqlStorage = { ...s.storage, database: {} }
    const other = createSessionLogJournal<string>(sceneOptions(s, foreign))
    ok(await m0(s, other.forSession(s.access).journal, authority, 'f'))
    expect(await m0(s, s.view.journal, authority, '2')).toHaveProperty('failure')
    ok(await m0(s, s.view.journal, authority, '3'))
    expect((await adoptedOf(s))?.order).toBe('3')
  })

  it('a write whose outcome stays unknown makes every call read the root until it is decided', async () => {
    const { s, authority } = await opened('adopted-pending')
    let lose = true
    const lost = new Set<string>()
    const pending: SqlStorage = {
      ...s.storage,
      commit: request => {
        if (!lose) return s.storage.commit(request)
        lose = false
        lost.add(request.identity.operation)
        return Promise.resolve({ kind: 'unknown', identity: request.identity, diagnostic: 'lost' })
      },
      query: identity =>
        lost.has(identity.operation)
          ? Promise.resolve({ kind: 'unknown', identity, diagnostic: 'pending' })
          : s.storage.query(identity),
    }
    const journals = createSessionLogJournal<string>(sceneOptions(s, pending))
    const journal = journals.forSession(s.access).journal
    const answer = await m0(s, journal, authority, 'p')
    expect('failure' in answer && answer.failure.kind).toBe('commit-unknown')
    const load = () => journal.load({ ...s.access, execution: s.execution })
    for (const _ of [1, 2, 3]) {
      const before = rootReads(s)
      await load()
      expect(rootReads(s)).toBe(before + 1)
    }
  })
})
