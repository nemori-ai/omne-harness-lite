import type { Access } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  ActionCatalogRecord,
  CatalogKey,
  ConnectionKey,
  CredentialBinding,
  DefinitionDigest,
  EndpointHolding,
  Generation,
  McpPorts,
  PeerAnswer,
  PeerIdentity,
  StopScope,
  TaskReport,
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
  SentCall,
  TaskAnswer,
  TransportFailure,
  TransportMaterial,
} from '@omne-harness/mcp-contract/provider'
import type { AdmittedEndpoint } from '../../src/internal/gate.ts'
import { catalogKeyTextOf } from '../../src/internal/text.ts'
import { jsonOf, peerIdentityOf } from '@omne-harness/mcp-contract/testing'
import { type Principal } from '../doubles/identities.ts'

export const PORT_ANSWERS = {
  'adoption.endpoint': ['ok', 'fail', 'reject'],
  'eligibility.check': ['ok', 'fail', 'reject'],
  'credentials.acquire': ['ok', 'fail', 'reject'],
  'landing.start': ['ok', 'fail', 'reject'],
  'transports.open': ['ok', 'fail', 'reject'],
  'transport.discover': ['ok', 'fail', 'reject'],
  'transport.close': ['ok', 'reject'],
  'process.stop': ['ok', 'unconfirmed', 'reject'],
  'credential.release': ['ok', 'reject'],
  'store.read': ['ok', 'fail', 'reject'],
  'store.write': ['ok', 'fail', 'reject'],
  'transport.call': ['ok', 'fail', 'fail-usable', 'reject'],
  'transport.answer': ['ok', 'fail', 'fail-usable', 'reject'],
  'transport.cancelRequest': ['ok', 'reject'],
  'transport.getTask': ['ok', 'fail', 'fail-usable', 'reject'],
  'transport.getTaskResult': ['ok', 'fail', 'fail-usable', 'reject'],
  'transport.updateTask': ['ok', 'fail', 'fail-usable', 'reject'],
  'transport.cancelTask': ['ok', 'fail', 'fail-usable', 'reject'],
} as const

export const USABLE_FAILURE = 'fail-usable'

export type PortName = keyof typeof PORT_ANSWERS
export type Answer = (typeof PORT_ANSWERS)[PortName][number]

export type Deviation = Exclude<Answer, 'ok'> | 'throw'

export const TASK_PORTS: ReadonlySet<PortName> = new Set<PortName>([
  'transport.getTask',
  'transport.getTaskResult',
  'transport.updateTask',
  'transport.cancelTask',
])

export const BOUNDED_PORTS: ReadonlySet<PortName> = new Set<PortName>([
  'adoption.endpoint',
  'credentials.acquire',
  'landing.start',
  'transports.open',
  'transport.discover',
  ...TASK_PORTS,
])

export const TEARDOWN_PORTS: ReadonlySet<PortName> = new Set<PortName>([
  'transport.close',
  'process.stop',
  'credential.release',
])

export const TASK_METHODS = {
  get: 'transport.getTask',
  result: 'transport.getTaskResult',
  input: 'transport.updateTask',
  cancel: 'transport.cancelTask',
} as const satisfies Record<string, PortName>

export type TaskMethod = keyof typeof TASK_METHODS

export type PeerReply = 'complete' | 'task'

export const TASK_ID = 't1'

export type ModelKey = Readonly<{
  name: string
  access: Access<Principal>
  holding: EndpointHolding
  adopted: AdoptedEndpoint
  admitted: AdmittedEndpoint
  connectionKey: ConnectionKey
  catalogKeyText: string
  digest: DefinitionDigest
}>

export type Context = Readonly<{ op: string; timer?: string }>

export type ScriptedPortCall = Readonly<{
  seq: number
  port: PortName
  key: string
  subject: string
  context: Context | undefined
  site: string
  transport: string | undefined
}>

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
  transport?: string
  value: (answer: Exclude<Answer, 'reject'>, call: ScriptedPortCall) => T
  ended?: (how: Answer | 'throw') => void
  context?: Context
}>

