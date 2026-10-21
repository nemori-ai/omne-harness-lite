// This implementation's processed-result facts. Materials owns the immutable payload and receipt;
// Journal owns its binding to the original consumption. Neither a schema nor a digest proves ACK.
import { isDeepStrictEqual } from 'node:util'
import {
  judgeEvidence,
  type Adoption,
  type AgentExecutionId,
  type ConsumerRef,
  type ConsumptionId,
  type Material,
  type ProducedResult,
  type StepId,
  type Failure,
} from '@omne-harness/agent-contract'
import {
  judgeBlockIdentity,
  judgeContentBlock,
  type ContentBlock,
} from '@omne-harness/content-block'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  decodeOutputCursor,
  decodeResultVersion,
  type ModelBlock,
  type ModelFault,
  type ResultPart,
  type Settlement,
  type Termination,
} from '@omne-harness/model-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { consumeModelResult, type ModelOutcome, type ModelResult } from './model-result.ts'
import { AGENT_OWNER } from './identities.ts'

export const agentProcessedResultSchema: Adoption = Object.freeze({
  owner: AGENT_OWNER,
  name: 'agent-processed-model-result',
  revision: '1',
  digest: 'agent:processed-model-result/1',
})
type Facts = Extract<Material<ContentBlock>, { kind: 'facts' }>
type Json = Facts['value']
export type ProcessedModelIdentity = Readonly<{
  tenant: TenantId
  execution: AgentExecutionId
  step: StepId
  consumption: ConsumptionId
  consumer: ConsumerRef
  produced: ProducedResult
}>

function json(value: unknown): Json {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (typeof value === 'number' && Number.isFinite(value))
    return { kind: 'number', lexeme: String(value) }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(json) }
  if (typeof value === 'object' && value !== null)
    return {
      kind: 'object',
      entries: Object.entries(value)
        .filter(([, v]) => v !== undefined)
        // Record property order is not identity. JsonValue object entries remain ordered arrays.
        .sort(([a], [b]) => (a === b ? 0 : a < b ? -1 : 1))
        .map(([key, value]) => ({ key, value: json(value) })),
    }
  throw new TypeError('processed facts must be JSON data')
}

