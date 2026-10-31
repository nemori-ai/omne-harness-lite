import type * as M from '@omne-harness/model-contract'
import { decodeDispatchId, decodeModelCallId } from '@omne-harness/model-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { parseRecordEntryRef, parseMessageId, type Message } from '@omne-harness/message'
import { judgeBlockIdentity } from '@omne-harness/content-block'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import {
  createAssemblyOperations,
  decodeCandidateRef,
  decodePositionRef,
  decodeEpochId,
  decodeBatchRef,
  decodeHistorySequence,
  decodeCommitOrder,
  type AdoptedRequestFact,
  type RequestCandidate,
  type TenantModelCall,
  type AssemblyCall,
  type AssemblyPolicies,
  type ContextReadEligibility,
  type ConversionResultSource,
  type DeriveInput,
  type HistoryRow,
  type HistorySequence,
  type HistorySource,
  type InputGroups,
  type ContextTarget,
} from '@omne-harness/request-context-contract'
import {
  createAssemblyGroups,
  createMemoryAdoptedSource,
  createMemoryContextSources,
  createScriptedPreparationResources,
  createTestingPrincipalBinding,
  type MemoryAdoptedSource,
  type MemoryContextSources,
  type PreparationScript,
} from '@omne-harness/request-context-contract/testing'
export const adoption = { owner: 'test', name: 'test', revision: '1', digest: 'd' }
export const evidence = { owner: 'test', record: 'test', revision: '1', digest: 'd' }
export function must<T>(v: { ok: T } | { failure: unknown }): T {
  if ('failure' in v) throw new Error('Fixture rejected')
  return v.ok
}
export const scope = must(decodeScopeRef({ ref: 'scope:test' }))
export const epoch = must(decodeEpochId('epoch:1'))
export function seq(index: number | string): HistorySequence {
  return must(decodeHistorySequence(String(index)))
}
export function upper(index: number) {
  return { kind: 'entry' as const, seq: seq(index) }
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
export function tenantOf(account = '0'): TenantId {
  const tenant = tenantCodec.parse(
    `{"organization":"org_00000000000000000000000000","account":"acc_${account.padStart(26, '0')}"}`,
  )
  if (!tenant.ok) throw new Error('Tenant invalid')
  return tenant.value
}
export const tenant = tenantOf()
export const target: ContextTarget = { tenant, scope }
export { profile } from './profile.js'
import { profile } from './profile.js'

/** The stably read groups of one call, flattened as the operations read them. */
export type Snapshot = Readonly<{
  identity: AssemblyCall<string>
  history: InputGroups<string>['history']['evidence']
  inputs: InputGroups<string>['history']['inputs']
  contextRead: InputGroups<string>['context']['contextRead']
  adopted: AdoptedRequestFact | null
  transition: InputGroups<string>['context']['transition']
  promptContributions: InputGroups<string>['prompt']['promptContributions']
  assembleContext: InputGroups<string>['prompt']['assembleContext']
  selection: InputGroups<string>['model']
  tools: InputGroups<string>['tools']
  conditions: InputGroups<string>['control']['conditions']
  previous: InputGroups<string>['control']['previous']
  alterations: InputGroups<string>['control']['alterations']
  beforeModelCall: InputGroups<string>['control']['beforeModelCall']
}>
/** The source-side doubles a test drives; the meter is wrapped into a scripted lease. */
export type Ports = {
  history: HistorySource<string>
  conversions: ConversionResultSource<string>
  meter: M.ModelInputMeter
  plan?: PreparationScript['plan']
  release?: PreparationScript['release']
  eligibility?: ContextReadEligibility<string>
  target?: ContextTarget
}
export const basis: M.ModelCountingBasis = {
  supplier: profile.definition.suppliers[0],
  meter: adoption,
  tokenization: { kind: 'not-used', method: adoption },
  prompt: { kind: 'provider-private', estimation: adoption },
  projection: adoption,
  mediaTransform: adoption,
  replay: adoption,
  evidence: adoption,
}
export function budget(amount = '1'): M.RequestBudget {
  return {
    kind: 'complete',
    inputDigest: 'budget',
    counting: [basis],
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
export function policiesFixture(): AssemblyPolicies {
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
export function fixture() {
  const groups = createAssemblyGroups(target)
  const input: Snapshot = {
    identity: {
      access: { principal: 'p', tenant },
      purpose: 'main',
      position: must(decodePositionRef('position:1')),
      candidate: must(decodeCandidateRef('candidate:1')),
    },
    history: { target, epoch, upper: upper(0) },
    inputs: { batch: must(decodeBatchRef('batch:1')), entries: [], saved: evidence },
    contextRead: groups.context.contextRead,
    adopted: null,
    transition: null,
    promptContributions: { contributions: [], digest: 'empty', generation: null },
    assembleContext: { scope, definition: null, workspace: null, keys: {} },
    selection: {
      recipient: { route: 'route', model: 'model' },
      profile,
      parameters: [],
      replay: 'on',
      toolsEvidence: evidence,
      evidence,
    },
    tools: [],
    conditions: { evidence, revision: '1' },
    previous: null,
    alterations: [],
    beforeModelCall: null,
  }
  let reads = 0,
    meters = 0
  const ports: Ports = {
    history: {
      async read() {
        reads++
        return { kind: 'page', page: { rows: [row()], next: null } }
      },
      async compactionContext({ evidence: current }) {
        return {
          kind: 'context',
          evidence: current,
          value: {
            origin: entry('entry:0'),
            base: { kind: 'initial' },
            covered: [{ ref: entry('entry:0'), message: row().message }],
            after: [],
            open: [],
          },
        }
      },
    },
    conversions: {
      async read() {
        return { kind: 'index', entries: new Map() }
      },
    },
    meter: {
      basis,
      measure() {
        meters++
        return { ok: budget() }
      },
    },
  }
  return { input, ports, policies: policiesFixture(), budget, counts: () => ({ reads, meters }) }
}

type Bound = {
  sources: MemoryContextSources<string>
  adopted: MemoryAdoptedSource<string>
  last: Snapshot | null
}
const bound = new WeakMap<Ports, Bound>()
function groupsOf(input: Snapshot) {
  return {
    history: { evidence: input.history, inputs: input.inputs },
    context: { contextRead: input.contextRead, transition: input.transition },
    prompt: {
      promptContributions: input.promptContributions,
      assembleContext: input.assembleContext,
    },
    model: input.selection,
    tools: input.tools,
    control: {
      conditions: input.conditions,
      previous: input.previous,
      alterations: input.alterations,
      beforeModelCall: input.beforeModelCall,
    },
  }
}
/**
 * Source doubles for one ports object. A group's count moves only when that group's value
 * changes, so repeated calls with equal groups present equal tokens, as real sources must.
 */
export function sourcesFor(input: Snapshot, ports: Ports): MemoryContextSources<string> {
  const groups = groupsOf(input)
  let held = bound.get(ports)
  if (held === undefined) {
    const adopted = createMemoryAdoptedSource<string>(input.adopted)
    const sources = createMemoryContextSources<string>({
      target: ports.target ?? {
        tenant: input.identity.access?.tenant ?? tenant,
        scope: input.history.target.scope,
      },
      values: groups,
      history: ports.history,
      conversions: ports.conversions,
      preparation: createScriptedPreparationResources<string>({
        meter: ports.meter,
        ...(ports.plan === undefined ? {} : { plan: ports.plan }),
        ...(ports.release === undefined ? {} : { release: ports.release }),
      }),
      adopted,
      ...(ports.eligibility === undefined ? {} : { eligibility: ports.eligibility }),
    })
    held = { sources, adopted, last: input }
    bound.set(ports, held)
    return sources
  }
  const current = held.sources.values()
  for (const key of Object.keys(groups) as (keyof typeof groups)[])
    if (
      current[key] !== groups[key] &&
      JSON.stringify(current[key]) !== JSON.stringify(groups[key])
    )
      held.sources.update(key, groups[key] as never)
  if (JSON.stringify(held.last?.adopted) !== JSON.stringify(input.adopted))
    held.adopted.set(input.adopted)
  held.last = input
  return held.sources
}
export function operationsFor(input: Snapshot, ports: Ports, policies: AssemblyPolicies) {
  const sources = sourcesFor(input, ports)
  return createAssemblyOperations({
    target: sources.target,
    sources,
    principalBinding: createTestingPrincipalBinding<string>(),
    policies,
  })
}
export const assemble = (input: Snapshot, ports: Ports, policies: AssemblyPolicies) =>
  operationsFor(input, ports, policies).assemble(input.identity)
export const resume = (input: Snapshot, ports: Ports, policies: AssemblyPolicies) =>
  operationsFor(input, ports, policies).resume(input.identity)
export const planCompaction = (input: Snapshot, ports: Ports, policies: AssemblyPolicies) =>
  operationsFor(input, ports, policies).planCompaction(input.identity)
export const deriveStep = (
  input: Snapshot,
  derive: Omit<DeriveInput<string>, 'call'>,
  ports: Ports,
  policies: AssemblyPolicies,
) => operationsFor(input, ports, policies).deriveStep({ ...derive, call: input.identity })

export function callId(raw = 'one') {
  return must(decodeModelCallId(`mcall_${raw}`))
}
export function dispatchId(raw = 'one') {
  return must(decodeDispatchId(`mdisp_${raw}`))
}
/** The adopted fact a coordinator would save when it fixes `candidate`. */
export function adoptedOf(
  candidate: RequestCandidate,
  extra: Partial<AdoptedRequestFact> = {},
): AdoptedRequestFact {
  return {
    coverage: candidate.coverage,
    target,
    call: { tenant, call: callId() },
    candidate: candidate.candidate,
    order: must(decodeCommitOrder('1')),
    committed: evidence,
    windowTokens: '1000',
    accounting: { kind: 'unsettled' },
    forecast: null,
    continuation: null,
    ...extra,
  }
}
/** A row of `index` that carries `message`; an assistant message may carry a source call. */
export function rowWith(index: number, carried: Message, sourceCall?: TenantModelCall): HistoryRow {
  const base = row(index)
  return {
    seq: base.seq,
    entry: base.entry,
    bytes: base.bytes,
    prefixDigest: base.prefixDigest,
    message: carried,
    ...(sourceCall === undefined ? {} : { sourceCall }),
  } as HistoryRow
}
