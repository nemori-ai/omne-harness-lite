import type { McpPorts, StopScope } from '@omne-harness/mcp-contract'
import type {
  CredentialUse,
  McpTransport,
  McpTransportFactory,
  ProcessLanding,
} from '@omne-harness/mcp-contract/provider'
import { releasing, reshapedCredentials } from './handles.ts'
import type { Principal } from './identities.ts'
import type { World } from './world.ts'

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

export type StopAnswer = StopScope | 'reject'

export function landingStoppingAs(
  port: ProcessLanding<Principal>,
  answerOf: (index: number) => StopAnswer | undefined,
): ProcessLanding<Principal> {
  let started = 0
  return {
    async start(access, launch, env) {
      const answer = await port.start(access, launch, env)
      if ('failure' in answer) return answer
      const index = started
      started += 1
      const process = answer.ok
      return {
        ok: {
          ...process,
          async stop() {
            const confirmed = await process.stop()
            const scripted = answerOf(index)
            if (scripted === 'reject') throw rejection('stop')
            return scripted ?? confirmed
          },
        },
      }
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
    landing: faults.includes('stop') ? landingStoppingAs(w.landing, () => 'reject') : w.landing,
    credentials: faults.includes('release')
      ? credentialsWhoseReleaseRejects(w.credentials)
      : w.credentials,
  }
}
