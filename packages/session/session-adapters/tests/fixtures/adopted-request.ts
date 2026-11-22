import { createHash } from 'node:crypto'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  decodeModelCallId,
  decodeModelOperationId,
  encodeModelInvocationRef,
} from '@omne-harness/model-contract'
import {
  decodeCandidateRef,
  decodeFixedRequestRecord,
  encodeFixedRequestRecord,
  type ContextTarget,
  type ContinuationPrefix,
  type Coverage,
  type FixedRequestRecord,
} from '@omne-harness/request-context-contract'
import type { JsonValue } from '@omne-harness/json-text'

function must<T>(value: { ok: T } | { failure: unknown }): T {
  if ('failure' in value) throw new Error(`fixture value: ${JSON.stringify(value.failure)}`)
  return value.ok
}

const adoption = (name: string) => ({ owner: 'test', name, revision: '1', digest: `test:${name}` })
const evidence = (record: string) => ({ owner: 'test', record, revision: '1', digest: 'd' })

export function sampleCoverage(target: ContextTarget, tag = '1'): Coverage {
  const value = {
    history: { epoch: 'epoch:1', upper: { kind: 'entry', seq: '2' }, prefixDigest: 'chain:2' },
    compactions: { record: null, derivation: null },
    inputs: { batch: 'batch:1', saved: evidence('inputs') },
    prompt: {
      sections: [{ name: 'system', scope: null, source: adoption('prompt'), revision: '1' }],
      digest: `prompt-${tag}`,
      generation: null,
    },
    model: {
      profile: adoption('profile'),
      revision: '1',
      recipient: 'main',
      parametersDigest: 'parameters',
      replay: 'off',
    },
    tools: { direct: ['read'], programmatic: [], digest: 'tools' },
    conditions: { evidence: evidence('conditions'), revision: '1' },
    alterations: [],
    representations: [],
    budget: { inputDigest: `input-${tag}`, kind: 'complete', deferred: [], unknownLimits: [] },
    prefixBreak: 'system-prompt-changed',
  }
  return value as unknown as Coverage
}

function canonical(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.entries(value)
    .filter(([, member]) => member !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, member]) => `${JSON.stringify(name)}:${canonical(member)}`)
    .join(',')}}`
}

export function coverageDigest(coverage: Coverage): string {
  return createHash('sha256').update(canonical(coverage)).digest('base64url')
}

export type FixedValues = Readonly<{
  candidate?: string
  continuation?: ContinuationPrefix
  representations?: readonly unknown[]
}>

/** A prefix as Request Context records it for a request built on the history up to row 2. */
export function samplePrefix(target: ContextTarget): ContinuationPrefix {
  const value = {
    history: { target, epoch: 'epoch:1', upper: { kind: 'entry', seq: '2' } },
    messagePrefix: [`msg_${'a'.repeat(22)}`],
    projection: adoption('projection'),
    system: evidence('system'),
    tools: evidence('tools'),
    parameters: evidence('parameters'),
    replay: evidence('replay'),
    visibility: evidence('visibility'),
  }
  return value as unknown as ContinuationPrefix
}

export function fixedRecord(target: ContextTarget, tag = '1', values: FixedValues = {}) {
  const record: FixedRequestRecord = {
    schema: 'request-context/fixed-request/1',
    target,
    candidate: must(decodeCandidateRef(values.candidate ?? `candidate:${tag}`)),
    coverage: {
      ...sampleCoverage(target, tag),
      representations: (values.representations ?? []) as Coverage['representations'],
    },
    continuation: values.continuation ?? null,
  }
  const encoded = encodeFixedRequestRecord(record) as JsonValue
  must(decodeFixedRequestRecord(encoded))
  return { record, encoded }
}

export function invocation(tenant: TenantId, call: string): string {
  return must(
    encodeModelInvocationRef({
      tenant,
      call: must(decodeModelCallId(`mcall_${call}`)),
      admission: must(decodeModelOperationId(`mop_${call}-admission`)),
    }),
  )
}

export function m0Checkpoint(target: ContextTarget, tag: string, values: FixedValues = {}) {
  const { record, encoded } = fixedRecord(target, tag, values)
  const fixed = {
    owner: 'agent-context:test',
    record: `preparation/${tag}`,
    revision: '1',
    digest: `p-${tag}`,
  }
  const adoptedContext = {
    owner: 'agent-context:test',
    record: `coverage/${tag}`,
    revision: '1',
    digest: coverageDigest(record.coverage),
  }
  const adoptedRequest = {
    reference: invocation(target.tenant, tag) as never,
    fixed,
    schema: adoption('agent-context'),
    record: encoded,
  }
  return { record, adoptedRequest, adoptedContext }
}
