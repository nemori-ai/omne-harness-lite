import { createInterface } from 'node:readline'
import type { Failure } from '../host-paths.ts'
import { parseReply, type Endpoint } from './protocol.ts'
import { filesHelper } from './transport.ts'
import { spawnFilesHelper } from './launcher.ts'

export type NativeBatchEntry = Endpoint &
  Readonly<{
    path: string
    named: string
    version: string | null
    bytes: string
    temp: string
  }>
type Reason = 'effectUnknown' | 'conflict' | 'closed'
export type BatchEvent =
  | Readonly<{ event: 'checked' | 'staged' }>
  | Readonly<{ event: 'beforePublish'; index: number }>
  | Readonly<{ event: 'published'; index: number; cleanupError?: { temp: string; code: string } }>
type Finish = Readonly<{ kind: 'committed' }> | Readonly<{ kind: 'unknown'; reason: Reason }>
type Result =
  | Failure
  | Finish
  | Readonly<{ kind: 'stageFailed'; reason: Failure; cleaned: boolean }>
type Message =
  | BatchEvent
  | Readonly<{ event: 'result' } & Finish>
  | Readonly<{ event: 'stageFailure'; failure: Failure; cleaned: boolean }>

function parse(value: unknown): Message | Failure {
  if (value === null || typeof value !== 'object') return 'unknown'
  if ('failure' in value && !('event' in value)) {
    const refusal = parseReply(value)
    return typeof refusal === 'string' ? refusal : 'unknown'
  }
  if (!('event' in value)) return 'unknown'
  if (
    value.event === 'stageFailure' &&
    'failure' in value &&
    'cleaned' in value &&
    typeof value.cleaned === 'boolean'
  ) {
    const refusal = parseReply({ failure: value.failure })
    return {
      event: 'stageFailure',
      failure: typeof refusal === 'string' ? refusal : 'unknown',
      cleaned: value.cleaned,
    }
  }
  if (value.event === 'checked' || value.event === 'staged') return { event: value.event }
  if (value.event === 'beforePublish' || value.event === 'published') {
    if (
      !('index' in value) ||
      typeof value.index !== 'number' ||
      !Number.isSafeInteger(value.index) ||
      value.index < 0
    )
      return 'unknown'
    if (value.event === 'beforePublish') return { event: value.event, index: value.index }
    if (!('cleanupError' in value)) return { event: value.event, index: value.index }
    const error = value.cleanupError
    if (
      error === null ||
      typeof error !== 'object' ||
      !('temp' in error) ||
      typeof error.temp !== 'string' ||
      !('code' in error) ||
      typeof error.code !== 'string'
    )
      return 'unknown'
    return {
      event: value.event,
      index: value.index,
      cleanupError: { temp: error.temp, code: error.code },
    }
  }
  if (value.event !== 'result' || !('kind' in value)) return 'unknown'
  if (value.kind === 'committed') return { event: value.event, kind: value.kind }
  if (value.kind !== 'unknown' || !('reason' in value)) return 'unknown'
  const reason = value.reason
  return reason === 'closed' || reason === 'conflict' || reason === 'effectUnknown'
    ? { event: value.event, kind: value.kind, reason }
    : 'unknown'
}

/** The callback acknowledges durable manifests before the helper may advance. */
export async function runBatch(
  entries: readonly NativeBatchEntry[],
  rooted: boolean,
  onEvent: (event: BatchEvent) => Promise<'continue' | 'closed' | 'effectUnknown'>,
): Promise<Result> {
  const helper = await filesHelper()
  if (helper.kind !== 'ready') return 'unavailable'
  const child = spawnFilesHelper(helper.path)
  let failed = false
  let result: Result = 'unknown'
  let phase: 'initial' | 'staging' | 'publishing' | 'ended' = 'initial'
  let next = 0
  let publishing = false
  const timer = setTimeout(() => {
    failed = true
    child.kill('SIGKILL')
  }, 60_000)
  child.stderr.resume()
  child.stdin.on('error', () => {
    failed = true
  })
  child.on('error', () => {
    failed = true
  })
  const closed = new Promise<number | null>(resolve => child.on('close', resolve))
  const messages = (async () => {
    for await (const line of createInterface({ input: child.stdout })) {
      const message = parse(JSON.parse(line))
      if (phase === 'ended') throw new Error('helper replied after completion')
      if (typeof message === 'string') {
        if (phase !== 'initial') throw new Error('helper refused after staging')
        result = message
        phase = 'ended'
        child.stdin.end()
        continue
      }
      if (message.event === 'stageFailure') {
        if (phase !== 'staging') throw new Error('stage failure outside staging')
        result = { kind: 'stageFailed', reason: message.failure, cleaned: message.cleaned }
        phase = 'ended'
        child.stdin.end()
        continue
      }
      if (message.event === 'result') {
        if (message.kind === 'committed' && (next !== entries.length || publishing))
          throw new Error('helper committed without receipts')
        result = message
        phase = 'ended'
        child.stdin.end()
        continue
      }
      if (message.event === 'checked' && phase === 'initial') phase = 'staging'
      else if (message.event === 'staged' && phase === 'staging') phase = 'publishing'
      else if (
        message.event === 'beforePublish' &&
        phase === 'publishing' &&
        !publishing &&
        message.index === next
      )
        publishing = true
      else if (
        message.event === 'published' &&
        phase === 'publishing' &&
        publishing &&
        message.index === next
      ) {
        publishing = false
        next++
      } else throw new Error('invalid helper publication order')
      let ack: 'continue' | 'closed' | 'effectUnknown'
      try {
        ack = await onEvent(message)
      } catch {
        ack = 'effectUnknown'
      }
      child.stdin.write(`${ack}\n`)
    }
  })().catch(() => {
    failed = true
    child.kill('SIGKILL')
  })
  child.stdin.write(`${JSON.stringify({ operation: 'batch', rooted, entries })}\n`)
  const code = await closed
  clearTimeout(timer)
  await messages
  return failed || code !== 0 ? 'unknown' : result
}
