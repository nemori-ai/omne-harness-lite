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
  exactKeys,
  hasFunctions,
  isRecord,
  refuse,
  standardSchema,
  type Decoder,
  type Decoded,
} from './decode.ts'
import type { ExecutionEnvironment, EnvironmentProvider } from './environment.ts'
import type { EnvironmentLease } from './lease.ts'
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
})
const rejected = record({
  kind: literal('rejected'),
  reason: decodeLiteral([
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
  ]),
})
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
}
const acquisitionState = variants('kind', {
  ...pendingStates,
  unrecorded: record({ kind: literal('unrecorded') }),
  invalidInput: record({ kind: literal('invalidInput') }),
  acquired: record({ kind: literal('acquired'), adoption }),
  rejected,
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
    'unrecorded',
    'acquiring',
    'provisional',
    'acquired',
    'rejected',
    'invalidated',
    'releasing',
    'pendingRelease',
    'released',
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
        bindingKinds: 0,
        continuity: 0,
        facilities: 0,
        isolation: 0,
      }).map(key => [key, value[key]]),
    ),
    path,
  )
  if (!data.ok) return data
  const functions = hasFunctions(value, path, ['describe', 'acquire', 'retire'])
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
export const inspectAcquisitionParamsSchema: OperationSchema<
  Parameters<ExecutionEnvironment<unknown>['inspectAcquisition']>
> = standardSchema(pair(decodeAccess, decodeAcquisition))
export const describeParamsSchema: OperationSchema<
  Parameters<ExecutionEnvironment<unknown>['describe']>
> = standardSchema(pair(decodeAccess, decodeScope))
export const recoverOwnedParamsSchema: OperationSchema<
  Parameters<ExecutionEnvironment<unknown>['recoverOwned']>
> = standardSchema(pair(decodeScope, recoveryAccess))
export const releaseScopeParamsSchema: OperationSchema<
  Parameters<ExecutionEnvironment<unknown>['releaseScope']>
> = standardSchema(pair(decodeScope, recoveryAccess))
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
> = standardSchema(variants('kind', { placement, rejected }))
export const acquireResultSchema: OperationSchema<
  Awaited<ReturnType<ExecutionEnvironment<unknown>['acquire']>>
> = standardSchema(
  variants('kind', {
    acquired: record({ kind: literal('acquired'), lease, adoption }),
    pending: record({ kind: literal('pending'), state: variants('kind', pendingStates) }),
    rejected,
  }),
)
export const inspectAcquisitionResultSchema: OperationSchema<
  Awaited<ReturnType<ExecutionEnvironment<unknown>['inspectAcquisition']>>
> = standardSchema(acquisitionState)
export const describeResultSchema: OperationSchema<
  Awaited<ReturnType<ExecutionEnvironment<unknown>['describe']>>
> = standardSchema<Awaited<ReturnType<ExecutionEnvironment<unknown>['describe']>>>((value, path) =>
  Array.isArray(value) ? decodeArray(description)(value, path) : rejected(value, path),
)
export const recoverOwnedResultSchema: OperationSchema<
  Awaited<ReturnType<ExecutionEnvironment<unknown>['recoverOwned']>>
> = standardSchema(variants('kind', { recovered: ownedRecovery, rejected }))
export const releaseScopeResultSchema: OperationSchema<
  Awaited<ReturnType<ExecutionEnvironment<unknown>['releaseScope']>>
> = standardSchema(variants('kind', { recovered: ownedRecovery, rejected }))
export const providerFactsSchema = standardSchema(decodeFacts)
export const managedResourceSchema = standardSchema(resource)
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
