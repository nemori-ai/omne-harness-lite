import {
  decodeInputBatchId,
  decodeInputId,
  judgeAdoption,
  judgeEvidence,
  type Adoption,
  type InputBatch,
  type RuntimeConditions,
  type Preparation,
} from '@omne-harness/agent-contract'
import { canonical } from './records.ts'

/** Only references and small control values survive the request-preparation instance. */
export type RequestMemento = Readonly<{
  schema: 'agent-context/original-request/1'
  scope: string
  inputs: InputBatch
  conditions: RuntimeConditions
  definition: Adoption | null
}>

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function batch(value: unknown): InputBatch | null {
  if (!record(value) || !Array.isArray(value.ordered)) return null
  const id = decodeInputBatchId(value.id)
  const watermark = judgeEvidence(value.watermark)
  const ordered = value.ordered.map(decodeInputId)
  if ('failure' in id || 'failure' in watermark || ordered.some(v => 'failure' in v)) return null
  return {
    id: id.ok,
    watermark: watermark.ok,
    ordered: ordered.flatMap(v => ('ok' in v ? [v.ok] : [])),
  }
}

function segments(value: unknown): NonNullable<RuntimeConditions['segments']> | null {
  if (value === undefined) return []
  if (!Array.isArray(value)) return null
  const out: { key: string; text: string }[] = []
  for (const item of value as unknown[]) {
    if (!record(item) || typeof item.key !== 'string' || typeof item.text !== 'string') return null
    out.push({ key: item.key, text: item.text })
  }
  return out
}

function conditions(value: unknown): RuntimeConditions | null {
  if (!record(value) || !record(value.progression) || !Array.isArray(value.bindings)) return null
  const kept = segments(value.segments)
  if (kept === null) return null
  const source = judgeEvidence(value.source)
  const configuration = judgeAdoption(value.configuration)
  const model = judgeAdoption(value.model)
  const context = judgeEvidence(value.context)
  const basis = judgeEvidence(value.progression.basis)
  const bindings = value.bindings.map(judgeAdoption)
  const kind = value.progression.kind
  if (
    'failure' in source ||
    'failure' in configuration ||
    'failure' in model ||
    'failure' in context ||
    'failure' in basis ||
    bindings.some(v => 'failure' in v) ||
    (kind !== 'continue' && kind !== 'evaluate-completion')
  )
    return null
  return {
    source: source.ok,
    configuration: configuration.ok,
    model: model.ok,
    context: context.ok,
    progression: { kind, basis: basis.ok },
    bindings: bindings.flatMap(v => ('ok' in v ? [v.ok] : [])),
    segments: kept,
  }
}

export function saveMemento(value: RequestMemento): Preparation['state'] {
  return { kind: 'string', value: canonical(value) }
}

export function readMemento(state: Preparation['state']): RequestMemento | null {
  if (state.kind !== 'string') return null
  let value: unknown
  try {
    value = JSON.parse(state.value)
  } catch {
    return null
  }
  if (
    !record(value) ||
    value.schema !== 'agent-context/original-request/1' ||
    typeof value.scope !== 'string' ||
    value.scope.length === 0
  )
    return null
  const inputs = batch(value.inputs)
  const control = conditions(value.conditions)
  const definition = value.definition === null ? { ok: null } : judgeAdoption(value.definition)
  if (inputs === null || control === null || 'failure' in definition) return null
  return {
    schema: value.schema,
    scope: value.scope,
    inputs,
    conditions: control,
    definition: definition.ok,
  }
}
