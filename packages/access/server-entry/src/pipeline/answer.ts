import type { ServerResponse } from 'node:http'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/public-contract'
import { STATUS_BY_OUTCOME } from './status.ts'

export const EMPTY_BODY: JsonValue = { kind: 'object', entries: [] }

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

export type NotExecuted = 'not-mounted' | 'not-offered' | 'conflict'

const NOT_EXECUTED = Object.fromEntries(
  (['not-mounted', 'not-offered', 'conflict'] as const).map(reason => [
    reason,
    Buffer.from(`{"kind":"not-executed","reason":"${reason}"}`),
  ]),
) as Readonly<Record<NotExecuted, Buffer>>

/** What was asked for is not provided: nothing ran, and the caller can know that for certain. */
export function writeNotExecuted(res: ServerResponse, reason: NotExecuted): void {
  const body = NOT_EXECUTED[reason]
  res.writeHead(404, {
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
