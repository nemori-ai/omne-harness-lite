import { setTimeout as pause } from 'node:timers/promises'
import type { Receipt, OperationRef } from '@omne-harness-lite/session-runtime'
import type { SessionTextMessage } from './session-reading.ts'
import type { SessionSubmissionReading } from './session-submission.ts'
import { sendSessionHostRequest, type SessionHostWaitPolicy } from './session-host-client.ts'
import { positivePolicy } from './session-host-io.ts'
import {
  readSubmittedReply,
  readSubmissionReply,
  readMessagesReply,
  type SubmitRequest,
} from './session-message-replies.ts'

type Submission = Extract<SessionSubmissionReading, { kind: 'submission' }>
type Exchange = (
  request: Parameters<typeof sendSessionHostRequest>[0]['request'],
) => ReturnType<typeof sendSessionHostRequest>
type Known = {
  readonly kind: 'session-message'
  readonly request: SubmitRequest
  readonly receipt: Receipt
}
interface MessageOptions {
  readonly home: string
  readonly request: SubmitRequest
  readonly policy: SessionMessagePolicy
  readonly signal: AbortSignal
}
export interface SessionMessagePolicy extends SessionHostWaitPolicy {
  readonly maxWaitMs: number
  readonly pollIntervalMs: number
}
type MessageState =
  | { readonly status: 'unconfirmed'; readonly reason: string; readonly operation?: OperationRef }
  | { readonly status: 'rejected'; readonly reason: string }
  | {
      readonly status: 'accepted'
      readonly reason: 'waitExpired' | 'detached' | 'loginRejected' | 'confirmationUnavailable'
      readonly submission: Submission | null
    }
  | {
      readonly status: 'completed' | 'failed' | 'cancelled'
      readonly submission: Submission
      readonly messages: readonly SessionTextMessage[]
    }
export type SessionMessageOutcome = {
  readonly kind: 'session-message'
  readonly request: {
    readonly binding: SubmitRequest['binding']
    readonly session: SubmitRequest['session']
    readonly operationKey: string
    readonly messageId: string
  }
  readonly receipt: Receipt | null
} & MessageState
type InternalOutcome = {
  readonly kind: 'session-message'
  readonly request: SubmitRequest
  readonly receipt: Receipt | null
} & MessageState
/** Submit once. Poll only the original receipt; detaching does not cancel its work. */
export async function submitSessionMessage(
  options: MessageOptions,
): Promise<SessionMessageOutcome> {
  const outcome = await submitOriginal(options)
  const { request } = outcome
  return {
    ...outcome,
    request: {
      binding: request.binding,
      session: request.session,
      operationKey: request.operationKey,
      messageId: request.message.id,
    },
  }
}
async function submitOriginal(options: MessageOptions): Promise<InternalOutcome> {
  positivePolicy(options.policy, ['maxResponseBytes', 'timeoutMs', 'maxWaitMs', 'pollIntervalMs'])
  const waitSignal = AbortSignal.any([
    options.signal,
    AbortSignal.timeout(options.policy.maxWaitMs),
  ])
  const waitPolicy = {
    maxResponseBytes: options.policy.maxResponseBytes,
    timeoutMs: options.policy.timeoutMs,
  }
  const exchange = (request: Parameters<typeof sendSessionHostRequest>[0]['request']) =>
    sendSessionHostRequest({ home: options.home, request, policy: waitPolicy, signal: waitSignal })
  const base = { kind: 'session-message' as const, request: options.request }
  const reply = await exchange(options.request)
  if (reply.kind !== 'reply')
    return { ...base, receipt: null, status: 'unconfirmed', reason: reply.reason }
  const accepted = readSubmittedReply(reply.result, options.request)
  if (!accepted) return { ...base, receipt: null, status: 'unconfirmed', reason: 'invalidReply' }
  if ('failure' in accepted)
    return { ...base, receipt: null, status: 'rejected', reason: accepted.failure }
  if (accepted.kind === 'unknownCommit')
    return {
      ...base,
      receipt: null,
      status: 'unconfirmed',
      reason: 'unknownCommit',
      operation: accepted.operation,
    }
  const known = { ...base, receipt: accepted.receipt }
  return observeSubmission(options, known, exchange, waitSignal)
}
async function observeSubmission(
  options: MessageOptions,
  known: Known,
  exchange: Exchange,
  waitSignal: AbortSignal,
): Promise<InternalOutcome> {
  let submission: Submission | null = null
  for (;;) {
    if (waitSignal.aborted)
      return {
        ...known,
        status: 'accepted',
        reason: options.signal.aborted ? 'detached' : 'waitExpired',
        submission,
      }
    const observation = await observeOnce(known, exchange)
    if (waitSignal.aborted) continue
    if ('reason' in observation)
      return { ...known, status: 'unconfirmed', reason: observation.reason }
    const read = observation.read
    submission = read
    if (read.admission)
      return { ...known, status: 'accepted', reason: read.admission.reason, submission: read }
    if (read.run && read.run.state !== 'running') return terminal(known, read, exchange)
    await waitForObservation(options.policy.pollIntervalMs, waitSignal)
  }
}
async function waitForObservation(intervalMs: number, signal: AbortSignal): Promise<void> {
  try {
    await pause(intervalMs, undefined, { signal })
  } catch (error) {
    if (!signal.aborted) throw error
  }
}
async function observeOnce(
  known: Known,
  exchange: Exchange,
): Promise<{ read: Submission } | { reason: string }> {
  const result = await exchange({
    format: known.request.format,
    binding: known.request.binding,
    command: 'readSubmission',
    operation: known.receipt.operation,
  })
  if (result.kind !== 'reply') return { reason: result.reason }
  const read = readSubmissionReply(result.result, known.request, known.receipt)
  if (!read || !('kind' in read) || read.kind !== 'submission')
    return { reason: 'invalidSubmission' }
  return { read }
}
async function terminal(
  known: Known,
  submission: Submission,
  exchange: Exchange,
): Promise<InternalOutcome> {
  const result = await exchange({
    format: known.request.format,
    binding: known.request.binding,
    command: 'readMessages',
    session: known.request.session,
  })
  if (result.kind !== 'reply') return { ...known, status: 'unconfirmed', reason: result.reason }
  const read = readMessagesReply(result.result, submission)
  if (!read || 'failure' in read)
    return { ...known, status: 'unconfirmed', reason: 'invalidMessages' }
  const run = submission.run!
  if (run.state === 'running') throw new Error('nonterminal submission')
  return {
    ...known,
    status: run.state,
    submission,
    messages: read.messages.filter(
      message => message.run === run.id || message.id === known.request.message.id,
    ),
  }
}
