export const PROTOCOL_VERSION = 1

export type HeaderPairs = [string, string][]

export interface RequestHeadMessage {
  type: 'request'
  id: number
  v?: number
  method: string
  url: string
  headers: HeaderPairs
  hasBody: boolean
}

export interface RequestChunkMessage {
  type: 'request-chunk'
  id: number
  chunk: Uint8Array
}

export interface RequestEndMessage {
  type: 'request-end'
  id: number
}

export interface ResponseHeadMessage {
  type: 'response'
  id: number
  status: number
  statusText: string
  headers: HeaderPairs
  hasBody: boolean
}

export interface ResponseChunkMessage {
  type: 'response-chunk'
  id: number
  chunk: Uint8Array
}

export interface ResponseEndMessage {
  type: 'response-end'
  id: number
}

export interface AckMessage {
  type: 'ack'
  id: number
  bytes: number
}

export interface CancelMessage {
  type: 'cancel'
  id: number
  reason?: string
}

export type PortErrorCode =
  | 'busy'
  | 'protocol'
  | 'fetch-failed'
  | 'body-failed'
  | 'invalid-status'
  | 'closed'

export interface ErrorMessage {
  type: 'error'
  id: number
  message: string
  code?: PortErrorCode | (string & {})
  name?: string
}

export type PortMessage =
  | RequestHeadMessage
  | RequestChunkMessage
  | RequestEndMessage
  | ResponseHeadMessage
  | ResponseChunkMessage
  | ResponseEndMessage
  | AckMessage
  | CancelMessage
  | ErrorMessage

export type PortMessageType = PortMessage['type']

export const PORT_MESSAGE_TYPES = [
  'request',
  'request-chunk',
  'request-end',
  'response',
  'response-chunk',
  'response-end',
  'ack',
  'cancel',
  'error',
] as const satisfies readonly PortMessageType[]

export type Receiver = 'client' | 'server'

const toServer = new Set<string>([
  'request',
  'request-chunk',
  'request-end',
  'ack',
  'cancel',
  'error',
])
const toClient = new Set<string>(['response', 'response-chunk', 'response-end', 'ack', 'error'])
const allTypes = new Set<string>(PORT_MESSAGE_TYPES)

export const LIMITS = {
  headerCount: 256,
  headerLength: 64 * 1024,
  methodLength: 64,
  urlLength: 64 * 1024,
  statusTextLength: 1024,
  messageLength: 2 * 1024,
  nameLength: 128,
  codeLength: 64,
} as const

export type ParsedFrame =
  | { ok: true; message: PortMessage }
  | { ok: false; id: number; reason: string }

type Frame = Partial<Record<string, unknown>>

/** A parsed message, or the name of the field that is wrong. */
type Parsed = PortMessage | string

const boundedText = (value: unknown, max: number, min = 0): value is string =>
  typeof value === 'string' && value.length >= min && value.length <= max

const optionalText = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string'

const isStatus = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 200 && value <= 599

function parseRequest(frame: Frame, id: number): Parsed {
  const { method, url, hasBody } = frame
  if (!boundedText(method, LIMITS.methodLength, 1)) return 'method'
  if (!boundedText(url, LIMITS.urlLength)) return 'url'
  if (typeof hasBody !== 'boolean') return 'hasBody'
  const headers = parseHeaders(frame.headers)
  if (!headers) return 'headers'
  return { type: 'request', id, v: PROTOCOL_VERSION, method, url, headers, hasBody }
}

function parseResponse(frame: Frame, id: number): Parsed {
  const { status, statusText, hasBody } = frame
  if (!isStatus(status)) return 'status'
  if (!boundedText(statusText, LIMITS.statusTextLength)) return 'statusText'
  if (typeof hasBody !== 'boolean') return 'hasBody'
  const headers = parseHeaders(frame.headers)
  if (!headers) return 'headers'
  return { type: 'response', id, status, statusText, headers, hasBody }
}

const parseChunk =
  (type: 'request-chunk' | 'response-chunk') =>
  (frame: Frame, id: number): Parsed =>
    frame.chunk instanceof Uint8Array ? { type, id, chunk: frame.chunk } : 'chunk'

const parseEnd =
  (type: 'request-end' | 'response-end') =>
  (_frame: Frame, id: number): Parsed => ({ type, id })

