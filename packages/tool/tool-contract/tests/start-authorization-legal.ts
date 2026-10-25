// The providers of the authorization consumption suite that the contract allows, built at the port
// boundary from a fresh fixture of the double.
import {
  memoryToolStartAuthorizationFixture,
  type ToolStartAuthorizationFixture,
} from '@omne-harness/tool-contract/testing'

export type Fixture = ToolStartAuthorizationFixture<string>

/** A start authority that binds no authorization permit: every case is not applicable. */
export function withoutAuthorization(): Fixture {
  const { authorization: _dropped, ...rest } = memoryToolStartAuthorizationFixture()
  return rest
}

/** The double without `settle`: every answer of it is final, so nothing needs it. */
export function authorizationWithoutSettle(): Fixture {
  const { settle: _dropped, ...rest } = memoryToolStartAuthorizationFixture()
  return rest
}
