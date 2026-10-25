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

/** The double without the outage handles: the cases of an unreadable dependency are not applicable. */
export function authorizationWithoutOutage(): Fixture {
  const base = memoryToolStartAuthorizationFixture()
  if (base.authorization === undefined) return base
  const { outage: _outage, restore: _restore, ...handles } = base.authorization
  return { ...base, authorization: handles }
}

/** The double without a second tenant: the case of a foreign permit is not applicable. */
export function authorizationOneTenant(): Fixture {
  const { otherAccess: _dropped, ...rest } = memoryToolStartAuthorizationFixture()
  return rest
}
