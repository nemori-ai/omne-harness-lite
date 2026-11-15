import { encodeRequest, encodeResponse, readRequest, readResponse } from './codec.ts'
import { hitlFamily } from './hitl-rules.ts'
import type {
  HitlCodecLimits,
  HitlEncodeResult,
  HitlOperation,
  HitlProtocolResult,
  HitlRequest,
  HitlRequestRead,
  HitlResponse,
  HitlResponseEncodeInput,
  HitlResponseRead,
} from './hitl-messages.ts'

export function readHitlRequest(input: {
  readonly bytes: Uint8Array
  readonly limits: HitlCodecLimits
}): HitlRequestRead {
  const read = readRequest(hitlFamily, input)
  if (read.kind !== 'request') return read
  return { kind: read.kind, request: read.request as HitlRequest }
}

export function readHitlResponse<O extends HitlOperation>(input: {
  readonly bytes: Uint8Array
  readonly operation: O
  readonly expectedMessageId: string
  readonly limits: HitlCodecLimits
}): HitlResponseRead<O> {
  const read = readResponse(hitlFamily, input)
  if (read.kind !== 'response') return read
  return { kind: read.kind, response: read.response as HitlResponse<O> }
}

export function encodeHitlRequest(input: {
  readonly request: HitlRequest
  readonly limits: HitlCodecLimits
}): HitlEncodeResult {
  return encodeRequest(hitlFamily, input)
}

export function encodeHitlResponse(input: {
  readonly response: HitlProtocolResult
  readonly limits: HitlCodecLimits
}): HitlEncodeResult
export function encodeHitlResponse<O extends HitlOperation>(
  input: HitlResponseEncodeInput<O>,
): HitlEncodeResult
export function encodeHitlResponse(input: unknown): HitlEncodeResult {
  return encodeResponse(hitlFamily, input)
}
