// What a transport writes (SPEC T2, T3, T6, RFC-0010), once for every transport: the words of
// what it sends, the params of the legacy path's `initialize`, the answer to a request of the
// peer, the text of each message of this side with the caller's values written as they are, and
// the requests each operation of the transport sends with the reading of their answers.
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/operation-result'
import { interpretAnswer, listingPageOf, taskAnswerOf, taskReportOf } from './answer-readings.ts'
import type { TaskId } from './brands.ts'
import { checksListingHeaders, type ConnectionView } from './connection.ts'
import type { WireAnswer } from './decisions.ts'
import { clientEnvelopeOf, type ClientInfo } from './envelope.ts'
import type { TaskReport } from './outcomes.ts'
import type { PlainJson, PlainRecord } from './plain.ts'
import { LEGACY_PROTOCOL_VERSIONS } from './revisions.ts'
import type { CallRequest, ListingPage, TaskAnswer, TransportFailure } from './transport.ts'
import type { PeerMessage } from './wire.ts'

/** The requests a transport sends (T3). */
export type RequestMethod =
  | 'server/discover'
  | 'initialize'
  | 'tools/list'
  | 'tools/call'
  | 'tasks/get'
  | 'tasks/update'
  | 'tasks/cancel'

/** The notifications a transport sends (T3, T5). */
export type NotificationMethod = 'notifications/initialized' | 'notifications/cancelled'

/** The legacy revision the legacy path offers on `initialize` (T3). */
export const [OFFERED_LEGACY_VERSION] = LEGACY_PROTOCOL_VERSIONS

/** The JSON-RPC error code a transport answers to a request of the peer other than `ping` (T3). */
export const METHOD_NOT_FOUND = -32601

/** The params of the legacy path's `initialize` (T3). */
export function legacyInitializeParamsOf(clientInfo: ClientInfo): PlainRecord {
  return {
    protocolVersion: OFFERED_LEGACY_VERSION,
    capabilities: {},
    clientInfo: { name: clientInfo.name, version: clientInfo.version },
  }
}

// ---- The requests and notifications of the peer (T3) ----

/** What a transport answers to a request of the peer: `ping` an empty result, the rest `-32601` (T3). */
export function peerRequestAnswerOf(
  request: Extract<PeerMessage, { kind: 'request' }>,
): Readonly<{ result: PlainRecord }> | Readonly<{ error: PlainRecord }> {
  return request.method === 'ping'
    ? { result: {} }
    : { error: { code: METHOD_NOT_FOUND, message: 'Method not found' } }
}

// ---- The text of what the transport writes (T3, RFC-0010) ----

/** The value tree of plain data this side wrote. */
function treeOf(value: PlainJson): JsonValue {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'number') return { kind: 'number', lexeme: String(value) }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(treeOf) }
  return {
    kind: 'object',
    entries: Object.entries(value).map(([key, item]) => ({ key, value: treeOf(item) })),
  }
}

type Member = Readonly<{ key: string; value: JsonValue }>

/** One JSON-RPC message of this side as text: `jsonrpc` first, then the members in order. */
function messageTextOf(members: readonly Member[]): string {
  return writeJsonText({
    kind: 'object',
    entries: [{ key: 'jsonrpc', value: { kind: 'string', value: '2.0' } }, ...members],
  })
}

/**
 * The params of a request: the plain members, then the value trees the caller wrote, each
 * written as it is (RFC-0010): `arguments` and `inputResponses` keep their lexemes.
 */
function paramsOf(params: PlainRecord, values: Readonly<{ [key: string]: JsonValue }>): JsonValue {
  return {
    kind: 'object',
    entries: [
      ...Object.entries(params).map(([key, value]) => ({ key, value: treeOf(value) })),
      ...Object.entries(values).map(([key, value]) => ({ key, value })),
    ],
  }
}

/** The text of one request of this side (T3). `values` are params the caller wrote as value trees. */
export function requestTextOf(
  message: Readonly<{
    id: string
    method: RequestMethod
    params: PlainRecord
    values?: Readonly<{ [key: string]: JsonValue }>
  }>,
): string {
  return messageTextOf([
    { key: 'id', value: { kind: 'string', value: message.id } },
    { key: 'method', value: { kind: 'string', value: message.method } },
    { key: 'params', value: paramsOf(message.params, message.values ?? {}) },
  ])
}

