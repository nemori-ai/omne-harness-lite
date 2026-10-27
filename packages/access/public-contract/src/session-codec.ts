import { encodeRequest, encodeResponse, readRequest, readResponse } from './codec.ts'
import { sessionFamily } from './session-rules.ts'
import type {
  SessionCodecLimits,
  SessionEncodeResult,
  SessionOperation,
  SessionProtocolRejected,
  SessionRequest,
  SessionRequestRead,
  SessionResponse,
  SessionResponseEncodeInput,
  SessionResponseRead,
} from './session-messages.ts'

export function readSessionRequest(input: {
  readonly bytes: Uint8Array
  readonly limits: SessionCodecLimits
}): SessionRequestRead {
  const read = readRequest(sessionFamily, input)
  return read.kind === 'request'
    ? { kind: 'request', request: read.request as SessionRequest }
    : read
}

export function readSessionResponse<O extends SessionOperation>(input: {
  readonly bytes: Uint8Array
  readonly operation: O
  readonly expectedMessageId: string
  readonly limits: SessionCodecLimits
}): SessionResponseRead<O> {
  const read = readResponse(sessionFamily, input)
  return read.kind === 'response'
    ? { kind: 'response', response: read.response as SessionResponse<O> }
    : read
}

export function encodeSessionRequest(input: {
  readonly request: SessionRequest
  readonly limits: SessionCodecLimits
}): SessionEncodeResult {
  return encodeRequest(sessionFamily, input)
}

export function encodeSessionResponse(input: {
  readonly response: SessionProtocolRejected
  readonly limits: SessionCodecLimits
}): SessionEncodeResult
export function encodeSessionResponse<O extends SessionOperation>(
  input: SessionResponseEncodeInput<O>,
): SessionEncodeResult
export function encodeSessionResponse(input: unknown): SessionEncodeResult {
  return encodeResponse(sessionFamily, input)
}
