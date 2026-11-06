// Machine guards of the formal properties in verification/models (README there). Each block
// names the property it guards and the defect that turns it red. Generated cases use a seeded
// generator, so a red case is reproducible from its seed.
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type * as M from '@omne-harness/model-contract'
import { judgeBudget, type AssemblyResult } from '@omne-harness/request-context-contract'
import {
  adoption,
  assemble,
  basis,
  budget,
  deriveStep,
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

const CASES = 48

/** mulberry32: a small seeded generator, enough for reproducible cases. */
function generator(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
    bool: () => next() < 0.5,
  }
}
type Gen = ReturnType<typeof generator>

function canonical(value: unknown): string {
  if (value === undefined || value === null || typeof value !== 'object')
    return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
    .join(',')}}`
}
const sha = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex')

type Block = Snapshot['contextRead']['perRequest'][number]
/** The stably read materials of one case: history texts and the layer ⑥ blocks. */
type Materials = Readonly<{ texts: readonly string[]; tail: readonly Block[] }>

function perRequest(key: string, value: unknown): Block {
  return { key, revision: 1, value, previous: null, volatility: 'per-request' } as Block
}
function materials(g: Gen): Materials {
  const texts = Array.from({ length: g.int(1, 5) }, (_, i) => `t${i}-${g.int(0, 9)}`)
  const tail: Block[] = []
  if (g.bool()) tail.push(perRequest('context.window-usage', { kind: 'not-fixed' }))
  if (g.bool()) tail.push(perRequest('test.clock', { at: String(g.int(0, 99)) }))
  return { texts, tail }
}

/** The input and ports of one case; `amount` and `digestOf` script the meter. */
function caseOf(
  m: Materials,
  meter: Readonly<{
    amount: string | ((input: unknown) => string)
    digestOf?: (input: unknown) => string
  }>,
  options: Readonly<{ reverseTail?: boolean; profile?: Snapshot['selection']['profile'] }> = {},
) {
  const f = fixture()
  const rows = m.texts.map((t, i) => rowWith(i, message(t, String(i).padStart(22, 'a'))))
  const last = rows.length - 1
  const tail = options.reverseTail ? [...m.tail].reverse() : [...m.tail]
  const seen: M.AssembledModelInput[] = []
  const input: Snapshot = {
    ...f.input,
    history: { target, epoch, upper: upper(last) },
    contextRead: { ...f.input.contextRead, perRequest: tail },
    selection:
      options.profile === undefined
        ? f.input.selection
        : { ...f.input.selection, profile: options.profile },
  }
  const ports: Ports = {
    ...f.ports,
    history: {
      ...f.ports.history,
      async read() {
        return { kind: 'page', page: { rows, next: null } }
      },
    },
    plan: value => {
      seen.push(value.assembled)
      return {
        ok: {
          parameters: [],
          representation: {
            kind: 'materialized',
            adoption: value.assembled.representation,
            tokenInput: { kind: 'string', value: canonical(value.assembled.messages) },
            media: [],
            requestBytes: String(Buffer.byteLength(canonical(value.assembled))),
          },
        },
      }
    },
    meter: {
      basis,
      async measure(measured) {
        const report = budget(
          typeof meter.amount === 'string' ? meter.amount : meter.amount(measured),
        )
        return {
          ok: {
            ...report,
            inputDigest:
              meter.digestOf === undefined ? report.inputDigest : meter.digestOf(measured),
          },
        }
      },
    },
  }
  return { input, ports, policies: f.policies, seen, rows }
}

function candidateOf(result: AssemblyResult) {
  if (result.kind !== 'candidate-before-extension' && result.kind !== 'candidate-fixable')
    throw new Error(`No candidate: ${result.kind}`)
  return result.candidate
}
const contentDigest = (measured: unknown) =>
  sha((measured as { representation: unknown }).representation)

describe('FR: the content of a request is a function of its stably read materials', () => {
  // Red when the content depends on the measurement, on call order or on the order a source
  // lists its per-request blocks (FixedReplay: the derivation the replay claim rests on).
  it('equal materials give equal content under different meters and block order', async () => {
    for (let seed = 1; seed <= CASES; seed++) {
      const m = materials(generator(seed))
      const a = caseOf(m, { amount: '1' })
      const b = caseOf(m, { amount: '7' }, { reverseTail: true })
      const first = candidateOf(await assemble(a.input, a.ports, a.policies))
      const second = candidateOf(await assemble(b.input, b.ports, b.policies))
      expect(canonical(second.assembled), `seed ${seed}`).toBe(canonical(first.assembled))
      expect(second.verdict.report).not.toEqual(first.verdict.report)
    }
  })

  // Red when a part of the request is assembled after measurement or is left out of the measured
  // input: the recorded input digest would then not tell two contents apart, and a recovery that
  // compares digests would re-admit another request under the fixed identity (SentMatchesRecord).
  it('the recorded input digest changes with every change of content, layer ⑥ included', async () => {
    for (let seed = 1; seed <= CASES; seed++) {
      const g = generator(seed)
      const m = materials(g)
      const changed: Materials = g.pick([
        { ...m, tail: [...m.tail, perRequest('test.extra', { seed })] },
        { ...m, texts: [...m.texts.slice(0, -1), `${m.texts.at(-1) ?? ''}x`] },
        { ...m, texts: [...m.texts, 'appended'] },
      ])
      const run = async (value: Materials) => {
        const c = caseOf(value, { amount: '1', digestOf: contentDigest })
        return candidateOf(await assemble(c.input, c.ports, c.policies))
      }
      const [base, again, other] = [await run(m), await run(m), await run(changed)]
      expect(again.coverage.budget.inputDigest).toBe(base.coverage.budget.inputDigest)
      expect(canonical(other.assembled)).not.toBe(canonical(base.assembled))
      expect(other.coverage.budget.inputDigest, `seed ${seed}`).not.toBe(
        base.coverage.budget.inputDigest,
      )
    }
  })

  // The replay counterexample of FixedReplay in code: fixing a request changes the adopted fact,
  // so context.window-usage in layer ⑥ changes and so does the content. Red when the tail stops
  // reaching the measured input, which would hide this difference from the digest comparison.
  it('a fixing that moves context.window-usage changes the content and its digest', async () => {
    const before = {
      texts: ['a', 'b'],
      tail: [perRequest('context.window-usage', { kind: 'not-fixed' })],
    }
    const after = {
      texts: ['a', 'b'],
      tail: [
        perRequest('context.window-usage', {
          kind: 'estimate',
          candidate: 'candidate:1',
          usedTokens: '1',
          windowTokens: '1000',
          ratio: '0.001',
        }),
      ],
    }
    const run = async (value: Materials) => {
      const c = caseOf(value, { amount: '1', digestOf: contentDigest })
      return candidateOf(await assemble(c.input, c.ports, c.policies))
    }
    const [x, replayed] = [await run(before), await run(after)]
    expect(replayed.coverage.budget.inputDigest).not.toBe(x.coverage.budget.inputDigest)
  })
})

describe('CF: capacity outcomes are closed and visible', () => {
  const check = (
    metric: string,
    amount: string,
    limit: string,
    estimate: string | null,
  ): M.BudgetCheck =>
    ({
      supplier: adoption,
      metric,
      subject: 'whole',
      measurement:
        estimate === null
          ? { kind: 'exact', amount, method: adoption }
          : {
              kind: 'estimate',
              amount,
              margin: estimate,
              method: adoption,
              marginSource: adoption,
            },
      limit,
      constraint: {
        profile: adoption,
        upstream: { kind: 'finite', amount: limit, source: adoption },
      },
    }) as M.BudgetCheck
  const up = (c: M.BudgetCheck) =>
    BigInt(c.measurement.amount) +
    BigInt(c.measurement.kind === 'estimate' ? c.measurement.margin : '0')

  // Red when a request over a hard limit or over the trigger line is judged to fit, when the
  // estimate margin is dropped, or when the fixed part is not what decides cannot-fit.
  it('judgeBudget never lets a request over a limit or the trigger fit', () => {
    for (let seed = 1; seed <= CASES * 4; seed++) {
      const g = generator(seed)
      const window = g.int(10, 200)
      const output = g.int(0, window - 1)
      const percent = g.int(1, 100)
      const limit = window - output
      const checks = [
        check(
          'input-tokens',
          String(g.int(0, window)),
          String(limit),
          g.bool() ? String(g.int(0, 9)) : null,
        ),
        check('request-bytes', String(g.int(0, 300)), String(g.int(1, 300)), null),
      ]
      const fixedChecks = [check('input-tokens', String(g.int(0, window)), String(limit), null)]
      const report = { ...budget(), checks }
      const verdict = judgeBudget({
        whole: report,
        fixedPart: { ...budget(), checks: fixedChecks },
        context: {
          window: { provided: String(window), upstream: [] },
          input: null,
          output: { provided: String(output), upstream: [] },
          compactionTriggerPercent: String(percent),
        },
        limits: [],
        policy: {
          retainBudget: { kind: 'tokens', retainTokens: '1' },
          retainPreference: 'newest-first',
          triggerPercent: null,
          headroomTokens: null,
          trimFirst: false,
          stepBound: '1',
        },
      })
      const trigger = Math.min(Math.floor((window * percent) / 100), window - output)
      const fixedOver = fixedChecks.some(c => up(c) > BigInt(c.limit))
      const over = checks.some(c => up(c) > BigInt(c.limit))
      const input = up(checks[0] as M.BudgetCheck)
      expect(verdict.kind === 'fixed-part-over-limit', `seed ${seed}`).toBe(fixedOver)
      if (verdict.kind === 'fits' || verdict.kind === 'limit-unknown') {
        expect(over, `seed ${seed}`).toBe(false)
        expect(input <= BigInt(trigger), `seed ${seed}`).toBe(true)
      }
      if (!fixedOver && (over || input > BigInt(trigger)))
        expect(verdict.kind, `seed ${seed}`).toBe('needs-compaction')
    }
  })

  // Red when a preparation enters a second compaction plan (hot loop), or when a request that
  // does not fit is handed out as a candidate with part of its history cut away.
  it('a request that does not fit is never a shortened candidate, and plans at most once', async () => {
    for (let seed = 1; seed <= CASES; seed++) {
      const g = generator(seed)
      const m = materials(g)
      const amount = g.pick(['1', '900', '1001'])
      const c = caseOf(m, { amount })
      const entered = g.bool()
      const input: Snapshot = entered
        ? {
            ...c.input,
            previous: {
              candidate: c.input.identity.candidate,
              enteredCompaction: 'plan_x' as never,
            },
          }
        : c.input
      const result = await assemble(input, c.ports, c.policies)
      if (result.kind === 'candidate-before-extension' || result.kind === 'candidate-fixable') {
        expect(amount, `seed ${seed}`).toBe('1')
        const ids = result.candidate.assembled.messages.map(x => x.id)
        for (const r of c.rows) expect(ids, `seed ${seed}`).toContain(r.message.id)
      } else if (amount === '1') {
        throw new Error(`seed ${seed}: a fitting request did not give a candidate: ${result.kind}`)
      } else if (amount === '1001') {
        // the fixed part itself is over the limit: cannot-fit, with or without a plan
        expect(result, `seed ${seed}`).toMatchObject({
          kind: 'cannot-fit',
          reason: 'fixed-part-over-limit',
        })
      } else {
        expect(result.kind, `seed ${seed}`).toBe(entered ? 'cannot-fit' : 'needs-compaction')
      }
    }
  })
})

describe('RA: every Model input takes the representation the profile fixes', () => {
  // Red when any candidate (whole, fixed part, retention probe, post-summary check) takes the
  // representation strategy identity or a constant instead of profile.definition.representation.
  it('assemble, planCompaction and deriveStep give rules.plan the profile representation', async () => {
    const base = fixture().input.selection.profile
    for (let seed = 1; seed <= CASES / 4; seed++) {
      const g = generator(seed)
      const representation = { ...adoption, name: `rep-${g.int(0, 999)}`, digest: `d${seed}` }
      const profile = { ...base, definition: { ...base.definition, representation } }
      const fits = caseOf(materials(g), { amount: '1' }, { profile })
      candidateOf(await assemble(fits.input, fits.ports, fits.policies))
      // Over the trigger only with the whole history: the retention probe and the post-summary
      // check measure fewer messages and fit.
      const whole = (measured: unknown) => {
        const tokens = (measured as { representation: { tokenInput: { value: string } } })
          .representation.tokenInput.value
        return (JSON.parse(tokens) as unknown[]).length >= 2 ? '900' : '1'
      }
      const over = caseOf(
        { texts: ['only'], tail: [perRequest('test.clock', { seed })] },
        { amount: whole },
        { profile },
      )
      expect((await assemble(over.input, over.ports, over.policies)).kind).toBe('needs-compaction')
      const planned = await planCompaction(over.input, over.ports, over.policies)
      expect(planned.kind, `seed ${seed}`).toBe('planned')
      if (planned.kind !== 'planned') continue
      const step = {
        plan: planned.plan,
        progress: planned.progress,
        material: planned.first.material,
        step: {
          kind: 'summary' as const,
          index: '0',
          produced: [text('s')] as const,
          consumed: evidence,
        },
      }
      await deriveStep(over.input, step, over.ports, over.policies)
      const seen = [...fits.seen, ...over.seen]
      expect(seen.length).toBeGreaterThanOrEqual(4)
      for (const assembled of seen)
        expect(assembled.representation, `seed ${seed}`).toEqual(representation)
    }
  })
})