/** The text of one notification of this side (T3, T5). */
export function notificationTextOf(
  message: Readonly<{ method: NotificationMethod; params: PlainRecord }>,
): string {
  return messageTextOf([
    { key: 'method', value: { kind: 'string', value: message.method } },
    { key: 'params', value: treeOf(message.params) },
  ])
}

/** The text of a response to a request of the peer: its `id` echoed as written (RFC-0010). */
export function responseTextOf(
  message: Readonly<{ id: JsonValue }> &
    (Readonly<{ result: PlainRecord }> | Readonly<{ error: PlainRecord }>),
): string {
  const body: Member =
    'result' in message
      ? { key: 'result', value: treeOf(message.result) }
      : { key: 'error', value: treeOf(message.error) }
  return messageTextOf([{ key: 'id', value: message.id }, body])
}

// ---- The requests the transport's operations send (T2, T3, T6) ----

/**
 * The `_meta` of one request (T3): the client envelope of the revision, and on `tools/call` the
 * progress token, which is the request id.
 */
export function requestMetaOf(
  method: RequestMethod,
  id: string,
  version: string,
  clientInfo: ClientInfo,
): PlainRecord {
  const envelope = clientEnvelopeOf(version, clientInfo)
  return method === 'tools/call' ? { ...envelope, progressToken: id } : envelope
}

/** The value trees a request carries as the caller wrote them (RFC-0010). */
export type RequestValues = Readonly<{ [key: string]: JsonValue }>

/**
 * One request as an operation composes it: the method, the plain params, the caller's values,
 * and how the settled answer reads for the operation.
 */
export type ComposedRequest<T> = Readonly<{
  method: RequestMethod
  params: PlainRecord
  values?: RequestValues
  read: (wire: WireAnswer) => Outcome<T, TransportFailure>
}>

/** The `tools/call` of a call (T3): the action and the continuation as params, the values as written. */
export function callRequestOf(
  request: CallRequest,
): Readonly<{ method: 'tools/call'; params: PlainRecord; values: RequestValues }> {
  const continuation = request.continuation
  return {
    method: 'tools/call',
    params: {
      name: request.action,
      ...(continuation?.requestState === undefined
        ? {}
        : { requestState: continuation.requestState }),
    },
    values: {
      arguments: request.args,
      ...(continuation?.inputResponses === undefined
        ? {}
        : { inputResponses: continuation.inputResponses }),
    },
  }
}

/** The `tools/list` of `listActions` (T2): the cursor when there is one; the page read by the connection's rule. */
export function listActionsRequest(
  cursor: string | undefined,
  connection: ConnectionView,
): ComposedRequest<ListingPage> {
  const checksHeaders = checksListingHeaders(connection)
  return {
    method: 'tools/list',
    params: cursor === undefined ? {} : { cursor },
    read: wire => listingPageOf(wire, checksHeaders),
  }
}

/** The `tasks/get` of `getTask` (T6). */
export function getTaskRequest(taskId: TaskId): ComposedRequest<TaskReport | 'expired'> {
  return { method: 'tasks/get', params: { taskId }, read: taskReportOf }
}

/** The `tasks/get` of `getTaskResult` (T6). */
export function getTaskResultRequest(taskId: TaskId): ComposedRequest<TaskAnswer> {
  return { method: 'tasks/get', params: { taskId }, read: taskAnswerOf }
}

/** The `tasks/update` of `updateTask` (T6): the input responses as written; the peer's confirmation is `accepted`. */
export function updateTaskRequest(
  taskId: TaskId,
  inputResponses: JsonValue,
): ComposedRequest<'accepted'> {
  return {
    method: 'tasks/update',
    params: { taskId },
    values: { inputResponses },
    read: wire => interpretAnswer(wire, () => ({ ok: 'accepted' })),
  }
}

/** The `tasks/cancel` of `cancelTask` (T6): the peer's confirmation is `requested`. */
export function cancelTaskRequest(taskId: TaskId): ComposedRequest<'requested'> {
  return {
    method: 'tasks/cancel',
    params: { taskId },
    read: wire => interpretAnswer(wire, () => ({ ok: 'requested' })),
  }
}
