// The Standard Schema of the plugin configuration (SPEC property 3, IC-14). The policy fields
// override `defaultSchedulingPolicy` one by one; the defaults are only initial values. The numeric
// rules are those of the factory (the root entry of session does not export its checker), so this
// file does not repeat them: it merges, refuses unknown keys, and asks the factory to name the first
// offending field.
import {
  createSessionInstance,
  defaultSchedulingPolicy,
  type SchedulingPolicy,
  type SessionDependencies,
} from '@omne-harness/session'

type Overrides<T> = {
  readonly [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? Overrides<T[K]>
      : T[K]
}

/** What the assembly writes. Every field is optional; `preEvaluation.prewarm` only accepts `false`. */
export type SessionProviderConfig = Readonly<{
  /** Overrides of `SchedulingPolicy`, field by field. */
  policy?: Overrides<SchedulingPolicy>
  /** The upper bound, in milliseconds, of the wait for `close` at removal. Initial value: 10 000. */
  disposeWaitMs?: number
  /** `'none'` declares that this deployment has no command domain and no hooks. Omit it otherwise. */
  admission?: 'none'
}>

export type ResolvedProviderConfig = Readonly<{
  policy: SchedulingPolicy
  disposeWaitMs: number
  admission: 'none' | undefined
}>

export const defaultDisposeWaitMs = 10_000

type Issue = Readonly<{ message: string; path?: readonly string[] }>
type Parsed =
  | Readonly<{ value: SessionProviderConfig; issues?: undefined }>
  | Readonly<{ issues: readonly Issue[] }>

const FIELDS = ['policy', 'disposeWaitMs', 'admission'] as const

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The policy `overrides` give over `base`. An unknown key is an issue: a misspelling must not pass. */
function mergePolicy(
  base: unknown,
  overrides: unknown,
  path: readonly string[],
): { value: unknown } | { issue: Issue } {
  if (overrides === undefined) return { value: base }
  if (!isRecord(base) || !isRecord(overrides)) return { value: overrides }
  const merged: Record<string, unknown> = { ...base }
  for (const [key, override] of Object.entries(overrides)) {
    if (override === undefined) continue
    if (!(key in base)) return { issue: { message: `unknown field ${key}`, path: [...path, key] } }
    const inner = base[key]
    if (isRecord(inner)) {
      if (!isRecord(override))
        return { issue: { message: `${key} must be an object`, path: [...path, key] } }
      const next = mergePolicy(inner, override, [...path, key])
      if ('issue' in next) return next
      merged[key] = next.value
    } else merged[key] = override
  }
  return { value: merged }
}

/**
 * Merges a configuration over the initial values and refuses unknown keys and wrong types. The
 * numeric rules of the policy are not checked here: they belong to the factory (see `probe`).
 */
export function resolveProviderConfig(
  config: unknown,
): { value: ResolvedProviderConfig } | { issues: readonly Issue[] } {
  if (config === undefined || config === null) return resolveProviderConfig({})
  if (!isRecord(config)) return { issues: [{ message: 'configuration must be an object' }] }
  for (const key of Object.keys(config))
    if (!FIELDS.some(field => field === key))
      return { issues: [{ message: `unknown field ${key}`, path: [key] }] }

  const { disposeWaitMs = defaultDisposeWaitMs, admission } = config
  if (typeof disposeWaitMs !== 'number' || !Number.isFinite(disposeWaitMs) || disposeWaitMs <= 0)
    return {
      issues: [
        { message: 'disposeWaitMs must be a positive finite number', path: ['disposeWaitMs'] },
      ],
    }
  if (admission !== undefined && admission !== 'none')
    return { issues: [{ message: "admission must be omitted or 'none'", path: ['admission'] }] }

  const policy = mergePolicy(defaultSchedulingPolicy, config['policy'], ['policy'])
  if ('issue' in policy) return { issues: [policy.issue] }
  return { value: { policy: policy.value as SchedulingPolicy, disposeWaitMs, admission } }
}

/**
 * The factory checks the start conditions before the configuration, and only by their shape. These
 * four stand-ins pass that check and are never called: the probe instance serves no operation.
 */
const probeDependencies = {
  accessCheck: { check: () => Promise.reject(new Error('probe')) },
  transactions: { bind: () => Promise.reject(new Error('probe')) },
  workPrincipals: { forSession: () => Promise.reject(new Error('probe')) },
  principals: { coordinator: null, maintainer: null },
} as unknown as SessionDependencies<unknown>

/** The issue the factory raises for `policy`, naming the offending field, or null when it accepts it. */
function probe(policy: SchedulingPolicy): Issue | null {
  try {
    void createSessionInstance(probeDependencies, { policy })
      .close()
      .catch(() => undefined)
    return null
  } catch (error) {
    const field = error instanceof Error && 'field' in error ? String(error.field) : 'policy'
    const message = error instanceof Error ? error.message : String(error)
    return { message, path: field.split('.') }
  }
}

function parse(config: unknown): Parsed {
  const resolved = resolveProviderConfig(config)
  if ('issues' in resolved) return resolved
  const refused = probe(resolved.value.policy)
  if (refused !== null) return { issues: [refused] }
  return { value: isRecord(config) ? config : {} }
}

/** The static `Config` of the plugin. Its output is the input the assembly gave, once it is known to be valid. */
export const sessionProviderConfigSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'session-cordis',
    validate: parse,
  },
}
