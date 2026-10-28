import { judgeEvidence } from '@omne-harness/agent-contract'
import type { Material } from '@omne-harness/agent-contract'
import {
  judgeBlockIdentity,
  judgeContentBlock,
  type ContentBlock,
} from '@omne-harness/content-block'
import {
  decodeOutputCursor,
  decodeModelOperationId,
  decodeResultVersion,
  type ModelBlock,
  type ModelFault,
  type ResultPart,
  type Settlement,
  type Termination,
} from '@omne-harness/model-contract'
type Json = Extract<Material<ContentBlock>, { kind: 'facts' }>['value']
export function json(value: unknown): Json {
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
  throw new TypeError('received facts must be JSON data')
}

export function plain(value: Json): unknown {
  switch (value.kind) {
    case 'null':
      return null
    case 'string':
    case 'boolean':
      return value.value
    case 'number': {
      const n = Number(value.lexeme)
      if (!Number.isFinite(n)) throw new TypeError('invalid received number')
      return n
    }
    case 'array':
      return value.items.map(plain)
    case 'object': {
      const result: Record<string, unknown> = Object.create(null)
      for (const entry of value.entries) {
        if (Object.hasOwn(result, entry.key)) throw new TypeError('duplicate received field')
        result[entry.key] = plain(entry.value)
      }
      return result
    }
  }
}
export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
      (r.metric === null ||
        (typeof r.metric === 'string' &&
          [
            'context-tokens',
            'input-tokens',
            'image-bytes',
            'image-count',
            'request-bytes',
            'voice-bytes',
            'voice-duration-ms',
          ].includes(r.metric))) &&
      ['limit', 'actual'].every(key => r[key] === null || typeof r[key] === 'string')
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
      : value.kind === 'failed'
        ? fault(value.fault)
        : value.kind === 'interrupted' && 'ok' in decodeModelOperationId(value.control))
  )
}
export function settlement(value: unknown): Settlement | null {
  if (!object(value) || !termination(value.termination)) return null
  const version = decodeResultVersion(value.version),
    cursor = decodeOutputCursor(value.cursor),
    source = judgeEvidence(value.source)
  return 'ok' in version && 'ok' in cursor && 'ok' in source
    ? { version: version.ok, cursor: cursor.ok, source: source.ok, termination: value.termination }
    : null
}

export function jsonTree(value: unknown): value is Json {
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
  if (object(value) && value.kind === 'reasoning_state') {
    const identity = judgeBlockIdentity(value)
    if (
      'rejected' in identity ||
      identity.ok.visibility.toHuman ||
      typeof value.payload !== 'string' ||
      value.payload.length === 0 ||
      value.payload.length > 1048576 ||
      !Array.isArray(value.pairs)
    )
      return null
    const pairs: Extract<ModelBlock, { kind: 'reasoning_state' }>['pairs'][number][] = []
    for (const pair of value.pairs) {
      const ref = judgeBlockIdentity({ id: pair, visibility: identity.ok.visibility })
      if ('rejected' in ref || pairs.includes(ref.ok.id)) return null
      pairs.push(ref.ok.id)
    }
    return { kind: 'reasoning_state', ...identity.ok, payload: value.payload, pairs }
  }
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
export function parts(value: unknown): readonly ResultPart[] | null {
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
