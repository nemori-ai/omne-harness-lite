import {
  memoryToolStartFenceFixture,
  type ToolStartFenceFixture,
} from '@omne-harness/tool-contract/testing'

export type Fixture = ToolStartFenceFixture<string>

export function oneTenantFence(): Fixture {
  const { otherAccess: _dropped, ...rest } = memoryToolStartFenceFixture()
  return rest
}

export function fenceWithoutSettle(): Fixture {
  const { settle: _dropped, ...rest } = memoryToolStartFenceFixture()
  return rest
}

export function fenceWithoutStranger(): Fixture {
  const { strangerAccess: _dropped, ...rest } = memoryToolStartFenceFixture()
  return rest
}
