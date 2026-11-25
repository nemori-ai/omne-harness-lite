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

export type SessionProviderConfig = Readonly<{
  policy?: Overrides<SchedulingPolicy>
  disposeWaitMs?: number
  admission?: 'none'
  resolver?: 'none'
}>

export type ResolvedProviderConfig = Readonly<{
  policy: SchedulingPolicy
  disposeWaitMs: number
  admission: 'none' | undefined
  resolver: 'none' | undefined
}>

export const defaultDisposeWaitMs = 10_000

type Issue = Readonly<{ message: string; path?: readonly string[] }>
type Parsed =
  | Readonly<{ value: SessionProviderConfig; issues?: undefined }>
  | Readonly<{ issues: readonly Issue[] }>

const FIELDS = ['policy', 'disposeWaitMs', 'admission', 'resolver'] as const

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

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

export function resolveProviderConfig(
  config: unknown,
): { value: ResolvedProviderConfig } | { issues: readonly Issue[] } {
  if (config === undefined || config === null) return resolveProviderConfig({})
  if (!isRecord(config)) return { issues: [{ message: 'configuration must be an object' }] }
  for (const key of Object.keys(config))
    if (!FIELDS.some(field => field === key))
      return { issues: [{ message: `unknown field ${key}`, path: [key] }] }

  const { disposeWaitMs = defaultDisposeWaitMs, admission, resolver } = config
  if (typeof disposeWaitMs !== 'number' || !Number.isFinite(disposeWaitMs) || disposeWaitMs <= 0)
    return {
      issues: [
        { message: 'disposeWaitMs must be a positive finite number', path: ['disposeWaitMs'] },
      ],
    }
  if (admission !== undefined && admission !== 'none')
    return { issues: [{ message: "admission must be omitted or 'none'", path: ['admission'] }] }
  if (resolver !== undefined && resolver !== 'none')
    return { issues: [{ message: "resolver must be omitted or 'none'", path: ['resolver'] }] }

  const policy = mergePolicy(defaultSchedulingPolicy, config['policy'], ['policy'])
  if ('issue' in policy) return { issues: [policy.issue] }
  return { value: { policy: policy.value as SchedulingPolicy, disposeWaitMs, admission, resolver } }
}

const probeDependencies = {
  accessCheck: { check: () => Promise.reject(new Error('probe')) },
  transactions: { bind: () => Promise.reject(new Error('probe')) },
  workPrincipals: { forSession: () => Promise.reject(new Error('probe')) },
  principals: { coordinator: null, maintainer: null },
} as unknown as SessionDependencies<unknown>

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

export const sessionProviderConfigSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'session-cordis',
    validate: parse,
  },
}
