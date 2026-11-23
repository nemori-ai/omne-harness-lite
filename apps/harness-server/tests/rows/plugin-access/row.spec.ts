import { describe, expect, it } from 'vitest'
import { rowDeclarationOf } from '../../../src/row.ts'
import { pluginAccessConfig, pluginAccessRow } from '../../../src/rows/plugin-access/index.ts'
import { rowManifests } from '../../../src/s0/stubs.ts'

describe('the plugin-access row', () => {
  it('declares the manifest of the stub table', () => {
    const declared = rowDeclarationOf(pluginAccessRow)
    expect(declared).toMatchObject({
      row: 'plugin-access',
      implementation: 'real',
      lifecycle: { kind: 'none' },
      manifest: { provides: [], injects: ['accessRegistry', 'principalIssuer'] },
    })
    const stub = rowManifests.get(declared!.row)
    expect(stub?.provides).toEqual([])
    expect(stub?.injects).toEqual(['s0.accessRegistry', 's0.principalIssuer'])
  })

  it('takes a dev directory only as an absolute path, and none by default', () => {
    expect(pluginAccessConfig.parse({})).toEqual({})
    expect(pluginAccessConfig.parse({ devDirectory: '/srv/plugins' })).toEqual({
      devDirectory: '/srv/plugins',
    })
    expect(pluginAccessConfig.safeParse({ devDirectory: 'plugins' }).success).toBe(false)
    expect(pluginAccessConfig.safeParse({ other: 1 }).success).toBe(false)
  })
})
