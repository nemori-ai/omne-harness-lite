// The conformance suite of `SkillReadCheck` and its memory double.
import type { CapabilityId } from '@omne-harness/assets'
import type { Access } from '@omne-harness/legal-identity'
import { describe, expect, it } from 'vitest'
import type { SkillReadCheck } from './ports.ts'
import { sameCapability, type PrincipalSample } from './testing-resolution.ts'

export type MemoryReadGrant<P, S> = Readonly<{
  capability: CapabilityId
  /** Whether the principal may read this identity in the scope. */
  visible: (access: Access<P>, scope: S) => boolean
}>

/** A read check over fixed grants. A missing identity and a hidden one are both refused. */
export function createMemoryReadCheck<P, S>(
  grants: readonly MemoryReadGrant<P, S>[],
): SkillReadCheck<P, S> {
  return {
    async check(access, scope, capability) {
      const granted = grants.some(
        grant => sameCapability(grant.capability, capability) && grant.visible(access, scope),
      )
      return granted ? 'granted' : 'refused'
    },
  }
}

export type ReadCheckSamples<P, S> = Readonly<{
  /** A principal who may read `readable`. */
  permitted: PrincipalSample<P, S>
  /** A principal who may not read `readable`. */
  refused: PrincipalSample<P, S>
  readable: CapabilityId
  /** An identity that exists for nobody. */
  missing: CapabilityId
}>

const READ_CHECK_NO_DISCLOSURE =
  'answers a principal without the right the same for an existing and a missing identity'

export function describeSkillReadCheckConformance<P, S>(
  input: Readonly<{
    name: string
    create: () => SkillReadCheck<P, S> | Promise<SkillReadCheck<P, S>>
    samples: ReadCheckSamples<P, S>
  }>,
): void {
  const { create, samples } = input
  const { permitted, refused } = samples

  describe(`SkillReadCheck conformance: ${input.name}`, () => {
    it('grants a principal who may read the identity', async () => {
      const check = await create()
      expect(await check.check(permitted.access, permitted.scope, samples.readable)).toBe('granted')
    })

    it('refuses a principal who may not read the identity', async () => {
      const check = await create()
      expect(await check.check(refused.access, refused.scope, samples.readable)).toBe('refused')
    })

    it(READ_CHECK_NO_DISCLOSURE, async () => {
      const check = await create()
      const existing = await check.check(refused.access, refused.scope, samples.readable)
      const missing = await check.check(refused.access, refused.scope, samples.missing)
      expect(missing).toBe(existing)
    })
  })
}
