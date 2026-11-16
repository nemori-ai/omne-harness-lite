import assert from 'node:assert/strict'
import type { CapabilityId } from '@omne-harness/assets'
import type { Access } from '@omne-harness/legal-identity'
import { sameCapability } from './capability.ts'
import type { SkillReadCheck } from './ports.ts'
import { conformanceCase, type ConformanceCase } from './testing-case.ts'
import type { PrincipalSample } from './testing-resolution.ts'

export type MemoryReadGrant<P, S> = Readonly<{
  capability: CapabilityId
  visible: (access: Access<P>, scope: S) => boolean
}>

export function createMemoryReadCheck<P, S>(
  grants: readonly MemoryReadGrant<P, S>[],
): SkillReadCheck<P, S> {
  return {
    async check(access, scope, capability) {
      const granted = grants.some(
        grant => sameCapability(grant.capability, capability) && grant.visible(access, scope),
      )
      return granted ? { kind: 'granted' } : { kind: 'refused' }
    },
  }
}

export type ReadCheckFixture<P, S> = Readonly<{
  readCheck: SkillReadCheck<P, S>
  permitted: PrincipalSample<P, S>
  refused: PrincipalSample<P, S>
  readable: CapabilityId
  missing: CapabilityId
}>

export const READ_CHECK_NO_DISCLOSURE =
  'answers a principal without the right the same for an existing and a missing identity'

export function skillReadCheckConformance<P, S>(): ConformanceCase<ReadCheckFixture<P, S>>[] {
  return [
    conformanceCase('PC1', 'grants a principal who may read the identity', async f => {
      assert.deepEqual(await f.readCheck.check(f.permitted.access, f.permitted.scope, f.readable), {
        kind: 'granted',
      })
    }),
    conformanceCase('PC2', 'refuses a principal who may not read the identity', async f => {
      assert.deepEqual(await f.readCheck.check(f.refused.access, f.refused.scope, f.readable), {
        kind: 'refused',
      })
    }),
    conformanceCase('PC3', READ_CHECK_NO_DISCLOSURE, async f => {
      const existing = await f.readCheck.check(f.refused.access, f.refused.scope, f.readable)
      const missing = await f.readCheck.check(f.refused.access, f.refused.scope, f.missing)
      assert.deepEqual(missing, existing)
    }),
  ]
}
