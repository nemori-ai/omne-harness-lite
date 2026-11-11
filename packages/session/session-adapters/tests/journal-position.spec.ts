// The one source of position (R2-D294 invariant 1, P1; session-adapters SPEC "事实族存储"): the
// publication count of the store is the position, the core appends at the folded view's head plus
// one, and the provider publishes only what the core appended. Nothing keeps two positions in
// step, so no mix of writes can put them apart. What is checked, on the node:sqlite double, over
// seeded sequences of commits, material preserves (new and repeated), a cold provider taking over,
// and a lost reply retried by a cold provider: after every step the publications of the store are
// one per write that changed the records, each with the facts its kind implies, and what a cold
// provider reads equals what the writer answers; over 200 steps the bytes of a step's batch stay
// bounded by the largest early one. A negative control shows the guard's reach: a publication the
// core did not append (the shape of the defect this guards against) is what the guard refuses.
import { describe, expect, it } from 'vitest'
import type { AgentCheckpoint, AgentJournal, Material } from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { evidence } from '@omne-harness/session-contract/testing'
import { createSessionLogJournal } from '../src/cordis/agent-journal.ts'
import { ok, operation } from './fixtures/common-journal.ts'
import { random, type Random } from './fixtures/property.ts'
import { unpackText } from '@omne-harness/sql-contract/worker'
import { sqlScene, type SqlScene } from './fixtures/sql-scene.ts'

type Journal = AgentJournal<string>
type Authority = Parameters<Journal['commit']>[0]['authority']

const CONSUMER = { owner: 'suite', work: 'work', position: 'at', purpose: 'action' }

function material(name: string): Material<ContentBlock> {
  return {
    kind: 'facts',
    schema: { owner: 'suite', name: 'payload', revision: '1', digest: 'fixture' },
    value: { kind: 'string', value: name },
  }
}

function sceneOptions(s: SqlScene) {
  return {
    storage: s.storage,
    tenantDomainLookup: {
      lookup: () => Promise.resolve({ kind: 'ready' as const, domain: s.domain }),
    },
    sessionAccessCheck: {
      check: () => Promise.resolve({ kind: 'allowed' as const, evidence: evidence('access') }),
    },
    combination: s.combination,
  }
}

const cold = (s: SqlScene) => createSessionLogJournal<string>(sceneOptions(s)).forSession(s.access)

type CommitInput = Parameters<Journal['commit']>[0]

function commitInput(
  s: SqlScene,
  authority: Authority,
  name: string,
  revision: CommitInput['expected'],
  checkpoint: AgentCheckpoint,
): CommitInput {
  return {
    ...s.access,
    execution: s.execution,
    operation: operation(name),
    authority,
    expected: revision,
    checkpoint,
    state: { kind: 'advancing' },
    events: [],
    effects: [],
    caller: { kind: 'none' },
    replyAdmission: null,
    handoff: null,
    finish: null,
  }
}

type Row = Readonly<{ pub: number; kinds: string[] }>

/** The publications of the session: each with the family kinds of its facts (the envelope apart). */
function publications(s: SqlScene): Row[] {
  const rows = s.controls?.select(
    `SELECT pub, kind FROM er_fact WHERE session = '${s.access.session}' ORDER BY pub, ord`,
  ).rows
  const out = new Map<number, string[]>()
  for (const row of rows ?? []) {
    const pub = Number(row[0])
    const kind = String(row[1])
    const kinds = out.get(pub) ?? []
    if (kind !== 'batch' && !kind.startsWith('core.')) kinds.push(kind)
    out.set(pub, kinds)
  }
  return [...out.entries()].map(([pub, kinds]) => ({ pub, kinds }))
}

/** The bytes of the fact bodies of a publication, the envelope and the family only (no bridge). */
function familyBytes(s: SqlScene, pub: number): number {
  const rows = s.controls?.select(
    `SELECT kind, body FROM er_fact WHERE session = '${s.access.session}' AND pub = ${String(pub)}`,
  ).rows
  return (rows ?? [])
    .filter(row => !String(row[0]).startsWith('core.'))
    .reduce((sum, row) => sum + unpackText(row[1] as Uint8Array).length, 0)
}

const published = (s: SqlScene): number =>
  Number(
    s.controls?.select(`SELECT published FROM er_root WHERE session = '${s.access.session}'`)
      .rows[0]?.[0] ?? 0,
  )

/** What one step did, and what the guard expects of the publication it made. */
type Step = Readonly<{ name: string; expectKinds: string[] | null }>

/**
 * One seeded run: `steps` writes drawn from the generator, on a writer that a takeover or a crash
 * replaces by a cold provider. Answers the publication rows the guard compares and the bytes of
 * each step's batch.
 */
