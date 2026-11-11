// Behavior of the check after a summary (RQ-06, R2-D316): it judges the whole request against the
// trigger line, as `judgeBudget` does. A compaction that passes `deriveStep` therefore does not
// come back from `resume` as "still too big". Weights are the lengths of the `x` texts of the
// request, so the sizes of the counterexample in verification/formal-mapping.md are exact.
import { describe, expect, it } from 'vitest'
import type * as M from '@omne-harness/model-contract'
import type { CompactionMessage } from '@omne-harness/message'
import {
  assemble,
  budget,
  deriveStep,
  entry,
  epoch,
  evidence,
  fixture,
  message,
  planCompaction,
  rowWith,
  target,
  text,
  upper,
  type Ports,
  type Snapshot,
} from './fixtures.js'

const WINDOW = '10'
const HARD = '8'
/** Window 10, output 2, 60 percent: the trigger line is 6, the hard limit is 8. */
function profileOf(base: Snapshot['selection']['profile']): Snapshot['selection']['profile'] {
  return {
    ...base,
    definition: {
      ...base.definition,
      context: {
        window: { provided: WINDOW, upstream: [] },
        input: null,
        output: { provided: '2', upstream: [] },
        compactionTriggerPercent: '60',
      },
    },
  }
}

type Scenario = Readonly<{
  /** The weight of each history entry; the last entry is the new input. */
  weights: readonly number[]
  /** The weight of the system prompt (layer 1). */
  system: number
  /** Whether layer 6 carries one block, which weighs 1. */
  tail: boolean
  /** The index of the last covered entry. */
  cover: number
  /** The indexes of the retained entries. */
  retained: readonly number[]
  /** The weight of the summary. */
  summary: number
  bound: number
}>

const xs = (n: number) => 'x'.repeat(n)
const idOf = (index: number) => String(index).padStart(22, 'a')

/** The weight of a request: its `x` texts, plus one for each reminder message. */
function weightOf(request: unknown): number {
  const json = JSON.stringify(request)
  const texts = [...json.matchAll(/"text":"(x+)"/gu)].reduce(
    (sum, m) => sum + (m[1]?.length ?? 0),
    0,
  )
  return texts + [...json.matchAll(/"role":"system_reminder"/gu)].length
}

function build(s: Scenario) {
  const f = fixture()
  const messages = s.weights.map((w, i) => message(xs(w), idOf(i)))
  const refs = s.weights.map((_, i) => entry(`entry:${i}`))
  const rows = messages.map((m, i) => rowWith(i, m))
  const last = s.weights.length - 1
  const coveredRefs = refs.slice(0, s.cover + 1)
  const input: Snapshot = {
    ...f.input,
    history: { target, epoch, upper: upper(last) },
    selection: { ...f.input.selection, profile: profileOf(f.input.selection.profile) },
    promptContributions: {
      contributions:
        s.system === 0
          ? []
          : [
              {
                kind: 'section',
                name: 's',
                order: '1',
                template: xs(s.system),
                uses: [],
                scope: null,
                source: { owner: 'test', name: 'test', revision: '1', digest: 'd' },
                revision: '1',
              },
            ],
      digest: `prompt-${s.system}`,
      generation: null,
    },
    contextRead: {
      ...f.input.contextRead,
      perRequest: s.tail
        ? [
            {
              key: 'test.tail',
              revision: 1,
              value: { at: 1 },
              previous: null,
              volatility: 'per-request',
            } as Snapshot['contextRead']['perRequest'][number],
          ]
        : [],
    },
  }
  const ports: Ports = {
    ...f.ports,
    history: {
      ...f.ports.history,
      async read() {
        return { kind: 'page', page: { rows: [...rows, ...(extra.rows ?? [])], next: null } }
      },
      async compactionContext({ evidence: current }) {
        return {
          kind: 'context',
          evidence: current,
          value: {
            origin: refs[0] as (typeof refs)[number],
            base: { kind: 'initial' },
            covered: refs.slice(0, last).map((ref, i) => ({ ref, message: messages[i] })) as never,
            after: [{ ref: refs[last] as (typeof refs)[number], message: messages[last] }] as never,
            open: [],
          },
        }
      },
    },
    plan: value => ({
      ok: {
        parameters: [],
        representation: {
          kind: 'materialized',
          adoption: value.assembled.representation,
          tokenInput: {
            kind: 'string',
            value: JSON.stringify({ system: value.assembled.system, m: value.assembled.messages }),
          },
          media: [],
          requestBytes: '1',
        },
      },
    }),
    meter: {
      ...f.ports.meter,
      async measure(measured) {
        const tokens = (measured as { representation: { tokenInput: { value: string } } })
          .representation.tokenInput.value
        const report = budget(String(weightOf(JSON.parse(tokens))))
        const checks = report.checks.map(c => ({ ...c, limit: HARD }) as M.BudgetCheck)
        return { ok: { ...report, checks } }
      },
    },
  }
  const extra: { rows?: ReturnType<typeof rowWith>[] } = {}
  const policies = {
    ...f.policies,
    compaction: {
      ...f.policies.compaction,
      config: { ...f.policies.compaction.config, stepBound: String(s.bound) },
      plan: async () => ({
        kind: 'draft' as const,
        coverTo: coveredRefs.at(-1) as (typeof refs)[number],
        retained: s.retained.map(i => refs[i] as (typeof refs)[number]),
        bound: String(s.bound),
        shape: { kind: 'summarize' as const, trimFirst: false },
      }),
    },
  }
  return { input, ports, policies, extra, last }
}