export interface CallDesk {
  open<T>(request: CallRequest<T>): Promise<T>
}

export type HandleRecord = { readonly name: string; readonly key: string; releases: number }

export type ProcessRecord = {
  readonly name: string
  readonly key: string
  readonly handle: string | undefined
  stops: number
  lastStop: StopScope | 'rejected' | 'threw' | undefined
}

export type TransportRecord = {
  readonly name: string
  readonly key: string
  readonly generation: Generation
  readonly opened: number
  closes: number
}

export type RequestRecord = {
  readonly id: string
  readonly key: string
  readonly op: string | undefined
  cancels: number
}

export type Ledger = Readonly<{
  handles: HandleRecord[]
  processes: ProcessRecord[]
  transports: TransportRecord[]
  requests: RequestRecord[]
  strayCancels: string[]
  crossings: string[]
  earlyReleases: string[]
  names: WeakMap<object, string>
}>

export function emptyLedger(): Ledger {
  return {
    handles: [],
    processes: [],
    transports: [],
    requests: [],
    strayCancels: [],
    crossings: [],
    earlyReleases: [],
    names: new WeakMap(),
  }
}

export type PortOptions = Readonly<{
  catalog?: ActionCatalogRecord
  peer?: PeerReply
}>

function notModelled(member: string): never {
  throw new TypeError(`${member} is outside the lifecycle model`)
}

const PEER: PeerIdentity = peerIdentityOf()
type NotSent = Extract<TransportFailure, { kind: 'not-sent' }>
type NoAnswer = Extract<PeerAnswer, { kind: 'no-answer' }>
const NOT_SENT: NotSent = {
  kind: 'not-sent',
  cause: 'connection-unavailable',
  unusable: 'stream-broken',
}
const STREAM_BROKEN: NoAnswer = {
  kind: 'no-answer',
  cause: 'stream-broken',
  unusable: 'stream-broken',
}
const NOT_SENT_USABLE: NotSent = { kind: 'not-sent', cause: 'connection-unavailable' }
const STREAM_BROKEN_USABLE: NoAnswer = { kind: 'no-answer', cause: 'stream-broken' }
const OPEN_FAILED: NotSent = { kind: 'not-sent', cause: 'connection-unavailable' }
const WORKING: TaskReport = { status: 'working' }
const NOT_FINISHED: TaskAnswer = { kind: 'not-finished' }

function replyOf(peer: PeerReply): PeerAnswer {
  return peer === 'task'
    ? { kind: 'result', result: jsonOf({ resultType: 'task', taskId: TASK_ID }) }
    : { kind: 'result', result: jsonOf({ resultType: 'complete', content: [] }) }
}

function stopScopeOf(answer: Exclude<Answer, 'reject'>): StopScope {
  return answer === 'ok' ? 'tree-confirmed' : 'unconfirmed'
}

function nameOf(prefix: string, key: ModelKey, records: readonly { key: string }[]): string {
  return `${prefix}${key.name}${records.filter(item => item.key === key.name).length + 1}`
}

