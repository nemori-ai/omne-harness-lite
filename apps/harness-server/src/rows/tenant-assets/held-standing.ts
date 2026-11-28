import type { Context } from '@deepseek-ai/cordis'
import {
  evaluate,
  layerInputsOf,
  publishStanding,
  type AssetStanding,
  type Candidate,
  type CapabilityId,
  type PackageRejection,
  type PublishStanding,
} from '@omne-harness/assets'
import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'

export type HeldStanding = Readonly<{ standing: AssetStanding; candidate: Candidate }>

const UNREAD: PublishStanding = Object.freeze({ kind: 'unavailable' })

/** The layers one tenant sees under a capability, read where the registry stands now; undefined without the categories. */
function layersOf(ctx: Context, capability: CapabilityId, tenantRef: string) {
  const reading = ctx.get(assetCategoriesKey)?.held(capability, tenantRef)
  return reading === undefined ? undefined : layerInputsOf(reading, tenantRef)
}

/** How a new holding of this tenant would stand against the wider layers. A publish and its preview both ask this. */
export function publishStandingOf(
  ctx: Context,
  capability: CapabilityId,
  tenantRef: string,
): PublishStanding {
  const layers = layersOf(ctx, capability, tenantRef)
  return layers === undefined ? UNREAD : publishStanding(layers, 'tenant')
}

/** How what a tenant holds under a capability stands by the asset rules, read where the registry stands; undefined: it holds none, or it cannot be read. */
export function heldStandingOf(
  ctx: Context,
  capability: CapabilityId,
  tenantRef: string,
): HeldStanding | undefined {
  const layers = layersOf(ctx, capability, tenantRef)
  if (layers === undefined) return undefined
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
