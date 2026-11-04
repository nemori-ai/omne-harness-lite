// Steps 1 to 3 of every operation: the basis names the target, the read check grants, the
// resolution gives the material. A principal without the right gets `not-available-to-you` on
// each of the three paths, and the three answers are the same object: nothing says which path
// it was. An answer of a port outside its closed set, or a port that rejects, does not let
// anyone through: it is `unknown`. The abort checkpoint sits before and after each of the two
// port calls.
import type { CapabilityId } from '@omne-harness/assets'
import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  sameCapability,
  type DeclaredProjection,
  type DescribeFailure,
  type SkillFailure,
  type SkillMaterialBasis,
  type SourceLayer,
} from '@omne-harness/skill-contract'
import type { Resolution, SkillRef } from '@omne-harness/skill-contract/provider'
import { answered, kindOf } from '../port-answer.ts'
import type { SkillPorts } from '../ports.ts'
import { checkpoint } from './checkpoint.ts'

/** What the gate lets through: the material and, when the caller gave one, the basis. */
export type Gated = Readonly<{
  ref: SkillRef
  declared: DeclaredProjection
  layer: SourceLayer
  basis?: SkillMaterialBasis
}>

export type Aborted = Extract<SkillFailure, { kind: 'aborted' }>
type Unknown = Extract<SkillFailure, { kind: 'unknown' }>

const NOT_AVAILABLE = Object.freeze({ kind: 'not-available-to-you' } as const)
const UNKNOWN = Object.freeze({ kind: 'unknown' } as const)
const ABORTED = Object.freeze({ kind: 'aborted' } as const)
const UNKNOWN_RESOLUTION: Resolution = Object.freeze({ kind: 'unknown' } as const)
const RESOLUTION_KINDS: ReadonlySet<string> = new Set([
  'adopted',
  'known-unavailable',
  'basis-not-lawful',
  'none',
  'unknown',
])

/** The resolution answer inside its closed set: a reject or a `kind` outside the set is `unknown`. */
function resolutionOf(answer: Resolution | undefined): Resolution {
  return RESOLUTION_KINDS.has(kindOf(answer) ?? '') && answer !== undefined
    ? answer
    : UNKNOWN_RESOLUTION
}

/** A resolution answer outside the closed set: the compiler proves the set, the runtime does not. */
function unexpected(_answer: never): Unknown {
  return UNKNOWN
}

/** Step 3: the resolution answer, mapped by the group page "端口" table. */
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
      return fail(UNKNOWN)
    default:
      return fail(unexpected(answer))
  }
}

export async function gate<P, S>(
  ports: SkillPorts<P, S>,
  access: Access<P>,
  scope: S,
  capability: CapabilityId,
  basis?: SkillMaterialBasis,
  signal?: AbortSignal,
): Promise<Outcome<Gated, DescribeFailure | Aborted>> {
  // Step 1: a basis of another identity is `bad-basis` inside and `not-available-to-you` outside.
  if (basis !== undefined && !sameCapability(basis.capability, capability))
    return fail(NOT_AVAILABLE)
  // Step 2: the read check, on the spot. No cache and no earlier success stands in for it.
  if (checkpoint(signal) === 'aborted') return fail(ABORTED)
  const verdict = kindOf(await answered(() => ports.readCheck.check(access, scope, capability)))
  if (checkpoint(signal) === 'aborted') return fail(ABORTED)
  if (verdict === 'refused') return fail(NOT_AVAILABLE)
  if (verdict !== 'granted') return fail(UNKNOWN)
  // Step 3: the resolution. The package locator comes only from its answer.
  const answer = await answered(() =>
    ports.resolution.resolve(
      access,
      scope,
      capability,
      basis === undefined ? undefined : { basis },
    ),
  )
  if (checkpoint(signal) === 'aborted') return fail(ABORTED)
  return gatedOf(resolutionOf(answer), basis)
}
