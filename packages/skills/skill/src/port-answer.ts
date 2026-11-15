import type { CapabilityId } from '@omne-harness/assets'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { sameCapability, type SkillMaterialBasis } from '@omne-harness/skill-contract'
import type {
  CatalogResolution,
  ReadVerdict,
  Resolution,
  SkillRef,
} from '@omne-harness/skill-contract/provider'
import { adoptedOf, fieldOf, has, listOf, standInOf } from './answer-values.ts'

export async function answered<T>(
  call: () => Promise<unknown>,
  parse: (answer: unknown) => T | undefined,
): Promise<T | undefined> {
  try {
    return parse(await call())
  } catch {
    return undefined
  }
}

const GRANTED: ReadVerdict = Object.freeze({ kind: 'granted' })
const REFUSED: ReadVerdict = Object.freeze({ kind: 'refused' })
const UNDECIDED: ReadVerdict = Object.freeze({ kind: 'unknown' })
const BASIS_NOT_LAWFUL: Resolution = Object.freeze({ kind: 'basis-not-lawful' })
const NONE: Resolution = Object.freeze({ kind: 'none' })
const UNKNOWN_RESOLUTION: Resolution = Object.freeze({ kind: 'unknown' })

export function parseVerdict(answer: unknown): ReadVerdict | undefined {
  switch (fieldOf(answer, 'kind')) {
    case 'granted':
      return GRANTED
    case 'refused':
      return REFUSED
    case 'unknown':
      return UNDECIDED
  }
  return undefined
}

export type ResolveRequest = Readonly<{ capability: CapabilityId; basis?: SkillMaterialBasis }>

function namesRequested(ref: SkillRef, request: ResolveRequest): boolean {
  if (!sameCapability(ref.capability, request.capability)) return false
  const { basis } = request
  if (basis === undefined) return true
  return (
    ref.layer === basis.layer &&
    (basis.assetVersion === undefined || ref.assetVersion === basis.assetVersion) &&
    ref.digest === basis.digest
  )
}

export function parseResolution(
  request: ResolveRequest,
): (answer: unknown) => Resolution | undefined {
  return answer => {
    switch (fieldOf(answer, 'kind')) {
      case 'adopted': {
        const adopted = adoptedOf(answer)
        return adopted !== undefined && namesRequested(adopted.ref, request) ? adopted : undefined
      }
      case 'known-unavailable': {
        const standIn = standInOf(answer)
        return standIn !== undefined && sameCapability(standIn.capability, request.capability)
          ? standIn
          : undefined
      }
      default:
        return payloadFreeOf(answer)
    }
  }
}

function payloadFreeOf(answer: unknown): Resolution | undefined {
  switch (fieldOf(answer, 'kind')) {
    case 'basis-not-lawful':
      return BASIS_NOT_LAWFUL
    case 'none':
      return NONE
    case 'unknown':
      return UNKNOWN_RESOLUTION
  }
  return undefined
}

function parseLawfulItem(answer: unknown): CatalogResolution | undefined {
  switch (fieldOf(answer, 'kind')) {
    case 'adopted':
      return adoptedOf(answer)
    case 'known-unavailable':
      return standInOf(answer)
  }
  return undefined
}

export function parseLawfulSet(
  answer: unknown,
): Outcome<readonly CatalogResolution[], 'unknown'> | undefined {
  if (has(answer, 'ok')) {
    const items = listOf(answer.ok, parseLawfulItem)
    return items === undefined ? undefined : succeed(items)
  }
  return fieldOf(answer, 'failure') === 'unknown' ? fail('unknown') : undefined
}
