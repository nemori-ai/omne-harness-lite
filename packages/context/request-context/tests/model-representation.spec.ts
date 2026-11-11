// The assembled input against a real Model family: the default strategies in a real operation
// group, with the rules and the meter of the OpenAI family binding in the scripted lease. The
// request representation is the adoption the profile fixes (`definition.representation`); the
// family refuses any other one at plan, so a candidate, a compaction plan and a summary step exist
// only when every path writes the value of the profile. The identity of the representation
// strategy stays in the evidence of this member. Nothing is sent.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { decodeRevision, type ModelProfile, type Supplier } from '@omne-harness/model-contract'
import { createTiktokenExecutor, type TiktokenExecutor } from '@omne-harness/tokenizer-tiktoken'
import { composeFamilies, type PiFamilyBinding } from '@omne-harness/pi-ai-transport'
import {
  createOpenAiFamily,
  officialOpenAiProfiles,
  openAiTokenizerResources,
} from '@omne-harness/pi-ai-openai'
import type {
  AssemblyPolicies,
  AssemblyResult,
  RequestCandidate,
} from '@omne-harness/request-context-contract'
import {
  createAssemblyFixture,
  type AssemblyFixture,
} from '@omne-harness/request-context-contract/testing'
import {
  createDefaultCompactionPolicy,
  createDefaultRepresentationPolicy,
} from '@omne-harness/request-context'
import {
  assistantCall,
  historyRow,
  textPart,
  toolResult,
  userMessage,
} from './fixtures/messages.ts'

const RECORD = 'openai/gpt-6.1-sol'
const hex = (name: string) => ({ owner: 'test', name, revision: '1', digest: 'a'.repeat(64) })
const evidence = { owner: 'test', record: 'test', revision: '1', digest: 'd' }

function officialProfile(): ModelProfile {
  const definition = officialOpenAiProfiles({
    retryPolicy: hex('retry'),
    compactionTriggerPercent: '80',
  }).find(item => item.suppliers[0].adoption.name === RECORD)
  const revision = decodeRevision('1')
  if (definition === undefined || 'failure' in revision) throw new Error('fixture')
  return {
    identity: { scope: { kind: 'factory' }, route: RECORD },
    adoption: hex('profile'),
    revision: revision.ok,
    updatedAt: '2026-11-04T00:00:00Z',
    availability: 'active',
    definition,
  }
}
const profile = officialProfile()
const [first] = profile.definition.suppliers
const supplier: Supplier = {
  adoption: first.adoption,
  provider: first.provider,
  model: first.model,
  credential: { layer: 'official' },
}
let executor: TiktokenExecutor
let binding: PiFamilyBinding
beforeAll(async () => {
  const resources = openAiTokenizerResources()
  const created = await createTiktokenExecutor({
    resources: [resources],
    limits: {
      workers: 1,
      maxLeases: 16,
      maxQueuedJobs: 16,
      maxQueuedBytes: 4 * 1024 * 1024,
      maxInputBytes: 4 * 1024 * 1024,
      maxLeaseQueuedJobs: 4,
      maxCacheBytes: 1024 * 1024,
      maxCacheEntries: 8192,
      maxLeaseCacheBytes: 256 * 1024,
      maxLeaseCacheEntries: 2048,
      maxPieceBytes: 4096,
      jobTimeoutMs: 10_000,
      maxWorkerOldSpaceMb: 256,
      maxReplacementsPerMinute: 2,
      cancellationGraceMs: 25,
    },
  })
  if ('failure' in created) throw new Error(`executor: ${JSON.stringify(created.failure)}`)
  executor = created.ok
  const family = createOpenAiFamily({
    tokenizer: resources,
    limits: {
      toolArguments: {
        maxBytes: 65_536,
        maxDepth: 32,
        maxItems: 1_024,
        maxMembers: 256,
        maxStringLength: 65_536,
        maxNumberLength: 64,
      },
      maxReasoningText: 65_536,
    },
    margin: { percent: '10', source: hex('margin-policy') },
    executor,
    maxSerializedBytes: 4 * 1024 * 1024,
  })
  const acquired = await composeFamilies([family]).acquire(supplier, new AbortController().signal)
  if (!('ok' in acquired)) throw new Error(`acquire: ${JSON.stringify(acquired.failure)}`)
  binding = acquired.ok
}, 30_000)
afterAll(async () => {
  try {
    if (binding !== undefined) await binding.release()
  } finally {
    if (executor !== undefined) expect(await executor.close()).toEqual({ ok: undefined })
  }
}, 30_000)

