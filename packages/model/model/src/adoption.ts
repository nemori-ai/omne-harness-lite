// Adoption equality, the one comparison of the package: two adoptions are the same when owner,
// name, revision and digest are all equal.
import type { Adoption } from '@omne-harness/model-contract'

export function sameAdoption(left: Adoption, right: Adoption): boolean {
  return (
    left.owner === right.owner &&
    left.name === right.name &&
    left.revision === right.revision &&
    left.digest === right.digest
  )
}
