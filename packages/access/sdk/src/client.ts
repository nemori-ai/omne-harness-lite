import {
  encodeGovernanceRequest,
  encodeSessionRequest,
  readGovernanceResponse,
  readSessionResponse,
  type GovernanceCodecLimits,
  type GovernanceRequest,
  type SessionRequest,
} from '@omne-harness/public-contract'
import { defaultLimits } from './limits.ts'
import type { GovernanceTransport, TransportReport } from './transport.ts'

/** The common response after the public contract read it and its `messageId` matched the call. */
export interface PublicResponse {
  readonly protocolVersion: string
  readonly messageId: string
  readonly outcome: string
  readonly body: unknown
}

export type CallerResult =
  | { readonly kind: 'response'; readonly message: PublicResponse }
  | { readonly kind: 'uncertain' }

export interface ClientOptions {
  readonly transport: GovernanceTransport
  /** Budgets for encoding the request and reading the response. */
  readonly limits?: GovernanceCodecLimits
}

export interface SessionClient {
  submit(request: SessionRequest): Promise<CallerResult>
}

export interface GovernanceClient {
  submit(request: GovernanceRequest): Promise<CallerResult>
}

/** The local request model is not valid for the public contract. Nothing was sent. */
export class RequestInvalidError extends TypeError {
  constructor() {
    super('request is not valid for the public contract')
    this.name = 'RequestInvalidError'
  }
}

const decoder = new TextDecoder()

/**
 * Sends the bytes. When the transport proves that nothing was sent, sends the same bytes once
 * more. A response or an uncertain report ends the call: bytes may have arrived, so the client
 * does not redo an unknown effect.
 */
async function deliver(
  transport: GovernanceTransport,
  bytes: Uint8Array,
  read: (response: Uint8Array) => PublicResponse | undefined,
): Promise<CallerResult> {
  const answered = (report: TransportReport): CallerResult | undefined => {
    if (report.kind === 'uncertain') return { kind: 'uncertain' }
    if (report.kind === 'not-sent') return undefined
    const message = read(report.bytes)
    return message === undefined ? { kind: 'uncertain' } : { kind: 'response', message }
  }
  const first = answered(await transport.send(bytes))
  if (first !== undefined) return first
  return answered(await transport.send(bytes)) ?? { kind: 'uncertain' }
}

/** The read already proved the bytes are strict JSON, so parsing them again cannot fail. */
function wireOf(bytes: Uint8Array): PublicResponse {
  return JSON.parse(decoder.decode(bytes)) as PublicResponse
}

export function createSessionClient(options: ClientOptions): SessionClient {
  const limits = options.limits ?? defaultLimits
  return {
    async submit(request) {
      const encoded = encodeSessionRequest({ request, limits })
      if (encoded.kind !== 'encoded') throw new RequestInvalidError()
      return deliver(options.transport, encoded.bytes, bytes => {
        const read = readSessionResponse({
          bytes,
          operation: request.operation,
          expectedMessageId: request.messageId,
          limits,
        })
        return read.kind === 'response' ? wireOf(bytes) : undefined
      })
    },
  }
}

export function createGovernanceClient(options: ClientOptions): GovernanceClient {
  const limits = options.limits ?? defaultLimits
  return {
    async submit(request) {
      const encoded = encodeGovernanceRequest({ request, limits })
      if (encoded.kind !== 'encoded') throw new RequestInvalidError()
      return deliver(options.transport, encoded.bytes, bytes => {
        const read = readGovernanceResponse({
          bytes,
          operation: request.operation,
          expectedMessageId: request.messageId,
          limits,
        })
        return read.kind === 'response' ? wireOf(bytes) : undefined
      })
    },
  }
}
