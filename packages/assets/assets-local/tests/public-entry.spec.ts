import { expect, it } from 'vitest'
import * as assets from '@omne-harness/assets-local'
it('exports the trusted owner and both public Settings integration commands', () => {
  expect(Object.keys(assets).sort()).toEqual([
    'AssetPublicationRefSchema',
    'AssetsPublicationProjectionSchema',
    'TENANT_PUBLISHING_OWNER',
    'assetsPublicationCommand',
    'assetsPublicationFact',
    'assetsSettingsProjectionCommand',
    'assetsSqlMaterials',
    'createAssetsLocal',
    'createTenantLayerStore',
    'createTenantPublisher',
    'newHoldingRef',
    'originOf',
    'publishedAssetRef',
    'tenantListing',
  ])
})
