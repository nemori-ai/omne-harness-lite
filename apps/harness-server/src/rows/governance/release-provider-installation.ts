import { capabilityId, pinBody } from '@omne-harness/assets'
import type { AssetsLocal } from '@omne-harness/assets-local'
import type { AssetTarget } from '@omne-harness/settings'
import { canonicalDigest } from '@omne-harness/tool'
import { MODEL_PROVIDER_CATEGORY } from '@omne-harness/model-contract/provider-asset'
import type { ReleaseProvider } from '../../assets/model-providers.ts'
import {
  installReleaseAsset,
  preinstalledTarget,
  type ReleaseAssetInstallation,
  type ReleasePublication,
} from './release-asset-installation.ts'

/** The owner of the source a release provider's holding carries. */
export const MODEL_RELEASE_OWNER = 'harness-server.model-release'

export type ReleaseProviderInstallation = Readonly<{ provider: string }> & ReleaseAssetInstallation

export function releaseProviderPublication(provider: ReleaseProvider): ReleasePublication {
  const identity = capabilityId(MODEL_PROVIDER_CATEGORY, provider.body.name)
  if (!identity.ok) throw new Error(`the provider ${provider.body.name} has no asset identity`)
  const pinned = pinBody({
    identity: identity.id,
    version: provider.version,
    source: MODEL_RELEASE_OWNER,
    body: provider.document,
  })
  const assetRef = `harness.${MODEL_PROVIDER_CATEGORY}.${provider.body.name}`
  return {
    assetRef,
    pinned,
    publicationRef: {
      assetRef,
      category: pinned.identity.category,
      name: pinned.identity.name,
      version: pinned.version,
      source: pinned.source,
      bodyDigest: canonicalDigest(pinned.body).slice(7),
    },
  }
}

export function releaseProviderTarget(name: string, tenantRef: string): AssetTarget {
  return preinstalledTarget(MODEL_PROVIDER_CATEGORY, name, tenantRef)
}

/** Installs each release provider; one that fails now is said once and installed at the next opening. */
export async function installReleaseProviders(
  input: Readonly<{
    owner: AssetsLocal
    tenantRef: string
    providers: readonly ReleaseProvider[]
    warn(message: string): void
  }>,
): Promise<readonly ReleaseProviderInstallation[]> {
  const installed: ReleaseProviderInstallation[] = []
  for (const provider of input.providers) {
    const name = provider.body.name
    const result = await installReleaseAsset({
      owner: input.owner,
      tenantRef: input.tenantRef,
      ownerRef: MODEL_RELEASE_OWNER,
      publication: releaseProviderPublication(provider),
      target: releaseProviderTarget(name, input.tenantRef),
    })
    if (result.kind === 'unavailable')
      input.warn(`the release provider ${name} is not installed yet (${result.phase})`)
    installed.push({ provider: name, ...result })
  }
  return installed
}
