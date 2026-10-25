import { describe, it, expect } from 'vitest'
import {
  assembleSystemPrompt,
  project,
  projectForHuman,
  placeContext,
  decodePlanId,
  compactionSettingsBlock,
  windowUsageBlock,
  compactionPolicySchema,
  planProgressSchema,
  coverageSchema,
} from '@omne-harness/request-context-contract'
import {
  fixture,
  must,
  text,
  row,
  entry,
  adoption,
  evidence,
  scope,
  epoch,
  assemble,
  resume,
  planCompaction,
  deriveStep,
  sourcesFor,
  rowWith,
  type Ports,
} from './fixtures.js'

describe('assembly closed outcomes and source boundaries', () => {
  it('assembles deterministic six-layer candidates and measures the planned request bytes', async () => {
    const f = fixture()
    const seen: string[] = []
    const meter = f.ports.meter
    const ports = {
      ...f.ports,
      plan: ((value: Parameters<NonNullable<Ports['plan']>>[0]) => ({
        ok: {
          parameters: [],
          representation: {
            kind: 'materialized' as const,
            adoption: value.assembled.representation,
            tokenInput: { kind: 'null' as const },
            media: [],
            requestBytes: '103',
          },
        },
      })) satisfies NonNullable<Ports['plan']>,
      meter: {
        ...meter,
        measure: (input: Parameters<typeof meter.measure>[0]) => {
          seen.push(
            input.representation.kind === 'materialized'
              ? input.representation.requestBytes
              : 'pending',
          )
          return meter.measure(input)
        },
      },
    }
    const a = await assemble(f.input, ports, f.policies),
      b = await assemble(f.input, ports, f.policies)
    expect(a).toEqual(b)
    expect(a.kind).toBe('candidate-before-extension')
    expect(seen).toEqual(['103', '103', '103', '103'])
    if (a.kind === 'candidate-before-extension') {
      expect(a.candidate.coverage.history.anchors.at(-1)?.prefixDigest).toBe('chain:0')
      expect(a.candidate.assembled.messages).toHaveLength(1)
    }
  })
  it('requires reliable input save and uses caller scope', async () => {
    const f = fixture()
    expect(
      (
        await assemble(
          { ...f.input, inputs: { ...f.input.inputs, saved: null } },
          f.ports,
          f.policies,
        )
      ).kind,
    ).toBe('invalid')
    expect(f.counts().reads).toBe(0)
  })
  it.each(['denied', 'unknown', 'unavailable'] as const)('preserves history %s', async kind => {
    const f = fixture()
    const p = {
      ...f.ports,
      history: {
        ...f.ports.history,
        read: async () => (kind === 'unavailable' ? { kind, diagnostic: 'offline' } : { kind }),
      },
    }
    expect((await assemble(f.input, p, f.policies)).kind).toBe(kind)
  })
  it('does not turn snapshot missing list into blank success', async () => {
    const f = fixture()
    const result = await assemble(
      { ...f.input, contextRead: { ...f.input.contextRead, read: { kind: 'missing', items: [] } } },
      f.ports,
      f.policies,
    )
    expect(result.kind).toBe('unavailable')
  })
  it('fixed input overflow is cannot-fit; entered plan changes outcome without changing input content', async () => {
    const f = fixture()
    let calls = 0
    const p = {
      ...f.ports,
      meter: { ...f.ports.meter, measure: () => ({ ok: f.budget(++calls % 2 ? '900' : '1') }) },
    }
    expect((await assemble(f.input, p, f.policies)).kind).toBe('needs-compaction')
    expect(
      (
        await assemble(
          {
            ...f.input,
            previous: {
              candidate: f.input.identity.candidate,
              enteredCompaction: must(decodePlanId('plan:old')),
            },
          },
          p,
          f.policies,
        )
      ).kind,
    ).toBe('cannot-fit')
    const overflow = {
      ...f.ports,
      meter: { ...f.ports.meter, measure: () => ({ ok: f.budget('1001') }) },
    }
    const result = await assemble(f.input, overflow, f.policies)
    expect(result).toMatchObject({ kind: 'cannot-fit', reason: 'fixed-part-over-limit' })
  })
  it('unknown upstream limit still produces candidate with evidence', async () => {
    const f = fixture()
    const budget = f.budget()
    const p = {
      ...f.ports,
      meter: {
        ...f.ports.meter,
        measure: () => ({
          ok: {
            ...budget,
            checks: budget.checks.map(c => ({
              ...c,
              constraint: { ...c.constraint, upstream: { kind: 'unknown' as const } },
            })),
          },
        }),
      },
    }
    const result = await assemble(f.input, p, f.policies)
    expect(result.kind).toBe('candidate-before-extension')
    if (result.kind === 'candidate-before-extension')
      expect(result.candidate.verdict.kind).toBe('limit-unknown')
  })
  it('epoch changes discard prior pages and all next pages use the new evidence', async () => {
    const f = fixture()
    let n = 0
    const seen: string[] = []
    const next = must(
      (await import('@omne-harness/request-context-contract')).decodeEpochId('epoch:2'),
    )
    const p: typeof f.ports = {
      ...f.ports,
      history: {
        ...f.ports.history,
        read: async ({ evidence: e }) => {
          seen.push(e.epoch)
          n++
          if (n > 1) return { kind: 'page' as const, page: { rows: [row()], next: null } }
          // The holder committed a compaction: the history group itself moves to the new epoch.
          const sources = sourcesFor(f.input, p)
          const history = sources.values().history
          sources.update('history', { ...history, evidence: { ...history.evidence, epoch: next } })
          return { kind: 'epoch-changed' as const, current: { ...e, epoch: next } }
        },
      },
    }
    const result = await assemble(f.input, p, f.policies)
    expect(seen).toEqual([epoch, next])
    if (result.kind === 'candidate-before-extension')
      expect(result.candidate.coverage.history.epoch).toBe(next)
  })
  it('resume requires full snapshot before reading and counting', async () => {
    const f = fixture()
    const transition = {
      planId: must(decodePlanId('plan:1')),
      candidate: f.input.identity.candidate,
      committed: evidence,
      epoch,
    }
    const result = await resume(
      {
        ...f.input,
        transition,
        contextRead: {
          ...f.input.contextRead,
          read: {
            kind: 'success',
            registration: { issued: 0, current: 0 },
            value: {
              scope,
              from: 1,
              to: 2,
              cursor: { cursor: 'c' },
              entries: [],
              missing: [],
              perRequest: [],
            },
          },
        },
      },
      f.ports,
      f.policies,
    )
    expect(result).toMatchObject({ kind: 'invalid', reason: 'resume-without-full-snapshot' })
    expect(f.counts().meters).toBe(0)
  })
})
describe('prompt and placement', () => {
  it('sorts sections by order then name and shadows variables by scope', () => {
    const f = fixture()
    const source = { source: adoption, revision: '1' }
    const result = assembleSystemPrompt(
      {
        digest: 'd',
        generation: null,
        contributions: [
          {
            kind: 'variable',
            name: 'who',
            value: 'global',
            volatility: 'stable',
            scope: null,
            ...source,
          },
          { kind: 'variable', name: 'who', value: 'local', volatility: 'stable', scope, ...source },
          {
            kind: 'section',
            name: 'b',
            order: '1',
            template: 'B {{who}}',
            uses: ['who'],
            scope: null,
            ...source,
          },
          {
            kind: 'section',
            name: 'a',
            order: '1',
            template: 'A',
            uses: [],
            scope: null,
            ...source,
          },
        ],
      },
      f.input.assembleContext,
    )
    expect(result.kind).toBe('rendered')
    if (result.kind === 'rendered') expect(result.blocks[0]).toMatchObject({ text: 'A\nB local' })
  })
  it('rejects referenced volatile variables', () => {
    const f = fixture()
    expect(
      assembleSystemPrompt(
        {
          digest: 'd',
          generation: null,
          contributions: [
            {
              kind: 'variable',
              name: 'date',
              value: 'today',
              volatility: 'per-request',
              scope: null,
              source: adoption,
              revision: '1',
            },
            {
              kind: 'section',
              name: 's',
              order: '1',
              template: '{{date}}',
              uses: ['date'],
              scope: null,
              source: adoption,
              revision: '1',
            },
          ],
        },
        f.input.assembleContext,
      ).kind,
    ).toBe('invalid')
  })
  it('puts per-request facts only in last reminder and omits new input from anchor', () => {
    const f = fixture()
    const block = {
      key: 'context.window-usage' as const,
      revision: 1,
      value: { ratio: '0.1' },
      previous: null,
      volatility: 'per-request' as const,
    }
    const placed = placeContext({
      candidate: f.input.identity.candidate,
      contextRead: { ...f.input.contextRead, perRequest: [block] },
      adopted: null,
      transition: null,
      view: project([row()], epoch),
      newInputs: { ...f.input.inputs, entries: [entry('entry:0')] },
    })
    expect(placed).toMatchObject({
      snapshot: { blocks: [], anchor: { position: { kind: 'empty' }, prefixDigest: null } },
      tail: { blocks: [block] },
    })
  })
  it('rejects incremental reads with no previous snapshot material', () => {
    const f = fixture()
    const placed = placeContext({
      candidate: f.input.identity.candidate,
      contextRead: { ...f.input.contextRead, snapshot: null },
      adopted: null,
      transition: null,
      view: project([], epoch),
      newInputs: f.input.inputs,
    })
    expect(placed).toMatchObject({ kind: 'invalid', reason: 'missing-snapshot-material' })
  })
})
describe('projection and compaction plans', () => {
  it('does not mutate source and excludes private/tool-internal model blocks', () => {
    const r = row()
    const privateMessage = {
      id: r.message.id,
      role: 'user',
      blocks: [{ ...text('secret'), visibility: { toModel: false, toHuman: true } }],
    } as const
    expect(project([rowWith(0, privateMessage)], epoch).messages).toHaveLength(0)
    expect(projectForHuman([rowWith(0, privateMessage)]).entries).toHaveLength(1)
    expect(privateMessage.blocks[0].text).toBe('secret')
  })
  it('returns planned step and transitions with deterministic required message id', async () => {
    const f = fixture()
    const planned = await planCompaction(f.input, f.ports, f.policies)
    expect(planned.kind).toBe('planned')
    if (planned.kind !== 'planned') return
    const input = {
      plan: planned.plan,
      progress: planned.progress,
      material: planned.first.material,
      step: {
        kind: 'summary' as const,
        index: '0',
        produced: [text('summary')] as const,
        consumed: evidence,
      },
    }
    const result = await deriveStep(f.input, input, f.ports, f.policies)
    expect(result.kind).toBe('transition')
    expect(await deriveStep(f.input, input, f.ports, f.policies)).toEqual(result)
    if (result.kind === 'transition') {
      expect(result.progress.completed).toBe('1')
      expect(result.value.message.id).toMatch(/^msg_/)
    }
  })
  it('trims inside the first summarize step and checks step index against progress', async () => {
    const f = fixture()
    const trimmed: unknown[] = []
    const policies = {
      ...f.policies,
      compaction: {
        ...f.policies.compaction,
        config: { ...f.policies.compaction.config, trimFirst: true, stepBound: '1' },
        trim: (material: Parameters<typeof f.policies.compaction.trim>[0]) => {
          trimmed.push(material)
          return { ...material, trimmed: [] }
        },
        plan: async () => ({
          kind: 'draft' as const,
          coverTo: entry('entry:0'),
          retained: [],
          bound: '1',
          shape: { kind: 'summarize' as const, trimFirst: true },
        }),
      },
    }
    const planned = await planCompaction(f.input, f.ports, policies)
    if (planned.kind !== 'planned') throw new Error(planned.kind)
    expect(planned.first).toMatchObject({ kind: 'summarize', index: '0' })
    expect(planned.progress.completed).toBe('0')
    expect(trimmed).toHaveLength(1)
    const summary = {
      kind: 'summary' as const,
      produced: [text('summary')] as const,
      consumed: evidence,
    }
    expect(
      await deriveStep(
        f.input,
        {
          plan: planned.plan,
          progress: planned.progress,
          material: planned.first.material,
          step: { ...summary, index: '1' },
        },
        f.ports,
        policies,
      ),
    ).toMatchObject({ kind: 'invalid', reason: 'progress-mismatch' })
    // Bound 1: the trimmed material completes in one summarize step.
    expect(
      await deriveStep(
        f.input,
        {
          plan: planned.plan,
          progress: planned.progress,
          material: planned.first.material,
          step: { ...summary, index: '0' },
        },
        f.ports,
        policies,
      ),
    ).toMatchObject({ kind: 'transition', progress: { completed: '1' } })
    // Later steps consume the same material; nothing trims again.
    expect(trimmed).toHaveLength(1)
  })
  it('rejects floor above retention budget and step veto closes the plan', async () => {
    const f = fixture()
    const policies = {
      ...f.policies,
      compaction: {
        ...f.policies.compaction,
        config: {
          ...f.policies.compaction.config,
          retainBudget: { kind: 'tokens' as const, retainTokens: '0' },
        },
      },
    }
    const ports = {
      ...f.ports,
      history: {
        ...f.ports.history,
        compactionContext: async ({ evidence: current }: { evidence: typeof f.input.history }) => ({
          kind: 'context' as const,
          evidence: current,
          value: {
            origin: entry('entry:0'),
            base: { kind: 'initial' as const },
            covered: [{ ref: entry('entry:0'), message: row().message }],
            after: [],
            open: [entry('entry:0')],
          },
        }),
      },
    }
    expect(await planCompaction(f.input, ports, policies)).toMatchObject({
      kind: 'cannot-fit',
      reason: 'floor-exceeds-budget',
    })
  })
})
it('required block schemas and durable decoders reject malformed values', () => {
  expect(compactionSettingsBlock.required).toBe(true)
  expect(windowUsageBlock.required).toBe(true)
  expect(compactionPolicySchema['~standard'].validate({})).toHaveProperty('issues')
  expect(
    planProgressSchema['~standard'].validate({ planId: 'plan:1', completed: '-1' }),
  ).toHaveProperty('issues')
  expect(coverageSchema['~standard'].validate({ history: {} })).toHaveProperty('issues')
})
it('caller-carried stable layers skip history reads while tail/representation/budget/outcome remain live', async () => {
  const f = fixture()
  const first = await assemble(f.input, f.ports, f.policies)
  if (first.kind !== 'candidate-before-extension') throw new Error(first.kind)
  const before = f.counts()
  const result = await assemble(
    {
      ...f.input,
      previous: {
        candidate: f.input.identity.candidate,
        enteredCompaction: null,
        carried: first.candidate,
      },
    },
    f.ports,
    f.policies,
  )
  expect(result.kind).toBe('candidate-before-extension')
  expect(f.counts().reads).toBe(before.reads)
  expect(f.counts().meters).toBe(before.meters + 2)
  const changed = await assemble(
    {
      ...f.input,
      conditions: { ...f.input.conditions, revision: '2' },
      previous: {
        candidate: f.input.identity.candidate,
        enteredCompaction: null,
        carried: first.candidate,
      },
    },
    f.ports,
    f.policies,
  )
  expect(changed.kind).toBe('candidate-before-extension')
  // Only the control group changed: the history token is equal, so the rows are reused.
  expect(f.counts().reads).toBe(before.reads)
  expect(f.counts().meters).toBe(before.meters + 4)
})
