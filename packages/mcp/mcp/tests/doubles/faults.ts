// Test helper: the ports of a world whose close-order operations reject after they did their
// work. That is a provider in breach of its contract (T5, PL1, CU1), which the table has to
// absorb as SPEC decision 4 says. The inner double still records the call, so the trace and the
// counts show what ran before the rejection.
import type { McpPorts, StopScope } from '@omne-harness/mcp-contract'
import type {
  CredentialUse,
  McpTransport,
  McpTransportFactory,
  ProcessLanding,
} from '@omne-harness/mcp-contract/provider'
import { releasing, reshapedCredentials } from './handles.ts'
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

/** How a process answers `stop()`: with a range, or by rejecting after it stopped. */
export type StopAnswer = StopScope | 'reject'

/**
 * The landing whose processes answer `stop()` as `answerOf(index)` says at the time of the call
 * (the first process started is 0). `undefined` keeps the inner double's answer. The inner double
 * still records the stop, so the counts show every process that was asked.
 */
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

/** The world's ports with the named steps rejecting; the other ports are the world's own. */
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
