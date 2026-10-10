import {
  type RegistryHistoryRequest,
  type RegistryHistoryStage,
  type RegistryHistoryResult,
} from '@omne-harness-lite/asset-evaluation'
import {
  BodyProviderUnavailableError,
  type AssetDefinition,
  type CapabilityId,
} from '@omne-harness-lite/asset-model'
import {
  isNonNegativeJsonInteger,
  type JsonNumber,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  parseOpaqueIdentifier,
  parseTenantId,
  tenantIdEquals,
} from '@omne-harness-lite/identity-values'
import { instantFromEpochMs } from '@omne-harness-lite/offer-expiry'
import type { AssemblyManifestService } from '@omne-harness-lite/assembly-manifest'
import type { MembershipsService } from '@omne-harness-lite/organization-governance'
import type { SessionTenancyService } from '@omne-harness-lite/session-tenancy'
import { narrow, StorageUnavailable, type AtomicStorage } from '@omne-harness-lite/storage'
import {
  getAssetJudge,
  equal,
  json,
  object,
  orderVersions,
  parsed,
  SourceUnavailable,
} from './data.ts'
import type { SourceDb } from './types.ts'
import type { RegistryReadUnit } from './registry-read-unit.ts'
export interface RegistryHistoryReader {
  read(request: unknown): Promise<RegistryHistoryResult>
  close(): Promise<void>
}
export interface RegistryHistoryDependencies {
  readonly storage: AtomicStorage
  readonly storeKey: string
  readonly sessionTenancy: SessionTenancyService
  readonly memberships: Pick<MembershipsService, 'participate'>
  readonly manifestHistory: Pick<AssemblyManifestService, 'readHistory'>
  readonly diagnostics: (event: JsonObject) => void
  readonly onDiagnosticFailure: (stage: string) => void
  readonly monotonicNow: () => bigint
}
const categories = ['plugin', 'tool', 'skill', 'loop_extension', 'mcp', 'slash_command'] as const
function historyFailureStage(error: unknown): RegistryHistoryStage | undefined {
  if (error instanceof HistoryUnavailable) return error.stage
  if (error instanceof SourceUnavailable)
    return ['current_membership', 'current_authorization'].includes(error.stage)
      ? 'current_membership'
      : 'source'
  if (error instanceof StorageUnavailable) return 'storage'
  if (error instanceof BodyProviderUnavailableError) return 'body_provider'
  return undefined
}
function positiveInteger(value: unknown): value is JsonNumber {
  return (
    isNonNegativeJsonInteger(value) && ExactDecimal.from(value).compare(ExactDecimal.from(0)) > 0
  )
}
function historyCapability(value: unknown, category: unknown): boolean {
  return (
    object(value) &&
    value.category === category &&
    'ok' in getAssetJudge().judgeAssetValue('CapabilityId', value)
  )
}
export function registryHistoryRequest(value: unknown): RegistryHistoryRequest | undefined {
  const copy = json(value)
  if (
    !object(copy) ||
    Object.keys(copy).length !== 7 ||
    !('ok' in parseOpaqueIdentifier(copy.session, 'SessionRef')) ||
    !categories.some(category => category === copy.category) ||
    !('ok' in instantFromEpochMs(copy.filledAt)) ||
    !historyCapability(copy.capability, copy.category) ||
    !('ok' in getAssetJudge().judgeAssetValue('AssetRecordId', copy.asset)) ||
    !positiveInteger(copy.version)
  )
    return undefined
  const tenant = parseTenantId(copy.tenant)
  if (!('ok' in tenant)) return undefined
  return Object.freeze({ ...copy, tenant: tenant.ok }) as unknown as RegistryHistoryRequest
}
function binding(
  value: unknown,
  requested: RegistryHistoryRequest,
): { readonly seq: JsonNumber; readonly ref: string } {
  const record = json(value)
  if (
    !object(record) ||
    record.session !== requested.session ||
    !positiveInteger(record.seq) ||
    !('ok' in parseOpaqueIdentifier(record.evaluationRef, 'EvaluationRef')) ||
    !object(record.evaluation) ||
    !object(record.tables)
  )
    throw new HistoryUnavailable('history_binding')
  validateEvaluationBinding(record.evaluation, record.evaluationRef)
  validateComposition(record.tables[requested.category], requested)
  return { seq: record.seq, ref: record.evaluationRef as string }
}
function validateEvaluationBinding(evaluation: JsonObject, ref: unknown): void {
  if (evaluation.kind === 'mint') {
    if (Object.keys(evaluation).length !== 1) throw new HistoryUnavailable('history_binding')
    return
  }
  if (
    (evaluation.kind !== 'given' && evaluation.kind !== 'reuse') ||
    Object.keys(evaluation).length !== 2 ||
    evaluation.ref !== ref
  )
    throw new HistoryUnavailable('history_binding')
}
function validateComposition(table: unknown, requested: RegistryHistoryRequest): void {
  if (
    !object(table) ||
    Object.keys(table).length !== 2 ||
    table.filledAt !== requested.filledAt ||
    !Array.isArray(table.composition)
  )
    throw new HistoryUnavailable('history_binding')
  const matches = table.composition.filter(entry => compositionMatches(entry, requested))
  if (matches.length !== 1) throw new HistoryUnavailable('history_binding')
}
function compositionMatches(entry: unknown, requested: RegistryHistoryRequest): boolean {
  if (
    !object(entry) ||
    !('ok' in getAssetJudge().judgeAssetValue('CapabilityId', entry.capability)) ||
    !('ok' in getAssetJudge().judgeAssetValue('AssetRecordId', entry.asset)) ||
    !positiveInteger(entry.version)
  )
    throw new HistoryUnavailable('history_binding')
  return (
    equal(entry.capability, requested.capability) &&
    entry.asset === requested.asset &&
    equal(entry.version, requested.version)
  )
}
class HistoryUnavailable extends Error {
  constructor(readonly stage: RegistryHistoryStage) {
    super('registry history source unavailable')
  }
}
type HistoryStorage = Omit<RegistryHistoryDependencies, 'memberships'>
function hasHistorySources(dependencies: HistoryStorage): boolean {
  return (
    typeof dependencies.storage?.atomic === 'function' &&
    typeof dependencies.storeKey === 'string' &&
    dependencies.storeKey !== '' &&
    dependencies.storeKey.trim() === dependencies.storeKey &&
    typeof dependencies.sessionTenancy?.holdingTenant === 'function' &&
    typeof dependencies.manifestHistory?.readHistory === 'function'
  )
}
function own(dependencies: HistoryStorage): HistoryStorage {
  if (
    dependencies === null ||
    typeof dependencies !== 'object' ||
    !hasHistorySources(dependencies) ||
    typeof dependencies.diagnostics !== 'function' ||
    typeof dependencies.onDiagnosticFailure !== 'function' ||
    typeof dependencies.monotonicNow !== 'function'
  )
    throw new TypeError(
      'registry history requires explicit bound source, facts, diagnostics and measurement ports',
    )
  // Capture this instance's actual borrowed methods, including their receivers.
  return Object.freeze({
    ...dependencies,
    sessionTenancy: Object.freeze({
      holdingTenant: dependencies.sessionTenancy.holdingTenant.bind(dependencies.sessionTenancy),
    }),
    manifestHistory: Object.freeze({
      readHistory: dependencies.manifestHistory.readHistory.bind(dependencies.manifestHistory),
    }),
  })
}
function emit(deps: HistoryStorage, event: unknown): void {
  const value = json(event)
  if (!object(value)) throw new TypeError('registry history diagnostic is not a strict object')
  try {
    deps.diagnostics(value)
  } catch {
    try {
      deps.onDiagnosticFailure('registry_history')
    } catch {
      /* The app records independent degradation before its fallible output. */
    }
  }
}

