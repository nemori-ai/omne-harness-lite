import type { ToolExecutionContext, ToolExecutionScope } from '@omne-harness/tool-contract/provider'

export type BackgroundCallStatus = 'queued' | 'running' | 'ended-pending' | 'stopping' | 'unknown'

/** One call in the background as the model reads it; the author knows no session or reference. */
export type BackgroundCallItem = Readonly<{
  id: string
  intent: string | null
  action: string
  status: BackgroundCallStatus
  stop: Readonly<{
    by: 'user' | 'agent' | 'system'
    reason: string | null
    progress: 'requested' | 'accepted' | 'proven'
  }> | null
  lastLine: string | null
}>

export type BackgroundOutputPart =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'open' | 'sealed'; text: string; next: string }>
  | Readonly<{ kind: 'unreadable'; reason: string }>

export type BackgroundOutputView = Readonly<{
  id: string
  status: BackgroundCallStatus | 'ended'
  output: BackgroundOutputPart
}>

export type BackgroundStopAnswer = Readonly<{ id: string; kind: 'requested' | 'ended' }>

export type BackgroundFailure =
  | Readonly<{ kind: 'not-found'; id: string }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type BackgroundReply<T> = Readonly<{ ok: T }> | Readonly<{ failure: BackgroundFailure }>

export interface BoundBackgroundCalls {
  list(): Promise<BackgroundReply<readonly BackgroundCallItem[]>>
  output(
    input: Readonly<{ id: string; after: string | null }>,
  ): Promise<BackgroundReply<BackgroundOutputView>>
  terminate(
    input: Readonly<{ id: string; reason: string }>,
  ): Promise<BackgroundReply<BackgroundStopAnswer>>
}

const attachments = new WeakMap<ToolExecutionContext, BoundBackgroundCalls>()
export function backgroundCallsOf(context: ToolExecutionContext): BoundBackgroundCalls | undefined {
  return attachments.get(context)
}

/** Attach after other context-producing attachments. Finish removes access before delegation. */
export function attachBackgroundCalls(
  scope: ToolExecutionScope,
  value: BoundBackgroundCalls,
): ToolExecutionScope {
  const context = scope.context
  attachments.set(context, value)
  let finished: ReturnType<ToolExecutionScope['finish']> | undefined
  return {
    context,
    limits: scope.limits,
    finish(exit) {
      if (finished !== undefined) return finished
      attachments.delete(context)
      const completion = Promise.withResolvers<Awaited<ReturnType<ToolExecutionScope['finish']>>>()
      finished = completion.promise
      try {
        completion.resolve(scope.finish(exit))
      } catch (error) {
        completion.reject(error)
      }
      return finished
    },
  }
}
