// Steps 1 to 3 of every operation: the basis names the target, the read check grants, the
// resolution gives the material. A principal without the right gets `not-available-to-you` on
// each of the three paths, and the three answers are the same object shape: nothing says which
// path it was.
import type { CapabilityId } from '@omne-harness/assets'
import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  DeclaredProjection,
  DescribeFailure,
  SkillMaterialBasis,
  SourceLayer,
} from '@omne-harness/skill-contract'
import type { Resolution, SkillRef } from '@omne-harness/skill-contract/provider'
import type { SkillPorts } from '../ports.ts'

/** What the gate lets through: the material and, when the caller gave one, the basis. */
export type Gated = Readonly<{
  ref: SkillRef
  declared: DeclaredProjection
  layer: SourceLayer
  basis?: SkillMaterialBasis
}>

export type GatedWithBasis = Gated & Readonly<{ basis: SkillMaterialBasis }>

const NOT_AVAILABLE = Object.freeze({ kind: 'not-available-to-you' } as const)

function sameCapability(left: CapabilityId, right: CapabilityId): boolean {
  return left.category === right.category && left.name === right.name
}

/** Step 3: the resolution answer, mapped as the group page "端口" table says. */
function gatedOf(
  answer: Resolution,
  basis: SkillMaterialBasis | undefined,
): Outcome<Gated, DescribeFailure> {
  switch (answer.kind) {
    case 'adopted': {
      const { ref, declared } = answer
      return succeed({ ref, declared, layer: ref.layer, ...(basis === undefined ? {} : { basis }) })
    }
    case 'known-unavailable': {
      const { capability, name, reason, description } = answer
      return fail({
        kind: 'unavailable-stand-in',
        standIn: {
          capability,
          name,
          reason,
          ...(description === undefined ? {} : { description }),
        },
      })
    }
    case 'basis-not-lawful':
      return fail({ kind: 'basis-unavailable' })
    case 'none':
      return fail(NOT_AVAILABLE)
    case 'unknown':
      return fail({ kind: 'unknown' })
    default: {
      const exhaustive: never = answer
      return exhaustive
    }
  }
}

export function gate<P, S>(
  ports: SkillPorts<P, S>,
  access: Access<P>,
  scope: S,
  capability: CapabilityId,
  basis: SkillMaterialBasis,
): Promise<Outcome<GatedWithBasis, DescribeFailure>>
export function gate<P, S>(
  ports: SkillPorts<P, S>,
  access: Access<P>,
  scope: S,
  capability: CapabilityId,
  basis?: SkillMaterialBasis,
): Promise<Outcome<Gated, DescribeFailure>>
export async function gate<P, S>(
  ports: SkillPorts<P, S>,
  access: Access<P>,
  scope: S,
  capability: CapabilityId,
  basis?: SkillMaterialBasis,
): Promise<Outcome<Gated, DescribeFailure>> {
  // Step 1: a basis of another identity is `bad-basis` inside and `not-available-to-you` outside.
  if (basis !== undefined && !sameCapability(basis.capability, capability))
    return fail(NOT_AVAILABLE)
  // Step 2: the read check, on the spot. No cache and no earlier success stands in for it.
  const verdict = await ports.readCheck.check(access, scope, capability)
  if (verdict.kind === 'refused') return fail(NOT_AVAILABLE)
  if (verdict.kind === 'unknown') return fail({ kind: 'unknown' })
  // Step 3: the resolution. The package locator comes only from its answer.
  const answer = await ports.resolution.resolve(
    access,
    scope,
    capability,
    basis === undefined ? undefined : { basis },
  )
  return gatedOf(answer, basis)
}
