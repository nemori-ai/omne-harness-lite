import type { Outcome } from '@omne-harness/operation-result'
import type { ToolExecutionContext, ToolExecutionScope } from '@omne-harness/tool-contract/provider'

export type SearchHit = Readonly<{
  title: string
  url: string
  publishedAt?: string
  excerpt: string
}>

export type FetchedPage = Readonly<{
  finalUrl: string
  mediaType: string
  markdown: string
  truncated: boolean
}>

export type WebFailure =
  | Readonly<{ kind: 'unconfigured' }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'quota-exhausted' }>
  | Readonly<{ kind: 'rate-limited' }>
  | Readonly<{ kind: 'upstream'; status: number }>
  | Readonly<{ kind: 'invalid-url' }>
  | Readonly<{ kind: 'redirect-limit' }>
  | Readonly<{ kind: 'timeout' }>
  | Readonly<{ kind: 'too-large' }>
  | Readonly<{ kind: 'not-text'; mediaType: string }>
  | Readonly<{ kind: 'network'; diagnostic: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface WebAccess {
  search(
    input: Readonly<{ query: string; limit: number }>,
    signal: AbortSignal,
  ): Promise<Outcome<readonly SearchHit[], WebFailure>>
  fetch(
    input: Readonly<{ url: string }>,
    signal: AbortSignal,
  ): Promise<Outcome<FetchedPage, WebFailure>>
}

const attachments = new WeakMap<ToolExecutionContext, WebAccess>()
export function webAccessOf(context: ToolExecutionContext): WebAccess | undefined {
  return attachments.get(context)
}

/** Attach after other context-producing attachments. Finish removes access before delegation. */
export function attachWebAccess(scope: ToolExecutionScope, access: WebAccess): ToolExecutionScope {
  const context = scope.context
  attachments.set(context, access)
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