const rows = () => [
  historyRow(0, userMessage(0, 'read it')),
  historyRow(1, assistantCall(1, 'c1')),
  historyRow(2, toolResult(2, 'c1', 'contents')),
  historyRow(3, userMessage(3, 'thanks')),
]
function fixture(policies: AssemblyPolicies): AssemblyFixture {
  return createAssemblyFixture({
    rows: rows(),
    policies,
    groups: {
      model: {
        recipient: { route: 'route', model: 'model' },
        profile,
        parameters: [],
        replay: 'on',
        toolsEvidence: evidence,
        evidence,
      },
    },
    preparation: { plan: input => binding.rules.plan(input), meter: binding.meter },
  })
}
function candidateOf(result: AssemblyResult): RequestCandidate {
  if (result.kind !== 'candidate-before-extension' && result.kind !== 'candidate-fixable')
    throw new Error(`Expected a candidate, got ${JSON.stringify(result)}`)
  return result.candidate
}
/** Plans and measures one assembled input with the family binding, as a lease would. */
async function planAndMeasure(assembled: RequestCandidate['assembled']) {
  const plan = binding.rules.plan({ profile, supplier, assembled })
  if (!('ok' in plan)) throw new Error(`plan refused: ${JSON.stringify(plan.failure)}`)
  const measured = await binding.meter.measure({
    profile: profile.adoption,
    supplier: first,
    context: profile.definition.context,
    limits: profile.definition.limits,
    assembled,
    parameters: plan.ok.parameters,
    representation: plan.ok.representation,
  })
  if (!('ok' in measured)) throw new Error(`measure refused: ${JSON.stringify(measured.failure)}`)
  return { plan: plan.ok, budget: measured.ok }
}

describe('the request representation is the one the profile fixes', () => {
  it('a fixed history assembles into an input the family plans and measures completely', async () => {
    const representation = createDefaultRepresentationPolicy()
    const f = fixture({ compaction: createDefaultCompactionPolicy(), representation })
    // The lease ran the family plan and meter; a refused plan gives no candidate.
    const candidate = candidateOf(await f.operations().assemble(f.call))
    expect(candidate.assembled.representation).toEqual(profile.definition.representation)
    const { plan, budget } = await planAndMeasure(candidate.assembled)
    expect(plan.representation.adoption).toEqual(profile.definition.representation)
    expect(budget.kind).toBe('complete')
    const input = budget.checks.find(check => check.metric === 'input-tokens')
    expect(input?.measurement.kind).toBe('estimate')
    // The strategy identity is the projection evidence of a later continuation, not the request.
    expect(candidate.continuation.projection).toEqual(representation.identity)
    expect(candidate.continuation.projection).not.toEqual(candidate.assembled.representation)
    expect(f.preparation.outstanding()).toBe(0)
  })
  it('the compaction probe, the summary request and the check after it carry the same value', async () => {
    const f = fixture({
      compaction: createDefaultCompactionPolicy({
        config: { retainBudget: { kind: 'tokens', retainTokens: '25' } },
      }),
      representation: createDefaultRepresentationPolicy(),
    })
    const operations = f.operations()
    // The retention probe measures through the lease, so a refused plan gives no compaction plan.
    const planned = await operations.planCompaction(f.call)
    if (planned.kind !== 'planned')
      throw new Error(`Expected a plan, got ${JSON.stringify(planned)}`)
    expect(planned.first.assembled.representation).toEqual(profile.definition.representation)
    expect((await planAndMeasure(planned.first.assembled)).budget.kind).toBe('complete')
    // The window check after the summary measures through the lease as well.
    const step = await operations.deriveStep({
      call: f.call,
      plan: planned.plan,
      progress: planned.progress,
      material: planned.first.material,
      step: {
        kind: 'summary',
        index: planned.first.index,
        produced: [textPart('summary', 's0')],
        consumed: evidence,
      },
    })
    expect(step.kind).toBe('transition')
    expect(f.preparation.outstanding()).toBe(0)
  })
})
