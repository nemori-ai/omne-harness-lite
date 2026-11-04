// Test helper: ports that stall one call on a deferred the test settles later. They order the
// publish boundary and the connection build against other operations, and they let a port
// answer after the connection bound, so the late arrival is observed.
import type { Access } from '@omne-harness/legal-identity'
import type { EndpointRef } from '@omne-harness/mcp-contract'
import type {
  AdoptionView,
  CredentialUse,
  ProcessLanding,
  UseEligibility,
} from '@omne-harness/mcp-contract/provider'
import { from, only, picker, type Which } from './calls.ts'
import { deferred, type Deferred } from './deferred.ts'
import { releasing, reshapedCredentials, type AnyHandle } from './handles.ts'
import type { Principal } from './values.ts'

/** The eligibility port whose `which`-th call waits on `gate` before it answers. */
export function stallingEligibility(
  port: UseEligibility<Principal>,
  which: number,
): Readonly<{ port: UseEligibility<Principal>; gate: Deferred<void>; calls: () => number }> {
  const gate = deferred<void>()
  const asked = picker(only(which))
  return {
    gate,
    calls: asked.calls,
    port: {
      async check(access: Access<Principal>, endpoint: EndpointRef) {
        if (asked.next()) await gate.promise
        return port.check(access, endpoint)
      },
    },
  }
}

/**
 * The landing whose `start` calls picked by `which` (every call unless given) wait on `gate`
 * before they start the process; `calls` counts the asks.
 */
export function stallingLanding(
  port: ProcessLanding<Principal>,
  which: Which = from(1),
): Readonly<{ port: ProcessLanding<Principal>; gate: Deferred<void>; calls: () => number }> {
  const gate = deferred<void>()
  const asked = picker(which)
  return {
    gate,
    calls: asked.calls,
    port: {
      async start(access, launch, env) {
        if (asked.next()) await gate.promise
        return port.start(access, launch, env)
      },
    },
  }
}

/**
 * The credential port whose `acquire` waits on `gate` before it answers; `shape` replaces the
 * handle it hands out (a handle whose `release` rejects, for instance). `releases` counts the
 * release calls on the shaped handles.
 */
export function stallingCredentials(
  port: CredentialUse<Principal>,
  shape: (handle: AnyHandle) => AnyHandle = handle => handle,
): Readonly<{ port: CredentialUse<Principal>; gate: Deferred<void>; releases: () => number }> {
  const gate = deferred<void>()
  let releases = 0
  const counted = (handle: AnyHandle): AnyHandle =>
    releasing(handle, async () => {
      releases += 1
      await handle.release()
    })
  return {
    gate,
    releases: () => releases,
    port: reshapedCredentials(
      port,
      handle => counted(shape(handle)),
      () => gate.promise,
    ),
  }
}

/**
 * The adoption view whose `endpoint` calls picked by `which` never answer: the port is not even
 * asked. `calls` counts them all. It is the re-read of the critical section that has to be
 * bounded, so the caller does not wait on this forever.
 */
export function silentAdoption(
  port: AdoptionView<Principal, string>,
  which: Which,
): Readonly<{ port: AdoptionView<Principal, string>; calls: () => number }> {
  const asked = picker(which)
  return {
    calls: asked.calls,
    port: {
      endpoints: (access, scope) => port.endpoints(access, scope),
      endpoint: (access, ref) =>
        asked.next() ? new Promise(() => undefined) : port.endpoint(access, ref),
    },
  }
}

/**
 * The adoption view whose `which`-th `endpoint` call asks the port at once but hands the answer
 * over only after `gate`: a read that answered early and is delivered late.
 */
export function stallingAdoption(
  port: AdoptionView<Principal, string>,
  which: number,
): Readonly<{ port: AdoptionView<Principal, string>; gate: Deferred<void> }> {
  const gate = deferred<void>()
  const asked = picker(only(which))
  return {
    gate,
    port: {
      endpoints: (access, scope) => port.endpoints(access, scope),
      async endpoint(access, ref) {
        const delayed = asked.next()
        const answer = await port.endpoint(access, ref)
        if (delayed) await gate.promise
        return answer
      },
    },
  }
}
