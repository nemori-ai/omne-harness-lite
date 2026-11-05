// The one comparison of capability identities in Skill: two identities are the same identity when
// their category and their name are equal. Every member compares through it, so that no member
// compares the objects themselves or only the names.
import type { CapabilityId } from '@omne-harness/assets'

export function sameCapability(left: CapabilityId, right: CapabilityId): boolean {
  return left.category === right.category && left.name === right.name
}
