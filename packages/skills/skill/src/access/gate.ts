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
import { answered, parseResolution, parseVerdict } from '../port-answer.ts'
import type { SkillPorts } from '../ports.ts'
import { checkpoint } from './checkpoint.ts'

export type Gated = Readonly<{
  ref: SkillRef
  declared: DeclaredProjection
  layer: SourceLayer
  basis?: SkillMaterialBasis
}>

export type Aborted = Extract<SkillFailure, { kind: 'aborted' }>

const NOT_AVAILABLE = Object.freeze({ kind: 'not-available-to-you' } as const)
const UNKNOWN = Object.freeze({ kind: 'unknown' } as const)
const ABORTED = Object.freeze({ kind: 'aborted' } as const)

function gatedOf(
  answer: Resolution | undefined,
  basis: SkillMaterialBasis | undefined,
): Outcome<Gated, DescribeFailure> {
  if (answer === undefined) return fail(UNKNOWN)
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
    default: {
      const exhaustive: never = answer
      return exhaustive
    }
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
  if (basis !== undefined && !sameCapability(basis.capability, capability))
    return fail(NOT_AVAILABLE)
  if (checkpoint(signal) === 'aborted') return fail(ABORTED)
  const verdict = await answered(
    () => ports.readCheck.check(access, scope, capability),
    parseVerdict,
  )
  if (checkpoint(signal) === 'aborted') return fail(ABORTED)
  if (verdict?.kind === 'refused') return fail(NOT_AVAILABLE)
  if (verdict?.kind !== 'granted') return fail(UNKNOWN)
  const answer = await answered(
    () =>
      ports.resolution.resolve(
        access,
        scope,
        capability,
        basis === undefined ? undefined : { basis },
      ),
    parseResolution(basis === undefined ? { capability } : { capability, basis }),
  )
  if (checkpoint(signal) === 'aborted') return fail(ABORTED)
  return gatedOf(answer, basis)
}
