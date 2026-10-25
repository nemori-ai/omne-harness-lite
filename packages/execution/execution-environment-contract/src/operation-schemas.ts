import type { StandardTyped } from '@omne-harness/schema-provider'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { decodeFacts, decodeInstance } from './blocks.ts'
import {
  accept,
  decodeAccess,
  decodeAcquisition,
  decodeArray,
  decodeBinding,
  decodeBindingKind,
  decodeContinuity,
  decodeFacilityKey,
  decodeIsolationClaim,
  decodeJsonValue,
  decodeLiteral,
  decodeNonEmpty,
  decodeOrigin,
  decodeRequirement,
  decodeScope,
  decodeString,
  decodeTenant,
  exactKeys,
  hasFunctions,
  isRecord,
  refuse,
  standardSchema,
  type Decoder,
  type Decoded,
} from './decode.ts'
import type { ExecutionEnvironment, EnvironmentProvider } from './environment.ts'
import type { EnvironmentLease, OriginalAcquisition } from './lease.ts'
import {
  isRecoveryAccess,
  type RecoveryAccess,
  type ResourceLedger,
  type FacilityGuard,
} from './ports.ts'

export type OperationSchema<T> = StandardSchemaV1<unknown, T> & StandardTyped<T>
export type OperationName =
  | keyof ExecutionEnvironment<unknown>
  | 'registerFacility'
  | 'registerProvider'

type Output<D> = D extends Decoder<infer T> ? T : never
type Fields = Readonly<Record<string, Decoder<unknown>>>
function record<const F extends Fields>(
  fields: F,
): Decoder<{ readonly [K in keyof F]: Output<F[K]> }> {
  return (value, path) => {
    if (!isRecord(value)) return refuse(path, 'expected an object')
    const keys = exactKeys(value, path, Object.keys(fields))
    if (!keys.ok) return keys
    const result: Record<string, unknown> = {}
    for (const [key, decoder] of Object.entries(fields)) {
      const item = decoder(value[key], [...path, key])
      if (!item.ok) return item
      result[key] = item.value
    }
    // Every property has been decoded by its matching field decoder above.
    return accept(Object.freeze(result) as { readonly [K in keyof F]: Output<F[K]> })
  }
}
function nullable<T>(decoder: Decoder<T>): Decoder<T | null> {
  return (value, path) => (value === null ? accept(null) : decoder(value, path))
}
function variants<const F extends Fields>(field: string, choices: F): Decoder<Output<F[keyof F]>> {
  return (value, path) => {
    if (!isRecord(value)) return refuse(path, 'expected an object')
    const tag = value[field]
    if (typeof tag !== 'string' || !Object.hasOwn(choices, tag))
      return refuse([...path, field], 'unexpected variant')
    const decoder = choices[tag]
    if (decoder === undefined) return refuse([...path, field], 'unexpected variant')
    return decoder(value, path) as Decoded<Output<F[keyof F]>>
  }
}
const literal = <const T extends string>(value: T) => decodeLiteral([value])
const providerIdentity = record({
  name: decodeString,
  generation: decodeString,
  version: decodeString,
})
const placement = record({
  kind: literal('placement'),
  requirement: decodeRequirement,
  binding: decodeBinding,
  provider: providerIdentity,
  continuity: decodeContinuity,
  quotaDomain: decodeNonEmpty,
})
const rejectReason = decodeLiteral([
    'notAuthorized',
    'noMatchingEnvironment',
    'missingFacility',
    'unsupportedFacility',
    'isolationUnconfirmed',
    'referenceExpired',
    'providerUnavailable',
    'ownerStopped',
    'invalidInput',
    'unavailable',
    'ambiguousEnvironment',
    'callerMismatch',
    'quotaExceeded',
    'globalCapacityExceeded',
    'recoveryUnready',
    'acquisitionConflict',
    'allocationNotPerformed',
  ])
