// What a location handler gives the HTTP layer to write.
import type { SseStream } from './sse.ts'

/** A JSON answer. `close` asks the HTTP layer to close the connection after the answer. */
export type JsonAnswer = Readonly<{
  kind: 'json'
  status: number
  bytes: Uint8Array
  close?: boolean
}>

/** The entry has no trustworthy answer: status 500, empty body, connection closed. */
export type NoAnswer = Readonly<{ kind: 'no-answer' }>

/**
 * An SSE answer. `first` is the confirmation event. `attach` is given only for a succeeded
 * observation: the HTTP layer calls it after the first event is queued, and the stream stays open.
 */
export type SseAnswer = Readonly<{
  kind: 'sse'
  status: number
  first: string
  attach?: (stream: SseStream) => void
}>

export type Answer = JsonAnswer | NoAnswer | SseAnswer
