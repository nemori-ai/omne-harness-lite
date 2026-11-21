import { expect, it } from 'vitest'

it('the public entry exports the layer source, its bodies and readers, the layouts and the digests', async () => {
  const root = (await import('@omne-harness/workspace-asset-source')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'assetDigests',
    'layoutsOf',
    'workspaceAssetRef',
    'workspaceBody',
    'workspaceLayerSource',
    'workspaceReader',
  ])
})
