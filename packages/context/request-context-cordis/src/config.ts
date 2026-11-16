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

export type RequestContextProviderOptions = Readonly<{
  accounting: AccountingOptions<unknown>
  policies?: AssemblyPolicies
  selection?: RequestContextPolicySelection
}>

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
  const wanted = selection === undefined ? INITIAL_SELECTION : selection
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

export const requestContextProviderConfig = standardSchema(decodeOptions)
