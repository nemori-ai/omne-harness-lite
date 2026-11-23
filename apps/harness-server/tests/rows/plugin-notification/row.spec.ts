import { describe, expect, it } from 'vitest'
import { rowDeclarationOf } from '../../../src/row.ts'
import { pluginNotificationRow } from '../../../src/rows/plugin-notification/index.ts'
import { rowManifests } from '../../../src/s0/stubs.ts'

describe('the plugin-notification row', () => {
  it('declares the manifest of the stub table: it requires nothing and provides nothing', () => {
    const declared = rowDeclarationOf(pluginNotificationRow)
    expect(declared).toMatchObject({
      row: 'plugin-notification',
      implementation: 'real',
      lifecycle: { kind: 'body', phase: 'composition' },
      manifest: { provides: [], injects: [] },
    })
    const stub = rowManifests.get(declared!.row)
    expect(stub?.provides).toEqual([])
    expect(stub?.injects).toEqual([])
  })
})
