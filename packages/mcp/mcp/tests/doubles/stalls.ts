// Test helper: ports that stall one call on a deferred the test settles later. They order the
// publish boundary and the connection build against other operations, and they let a port
// answer after the connection bound, so the late arrival is observed.
import type { Access } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { CredentialBinding, EndpointHolding, EndpointRef } from '@omne-harness/mcp-contract'
import type {
  AdoptionView,
  CredentialFailure,
  CredentialPurpose,
  CredentialUse,
  HttpCredentialHandle,
  HttpPurpose,
  ProcessCredentialHandle,
  ProcessLanding,
  ProcessPurpose,
  UseEligibility,
} from '@omne-harness/mcp-contract/provider'
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

/** The landing whose `start` waits on `gate` before it starts the process; `calls` counts the asks. */
export function stallingLanding(
  port: ProcessLanding<Principal>,
): Readonly<{ port: ProcessLanding<Principal>; gate: Deferred<void>; calls: () => number }> {
  const gate = deferred<void>()
  let count = 0
  return {
    gate,
    calls: () => count,
    port: {
      async start(access, launch, env) {
        count += 1
        await gate.promise
        return port.start(access, launch, env)
      },
    },
  }
}

type AnyHandle = ProcessCredentialHandle | HttpCredentialHandle

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
  const counted = (handle: AnyHandle): AnyHandle => ({
    ...handle,
    async release() {
      releases += 1
      await handle.release()
    },
  })
  function acquire(
    access: Access<Principal>,
    holding: EndpointHolding,
    purpose: ProcessPurpose,
    binding: CredentialBinding,
  ): Promise<Outcome<ProcessCredentialHandle, CredentialFailure>>
  function acquire(
    access: Access<Principal>,
    holding: EndpointHolding,
    purpose: HttpPurpose,
    binding: CredentialBinding,
  ): Promise<Outcome<HttpCredentialHandle, CredentialFailure>>
  async function acquire(
    access: Access<Principal>,
    holding: EndpointHolding,
    purpose: CredentialPurpose,
    binding: CredentialBinding,
  ): Promise<Outcome<AnyHandle, CredentialFailure>> {
    await gate.promise
    const answer =
      purpose.kind === 'process-env'
        ? await port.acquire(access, holding, purpose, binding)
        : await port.acquire(access, holding, purpose, binding)
    if ('failure' in answer) return answer
    return { ok: counted(shape(answer.ok)) }
  }
  return { gate, releases: () => releases, port: { acquire } }
}

/**
 * The adoption view whose `endpoint` calls from the `from`-th on never answer: the port is not
 * even asked. `calls` counts them. It is the re-read of the critical section that has to be
 * bounded, so the caller does not wait on this forever.
 */
export function silentAdoption(
  port: AdoptionView<Principal, string>,
  from: number,
): Readonly<{ port: AdoptionView<Principal, string>; calls: () => number }> {
  let count = 0
  return {
    calls: () => count,
    port: {
      endpoints: (access, scope) => port.endpoints(access, scope),
      endpoint(access, ref) {
        count += 1
        return count < from ? port.endpoint(access, ref) : new Promise(() => undefined)
      },
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
  let count = 0
  return {
    gate,
    port: {
      endpoints: (access, scope) => port.endpoints(access, scope),
      async endpoint(access, ref) {
        count += 1
        const answer = await port.endpoint(access, ref)
        if (count === which) await gate.promise
        return answer
      },
    },
  }
}
