import { expect, it } from 'vitest'

it('publishes the adopted exports and the acting scope and access additions, nothing else', async () => {
  const root = (await import('@omne-harness/legal-identity')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(
    [
      'IDENTITY_TYPE_NAMES',
      'accountCodec',
      'accountEquals',
      'loginStateCodec',
      'loginStateEquals',
      'organizationCodec',
      'organizationEquals',
      'scopeLayerCodec',
      'scopeLayerEquals',
      'tenant',
      'tenantCodec',
      'tenantEquals',
      // Additions for the acting scope and the shared access basis.
      'access',
      'actingScopeCodec',
      'actingScopeEquals',
      'systemScope',
      'tenantScope',
    ].sort(),
  )
})
