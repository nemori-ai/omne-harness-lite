import {
  copyJsonValue,
  readJsonStrict,
  writeJsonLossless,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'

export type DemoPacketKind =
  | 'start'
  | 'started'
  | 'command'
  | 'result'
  | 'observer'
  | 'observerAck'
  | 'observeExit'
  | 'exitFact'
  | 'stop'
  | 'close'
  | 'closed'
  | 'failure'

export interface DemoPacket {
  readonly generation: string
  readonly id: string
  readonly kind: DemoPacketKind
  readonly body: string
}

function parseKind(value: unknown): DemoPacketKind | undefined {
  switch (value) {
    case 'start':
    case 'started':
    case 'command':
    case 'result':
    case 'observer':
    case 'observerAck':
    case 'observeExit':
    case 'exitFact':
    case 'stop':
    case 'close':
    case 'closed':
    case 'failure':
      return value
    default:
      return undefined
  }
}

/** IPC uses exact JSON text so decimal and response facts survive transport. */
export function packet(value: unknown, maxBytes: number): DemoPacket | undefined {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== 4 ||
    !('generation' in value) ||
    typeof value.generation !== 'string' ||
    value.generation.length < 16 ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    value.id.length < 16 ||
    !('kind' in value) ||
    parseKind(value.kind) === undefined ||
    !('body' in value) ||
    typeof value.body !== 'string'
  )
    return undefined
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > maxBytes) return undefined
  const kind = parseKind(value.kind)
  if (kind === undefined) return undefined
  return { generation: value.generation, id: value.id, kind, body: value.body }
}

export function encodeBody(value: unknown): string {
  const copied = copyJsonValue(value)
  if (!('ok' in copied)) throw new Error('IPC value is not JSON')
  return writeJsonLossless(copied.ok)
}

export function decodeBody(value: string): JsonValue | undefined {
  const decoded = readJsonStrict(value)
  return 'ok' in decoded ? decoded.ok : undefined
}

export function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
