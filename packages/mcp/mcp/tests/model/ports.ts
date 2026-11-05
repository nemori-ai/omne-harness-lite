// Explorer ports: every call of the MCP ports, and of the handles, processes and transports they
// hand out, is a `ScriptedPortCall`. A call is decided twice. When it is made, the schedule says
// whether it throws synchronously. Afterwards it stays pending until the explorer settles it with
// one of the port's answers (`ok`, a failure, `reject`, or `unconfirmed` for `stop()`), or leaves
// it pending forever (a hang). A call answered after its bound fired is a late answer. The ports
// also keep the ledger of every resource they hand out, which the properties read.
import type { Access } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  CatalogKey,
  ConnectionKey,
  CredentialBinding,
  EndpointHolding,
  Generation,
  McpPorts,
  PeerIdentity,
  StopScope,
} from '@omne-harness/mcp-contract'
import type {
  AdoptedEndpoint,
  CredentialFailure,
  HttpCredentialHandle,
  HttpPurpose,
  McpTransport,
  ProcessCredentialHandle,
  ProcessHandle,
  ProcessPurpose,
  TransportFailure,
  TransportMaterial,
} from '@omne-harness/mcp-contract/provider'
import type { AdmittedEndpoint } from '../../src/internal/gate.ts'
import { catalogKeyTextOf } from '../../src/internal/text.ts'
import { peerIdentityOf } from '@omne-harness/mcp-contract/testing'
import { type Principal } from '../doubles/identities.ts'

/** The answers of each port, the lawful one first. The closure phases answer with the first. */
export const PORT_ANSWERS = {
  'adoption.endpoint': ['ok', 'fail', 'reject'],
  'credentials.acquire': ['ok', 'fail', 'reject'],
  'landing.start': ['ok', 'fail', 'reject'],
  'transports.open': ['ok', 'fail', 'reject'],
  'transport.discover': ['ok', 'fail', 'reject'],
  'transport.close': ['ok', 'reject'],
  'process.stop': ['ok', 'unconfirmed', 'reject'],
  'credential.release': ['ok', 'reject'],
  'store.read': ['ok', 'fail', 'reject'],
} as const

export type PortName = keyof typeof PORT_ANSWERS
export type Answer = (typeof PORT_ANSWERS)[PortName][number]

/** A way a call can go other than its lawful answer; each one spends the deviation budget. */
export type Deviation = Exclude<Answer, 'ok'> | 'throw'

/** The ports whose calls the connection table waits for under a bound (MC-5). */
export const BOUNDED_PORTS: ReadonlySet<PortName> = new Set<PortName>([
  'adoption.endpoint',
  'credentials.acquire',
  'landing.start',
  'transports.open',
  'transport.discover',
])

/** The three steps of the close order (MC-14). */
export const TEARDOWN_PORTS: ReadonlySet<PortName> = new Set<PortName>([
  'transport.close',
  'process.stop',
  'credential.release',
])

/** One connection key of the scenario: who asks, for what, and the token the gate gave. */
export type ModelKey = Readonly<{
  name: string
  access: Access<Principal>
  holding: EndpointHolding
  adopted: AdoptedEndpoint
  admitted: AdmittedEndpoint
  connectionKey: ConnectionKey
  catalogKeyText: string
}>

/** What a call was made under: the client operation it descends from, and its bound. */
export type Context = Readonly<{ op: string; timer?: string }>

export type ScriptedPortCall = Readonly<{
  /** The order the call was made in, within one run. */
  seq: number
  port: PortName
  /** The key the arguments name. */
  key: string
  /** The resource the call acts on, or the key for a port without one. */
  subject: string
  context: Context | undefined
  /** The functions of `src/` on the stack when the call was made: where its answer goes. */
  site: string
}>

/** A port call that threw or rejected on the explorer's say, with the call it belongs to. */
export class PortFault extends Error {
  readonly call: ScriptedPortCall
  readonly how: 'threw' | 'rejected'

  constructor(call: ScriptedPortCall, how: 'threw' | 'rejected') {
    super(`${call.port} ${call.subject} ${how}`)
    this.name = 'PortFault'
    this.call = call
    this.how = how
  }
}

export type CallRequest<T> = Readonly<{
  port: PortName
  key: string
  subject: string
  /** The value of an answer that does not reject. */
  value: (answer: Exclude<Answer, 'reject'>) => T
  /** Told how the call ended: an answer, or that it threw when it was made. */
  ended?: (how: Answer | 'throw') => void
}>

