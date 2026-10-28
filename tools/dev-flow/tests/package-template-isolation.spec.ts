// @module-tag slow
// Slow: the case runs tsc ten times (build and typecheck of five generated members) and git in a temporary
// workspace; about 3.5 s on an idle 4-core host, over the 5 s fast budget under load (5.2–6.8 s on the integration node).
import { describe, expect, it } from 'vitest'
import { createDomain } from '../src/package-template/domain.ts'
import { createPackage } from '../src/package-template/create.ts'
import { scanPackages } from '../src/package-template/scan.ts'
import { isolatedProductWorkspace } from './package-template-isolation.ts'

const members = [
  { group: 'access', name: 'public-contract', variant: 'module' },
  { group: 'access', name: 'sdk', variant: 'module' },
  { group: 'identity', name: 'authorization', variant: 'service-contract' },
  { group: 'assembly', name: 'assembly', variant: 'cordis-module' },
  { group: 'agent', name: 'agent', variant: 'service-provider' },
] as const

describe('official template isolation', () => {
  it('builds and typechecks generated members without a dependency deviation', () => {
    const workspace = isolatedProductWorkspace()
    try {
      for (const group of ['access', 'identity', 'assembly', 'agent'])
        createDomain({ root: workspace.root, group, write: true })
      for (const member of members) {
        createPackage({ root: workspace.root, write: true, ...member })
        workspace.build(member.group, member.name)
        workspace.typecheck(member.group, member.name)
      }
      const scans = scanPackages(workspace.root)
      expect(scans.map(scan => scan.path).sort()).toEqual(
        members.map(member => `packages/${member.group}/${member.name}`).sort(),
      )
      const dependencies = scans.flatMap(scan => scan.dependencies)
      expect(dependencies.filter(row => row.state === 'deviation')).toEqual([])
      expect(dependencies.some(row => row.state === 'unknown')).toBe(true)
      expect(scans.every(scan => scan.integration === 'unknown')).toBe(true)
    } finally {
      workspace.dispose()
    }
  })
})