const rejected = record({ kind: literal('rejected'), reason: rejectReason })
const resource = record({ key: decodeString, provider: decodeString, reference: decodeJsonValue })
const resources = decodeArray(resource)
const invalidation = variants('source', {
  registry: record({
    source: literal('registry'),
    reason: decodeLiteral([
      'providerRetired',
      'scopeReleased',
      'registryClosed',
      'released',
      'providerInvalidated',
    ]),
  }),
  provider: record({ source: literal('provider'), reason: decodeString }),
})
const adoption = record({
  acquisition: decodeAcquisition,
  origin: decodeOrigin,
  placement,
  provider: providerIdentity,
  instance: decodeInstance,
  continuity: decodeContinuity,
  evidence: decodeJsonValue,
})
const pendingStates = {
  acquiring: record({ kind: literal('acquiring') }),
  provisional: record({ kind: literal('provisional') }),
  invalidated: record({ kind: literal('invalidated'), adoption, invalidation }),
  releasing: record({ kind: literal('releasing'), adoption }),
  pendingRelease: record({
    kind: literal('pendingRelease'),
    adoption: nullable(adoption),
    resources,
  }),
  released: record({ kind: literal('released'), adoption }),
  settled: record({ kind: literal('settled') }),
}
const cleanup = variants('kind', {
  settled: record({ kind: literal('settled') }),
  pending: record({ kind: literal('pending') }),
  unknown: record({ kind: literal('unknown') }),
})
const acquisitionState = variants('kind', {
  ...pendingStates,
  acquired: record({ kind: literal('acquired'), adoption }),
  rejected,
  allocationFailed: record({ kind: literal('allocationFailed'), reason: rejectReason, cleanup }),
  allocationUnknown: record({ kind: literal('allocationUnknown'), acquisition: decodeAcquisition }),
})
const original = record({
  tenant: decodeTenant,
  acquisition: decodeAcquisition,
  origin: decodeOrigin,
  scope: decodeScope,
  placement,
})
const queryCause = decodeLiteral(['authority', 'scope-binding', 'provider'])
const originalInspection = variants('status', {
  allocated: record({
    kind: literal('original'),
    status: literal('allocated'),
    original,
    adoption: nullable(adoption),
  }),
  pending: record({
    kind: literal('original'),
    status: literal('pending'),
    original,
    adoption: nullable(adoption),
    phase: decodeLiteral(['acquiring', 'provisional', 'releasing']),
    resources,
  }),
  notAllocated: record({ kind: literal('original'), status: literal('notAllocated'), original }),
  settled: record({ kind: literal('original'), status: literal('settled'), original }),
  conflict: record({ kind: literal('original'), status: literal('conflict'), original }),
  allocationFailed: record({
    kind: literal('original'),
    status: literal('allocationFailed'),
    original,
    reason: rejectReason,
    cleanup,
  }),
})
const recoveryInspectionVariants = {
  invalidInput: record({ kind: literal('invalidInput') }),
  refused: record({ kind: literal('refused'), reason: decodeLiteral(['notAuthorized', 'callerMismatch']) }),
  queryUnavailable: record({ kind: literal('queryUnavailable'), cause: queryCause }),
  queryUnknown: record({ kind: literal('queryUnknown'), cause: queryCause }),
  original: originalInspection,
}
const inspection = variants('kind', {
  ...recoveryInspectionVariants,
  known: record({ kind: literal('known'), state: acquisitionState }),
  unrecorded: record({ kind: literal('unrecorded') }),
})
const recoveryInspection = variants('kind', recoveryInspectionVariants)
const lookupUnknown = record({
  kind: literal('unknown'),
  cause: decodeLiteral(['authority', 'scope-binding', 'provider', 'quota']),
})
const description = record({
  acquisition: decodeAcquisition,
  origin: decodeOrigin,
  binding: decodeBinding,
  provider: providerIdentity,
  instance: decodeInstance,
  continuity: decodeContinuity,
  facilities: decodeArray(decodeFacilityKey),
  state: decodeLiteral([
    'acquiring',
    'provisional',
    'acquired',
    'rejected',
    'allocationFailed',
    'invalidated',
    'releasing',
    'pendingRelease',
    'released',
    'allocationUnknown',
    'settled',
  ]),
})
const ownedRecovery = record({
  kind: literal('recovered'),
  scope: decodeScope,
  stopped: resources,
  pending: resources,
  unsupported: decodeArray(
    variants('kind', {
      provider: record({ kind: literal('provider'), provider: providerIdentity }),
      resource: record({ kind: literal('resource'), resource }),
    }),
  ),
  unavailable: decodeArray(providerIdentity),
  settledAcquisitions: decodeArray(
    record({ original, outcome: decodeLiteral(['settled', 'notAllocated']) }),
  ),
  pendingAcquisitions: decodeArray(
    record({ original, reason: decodeLiteral(['pending', 'unknown']), resources }),
  ),
  unsupportedAcquisitions: decodeArray(original),
})
const recoveryAccess: Decoder<RecoveryAccess> = (value, path) =>
  isRecoveryAccess(value) ? accept(value) : refuse(path, 'expected a recovery access object')