function plain(value: Json): unknown {
  switch (value.kind) {
    case 'null':
      return null
    case 'string':
    case 'boolean':
      return value.value
    case 'number': {
      const n = Number(value.lexeme)
      if (!Number.isFinite(n)) throw new TypeError('invalid processed number')
      return n
    }
    case 'array':
      return value.items.map(plain)
    case 'object': {
      const result: Record<string, unknown> = Object.create(null)
      for (const entry of value.entries) {
        if (Object.hasOwn(result, entry.key)) throw new TypeError('duplicate processed field')
        result[entry.key] = plain(entry.value)
      }
      return result
    }
  }
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
const equal = (a: unknown, b: unknown) => isDeepStrictEqual(json(a), json(b))
const outcome = (result: ModelOutcome) =>
  result.kind === 'reply' ? { kind: result.kind, reply: result.reply } : { kind: result.kind }
const responsibility = (consumer: ConsumerRef) => ({ kind: 'continue-at', consumer })

export function processedModelMaterial(
  identity: ProcessedModelIdentity,
  result: ModelResult,
): Facts {
  return {
    kind: 'facts',
    schema: agentProcessedResultSchema,
    value: json({
      ...identity,
      settlement: result.settlement,
      parts: result.parts,
      dispatches: result.dispatches,
      outcome: outcome(result),
      responsibility: responsibility(identity.consumer),
    }),
  }
}

const faultCauses = new Set([
  'profile-withdrawn',
  'excluded',
  'modality',
  'credential',
  'input-rejected',
  'input-over-limit',
  'replay-rejected',
  'upstream-unavailable',
  'stream-lost',
  'runtime-lost',
  'persistence',
  'policy-unavailable',
  'upstream-protocol',
  'unclassified',
])
function fault(value: unknown): value is ModelFault {
  if (
    !object(value) ||
    typeof value.cause !== 'string' ||
    !faultCauses.has(value.cause) ||
    typeof value.diagnostic !== 'string' ||
    !(value.upstreamStatus === null || typeof value.upstreamStatus === 'string')
  )
    return false
  if (value.replayCarried !== undefined && value.replayCarried !== true) return false
  if (value.cause === 'replay-rejected' && value.replayCarried !== true) return false
  if (value.cause === 'input-over-limit') {
    const r = value.reported
    return (
      object(r) &&
      ['metric', 'limit', 'actual'].every(key => r[key] === null || typeof r[key] === 'string')
    )
  }
  return true
}
function termination(value: unknown): value is Termination {
  return (
    object(value) &&
    (value.kind === 'completed'
      ? typeof value.reason === 'string' &&
        ['stop', 'limit', 'tool-suggestions'].includes(value.reason)
      : value.kind === 'failed' && fault(value.fault))
  )
}
function settlement(value: unknown): Settlement | null {
  if (!object(value) || !termination(value.termination)) return null
  const version = decodeResultVersion(value.version),
    cursor = decodeOutputCursor(value.cursor),
    source = judgeEvidence(value.source)
  return 'ok' in version && 'ok' in cursor && 'ok' in source
    ? { version: version.ok, cursor: cursor.ok, source: source.ok, termination: value.termination }
    : null
}

function jsonTree(value: unknown): value is Json {
  if (!object(value)) return false
  switch (value.kind) {
    case 'null':
      return true
    case 'string':
      return typeof value.value === 'string'
    case 'boolean':
      return typeof value.value === 'boolean'
    case 'number':
      return (
        typeof value.lexeme === 'string' &&
        /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/u.test(value.lexeme)
      )
    case 'array':
      return Array.isArray(value.items) && value.items.every(jsonTree)
    case 'object':
      return (
        Array.isArray(value.entries) &&
        value.entries.every(e => object(e) && typeof e.key === 'string' && jsonTree(e.value)) &&
        new Set(value.entries.map(e => e.key)).size === value.entries.length
      )
    default:
      return false
  }
}
function block(value: unknown): ModelBlock | null {
  const content = judgeContentBlock(value)
  if ('ok' in content) return content.ok
  if (
    !object(value) ||
    value.kind !== 'tool_call' ||
    typeof value.callId !== 'string' ||
    !value.callId ||
    typeof value.name !== 'string' ||
    !value.name ||
    !jsonTree(value.arguments)
  )
    return null
  const id = judgeBlockIdentity(value)
  return 'ok' in id
    ? {
        kind: 'tool_call',
        ...id.ok,
        callId: value.callId,
        name: value.name,
        arguments: value.arguments,
      }
    : null
}
function parts(value: unknown): readonly ResultPart[] | null {
  if (!Array.isArray(value)) return null
  const result: ResultPart[] = []
  for (const p of value) {
    if (!object(p) || !Array.isArray(p.trims)) return null
    const trims: { removed: string; reason: string }[] = []
    for (const trim of p.trims) {
      if (!object(trim) || typeof trim.removed !== 'string' || typeof trim.reason !== 'string')
        return null
      trims.push({ removed: trim.removed, reason: trim.reason })
    }
    if (p.kind === 'sealed') {
      const b = block(p.block)
      if (!b) return null
      result.push({ kind: 'sealed', block: b, trims })
    } else if (
      p.kind === 'partial' &&
      (p.content === 'text' ||
        p.content === 'thinking' ||
        p.content === 'tool-arguments' ||
        p.content === 'voice') &&
      typeof p.value === 'string'
    ) {
      result.push({ kind: 'partial', content: p.content, value: p.value, trims })
    } else return null
  }
  return result
}

/** Read only this exact schema and original association. Recompute the interpretation, never turn
 * missing/corrupt output into an empty reply. This checks data; a trusted adapter also checks the
 * actual immutable material, Journal binding and current consumer qualification before ACK. */
export function readProcessedModelMaterial(
  material: Material<ContentBlock>,
  expected: ProcessedModelIdentity,
): Outcome<ModelOutcome, Failure> {
  const invalid = fail<Failure>({
    kind: 'invalid',
    field: 'processed-result',
    reason: 'unknown schema, corrupt facts or original association mismatch',
  })
  try {
    if (material.kind !== 'facts' || !equal(material.schema, agentProcessedResultSchema))
      return invalid
    const v = plain(material.value)
    if (
      !object(v) ||
      !Object.entries(expected).every(([key, value]) => equal(v[key], value)) ||
      !equal(v.responsibility, responsibility(expected.consumer)) ||
      !Array.isArray(v.dispatches)
    )
      return invalid
    const s = settlement(v.settlement),
      p = parts(v.parts)
    if (
      !s ||
      !p ||
      s.version !== expected.produced.version ||
      !equal(s.source, expected.produced.source)
    )
      return invalid
    const interpreted = consumeModelResult([expected.execution, expected.step], {
      produced: expected.produced,
      settlement: s,
      parts: p,
      dispatches: [],
    })
    if ('failure' in interpreted) return interpreted
    if (!equal(v.outcome, outcome(interpreted.ok))) return invalid
    const { produced, settlement: terminal, kind } = interpreted.ok
    return succeed(
      kind === 'reply'
        ? { produced, settlement: terminal, kind, reply: interpreted.ok.reply }
        : { produced, settlement: terminal, kind },
    )
  } catch {
    return invalid
  }
}
