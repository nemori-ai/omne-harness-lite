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

export type RequestMethod =
  | 'server/discover'
  | 'initialize'
  | 'tools/list'
  | 'tools/call'
  | 'tasks/get'
  | 'tasks/update'
  | 'tasks/cancel'

export type NotificationMethod = 'notifications/initialized' | 'notifications/cancelled'

export const [OFFERED_LEGACY_VERSION] = LEGACY_PROTOCOL_VERSIONS

export const METHOD_NOT_FOUND = -32601

export function legacyInitializeParamsOf(clientInfo: ClientInfo): PlainRecord {
  return {
    protocolVersion: OFFERED_LEGACY_VERSION,
    capabilities: {},
    clientInfo: { name: clientInfo.name, version: clientInfo.version },
  }
}

export function peerRequestAnswerOf(
  request: Extract<PeerMessage, { kind: 'request' }>,
): Readonly<{ result: PlainRecord }> | Readonly<{ error: PlainRecord }> {
  return request.method === 'ping'
    ? { result: {} }
    : { error: { code: METHOD_NOT_FOUND, message: 'Method not found' } }
}

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

function messageTextOf(members: readonly Member[]): string {
  return writeJsonText({
    kind: 'object',
    entries: [{ key: 'jsonrpc', value: { kind: 'string', value: '2.0' } }, ...members],
  })
}

function paramsOf(params: PlainRecord, values: Readonly<{ [key: string]: JsonValue }>): JsonValue {
  return {
    kind: 'object',
    entries: [
      ...Object.entries(params).map(([key, value]) => ({ key, value: treeOf(value) })),
      ...Object.entries(values).map(([key, value]) => ({ key, value })),
    ],
  }
}

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

export function notificationTextOf(
  message: Readonly<{ method: NotificationMethod; params: PlainRecord }>,
): string {
  return messageTextOf([
    { key: 'method', value: { kind: 'string', value: message.method } },
    { key: 'params', value: treeOf(message.params) },
  ])
}

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

export function requestMetaOf(
  method: RequestMethod,
  id: string,
  version: string,
  clientInfo: ClientInfo,
): PlainRecord {
  const envelope = clientEnvelopeOf(version, clientInfo)
  return method === 'tools/call' ? { ...envelope, progressToken: id } : envelope
}

export type RequestValues = Readonly<{ [key: string]: JsonValue }>

export type ComposedRequest<T> = Readonly<{
  method: RequestMethod
  params: PlainRecord
  values?: RequestValues
  read: (wire: WireAnswer) => Outcome<T, TransportFailure>
}>

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

export function getTaskRequest(taskId: TaskId): ComposedRequest<TaskReport | 'expired'> {
  return { method: 'tasks/get', params: { taskId }, read: taskReportOf }
}

export function getTaskResultRequest(taskId: TaskId): ComposedRequest<TaskAnswer> {
  return { method: 'tasks/get', params: { taskId }, read: taskAnswerOf }
}

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

export function cancelTaskRequest(taskId: TaskId): ComposedRequest<'requested'> {
  return {
    method: 'tasks/cancel',
    params: { taskId },
    read: wire => interpretAnswer(wire, () => ({ ok: 'requested' })),
  }
}