/** Plans, then derives with a summary of `s.summary`; the history is the one the plan read. */
async function compact(s: Scenario) {
  const c = build(s)
  const before = await assemble(c.input, c.ports, c.policies)
  const planned = await planCompaction(c.input, c.ports, c.policies)
  if (planned.kind !== 'planned') return { c, before, planned, step: null }
  const step = await deriveStep(
    c.input,
    {
      plan: planned.plan,
      progress: planned.progress,
      material: planned.first.material,
      step: {
        kind: 'summary',
        index: '0',
        produced: [text(xs(s.summary), 'sum')] as const,
        consumed: evidence,
      },
    },
    c.ports,
    c.policies,
  )
  return { c, before, planned, step }
}

/** What `resume` sees after the commit: the history with the compaction record appended. */
async function resumed(c: ReturnType<typeof build>, record: CompactionMessage, plan: string) {
  c.extra.rows = [rowWith(c.last + 1, record)]
  const input: Snapshot = {
    ...c.input,
    history: { ...c.input.history, upper: upper(c.last + 1) },
    previous: { candidate: c.input.identity.candidate, enteredCompaction: plan as never },
  }
  return assemble(input, c.ports, c.policies)
}

const counterexample: Scenario = {
  weights: [1, 2, 2, 2],
  system: 0,
  tail: false,
  cover: 0,
  retained: [],
  summary: 1,
  bound: 1,
}

describe('the check after a summary is the check of the whole request', () => {
  it('the counterexample sizes: the whole request needs compaction, and sizes 7 after the summary', async () => {
    const { before, planned } = await compact(counterexample)
    expect(before.kind).toBe('needs-compaction')
    expect(planned.kind).toBe('planned')
  })

  // Red when the check compares the hard limit only: it would give a transition (7 is under 8)
  // that `resume` then judges over the trigger line (6) and turns into cannot-fit.
  it('a summary that leaves the request over the trigger line gives no transition', async () => {
    const { c, step } = await compact(counterexample)
    expect(step).toMatchObject({
      kind: 'cannot-fit',
      reason: 'after-compaction',
      cause: 'bound-exhausted',
    })
    expect(c.ports).toBeDefined()
  })

  it('with steps left it asks for the next summary instead of a transition', async () => {
    const { step } = await compact({ ...counterexample, bound: 2 })
    expect(step).toMatchObject({ kind: 'next', progress: { completed: '1' } })
  })

  // The same history with the coverage that fits: the compaction succeeds, and the commit is
  // followed by a request that fits (the property CompactionKeepsWork of CompactionFit.tla).
  it('a larger coverage compacts, and the request after the commit fits', async () => {
    const { c, step, planned } = await compact({ ...counterexample, cover: 1 })
    expect(step).toMatchObject({ kind: 'transition' })
    if (step?.kind !== 'transition' || planned.kind !== 'planned') return
    const after = await resumed(c, step.value.message, planned.plan.planId)
    expect(after.kind).toMatch(/^candidate-/u)
  })

  // Red when the check leaves out layer 1 or layer 6: the request is over the line only with
  // them, and the transition would come back from `resume` as cannot-fit.
  it('counts the system prompt and layer 6 in the request', async () => {
    const plain: Scenario = { ...counterexample, weights: [1, 2, 2, 1], cover: 1 }
    expect((await compact(plain)).step).toMatchObject({ kind: 'transition' })
    for (const framed of [
      { ...plain, system: 3 },
      { ...plain, tail: true, system: 2 },
    ]) {
      const { c, step, planned } = await compact(framed)
      expect(step?.kind, JSON.stringify(framed)).not.toBe('transition')
      if (step?.kind === 'transition' && planned.kind === 'planned')
        expect((await resumed(c, step.value.message, planned.plan.planId)).kind).toMatch(
          /^candidate-/u,
        )
    }
  })

  // The model property over generated cases: every transition `deriveStep` gives is followed by a
  // request that fits; only a request that cannot fit is refused, and before the commit.
  it('every transition is followed by a request that fits', async () => {
    let seed = 7
    const next = (n: number) => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
      return (seed >>> 8) % n
    }
    let transitions = 0
    let refused = 0
    for (let i = 0; i < 160; i++) {
      const weights = Array.from({ length: 4 }, () => 1 + next(2))
      const cover = next(3)
      const retained = [0, 1, 2].filter(k => k <= cover && next(3) === 0).slice(0, 1)
      const s: Scenario = {
        weights,
        system: next(2),
        tail: next(2) === 1,
        cover,
        retained,
        summary: 1 + next(2),
        bound: 1,
      }
      const { c, before, step, planned } = await compact(s)
      if (before.kind !== 'needs-compaction' || planned.kind !== 'planned' || step === null)
        continue
      if (step.kind === 'transition') {
        transitions++
        const after = await resumed(c, step.value.message, planned.plan.planId)
        expect(after.kind, JSON.stringify(s)).toMatch(/^candidate-/u)
      } else {
        refused++
        expect(step.kind, JSON.stringify(s)).toBe('cannot-fit')
      }
    }
    expect(transitions).toBeGreaterThan(5)
    expect(refused).toBeGreaterThan(5)
  })
})
