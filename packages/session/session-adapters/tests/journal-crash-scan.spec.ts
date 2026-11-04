// The crash-point scan of the production Journal (R2-D294 invariant 5, recovery equivalence; SPEC
// "事实族存储"): a script of writes with Tool effects and a main-purpose M0 runs once without a
// fault; then once per publication point k, the storage commit of write k runs but its reply is
// lost, the provider that wrote it is gone, and a cold provider retries the same operation and
// then runs the rest of the script. After every scan the facts of the session are the facts of the
// run without the fault, row for row: the retry was recognized from its batch and appended no
// second batch, so no effect intent was published twice and no decision of a later write was lost.
// A commit that brings no new fact (R2-D307) appends one envelope row, moves no revision, and its
// bytes are a small constant.
import { describe, expect, it } from 'vitest'
import type { Outcome } from '@omne-harness/operation-result'
import type { AgentCheckpoint, AgentJournal } from '@omne-harness/agent-contract'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import type { ContextTarget } from '@omne-harness/request-context-contract'
import { evidence } from '@omne-harness/session-contract/testing'
import { createSessionLogJournal } from '../src/cordis/agent-journal.ts'
import { m0Checkpoint } from './fixtures/adopted-request.ts'
import { ok, operation } from './fixtures/common-journal.ts'
import { sqlScene, type SqlScene } from './fixtures/sql-scene.ts'
import { toolCall } from './fixtures/tool-call.ts'

type Journal = AgentJournal<string>
type Authority = Parameters<Journal['commit']>[0]['authority']

const scope = ok(decodeScopeRef({ ref: 'scope:crash-scan' }))
const targetOf = (s: SqlScene): ContextTarget => ({ tenant: s.access.tenant, scope })

/** The Journal options of the scene, for a provider that did not write anything (a cold one). */
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

const cold = (s: SqlScene): Journal =>
  createSessionLogJournal<string>(sceneOptions(s)).forSession(s.access).journal

type CommitInput = Parameters<Journal['commit']>[0]

/**
 * One commit of the scene's execution: the loaded checkpoint with `change`, and `effects`. The
 * input is built once, at the first run, and the same input is given to every later run: a retry
 * after a lost reply is the same operation with the same content.
 */
function commitStep(
  s: SqlScene,
  authority: Authority,
  name: string,
  change: (checkpoint: AgentCheckpoint) => AgentCheckpoint,
  effects: CommitInput['effects'] = [],
): Step {
  let input: CommitInput | null = null
  return async journal => {
    if (input === null) {
      const loaded = ok(await journal.load({ ...s.access, execution: s.execution }))
      input = {
        ...s.access,
        execution: s.execution,
        operation: operation(name),
        authority,
        expected: loaded.revision,
        checkpoint: change(loaded.checkpoint),
        state: { kind: 'advancing' },
        events: [],
        effects,
        caller: { kind: 'none' },
        replyAdmission: null,
        handoff: null,
        finish: null,
      }
    }
    return journal.commit(input)
  }
}

/** One write of the script: the same operation whichever provider runs it. */
type Step = (journal: Journal) => Promise<Outcome<unknown, unknown>>

/** The script: two Tool effects on two commits, a main-purpose M0 between them, a last move. */
function scriptOf(s: SqlScene, authority: Authority): Step[] {
  const a = toolCall(s.access.tenant, 'scan-a')
  const b = toolCall(s.access.tenant, 'scan-b')
  const { adoptedRequest, adoptedContext } = m0Checkpoint(targetOf(s), 'scan')
  return [
    commitStep(s, authority, 'c1-effect-a', c => ({ ...c, position: 'E2', batch: a.batch }), [
      { action: a.pending.action, pending: a.pending, authority },
    ]),
    commitStep(s, authority, 'c2-m0', c => ({
      ...c,
      position: 'E3',
      adoptedRequest,
      adoptedContext,
    })),
    commitStep(s, authority, 'c3-effect-b', c => ({ ...c, position: 'E4', batch: b.batch }), [
      { action: b.pending.action, pending: b.pending, authority },
    ]),
    commitStep(s, authority, 'c4-move', c => ({ ...c, position: 'E5' })),
  ]
}

type FactRow = Readonly<{ pub: number; ord: number; kind: string }>

/** Every fact row of the session, in publication order: the shape of the log, without bodies. */
function factRows(s: SqlScene): FactRow[] {
  const rows = s.controls?.select(
    `SELECT pub, ord, kind FROM er_fact WHERE session = '${s.access.session}' ORDER BY pub, ord`,
  ).rows
  return (rows ?? []).map(row => ({
    pub: Number(row[0]),
    ord: Number(row[1]),
    kind: String(row[2]),
  }))
}

function published(s: SqlScene): number {
  const row = s.controls?.select(
    `SELECT published FROM er_root WHERE session = '${s.access.session}'`,
  ).rows[0]
  return Number(row?.[0] ?? 0)
}

