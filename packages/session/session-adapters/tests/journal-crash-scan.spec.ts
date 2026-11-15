import { describe, expect, it } from 'vitest'
import type { Outcome } from '@omne-harness/operation-result'
import type { AgentCheckpoint, AgentJournal } from '@omne-harness/agent-contract'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import type { ContextTarget } from '@omne-harness/request-context-contract'
import { evidence } from '@omne-harness/session-contract/testing'
import { createSessionLogJournal } from '../src/cordis/agent-journal.ts'
import { m0Checkpoint } from './fixtures/adopted-request.ts'
import { ok, operation } from './fixtures/common-journal.ts'
import { unpackText } from '@omne-harness/sql-contract/worker'
import { sqlScene, type SqlScene } from './fixtures/sql-scene.ts'
import { toolCall } from './fixtures/tool-call.ts'

type Journal = AgentJournal<string>
type Authority = Parameters<Journal['commit']>[0]['authority']

const scope = ok(decodeScopeRef({ ref: 'scope:crash-scan' }))
const targetOf = (s: SqlScene): ContextTarget => ({ tenant: s.access.tenant, scope })

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

type Step = (journal: Journal) => Promise<Outcome<unknown, unknown>>

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
    expect(expected.intents).toBe(2)
    expect(expected.published).toBeGreaterThanOrEqual(script.length + 1)

    for (let k = 0; k < script.length; k += 1) {
      const { s, authority } = await opened(`scan-${String(k)}`)
      const steps = scriptOf(s, authority)
      const warm = s.view.journal
      for (const step of steps.slice(0, k)) ok(await step(warm))
      s.controls?.loseNextReply()
      expect(await steps[k]!(warm)).toMatchObject({ failure: { kind: 'commit-unknown' } })
      const after = cold(s)
      expect(await steps[k]!(after)).toHaveProperty('ok')
      for (const step of steps.slice(k + 1)) ok(await step(after))
      const got = await outcomeOf(s, after)
      expect(got.rows, `scan ${String(k)}`).toEqual(expected.rows)
      expect(got.published, `scan ${String(k)}`).toBe(expected.published)
      expect(got.revision, `scan ${String(k)}`).toBe(expected.revision)
      expect(got.checkpoint, `scan ${String(k)}`).toEqual(expected.checkpoint)
      const known = ok(
        await after.query({ ...s.access, execution: s.execution, operation: operation(nameOf(k)) }),
      )
      expect(known.kind).toBe('committed')
    }
  })
})

const nameOf = (k: number): string => ['c1-effect-a', 'c2-m0', 'c3-effect-b', 'c4-move'][k]!

const familyRows = (s: SqlScene, pub: number): FactRow[] =>
  factRows(s).filter(row => row.pub === pub && !row.kind.startsWith('core.'))

describe('a commit that brings no new fact', () => {
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
        ).reduce(
          (sum, row) => sum + Buffer.byteLength(unpackText(row[0] as Uint8Array), 'utf8'),
          0,
        ),
      )
    }
    expect(Math.max(...sizes)).toBeLessThan(512)
    expect(new Set(sizes).size).toBe(1)
    const known = ok(
      await cold(s).query({ ...s.access, execution: s.execution, operation: operation('same-2') }),
    )
    expect(known.kind).toBe('committed')
  })

  it('moves no revision', async () => {
    const { s, authority } = await opened('scan-envelope-rev')
    const revision = ok(await s.view.journal.load({ ...s.access, execution: s.execution })).revision
    ok(await commitStep(s, authority, 'same', c => c)(s.view.journal))
    expect(ok(await s.view.journal.load({ ...s.access, execution: s.execution })).revision).toBe(
      revision,
    )
  })
})
