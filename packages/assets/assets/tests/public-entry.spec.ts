import { expect, it } from 'vitest'
import * as assets from '@omne-harness/assets'

it('exports the registry, identity, and pin operations', () => {
  expect(Object.keys(assets).sort()).toEqual([
    'ASSET_LAYERS',
    'MAX_ASSET_PAGE',
    'SUMMARY_LIMITS',
    'admitSummary',
    'capabilityId',
    'collectCandidates',
    'createCategoryPoint',
    'createTenantManagement',
    'createTenantPublishing',
    'decideAssetHoldingChange',
    'digestBytes',
    'evaluate',
    'isReadBody',
    'listAssets',
    'packageBody',
    'packageDigest',
    'pinBody',
    'projectAssetSettings',
    'readBodyText',
    'readSnapshot',
    'refusal',
    'summarizeVersion',
    'unknownCategory',
  ])
})