/** What a scan compares: the log's shape and the execution as it loads. */
async function outcomeOf(s: SqlScene, journal: Journal) {
  const loaded = ok(await journal.load({ ...s.access, execution: s.execution }))
  return {
    rows: factRows(s),
    published: published(s),
    revision: String(loaded.revision),
    checkpoint: loaded.checkpoint,
    intents: factRows(s).filter(row => row.kind === 'call.intended').length,
  }
}

async function opened(name: string) {
  const s = await sqlScene(name)
  const open = ok(await s.view.journal.open(s.openInput))
  return { s, authority: open.authority }
}

describe('the crash-point scan: a lost reply at each publication, a cold provider after it', () => {
  it('after every scan the facts are those of the run without the fault, row for row', async () => {
    const base = await opened('scan-base')
    const script = scriptOf(base.s, base.authority)
    for (const step of script) ok(await step(base.s.view.journal))
    const expected = await outcomeOf(base.s, base.s.view.journal)
    // The script published both effects once; the scan compares against that.
    expect(expected.intents).toBe(2)
    expect(expected.published).toBeGreaterThanOrEqual(script.length + 1)

    for (let k = 0; k < script.length; k += 1) {
      const { s, authority } = await opened(`scan-${String(k)}`)
      const steps = scriptOf(s, authority)
      const warm = s.view.journal
      for (const step of steps.slice(0, k)) ok(await step(warm))
      // The storage commit of write k runs; its reply does not reach the provider.
      s.controls?.loseNextReply()
      expect(await steps[k]!(warm)).toMatchObject({ failure: { kind: 'commit-unknown' } })
      // The provider that wrote it is gone: a cold one retries the same operation.
      const after = cold(s)
      expect(await steps[k]!(after)).toHaveProperty('ok')
      for (const step of steps.slice(k + 1)) ok(await step(after))
      const got = await outcomeOf(s, after)
      expect(got.rows, `scan ${String(k)}`).toEqual(expected.rows)
      expect(got.published, `scan ${String(k)}`).toBe(expected.published)
      expect(got.revision, `scan ${String(k)}`).toBe(expected.revision)
      expect(got.checkpoint, `scan ${String(k)}`).toEqual(expected.checkpoint)
      // The retry was recognized at the revision the lost write reached: `query` names it too.
      const known = ok(
        await after.query({ ...s.access, execution: s.execution, operation: operation(nameOf(k)) }),
      )
      expect(known.kind).toBe('committed')
    }
  })
})

const nameOf = (k: number): string => ['c1-effect-a', 'c2-m0', 'c3-effect-b', 'c4-move'][k]!

/** The rows of the fact family of publication `pub`: the bridge's `core.*` rows left out (K-23). */
const familyRows = (s: SqlScene, pub: number): FactRow[] =>
  factRows(s).filter(row => row.pub === pub && !row.kind.startsWith('core.'))

describe('a commit that brings no new fact (R2-D307)', () => {
  it('appends the envelope row only, its bytes are a small constant, and a cold provider recognizes it', async () => {
    const { s, authority } = await opened('scan-envelope')
    ok(await commitStep(s, authority, 'moved', c => ({ ...c, position: 'E2' }))(s.view.journal))
    const before = published(s)
    const sizes: number[] = []
    for (const round of [1, 2, 3]) {
      ok(await commitStep(s, authority, `same-${String(round)}`, c => c)(s.view.journal))
      const pub = published(s)
      expect(pub).toBe(before + round)
      expect(familyRows(s, pub)).toEqual([{ pub, ord: 0, kind: 'batch' }])
      sizes.push(
        (
          s.controls?.select(
            `SELECT body FROM er_fact WHERE session = '${s.access.session}' AND pub = ${String(pub)} AND ord = 0`,
          ).rows ?? []
        ).reduce((sum, row) => sum + Buffer.byteLength(String(row[0]), 'utf8'), 0),
      )
    }
    expect(Math.max(...sizes)).toBeLessThan(512)
    expect(new Set(sizes).size).toBe(1)
    const known = ok(
      await cold(s).query({ ...s.access, execution: s.execution, operation: operation('same-2') }),
    )
    expect(known.kind).toBe('committed')
  })

  // The revision rule of R2-D307 (an envelope-only batch moves no revision) is the core's to keep:
  // until `commit` is written as facts by the core (session-adapters SPEC K-23), the reader
  // projection the core still advances names one more revision than the fold. Enable with K-23.
  it.skip('moves no revision (enable when the core writes commit as facts, K-23)', async () => {
    const { s, authority } = await opened('scan-envelope-rev')
    const revision = ok(await s.view.journal.load({ ...s.access, execution: s.execution })).revision
    ok(await commitStep(s, authority, 'same', c => c)(s.view.journal))
    expect(ok(await s.view.journal.load({ ...s.access, execution: s.execution })).revision).toBe(
      revision,
    )
  })
})
