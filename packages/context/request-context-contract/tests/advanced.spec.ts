import { it, expect } from 'vitest'
import { judgeBlockIdentity } from '@omne-harness/content-block'
import { judgeMessage } from '@omne-harness/message'
import {
  declareTools,
  project,
  chooseRepresentations,
  decodePlanId,
  compactionPlanSchema,
  coverageSchema,
  planProgressSchema,
} from '@omne-harness/request-context-contract'
import type { ToolAdoption } from '@omne-harness/request-context-contract'
import { createMemoryHistorySource } from '@omne-harness/request-context-contract/testing'
import {
  fixture,
  row,
  text,
  scope,
  epoch,
  entry,
  adoption,
  evidence,
  must,
  target,
  upper,
  assemble,
  planCompaction,
  deriveStep,
  adoptedOf,
  operationsFor,
  rowWith,
  message,
} from './fixtures.js'
it('resident known-unavailable declarations retain definition; nonresidents remain meta-tool data', () => {
  const definition = {
    kind: 'function' as const,
    name: 'lookup',
    description: 'lookup',
    adoption,
    requiredCapabilities: [],
    backgroundAllowed: false,
    programmable: true,
    declarations: {
      adoption,
      environment: null,
      attachments: [],
      inputModalities: [],
      outputModalities: [],
      settings: null,
    },
    parameters: {
      schema: { kind: 'object' as const, entries: [] },
      vocabulary: adoption,
      descriptions: [],
    },
    returns: { kind: 'ordinary' as const, program: { kind: 'none' as const } },
  }
  const available: ToolAdoption = {
    resident: true,
    availability: {
      kind: 'available',
      definition,
      executor: adoption,
      layer: { kind: 'official' },
    },
    binding: adoption,
  }
  const unavailable: ToolAdoption = {
    ...available,
    availability: { kind: 'known-unavailable', definition, reason: 'offline' },
  }
  expect(declareTools([available])).toEqual(declareTools([unavailable]))
  expect(declareTools([{ ...available, resident: false }]).direct).toEqual([])
  expect(declareTools([available]).programmatic).toHaveLength(1)
  expect(
    declareTools([
      {
        ...available,
        availability: {
          ...available.availability,
          definition: { ...definition, programmable: false },
        },
      },
    ]).programmatic,
  ).toEqual([])
})
it('projection preserves reasoning payload, rewrites at indices and removes dangling pairs', () => {
  const stateIdentity = judgeBlockIdentity({
    id: 'state',
    visibility: { toModel: true, toHuman: false },
  })
  if ('rejected' in stateIdentity) throw new Error('Fixture')
  const msg = judgeMessage({
    role: 'assistant',
    id: row().message.id,
    blocks: [
      { ...text('private', 'private'), visibility: { toModel: false, toHuman: true } },
      text('public', 'public'),
      {
        kind: 'reasoning_state',
        ...stateIdentity.ok,
        payload: 'opaque-state',
        pairs: ['private', 'public'],
      },
    ],
    replay: { scope: 's', format: 'f', at: [2] },
  })
  if ('rejected' in msg) throw new Error(msg.rejected)
  const result = project([rowWith(0, msg.ok)], epoch).messages[0]?.message
  expect(result?.role).toBe('assistant')
  if (result?.role === 'assistant') {
    expect(result.replay?.at).toEqual([1])
    expect(result.blocks[1]).toMatchObject({
      kind: 'reasoning_state',
      pairs: ['public'],
      payload: 'opaque-state',
    })
  }
})
it('tool media references remain deferred without reading or converting content', () => {
  const r = row()
  const marker = judgeBlockIdentity({ id: 'marker', visibility: { toModel: true, toHuman: true } })
  if ('rejected' in marker) throw new Error('Fixture')
  const message = judgeMessage({
    role: 'tool',
    id: r.message.id,
    blocks: [
      { kind: 'tool_result', ...marker.ok, callId: 'c' },
      {
        kind: 'image',
        id: 'media',
        visibility: { toModel: true, toHuman: true },
        ref: { storage: 's', key: 'k', mediaType: 'image/png', bytes: '123', digest: 'original' },
        transcript: null,
      },
    ],
  })
  if ('rejected' in message) throw new Error(message.rejected)
  const f = fixture()
  const result = chooseRepresentations({
    messages: [message.ok],
    conversions: new Map(),
    modalities: ['text'],
    policy: f.policies.representation,
  })
  expect(result.kind).toBe('chosen')
  if (result.kind === 'chosen') {
    expect(result.choices[0]?.choice).toBe('pending-load')
    expect(result.deferred).toHaveLength(1)
    expect(result.messages[0]).toEqual(message.ok)
  }
})
it('pagination retains the identical evidence and never concatenates old epoch pages', async () => {
  const f = fixture()
  const seen: unknown[] = []
  const history: typeof f.ports.history = {
    ...f.ports.history,
    async read({ evidence: e, cursor }) {
      seen.push(e)
      return {
        kind: 'page' as const,
        page: {
          rows: [row(cursor === null ? 0 : 1)],
          next: cursor === null ? { evidence: e, after: row(0).seq } : null,
        },
      }
    },
  }
  const result = await assemble(
    { ...f.input, history: { ...f.input.history, upper: upper(1) } },
    { ...f.ports, history },
    f.policies,
  )
  expect(result.kind).toBe('candidate-before-extension')
  expect(seen).toHaveLength(2)
  expect(seen[0]).toBe(seen[1])
})
it('snapshot reminder is byte-identical and anchored across incremental reads', async () => {
  const f = fixture()
  const material = {
    scope,
    eligibility: { eligibility: 'e' },
    revision: 1,
    blocks: [
      {
        key: 'context.test' as const,
        revision: 1,
        value: { z: 1, a: 2 },
        previous: null,
        volatility: 'stable' as const,
      },
    ],
  }
  const first = await assemble(
    { ...f.input, contextRead: { ...f.input.contextRead, snapshot: material } },
    f.ports,
    f.policies,
  )
  if (first.kind !== 'candidate-before-extension') throw new Error(first.kind)
  const second = await assemble(
    {
      ...f.input,
      adopted: adoptedOf(first.candidate),
      contextRead: {
        ...f.input.contextRead,
        snapshot: material,
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
  if (second.kind !== 'candidate-before-extension') throw new Error(second.kind)
  expect(second.candidate.layers.snapshotReminder.message).toEqual(
    first.candidate.layers.snapshotReminder.message,
  )
  expect(second.candidate.layers.snapshotReminder.anchor).toEqual(
    first.candidate.layers.snapshotReminder.anchor,
  )
  expect(second.candidate.layers.snapshotReminder.message?.blocks[0]).toMatchObject({
    text: '[{"key":"context.test","revision":1,"value":{"a":2,"z":1}}]',
  })
})
it('new prompt and existing-layer extension immediately record prefix break reasons', async () => {
  const f = fixture()
  const initial = await assemble(f.input, f.ports, f.policies)
  if (initial.kind !== 'candidate-before-extension') throw new Error(initial.kind)
  const changed = await assemble(
    {
      ...f.input,
      adopted: adoptedOf(initial.candidate),
      promptContributions: {
        digest: 'changed',
        generation: null,
        contributions: [
          {
            kind: 'section',
            name: 's',
            scope: null,
            source: adoption,
            revision: '2',
            order: '1',
            uses: [],
            template: 'new requirement',
          },
        ],
      },
    },
    f.ports,
    f.policies,
  )
  expect(changed.kind).toBe('candidate-before-extension')
  if (changed.kind === 'candidate-before-extension')
    expect(changed.candidate.coverage.prefixBreak).toBe('system-prompt-changed')
  const extension = await assemble(
    {
      ...f.input,
      adopted: adoptedOf(initial.candidate),
      alterations: [{ evidence, touches: 'existing-layers' }],
      beforeModelCall: [],
    },
    f.ports,
    f.policies,
  )
  expect(extension.kind).toBe('candidate-fixable')
  if (extension.kind === 'candidate-fixable')
    expect(extension.candidate.coverage.prefixBreak).toBe('extension-altered')
})
it('policy identity change, plan mismatch, and veto all preserve closed result semantics', async () => {
  const f = fixture()
  const planned = await planCompaction(f.input, f.ports, f.policies)
  if (planned.kind !== 'planned') throw new Error(planned.kind)
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
  expect(
    await deriveStep(f.input, input, f.ports, {
      ...f.policies,
      compaction: { ...f.policies.compaction, configDigest: () => 'changed' },
    }),
  ).toMatchObject({ kind: 'invalid', reason: 'policy-mismatch' })
  expect(
    await deriveStep(
      f.input,
      { ...input, progress: { ...input.progress, planId: must(decodePlanId('plan:other')) } },
      f.ports,
      f.policies,
    ),
  ).toMatchObject({ kind: 'invalid', reason: 'plan-mismatch' })
  expect(
    await deriveStep(
      f.input,
      { ...input, step: { kind: 'vetoed', index: '0', reason: 'reject', evidence } },
      f.ports,
      f.policies,
    ),
  ).toMatchObject({ kind: 'cannot-fit', cause: 'step-vetoed', progress: { completed: '1' } })
  // A changed model selection after planning is a plan mismatch, not a silent model switch.
  expect(
    await deriveStep(
      { ...f.input, selection: { ...f.input.selection, replay: 'off' } },
      input,
      f.ports,
      f.policies,
    ),
  ).toMatchObject({ kind: 'invalid', reason: 'plan-mismatch', field: 'model' })
  // A basis that does not match its digest is rejected before any progress.
  expect(
    await deriveStep(
      f.input,
      { ...input, plan: { ...input.plan, basis: { ...input.plan.basis, retainedBudget: '1' } } },
      f.ports,
      f.policies,
    ),
  ).toMatchObject({ kind: 'invalid', reason: 'plan-mismatch', field: 'plan.basis' })
})
it('summary is checked against actual full input budget before transition', async () => {
  const f = fixture()
  const planned = await planCompaction(f.input, f.ports, f.policies)
  if (planned.kind !== 'planned') throw new Error(planned.kind)
  const p = { ...f.ports, meter: { ...f.ports.meter, measure: () => ({ ok: f.budget('9999') }) } }
  const result = await deriveStep(
    f.input,
    {
      plan: planned.plan,
      progress: { ...planned.progress, completed: '1', consumed: [{ index: '0', evidence }] },
      material: planned.first.material,
      step: { kind: 'summary', index: '1', produced: [text('too large')], consumed: evidence },
    },
    p,
    f.policies,
  )
  expect(result).toMatchObject({
    kind: 'cannot-fit',
    cause: 'bound-exhausted',
    progress: { completed: '2' },
  })
})
it('durable plan and progress schemas round-trip legal values and reject missing consumption history', async () => {
  const f = fixture()
  const plan = await planCompaction(f.input, f.ports, f.policies)
  if (plan.kind !== 'planned') throw new Error(plan.kind)
  expect(compactionPlanSchema['~standard'].validate(plan.plan)).toHaveProperty('value')
  expect(planProgressSchema['~standard'].validate(plan.progress)).toHaveProperty('value')
  expect(
    planProgressSchema['~standard'].validate({ planId: plan.plan.planId, completed: '1' }),
  ).toHaveProperty('issues')
  const result = await assemble(f.input, f.ports, f.policies)
  if (result.kind !== 'candidate-before-extension') throw new Error(result.kind)
  expect(coverageSchema['~standard'].validate(result.candidate.coverage)).toHaveProperty('value')
  expect(
    coverageSchema['~standard'].validate({
      ...result.candidate.coverage,
      inputs: { batch: 'batch:1', saved: {} },
    }),
  ).toHaveProperty('issues')
})
it('history chained digest changes all later prefixes when an earlier row changes', async () => {
  const f = fixture()
  const data = {
    scope,
    tenant: f.input.identity.access.tenant,
    epochs: [{ epoch, rows: [row(0), row(1)], entries: [], open: [] }],
  }
  const source = createMemoryHistorySource<string>(data),
    changed = createMemoryHistorySource<string>({
      ...data,
      epochs: [
        {
          ...data.epochs[0],
          epoch,
          entries: [],
          open: [],
          rows: [
            rowWith(0, { ...message('hello', '0'.padStart(22, 'a')), blocks: [text('changed')] }),
            row(1),
          ],
        },
      ],
    })
  const access = f.input.identity.access
  const evidenceOf = { target, epoch, upper: upper(1) }
  const a = await source.read({ access, evidence: evidenceOf, cursor: null, budgetBytes: 1000 }),
    b = await changed.read({ access, evidence: evidenceOf, cursor: null, budgetBytes: 1000 })
  if (a.kind !== 'page' || b.kind !== 'page') throw new Error('No pages')
  expect(a.page.rows[0]?.prefixDigest).not.toBe(b.page.rows[0]?.prefixDigest)
  expect(a.page.rows[1]?.prefixDigest).not.toBe(b.page.rows[1]?.prefixDigest)
})
it('compaction cannot split call/result pairing or move the coverage start', async () => {
  const f = fixture()
  const call = judgeMessage({
    role: 'assistant',
    id: row(0).message.id,
    blocks: [
      {
        kind: 'tool_call',
        id: 'call',
        visibility: { toHuman: true, toModel: true },
        callId: 'c',
        name: 'tool',
        arguments: { kind: 'null' },
      },
    ],
  })
  const answer = judgeMessage({
    role: 'tool',
    id: row(1).message.id,
    blocks: [
      {
        kind: 'tool_result',
        id: 'result',
        visibility: { toHuman: true, toModel: true },
        callId: 'c',
      },
      text('result'),
    ],
  })
  if ('rejected' in call || 'rejected' in answer) throw new Error('Pair fixture')
  const history: typeof f.ports.history = {
    ...f.ports.history,
    compactionContext: async ({ evidence: current }) => ({
      kind: 'context' as const,
      evidence: current,
      value: {
        origin: entry('entry:0'),
        base: { kind: 'initial' as const },
        covered: [
          { ref: entry('entry:0'), message: call.ok },
          { ref: entry('entry:1'), message: answer.ok },
        ],
        after: [],
        open: [],
      },
    }),
  }
  const policy = {
    ...f.policies.compaction,
    plan: async () => ({
      kind: 'draft' as const,
      coverTo: entry('entry:1'),
      retained: [entry('entry:0')],
      bound: '2',
      shape: { kind: 'summarize' as const, trimFirst: false },
    }),
  }
  expect(
    await planCompaction(f.input, { ...f.ports, history }, { ...f.policies, compaction: policy }),
  ).toMatchObject({ kind: 'unavailable', owner: 'compaction-policy' })
})
it('runtime refusal distinguishes unauthorized from missing registration and closed', async () => {
  const f = fixture()
  for (const reason of ['unauthorized', 'no-registration', 'closed'] as const) {
    const result = await assemble(
      { ...f.input, contextRead: { ...f.input.contextRead, read: { kind: 'refused', reason } } },
      f.ports,
      f.policies,
    )
    expect(result.kind).toBe(reason === 'unauthorized' ? 'denied' : 'unavailable')
  }
})
it('headroom and fractional token margins are conservative and exact', async () => {
  const f = fixture()
  const b = f.budget('1.1')
  const ports = {
    ...f.ports,
    meter: {
      ...f.ports.meter,
      measure: () => ({
        ok: {
          ...b,
          checks: b.checks.map(c => ({
            ...c,
            measurement: {
              kind: 'estimate' as const,
              amount: '999.1',
              margin: '0.01',
              method: adoption,
              marginSource: adoption,
            },
            limit: '999',
          })),
        },
      }),
    },
  }
  expect(await assemble(f.input, ports, f.policies)).toMatchObject({
    kind: 'cannot-fit',
    reason: 'fixed-part-over-limit',
  })
})
it('new candidate resets compaction allowance while adopted same-candidate contradictory retry is invalid', async () => {
  const f = fixture()
  const planned = await planCompaction(
    {
      ...f.input,
      previous: {
        candidate: must(
          (await import('@omne-harness/request-context-contract')).decodeCandidateRef(
            'old-candidate',
          ),
        ),
        enteredCompaction: must(decodePlanId('old-plan')),
      },
    },
    f.ports,
    f.policies,
  )
  expect(planned.kind).toBe('planned')
  const first = await assemble(f.input, f.ports, f.policies)
  if (first.kind !== 'candidate-before-extension') throw new Error(first.kind)
  const result = await assemble(
    {
      ...f.input,
      adopted: adoptedOf(first.candidate),
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
  expect(result).toMatchObject({ kind: 'invalid', reason: 'contradictory-retry' })
})
it('carried rows are reused only for the same principal key', async () => {
  const f = fixture()
  const first = await assemble(f.input, f.ports, f.policies)
  if (first.kind !== 'candidate-before-extension') throw new Error(first.kind)
  const before = f.counts().reads
  await assemble(
    {
      ...f.input,
      identity: { ...f.input.identity, access: { ...f.input.identity.access, principal: 'other' } },
      previous: {
        candidate: f.input.identity.candidate,
        enteredCompaction: null,
        carried: first.candidate,
      },
    },
    f.ports,
    f.policies,
  )
  expect(f.counts().reads).toBe(before + 1)
})
it('a principal the binding cannot key is unavailable, never a shared identity', async () => {
  const f = fixture()
  const principal: { self?: object } = {}
  principal.self = principal
  const operations = operationsFor(
    f.input,
    f.ports,
    f.policies,
  ) as unknown as import('@omne-harness/request-context-contract').AssemblyOperations<object>
  const result = await operations.assemble({
    ...f.input.identity,
    access: { tenant: f.input.identity.access.tenant, principal },
  })
  expect(result).toMatchObject({ kind: 'unavailable', owner: 'principal-binding' })
  expect(f.counts().reads).toBe(0)
})
