import type { McpConfig, McpPorts, PeerNotification } from '@omne-harness/mcp-contract'
import type { McpTransportFactory } from '@omne-harness/mcp-contract/provider'
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
  type Counted,
  type CountedCredentials,
  type CountedOutputCheck,
} from './ports.ts'
import { reshapedTransports } from './transports.ts'
import { CONFIG } from './world.ts'

type Request = Extract<PeerReceived, { kind: 'request' }>

export type Peer = Readonly<{
  ports: McpPorts<Principal, string>
  config: McpConfig<Principal>
  adoption: Counted<MemoryAdoptionView<Principal, string>>
  eligibility: Counted<MemoryUseEligibility<Principal>>
  credentials: CountedCredentials
  store: MemoryCatalogStore
  checks: CountedOutputCheck
  transports: ScriptedTransportFactory
  opens: () => number
  requests: (method: string) => readonly Request[]
  cancels: () => number
}>

export type CallGate = Readonly<{
  before?: () => Promise<void>
  after?: () => Promise<void>
  notify?: PeerNotification
}>

function gatedCalls(factory: McpTransportFactory, gate: CallGate): McpTransportFactory {
  return reshapedTransports(factory, transport => ({
    async call(request, signal, observe) {
      await gate.before?.()
      if (gate.notify !== undefined) observe?.(gate.notify)
      const called = await transport.call(request, signal, observe)
      await gate.after?.()
      return called
    },
  }))
}

export function peer(
  script: PeerScript,
  options: Readonly<{
    transport?: ScriptedTransportOptions
    callGate?: CallGate
    config?: Partial<McpConfig<Principal>>
  }> = {},
): Peer {
  const adoption = countedAdoption()
  const eligibility = countedEligibility()
  const credentials = countedCredentials()
  const store = createMemoryCatalogStore()
  const checks = countedOutputCheck()
  const transports = createScriptedTransportFactory(script, options.transport ?? {})
  let opens = 0
  let cancels = 0
  const inner =
    options.callGate === undefined ? transports : gatedCalls(transports, options.callGate)
  const counted = reshapedTransports(
    {
      open(material, signal) {
        opens += 1
        return inner.open(material, signal)
      },
    },
    transport => ({
      cancelRequest(requestId) {
        cancels += 1
        return transport.cancelRequest(requestId)
      },
    }),
  )
  const requests = (method: string): readonly Request[] =>
    transports
      .received()
      .flatMap(item => (item.kind === 'request' && item.method === method ? [item] : []))
  return {
    ports: {
      adoption,
      eligibility,
      credentials,
      store,
      transports: counted,
      checkOutput: checks.check,
      clock: { now: () => new Date('2026-11-05T12:00:00Z') },
    },
    config: { ...CONFIG, ...options.config },
    adoption,
    eligibility,
    credentials,
    store,
    checks,
    transports,
    opens: () => opens,
    requests,
    cancels: () => cancels,
  }
}

export function services(p: Pick<Peer, 'ports' | 'config'>, runtime?: TableRuntime) {
  return assemble(p.ports, p.config, runtime)
}

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

export function completed(content: readonly PlainJson[], extra: PlainRecord = {}): PeerReply {
  return { kind: 'result', result: { resultType: 'complete', content, ...extra } }
}

export function taskHandle(taskId: string, hints: PlainRecord = {}): PeerReply {
  return { kind: 'result', result: { resultType: 'task', taskId, ...hints } }
}

export function taskStatus(taskId: string, status: string, members: PlainRecord = {}): PeerReply {
  return { kind: 'result', result: { taskId, status, ...members } }
}

export const text = (value: string): PlainJson => ({ type: 'text', text: value })
