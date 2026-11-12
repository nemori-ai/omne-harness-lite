// Explorer ports: every call of the MCP ports, and of the handles and transports they hand out, is
// a `ScriptedPortCall`. A call is decided twice. When it is made, the schedule says whether it
// throws synchronously. Afterwards it stays pending until the explorer settles it with one of the
// port's answers (`ok`, a failure, or `reject`), or leaves it pending forever (a hang). A call answered after its bound fired is a late answer. The ports
// also keep the ledger of every resource they hand out, which the properties read.
//
// The call port (SPEC MC-16, MC-17) adds the transport's `call`, the peer's answer to a sent
// call (`SentCall.answer`, a pending call of its own), `cancelRequest`, the four task methods,
// the eligibility check of the gate, and the store's write that marking a catalog reaches once
// the store holds one. A scenario with call operations gets a catalog of one action.
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
  TaskReport,
} from '@omne-harness/mcp-contract'
import type {
  AdoptedEndpoint,
  CredentialFailure,
  HttpCredentialHandle,
  HttpPurpose,
  McpTransport,
  SentCall,
  TaskAnswer,
  TransportFailure,
  TransportMaterial,
} from '@omne-harness/mcp-contract/provider'
import type { AdmittedEndpoint } from '../../src/internal/gate.ts'
import { catalogKeyTextOf } from '../../src/internal/text.ts'
import { jsonOf, peerIdentityOf } from '@omne-harness/mcp-contract/testing'
import { type Principal } from '../doubles/identities.ts'

/** The answers of each port, the lawful one first. The closure phases answer with the first. */
export const PORT_ANSWERS = {
  'adoption.endpoint': ['ok', 'fail', 'reject'],
  'eligibility.check': ['ok', 'fail', 'reject'],
  'credentials.acquire': ['ok', 'fail', 'reject'],
  'transports.open': ['ok', 'fail', 'reject'],
  'transport.discover': ['ok', 'fail', 'reject'],
  'transport.close': ['ok', 'reject'],
  'credential.release': ['ok', 'reject'],
  'store.read': ['ok', 'fail', 'reject'],
  'store.write': ['ok', 'fail', 'reject'],
  /**
   * `ok`: sent, with a request id; `fail`: `not-sent` (`connection-unavailable`) marked as not
   * usable any more; `fail-usable`: the same failure without the mark (`USABLE_FAILURE`).
   */
  'transport.call': ['ok', 'fail', 'fail-usable', 'reject'],
  /**
   * The peer's answer to a sent call. `ok`: the scenario's peer reply; `fail`: `no-answer` marked
   * as not usable any more; `fail-usable`: `no-answer` without the mark.
   */
  'transport.answer': ['ok', 'fail', 'fail-usable', 'reject'],
  'transport.cancelRequest': ['ok', 'reject'],
  'transport.getTask': ['ok', 'fail', 'fail-usable', 'reject'],
  'transport.getTaskResult': ['ok', 'fail', 'fail-usable', 'reject'],
  'transport.updateTask': ['ok', 'fail', 'fail-usable', 'reject'],
  'transport.cancelTask': ['ok', 'fail', 'fail-usable', 'reject'],
} as const

/**
 * The answer of a transport method that fails while the transport stays usable: the failure
 * carries no `unusable` mark (contract T1). Only the methods a ready connection sends on offer
 * it; a build fails on any failure of `discover`, marked or not.
 */
export const USABLE_FAILURE = 'fail-usable'

export type PortName = keyof typeof PORT_ANSWERS
export type Answer = (typeof PORT_ANSWERS)[PortName][number]

/** A way a call can go other than its lawful answer; each one spends the deviation budget. */
export type Deviation = Exclude<Answer, 'ok'> | 'throw'

/** The ports the task operations wait for under the task bound (MC-17). */
export const TASK_PORTS: ReadonlySet<PortName> = new Set<PortName>([
  'transport.getTask',
  'transport.getTaskResult',
  'transport.updateTask',
  'transport.cancelTask',
])