function isLedger(value: unknown): value is ResourceLedger {
  return (
    isRecord(value) &&
    value['closed'] instanceof AbortSignal &&
    ['plan', 'permit', 'adopt', 'stopped'].every(key => typeof value[key] === 'function')
  )
}
const ledger: Decoder<ResourceLedger> = (value, path) => {
  if (!isRecord(value)) return refuse(path, 'expected a resource ledger')
  if (!(value['closed'] instanceof AbortSignal))
    return refuse([...path, 'closed'], 'expected an AbortSignal')
  const functions = hasFunctions(value, path, ['plan', 'permit', 'adopt', 'stopped'])
  if (!functions.ok) return functions
  return isLedger(value) ? accept(value) : refuse(path, 'expected a resource ledger')
}
function isGuard(value: unknown): value is FacilityGuard<unknown> {
  return isRecord(value) && typeof value['authorize'] === 'function'
}
const guard: Decoder<FacilityGuard<unknown>> = (value, path) =>
  isGuard(value) ? accept(value) : refuse([...path, 'authorize'], 'expected a function')
const providerData = record({
  name: decodeString,
  generation: decodeString,
  version: decodeString,
  quotaDomain: decodeNonEmpty,
  bindingKinds: decodeArray(decodeBindingKind),
  continuity: decodeContinuity,
  facilities: decodeArray(decodeFacilityKey),
  isolation: decodeArray(decodeIsolationClaim),
})
const provider: Decoder<EnvironmentProvider> = (value, path) => {
  if (!isRecord(value)) return refuse(path, 'expected a provider')
  const data = providerData(
    Object.fromEntries(
      Object.keys({
        name: 0,
        generation: 0,
        version: 0,
        quotaDomain: 0,
        bindingKinds: 0,
        continuity: 0,
        facilities: 0,
        isolation: 0,
      }).map(key => [key, value[key]]),
    ),
    path,
  )
  if (!data.ok) return data
  const functions = hasFunctions(value, path, [
    'describe',
    'quota',
    'acquire',
    'inspectAcquisition',
    'listAcquisitions',
    'settleAcquisition',
    'retire',
  ])
  if (!functions.ok) return functions
  const list = value['listRecoveryResources'],
    recover = value['recover']
  if (list !== undefined || recover !== undefined) {
    const extra = hasFunctions(value, path, ['listRecoveryResources', 'recover'])
    if (!extra.ok) return extra
  }
  // Data fields and callable members were checked; keep the original runtime object.
  return accept(value as unknown as EnvironmentProvider)
}
const lease: Decoder<EnvironmentLease> = (value, path) => {
  if (!isRecord(value)) return refuse(path, 'expected a lease')
  for (const [key, decoder] of Object.entries({
    placement,
    instance: decodeInstance,
    continuity: decodeContinuity,
  })) {
    const data = decoder(value[key], [...path, key])
    if (!data.ok) return data
  }
  const functions = hasFunctions(value, path, ['facility', 'release'])
  if (!functions.ok) return functions
  const promise = value['invalidated']
  if (
    (typeof promise !== 'object' && typeof promise !== 'function') ||
    promise === null ||
    typeof Reflect.get(promise, 'then') !== 'function'
  )
    return refuse([...path, 'invalidated'], 'expected a thenable')
  return accept(value as unknown as EnvironmentLease)
}
const descriptor = record({
  key: decodeFacilityKey,
  operations: decodeArray(decodeNonEmpty),
  guarded: decodeArray(decodeNonEmpty),
})
const checkedDescriptor: typeof descriptor = (value, path) => {
  const decoded = descriptor(value, path)
  if (!decoded.ok) return decoded
  for (const field of ['operations', 'guarded'] as const) {
    const names = decoded.value[field]
    for (const [i, name] of names.entries()) {
      if (names.indexOf(name) !== i) return refuse([...path, field, i], 'duplicate operation')
      if (field === 'guarded' && !decoded.value.operations.includes(name))
        return refuse([...path, field, i], 'guarded operation is not in operations')
    }
  }
  return decoded
}
function pair<A, B>(first: Decoder<A>, second: Decoder<B>): Decoder<[A, B]> {
  return (value, path) => {
    if (!Array.isArray(value) || value.length !== 2)
      return refuse(path, 'expected a two-item parameter tuple')
    const a = first(value[0], [...path, 0])
    if (!a.ok) return a
    const b = second(value[1], [...path, 1])
    if (!b.ok) return b
    return accept([a.value, b.value])
  }
}
function pairWithOptional<A, B, C>(
  first: Decoder<A>,
  second: Decoder<B>,
  third: Decoder<C>,
): Decoder<[A, B, C?]> {
  return (value, path) => {
    if (!Array.isArray(value) || value.length < 2 || value.length > 3)
      return refuse(path, 'expected a two- or three-item parameter tuple')
    const head = pair(first, second)(value.slice(0, 2), path)
    if (!head.ok) return head
    if (value.length === 2 || value[2] === undefined) return accept([head.value[0], head.value[1]])
    const c = third(value[2], [...path, 2])
    if (!c.ok) return c
    return accept([head.value[0], head.value[1], c.value])
  }
}
function single<T>(decoder: Decoder<T>): Decoder<[T]> {
  return (value, path) => {
    if (!Array.isArray(value) || value.length !== 1)
      return refuse(path, 'expected a one-item parameter tuple')
    const item = decoder(value[0], [...path, 0])
    return item.ok ? accept([item.value]) : item
  }
}
export const resolvePlacementParamsSchema: OperationSchema<
  Parameters<ExecutionEnvironment<unknown>['resolvePlacement']>
