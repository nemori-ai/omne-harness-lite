import {
  checkManifestAppendInput,
  readEvaluationProjection,
  type AssemblyManifestService,
  type ManifestRecord,
} from '@omne-harness-lite/assembly-manifest-store'
import type { EffectiveAssembly, EffectiveAsset } from '@omne-harness-lite/asset-evaluation'
import {
  capabilityIdEquals,
  copyJsonValue,
  isJsonNumber,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import type { RegistryHistoryReader } from '@omne-harness-lite/evaluation-input-store/registry-history'
import {
  parseOpaqueIdentifier,
  parseTenantId,
  tenantIdEquals,
} from '@omne-harness-lite/identity-values'
import {
  judgeDefinition,
  type LoopExtensionDefinition,
  type Power,
} from '@omne-harness-lite/loop-extension'
import { modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime-local'
import type { SessionTenancyService } from '@omne-harness-lite/session-tenancy-table'
import type { RunnerPiece } from './run-pass.ts'
import type { RunnerLogBinding } from './task-owner.ts'
import type { RunnerReplayFailure } from './pass-history.ts'

/** Borrowed, captured providers. The caller owns authorization, generation checks and closure. */
export interface RunnerChainSources {
  readonly sessionTenancy: SessionTenancyService
  readonly manifest: Pick<AssemblyManifestService, 'readHead' | 'dependencyPresence'>
  readonly history: Pick<RegistryHistoryReader, 'read'>
  readonly isActive: () => boolean
}
export interface ReadRunnerChainInput {
  readonly session: string
  readonly binding: RunnerLogBinding
  readonly sources: RunnerChainSources
}
const unavailable = Object.freeze({ failure: 'unavailable' } as const)
const manifestMissing = Object.freeze({ failure: 'manifestMissing' } as const)
function object(value: JsonValue | undefined): value is JsonObject {
  return (
    value !== undefined &&
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !isJsonNumber(value)
  )
}
function closed(value: JsonObject, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
}
function producer(record: ManifestRecord, content: JsonObject): boolean {
  const by = content.filledBy
  if (!object(by)) return false
  switch (record.evaluation.kind) {
    case 'given':
      return closed(by, ['kind']) && by.kind === 'assembly'
    case 'mint':
      return (
        closed(by, ['kind', 'command']) &&
        by.kind === 'reload' &&
        by.command === 'omne-official:reload-loop_extension'
      )
    case 'reuse':
      return (
        closed(by, ['kind']) &&
        (by.kind === 'auto_refresh_after_failure' || by.kind === 'asset_change')
      )
  }
}
interface ProjectedChain {
  readonly record: ManifestRecord
  readonly evaluation: EffectiveAssembly
  readonly assets: readonly EffectiveAsset[]
}
function validManifestRecord(record: ManifestRecord, head: number, session: string): boolean {
  if (
    'failed' in copyJsonValue(record) ||
    record.session !== session ||
    !Number.isSafeInteger(record.seq) ||
    record.seq < 1 ||
    record.seq > head ||
    !('ok' in parseOpaqueIdentifier(record.evaluationRef, 'EvaluationRef'))
  )
    return false
  return true
}

function projectionContent(content: JsonValue): content is JsonObject {
  return object(content) && closed(content, ['evaluation', 'compositionOrder', 'filledBy'])
}

/** Only the selected category is projected; other categories retain their own producer rules. */
function project(
  record: ManifestRecord,
  head: number,
  session: string,
): ProjectedChain | undefined {
  if (!validManifestRecord(record, head, session)) return undefined
  const checked = checkManifestAppendInput(session, head, {
    evaluation: record.evaluation,
    tables: record.tables,
    content: record.content,
  })
  if ('failure' in checked) return undefined
  const owned = checked.ok.record
  if (
    (owned.evaluation.kind !== 'mint' && owned.evaluation.ref !== record.evaluationRef) ||
    !projectionContent(owned.content)
  )
    return undefined
  const projection = categoryProjection(record, owned.content)
  if (projection === undefined) return undefined
  const table = owned.tables.loop_extension
  if (!table || !Array.isArray(table.composition)) return undefined
  const expected = expectedAssets(projection.compositionOrder, projection.evaluation)
  if (expected === undefined) return undefined
  const selected = selectAssets(table.composition, expected, owned.evaluation.kind)
  if (selected === undefined) return undefined
  return {
    record: Object.freeze({
      ...owned,
      session: record.session,
      seq: record.seq,
      evaluationRef: record.evaluationRef,
    }),
    evaluation: projection.evaluation,
    assets: Object.freeze(selected),
  }
}
function categoryProjection(record: ManifestRecord, content: JsonObject) {
  const projection = readEvaluationProjection(content)
  if (
    'failure' in projection ||
    projection.ok.evaluation.unresolved.length !== 0 ||
    !producer(record, content)
  )
    return undefined
  return projection.ok
}

function expectedAssets(
  order: readonly EffectiveAsset['capability'][],
  evaluation: EffectiveAssembly,
): readonly EffectiveAsset[] | undefined {
  const expected: EffectiveAsset[] = []
  for (const capability of order) {
    if (capability.category !== 'loop_extension') continue
    const asset = evaluation.assets.find(item => capabilityIdEquals(item.capability, capability))
    if (!asset) return undefined
    expected.push(asset)
  }
  return expected
}

function selectAssets(
  table: readonly JsonValue[],
  expected: readonly EffectiveAsset[],
  evaluationKind: ManifestRecord['evaluation']['kind'],
): EffectiveAsset[] | undefined {
  let cursor = 0
  const selected: EffectiveAsset[] = []
  for (const tuple of table) {
    if (!object(tuple) || !closed(tuple, ['capability', 'asset', 'version', 'from']))
      return undefined
    let found: EffectiveAsset | undefined
    while (cursor < expected.length) {
      const item = expected[cursor++]
      if (
        item &&
        modelLogJsonEqual(tuple, {
          capability: item.capability,
          asset: item.asset,
          version: item.version,
          from: item.from,
        })
      ) {
        found = item
        break
      }
      if (evaluationKind !== 'reuse') return undefined
    }
    if (!found) return undefined
    selected.push(found)
  }
  if (evaluationKind !== 'reuse' && selected.length !== expected.length) return undefined
  return selected
}

function evaluatedPower(powerValue: JsonValue | undefined, limit: Power): Power | undefined {
  const levels: readonly Power[] = ['observe', 'rewrite', 'veto']
  if (
    !object(powerValue) ||
    !closed(powerValue, ['allowed']) ||
    !Array.isArray(powerValue.allowed) ||
    powerValue.allowed.length === 0
  )
    return undefined
  let power: Power = 'observe'
  const seen = new Set<string>()
  for (const allowed of powerValue.allowed) {
    if (allowed !== 'observe' && allowed !== 'rewrite' && allowed !== 'veto') return undefined
    if (seen.has(allowed) || levels.indexOf(allowed) > levels.indexOf(limit)) return undefined
    seen.add(allowed)
    if (levels.indexOf(allowed) > levels.indexOf(power)) power = allowed
  }
  return power
}

function evaluatedDefinition(
  body: LoopExtensionDefinition,
  asset: EffectiveAsset,
  positionValue: JsonValue | undefined,
  dimensionValues: readonly { readonly value: JsonValue }[],
): LoopExtensionDefinition | undefined {
  const position = positionValue
  const dimensional = body.position === 'after_model_call' || body.position === 'after_action'
  if (
    (dimensional && (position !== body.position || dimensionValues.length !== 1)) ||
    (!dimensional &&
      (position === 'after_model_call' ||
        position === 'after_action' ||
        dimensionValues.length !== 0))
  )
    return undefined
  const definition = judgeDefinition({
    ...body,
    position,
    ...(dimensional ? { dimension: dimensionValues[0]?.value } : {}),
  })
  if ('rejected' in definition || definition.ok.name !== asset.capability.name) return undefined
  return definition.ok
}

function piece(
  body: LoopExtensionDefinition,
  asset: EffectiveAsset,
  evaluation: EffectiveAssembly,
): RunnerPiece | undefined {
  const values = evaluation.values.filter(item =>
    capabilityIdEquals(item.capability, asset.capability),
  )
  const positions = values.filter(item => item.item === 'position')
  const dimensions = values.filter(item => item.item === 'dimension')
  const powers = values.filter(item => item.item === 'power')
  if (positions.length !== 1 || powers.length !== 1) return undefined
  const power = evaluatedPower(powers[0]?.value, body.power)
  if (power === undefined) return undefined
  const definition = evaluatedDefinition(body, asset, positions[0]?.value, dimensions)
  if (definition === undefined) return undefined
  const fallback =
    asset.capability.name === 'omne-official:default-retry'
      ? 'retry'
      : asset.capability.name === 'omne-official:admission-judgment'
        ? 'admission'
        : asset.capability.name === 'omne-official:offload-judgment'
          ? 'offload'
          : undefined
  return Object.freeze({
    definition,
    power,
    ...(body.onError === undefined ? {} : { onError: body.onError }),
    ...(fallback === undefined ? {} : { fallback }),
  })
}

function validChainBinding(session: string, binding: RunnerLogBinding): boolean {
  return !(
    !('ok' in parseOpaqueIdentifier(session, 'SessionRef')) ||
    !binding ||
    !('ok' in parseOpaqueIdentifier(binding.session, 'SessionRef')) ||
    !('ok' in parseOpaqueIdentifier(binding.logGeneration, 'LogGeneration')) ||
    !('ok' in parseTenantId(binding.tenant))
  )
}

/** Read one current category record and its exact immutable versions, without re-evaluation. */
export async function readRunnerChain(
  input: ReadRunnerChainInput,
): Promise<readonly RunnerPiece[] | RunnerReplayFailure> {
  const { session, binding, sources } = input
  if (!validChainBinding(session, binding)) return { failure: 'invalidInput' }
  if (session !== binding.session) return manifestMissing
  // Capture methods as well as receivers before any suspension. Never stitch replacement sources.
  const holdingTenant = sources.sessionTenancy.holdingTenant.bind(sources.sessionTenancy)
  const readHead = sources.manifest.readHead.bind(sources.manifest)
  const readVersion = sources.history.read.bind(sources.history)
  const active = sources.isActive
  if (!active()) return unavailable
  const holding = await holdingTenant(session)
  if (!active()) return unavailable
  if ('failure' in holding)
    return holding.failure === 'sessionNotFound' ? manifestMissing : unavailable
  if (!tenantIdEquals(holding.tenant, binding.tenant)) return unavailable
  const head = await readHead(session)
  if (!active()) return unavailable
  if ('failure' in head || !Number.isSafeInteger(head.head) || head.head < 0) return unavailable
  if (head.head === 0) return manifestMissing
  const record = head.latest.loop_extension
  if (!record) return unavailable
  const projected = project(record, head.head, session)
  if (!projected) return unavailable
  const chain: RunnerPiece[] = []
  for (const asset of projected.assets) {
    const version = await readVersion({
      session,
      tenant: binding.tenant,
      category: 'loop_extension',
      filledAt: projected.record.tables.loop_extension?.filledAt,
      capability: asset.capability,
      asset: asset.asset,
      version: asset.version,
    })
    if (!active()) return unavailable
    const item = versionPiece(version, asset, projected.evaluation)
    if (item === undefined) return unavailable
    chain.push(item)
  }
  return Object.freeze(chain)
}

function versionPiece(
  version: Awaited<ReturnType<RegistryHistoryReader['read']>>,
  asset: EffectiveAsset,
  evaluation: EffectiveAssembly,
): RunnerPiece | undefined {
  if (
    'failure' in version ||
    !modelLogJsonEqual(version.version.number, asset.version) ||
    version.version.content.category !== 'loop_extension'
  )
    return undefined
  const definition = judgeDefinition(version.version.content.extension)
  if ('rejected' in definition) return undefined
  const item = piece(definition.ok, asset, evaluation)
  if (!item) return undefined
  return item
}
