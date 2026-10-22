// Parameter planning over the table of one record: explicit values are checked against the record,
// omitted supported kinds take the record default, nothing is dropped. The same table writes the
// applied values into the gateway fields.
import type {
  Adoption,
  Parameter,
  ParameterAdoption,
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

/** Every parameter kind in the order the adoptions list them. */
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
/** Fails to compile when the contract adds a parameter kind that the list lacks. */
const _everyKind: [MissingKind] extends [never] ? true : never = true

type Unified = Exclude<Parameter, Readonly<{ kind: 'extension' }>>
type Extension = Extract<Parameter, Readonly<{ kind: 'extension' }>>

const DECIMAL = /^(0|[1-9][0-9]*)$/
const POSITIVE = /^[1-9][0-9]*$/

/** Compares two decimal integer texts without leading zeros. */
function compareDecimal(left: string, right: string): number {
  if (left.length !== right.length) return left.length - right.length
  if (left < right) return -1
  return left > right ? 1 : 0
}

export type ParameterContext = Readonly<{
  record: ChatCompletionsRecord
  /** The adoption of the record: the adapter of an `unsupported` failure, the source of a default. */
  adapter: Adoption
  /** `context.output.provided` of the profile. `null` in encode: the plan compared it already. */
  outputLimit: string | null
}>

function unsupported(field: string, adapter: Adoption): TransportFailure {
  return { kind: 'unsupported', field, adapter }
}

function invalid(field: string, reason: string): TransportFailure {
  return { kind: 'invalid', field, reason }
}

/** Why an explicit or default unified value cannot go out, or `null`. */
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
      const rule = table['reasoning-effort']
      if (rule.support === 'unsupported' || rule.wire[param.value] === 'unsupported')
        return unsupported(param.kind, context.adapter)
      return null
    }
    default: {
      const _exhaustive: never = param
      return _exhaustive
    }
  }
}

/** The value that a record sends for an omitted kind, or `null` when it sends none. */
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

/** The extension rule whose definition equals the whole adoption, or `undefined`. */
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

/** The gateway parameter of an extension, or the failure that keeps it from going out. */
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

/**
 * Plans the parameters of one supplier. The first failure in the order of the request wins:
 * a repeated kind or extension is `invalid`; an explicit kind the record does not support is
 * `unsupported`; a value out of the record range is `invalid`; `max-output-tokens` above the
 * output limit of the profile is `invalid`. Every omitted supported kind with a default is
 * recorded with origin `default`. The adoptions list the kinds in `PARAMETER_KINDS` order, then
 * the extensions in request order.
 */
export function planParameters(
  input: ParameterContext &
    Readonly<{ requested: readonly Parameter[]; supplier: Adoption; source: Adoption }>,
): Outcome<readonly ParameterAdoption[], TransportFailure> {
  const explicit = new Map<ParameterKind, Unified>()
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
    const failure = judgeParameter(param, input)
    if (failure !== null) return { failure }
    explicit.set(param.kind, param)
  }
  const adoptions: ParameterAdoption[] = []
  for (const kind of PARAMETER_KINDS) {
    const requested = explicit.get(kind)
    if (requested !== undefined) {
      adoptions.push(explicitAdoption(input, requested))
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
): ParameterAdoption {
  return {
    supplier: input.supplier,
    applied: param,
    origin: { kind: 'explicit', requested: param, source: input.source },
  }
}

function defaultAdoption(
  input: Readonly<{ supplier: Adoption; adapter: Adoption }>,
  applied: Parameter,
): ParameterAdoption {
  return { supplier: input.supplier, applied, origin: { kind: 'default', source: input.adapter } }
}

/**
 * The gateway parameter of one applied value, or the failure that keeps it from going out.
 * `applied` came from a plan, so a failure here means the request was not planned by this
 * record.
 */
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
      const rule = table['reasoning-effort']
      const mapped = rule.support === 'supported' ? rule.wire[param.value] : 'unsupported'
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
