import type {
  Adoption,
  Parameter,
  ParameterAdoption,
  ReasoningEffortMapping,
  TransportFailure,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import { readGatewayParam } from './gateway.ts'
import type {
  ChatCompletionsRecord,
  ExtensionRule,
  GatewayParam,
  ParameterKind,
  ParameterTable,
} from './vocabulary.ts'

export const PARAMETER_KINDS = [
  'temperature',
  'top-p',
  'max-output-tokens',
  'stop',
  'reasoning-effort',
  'seed',
  'frequency-penalty',
  'presence-penalty',
] as const satisfies readonly ParameterKind[]

type MissingKind = Exclude<ParameterKind, (typeof PARAMETER_KINDS)[number]>
const _everyKind: [MissingKind] extends [never] ? true : never = true

type Unified = Exclude<Parameter, Readonly<{ kind: 'extension' }>>
type Extension = Extract<Parameter, Readonly<{ kind: 'extension' }>>

const DECIMAL = /^(0|[1-9][0-9]*)$/
const POSITIVE = /^[1-9][0-9]*$/

function compareDecimal(left: string, right: string): number {
  if (left.length !== right.length) return left.length - right.length
  if (left < right) return -1
  return left > right ? 1 : 0
}

export type ParameterContext = Readonly<{
  record: Pick<ChatCompletionsRecord, 'parameters' | 'extensions'>
  adapter: Adoption
  bindingEfforts?: ReasoningEffortMapping | undefined
  outputLimit: string | null
}>

function unsupported(field: string, adapter: Adoption): TransportFailure {
  return { kind: 'unsupported', field, adapter }
}

function invalid(field: string, reason: string): TransportFailure {
  return { kind: 'invalid', field, reason }
}

function effortWire(
  value: Extract<Parameter, { kind: 'reasoning-effort' }>['value'],
  context: ParameterContext,
): GatewayParam | 'unsupported' {
  const rule = context.record.parameters['reasoning-effort']
  if (rule.support === 'unsupported') return 'unsupported'
  if (value === 'xhigh')
    return Object.values(context.bindingEfforts ?? {}).includes(value)
      ? { field: 'reasoning.effort', value }
      : 'unsupported'
  return rule.wire[value]
}

export function judgeParameter(param: Unified, context: ParameterContext): TransportFailure | null {
  const table = context.record.parameters
  switch (param.kind) {
    case 'temperature':
    case 'top-p':
    case 'frequency-penalty':
    case 'presence-penalty': {
      const rule = table[param.kind]
      if (rule.support === 'unsupported') return unsupported(param.kind, context.adapter)
      const { min, max } = rule.accept
      return Number.isFinite(param.value) && param.value >= min && param.value <= max
        ? null
        : invalid(param.kind, 'out-of-range')
    }
    case 'max-output-tokens': {
      const rule = table['max-output-tokens']
      if (rule.support === 'unsupported') return unsupported(param.kind, context.adapter)
      if (!POSITIVE.test(param.value) || compareDecimal(param.value, rule.accept.max) > 0)
        return invalid(param.kind, 'out-of-range')
      const limit = context.outputLimit
      if (limit === null) return null
      if (!POSITIVE.test(limit)) return invalid('context.output.provided', 'not-a-token-count')
      return compareDecimal(param.value, limit) > 0
        ? invalid(param.kind, 'above-output-limit')
        : null
    }
    case 'stop': {
      const rule = table.stop
      if (rule.support === 'unsupported') return unsupported(param.kind, context.adapter)
      const { maxItems, maxLength } = rule.accept
      const fits =
        param.value.length > 0 &&
        param.value.length <= maxItems &&
        new Set(param.value).size === param.value.length &&
        param.value.every(item => item.length > 0 && item.length <= maxLength)
      return fits ? null : invalid(param.kind, 'out-of-range')
    }
    case 'seed': {
      const rule = table.seed
      if (rule.support === 'unsupported') return unsupported(param.kind, context.adapter)
      return DECIMAL.test(param.value) ? null : invalid(param.kind, 'out-of-range')
    }
    case 'reasoning-effort': {
      if (param.scale === 'unified') return invalid(param.kind, 'unresolved-effort')
      return effortWire(param.value, context) === 'unsupported'
        ? unsupported(param.kind, context.adapter)
        : null
    }
    default: {
      const _exhaustive: never = param
      return _exhaustive
    }
  }
}

export function defaultParameter(table: ParameterTable, kind: ParameterKind): Unified | null {
  switch (kind) {
    case 'temperature':
    case 'top-p':
    case 'frequency-penalty':
    case 'presence-penalty': {
      const rule = table[kind]
      return rule.support === 'supported' && rule.default.kind === 'send'
        ? { kind, value: rule.default.value }
        : null
    }
    case 'max-output-tokens':
    case 'seed': {
      const rule = table[kind]
      return rule.support === 'supported' && rule.default.kind === 'send'
        ? { kind, value: rule.default.value }
        : null
    }
    case 'stop': {
      const rule = table.stop
      return rule.support === 'supported' && rule.default.kind === 'send'
        ? { kind, value: rule.default.value }
        : null
    }
    case 'reasoning-effort': {
      const rule = table['reasoning-effort']
      return rule.support === 'supported' && rule.default.kind === 'send'
        ? { kind, value: rule.default.value }
        : null
    }
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

export function extensionRuleOf(
  rules: readonly ExtensionRule[],
  definition: Adoption,
): ExtensionRule | undefined {
  return rules.find(
    rule =>
      rule.definition.owner === definition.owner &&
      rule.definition.name === definition.name &&
      rule.definition.revision === definition.revision &&
      rule.definition.digest === definition.digest,
  )
}

export function extensionParam(
  param: Extension,
  rules: readonly ExtensionRule[],
  adapter: Adoption,
): Outcome<GatewayParam, TransportFailure> {
  const rule = extensionRuleOf(rules, param.definition)
  if (rule === undefined) return { failure: unsupported('extension', adapter) }
  const read = readGatewayParam(rule.field, param.value)
  return read === null ? { failure: invalid('extension', 'value') } : { ok: read }
}

type PlanParametersInput = ParameterContext &
  Readonly<{
    requested: readonly Parameter[]
    reasoningEfforts?: ReasoningEffortMapping | undefined
    supplier: Adoption
    source: Adoption
  }>

function appliedParameter(
  requested: Unified,
  input: PlanParametersInput,
): Outcome<Unified, TransportFailure> {
  let applied = requested
  if (requested.kind === 'reasoning-effort' && requested.scale === 'unified') {
    const mapped = input.reasoningEfforts?.[requested.value]
    if (mapped === undefined || mapped !== input.bindingEfforts?.[requested.value])
      return { failure: unsupported(requested.kind, input.adapter) }
    applied = { kind: 'reasoning-effort', value: mapped }
  }
  const failure = judgeParameter(applied, input)
  return failure === null ? { ok: applied } : { failure }
}

export function planParameters(
  input: PlanParametersInput,
): Outcome<readonly ParameterAdoption[], TransportFailure> {
  const explicit = new Map<ParameterKind, ParameterAdoption>()
  const extensions: Extension[] = []
  const definitions = new Set<string>()
  for (const param of input.requested) {
    if (param.kind === 'extension') {
      const key = JSON.stringify(Object.values(param.definition))
      if (definitions.has(key)) return { failure: invalid('extension', 'repeated') }
      definitions.add(key)
      const read = extensionParam(param, input.record.extensions, input.adapter)
      if (!('ok' in read)) return read
      extensions.push(param)
      continue
    }
    if (explicit.has(param.kind)) return { failure: invalid(param.kind, 'repeated') }
    const applied = appliedParameter(param, input)
    if ('failure' in applied) return applied
    explicit.set(param.kind, explicitAdoption(input, param, applied.ok))
  }
  const adoptions: ParameterAdoption[] = []
  for (const kind of PARAMETER_KINDS) {
    const selected = explicit.get(kind)
    if (selected !== undefined) {
      adoptions.push(selected)
      continue
    }
    const fallback = defaultParameter(input.record.parameters, kind)
    if (fallback === null) continue
    const failure = judgeParameter(fallback, input)
    if (failure !== null) return { failure }
    adoptions.push(defaultAdoption(input, fallback))
  }
  for (const param of extensions) adoptions.push(explicitAdoption(input, param))
  return { ok: adoptions }
}

function explicitAdoption(
  input: Readonly<{ supplier: Adoption; source: Adoption }>,
  param: Parameter,
  applied: Parameter = param,
): ParameterAdoption {
  return {
    supplier: input.supplier,
    applied,
    origin: { kind: 'explicit', requested: param, source: input.source },
  }
}

function defaultAdoption(
  input: Readonly<{ supplier: Adoption; adapter: Adoption }>,
  applied: Parameter,
): ParameterAdoption {
  return { supplier: input.supplier, applied, origin: { kind: 'default', source: input.adapter } }
}

export function wireParameter(
  param: Parameter,
  context: ParameterContext,
): Outcome<GatewayParam, TransportFailure> {
  if (param.kind === 'extension')
    return extensionParam(param, context.record.extensions, context.adapter)
  const failure = judgeParameter(param, context)
  if (failure !== null) return { failure }
  const table = context.record.parameters
  switch (param.kind) {
    case 'temperature':
    case 'top-p':
    case 'frequency-penalty':
    case 'presence-penalty': {
      const rule = table[param.kind]
      if (rule.support === 'unsupported')
        return { failure: unsupported(param.kind, context.adapter) }
      return { ok: { field: rule.wire.field, value: param.value } }
    }
    case 'max-output-tokens':
    case 'seed': {
      const rule = table[param.kind]
      if (rule.support === 'unsupported')
        return { failure: unsupported(param.kind, context.adapter) }
      return { ok: { field: rule.wire.field, value: param.value } }
    }
    case 'stop': {
      const rule = table.stop
      if (rule.support === 'unsupported')
        return { failure: unsupported(param.kind, context.adapter) }
      return { ok: { field: rule.wire.field, value: param.value } }
    }
    case 'reasoning-effort': {
      const mapped = effortWire(param.value, context)
      return mapped === 'unsupported'
        ? { failure: unsupported(param.kind, context.adapter) }
        : { ok: mapped }
    }
    default: {
      const _exhaustive: never = param
      return _exhaustive
    }
  }
}
