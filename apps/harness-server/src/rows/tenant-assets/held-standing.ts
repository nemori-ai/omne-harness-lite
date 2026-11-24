import type { Context } from '@deepseek-ai/cordis'
import {
  evaluate,
  layerInputsOf,
  type AssetStanding,
  type Candidate,
  type CapabilityId,
  type PackageRejection,
} from '@omne-harness/assets'
import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'

export type HeldStanding = Readonly<{ standing: AssetStanding; candidate: Candidate }>

/** How what a tenant holds under a capability stands by the asset rules, read where the registry stands; undefined: it holds none, or it cannot be read. */
export function heldStandingOf(
  ctx: Context,
  capability: CapabilityId,
  tenantRef: string,
): HeldStanding | undefined {
  const reading = ctx.get(assetCategoriesKey)?.held(capability, tenantRef)
  if (reading === undefined) return undefined
  const layers = layerInputsOf(reading, tenantRef)
  const answer = evaluate({ layers, eligible: () => 'yes' })
  if (answer.kind === 'unavailable') return undefined
  if (answer.kind === 'winner' && answer.layer === 'tenant')
    return { standing: { kind: 'selected' }, candidate: answer.candidate }
  const out = answer.filtered.find(entry => entry.layer === 'tenant')
  if (out === undefined) return undefined
  const { reason, by, candidate } = out
  return {
    standing: { kind: 'filtered', reason, ...(by === undefined ? {} : { by }) },
    candidate,
  }
}

/** Why a directory is not taken as a package of its category, as one line. */
export function rejectionText(rejection: PackageRejection): string {
  switch (rejection.kind) {
    case 'invalid-package':
      return rejection.reason
    case 'limit-exceeded':
      return `the directory is over the ${rejection.limit} limit of its category`
    case 'source-failed':
      return `the directory cannot be read (${rejection.failure})`
    default:
      return rejection.kind
  }
}