function historyMetadata(
  row: { readonly asset_id: string; readonly metadata: string },
  requested: RegistryHistoryRequest,
): JsonObject {
  const metadata = parsed(row.metadata, 'history_metadata')
  if (
    !object(metadata) ||
    metadata.id !== requested.asset ||
    row.asset_id !== requested.asset ||
    !equal(metadata.capability, requested.capability) ||
    Object.hasOwn(metadata, 'versions') ||
    Object.hasOwn(metadata, 'draft')
  )
    throw new HistoryUnavailable('source')
  return metadata
}
async function historyOrigin(
  deps: HistoryStorage,
  requested: RegistryHistoryRequest,
  measurements: Record<string, JsonValue>,
) {
  const sttStart = deps.monotonicNow()
  const holding = await deps.sessionTenancy.holdingTenant(requested.session)
  measurements.sttNanos = (deps.monotonicNow() - sttStart).toString()
  if (!('tenant' in holding) || !tenantIdEquals(holding.tenant, requested.tenant))
    throw new HistoryUnavailable('session_tenancy')
  const manifestStart = deps.monotonicNow()
  const historical = await deps.manifestHistory.readHistory(
    requested.session,
    requested.category,
    requested.filledAt,
  )
  measurements.manifestNanos = (deps.monotonicNow() - manifestStart).toString()
  if (!('record' in historical)) throw new HistoryUnavailable('manifest')
  return binding(historical.record, requested)
}
function historicalVersion(
  snapshot: {
    readonly metadata: { readonly asset_id: string; readonly metadata: string }
    readonly rows: { readonly version_position: string; readonly version: string }[]
  },
  requested: RegistryHistoryRequest,
) {
  const metadata = historyMetadata(snapshot.metadata, requested)
  orderVersions(snapshot.rows)
  const definition = json({
    ...metadata,
    versions: snapshot.rows.map(row => parsed(row.version, 'history_version')),
  })
  if (!('ok' in getAssetJudge().judgeAssetValue('AssetDefinition', definition)))
    throw new HistoryUnavailable('source')
  const asset = definition as unknown as AssetDefinition
  const versions = asset.versions.filter(version => equal(version.number, requested.version))
  if (versions.length !== 1 || versions[0]?.content.category !== requested.category)
    throw new HistoryUnavailable('source')
  const selected = versions[0]
  if (selected === undefined) throw new Error('validated historical version disappeared')
  return selected
}

