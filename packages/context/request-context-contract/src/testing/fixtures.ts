import {
  decodeRevision,
  type ModelProfile,
  type RequestBudget,
  type ModelCountingBasis,
} from '@omne-harness/model-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { parseRecordEntryRef, parseMessageId, type Message } from '@omne-harness/message'
import { judgeBlockIdentity } from '@omne-harness/content-block'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import {
  decodeCandidateRef,
  decodePositionRef,
  decodeEpochId,
  decodeBatchRef,
  decodeHistorySequence,
  type AssemblyCall,
  type AssemblyPolicies,
  type ContextTarget,
  type HistoryRow,
  type HistorySequence,
} from '../index.js'
import { createAssemblyOperations } from '../operations.js'
import type { AssemblyOperations } from '../ports.js'
import {
  createMemoryContextSources,
  createTestingPrincipalBinding,
  type AssemblyGroupValues,
  type MemoryContextSources,
} from './sources.js'
import {
  createMemoryConversionResults,
  createScriptedInputMeter,
  createScriptedPreparationResources,
  type ScriptedPreparationResources,
  type PreparationScript,
} from './doubles.js'
import {
  createMemoryHistorySource,
  type HistoryFixtureRow,
  type MemoryHistorySource,
} from './history-source.js'
export const adoption = { owner: 'test', name: 'test', revision: '1', digest: 'd' }
export const evidence = { owner: 'test', record: 'test', revision: '1', digest: 'd' }
export function must<T>(v: { ok: T } | { failure: unknown }): T {
  if ('failure' in v) throw new Error('Fixture rejected')
  return v.ok
}
export const scope: import('@omne-harness/runtime-context-contract').ScopeRef = must(
  decodeScopeRef({ ref: 'scope:test' }),
)
export const epoch = must(decodeEpochId('epoch:1'))
export function seq(index: number): HistorySequence {
  return must(decodeHistorySequence(String(index)))
}
export function entry(raw: string) {
  const v = parseRecordEntryRef(raw)
  if (v === null) throw new Error('Entry invalid')
  return v
}
export function text(raw: string, id = 'b1') {
  const v = judgeBlockIdentity({ id, visibility: { toModel: true, toHuman: true } })
  if ('rejected' in v) throw new Error('Block invalid')
  return { kind: 'text' as const, ...v.ok, text: raw }
}
export function message(
  raw: string,
  id = 'abcdefghijklmnopqrstuv',
): Extract<Message, { role: 'user' }> {
  const v = parseMessageId('msg_' + id)
  if (!v.ok) throw new Error('Id invalid')
  return { role: 'user', id: v.value, blocks: [text(raw)] }
}
export function row(index = 0): HistoryRow {
  return {
    seq: seq(index),
    entry: entry('entry:' + index),
    message: message('hello', String(index).padStart(22, 'a')),
    bytes: '5',
    prefixDigest: 'chain:' + index,
  }
}
export function fixtureTenant(account = '0'): TenantId {
  const tenant = tenantCodec.parse(
    `{"organization":"org_00000000000000000000000000","account":"acc_${account.padStart(26, '0')}"}`,
  )
  if (!tenant.ok) throw new Error('Tenant invalid')
  return tenant.value
}
export const profile: ModelProfile = {
  identity: { scope: { kind: 'factory' }, route: 'route' },
  adoption,
  revision: must(decodeRevision('1')),
  updatedAt: '2026-10-22',
  availability: 'active',
  definition: {
    suppliers: [{ adoption, recipient: 'route', model: 'model' }],
    fallback: false,
    input: ['text'],
    output: ['text'],
    context: {
      window: { provided: '1000', upstream: [] },
      input: null,
      output: { provided: '10', upstream: [] },
      compactionTriggerPercent: '80',
    },
    limits: [],
    parameters: [],
    representation: adoption,
    meter: adoption,
    retryPolicy: adoption,
  },
}
export const countingBasis: ModelCountingBasis = {
  supplier: profile.definition.suppliers[0],
  meter: adoption,
  tokenization: { kind: 'not-used', method: adoption },
  prompt: { kind: 'provider-private', estimation: adoption },
  projection: adoption,
  mediaTransform: adoption,
  replay: adoption,
  evidence: adoption,
}
export function fixtureBudget(amount = '1'): RequestBudget {
  return {
    kind: 'complete',
    inputDigest: 'budget',
    counting: [countingBasis],
    checks: [
      {
        supplier: adoption,
        metric: 'input-tokens',
        subject: 'whole',
        measurement: { kind: 'exact', amount, method: adoption },
        limit: '1000',
        constraint: {
          profile: adoption,
          upstream: { kind: 'finite', amount: '1000', source: adoption },
        },
      },
    ],
  }
}
export function testingAccess<P>(principal: P, tenant: TenantId): import('../refs.js').Access<P> {
  return { principal, tenant }
}

