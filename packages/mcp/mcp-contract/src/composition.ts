// What a transport writes (SPEC T3, RFC-0010), once for every transport: the params of the legacy
// path's `initialize`, the answer to a request of the peer, and the text of each message of this
// side with the caller's values written as they are.
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import {
  METHOD_NOT_FOUND,
  OFFERED_LEGACY_VERSION,
  type NotificationMethod,
  type RequestMethod,
} from './decisions.ts'
import type { ClientInfo } from './envelope.ts'
import type { PlainJson, PlainRecord } from './plain.ts'
import type { PeerMessage } from './wire.ts'

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
