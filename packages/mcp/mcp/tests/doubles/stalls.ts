// Test helper: ports that stall one call on a deferred the test settles later. They order the
// publish boundary and the connection build against other operations.
import type { Access } from '@omne-harness/legal-identity'
import type { EndpointRef } from '@omne-harness/mcp-contract'
import type { ProcessLanding, UseEligibility } from '@omne-harness/mcp-contract/provider'
import { deferred, type Deferred } from './deferred.ts'
import type { Principal } from './values.ts'

/** The eligibility port whose `which`-th call waits on `gate` before it answers. */
export function stallingEligibility(
  port: UseEligibility<Principal>,
  which: number,
): Readonly<{ port: UseEligibility<Principal>; gate: Deferred<void>; calls: () => number }> {
  const gate = deferred<void>()
  let count = 0
  return {
    gate,
    calls: () => count,
    port: {
      async check(access: Access<Principal>, endpoint: EndpointRef) {
        count += 1
        if (count === which) await gate.promise
        return port.check(access, endpoint)
      },
    },
  }
}

/** The landing whose `start` waits on `gate` before it starts the process. */
export function stallingLanding(
  port: ProcessLanding<Principal>,
): Readonly<{ port: ProcessLanding<Principal>; gate: Deferred<void> }> {
  const gate = deferred<void>()
  return {
    gate,
    port: {
      async start(access, launch, env) {
        await gate.promise
        return port.start(access, launch, env)
      },
    },
  }
}
