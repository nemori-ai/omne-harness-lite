import { expect, it } from 'vitest'

it('the root entry gives the manifest, the judgment of a package, the wanted list and the state of one side, and nothing else at run time', async () => {
  const root = (await import('@omne-harness/plugin')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'FILE_SUFFIXES',
    'MANIFEST_FILE',
    'MANIFEST_SCHEMA',
    'UNWANTED',
    'insidePackage',
    'judgePackage',
    'memberDigest',
    'memberKind',
    'readManifest',
    'stepSide',
    'wantedOf',
  ])
})
