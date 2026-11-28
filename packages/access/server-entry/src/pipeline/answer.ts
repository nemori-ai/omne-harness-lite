import type { ServerResponse } from 'node:http'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { REJECTION_BODY, type Outcome, type Rejection } from '@omne-harness/public-contract'
import { STATUS_BY_OUTCOME } from './status.ts'

export const EMPTY_BODY: JsonValue = { kind: 'object', entries: [] }

const REJECTION_LIMITS = {
  maxBytes: 64 * 1024,
  maxDepth: 8,
  maxItems: 256,
  maxMembers: 16,
  maxStringLength: 4096,
  maxNumberLength: 24,
}

/** The body of protocol-rejected: why the message was refused, in the shape every protocol shares. */
export function rejectedBody(rejection: Rejection): JsonValue {
  const written = REJECTION_BODY.write({ rejection }, REJECTION_LIMITS)
  return written.ok ? written.value : EMPTY_BODY
}

export function writeBare(
  res: ServerResponse,
  status: number,
  headers: Readonly<Record<string, string>> = {},
): void {
  res.writeHead(status, {
    'cache-control': 'no-store',
    'content-length': '0',
    connection: 'close',
    ...headers,
  })
  res.end()
}

export type NotExecuted = 'not-mounted' | 'not-offered' | 'conflict' | 'unavailable'

/** Not there is 404; the registry that cannot say what is there is 503. */
const NOT_EXECUTED_STATUS = {
  'not-mounted': 404,
  'not-offered': 404,
  conflict: 404,
  unavailable: 503,
} as const satisfies Readonly<Record<NotExecuted, number>>

const NOT_EXECUTED = Object.fromEntries(
  Object.keys(NOT_EXECUTED_STATUS).map(reason => [
    reason,
    Buffer.from(`{"kind":"not-executed","reason":"${reason}"}`),
  ]),
) as Readonly<Record<NotExecuted, Buffer>>

/** What was asked for is not provided: nothing ran, and the caller can know that for certain. */
export function writeNotExecuted(res: ServerResponse, reason: NotExecuted): void {
  const body = NOT_EXECUTED[reason]
  res.writeHead(NOT_EXECUTED_STATUS[reason], {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(body.byteLength),
    connection: 'close',
  })
  res.end(body)
}

export type WrittenAnswer = Readonly<{
  outcome: Outcome
  body: JsonValue
  messageId?: string
  close: boolean
}>

export function writeAnswer(res: ServerResponse, answer: WrittenAnswer): void {
  const bytes = Buffer.from(
    writeJsonText({
      kind: 'object',
      entries: [
        { key: 'outcome', value: { kind: 'string', value: answer.outcome } },
        { key: 'body', value: answer.body },
      ],
    }),
  )
  res.writeHead(STATUS_BY_OUTCOME[answer.outcome], {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(bytes.byteLength),
    ...(answer.messageId === undefined ? {} : { 'omne-message-id': answer.messageId }),
    ...(answer.close || answer.outcome === 'denied' ? { connection: 'close' } : {}),
  })
  res.end(bytes)
}
