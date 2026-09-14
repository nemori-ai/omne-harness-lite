import type { DiagnosticIdentity, DiagnosticPoint } from './index.js'

type DescriptorMap = Record<string, PropertyDescriptor>
type Checked<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false }>

const invalid: Checked<never> = Object.freeze({ ok: false })

function valid<T>(value: T): Checked<T> {
  return { ok: true, value }
}

function object(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Checked<DescriptorMap> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return invalid
  try {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return invalid
    if (Object.getOwnPropertySymbols(value).length !== 0) return invalid
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const allowed = new Set([...required, ...optional])
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!allowed.has(key) || !descriptor.enumerable || !('value' in descriptor)) return invalid
    }
    for (const key of required) {
      if (!(key in descriptors)) return invalid
    }
    return valid(descriptors)
  } catch {
    return invalid
  }
}

function value(descriptors: DescriptorMap, key: string): unknown {
  return descriptors[key]?.value
}

function safeString(input: unknown, semantic = false): Checked<string> {
  if (typeof input !== 'string' || input.length === 0 || Buffer.byteLength(input, 'utf8') > 256) return invalid
  if (/[\u0000-\u001f\u007f]/u.test(input)) return invalid
  if (semantic && !/^[a-z][a-z0-9_.-]{0,127}$/u.test(input)) return invalid
  return valid(input)
}

function optionalString(descriptors: DescriptorMap, key: string): Checked<string | undefined> {
  if (!(key in descriptors)) return valid(undefined)
  return safeString(value(descriptors, key))
}

function ref(
  input: unknown,
  required: readonly string[],
): Checked<Readonly<Record<string, string>>> {
  const shape = object(input, required)
  if (!shape.ok) return invalid
  const result: Record<string, string> = {}
  for (const key of required) {
    const item = safeString(value(shape.value, key))
    if (!item.ok) return invalid
    result[key] = item.value
  }
  return valid(Object.freeze(result))
}

function operation(input: unknown): Checked<Readonly<{
  namespace: string
  principalId: string
  operationId: string
}>> {
  const result = ref(input, ['namespace', 'principalId', 'operationId'])
  return result.ok ? valid(result.value as { namespace: string; principalId: string; operationId: string }) : invalid
}

export type SafePrincipal =
  | Readonly<{ kind: 'user'; user: Readonly<{ userId: string }> }>
  | Readonly<{ kind: 'system'; systemId: string }>

function principal(input: unknown): Checked<SafePrincipal> {
  const initial = object(input, ['kind'], ['user', 'systemId'])
  if (!initial.ok) return invalid
  const kind = value(initial.value, 'kind')
  if (kind === 'user') {
    const exact = object(input, ['kind', 'user'])
    if (!exact.ok) return invalid
    const user = ref(value(exact.value, 'user'), ['userId'])
    return user.ok ? valid(Object.freeze({ kind: 'user', user: user.value as { userId: string } })) : invalid
  }
  if (kind === 'system') {
    const exact = object(input, ['kind', 'systemId'])
    if (!exact.ok) return invalid
    const systemId = safeString(value(exact.value, 'systemId'))
    return systemId.ok ? valid(Object.freeze({ kind: 'system', systemId: systemId.value })) : invalid
  }
  return invalid
}

function session(input: unknown): Checked<Readonly<{ tenantId: string; sessionId: string }>> {
  const result = ref(input, ['tenantId', 'sessionId'])
  return result.ok ? valid(result.value as { tenantId: string; sessionId: string }) : invalid
}

function user(input: unknown): Checked<Readonly<{ userId: string }>> {
  const result = ref(input, ['userId'])
  return result.ok ? valid(result.value as { userId: string }) : invalid
}

function definition(input: unknown): Checked<Readonly<{
  definition: Readonly<{ ownerTenantId: string; definitionId: string }>
  version: string
}>> {
  const shape = object(input, ['definition', 'version'])
  if (!shape.ok) return invalid
  const definitionRef = ref(value(shape.value, 'definition'), ['ownerTenantId', 'definitionId'])
  const version = safeString(value(shape.value, 'version'))
  return definitionRef.ok && version.ok
    ? valid(Object.freeze({
        definition: definitionRef.value as { ownerTenantId: string; definitionId: string },
        version: version.value,
      }))
    : invalid
}

function resource(input: unknown): Checked<Readonly<{
  tenantId: string
  kind: string
  resourceId: string
  version: string
}>> {
  const result = ref(input, ['tenantId', 'kind', 'resourceId', 'version'])
  return result.ok
    ? valid(result.value as { tenantId: string; kind: string; resourceId: string; version: string })
    : invalid
}