async function run(s: SqlScene, rng: Random, steps: number) {
  let writer = s.view
  const authority = ok(await writer.journal.open(s.openInput)).authority
  const expected: Step[] = [{ name: 'open', expectKinds: null }]
  const bytes: number[] = []
  let materials = 0
  let position = 1
  for (let at = 0; at < steps; at += 1) {
    const choice = rng.int(10)
    const before = published(s)
    if (choice < 5) {
      // A commit that moves the position: one batch with the cursor move.
      position += 1
      const loaded = ok(await writer.journal.load({ ...s.access, execution: s.execution }))
      const input = commitInput(s, authority, `c${String(at)}`, loaded.revision, {
        ...loaded.checkpoint,
        position: `E${String(position)}`,
      })
      if (choice === 4) {
        // The reply is lost; a cold provider retries the same operation: one batch, not two.
        s.controls?.loseNextReply()
        expect(await writer.journal.commit(input)).toMatchObject({
          failure: { kind: 'commit-unknown' },
        })
        writer = cold(s)
      }
      ok(await writer.journal.commit(input))
      expected.push({ name: `commit ${String(at)}`, expectKinds: ['cursor.moved'] })
    } else if (choice < 8) {
      // A new material: one batch with its `material.preserved` fact; the same material again:
      // no batch.
      const fresh = choice !== 7 || materials === 0
      const name = fresh ? `m${String(materials)}` : `m${String(rng.int(materials))}`
      if (fresh) materials += 1
      ok(
        await writer.materials.preserve({
          ...s.access,
          execution: s.execution,
          identity: name,
          consumer: CONSUMER,
          value: material(name),
        }),
      )
      if (fresh) expected.push({ name: `preserve ${name}`, expectKinds: ['material.preserved'] })
      else expect(published(s)).toBe(before)
    } else if (choice === 8) {
      // A cold provider takes the session over: nothing is published by the takeover itself.
      writer = cold(s)
      expect(published(s)).toBe(before)
      continue
    } else {
      // A commit that changes nothing: the envelope alone, no revision.
      const loaded = ok(await writer.journal.load({ ...s.access, execution: s.execution }))
      ok(
        await writer.journal.commit(
          commitInput(s, authority, `same${String(at)}`, loaded.revision, loaded.checkpoint),
        ),
      )
      expected.push({ name: `same ${String(at)}`, expectKinds: [] })
    }
    bytes.push(familyBytes(s, published(s)))
  }
  return { expected, bytes, writer }
}

/** The guard: one publication per write that changed the records, each with its kinds. */
function guard(rows: readonly Row[], expected: readonly Step[]): string | null {
  if (rows.length !== expected.length)
    return `${String(rows.length)} publications for ${String(expected.length)} writes`
  for (const [index, row] of rows.entries()) {
    if (row.pub !== index + 1) return `publication ${String(row.pub)} at index ${String(index)}`
    const step = expected[index]!
    if (step.expectKinds !== null && JSON.stringify(row.kinds) !== JSON.stringify(step.expectKinds))
      return `${step.name} published ${JSON.stringify(row.kinds)}, expected ${JSON.stringify(step.expectKinds)}`
  }
  return null
}

describe('one source of position across mixed writes, takeovers and crashes', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`seed ${String(seed)}: 40 steps publish one batch per write, with the facts of its kind; a cold provider reads the same`, async () => {
      const s = await sqlScene(`position-${String(seed)}`)
      const { expected, writer } = await run(s, random(seed), 40)
      const rows = publications(s)
      expect(guard(rows, expected), `seed ${String(seed)}`).toBeNull()
      expect(published(s)).toBe(rows.length)
      // A cold provider folds the same log: the execution loads as the writer loads it.
      const warm = ok(await writer.journal.load({ ...s.access, execution: s.execution }))
      const fresh = ok(await cold(s).journal.load({ ...s.access, execution: s.execution }))
      expect(fresh.revision).toBe(warm.revision)
      expect(fresh.checkpoint).toEqual(warm.checkpoint)
    })
  }

  it('200 steps: the batch of a late step is no larger than the largest early one', async () => {
    const s = await sqlScene('position-long')
    const { expected, bytes } = await run(s, random(42), 200)
    expect(guard(publications(s), expected)).toBeNull()
    const early = Math.max(...bytes.slice(0, 50))
    const late = Math.max(...bytes.slice(150))
    expect(late).toBeLessThanOrEqual(early + 64)
  })

  it('negative control: a publication the core did not append is what the guard refuses', () => {
    const expected: Step[] = [
      { name: 'open', expectKinds: null },
      { name: 'commit', expectKinds: ['cursor.moved'] },
    ]
    const good: Row[] = [
      { pub: 1, kinds: ['exec.opened'] },
      { pub: 2, kinds: ['cursor.moved'] },
    ]
    expect(guard(good, expected)).toBeNull()
    // A second position source made a publication of its own between the two: the count is off.
    const extra: Row[] = [good[0]!, { pub: 2, kinds: [] }, { ...good[1]!, pub: 3 }]
    expect(guard(extra, expected)).not.toBeNull()
    // A write whose facts were dropped because the positions had parted: the kinds are off.
    const dropped: Row[] = [good[0]!, { pub: 2, kinds: [] }]
    expect(guard(dropped, expected)).not.toBeNull()
  })
})
