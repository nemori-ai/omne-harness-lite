// The encoding helpers of the session location: the public contract's codec writes every
// response, and an encode failure is the entry's own fault, so it gives no answer.
import {
  encodeSessionResponse,
  type SessionOperation,
  type SessionResponseEncodeInput,
} from '@omne-harness/public-contract'
import type { JsonAnswer, NoAnswer } from './answers.ts'
import { OUTPUT_LIMITS } from './config.ts'
import { emit, type DiagnosticSink } from './diagnostics.ts'
import { STATUS_BY_OUTCOME, type PublicOutcome } from './status.ts'

export const encoder = new TextEncoder()
const VERSION = 'session-public/1'

/** The location's `protocol-rejected`, with the messageId only when the read found a trusted one. */
export function sessionProtocolRejected(messageId?: string): JsonAnswer {
  const result = encodeSessionResponse({
    response: {
      protocolVersion: VERSION,
      ...(messageId === undefined ? {} : { messageId }),
      outcome: 'protocol-rejected',
      body: {},
    },
    limits: OUTPUT_LIMITS,
  })
  if (result.kind !== 'encoded')
    throw new TypeError('server-entry: a session refusal did not encode')
  return { kind: 'json', status: STATUS_BY_OUTCOME['protocol-rejected'], bytes: result.bytes }
}

/** Encodes one business response. The codec checks the outcome and body against the operation. */
export function sessionAnswer(
  operation: SessionOperation,
  messageId: string,
  outcome: PublicOutcome,
  body: unknown,
  diagnostics: DiagnosticSink | undefined,
): JsonAnswer | NoAnswer {
  const input = {
    operation,
    response: { protocolVersion: VERSION, messageId, outcome, body },
    limits: OUTPUT_LIMITS,
  } as unknown as SessionResponseEncodeInput
  const result = encodeSessionResponse(input)
  if (result.kind !== 'encoded') {
    emit(diagnostics, { code: 'encode.fault', operation })
    return { kind: 'no-answer' }
  }
  return { kind: 'json', status: STATUS_BY_OUTCOME[outcome], bytes: result.bytes }
}
