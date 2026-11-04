// Test helper: the ports of a world whose close-order operations reject after they did their
// work. That is a provider in breach of its contract (T5, PL1, CU1), which the table has to
// absorb as SPEC decision 4 says. The inner double still records the call, so the trace and the
// counts show what ran before the rejection.
import type { Access } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { CredentialBinding, EndpointHolding, McpPorts } from '@omne-harness/mcp-contract'
import type {
  CredentialFailure,
  CredentialPurpose,
  CredentialUse,
  HttpCredentialHandle,
  HttpPurpose,
  McpTransport,
  McpTransportFactory,
  ProcessCredentialHandle,
  ProcessLanding,
  ProcessPurpose,
} from '@omne-harness/mcp-contract/provider'
import type { Principal } from './values.ts'
import type { World } from './world.ts'

/** The close-order step that rejects after it ran. */
export type Fault = 'close' | 'stop' | 'release'

function rejection(fault: Fault): Error {
  return new Error(`${fault} rejected`)
}

function closeRejects(transport: McpTransport): McpTransport {
  return {
    ...transport,
    async close() {
      await transport.close()
      throw rejection('close')
    },
  }
}

function transportsWhoseCloseRejects(factory: McpTransportFactory): McpTransportFactory {
  return {
    async open(material, signal) {
      const opened = await factory.open(material, signal)
      return 'failure' in opened ? opened : { ok: closeRejects(opened.ok) }
    },
  }
}

function landingWhoseStopRejects(port: ProcessLanding<Principal>): ProcessLanding<Principal> {
  return {
    async start(access, launch, env) {
      const started = await port.start(access, launch, env)
      if ('failure' in started) return started
      const process = started.ok
      return {
        ok: {
          ...process,
          async stop() {
            await process.stop()
            throw rejection('stop')
          },
        },
      }
    },
  }
}

type AnyHandle = ProcessCredentialHandle | HttpCredentialHandle

function releaseRejects(handle: AnyHandle): AnyHandle {
  return {
    ...handle,
    async release() {
      await handle.release()
      throw rejection('release')
    },
  }
}

function credentialsWhoseReleaseRejects(port: CredentialUse<Principal>): CredentialUse<Principal> {
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
    const answer =
      purpose.kind === 'process-env'
        ? await port.acquire(access, holding, purpose, binding)
        : await port.acquire(access, holding, purpose, binding)
    return 'failure' in answer ? answer : { ok: releaseRejects(answer.ok) }
  }
  return { acquire }
}

/** The world's ports with the named steps rejecting; the other ports are the world's own. */
export function faulty(w: World, faults: readonly Fault[]): McpPorts<Principal, string> {
  return {
    ...w.ports,
    transports: faults.includes('close') ? transportsWhoseCloseRejects(w.transports) : w.transports,
    landing: faults.includes('stop') ? landingWhoseStopRejects(w.landing) : w.landing,
    credentials: faults.includes('release')
      ? credentialsWhoseReleaseRejects(w.credentials)
      : w.credentials,
  }
}
