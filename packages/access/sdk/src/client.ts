import {
  encodeGovernanceRequest,
  encodeHitlRequest,
  encodeSessionRequest,
  readGovernanceResponse,
  readHitlResponse,
  readSessionResponse,
  type GovernanceCodecLimits,
  type GovernanceRequest,
  type HitlRequest,
  type SessionRequest,
} from '@omne-harness/public-contract'
import { defaultLimits } from './limits.ts'
import type { GovernanceTransport, TransportReport } from './transport.ts'

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
  readonly limits?: GovernanceCodecLimits
}

export interface SessionClient {
  submit(request: SessionRequest): Promise<CallerResult>
}

export interface GovernanceClient {
  submit(request: GovernanceRequest): Promise<CallerResult>
}

export interface HitlClient {
  submit(request: HitlRequest): Promise<CallerResult>
}

export class RequestInvalidError extends TypeError {
  constructor() {
    super('request is not valid for the public contract')
    this.name = 'RequestInvalidError'
  }
}

const decoder = new TextDecoder()

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

export function createHitlClient(options: ClientOptions): HitlClient {
  const limits = options.limits ?? defaultLimits
  return {
    async submit(request) {
      const encoded = encodeHitlRequest({ request, limits })
      if (encoded.kind !== 'encoded') throw new RequestInvalidError()
      return deliver(options.transport, encoded.bytes, bytes => {
        const read = readHitlResponse({
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
