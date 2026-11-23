import { describe, expect, it } from 'vitest'
import { rowDeclarationOf } from '../../../src/row.ts'
import { pluginHostRow } from '../../../src/rows/plugin-host/index.ts'
import { rowManifests } from '../../../src/s0/stubs.ts'

describe('the plugin-host row', () => {
  it('declares the manifest of the stub table', () => {
    const declared = rowDeclarationOf(pluginHostRow)
    expect(declared).toMatchObject({
      row: 'plugin-host',
      implementation: 'real',
      lifecycle: { kind: 'none' },
      manifest: { provides: [], injects: ['assetCategories'] },
    })
    const stub = rowManifests.get(declared!.row)
    expect(stub?.provides).toEqual([])
    expect(stub?.injects).toEqual(['s0.assetCategories'])
  })
})
