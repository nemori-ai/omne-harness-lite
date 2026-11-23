import type { TenantId } from '@omne-harness/legal-identity'
import {
  createSettingsSecretItems,
  type SecretCustodyManagement,
  type SettingDefinitions,
  type SettingsAssetQuery,
  type SettingsHoldingRef,
  type SettingsRegistrySnapshot,
  type SettingsSecretItems,
} from '@omne-harness/settings'

/** An asset a tenant holds, with the settings definition governance installed for it. */
export type DeclaredAsset = Readonly<{ ref: SettingsHoldingRef; definition: SettingDefinitions }>

type Release = Readonly<{
  snapshot(): SettingsRegistrySnapshot
  holdings(asset?: SettingsAssetQuery): readonly SettingsHoldingRef[]
}>

export type TenantSecretsInput = Readonly<{
  release: Release
  custody: SecretCustodyManagement
  /** What the tenant holds; `unknown` when it cannot be read whole. */
  declared(tenant: TenantId): Promise<readonly DeclaredAsset[] | 'unknown'>
}>

function matches(asset: SettingsAssetQuery | undefined, ref: SettingsHoldingRef): boolean {
  return (
    asset === undefined ||
    (asset.name === ref.asset.name &&
      (asset.category === undefined || asset.category === ref.asset.category))
  )
}

// An asset the release knows is answered from the release alone, so its secrets keep their keys.
export function tenantSecretItems(input: TenantSecretsInput) {
  const { release, custody } = input
  const releaseOnly = createSettingsSecretItems({
    declarations: release,
    custody,
    resolve: asset => release.holdings(asset),
  })
  return async (
    tenant: TenantId,
    asset: SettingsAssetQuery | undefined,
  ): Promise<SettingsSecretItems | 'unavailable'> => {
    if (asset !== undefined && release.holdings(asset).length > 0) return releaseOnly
    const declared = await input.declared(tenant).catch(() => 'unknown' as const)
    if (declared === 'unknown') return 'unavailable'
    const own = declared.filter(
      held =>
        release.holdings(held.ref.asset).length === 0 &&
        held.definition.items.some(item => item.sensitivity === 'secret'),
    )
    return createSettingsSecretItems({
      declarations: {
        snapshot: () => {
          const base = release.snapshot()
          return {
            ...base,
            definitions: [...base.definitions, ...own.map(held => held.definition)],
          }
        },
      },
      custody,
      resolve: query => [
        ...release.holdings(query),
        ...own.filter(held => matches(query, held.ref)).map(held => held.ref),
      ],
    })
  }
}
