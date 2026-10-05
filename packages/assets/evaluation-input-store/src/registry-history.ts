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
function positiveInteger(value: unknown): value is JsonNumber {
  return (
    isNonNegativeJsonInteger(value) && ExactDecimal.from(value).compare(ExactDecimal.from(0)) > 0
  )
}
function request(value: unknown): RegistryHistoryRequest | undefined {
  const copy = json(value)
  if (
    !object(copy) ||
    Object.keys(copy).length !== 7 ||
    !('ok' in parseOpaqueIdentifier(copy.session, 'SessionRef')) ||
    !categories.some(category => category === copy.category) ||
    !('ok' in instantFromEpochMs(copy.filledAt)) ||
    !('ok' in getAssetJudge().judgeAssetValue('CapabilityId', copy.capability)) ||
    !object(copy.capability) ||
    copy.capability.category !== copy.category ||
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
  const evaluation = record.evaluation
  if (evaluation.kind === 'mint') {
    if (Object.keys(evaluation).length !== 1) throw new HistoryUnavailable('history_binding')
  } else if (
    (evaluation.kind !== 'given' && evaluation.kind !== 'reuse') ||
    Object.keys(evaluation).length !== 2 ||
    evaluation.ref !== record.evaluationRef
  )
    throw new HistoryUnavailable('history_binding')
  const table = record.tables[requested.category]
  if (
    !object(table) ||
    Object.keys(table).length !== 2 ||
    table.filledAt !== requested.filledAt ||
    !Array.isArray(table.composition)
  )
    throw new HistoryUnavailable('history_binding')
  let matches = 0
  for (const entry of table.composition) {
    if (
      !object(entry) ||
      !('ok' in getAssetJudge().judgeAssetValue('CapabilityId', entry.capability)) ||
      !('ok' in getAssetJudge().judgeAssetValue('AssetRecordId', entry.asset)) ||
      !positiveInteger(entry.version)
    )
      throw new HistoryUnavailable('history_binding')
    if (
      equal(entry.capability, requested.capability) &&
      entry.asset === requested.asset &&
      equal(entry.version, requested.version)
    )
      matches++
  }
  if (matches !== 1) throw new HistoryUnavailable('history_binding')
  return { seq: record.seq, ref: record.evaluationRef as string }
}
class HistoryUnavailable extends Error {
  constructor(readonly stage: RegistryHistoryStage) {
    super('registry history source unavailable')
  }
}
function own(dependencies: RegistryHistoryDependencies): RegistryHistoryDependencies {
  if (
    dependencies === null ||
    typeof dependencies !== 'object' ||
    typeof dependencies.storage?.atomic !== 'function' ||
    typeof dependencies.storeKey !== 'string' ||
    dependencies.storeKey === '' ||
    dependencies.storeKey.trim() !== dependencies.storeKey ||
    typeof dependencies.sessionTenancy?.holdingTenant !== 'function' ||
    typeof dependencies.memberships?.participate !== 'function' ||
    typeof dependencies.manifestHistory?.readHistory !== 'function' ||
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
    memberships: Object.freeze({
      participate: dependencies.memberships.participate.bind(dependencies.memberships),
    }),
    manifestHistory: Object.freeze({
      readHistory: dependencies.manifestHistory.readHistory.bind(dependencies.manifestHistory),
    }),
  })
}
function emit(deps: RegistryHistoryDependencies, event: unknown): void {
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

/** D080's restricted standalone reader. It neither evaluates nor repairs current inputs. */
export function createRegistryHistoryReader(
  dependencies: RegistryHistoryDependencies,
): RegistryHistoryReader {
  const deps = own(dependencies)
  let stopped = false,
    active = 0
  let closing: Promise<void> | undefined, drained: (() => void) | undefined
  return Object.freeze({
    async read(value: unknown): Promise<RegistryHistoryResult> {
      const requested = request(value)
      if (requested === undefined) return { failure: 'invalidInput' }
      if (stopped) return { failure: 'unavailable', stage: 'stopped' }
      const start = deps.monotonicNow()
      active++
      let sttNanos: string | undefined,
        manifestNanos: string | undefined,
        queueNanos: string | undefined,
        holdNanos: string | undefined,
        pureNanos: string | undefined
      let origin: { readonly seq: JsonNumber; readonly ref: string } | undefined
      let versionCount: number | undefined, bodyBytes: number | undefined
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
          ...(origin === undefined ? {} : { manifestSeq: origin.seq, manifestRef: origin.ref }),
          ...(versionCount === undefined ? {} : { versions: versionCount }),
          ...(bodyBytes === undefined ? {} : { bodyBytes }),
          ...(sttNanos === undefined ? {} : { sttNanos }),
          ...(manifestNanos === undefined ? {} : { manifestNanos }),
          ...(queueNanos === undefined ? {} : { queueNanos }),
          ...(holdNanos === undefined ? {} : { holdNanos }),
          ...(pureNanos === undefined ? {} : { pureNanos }),
          totalNanos: (deps.monotonicNow() - start).toString(),
          evaluationCount: 0,
          selectorCount: 0,
          resourceEnded: true,
        })
      }
      try {
        const sttStart = deps.monotonicNow()
        const holding = await deps.sessionTenancy.holdingTenant(requested.session)
        sttNanos = (deps.monotonicNow() - sttStart).toString()
        if (!('tenant' in holding) || !tenantIdEquals(holding.tenant, requested.tenant))
          throw new HistoryUnavailable('session_tenancy')
        const manifestStart = deps.monotonicNow()
        const historical = await deps.manifestHistory.readHistory(
          requested.session,
          requested.category,
          requested.filledAt,
        )
        manifestNanos = (deps.monotonicNow() - manifestStart).toString()
        if (!('record' in historical)) throw new HistoryUnavailable('manifest')
        origin = binding(historical.record, requested)
        const waiting = deps.monotonicNow()
        let acquired: bigint | undefined
        const snapshot = await deps.storage.atomic(async unit => {
          // SqlStorage invokes atomic callbacks only after BEGIN IMMEDIATE is acquired.
          // This provider timing point is checked with the actual lock-contention test.
          acquired = deps.monotonicNow()
          const current = await deps.memberships.participate(unit).standing(requested.tenant)
          if (!('standing' in current) || current.standing !== 'effective')
            throw new HistoryUnavailable('current_membership')
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
        queueNanos = (acquired - waiting).toString()
        holdNanos = (released - acquired).toString()
        const pureStart = deps.monotonicNow()
        const metadata = parsed(snapshot.metadata.metadata, 'history_metadata')
        if (
          !object(metadata) ||
          metadata.id !== requested.asset ||
          snapshot.metadata.asset_id !== requested.asset ||
          !equal(metadata.capability, requested.capability) ||
          Object.hasOwn(metadata, 'versions') ||
          Object.hasOwn(metadata, 'draft')
        )
          throw new HistoryUnavailable('source')
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
        versionCount = snapshot.rows.length
        bodyBytes = snapshot.rows.reduce((sum, row) => sum + Buffer.byteLength(row.version), 0)
        pureNanos = (deps.monotonicNow() - pureStart).toString()
        diagnostics('version')
        return { version: selected }
      } catch (error) {
        const stage =
          error instanceof HistoryUnavailable
            ? error.stage
            : error instanceof SourceUnavailable
              ? 'source'
              : error instanceof StorageUnavailable
                ? 'storage'
                : error instanceof BodyProviderUnavailableError
                  ? 'body_provider'
                  : undefined
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
