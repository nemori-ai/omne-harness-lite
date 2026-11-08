import {
  toolHistoryUpgraderPrincipal,
  TOOL_HISTORY_UPGRADER_PRINCIPAL_KEY,
} from '../../src/entry/tool-history-upgrader.ts'
import { describe, expect, it } from 'vitest'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import { entryObjects } from '../../src/entry/index.ts'
import { principalIssuer, verifierOf } from '../../src/entry/principals.ts'
import {
  tenantDomainScannerPrincipal,
  TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY,
} from '../../src/entry/tenant-domain-scanner.ts'
import {
  toolMaterialMaintainerPrincipal,
  TOOL_MATERIAL_MAINTAINER_PRINCIPAL_KEY,
} from '../../src/entry/tool-material-maintainer.ts'
import { serveProfile } from '../../src/profile.ts'
import type { RowId } from '../../src/types.ts'
import { fixtureEnv } from './support.ts'

const modules = [
  tenantDomainScannerPrincipal,
  toolMaterialMaintainerPrincipal,
  toolHistoryUpgraderPrincipal,
]
describe('production maintenance principals', () => {
  it('installs real, distinct principals in isolated entry scopes after the issuer', async () => {
    const fixture = fixtureEnv([
      principalIssuerKey,
      TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY,
      TOOL_MATERIAL_MAINTAINER_PRINCIPAL_KEY,
      TOOL_HISTORY_UPGRADER_PRINCIPAL_KEY,
    ])
    await fixture.install(principalIssuer)
    try {
      for (const module of modules) {
        expect(entryObjects.filter(entry => entry.name === module.name)).toEqual([module])
        expect(entryObjects.indexOf(module)).toBeGreaterThan(entryObjects.indexOf(principalIssuer))
        await fixture.install(module)
        expect(fixture.root.get(module.name)).toBeUndefined()
        const principal = fixture.scopeOf(module.name).get(module.name)
        expect(await verifierOf(fixture.env).verify(principal)).toMatchObject({ kind: 'verified' })
      }
      expect(
        fixture
          .scopeOf(TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY)
          .get(TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY),
      ).not.toBe(
        fixture
          .scopeOf(TOOL_MATERIAL_MAINTAINER_PRINCIPAL_KEY)
          .get(TOOL_MATERIAL_MAINTAINER_PRINCIPAL_KEY),
      )
    } finally {
      await fixture.root.fiber.dispose()
    }
  })

  it('gives each maintenance subject only its declared consumers', () => {
    const profile = serveProfile()
    for (const module of modules) {
      const consumers = [...profile.visibility]
        .filter(([, names]) => names.includes(module.name))
        .map(([row]) => row)
      expect(consumers).toEqual(
        module === toolMaterialMaintainerPrincipal
          ? ['tool-material-maintenance']
          : module === toolHistoryUpgraderPrincipal
            ? ['tool-records']
            : ['tool-records', 'tool-material-maintenance'],
      )
    }
    expect(profile.visibility.get('tool-material-maintenance' as RowId)).toEqual([
      'storage',
      'tenantDomainLookup',
      'systemActionAuthorization',
      TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY,
      TOOL_MATERIAL_MAINTAINER_PRINCIPAL_KEY,
    ])
  })
})