/** The explorer side of the ports: it registers each call and decides whether it throws now. */
export interface CallDesk {
  open<T>(request: CallRequest<T>): Promise<T>
}

export type HandleRecord = { readonly name: string; readonly key: string; releases: number }

export type ProcessRecord = {
  readonly name: string
  readonly key: string
  /** The credential handle the process carries in its environment. */
  readonly handle: string | undefined
  stops: number
  lastStop: StopScope | 'rejected' | 'threw' | undefined
}

export type TransportRecord = {
  readonly name: string
  readonly key: string
  readonly generation: Generation
  closes: number
}

/** Every resource the ports handed out, with what was asked of it. */
export type Ledger = Readonly<{
  handles: HandleRecord[]
  processes: ProcessRecord[]
  transports: TransportRecord[]
  /** Arguments of one call that name two keys (P5). */
  crossings: string[]
  /** Handles released while a process that carries them had no answer to `stop()` (P1, S9). */
  earlyReleases: string[]
  /** The name of each handle, process and transport object the ports handed out. */
  names: WeakMap<object, string>
}>

export function emptyLedger(): Ledger {
  return {
    handles: [],
    processes: [],
    transports: [],
    crossings: [],
    earlyReleases: [],
    names: new WeakMap(),
  }
}

function notModelled(member: string): never {
  throw new TypeError(`${member} is outside the lifecycle model`)
}

const PEER: PeerIdentity = peerIdentityOf()
const NOT_SENT: TransportFailure = { kind: 'not-sent', cause: 'connection-unavailable' }
const STREAM_BROKEN: TransportFailure = { kind: 'no-answer', cause: 'stream-broken' }

function stopScopeOf(answer: Exclude<Answer, 'reject'>): StopScope {
  return answer === 'ok' ? 'tree-confirmed' : 'unconfirmed'
}

function nameOf(prefix: string, key: ModelKey, records: readonly { key: string }[]): string {
  return `${prefix}${key.name}${records.filter(item => item.key === key.name).length + 1}`
}

/**
 * The MCP ports on `desk`, for `keys`. Stdio with a process credential only: the HTTP purpose,
 * eligibility, the listing and the store's write are not reached by the connection table.
 */
