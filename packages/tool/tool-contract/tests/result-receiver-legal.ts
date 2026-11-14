import {
  memoryToolResultReceiverFixture,
  type ToolResultReceiverFixture,
} from '@omne-harness/tool-contract/testing'

export type Fixture = ToolResultReceiverFixture<string>

export function oneTenantReceiver(): Fixture {
  const { otherAccess: _dropped, ...rest } = memoryToolResultReceiverFixture()
  return rest
}

export function receiverWithoutCapacity(): Fixture {
  const { tenantCapacity: _dropped, ...rest } = memoryToolResultReceiverFixture()
  return rest
}

export function oneConsumerReceiver(): Fixture {
  const { otherConsumer: _dropped, ...rest } = memoryToolResultReceiverFixture()
  return rest
}

export function receiverWithoutStranger(): Fixture {
  const { strangerAccess: _dropped, ...rest } = memoryToolResultReceiverFixture()
  return rest
}
