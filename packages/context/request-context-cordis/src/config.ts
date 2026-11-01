// Plugin configuration and the choice of the two strategies (IC-14, CX-03).
//
// The selection is serializable: a name per strategy and its complete parameters, in the shape
// that request-context-cordis-contract defines. A name that no strategy answers to, or parameters
// that do not fit the schema, make the plugin fail to load. Nothing falls back to the default.
// Trusted assembly code may instead pass ready strategy objects as `policies`; those are runtime
// objects and never enter plugin tree JSON, so they exclude the serializable selection.
import {
  createDefaultCompactionPolicy,
  createDefaultRepresentationPolicy,
  DEFAULT_COMPACTION_POLICY,
  DEFAULT_REPRESENTATION_CONFIG,
} from '@omne-harness/request-context'
import {
  compactionPolicySchema,
  representationPolicyConfigSchema,
  standardSchema,
  type AccountingOptions,
  type AssemblyPolicies,
  type CompactionPolicy,
  type CompactionPolicyPort,
  type Decoder,
  type RepresentationPolicyConfig,
  type RepresentationPolicyPort,
} from '@omne-harness/request-context-contract'
import type { RequestContextPolicySelection } from '@omne-harness/request-context-cordis-contract/cordis'

/**
 * Runtime objects of the provider. The assembly entry builds them in trusted code; they are
 * passed as plugin options and never enter plugin tree JSON. Without `policies` and without
 * `selection`, the default strategies run with their initial values.
 */
export type RequestContextProviderOptions = Readonly<{
  accounting: AccountingOptions<unknown>
  /** Ready strategy objects from trusted code. Excludes `selection`. */
  policies?: AssemblyPolicies
  /** The serializable choice of the two strategies. Excludes `policies`. */
  selection?: RequestContextPolicySelection
}>

/** The names under which the strategies of this package answer. */
export const DEFAULT_STRATEGY = 'default'

const compactionStrategies = new Map<string, (config: CompactionPolicy) => CompactionPolicyPort>([
  [DEFAULT_STRATEGY, config => createDefaultCompactionPolicy({ config })],
])
const representationStrategies = new Map<
  string,
  (config: RepresentationPolicyConfig) => RepresentationPolicyPort
>([
  [
    DEFAULT_STRATEGY,
    config => createDefaultRepresentationPolicy({ preferences: config.preferences }),
  ],
])

const INITIAL_SELECTION: RequestContextPolicySelection = {
  compaction: { implementation: DEFAULT_STRATEGY, config: DEFAULT_COMPACTION_POLICY },
  representation: { implementation: DEFAULT_STRATEGY, config: DEFAULT_REPRESENTATION_CONFIG },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function closed(value: Record<string, unknown>, keys: readonly string[], where: string): void {
  const extra = Object.keys(value).filter(key => !keys.includes(key))
  if (extra.length > 0) throw new TypeError(`${where} has unknown field ${extra.join(', ')}`)
}
function checked<T>(
  schema: ReturnType<typeof standardSchema<T>>,
  value: unknown,
  where: string,
): T {
  const result = schema['~standard'].validate(value)
  if (result instanceof Promise) throw new TypeError(`${where}: the schema must be synchronous`)
  if (result.issues !== undefined)
    throw new TypeError(
      `${where} does not fit its schema: ${result.issues.map(i => i.message).join('; ')}`,
    )
  return result.value
}
function chosen<C, T>(
  strategies: ReadonlyMap<string, (config: C) => T>,
  entry: unknown,
  schema: ReturnType<typeof standardSchema<C>>,
  where: string,
): T {
  if (!isRecord(entry)) throw new TypeError(`${where} must be an object`)
  closed(entry, ['implementation', 'config'], where)
  const { implementation } = entry
  const create = typeof implementation === 'string' ? strategies.get(implementation) : undefined
  if (create === undefined)
    throw new TypeError(`${where} names no known strategy: ${String(implementation)}`)
  return create(checked(schema, entry.config, `${where}.config`))
}

/** The two strategies the options ask for. Throws a TypeError for anything that does not hold. */
export function selectPolicies(options: RequestContextProviderOptions): AssemblyPolicies {
  if (!isRecord(options.accounting)) throw new TypeError('accounting must be an object')
  const { policies, selection } = options
  if (policies !== undefined && selection !== undefined)
    throw new TypeError('policies and selection exclude each other')
  if (policies !== undefined) {
    if (!isRecord(policies) || !isRecord(policies.compaction) || !isRecord(policies.representation))
      throw new TypeError('policies must hold a compaction and a representation strategy')
    return policies
  }
  const wanted = selection ?? INITIAL_SELECTION
  if (!isRecord(wanted)) throw new TypeError('selection must be an object')
  closed(wanted, ['compaction', 'representation'], 'selection')
  return {
    compaction: chosen(
      compactionStrategies,
      wanted.compaction,
      compactionPolicySchema,
      'selection.compaction',
    ),
    representation: chosen(
      representationStrategies,
      wanted.representation,
      representationPolicyConfigSchema,
      'selection.representation',
    ),
  }
}

const decodeOptions: Decoder<RequestContextProviderOptions> = (value, path) => {
  try {
    if (!isRecord(value)) throw new TypeError('The plugin configuration must be an object')
    const options = value as RequestContextProviderOptions
    selectPolicies(options)
    return { ok: true, value: options }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, issues: [{ path, message }] }
  }
}

/** The Standard Schema of the plugin configuration (IC-14). */
export const requestContextProviderConfig = standardSchema(decodeOptions)
