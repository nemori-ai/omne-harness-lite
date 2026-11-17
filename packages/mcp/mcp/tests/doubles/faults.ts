import type { McpPorts } from '@omne-harness/mcp-contract'
import type {
  CredentialUse,
  McpTransport,
  McpTransportFactory,
} from '@omne-harness/mcp-contract/provider'
import { releasing, reshapedCredentials } from './handles.ts'
import type { Principal } from './identities.ts'
import type { World } from './world.ts'

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

export function faulty(w: World, faults: readonly Fault[]): McpPorts<Principal, string> {
  return {
    ...w.ports,
    transports: faults.includes('close') ? transportsWhoseCloseRejects(w.transports) : w.transports,
    credentials: faults.includes('release')
      ? credentialsWhoseReleaseRejects(w.credentials)
      : w.credentials,
  }
}
