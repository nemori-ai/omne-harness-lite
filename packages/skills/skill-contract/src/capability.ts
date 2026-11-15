import type { CapabilityId } from '@omne-harness/assets'

export function sameCapability(left: CapabilityId, right: CapabilityId): boolean {
  return left.category === right.category && left.name === right.name
}
