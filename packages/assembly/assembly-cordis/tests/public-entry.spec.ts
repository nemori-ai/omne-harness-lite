import { expect, it } from 'vitest'

it('the root entry exports the attribution of falls and the provenance of versions, nothing of Cordis', async () => {
  const root = (await import('@omne-harness/assembly-cordis')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'MANIFEST_FILE',
    'SIGNATURE_FILE',
    'attributed',
    'attributedNow',
    'loadDirectoryFile',
    'loadVersion',
    'verifyVersion',
    'watchFalls',
  ])
})
