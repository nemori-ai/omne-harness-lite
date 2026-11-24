import { expect, it } from 'vitest'
import { declarationTarget, releasedDeclaration } from '../../src/entry/permission-declarations.ts'

it('a released tool declares its permission under its preinstalled settings target, per tenant', () => {
  const asset = {
    name: 'Shell',
    adoption: { owner: 'tool', name: 'Shell', revision: '1', digest: 'd' },
  }
  const governance = { declaration: { enforcementBindings: [] }, interpretations: [] }
  const declaration = releasedDeclaration({ asset, governance } as never)
  expect(declaration).toEqual({
    asset: { category: 'tool', name: 'Shell' },
    definition: asset.adoption,
    governance,
    holdingRef: 'harness.preinstalled.tool.Shell',
    tenantRef: null,
  })
  expect(declarationTarget(declaration, 'tenant-1')).toEqual({
    kind: 'asset',
    scopeRef: 'tenant-1',
    holdingRef: 'harness.preinstalled.tool.Shell',
  })
})
