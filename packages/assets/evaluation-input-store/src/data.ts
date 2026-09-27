import {
  createAssetModelJudge,
  capabilityCanonicalString,
  BodyProviderUnavailableError,
  type AssetDefinition,
  type AssetHolding,
  type HoldingScope,
  type AssetContent,
} from '@omne-harness-lite/asset-model'
import {
  defaultBodyContracts,
  evaluate,
  selectEvaluationRootSource,
  type EvaluationRootSource,
  type NonConnectorAssetDefinition,
  type NonConnectorEvaluationInput,
} from '@omne-harness-lite/asset-evaluation'
import {
  extractAgentDefinitionInputs,
  judgeAgentDefinitionBody,
} from '@omne-harness-lite/agent-definition'
import {
  copyJsonValue,
  readJsonStrict,
  writeJsonLossless,
  toOpaqueJson,
  readOpaqueJson,
  isJsonNumber,
  LosslessNumber,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  parseTenantId,
  parseMembershipStanding,
  tenantIdEquals,
  type MembershipStanding,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import { narrow, type ReadTx } from '@omne-harness-lite/storage'
import type { DeployedOfficialEntry, InputSourceDependencies, SourceDb } from './types.ts'

export const assetJudge = createAssetModelJudge(defaultBodyContracts)
export class SourceUnavailable extends Error {
  constructor(readonly stage: string) {
    super(`current evaluation input unavailable at ${stage}`)
  }
}
export function object(value: unknown): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}
export function json(value: unknown): JsonValue | undefined {
  const result = copyJsonValue(value)
  return 'ok' in result ? result.ok : undefined
}
export function text(value: unknown): string {
  const copied = json(value)
  if (copied === undefined) throw new TypeError('input source value is not JSON')
  return writeJsonLossless(copied)
}
export function parsed(value: string, stage: string): JsonValue {
  const result = readJsonStrict(value)
  if ('failed' in result) throw new SourceUnavailable(stage)
  return result.ok
}
export function equal(left: unknown, right: unknown): boolean {
  const a = json(left)
  const b = json(right)
  if (a === undefined || b === undefined) return false
  function compare(x: JsonValue, y: JsonValue): boolean {
    if (x === y) return true
    if (isJsonNumber(x) && isJsonNumber(y))
      return ExactDecimal.from(x).compare(ExactDecimal.from(y)) === 0
    if (Array.isArray(x) && Array.isArray(y))
      return (
        x.length === y.length &&
        x.every((item, index) => {
          const other = y[index]
          return other !== undefined && compare(item, other)
        })
      )
    return (
      object(x) &&
      object(y) &&
      Object.keys(x).length === Object.keys(y).length &&
      Object.entries(x).every(
        ([key, value]) => Object.hasOwn(y, key) && y[key] !== undefined && compare(value, y[key]),
      )
    )
  }
  return compare(a, b)
}
export function scopeKey(holder: HoldingScope): string {
  if (holder.layer === 'factory') return 'factory'
  if (holder.layer === 'organization') return holder.organization
  if (holder.layer === 'tenant') return text(holder.tenant)
  throw new SourceUnavailable('workspace_source')
}
function content(value: AssetContent): AssetContent {
  return value.category === 'agent_definition'
    ? { ...value, body: toOpaqueJson(json(value.body) ?? null) }
    : value
}
export function definition(value: unknown): NonConnectorAssetDefinition {
  if (!('ok' in assetJudge.judgeAssetValue('AssetDefinition', value)))
    throw new SourceUnavailable('asset_definition')
  const wire = json(value) as unknown as AssetDefinition
  if (wire.capability.category === 'connector') throw new SourceUnavailable('connector_body')
  for (const version of wire.versions)
    if (
      version.content.category === 'agent_definition' &&
      !('ok' in judgeAgentDefinitionBody(json(version.content.body) ?? null))
    )
      throw new SourceUnavailable('agent_definition_body')
  return Object.freeze({
    ...wire,
    ...(wire.draft === undefined ? {} : { draft: content(wire.draft) }),
    versions: Object.freeze(
      wire.versions.map(version =>
        Object.freeze({ ...version, content: content(version.content) }),
      ),
    ),
  }) as NonConnectorAssetDefinition
}
/** Physical sequence positions are private SQL coordinates, not floating point versions. */
export function orderVersions<T extends { readonly version_position: string }>(rows: T[]): T[] {
  if (rows.some(row => !/^[1-9][0-9]*$/u.test(row.version_position)))
    throw new SourceUnavailable('version_position')
  rows.sort((a, b) => {
    const left = BigInt(a.version_position)
    const right = BigInt(b.version_position)
    return left < right ? -1 : left > right ? 1 : 0
  })
  if (rows.some((row, index) => BigInt(row.version_position) !== BigInt(index + 1)))
    throw new SourceUnavailable('version_position')
  return rows
}
export function decodeHoldings(value: unknown, holder: HoldingScope): readonly AssetHolding[] {
  if (!Array.isArray(value)) throw new SourceUnavailable('scope_shape')
  const seen = new Set<string>()
  for (const item of value) {
    if (!('ok' in assetJudge.judgeAssetValue('AssetHolding', item)))
      throw new SourceUnavailable('holding')
    const holding = item as AssetHolding
    const key = capabilityCanonicalString(holding.capability)
    if (!equal(holding.holder, holder) || seen.has(key))
      throw new SourceUnavailable('holding_scope')
    seen.add(key)
  }
  return value as readonly AssetHolding[]
}
export function emit(deps: InputSourceDependencies, event: unknown): void {
  const value = json(event)
  if (!object(value)) throw new TypeError('source diagnostic is not a JSON object')
  try {
    deps.diagnostics(value)
  } catch {
    deps.onDiagnosticFailure('current_evaluation_inputs')
  }
}
export function checkDependencies(deps: InputSourceDependencies): void {
  if (
    typeof deps.storage.atomic !== 'function' ||
    typeof deps.storeKey !== 'string' ||
    deps.storeKey.trim() !== deps.storeKey ||
    deps.storeKey === ''
  )
    throw new TypeError(
      'current evaluation input source requires an explicit AtomicStorage and store key',
    )
  const seen = new Set<string>()
  if (!Array.isArray(deps.deployedOfficial))
    throw new TypeError('invalid deployed official manifest')
  for (const entry of deps.deployedOfficial) {
    if (
      !object(entry) ||
      Object.keys(entry).length !== 2 ||
      typeof entry.meta !== 'boolean' ||
      !('ok' in assetJudge.judgeAssetValue('CapabilityId', entry.capability))
    )
      throw new TypeError('invalid deployed official manifest')
    const key = capabilityCanonicalString(
      entry.capability as unknown as DeployedOfficialEntry['capability'],
    )
    if (seen.has(key)) throw new TypeError('duplicate deployed official manifest member')
    seen.add(key)
  }
  if (
    typeof deps.diagnostics !== 'function' ||
    typeof deps.onDiagnosticFailure !== 'function' ||
    typeof deps.monotonicNow !== 'function'
  )
    throw new TypeError('input source requires explicit diagnostics and measurement ports')
}
export function ownDependencies(deps: InputSourceDependencies): InputSourceDependencies {
  checkDependencies(deps)
  const deployedOfficial = json(deps.deployedOfficial)
  if (!Array.isArray(deployedOfficial)) throw new TypeError('invalid deployed official manifest')
  return Object.freeze({
    ...deps,
    deployedOfficial: deployedOfficial as unknown as readonly DeployedOfficialEntry[],
  })
}
export function deploymentEquals(
  value: unknown,
  expected: readonly DeployedOfficialEntry[],
): boolean {
  if (!Array.isArray(value) || value.length !== expected.length) return false
  const seen = new Set<string>()
  return value.every(entry => {
    if (
      !object(entry) ||
      Object.keys(entry).length !== 2 ||
      typeof entry.meta !== 'boolean' ||
      !('ok' in assetJudge.judgeAssetValue('CapabilityId', entry.capability))
    )
      return false
    const key = capabilityCanonicalString(
      entry.capability as unknown as DeployedOfficialEntry['capability'],
    )
    if (seen.has(key)) return false
    seen.add(key)
    return expected.some(
      item => equal(item.capability, entry.capability) && item.meta === entry.meta,
    )
  })
}
export function factoryMatches(
  holdings: readonly AssetHolding[],
  expected: readonly DeployedOfficialEntry[],
): boolean {
  return (
    holdings.length === expected.length &&
    expected.every(entry =>
      holdings.some(
        holding => equal(holding.capability, entry.capability) && holding.immutable === entry.meta,
      ),
    )
  )
}
export interface Recipe {
  readonly tenant: TenantId
  readonly standing: MembershipStanding
  readonly rootDefinition: NonConnectorEvaluationInput['root']['definition']
  readonly session?: NonConnectorEvaluationInput['session']
  readonly workspace?: NonConnectorEvaluationInput['workspace']
}
export function recipeFromRow(row: SourceDb['evaluation_input_recipe']): Recipe {
  const tenant = parseTenantId(parsed(row.tenant, 'recipe_tenant'))
  const standing = parseMembershipStanding(parsed(row.standing_at_creation, 'recipe_standing'))
  const root = parsed(row.root_definition, 'recipe_root')
  if (
    !('ok' in tenant) ||
    !('ok' in standing) ||
    standing.ok.standing !== 'effective' ||
    !('ok' in assetJudge.judgeAssetValue('CapabilityId', root)) ||
    !object(root) ||
    root.category !== 'agent_definition'
  )
    throw new SourceUnavailable('recipe')
  const session =
    row.session_assignments === null
      ? undefined
      : parsed(row.session_assignments, 'recipe_assignments')
  if (session !== undefined && !Array.isArray(session))
    throw new SourceUnavailable('recipe_assignments')
  const workspace = row.workspace === null ? undefined : parsed(row.workspace, 'recipe_workspace')
  if (workspace !== undefined && !('ok' in assetJudge.judgeAssetValue('WorkspaceKey', workspace)))
    throw new SourceUnavailable('recipe_workspace')
  return {
    tenant: tenant.ok,
    standing: standing.ok,
    rootDefinition: root as unknown as Recipe['rootDefinition'],
    ...(session === undefined ? {} : { session: session as NonNullable<Recipe['session']> }),
    ...(workspace === undefined
      ? {}
      : { workspace: workspace as unknown as NonNullable<Recipe['workspace']> }),
  }
}
export interface SourceSnapshot {
  readonly recipe: Recipe
  readonly revision: string
  readonly holdings: readonly AssetHolding[]
  readonly definitions: readonly NonConnectorAssetDefinition[]
  readonly versions: number
  readonly bodyBytes: number
  readonly fixedRoot?: NonConnectorAssetDefinition['versions'][number]
}
export async function readSourceSnapshot(
  tx: ReadTx,
  deps: InputSourceDependencies,
  recipe: Recipe,
  fixedSource?: EvaluationRootSource,
): Promise<SourceSnapshot> {
  if (recipe.workspace !== undefined) throw new SourceUnavailable('workspace_source')
  const db = narrow<SourceDb>(tx)
  const head = await db
    .selectFrom('evaluation_input_head')
    .selectAll()
    .where('store_key', '=', deps.storeKey)
    .executeTakeFirst()
  if (
    head === undefined ||
    !/^[1-9][0-9]*$/u.test(head.revision) ||
    !deploymentEquals(parsed(head.factory_manifest, 'factory_manifest'), deps.deployedOfficial)
  )
    throw new SourceUnavailable('source_head')
  const holders: HoldingScope[] = [
    { layer: 'factory' },
    { layer: 'organization', organization: recipe.tenant.organization },
    { layer: 'tenant', tenant: recipe.tenant },
  ]
  const holdings: AssetHolding[] = []
  for (const holder of holders) {
    const row = await db
      .selectFrom('evaluation_input_scope')
      .select('holdings')
      .where('store_key', '=', deps.storeKey)
      .where('layer', '=', holder.layer)
      .where('scope_key', '=', scopeKey(holder))
      .executeTakeFirst()
    if (row === undefined) throw new SourceUnavailable('scope_missing')
    const value = parsed(row.holdings, 'scope_json')
    for (const item of decodeHoldings(value, holder)) {
      if (item.basis.kind === 'shared' || item.basis.kind === 'carrier')
        throw new SourceUnavailable('unsupported_entitlement')
      holdings.push(item)
    }
  }
  if (
    !factoryMatches(
      holdings.filter(holding => holding.holder.layer === 'factory'),
      deps.deployedOfficial,
    )
  )
    throw new SourceUnavailable('factory_manifest')
  const definitions: NonConnectorAssetDefinition[] = []
  let bodyBytes = 0
  let versions = 0
  const requestedIds = new Set(holdings.map(holding => holding.asset))
  if (fixedSource !== undefined) requestedIds.add(fixedSource.asset)
  for (const id of requestedIds) {
    const metadata = await db
      .selectFrom('evaluation_input_asset')
      .selectAll()
      .where('store_key', '=', deps.storeKey)
      .where('asset_id', '=', id)
      .executeTakeFirst()
    if (metadata === undefined) throw new SourceUnavailable('definition_missing')
    const rows = await db
      .selectFrom('evaluation_input_version')
      .select(['version_position', 'version'])
      .where('store_key', '=', deps.storeKey)
      .where('asset_id', '=', id)
      .execute()
    orderVersions(rows)
    const info = parsed(metadata.metadata, 'definition_metadata')
    if (!object(info)) throw new SourceUnavailable('definition_metadata')
    definitions.push(
      definition({
        ...info,
        ...(metadata.draft === null ? {} : { draft: parsed(metadata.draft, 'draft') }),
        versions: rows.map(row => parsed(row.version, 'version')),
      }),
    )
    versions += rows.length
    bodyBytes += rows.reduce((sum, row) => sum + Buffer.byteLength(row.version), 0)
  }
  const retained: AssetHolding[] = []
  for (const holding of holdings) {
    const asset = definitions.find(item => item.id === holding.asset)
    if (asset === undefined) throw new SourceUnavailable('definition_missing')
    if (
      !equal(asset.capability, holding.capability) ||
      (holding.basis.kind === 'official') !== (asset.origin === 'official')
    )
      throw new SourceUnavailable('holding_definition')
    if (
      holding.versionSelection.kind === 'pinned' &&
      !asset.versions.some(version =>
        equal(
          version.number,
          holding.versionSelection.kind === 'pinned' ? holding.versionSelection.number : null,
        ),
      )
    )
      throw new SourceUnavailable('pinned_version')
    if (
      holding.basis.kind === 'owned' &&
      (asset.origin !== 'customized' ||
        (holding.holder.layer === 'organization'
          ? asset.owner.kind !== 'organization' ||
            asset.owner.organization !== holding.holder.organization
          : holding.holder.layer !== 'tenant' ||
            asset.owner.kind !== 'tenant' ||
            !tenantIdEquals(asset.owner.tenant, holding.holder.tenant)))
    )
      throw new SourceUnavailable('ownership')
    if (
      holding.basis.kind === 'organization' &&
      asset.origin === 'customized' &&
      !(
        asset.owner.kind === 'organization' &&
        asset.owner.organization === recipe.tenant.organization
      )
    ) {
      const outer = holdings.find(
        item => item.holder.layer === 'organization' && item.asset === holding.asset,
      )
      if (outer === undefined) continue
      if (outer.basis.kind !== 'owned') throw new SourceUnavailable('outer_entitlement')
    }
    retained.push(holding)
  }
  const ids = new Set(retained.map(holding => holding.asset))
  let fixedRoot: SourceSnapshot['fixedRoot']
  if (fixedSource !== undefined) {
    const original = definitions.find(item => item.id === fixedSource.asset)
    if (original === undefined || !equal(original.capability, recipe.rootDefinition))
      throw new SourceUnavailable('fixed_body')
    fixedRoot = original.versions.find(version => equal(version.number, fixedSource.version))
    if (fixedRoot?.content.category !== 'agent_definition')
      throw new SourceUnavailable('fixed_body')
  }
  return Object.freeze({
    recipe: Object.freeze(recipe),
    revision: head.revision,
    holdings: Object.freeze(retained),
    definitions: Object.freeze(definitions.filter(item => ids.has(item.id))),
    versions,
    bodyBytes,
    ...(fixedRoot === undefined ? {} : { fixedRoot }),
  })
}
export function buildInputWithRoot(
  snapshot: SourceSnapshot,
  source: EvaluationRootSource,
  root: NonConnectorAssetDefinition['versions'][number] | undefined,
): NonConnectorEvaluationInput {
  if (root?.content.category !== 'agent_definition') throw new SourceUnavailable('root_body')
  const extracted = extractAgentDefinitionInputs(readOpaqueJson(root.content.body))
  if (!('ok' in extracted)) throw new SourceUnavailable('root_body')
  const { recipe, holdings, definitions } = snapshot
  return Object.freeze({
    tenant: recipe.tenant,
    standing: recipe.standing,
    holdings,
    definitions,
    ...(recipe.session === undefined ? {} : { session: recipe.session }),
    root: Object.freeze({ definition: recipe.rootDefinition, ...extracted.ok, source }),
  })
}
/** No IO: selection, extraction and admission run only on this operation's owned snapshot. */
export function inputFromSnapshot(
  snapshot: SourceSnapshot,
  deps: InputSourceDependencies,
): {
  input: NonConnectorEvaluationInput
  revision: string
  holdings: number
  assets: number
  versions: number
  bodyBytes: number
  selectorNanos: string
  evaluationNanos: string
} {
  const { recipe, holdings, definitions } = snapshot
  const selectionStarted = deps.monotonicNow()
  const selected = selectEvaluationRootSource({
    tenant: recipe.tenant,
    standing: recipe.standing,
    holdings,
    definitions,
    ...(recipe.session === undefined ? {} : { session: recipe.session }),
    rootDefinition: recipe.rootDefinition,
  })
  if (!('ok' in selected)) throw new SourceUnavailable('root_selection')
  const selectorNanos = (deps.monotonicNow() - selectionStarted).toString()
  const root = definitions
    .find(item => item.id === selected.ok.asset)
    ?.versions.find(
      version =>
        ExactDecimal.from(version.number).compare(ExactDecimal.from(selected.ok.version)) === 0,
    )
  const input = buildInputWithRoot(snapshot, selected.ok, root)
  const evaluationStarted = deps.monotonicNow()
  const evaluated = evaluate(input)
  const evaluationNanos = (deps.monotonicNow() - evaluationStarted).toString()
  if (!('ok' in evaluated)) {
    emit(deps, {
      kind: 'evaluation_input_rejected',
      tenant: recipe.tenant,
      stage: 'evaluate',
      rejection:
        'invalidInput' in evaluated
          ? 'invalidInput'
          : 'compositionCycle' in evaluated
            ? 'compositionCycle'
            : 'categoryUnsupported',
    })
    throw new SourceUnavailable('evaluate')
  }
  return {
    input,
    revision: snapshot.revision,
    holdings: holdings.length,
    assets: definitions.length,
    versions: snapshot.versions,
    bodyBytes: snapshot.bodyBytes,
    selectorNanos,
    evaluationNanos,
  }
}