export function scriptedPorts(
  desk: CallDesk,
  keys: readonly ModelKey[],
  ledger: Ledger,
  options: PortOptions = {},
): McpPorts<Principal, string> {
  const handleOf = new WeakMap<object, HandleRecord>()
  const processOf = new WeakMap<object, ProcessRecord>()
  const peer = options.peer ?? 'complete'

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

  function sentCallFor(key: ModelKey, context: Context | undefined): SentCall {
    const record: RequestRecord = {
      id: `r${ledger.requests.length + 1}`,
      key: key.name,
      op: context?.op,
      cancels: 0,
    }
    ledger.requests.push(record)
    const answer = desk.open<PeerAnswer>({
      port: 'transport.answer',
      key: key.name,
      subject: record.id,
      value: how =>
        how === 'ok'
          ? replyOf(peer)
          : how === USABLE_FAILURE
            ? STREAM_BROKEN_USABLE
            : STREAM_BROKEN,
      ...(context === undefined ? {} : { context }),
    })
    return { requestId: record.id, answer }
  }

  function notSentOf(answer: Exclude<Answer, 'reject'>): NotSent {
    return answer === USABLE_FAILURE ? NOT_SENT_USABLE : NOT_SENT
  }

  function transportFor(key: ModelKey, generation: Generation, opened: number): McpTransport {
    const record: TransportRecord = {
      name: nameOf('t', key, ledger.transports),
      key: key.name,
      generation,
      opened,
      closes: 0,
    }
    ledger.transports.push(record)
    const requestOn = <T>(asked: Omit<CallRequest<T>, 'key' | 'transport'>): Promise<T> =>
      desk.open<T>({ ...asked, key: key.name, transport: record.name })
    const taskCall = <T>(port: PortName, taskId: string, value: T) =>
      requestOn<Outcome<T, TransportFailure>>({
        port,
        subject: taskId,
        value: answer => (answer === 'ok' ? { ok: value } : { failure: notSentOf(answer) }),
      })
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
      call: () =>
        requestOn<Outcome<SentCall, NotSent>>({
          port: 'transport.call',
          subject: record.name,
          value: (answer, call) =>
            answer === 'ok'
              ? { ok: sentCallFor(key, call.context) }
              : { failure: notSentOf(answer) },
        }),
      cancelRequest(requestId) {
        const request = ledger.requests.find(item => item.id === requestId)
        if (request === undefined) ledger.strayCancels.push(requestId)
        else request.cancels += 1
        return requestOn({
          port: 'transport.cancelRequest',
          subject: requestId,
          value: () => undefined,
        })
      },
      getTask: taskId => taskCall<TaskReport | 'expired'>('transport.getTask', taskId, WORKING),
      updateTask: taskId => taskCall<'accepted'>('transport.updateTask', taskId, 'accepted'),
      getTaskResult: taskId =>
        taskCall<TaskAnswer>('transport.getTaskResult', taskId, NOT_FINISHED),
      cancelTask: taskId => taskCall<'requested'>('transport.cancelTask', taskId, 'requested'),
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

  const keyOfCatalog = (catalogKey: CatalogKey): ModelKey => {
    const text = catalogKeyTextOf(catalogKey)
    return keys.find(item => item.catalogKeyText === text) ?? notModelled('a foreign catalog key')
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
    eligibility: {
      check(access, endpoint) {
        const key = keyOfAccess(access)
        if (endpoint.holding !== key.holding)
          ledger.crossings.push(`eligibility for ${key.name} names ${endpoint.holding}`)
        return desk.open({
          port: 'eligibility.check',
          key: key.name,
          subject: key.name,
          value: answer =>
            answer === 'ok' ? { kind: 'granted' } : { kind: 'refused', reason: 'not-eligible' },
        })
      },
    },
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
          value: (answer, call) =>
            answer === 'ok'
              ? { ok: transportFor(key, material.generation, call.seq) }
              : { failure: OPEN_FAILED },
        })
      },
    },
    store: {
      read(catalogKey) {
        const key = keyOfCatalog(catalogKey)
        return desk.open<Outcome<ActionCatalogRecord | 'absent', 'unavailable'>>({
          port: 'store.read',
          key: key.name,
          subject: key.name,
          value: answer =>
            answer === 'ok' ? { ok: options.catalog ?? 'absent' } : { failure: 'unavailable' },
        })
      },
      write(catalogKey) {
        const key = keyOfCatalog(catalogKey)
        return desk.open<Outcome<true, 'unavailable' | 'revision-conflict'>>({
          port: 'store.write',
          key: key.name,
          subject: key.name,
          value: answer => (answer === 'ok' ? { ok: true } : { failure: 'revision-conflict' }),
        })
      },
    },
    checkOutput: () => notModelled('checkOutput'),
  }
}
