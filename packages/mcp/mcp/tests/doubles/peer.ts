// Test helper: the world of the call port. The ports are the contract's in-memory doubles with
// counts (as in `world.ts`); the transport is the contract's scripted transport, which answers
// from a `PeerScript` and records what the peer received. Cases of the call port and the task
// operations script what the peer says; cases of the connection table keep `world.ts`, which
// scripts what the transport object does.
import type { McpConfig, McpPorts } from '@omne-harness/mcp-contract'
import type { McpTransport, McpTransportFactory } from '@omne-harness/mcp-contract/provider'
import {
  createMemoryCatalogStore,
  createScriptedTransportFactory,
  type MemoryAdoptionView,
  type MemoryCatalogStore,
  type MemoryUseEligibility,
  type PeerReceived,
  type PeerReply,
  type PeerScript,
  type PlainJson,
  type ScriptedTransportFactory,
  type ScriptedTransportOptions,
} from '@omne-harness/mcp-contract/testing'
import { assemble } from '../../src/internal/assembly.ts'
import type { TableRuntime } from '../../src/internal/table.ts'
import type { Principal } from './identities.ts'
import {
  countedAdoption,
  countedCredentials,
  countedEligibility,
  countedOutputCheck,
  scriptedLanding,
  type Counted,
  type CountedCredentials,
  type CountedOutputCheck,
  type ScriptedLanding,
} from './ports.ts'
import { CONFIG } from './world.ts'

type Request = Extract<PeerReceived, { kind: 'request' }>

export type Peer = Readonly<{
  ports: McpPorts<Principal, string>
  config: McpConfig<Principal>
  adoption: Counted<MemoryAdoptionView<Principal, string>>
  eligibility: Counted<MemoryUseEligibility<Principal>>
  credentials: CountedCredentials
  landing: ScriptedLanding
  store: MemoryCatalogStore
  checks: CountedOutputCheck
  /** The scripted transport factory, with what the peer received. */
  transports: ScriptedTransportFactory
  /** How many transports were opened. */
  opens: () => number
  /** The requests of `method` the peer received, in order. */
  requests: (method: string) => readonly Request[]
  /** How many `notifications/cancelled` the peer received (stdio material). */
  cancels: () => number
}>

/** Where a transport's `call` waits on the case: before it sends, or after it sent, before it answers. */
export type CallGate = Readonly<{ before?: () => Promise<void>; after?: () => Promise<void> }>

/** A factory whose transports' `call` waits on the gate; the test orders a cancel with it. */
function gatedCalls(factory: McpTransportFactory, gate: CallGate): McpTransportFactory {
  // The scripted transport is a class instance: its methods are not own properties, so each one
  // is delegated by name.
  const gated = (transport: McpTransport): McpTransport => ({
    generation: transport.generation,
    discover: () => transport.discover(),
    listActions: cursor => transport.listActions(cursor),
    async call(request, signal, observe) {
      await gate.before?.()
      const called = await transport.call(request, signal, observe)
      await gate.after?.()
      return called
    },
    cancelRequest: requestId => transport.cancelRequest(requestId),
    getTask: taskId => transport.getTask(taskId),
    updateTask: (taskId, inputResponses) => transport.updateTask(taskId, inputResponses),
    getTaskResult: taskId => transport.getTaskResult(taskId),
    cancelTask: taskId => transport.cancelTask(taskId),
    close: () => transport.close(),
  })
  return {
    async open(material, signal) {
      const opened = await factory.open(material, signal)
      return 'failure' in opened ? opened : { ok: gated(opened.ok) }
    },
  }
}

export function peer(
  script: PeerScript,
  options: Readonly<{
    transport?: ScriptedTransportOptions
    /** Where every `call` waits on the case. */
    callGate?: CallGate
    facilities?: readonly string[]
    config?: Partial<McpConfig<Principal>>
  }> = {},
): Peer {
  const adoption = countedAdoption()
  const eligibility = countedEligibility()
  const credentials = countedCredentials()
  const landing = scriptedLanding({ facilities: options.facilities ?? [] })
  const store = createMemoryCatalogStore()
  const checks = countedOutputCheck()
  const transports = createScriptedTransportFactory(script, options.transport ?? {})
  let opens = 0
  const inner =
    options.callGate === undefined ? transports : gatedCalls(transports, options.callGate)
  const counted: McpTransportFactory = {
    open(material, signal) {
      opens += 1
      return inner.open(material, signal)
    },
  }
  const requests = (method: string): readonly Request[] =>
    transports
      .received()
      .flatMap(item => (item.kind === 'request' && item.method === method ? [item] : []))
  return {
    ports: {
      adoption,
      eligibility,
      credentials,
      landing,
      store,
      transports: counted,
      checkOutput: checks.check,
      clock: { now: () => new Date('2026-11-05T12:00:00Z') },
    },
    config: { ...CONFIG, ...options.config },
    adoption,
    eligibility,
    credentials,
    landing,
    store,
    checks,
    transports,
    opens: () => opens,
    requests,
    cancels: () =>
      transports
        .received()
        .filter(item => item.kind === 'notification' && item.method === 'notifications/cancelled')
        .length,
  }
}

/** The services on a peer, through the one assembly, with the table exposed. */
export function services(p: Pick<Peer, 'ports' | 'config'>, runtime?: TableRuntime) {
  return assemble(p.ports, p.config, runtime)
}

/** A `tools/list` reply that lists the tools, each with an object input schema. */
export function listing(
  tools: readonly Readonly<{ name: string; outputSchema?: PlainJson }>[],
): PeerReply {
  return {
    kind: 'result',
    result: {
      tools: tools.map(tool => ({
        name: tool.name,
        inputSchema: { type: 'object' },
        ...(tool.outputSchema === undefined ? {} : { outputSchema: tool.outputSchema }),
      })),
    },
  }
}

type PlainRecord = Readonly<{ [key: string]: PlainJson }>

/** A `tools/call` result with the content blocks given, the modern way. */
export function completed(content: readonly PlainJson[], extra: PlainRecord = {}): PeerReply {
  return { kind: 'result', result: { resultType: 'complete', content, ...extra } }
}

/** A task handle as the peer answers it to `tools/call`. */
export function taskHandle(taskId: string, hints: PlainRecord = {}): PeerReply {
  return { kind: 'result', result: { resultType: 'task', taskId, ...hints } }
}

/** A `tasks/get` result in `status`, with the members given. */
export function taskStatus(taskId: string, status: string, members: PlainRecord = {}): PeerReply {
  return { kind: 'result', result: { taskId, status, ...members } }
}

export const text = (value: string): PlainJson => ({ type: 'text', text: value })
