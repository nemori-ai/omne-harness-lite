import {
  BodyProviderUnavailableError,
  type AssetHolding,
  type HoldingScope,
} from '@omne-harness-lite/asset-model'
import { narrow, StorageUnavailable } from '@omne-harness-lite/storage'
import type { ReadTx } from '@omne-harness-lite/storage'
import {
  definition,
  decodeHoldings,
  equal,
  factoryMatches,
  getAssetJudge,
  object,
  orderVersions,
  ownDependencies,
  parsed,
  scopeKey,
  SourceUnavailable,
  deploymentEquals,
} from './data.ts'
import { publishLocalInputs } from './publication.ts'
import type {
  EvaluationStorageDependencies,
  LocalPublication,
  PublicationResult,
  SourceDb,
} from './types.ts'
type DeploymentHolder = Exclude<HoldingScope, { readonly layer: 'factory' | 'workspace' }>

/** Trusted factory deployment only; this does not establish membership or execution authority. */
export async function installOfficialFactoryDefinition(
  dependencies: EvaluationStorageDependencies,
  requested: {
    readonly definition: unknown
    readonly since: string
    readonly holders: readonly DeploymentHolder[]
  },
): Promise<PublicationResult> {
  const deps = ownDependencies(dependencies)
  const input = installationInput(deps, requested)
  if ('failure' in input) return input
  const { release, holding, holders } = input
  try {
    const snapshot = await deps.storage.read(tx =>
      installationSnapshot(tx, deps, release, holding, holders),
    )
    if ('failure' in snapshot) return snapshot
    if (snapshot.definitions.length === 0 && snapshot.scopes.length === 0) {
      if (snapshot.expectedRevision === null) throw new SourceUnavailable('factory_head')
      return { revision: snapshot.expectedRevision }
    }
    return await publishLocalInputs(deps, snapshot)
  } catch (error) {
    if (error instanceof StorageUnavailable || error instanceof SourceUnavailable)
      return { failure: 'unavailable' }
    throw error
  }
}
function installationInput(
  deps: EvaluationStorageDependencies,
  requested: Parameters<typeof installOfficialFactoryDefinition>[1],
):
  | {
      release: ReturnType<typeof definition>
      holding: AssetHolding
      holders: readonly DeploymentHolder[]
    }
  | { failure: 'invalidInput' | 'unavailable' } {
  let release: ReturnType<typeof definition>
  try {
    release = definition(requested.definition)
  } catch (error) {
    if (error instanceof SourceUnavailable) return { failure: 'invalidInput' }
    if (error instanceof BodyProviderUnavailableError) return { failure: 'unavailable' }
    throw error
  }
  if (release.origin !== 'official' || release.draft !== undefined || release.versions.length === 0)
    return { failure: 'invalidInput' }
  const declared = deps.deployedOfficial.find(entry => equal(entry.capability, release.capability))
  if (!declared) return { failure: 'invalidInput' }
  const holding: AssetHolding = {
    holder: { layer: 'factory' },
    capability: release.capability,
    asset: release.id,
    basis: { kind: 'official' },
    immutable: declared.meta,
    assignments: [],
    versionSelection: { kind: 'current' },
    since: requested.since,
  }
  const holders = Object.freeze(
    requested.holders.map(holder => Object.freeze(structuredClone(holder))),
  )
  if (!validInstallation(holding, holders)) return { failure: 'invalidInput' }
  return { release, holding, holders }
}
function validInstallation(holding: AssetHolding, holders: readonly HoldingScope[]) {
  const judge = getAssetJudge(),
    keys = new Set<string>()
  if (!('ok' in judge.judgeAssetValue('AssetHolding', holding))) return false
  return holders.every(holder => {
    if (holder.layer !== 'organization' && holder.layer !== 'tenant') return false
    if (!('ok' in judge.judgeAssetValue('HoldingScope', holder))) return false
    const key = `${holder.layer}/${scopeKey(holder)}`
    if (keys.has(key)) return false
    keys.add(key)
    return true
  })
}
async function storedDefinition(tx: ReadTx, deps: EvaluationStorageDependencies, id: string) {
  const db = narrow<SourceDb>(tx)
  const row = await db
    .selectFrom('evaluation_input_asset')
    .selectAll()
    .where('store_key', '=', deps.storeKey)
    .where('asset_id', '=', id)
    .executeTakeFirst()
  if (!row) return undefined
  const versions = await db
    .selectFrom('evaluation_input_version')
    .select(['version_position', 'version'])
    .where('store_key', '=', deps.storeKey)
    .where('asset_id', '=', id)
    .execute()
  const metadata = parsed(row.metadata, 'definition_metadata')
  if (!object(metadata)) throw new SourceUnavailable('definition_metadata')
  return definition({
    ...metadata,
    ...(row.draft === null ? {} : { draft: parsed(row.draft, 'draft') }),
    versions: orderVersions(versions).map(version => parsed(version.version, 'version')),
  })
}
async function installationSnapshot(
  tx: ReadTx,
  deps: EvaluationStorageDependencies,
  release: ReturnType<typeof definition>,
  holding: AssetHolding,
  holders: readonly DeploymentHolder[],
): Promise<LocalPublication | { failure: 'conflict' }> {
  const db = narrow<SourceDb>(tx)
  const head = await db
    .selectFrom('evaluation_input_head')
    .select(['revision', 'factory_manifest'])
    .where('store_key', '=', deps.storeKey)
    .executeTakeFirst()
  const original = await storedDefinition(tx, deps, release.id)
  if (original && !canAppendRelease(original, release)) return { failure: 'conflict' }
  const changed = !equal(original, release)
  const factory = await factoryScopes(tx, deps, holding, head)
  if ('failure' in factory) return factory
  const scopes = [...factory.scopes, ...(await missingScopes(tx, deps, holders))]
  if (!changed && scopes.length === 0) checkInstalledHead(head, deps)
  return {
    expectedRevision: head?.revision ?? null,
    definitions: changed ? [release] : [],
    scopes,
  }
}
function canAppendRelease(
  original: ReturnType<typeof definition>,
  next: ReturnType<typeof definition>,
) {
  const { versions: before, ...originalMetadata } = original
  const { versions: after, ...nextMetadata } = next
  return (
    equal(originalMetadata, nextMetadata) &&
    before.length <= after.length &&
    before.every((version, index) => equal(version, after[index]))
  )
}