function binding(input: unknown): Checked<Readonly<Record<string, unknown>>> {
  const shape = object(input, [
    'implementationId', 'generation', 'configurationRevision', 'environment', 'parserVersion',
  ])
  if (!shape.ok) return invalid
  const implementationId = safeString(value(shape.value, 'implementationId'))
  const generation = safeString(value(shape.value, 'generation'))
  const configurationRevision = safeString(value(shape.value, 'configurationRevision'))
  const environment = resource(value(shape.value, 'environment'))
  const parserVersion = safeString(value(shape.value, 'parserVersion'))
  if (!implementationId.ok || !generation.ok || !configurationRevision.ok || !environment.ok || !parserVersion.ok) {
    return invalid
  }
  return valid(Object.freeze({
    implementationId: implementationId.value,
    generation: generation.value,
    configurationRevision: configurationRevision.value,
    environment: environment.value,
    parserVersion: parserVersion.value,
  }))
}

function work(input: unknown): Checked<Readonly<Record<string, unknown>>> {
  const workRef = ref(input, ['tenantId', 'workId'])
  if (workRef.ok) return valid(workRef.value)
  const stepShape = object(input, ['run', 'stepId'])
  if (!stepShape.ok) return invalid
  const runShape = object(value(stepShape.value, 'run'), ['session', 'runId'])
  if (!runShape.ok) return invalid
  const sessionRef = session(value(runShape.value, 'session'))
  const runId = safeString(value(runShape.value, 'runId'))
  const stepId = safeString(value(stepShape.value, 'stepId'))
  if (!sessionRef.ok || !runId.ok || !stepId.ok) return invalid
  return valid(Object.freeze({
    run: Object.freeze({ session: sessionRef.value, runId: runId.value }),
    stepId: stepId.value,
  }))
}

function ownerTenant(input: Readonly<Record<string, unknown>>): string | undefined {
  if (typeof input.tenantId === 'string') return input.tenantId
  const run = input.run
  if (run !== null && typeof run === 'object') {
    const sessionRef = (run as Record<string, unknown>).session
    if (sessionRef !== null && typeof sessionRef === 'object') {
      const tenantId = (sessionRef as Record<string, unknown>).tenantId
      return typeof tenantId === 'string' ? tenantId : undefined
    }
  }
  return undefined
}

function call(input: unknown): Checked<Readonly<Record<string, unknown>>> {
  const shape = object(input, ['owner', 'callId', 'attemptId'])
  if (!shape.ok) return invalid
  const owner = work(value(shape.value, 'owner'))
  const callId = safeString(value(shape.value, 'callId'))
  const attemptId = safeString(value(shape.value, 'attemptId'))
  return owner.ok && callId.ok && attemptId.ok
    ? valid(Object.freeze({ owner: owner.value, callId: callId.value, attemptId: attemptId.value }))
    : invalid
}

function agent(input: unknown): Checked<Readonly<{ tenantId: string; sessionId: string; incarnationId: string }>> {
  const result = ref(input, ['tenantId', 'sessionId', 'incarnationId'])
  return result.ok
    ? valid(result.value as { tenantId: string; sessionId: string; incarnationId: string })
    : invalid
}

function causality(input: unknown, tenantId: string | null): Checked<Readonly<Record<string, unknown>>> {
  const keys = [
    'parentOperation', 'initiator', 'session', 'work', 'call', 'request', 'agent', 'definition', 'binding',
  ] as const
  const shape = object(input, [], keys)
  if (!shape.ok) return invalid
  const result: Record<string, unknown> = {}
  for (const key of keys) {
    if (!(key in shape.value)) continue
    const item = value(shape.value, key)
    const projected = key === 'parentOperation' ? operation(item)
      : key === 'initiator' ? principal(item)
      : key === 'session' ? session(item)
      : key === 'work' ? work(item)
      : key === 'call' ? call(item)
      : key === 'request' ? ref(item, ['tenantId', 'requestId'])
      : key === 'agent' ? agent(item)
      : key === 'definition' ? definition(item)
      : binding(item)
    if (!projected.ok) return invalid
    if (tenantId !== null) {
      const candidate = key === 'session' || key === 'agent' || key === 'request'
        ? (projected.value as Record<string, unknown>).tenantId
        : key === 'work'
          ? ownerTenant(projected.value as Record<string, unknown>)
          : key === 'call'
            ? ownerTenant((projected.value as Record<string, unknown>).owner as Record<string, unknown>)
            : undefined
      if (candidate !== undefined && candidate !== tenantId) return invalid
    }
    result[key] = projected.value
  }
  return valid(Object.freeze(result))
}

export type SafeIdentity = Readonly<{
  tenantId: string | null
  principal: SafePrincipal
  operation?: Readonly<{ namespace: string; principalId: string; operationId: string }>
  causality: Readonly<Record<string, unknown>>
}>

