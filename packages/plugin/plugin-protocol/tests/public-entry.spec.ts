import { expect, it } from 'vitest'

it('the root entry gives the plugin/v1 contract, the manifest, the judgment of a package, the wanted list, the state of one side with the loop and the floor that bring it there, and nothing else at run time', async () => {
  const root = (await import('@omne-harness/plugin-protocol')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'FILE_SUFFIXES',
    'IMAGE_HEAD_BYTES',
    'IMAGE_SUFFIXES',
    'MANIFEST_FILE',
    'MANIFEST_SCHEMA',
    'NO_FLOOR',
    'UNWANTED',
    'bindPorts',
    'createLoader',
    'fiberOf',
    'fileRefs',
    'genericItem',
    'heldOf',
    'imageFault',
    'insidePackage',
    'judgeMember',
    'judgePackage',
    'lacksText',
    'memberDigest',
    'memberKind',
    'membersOf',
    'pluginProtocol',
    'readManifest',
    'reasonText',
    'standingOf',
    'stepSide',
    'wantedOf',
    'wayOf',
  ])
})