> = standardSchema(
  pair(decodeAccess, record({ scope: decodeScope, requirement: decodeRequirement })),
)
export const acquireParamsSchema: OperationSchema<
  Parameters<ExecutionEnvironment<unknown>['acquire']>
> = standardSchema(
  pair(
    decodeAccess,
    record({
      acquisition: decodeAcquisition,
      origin: decodeOrigin,
      scope: decodeScope,
      placement,
      ledger,
      guard,
    }),
  ),
)
const acquisitionQuery = variants('kind', {
  local: record({ kind: literal('local'), acquisition: decodeAcquisition }),
  original: record({ kind: literal('original'), original }),
})
export const inspectAcquisitionParamsSchema: OperationSchema<
  Parameters<ExecutionEnvironment<unknown>['inspectAcquisition']>
> = standardSchema(pair(decodeAccess, acquisitionQuery))
export const inspectRecoveryAcquisitionParamsSchema: OperationSchema<
  Parameters<ExecutionEnvironment<unknown>['inspectRecoveryAcquisition']>
> = standardSchema(pair(recoveryAccess, original))
export const describeParamsSchema: OperationSchema<
  Parameters<ExecutionEnvironment<unknown>['describe']>
> = standardSchema(pair(decodeAccess, decodeScope))
export const recoverOwnedParamsSchema: OperationSchema<
  Parameters<ExecutionEnvironment<unknown>['recoverOwned']>
> = standardSchema(pairWithOptional(decodeScope, recoveryAccess, decodeArray(original)))
export const releaseScopeParamsSchema: OperationSchema<
  Parameters<ExecutionEnvironment<unknown>['releaseScope']>
> = standardSchema(pairWithOptional(decodeScope, recoveryAccess, decodeArray(original)))
export const registerFacilityParamsSchema: OperationSchema<
  [
    Readonly<{
      key: import('./facility.ts').FacilityKey
      operations: readonly string[]
      guarded: readonly string[]
    }>,
  ]
> = standardSchema(single(checkedDescriptor))
export const registerProviderParamsSchema: OperationSchema<[EnvironmentProvider]> = standardSchema(
  single(provider),
)
export const resolvePlacementResultSchema: OperationSchema<
  Awaited<ReturnType<ExecutionEnvironment<unknown>['resolvePlacement']>>
