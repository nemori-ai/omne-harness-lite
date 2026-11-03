// The values of one adopted request (FIXED-FACTS F4, F5): a coverage of the Request Context shape,
// the fixed request record that agent-context keeps at fixing, the evidence that agent-context
// mints for that coverage (SHA-256 of the canonical text, base64url, agent-context SPEC record
// table), and a model invocation reference. The values are built here, not by agent-context: the
// tests of this member read them back, they do not prove how agent-context makes them.
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

/** A coverage of the Request Context shape; `tag` changes its digests, not its size. */
export function sampleCoverage(target: ContextTarget, tag = '1'): Coverage {
  const value = {
    history: { epoch: 'epoch:1', upper: { kind: 'entry', seq: '2' }, anchors: [] },
    compactions: { record: null, derivation: null },
    inputs: { batch: 'batch:1', saved: evidence('inputs') },
    snapshot: {
      scope: target.scope,
      eligibility: { eligibility: 'eligibility:1' },
      revision: 1,
      anchor: { epoch: 'epoch:1', position: { kind: 'empty' }, prefixDigest: null },
      content: 'full',
    },
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
    prefixBreak: 'new-full-read',
  }
  return value as unknown as Coverage
}

/** The canonical text that agent-context digests: object keys sorted, array order kept. */
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

/** The digest of the coverage evidence that agent-context mints (agent-context SPEC). */
export function coverageDigest(coverage: Coverage): string {
  return createHash('sha256').update(canonical(coverage)).digest('base64url')
}

export type FixedValues = Readonly<{
  windowTokens?: string
  forecast?: FixedRequestRecord['forecast']
  candidate?: string
}>

/** The fixed request record of one request on `target`, as agent-context encodes it. */
export function fixedRecord(target: ContextTarget, tag = '1', values: FixedValues = {}) {
  const record: FixedRequestRecord = {
    schema: 'request-context/fixed-request/1',
    target,
    candidate: must(decodeCandidateRef(values.candidate ?? `candidate:${tag}`)),
    coverage: sampleCoverage(target, tag),
    windowTokens: values.windowTokens ?? '128000',
    forecast:
      values.forecast === undefined ? { kind: 'estimate', usedTokens: '1200' } : values.forecast,
    continuation: null,
  }
  const encoded = encodeFixedRequestRecord(record) as JsonValue
  // The fixture is a record the format accepts, or every test that reads it back is void.
  must(decodeFixedRequestRecord(encoded))
  return { record, encoded }
}

/** The model invocation reference of the call `call` of `tenant`. */
export function invocation(tenant: TenantId, call: string): string {
  return must(
    encodeModelInvocationRef({
      tenant,
      call: must(decodeModelCallId(`mcall_${call}`)),
      admission: must(decodeModelOperationId(`mop_${call}-admission`)),
    }),
  )
}

/** The `adoptedRequest` and `adoptedContext` that one main-purpose M0 writes into its checkpoint. */
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