async function factoryScopes(
  tx: ReadTx,
  deps: EvaluationStorageDependencies,
  holding: AssetHolding,
  head: Pick<SourceDb['evaluation_input_head'], 'revision' | 'factory_manifest'> | undefined,
): Promise<{ scopes: LocalPublication['scopes'] } | { failure: 'conflict' }> {
  const db = narrow<SourceDb>(tx)
  const factory = await db
    .selectFrom('evaluation_input_scope')
    .select('holdings')
    .where('store_key', '=', deps.storeKey)
    .where('layer', '=', 'factory')
    .where('scope_key', '=', 'factory')
    .executeTakeFirst()
  const existing = factory
    ? decodeHoldings(parsed(factory.holdings, 'factory_holdings'), { layer: 'factory' })
    : []
  const prior = existing.find(item => equal(item.capability, holding.capability))
  if (prior && !equal(prior, { ...holding, since: prior.since })) return { failure: 'conflict' }
  const next = prior ? existing : [...existing, holding]
  if (!factoryMatches(next, deps.deployedOfficial)) return { failure: 'conflict' }
  checkFactoryManifest(factory !== undefined, head, deps, holding, prior !== undefined)
  const scopes: LocalPublication['scopes'][number][] = prior
    ? []
    : [{ holder: { layer: 'factory' }, holdings: next }]
  return { scopes }
}
function checkFactoryManifest(
  hasFactory: boolean,
  head: Pick<SourceDb['evaluation_input_head'], 'revision' | 'factory_manifest'> | undefined,
  deps: EvaluationStorageDependencies,
  holding: AssetHolding,
  alreadyHeld: boolean,
) {
  if (hasFactory !== (head !== undefined)) throw new SourceUnavailable('factory_head')
  if (!head) return
  const previous = alreadyHeld
    ? deps.deployedOfficial
    : deps.deployedOfficial.filter(entry => !equal(entry.capability, holding.capability))
  if (!deploymentEquals(parsed(head.factory_manifest, 'factory_manifest'), previous))
    throw new SourceUnavailable('factory_manifest')
}
async function missingScopes(
  tx: ReadTx,
  deps: EvaluationStorageDependencies,
  holders: readonly DeploymentHolder[],
) {
  const db = narrow<SourceDb>(tx),
    scopes: LocalPublication['scopes'][number][] = []
  for (const holder of holders) {
    const row = await db
      .selectFrom('evaluation_input_scope')
      .select('holdings')
      .where('store_key', '=', deps.storeKey)
      .where('layer', '=', holder.layer)
      .where('scope_key', '=', scopeKey(holder))
      .executeTakeFirst()
    if (row) decodeHoldings(parsed(row.holdings, 'scope_holdings'), holder)
    else scopes.push({ holder, holdings: [] })
  }
  return scopes
}
function checkInstalledHead(
  head: Pick<SourceDb['evaluation_input_head'], 'revision' | 'factory_manifest'> | undefined,
  deps: EvaluationStorageDependencies,
) {
  if (!head || !/^[1-9][0-9]*$/u.test(head.revision)) throw new SourceUnavailable('factory_head')
  if (!deploymentEquals(parsed(head.factory_manifest, 'factory_manifest'), deps.deployedOfficial))
    throw new SourceUnavailable('factory_manifest')
}
