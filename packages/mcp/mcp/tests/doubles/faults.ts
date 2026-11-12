// Test helper: the ports of a world whose close-order operations reject after they did their
// work. That is a provider in breach of its contract (T5, CU1), which the table has to
// absorb as MC-14 says. The inner double still records the call, so the trace and the
// counts show what ran before the rejection.
import type { McpPorts } from '@omne-harness/mcp-contract'
import type {
  CredentialUse,
  McpTransport,
  McpTransportFactory,
} from '@omne-harness/mcp-contract/provider'
import { releasing, reshapedCredentials } from './handles.ts'
import type { Principal } from './identities.ts'
import type { World } from './world.ts'

/** The close-order step that rejects after it ran. */
export type Fault = 'close' | 'release'

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

function credentialsWhoseReleaseRejects(port: CredentialUse<Principal>): CredentialUse<Principal> {
  return reshapedCredentials(port, handle =>
    releasing(handle, async () => {
      await handle.release()
      throw rejection('release')
    }),
  )
}

/** The world's ports with the named steps rejecting; the other ports are the world's own. */
export function faulty(w: World, faults: readonly Fault[]): McpPorts<Principal, string> {
  return {
    ...w.ports,
    transports: faults.includes('close') ? transportsWhoseCloseRejects(w.transports) : w.transports,
    credentials: faults.includes('release')
      ? credentialsWhoseReleaseRejects(w.credentials)
      : w.credentials,
  }
}
