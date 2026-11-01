import { describe, expect, test } from 'vitest'
import { rowIds, trustedScopes, visibility } from '../src/s0/rows.ts'
import { rowManifests } from '../src/s0/stubs.ts'

describe('stub manifests follow the AA rows', () => {
  test('R-S1 the manifest keys are exactly the snapshot rows', () => {
    expect([...rowManifests.keys()].sort()).toEqual([...rowIds].sort())
  })

  test('R-S1 a trusted name a row injects is in that row visible set', () => {
    const trusted = new Set(trustedScopes.flatMap(scope => scope.names.map(name => `s0.${name}`)))
    for (const [row, manifest] of rowManifests) {
      const visible = visibility.get(row) ?? []
      for (const name of manifest.injects) {
        if (trusted.has(name)) expect(visible, `${row} injects ${name}`).toContain(name)
      }
    }
  })
})
