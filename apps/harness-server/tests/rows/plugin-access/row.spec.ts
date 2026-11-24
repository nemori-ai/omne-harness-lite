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
      manifest: { provides: ['pluginReports'], injects: ['accessRegistry', 'principalIssuer'] },
    })
    const stub = rowManifests.get(declared!.row)
    expect(stub?.provides).toEqual(['s0.pluginReports'])
    expect(stub?.injects).toEqual(['s0.accessRegistry', 's0.principalIssuer'])
  })

  it('takes a dev directory only as an absolute path, and none by default', () => {
    expect(pluginAccessConfig.parse({})).toEqual({ reportsPerTenant: 32 })
    expect(pluginAccessConfig.parse({ devDirectory: '/srv/plugins' })).toEqual({
      devDirectory: '/srv/plugins',
      reportsPerTenant: 32,
    })
    expect(pluginAccessConfig.safeParse({ devDirectory: 'plugins' }).success).toBe(false)
    expect(pluginAccessConfig.safeParse({ other: 1 }).success).toBe(false)
  })

  it('keeps the reports of so many clients of a tenant: at least one, 32 when it is not told', () => {
    expect(pluginAccessConfig.parse({ reportsPerTenant: 2 }).reportsPerTenant).toBe(2)
    expect(pluginAccessConfig.safeParse({ reportsPerTenant: 0 }).success).toBe(false)
    expect(pluginAccessConfig.safeParse({ reportsPerTenant: 1.5 }).success).toBe(false)
  })
})
