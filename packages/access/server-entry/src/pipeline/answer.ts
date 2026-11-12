// Writing the answers of the new address (#1233 spec 已定 9, 11, 14). Steps 1 to 6 answer with a
// status code only. From step 7 on the body is `{"outcome":…,"body":…}`. `Connection: close` goes
// on every answer written before the body was read in full, and on every `denied`.
import type { ServerResponse } from 'node:http'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/public-contract'
import { STATUS_BY_OUTCOME } from './status.ts'

export const EMPTY_BODY: JsonValue = { kind: 'object', entries: [] }

/** A response the caller is no longer there to read is dropped. */
function writable(res: ServerResponse): boolean {
  return !res.destroyed && !res.writableEnded && !res.headersSent
}

/** Steps 1 to 6: the status, no body, the connection closed. */
export function writeBare(
  res: ServerResponse,
  status: number,
  headers: Readonly<Record<string, string>> = {},
): void {
  if (!writable(res)) return
  res.writeHead(status, {
    'cache-control': 'no-store',
    'content-length': '0',
    connection: 'close',
    ...headers,
  })
  res.end()
}

export type WrittenAnswer = Readonly<{
  outcome: Outcome
  body: JsonValue
  /** Absent before step 7 has recognised one. */
  messageId?: string
  close: boolean
}>

export function writeAnswer(res: ServerResponse, answer: WrittenAnswer): void {
  if (!writable(res)) return
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