> = standardSchema(variants('kind', { placement, rejected, unknown: lookupUnknown }))
export const acquireResultSchema: OperationSchema<
  Awaited<ReturnType<ExecutionEnvironment<unknown>['acquire']>>
> = standardSchema(
  variants('kind', {
    acquired: record({ kind: literal('acquired'), lease, adoption }),
    pending: record({ kind: literal('pending'), state: variants('kind', pendingStates) }),
    rejected,
    allocationFailed: record({
      kind: literal('allocationFailed'),
      acquisition: decodeAcquisition,
      reason: rejectReason,
      cleanup,
    }),
    unknown: record({
      kind: literal('unknown'),
      acquisition: decodeAcquisition,
      phase: decodeLiteral(['preflight', 'allocation']),
    }),
  }),
)
export const inspectAcquisitionResultSchema: OperationSchema<
  Awaited<ReturnType<ExecutionEnvironment<unknown>['inspectAcquisition']>>
> = standardSchema(inspection)
export const inspectRecoveryAcquisitionResultSchema: OperationSchema<
  Awaited<ReturnType<ExecutionEnvironment<unknown>['inspectRecoveryAcquisition']>>
> = standardSchema(recoveryInspection)
export const describeResultSchema: OperationSchema<
  Awaited<ReturnType<ExecutionEnvironment<unknown>['describe']>>
> = standardSchema<Awaited<ReturnType<ExecutionEnvironment<unknown>['describe']>>>((value, path) =>
  Array.isArray(value)
    ? decodeArray(description)(value, path)
    : variants('kind', { rejected, unknown: lookupUnknown })(value, path),
)
export const recoverOwnedResultSchema: OperationSchema<
  Awaited<ReturnType<ExecutionEnvironment<unknown>['recoverOwned']>>
> = standardSchema(variants('kind', { recovered: ownedRecovery, rejected, unknown: lookupUnknown }))
export const releaseScopeResultSchema: OperationSchema<
  Awaited<ReturnType<ExecutionEnvironment<unknown>['releaseScope']>>
> = standardSchema(variants('kind', { recovered: ownedRecovery, rejected, unknown: lookupUnknown }))
export const providerFactsSchema = standardSchema(decodeFacts)
export const managedResourceSchema = standardSchema(resource)
/** The description a caller keeps before the provider is called; recovery uses it to find the original. */
export const originalAcquisitionSchema: OperationSchema<OriginalAcquisition> = standardSchema(original)
type EnvironmentSchemas = {
  readonly [K in keyof ExecutionEnvironment<unknown>]: Readonly<{
    params: OperationSchema<Parameters<ExecutionEnvironment<unknown>[K]>>
    result: OperationSchema<Awaited<ReturnType<ExecutionEnvironment<unknown>[K]>>>
  }>
}
export const operationSchemas: EnvironmentSchemas &
  Readonly<{
    registerFacility: Readonly<{ params: typeof registerFacilityParamsSchema }>
    registerProvider: Readonly<{ params: typeof registerProviderParamsSchema }>
  }> = Object.freeze({
  resolvePlacement: Object.freeze({
    params: resolvePlacementParamsSchema,
    result: resolvePlacementResultSchema,
  }),
  acquire: Object.freeze({ params: acquireParamsSchema, result: acquireResultSchema }),
  inspectAcquisition: Object.freeze({
    params: inspectAcquisitionParamsSchema,
    result: inspectAcquisitionResultSchema,
  }),
  inspectRecoveryAcquisition: Object.freeze({
    params: inspectRecoveryAcquisitionParamsSchema,
    result: inspectRecoveryAcquisitionResultSchema,
  }),
  describe: Object.freeze({ params: describeParamsSchema, result: describeResultSchema }),
  recoverOwned: Object.freeze({
    params: recoverOwnedParamsSchema,
    result: recoverOwnedResultSchema,
  }),
  releaseScope: Object.freeze({
    params: releaseScopeParamsSchema,
    result: releaseScopeResultSchema,
  }),
  registerFacility: Object.freeze({ params: registerFacilityParamsSchema }),
  registerProvider: Object.freeze({ params: registerProviderParamsSchema }),
})