/** D080's restricted standalone reader. It neither evaluates nor repairs current inputs. */
export function createRegistryHistoryReaderWithUnit(
  dependencies: HistoryStorage,
  readUnit: RegistryReadUnit,
): RegistryHistoryReader {
  const deps = own(dependencies)
  let stopped = false,
    active = 0
  let closing: Promise<void> | undefined, drained: (() => void) | undefined
  return Object.freeze({
    async read(value: unknown): Promise<RegistryHistoryResult> {
      const requested = registryHistoryRequest(value)
      if (requested === undefined) return { failure: 'invalidInput' }
      if (stopped) return { failure: 'unavailable', stage: 'stopped' }
      const start = deps.monotonicNow()
      active++
      const measurements: Record<string, JsonValue> = {}
      const diagnostics = (
        result: 'version' | 'unavailable' | 'defect',
        failedStage?: RegistryHistoryStage,
      ) => {
        emit(deps, {
          kind: 'registry_history_read',
          session: requested.session,
          tenant: requested.tenant,
          category: requested.category,
          filledAt: requested.filledAt,
          asset: requested.asset,
          version: requested.version,
          result,
          ...(failedStage === undefined ? {} : { stage: failedStage }),
          ...measurements,
          totalNanos: (deps.monotonicNow() - start).toString(),
          evaluationCount: 0,
          selectorCount: 0,
          resourceEnded: true,
        })
      }
      try {
        const origin = await historyOrigin(deps, requested, measurements)
        measurements.manifestSeq = origin.seq
        measurements.manifestRef = origin.ref
        const waiting = deps.monotonicNow()
        let acquired: bigint | undefined
        const snapshot = await readUnit(requested, async unit => {
          acquired = deps.monotonicNow()
          return unit.run(() =>
            unit.query(async tx => {
              const db = narrow<SourceDb>(tx)
              const metadata = await db
                .selectFrom('evaluation_input_asset')
                .select(['asset_id', 'metadata'])
                .where('store_key', '=', deps.storeKey)
                .where('asset_id', '=', requested.asset)
                .executeTakeFirst()
              if (metadata === undefined) throw new HistoryUnavailable('source')
              const rows = await db
                .selectFrom('evaluation_input_version')
                .select(['version_position', 'version'])
                .where('store_key', '=', deps.storeKey)
                .where('asset_id', '=', requested.asset)
                .execute()
              return { metadata, rows }
            }),
          )
        })
        const released = deps.monotonicNow()
        if (acquired === undefined) throw new Error('registry history atomic did not acquire')
        measurements.queueNanos = (acquired - waiting).toString()
        measurements.holdNanos = (released - acquired).toString()
        const pureStart = deps.monotonicNow()
        const selected = historicalVersion(snapshot, requested)
        measurements.versions = snapshot.rows.length
        measurements.bodyBytes = snapshot.rows.reduce(
          (sum, row) => sum + Buffer.byteLength(row.version),
          0,
        )
        measurements.pureNanos = (deps.monotonicNow() - pureStart).toString()
        diagnostics('version')
        return { version: selected }
      } catch (error) {
        const stage = historyFailureStage(error)
        if (stage === undefined) {
          diagnostics('defect')
          throw error
        }
        diagnostics('unavailable', stage)
        return { failure: 'unavailable', stage }
      } finally {
        active--
        if (stopped && active === 0) drained?.()
      }
    },
    close(): Promise<void> {
      if (closing !== undefined) return closing
      stopped = true
      closing =
        active === 0
          ? Promise.resolve()
          : new Promise<void>(resolve => {
              drained = resolve
            })
      return closing
    },
  })
}