export function projectIdentity(input: DiagnosticIdentity): Checked<SafeIdentity> {
  const shape = object(input, ['tenantId', 'principal', 'causality'], ['operation'])
  if (!shape.ok) return invalid
  const tenantValue = value(shape.value, 'tenantId')
  const tenantId = tenantValue === null ? valid(null) : safeString(tenantValue)
  const principalValue = principal(value(shape.value, 'principal'))
  const operationValue = 'operation' in shape.value ? operation(value(shape.value, 'operation')) : valid(undefined)
  if (!tenantId.ok || !principalValue.ok || !operationValue.ok) return invalid
  const causalityValue = causality(value(shape.value, 'causality'), tenantId.value)
  if (!causalityValue.ok) return invalid
  return valid(Object.freeze({
    tenantId: tenantId.value,
    principal: principalValue.value,
    ...(operationValue.value === undefined ? {} : { operation: operationValue.value }),
    causality: causalityValue.value,
  }))
}

function counter(input: unknown, positive = false): Checked<string> {
  if (typeof input !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(input)) return invalid
  if (positive && input === '0') return invalid
  return valid(input)
}

function position(input: unknown): Checked<Readonly<Record<string, string>>> {
  const shape = object(input, ['coordinationDomain', 'writerEpoch', 'commitId', 'seq'])
  if (!shape.ok) return invalid
  const coordinationDomain = safeString(value(shape.value, 'coordinationDomain'))
  const writerEpoch = counter(value(shape.value, 'writerEpoch'), true)
  const commitId = safeString(value(shape.value, 'commitId'))
  const seq = counter(value(shape.value, 'seq'), true)
  return coordinationDomain.ok && writerEpoch.ok && commitId.ok && seq.ok
    ? valid(Object.freeze({
        coordinationDomain: coordinationDomain.value,
        writerEpoch: writerEpoch.value,
        commitId: commitId.value,
        seq: seq.value,
      }))
    : invalid
}

function watermark(input: unknown): Checked<Readonly<{
  coordinationDomain: string
  seq: string
  commitId: string | null
}>> {
  const shape = object(input, ['coordinationDomain', 'seq', 'commitId'])
  if (!shape.ok) return invalid
  const coordinationDomain = safeString(value(shape.value, 'coordinationDomain'))
  const seq = counter(value(shape.value, 'seq'))
  const commitValue = value(shape.value, 'commitId')
  const commitId = commitValue === null ? valid(null) : safeString(commitValue)
  return coordinationDomain.ok && seq.ok && commitId.ok
    ? valid(Object.freeze({ coordinationDomain: coordinationDomain.value, seq: seq.value, commitId: commitId.value }))
    : invalid
}

function measure(input: unknown, integer: boolean): Checked<number> {
  if (typeof input !== 'number' || !Number.isFinite(input) || input < 0) return invalid
  if (integer && !Number.isSafeInteger(input)) return invalid
  return valid(input)
}

function measures(input: unknown): Checked<Readonly<Record<string, number>>> {
  const keys = ['durationMs', 'queueDepth', 'pendingBytes', 'count'] as const
  const shape = object(input, [], keys)
  if (!shape.ok) return invalid
  const result: Record<string, number> = {}
  for (const key of keys) {
    if (!(key in shape.value)) continue
    const item = measure(value(shape.value, key), key !== 'durationMs')
    if (!item.ok) return invalid
    result[key] = item.value
  }
  return valid(Object.freeze(result))
}

export type SafePoint = Readonly<{
  component: string
  phase: string
  code: string
  level: 'debug' | 'info' | 'warn' | 'error'
  diagnosticId?: string
  position?: Readonly<Record<string, string>>
  logical?: Readonly<{ coordinationDomain: string; seq: string; commitId: string | null }>
  durable?: Readonly<{ coordinationDomain: string; seq: string; commitId: string | null }>
  measures?: Readonly<Record<string, number>>
}>

export function projectPoint(input: DiagnosticPoint): Checked<SafePoint> {
  const optional = ['diagnosticId', 'position', 'logical', 'durable', 'measures'] as const
  const shape = object(input, ['component', 'phase', 'code', 'level'], optional)
  if (!shape.ok) return invalid
  const component = safeString(value(shape.value, 'component'), true)
  const phase = safeString(value(shape.value, 'phase'), true)
  const code = safeString(value(shape.value, 'code'), true)
  const level = value(shape.value, 'level')
  if (!component.ok || !phase.ok || !code.ok || !['debug', 'info', 'warn', 'error'].includes(level as string)) {
    return invalid
  }
  const result: Record<string, unknown> = {
    component: component.value,
    phase: phase.value,
    code: code.value,
    level,
  }
  for (const key of optional) {
    if (!(key in shape.value)) continue
    const item = key === 'diagnosticId' ? safeString(value(shape.value, key))
      : key === 'position' ? position(value(shape.value, key))
      : key === 'measures' ? measures(value(shape.value, key))
      : watermark(value(shape.value, key))
    if (!item.ok) return invalid
    result[key] = item.value
  }
  return valid(Object.freeze(result) as SafePoint)
}

export function samePrincipal(left: SafePrincipal, right: SafePrincipal): boolean {
  return left.kind === 'system'
    ? right.kind === 'system' && left.systemId === right.systemId
    : right.kind === 'user' && left.user.userId === right.user.userId
}