export function scriptedPorts(
  desk: CallDesk,
  keys: readonly ModelKey[],
  ledger: Ledger,
): McpPorts<Principal, string> {
  const handleOf = new WeakMap<object, HandleRecord>()
  const processOf = new WeakMap<object, ProcessRecord>()

  const keyOfAccess = (access: Access<Principal>): ModelKey =>
    keys.find(item => item.access === access) ?? notModelled('an access outside the scenario')

  function handleFor(key: ModelKey): ProcessCredentialHandle {
    const record: HandleRecord = {
      name: nameOf('h', key, ledger.handles),
      key: key.name,
      releases: 0,
    }
    ledger.handles.push(record)
    const handle: ProcessCredentialHandle = {
      purpose: 'process-env',
      release() {
        record.releases += 1
        for (const process of ledger.processes)
          if (process.handle === record.name && process.lastStop === undefined)
            ledger.earlyReleases.push(
              `${record.name} released before ${process.name} answered stop()`,
            )
        return desk.open({
          port: 'credential.release',
          key: key.name,
          subject: record.name,
          value: () => undefined,
        })
      },
    }
    handleOf.set(handle, record)
    ledger.names.set(handle, record.name)
    return handle
  }

  function processFor(key: ModelKey, handle: HandleRecord | undefined): ProcessHandle {
    const record: ProcessRecord = {
      name: nameOf('p', key, ledger.processes),
      key: key.name,
      handle: handle?.name,
      stops: 0,
      lastStop: undefined,
    }
    ledger.processes.push(record)
    const process: ProcessHandle = {
      stdin: new WritableStream<Uint8Array>(),
      stdout: new ReadableStream<Uint8Array>(),
      stderr: new ReadableStream<string>(),
      exited: new Promise<void>(() => undefined),
      stop() {
        record.stops += 1
        return desk.open({
          port: 'process.stop',
          key: key.name,
          subject: record.name,
          value: stopScopeOf,
          ended: how => {
            record.lastStop =
              how === 'throw' ? 'threw' : how === 'reject' ? 'rejected' : stopScopeOf(how)
          },
        })
      },
    }
    processOf.set(process, record)
    ledger.names.set(process, record.name)
    return process
  }

  function transportFor(key: ModelKey, generation: Generation): McpTransport {
    const record: TransportRecord = {
      name: nameOf('t', key, ledger.transports),
      key: key.name,
      generation,
      closes: 0,
    }
    ledger.transports.push(record)
    const transport: McpTransport = {
      generation,
      discover: () =>
        desk.open<Outcome<PeerIdentity, TransportFailure>>({
          port: 'transport.discover',
          key: key.name,
          subject: record.name,
          value: answer => (answer === 'ok' ? { ok: PEER } : { failure: STREAM_BROKEN }),
        }),
      close() {
        record.closes += 1
        return desk.open({
          port: 'transport.close',
          key: key.name,
          subject: record.name,
          value: () => undefined,
        })
      },
      listActions: () => notModelled('transport.listActions'),
      call: () => notModelled('transport.call'),
      cancelRequest: () => notModelled('transport.cancelRequest'),
      getTask: () => notModelled('transport.getTask'),
      updateTask: () => notModelled('transport.updateTask'),
      getTaskResult: () => notModelled('transport.getTaskResult'),
      cancelTask: () => notModelled('transport.cancelTask'),
    }
    ledger.names.set(transport, record.name)
    return transport
  }

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
  function acquire(
    access: Access<Principal>,
    holding: EndpointHolding,
    purpose: ProcessPurpose | HttpPurpose,
  ): Promise<Outcome<ProcessCredentialHandle | HttpCredentialHandle, CredentialFailure>> {
    const key = keyOfAccess(access)
    if (purpose.kind !== 'process-env') notModelled('the HTTP credential purpose')
    if (holding !== key.holding) ledger.crossings.push(`acquire for ${key.name} names ${holding}`)
    return desk.open<Outcome<ProcessCredentialHandle, CredentialFailure>>({
      port: 'credentials.acquire',
      key: key.name,
      subject: key.name,
      value: answer => (answer === 'ok' ? { ok: handleFor(key) } : { failure: 'unknown' }),
    })
  }

  return {
    adoption: {
      endpoint(access, ref) {
        const key = keyOfAccess(access)
        return desk.open({
          port: 'adoption.endpoint',
          key: key.name,
          subject: key.name,
          value: answer =>
            answer === 'ok' && ref.holding === key.holding
              ? { ok: key.adopted }
              : { failure: 'unknown' },
        })
      },
      endpoints: () => notModelled('adoption.endpoints'),
    },
    eligibility: { check: () => notModelled('eligibility.check') },
    credentials: { acquire },
    landing: {
      start(access, _launch, env) {
        const key = keyOfAccess(access)
        const carried = env.credentials.map(item => handleOf.get(item.handle))
        for (const handle of carried)
          if (handle?.key !== key.name)
            ledger.crossings.push(
              `start for ${key.name} carries ${handle?.name ?? 'a foreign handle'}`,
            )
        return desk.open<Outcome<ProcessHandle, 'unknown'>>({
          port: 'landing.start',
          key: key.name,
          subject: key.name,
          value: answer =>
            answer === 'ok' ? { ok: processFor(key, carried[0]) } : { failure: 'unknown' },
        })
      },
    },
    transports: {
      open(material: TransportMaterial) {
        if (material.kind !== 'stdio') return notModelled('the Streamable HTTP transport')
        const process = processOf.get(material.process)
        const key = keys.find(item => item.name === process?.key)
        if (process === undefined || key === undefined)
          return notModelled('a process the ports did not hand out')
        return desk.open<Outcome<McpTransport, TransportFailure>>({
          port: 'transports.open',
          key: key.name,
          subject: process.name,
          value: answer =>
            answer === 'ok'
              ? { ok: transportFor(key, material.generation) }
              : { failure: NOT_SENT },
        })
      },
    },
    store: {
      read(catalogKey: CatalogKey) {
        const text = catalogKeyTextOf(catalogKey)
        const key =
          keys.find(item => item.catalogKeyText === text) ?? notModelled('a foreign catalog key')
        return desk.open<Outcome<'absent', 'unavailable'>>({
          port: 'store.read',
          key: key.name,
          subject: key.name,
          value: answer => (answer === 'ok' ? { ok: 'absent' } : { failure: 'unavailable' }),
        })
      },
      write: () => notModelled('store.write'),
    },
    checkOutput: () => notModelled('checkOutput'),
  }
}