/** The ports whose calls are waited for under a bound (MC-5 for the build, MC-17 for a task). */
export const BOUNDED_PORTS: ReadonlySet<PortName> = new Set<PortName>([
  'adoption.endpoint',
  'credentials.acquire',
  'transports.open',
  'transport.discover',
  ...TASK_PORTS,
])

/** The two steps of the close order (MC-14). */
export const TEARDOWN_PORTS: ReadonlySet<PortName> = new Set<PortName>([
  'transport.close',
  'credential.release',
])

/** The four task operations and the transport method each one sends. */
export const TASK_METHODS = {
  get: 'transport.getTask',
  result: 'transport.getTaskResult',
  input: 'transport.updateTask',
  cancel: 'transport.cancelTask',
} as const satisfies Record<string, PortName>

export type TaskMethod = keyof typeof TASK_METHODS

/** What the peer answers to a sent call when the answer is lawful. */
export type PeerReply = 'complete' | 'task'

/** The one task id of the model: the task the peer answers with when the reply is `task`. */
export const TASK_ID = 't1'

/** One connection key of the scenario: who asks, for what, and the token the gate gave. */
export type ModelKey = Readonly<{
  name: string
  access: Access<Principal>
  holding: EndpointHolding
  adopted: AdoptedEndpoint
  admitted: AdmittedEndpoint
  connectionKey: ConnectionKey
  catalogKeyText: string
  /** The digest of the one action in the catalog, for `expectedDefinition`. */
  digest: DefinitionDigest
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
  /** The transport a request goes on (P16); `undefined` for every other port. */
  transport: string | undefined
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
  /** The transport a request goes on (P16): `transport.call`, `cancelRequest` and the task methods. */
  transport?: string
  /** The value of an answer that does not reject, given the call as it was made. */
  value: (answer: Exclude<Answer, 'reject'>, call: ScriptedPortCall) => T
  /** Told how the call ended: an answer, or that it threw when it was made. */
  ended?: (how: Answer | 'throw') => void
  /** The context the call belongs to, for a call made outside the operation's async context. */
  context?: Context
}>

/** The explorer side of the ports: it registers each call and decides whether it throws now. */
export interface CallDesk {
  open<T>(request: CallRequest<T>): Promise<T>
}

export type HandleRecord = { readonly name: string; readonly key: string; releases: number }

export type TransportRecord = {
  readonly name: string
  readonly key: string
  readonly generation: Generation
  /** The `seq` of the `transports.open` call that handed it over (P16). */
  readonly opened: number
  closes: number
}

/** A request the transport sent: who sent it, and how often it was told to cancel it (P10). */
export type RequestRecord = {
  readonly id: string
  readonly key: string
  readonly op: string | undefined
  cancels: number
}

/** Every resource the ports handed out, with what was asked of it. */
export type Ledger = Readonly<{
  handles: HandleRecord[]
  transports: TransportRecord[]
  /** The requests sent, in order; the peer's answer to each is a pending call. */
  requests: RequestRecord[]
  /** `cancelRequest` for a request id the transport never handed out (P10). */
  strayCancels: string[]
  /** Arguments of one call that name two keys (P5). */
  crossings: string[]
  /** The name of each handle and transport object the ports handed out. */
  names: WeakMap<object, string>
}>

export function emptyLedger(): Ledger {
  return {
    handles: [],
    transports: [],
    requests: [],
    strayCancels: [],
    crossings: [],
    names: new WeakMap(),
  }
}

/** What the ports answer besides the lifecycle: the catalog, and the peer's reply to a call. */
export type PortOptions = Readonly<{
  /** The catalog the store holds for every key; absent in the lifecycle scenarios. */
  catalog?: ActionCatalogRecord
  peer?: PeerReply
}>

function notModelled(member: string): never {
  throw new TypeError(`${member} is outside the lifecycle model`)
}

