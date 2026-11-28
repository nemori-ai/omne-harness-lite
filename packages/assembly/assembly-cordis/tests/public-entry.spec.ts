import { expect, it } from 'vitest'

it('the root entry exports the attribution of falls, the provenance of versions and their directories, nothing of Cordis', async () => {
  const root = (await import('@omne-harness/assembly-cordis')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'MANIFEST_FILE',
    'POINTER_FILE',
    'SIGNATURE_FILE',
    'VERSIONS_DIR',
    'attributed',
    'attributedNow',
    'installVersion',
    'loadDirectoryFile',
    'loadVersion',
    'readVersions',
    'switchVersion',
    'tellVersions',
    'verifyVersion',
    'watchFalls',
    'writeWhole',
  ])
})