/** Default values of the six source groups for one target, with an empty saved input batch. */
export function createAssemblyGroups(
  target: ContextTarget,
  overrides: Partial<AssemblyGroupValues<string>> = {},
): AssemblyGroupValues<string> {
  const base: AssemblyGroupValues<string> = {
    history: {
      evidence: { target, epoch, upper: { kind: 'entry', seq: seq(0) } },
      inputs: { batch: must(decodeBatchRef('batch:1')), entries: [], saved: evidence },
    },
    context: {
      contextRead: {
        scope: target.scope,
        recipient: 'route/model',
        read: {
          kind: 'success',
          registration: { issued: 0, current: 0 },
          value: {
            scope: target.scope,
            viewRevision: 1,
            cursor: { cursor: 'c' },
            blocks: [],
            missing: [],
            perRequest: [],
          },
        },
        snapshot: {
          scope: target.scope,
          eligibility: { eligibility: 'eligible' },
          revision: 1,
          blocks: [],
        },
        perRequest: [],
        source: evidence,
        coverage: evidence,
      },
      transition: null,
    },
    prompt: {
      promptContributions: { contributions: [], digest: 'empty', generation: null },
      assembleContext: { scope: target.scope, definition: null, workspace: null, keys: {} },
    },
    model: {
      recipient: { route: 'route', model: 'model' },
      profile,
      parameters: [],
      replay: 'on',
      toolsEvidence: evidence,
      evidence,
    },
    tools: [],
    control: {
      conditions: { evidence, revision: '1' },
      previous: null,
      alterations: [],
      beforeModelCall: null,
    },
  }
  return { ...base, ...overrides }
}
export function fixturePolicies(): AssemblyPolicies {
  return {
    representation: {
      identity: adoption,
      config: { preferences: { text: ['original'], image: ['original'], voice: ['original'] } },
      choose: () => 'original',
    },
    compaction: {
      identity: adoption,
      config: {
        retainBudget: { kind: 'tokens', retainTokens: '100' },
        retainPreference: 'newest-first',
        triggerPercent: null,
        headroomTokens: null,
        trimFirst: false,
        stepBound: '2',
      },
      configDigest: () => 'config:1',
      plan: async ({ context }) => ({
        kind: 'draft',
        coverTo: context.covered.at(-1)?.ref ?? entry('entry:0'),
        retained: [],
        bound: '2',
        shape: { kind: 'summarize', trimFirst: false },
      }),
      trim: m => m,
      summaryInstruction: () => [text('summarize')],
    },
  }
}

export type AssemblyFixtureOptions = Readonly<{
  tenant?: TenantId
  rows?: readonly HistoryFixtureRow[]
  groups?: Partial<AssemblyGroupValues<string>>
  policies?: AssemblyPolicies
  preparation?: Partial<PreparationScript>
  /** Open-work entries the history holder reports. */
  open?: readonly import('@omne-harness/message').RecordEntryRef[]
}>
export type AssemblyFixture = Readonly<{
  target: ContextTarget
  call: AssemblyCall<string>
  history: MemoryHistorySource<string>
  sources: MemoryContextSources<string>
  preparation: ScriptedPreparationResources<string>
  policies: AssemblyPolicies
  operations: () => AssemblyOperations<string>
}>
/** A complete in-memory source set for one target: one saved row, a scripted lease, no adoption. */
export function createAssemblyFixture(options: AssemblyFixtureOptions = {}): AssemblyFixture {
  const tenant = options.tenant ?? fixtureTenant()
  const target: ContextTarget = { tenant, scope }
  const rows = options.rows ?? [row(0)]
  const history = createMemoryHistorySource<string>({
    scope,
    tenant,
    epochs: [
      {
        epoch,
        rows: [...rows],
        entries: rows.map(r => ({ ref: r.entry, message: r.message })),
        open: options.open ?? [],
      },
    ],
  })
  const last = rows.at(-1)
  const groups = createAssemblyGroups(target, {
    history: {
      evidence: {
        target,
        epoch,
        upper: last === undefined ? { kind: 'empty' } : { kind: 'entry', seq: last.seq },
      },
      inputs: { batch: must(decodeBatchRef('batch:1')), entries: [], saved: evidence },
    },
    ...options.groups,
  })
  const preparation = createScriptedPreparationResources<string>({
    meter: createScriptedInputMeter(countingBasis, () => ({ ok: fixtureBudget() })),
    ...options.preparation,
  })
  const sources = createMemoryContextSources<string>({
    target,
    values: groups,
    history,
    conversions: createMemoryConversionResults<string>(),
    preparation,
  })
  const policies = options.policies ?? fixturePolicies()
  return {
    target,
    call: {
      access: { principal: 'p', tenant },
      purpose: 'main',
      position: must(decodePositionRef('position:1')),
      candidate: must(decodeCandidateRef('candidate:1')),
    },
    history,
    sources,
    preparation,
    policies,
    operations: () =>
      createAssemblyOperations({
        target,
        sources,
        principalBinding: createTestingPrincipalBinding<string>(),
        policies,
      }),
  }
}
