import type { Access } from '@omne-harness/legal-identity'
import type { EndpointRef } from '@omne-harness/mcp-contract'
import type {
  AdoptionView,
  CatalogStore,
  CredentialUse,
  ProcessLanding,
  UseEligibility,
} from '@omne-harness/mcp-contract/provider'
import { from, only, picker, type Which } from './calls.ts'
import { deferred, type Deferred } from './deferred.ts'
import { releasing, reshapedCredentials, type AnyHandle } from './handles.ts'
import type { Principal } from './identities.ts'

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

export function armedEligibility(port: UseEligibility<Principal>): Readonly<{
  port: UseEligibility<Principal>
  arm(): Readonly<{ reached: Promise<void>; release: () => void }>
}> {
  let armed: Readonly<{ reached: Deferred<void>; held: Deferred<void> }> | undefined
  return {
    arm() {
      const next = { reached: deferred<void>(), held: deferred<void>() }
      armed = next
      return { reached: next.reached.promise, release: () => next.held.resolve() }
    },
    port: {
      async check(access: Access<Principal>, endpoint: EndpointRef) {
        const hold = armed
        if (hold !== undefined) {
          armed = undefined
          hold.reached.resolve()
          await hold.held.promise
        }
        return port.check(access, endpoint)
      },
    },
  }
}

export function armedStore<T extends CatalogStore>(
  store: T,
): Readonly<{ port: T; arm(): Readonly<{ reached: Promise<void>; release: () => void }> }> {
  let armed: Readonly<{ reached: Deferred<void>; held: Deferred<void> }> | undefined
  return {
    arm() {
      const next = { reached: deferred<void>(), held: deferred<void>() }
      armed = next
      return { reached: next.reached.promise, release: () => next.held.resolve() }
    },
    port: {
      ...store,
      async read(key) {
        const hold = armed
        if (hold !== undefined) {
          armed = undefined
          hold.reached.resolve()
          await hold.held.promise
        }
        return store.read(key)
      },
    },
  }
}

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

export function stallingStops(
  port: ProcessLanding<Principal>,
  which: Which,
): Readonly<{ port: ProcessLanding<Principal>; gate: Deferred<void> }> {
  const gate = deferred<void>()
  const landed = picker(which)
  return {
    gate,
    port: {
      async start(access, launch, env) {
        const answer = await port.start(access, launch, env)
        if ('failure' in answer) return answer
        const stalls = landed.next()
        const process = answer.ok
        return {
          ok: {
            ...process,
            async stop() {
              if (stalls) await gate.promise
              return process.stop()
            },
          },
        }
      },
    },
  }
}

export function stallingReleases(
  port: CredentialUse<Principal>,
  which: Which,
): Readonly<{ port: CredentialUse<Principal>; gate: Deferred<void> }> {
  const gate = deferred<void>()
  const acquired = picker(which)
  return {
    gate,
    port: reshapedCredentials(port, handle => {
      const stalls = acquired.next()
      return releasing(handle, async () => {
        if (stalls) await gate.promise
        await handle.release()
      })
    }),
  }
}

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

export function adoptionBefore(
  port: AdoptionView<Principal, string>,
  before: (call: number) => void,
): AdoptionView<Principal, string> {
  let count = 0
  return {
    endpoints: (access, scope) => port.endpoints(access, scope),
    async endpoint(access, ref) {
      count += 1
      before(count)
      return port.endpoint(access, ref)
    },
  }
}

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