const PEER: PeerIdentity = peerIdentityOf()
type NotSent = Extract<TransportFailure, { kind: 'not-sent' }>
type NoAnswer = Extract<PeerAnswer, { kind: 'no-answer' }>
// A failing transport method in this model is a transport that is not usable any more: it marks
// the answer so (contract T1), so the connection is lost.
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
// The failures of one request while the transport stays usable: no mark (contract T1), so the
// connection stays as it is (contract S7). Streamable HTTP gives them (T8 X01, S06, C05, O08 for
// `not-sent`; C04, O06, O07 for `no-answer`); the services read the mark, never the material.
const NOT_SENT_USABLE: NotSent = { kind: 'not-sent', cause: 'connection-unavailable' }
const STREAM_BROKEN_USABLE: NoAnswer = { kind: 'no-answer', cause: 'stream-broken' }
// A failed `open` hands over no transport, so its failure carries no mark (contract T1).
const OPEN_FAILED: NotSent = { kind: 'not-sent', cause: 'connection-unavailable' }
const WORKING: TaskReport = { status: 'working' }
const NOT_FINISHED: TaskAnswer = { kind: 'not-finished' }

/** The peer's lawful reply to a call: a complete result with no content, or the task handle. */
function replyOf(peer: PeerReply): PeerAnswer {
  return peer === 'task'
    ? { kind: 'result', result: jsonOf({ resultType: 'task', taskId: TASK_ID }) }
    : { kind: 'result', result: jsonOf({ resultType: 'complete', content: [] }) }
}

/** The address a key's endpoint is reached at: each key has its own, so `open` tells them apart. */
function targetOf(key: ModelKey): string | undefined {
  const { target } = key.adopted.settings
  return target.kind === 'value' ? target.value : undefined
}

function nameOf(prefix: string, key: ModelKey, records: readonly { key: string }[]): string {
  return `${prefix}${key.name}${records.filter(item => item.key === key.name).length + 1}`
}

/**
 * The MCP ports on `desk`, for `keys`. Streamable HTTP with a credential handle only: the handle's
 * `authorize` and `reportRejection`, the listing and the output check are not reached by the
 * connection table or the call port, whose transport is scripted here.
 */
export function scriptedPorts(
  desk: CallDesk,
  keys: readonly ModelKey[],
  ledger: Ledger,
  options: PortOptions = {},
): McpPorts<Principal, string> {
  const handleOf = new WeakMap<object, HandleRecord>()
  const peer = options.peer ?? 'complete'

  const keyOfAccess = (access: Access<Principal>): ModelKey =>
    keys.find(item => item.access === access) ?? notModelled('an access outside the scenario')

  function handleFor(key: ModelKey): HttpCredentialHandle {
    const record: HandleRecord = {
      name: nameOf('h', key, ledger.handles),
      key: key.name,
      releases: 0,
    }
    ledger.handles.push(record)
    const handle: HttpCredentialHandle = {
      purpose: 'http-authorization',
      authorize: () => notModelled('the handle authorize'),
      reportRejection: () => notModelled('the handle reportRejection'),
      release() {
        record.releases += 1
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

  /**
   * A call the transport sent: the request is recorded, and the peer's answer is a pending call
   * of its own, under the context of the call that sent it (made outside that context, at the
   * moment the explorer answers `transport.call`).
   */
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

  /** The `not-sent` of a failing call or task method: marked, unless the answer is `fail-usable`. */
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
    /** A request on this transport: it carries the transport's name, the one P16 reads. */
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
      // The stop signal is not read: the explorer decides whether the call was sent (T5).
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
    _purpose: HttpPurpose,
    _binding: CredentialBinding,
  ): Promise<Outcome<HttpCredentialHandle, CredentialFailure>> {
    const key = keyOfAccess(access)
    if (holding !== key.holding) ledger.crossings.push(`acquire for ${key.name} names ${holding}`)
    return desk.open<Outcome<HttpCredentialHandle, CredentialFailure>>({
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
    transports: {
      open(material: TransportMaterial) {
        const key = keys.find(item => targetOf(item) === material.target)
        const handle =
          material.credential === undefined ? undefined : handleOf.get(material.credential)
        if (key === undefined || handle === undefined)
          return notModelled('a target or a credential handle the ports did not hand out')
        if (handle.key !== key.name)
          ledger.crossings.push(`open for ${key.name} carries ${handle.name}`)
        return desk.open<Outcome<McpTransport, TransportFailure>>({
          port: 'transports.open',
          key: key.name,
          subject: handle.name,
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
