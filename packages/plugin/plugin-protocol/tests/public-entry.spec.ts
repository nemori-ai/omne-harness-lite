import { expect, it } from 'vitest'

it('the root entry gives the plugin/v1 contract, the manifest, the judgment of a package, the wanted list, the state of one side with the loop and the floor that bring it there, and nothing else at run time', async () => {
  const root = (await import('@omne-harness/plugin-protocol')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'FILE_SUFFIXES',
    'MANIFEST_FILE',
    'MANIFEST_SCHEMA',
    'NO_FLOOR',
    'UNWANTED',
    'createLoader',
    'fiberOf',
    'heldOf',
    'insidePackage',
    'judgePackage',
    'memberDigest',
    'memberKind',
    'membersOf',
    'pluginProtocol',
    'readManifest',
    'standingOf',
    'stepSide',
    'wantedOf',
  ])
})
