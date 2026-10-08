import { sessionRecipe, captureRecipeIn } from './recipe-store.ts'
import {
  capabilityCanonicalString,
  BodyProviderUnavailableError,
  type AssetHolding,
  type HoldingScope,
} from '@omne-harness-lite/asset-model'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { narrow, StorageUnavailable } from '@omne-harness-lite/storage'
import {
  getAssetJudge,
  ownDependencies,
  factoryMatches,
  decodeHoldings,
  definition,
  emit,
  equal,
  orderVersions,
  json,
  object,
  parsed,
  scopeKey,
  SourceUnavailable,
  text,
} from './data.ts'
import type {
  InputSourceDependencies,
  EvaluationStorageDependencies,
  LocalPublication,
  PublicationResult,
  SessionRecipeInput,
  SourceDb,
} from './types.ts'

function revision(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/u.test(value))
}
function publication(value: unknown): LocalPublication | undefined {
  const copy = json(value)
  if (
    !object(copy) ||
    Object.keys(copy).length !== 3 ||
    !revision(copy.expectedRevision) ||
    !Array.isArray(copy.definitions) ||
    !Array.isArray(copy.scopes)
  )
    return undefined
  const scopes = new Set<string>()
  const assets = new Set<string>()
  for (const entry of copy.definitions) {
    const admitted = definition(entry)
    if (assets.has(admitted.id)) return undefined
    assets.add(admitted.id)
  }
  for (const entry of copy.scopes) {
    if (
      !object(entry) ||
      Object.keys(entry).length !== 2 ||
      !object(entry.holder) ||
      !['factory', 'organization', 'tenant'].includes(String(entry.holder.layer)) ||
      !Array.isArray(entry.holdings)
    )
      return undefined
    if (
      entry.holder.layer === 'factory'
        ? Object.keys(entry.holder).length !== 1
        : !('ok' in getAssetJudge().judgeAssetValue('HoldingScope', entry.holder))
    )
      return undefined
    const holder = entry.holder as unknown as HoldingScope
    const key = `${holder.layer}/${scopeKey(holder)}`
    if (scopes.has(key)) return undefined
    scopes.add(key)
    const capabilities = new Set<string>()
    for (const item of entry.holdings) {
      if (!('ok' in getAssetJudge().judgeAssetValue('AssetHolding', item))) return undefined
      const holding = item as unknown as AssetHolding
      const capability = capabilityCanonicalString(holding.capability)
      if (!equal(holding.holder, holder) || capabilities.has(capability)) return undefined
      capabilities.add(capability)
    }
  }
  return copy as unknown as LocalPublication
}
export async function publishLocalInputs(
  dependencies: EvaluationStorageDependencies,
  value: unknown,
): Promise<PublicationResult> {
  const deps = ownDependencies(dependencies)
  let input: LocalPublication | undefined
  try {
    input = publication(value)
  } catch (error) {
    if (error instanceof SourceUnavailable) return { failure: 'invalidInput' }
    if (error instanceof BodyProviderUnavailableError) return { failure: 'unavailable' }
    throw error
  }
  if (input === undefined) return { failure: 'invalidInput' }
  try {
    const result = await deps.storage.atomic(unit =>
      unit.run(() =>
        unit.mutate(async tx => {
          await tx.lockSentinel(`evaluation-input:${deps.storeKey}`)
          await tx.lockRow('evaluation_input_head', { store_key: deps.storeKey })
          const db = narrow<SourceDb>(tx)
          const head = await db
            .selectFrom('evaluation_input_head')
            .selectAll()
            .where('store_key', '=', deps.storeKey)
            .executeTakeFirst()
          if ((head?.revision ?? null) !== input.expectedRevision)
            return { failure: 'conflict' } as const
          const known = await db
            .selectFrom('evaluation_input_asset')
            .selectAll()
            .where('store_key', '=', deps.storeKey)
            .execute()
          const all = new Map(known.map(row => [row.asset_id, row]))
          for (const asset of input.definitions) {
            const { versions, draft, ...metadata } = asset
            const old = all.get(asset.id)
            const oldVersions =
              old === undefined
                ? []
                : await db
                    .selectFrom('evaluation_input_version')
                    .selectAll()
                    .where('store_key', '=', deps.storeKey)
                    .where('asset_id', '=', asset.id)
                    .execute()
            orderVersions(oldVersions)
            if (
              old !== undefined &&
              (!equal(parsed(old.metadata, 'published_metadata'), metadata) ||
                oldVersions.length > versions.length ||
                oldVersions.some(
                  (row, index) => !equal(parsed(row.version, 'published_version'), versions[index]),
                ))
            )
              return { failure: 'invalidInput' } as const
          }
          const factory = input.scopes.find(scope => scope.holder.layer === 'factory')
          const existingFactory =
            factory === undefined
              ? await db
                  .selectFrom('evaluation_input_scope')
                  .select('holdings')
                  .where('store_key', '=', deps.storeKey)
                  .where('layer', '=', 'factory')
                  .where('scope_key', '=', 'factory')
                  .executeTakeFirst()
              : undefined
          const factoryHoldings =
            factory?.holdings ??
            (existingFactory === undefined
              ? undefined
              : decodeHoldings(parsed(existingFactory.holdings, 'factory_holdings'), {
                  layer: 'factory',
                }))
          if (
            factoryHoldings === undefined ||
            !factoryMatches(factoryHoldings, deps.deployedOfficial)
          )
            return { failure: 'invalidInput' } as const
          const requested = new Map(input.definitions.map(asset => [asset.id, asset]))
          const persisted = new Map<string, ReturnType<typeof definition>>()
          const inspection =
            factory === undefined
              ? [
                  ...input.scopes,
                  { holder: { layer: 'factory' as const }, holdings: factoryHoldings },
                ]
              : input.scopes
          for (const scope of inspection)
            for (const holding of scope.holdings) {
              if (
                all.has(holding.asset) &&
                !requested.has(holding.asset) &&
                !persisted.has(holding.asset)
              ) {
                const versions = orderVersions(
                  await db
                    .selectFrom('evaluation_input_version')
                    .select(['version_position', 'version'])
                    .where('store_key', '=', deps.storeKey)
                    .where('asset_id', '=', holding.asset)
                    .execute(),
                )
                const metadata = parsed(all.get(holding.asset)?.metadata ?? '', 'existing_metadata')
                if (!object(metadata)) throw new SourceUnavailable('existing_metadata')
                persisted.set(
                  holding.asset,
                  definition({
                    ...metadata,
                    versions: versions.map(row => parsed(row.version, 'existing_version')),
                  }),
                )
              }
              const asset = requested.get(holding.asset) ?? persisted.get(holding.asset)
              if (
                asset === undefined ||
                !equal(asset.capability, holding.capability) ||
                (holding.basis.kind === 'official') !== (asset.origin === 'official') ||
                (scope.holder.layer === 'factory' &&
                  (asset.origin !== 'official' || holding.assignments.length !== 0)) ||
                (asset.origin === 'official' &&
                  holding.assignments.some(assignment => assignment.item === 'disabled')) ||
                (holding.versionSelection.kind === 'pinned' &&
                  !asset.versions.some(version =>
                    equal(
                      version.number,
                      holding.versionSelection.kind === 'pinned'
                        ? holding.versionSelection.number
                        : null,
                    ),
                  )) ||
                (holding.basis.kind === 'owned' &&
                  (asset.origin !== 'customized' ||
                    (scope.holder.layer === 'organization'
                      ? asset.owner.kind !== 'organization' ||
                        asset.owner.organization !== scope.holder.organization
                      : scope.holder.layer !== 'tenant' ||
                        asset.owner.kind !== 'tenant' ||
                        !tenantIdEquals(asset.owner.tenant, scope.holder.tenant))))
              )
                return { failure: 'invalidInput' } as const
            }
          for (const asset of input.definitions) {
            const { versions, draft, ...metadata } = asset
            const old = all.get(asset.id)
            if (old === undefined)
              await db
                .insertInto('evaluation_input_asset')
                .values({
                  store_key: deps.storeKey,
                  asset_id: asset.id,
                  metadata: text(metadata),
                  draft: draft === undefined ? null : text(draft),
                })
                .execute()
            else
              await db
                .updateTable('evaluation_input_asset')
                .set({ draft: draft === undefined ? null : text(draft) })
                .where('store_key', '=', deps.storeKey)
                .where('asset_id', '=', asset.id)
                .execute()
            const existing = await db
              .selectFrom('evaluation_input_version')
              .select('version_position')
              .where('store_key', '=', deps.storeKey)
              .where('asset_id', '=', asset.id)
              .execute()
            for (let index = existing.length; index < versions.length; index++)
              await db
                .insertInto('evaluation_input_version')
                .values({
                  store_key: deps.storeKey,
                  asset_id: asset.id,
                  version_position: String(index + 1),
                  version: text(versions[index]),
                })
                .execute()
          }
          for (const scope of input.scopes) {
            const key = {
              store_key: deps.storeKey,
              layer: scope.holder.layer,
              scope_key: scopeKey(scope.holder),
            }
            await db
              .insertInto('evaluation_input_scope')
              .values({ ...key, holdings: text(scope.holdings) })
              .onConflict(conflict =>
                conflict
                  .columns(['store_key', 'layer', 'scope_key'])
                  .doUpdateSet({ holdings: text(scope.holdings) }),
              )
              .execute()
          }
          const next = (BigInt(head?.revision ?? '0') + 1n).toString()
          if (head === undefined)
            await db
              .insertInto('evaluation_input_head')
              .values({
                store_key: deps.storeKey,
                revision: next,
                factory_manifest: text(deps.deployedOfficial),
              })
              .execute()
          else
            await db
              .updateTable('evaluation_input_head')
              .set({ revision: next, factory_manifest: text(deps.deployedOfficial) })
              .where('store_key', '=', deps.storeKey)
              .execute()
          return { revision: next }
        }),
      ),
    )
    emit(deps, {
      kind: 'evaluation_input_publish',
      result: 'revision' in result ? 'committed' : result.failure,
      ...('revision' in result ? { revision: result.revision } : {}),
    })
    return result
  } catch (error) {
    if (
      error instanceof StorageUnavailable ||
      error instanceof SourceUnavailable ||
      error instanceof BodyProviderUnavailableError
    ) {
      emit(deps, { kind: 'evaluation_input_publish', result: 'unavailable' })
      return { failure: 'unavailable' }
    }
    throw error
  }
}
export async function readPublicationRevision(
  dependencies: EvaluationStorageDependencies,
): Promise<{ revision: string | null } | { failure: 'unavailable' }> {
  const deps = ownDependencies(dependencies)
  try {
    return await deps.storage.read(async tx => ({
      revision:
        (
          await narrow<SourceDb>(tx)
            .selectFrom('evaluation_input_head')
            .select('revision')
            .where('store_key', '=', deps.storeKey)
            .executeTakeFirst()
        )?.revision ?? null,
    }))
  } catch (error) {
    if (error instanceof StorageUnavailable) return { failure: 'unavailable' }
    throw error
  }
}
export async function captureSessionRecipe(
  dependencies: InputSourceDependencies,
  value: unknown,
): Promise<{ captured: true } | { failure: 'invalidInput' | 'conflict' | 'unavailable' }> {
  const deps = ownDependencies(dependencies)
  const request = sessionRecipe(value)
  if (!request) return { failure: 'invalidInput' }
  const { input, tenant } = request
  try {
    const holding = await deps.sessionTenancy.holdingTenant(input.session)
    if (!('tenant' in holding) || !tenantIdEquals(holding.tenant, tenant))
      throw new SourceUnavailable('session_tenancy')
    if (input.workspace !== undefined) throw new SourceUnavailable('workspace_source')
    const result = await deps.storage.atomic(async unit => {
      const standing = await deps.memberships.participate(unit).standing(tenant)
      if (!('standing' in standing) || standing.standing !== 'effective')
        throw new SourceUnavailable('current_membership')
      return captureRecipeIn(unit, deps, input, tenant, standing)
    })
    emit(deps, {
      kind: 'evaluation_input_capture',
      session: input.session,
      tenant: tenant,
      result: 'captured' in result ? 'committed' : result.failure,
    })
    return result
  } catch (error) {
    if (
      error instanceof SourceUnavailable ||
      error instanceof StorageUnavailable ||
      error instanceof BodyProviderUnavailableError
    ) {
      emit(deps, {
        kind: 'evaluation_input_capture',
        session: input.session,
        tenant: tenant,
        result: 'unavailable',
      })
      return { failure: 'unavailable' }
    }
    throw error
  }
}
export { evaluationInputMigrations } from './migrations.ts'
export type { LocalPublication, SessionRecipeInput, PublicationResult } from './types.ts'
