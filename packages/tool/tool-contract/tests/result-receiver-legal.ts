// The receivers of the result push suite that the contract allows, built at the port boundary from
// a fresh fixture of the double.
import {
  memoryToolResultReceiverFixture,
  type ToolResultReceiverFixture,
} from '@omne-harness/tool-contract/testing'

export type Fixture = ToolResultReceiverFixture<string>

/** The double without a second tenant: the cross-tenant cases are not applicable. */
export function oneTenantReceiver(): Fixture {
  const { otherAccess: _dropped, ...rest } = memoryToolResultReceiverFixture()
  return rest
}

/** The double that does not tell its capacity: the capacity case is not applicable. */
export function receiverWithoutCapacity(): Fixture {
  const { tenantCapacity: _dropped, ...rest } = memoryToolResultReceiverFixture()
  return rest
}

/** The double that registers one position only: the case of two positions is not applicable. */
export function oneConsumerReceiver(): Fixture {
  const { otherConsumer: _dropped, ...rest } = memoryToolResultReceiverFixture()
  return rest
}

/** The double without a stranger: the case of the unqualified principal is not applicable. */
export function receiverWithoutStranger(): Fixture {
  const { strangerAccess: _dropped, ...rest } = memoryToolResultReceiverFixture()
  return rest
}
