import type { SseStream } from './observation-hub/sse.ts'

export type JsonAnswer = Readonly<{
  kind: 'json'
  status: number
  bytes: Uint8Array
  close?: boolean
  afterWrite?: () => void
}>

export type NoAnswer = Readonly<{ kind: 'no-answer' }>

export type SseAnswer = Readonly<{
  kind: 'sse'
  status: number
  first: string
  attach?: (stream: SseStream) => void
}>

export type Answer = JsonAnswer | NoAnswer | SseAnswer
