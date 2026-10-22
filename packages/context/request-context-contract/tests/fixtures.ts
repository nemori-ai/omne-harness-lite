import {
  decodeRevision,
  type ModelProfile,
  type RequestBudget,
  type ModelCountingBasis,
} from '@omne-harness/model-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import { parseRecordEntryRef, parseMessageId, type Message } from '@omne-harness/message'
import { judgeBlockIdentity } from '@omne-harness/content-block'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import {
  decodeCandidateRef,
  decodePositionRef,
  decodeEpochId,
  decodeBatchRef,
  type AssemblyInput,
  type AssemblyPorts,
  type AssemblyPolicies,
  type HistoryRow,
} from '@omne-harness/request-context-contract'
export const adoption = { owner: 'test', name: 'test', revision: '1', digest: 'd' }
export const evidence = { owner: 'test', record: 'test', revision: '1', digest: 'd' }
export function must<T>(v: { ok: T } | { failure: unknown }): T {
  if ('failure' in v) throw new Error('Fixture rejected')
  return v.ok
}
export const scope = must(decodeScopeRef({ ref: 'scope:test' }))
export const epoch = must(decodeEpochId('epoch:1'))
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
export function message(raw: string, id = 'abcdefghijklmnopqrstuv'): Message {
  const v = parseMessageId('msg_' + id)
  if (!v.ok) throw new Error('Id invalid')
  return { role: 'user', id: v.value, blocks: [text(raw)] }
}
export function row(seq = 0): HistoryRow {
  return {
    seq,
    entry: entry('entry:' + seq),
    message: message('hello', String(seq).padStart(22, 'a')),
    bytes: '5',
    prefixDigest: 'chain:' + seq,
  }
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
export function fixture() {
  const tenant = tenantCodec.parse(
    '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000000"}',
  )
  if (!tenant.ok) throw new Error('Tenant invalid')
  const input: AssemblyInput<string> = {
    identity: {
      access: { principal: 'p', tenant: tenant.value },
      purpose: 'main',
      position: must(decodePositionRef('position:1')),
      candidate: must(decodeCandidateRef('candidate:1')),
    },
    history: { scope, epoch, upper: 0 },
    inputs: { batch: must(decodeBatchRef('batch:1')), entries: [], saved: evidence },
    contextRead: {
      scope,
      recipient: 'route/model',
      read: {
        kind: 'success',
        registration: { issued: 0, current: 0 },
        value: {
          scope,
          viewRevision: 1,
          cursor: { cursor: 'c' },
          blocks: [],
          missing: [],
          perRequest: [],
        },
      },
      snapshot: { scope, eligibility: { eligibility: 'eligible' }, revision: 1, blocks: [] },
      perRequest: [],
      source: evidence,
      coverage: evidence,
    },
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
  const basis: ModelCountingBasis = {
    supplier: profile.definition.suppliers[0],
    meter: adoption,
    tokenization: { kind: 'not-used', method: adoption },
    prompt: { kind: 'provider-private', estimation: adoption },
    projection: adoption,
    mediaTransform: adoption,
    replay: adoption,
    evidence: adoption,
  }
  const budget = (amount = '1'): RequestBudget => ({
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
  })
  const ports: AssemblyPorts<string> = {
    history: {
      async read() {
        reads++
        return { kind: 'page', page: { rows: [row()], next: null } }
      },
      async compactionContext() {
        return {
          kind: 'context',
          epoch,
          value: {
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
    serializer: { bytesOf: () => '71' },
    meter: {
      basis,
      measure() {
        meters++
        return { ok: budget() }
      },
    },
  }
  const policies: AssemblyPolicies = {
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
      plan: ({ context }) => ({
        kind: 'draft',
        coverTo: context.covered.at(-1)?.ref ?? entry('entry:0'),
        retained: [],
        bound: '2',
        shape: 'summarize',
      }),
      trim: m => m,
      summaryInstruction: () => [text('summarize')],
    },
  }
  return { input, ports, policies, budget, counts: () => ({ reads, meters }) }
}
