import {
  memoryToolStartAuthorizationFixture,
  type ToolStartAuthorizationFixture,
} from '@omne-harness/tool-contract/testing'

export type Fixture = ToolStartAuthorizationFixture<string>

export function withoutAuthorization(): Fixture {
  const { authorization: _dropped, ...rest } = memoryToolStartAuthorizationFixture()
  return rest
}

export function authorizationWithoutSettle(): Fixture {
  const { settle: _dropped, ...rest } = memoryToolStartAuthorizationFixture()
  return rest
}

export function authorizationWithoutOutage(): Fixture {
  const base = memoryToolStartAuthorizationFixture()
  if (base.authorization === undefined) return base
  const { outage: _outage, restore: _restore, ...handles } = base.authorization
  return { ...base, authorization: handles }
}

export function authorizationOneTenant(): Fixture {
  const { otherAccess: _dropped, ...rest } = memoryToolStartAuthorizationFixture()
  return rest
}
