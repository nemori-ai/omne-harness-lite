// The providers of the start fence suite that the contract allows. Each is built at the port
// boundary from a fresh fixture of the double: it drops a handle, and it never reaches a control.
import {
  memoryToolStartFenceFixture,
  type ToolStartFenceFixture,
} from '@omne-harness/tool-contract/testing'

export type Fixture = ToolStartFenceFixture<string>

/** The double without a second tenant: the cross-tenant case is not applicable. */
export function oneTenantFence(): Fixture {
  const { otherAccess: _dropped, ...rest } = memoryToolStartFenceFixture()
  return rest
}

/** The double without `settle`: every answer of it is final, so nothing needs it. */
export function fenceWithoutSettle(): Fixture {
  const { settle: _dropped, ...rest } = memoryToolStartFenceFixture()
  return rest
}
