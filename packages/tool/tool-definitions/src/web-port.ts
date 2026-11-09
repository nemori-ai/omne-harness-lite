// The narrow port of the Web author. The author owns it; the host implements it and attaches one
// instance per call. The author does not know the search supplier, the HTTP client, credentials or
// tenants: it reads the port from the execution context and writes the result text.
import type { Outcome } from '@omne-harness/operation-result'
import type { ToolExecutionContext, ToolExecutionScope } from '@omne-harness/tool-contract/provider'

/** One search result. `excerpt` is a short extract, never the whole page. */
export type SearchHit = Readonly<{
  title: string
  url: string
  publishedAt?: string
  excerpt: string
}>

/** One fetched page. `truncated` is true when the provider cut the body at its byte limit. */
export type FetchedPage = Readonly<{
  finalUrl: string
  mediaType: string
  markdown: string
  truncated: boolean
}>

/**
 * The closed set of Web failures (I-9). Zero search results are a success with an empty array, not
 * a failure. `too-large` is only for a body that cannot be cut; a body that can be cut succeeds with
 * `truncated: true`.
 */
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