function parseAck(frame: Frame, id: number): Parsed {
  const { bytes } = frame
  if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes < 0) return 'bytes'
  return { type: 'ack', id, bytes }
}

function parseCancel(frame: Frame, id: number): Parsed {
  const { reason } = frame
  if (!optionalText(reason)) return 'reason'
  return reason === undefined
    ? { type: 'cancel', id }
    : { type: 'cancel', id, reason: cap(reason, LIMITS.messageLength) }
}

function parseError(frame: Frame, id: number): Parsed {
  const { message, code, name } = frame
  if (typeof message !== 'string') return 'message'
  if (!optionalText(code)) return 'code'
  if (!optionalText(name)) return 'name'
  const parsed: ErrorMessage = { type: 'error', id, message: cap(message, LIMITS.messageLength) }
  if (code !== undefined) parsed.code = cap(code, LIMITS.codeLength)
  if (name !== undefined) parsed.name = cap(name, LIMITS.nameLength)
  return parsed
}

const PARSERS: Readonly<Record<PortMessageType, (frame: Frame, id: number) => Parsed>> = {
  request: parseRequest,
  response: parseResponse,
  'request-chunk': parseChunk('request-chunk'),
  'response-chunk': parseChunk('response-chunk'),
  'request-end': parseEnd('request-end'),
  'response-end': parseEnd('response-end'),
  ack: parseAck,
  cancel: parseCancel,
  error: parseError,
}

const isType = (type: unknown): type is PortMessageType =>
  typeof type === 'string' && allTypes.has(type)

/** Why a well-typed frame is refused before its fields are read, or `undefined`. */
function refusal(frame: Frame, type: PortMessageType, receiver?: Receiver): string | undefined {
  if (receiver && !(receiver === 'server' ? toServer : toClient).has(type))
    return `Invalid ${type} frame: not expected by the ${receiver}`
  if (type === 'request' && (frame.v ?? 1) !== PROTOCOL_VERSION)
    return `Unsupported protocol version ${show(frame.v)}; this side speaks ${PROTOCOL_VERSION}`
  return undefined
}

export function parsePortMessage(value: unknown, receiver?: Receiver): ParsedFrame | undefined {
  if (typeof value !== 'object' || value === null || !isRecord(value)) return undefined
  const { type, id } = value
  if (!isType(type) || !isId(id)) return undefined
  const refused = refusal(value, type, receiver)
  if (refused !== undefined) return { ok: false, id, reason: refused }
  const parsed = PARSERS[type](value, id)
  return typeof parsed === 'string'
    ? { ok: false, id, reason: `Invalid ${type} frame: ${parsed}` }
    : { ok: true, message: parsed }
}

export function isPortMessage(value: unknown): value is PortMessage {
  return parsePortMessage(value)?.ok === true
}

export function errorFrame(id: number, err: unknown, code: PortErrorCode): ErrorMessage {
  const message = cap(err instanceof Error ? err.message : String(err), LIMITS.messageLength)
  const frame: ErrorMessage = { type: 'error', id, message, code }
  if (err instanceof Error && typeof err.name === 'string')
    frame.name = cap(err.name, LIMITS.nameLength)
  return frame
}

export function cap(text: string, length: number): string {
  return text.length > length ? text.slice(0, length) : text
}

function isRecord(value: object): value is Partial<Record<string, unknown>> {
  return !Array.isArray(value)
}

function isId(id: unknown): id is number {
  return typeof id === 'number' && Number.isSafeInteger(id) && id >= 0
}

function parseHeaders(value: unknown): HeaderPairs | undefined {
  if (!Array.isArray(value) || value.length > LIMITS.headerCount) return undefined
  const headers: HeaderPairs = []
  let length = 0
  for (const pair of value as unknown[]) {
    if (!Array.isArray(pair) || pair.length !== 2) return undefined
    const [name, headerValue] = pair as unknown[]
    if (typeof name !== 'string' || typeof headerValue !== 'string') return undefined
    length += name.length + headerValue.length
    if (length > LIMITS.headerLength) return undefined
    headers.push([name, headerValue])
  }
  return headers
}

function show(value: unknown): string {
  return typeof value === 'number' || typeof value === 'string' ? String(value) : typeof value
}

export const DEFAULT_WINDOW_BYTES = 1024 * 1024
export const DEFAULT_MAX_CONCURRENT_REQUESTS = 256
export const DEFAULT_MAX_QUEUED_BYTES = 8 * 1024 * 1024
