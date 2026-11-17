import type { Outcome } from '@omne-harness/operation-result'
import type { ToolExecutionContext, ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import { contextPort } from './context-port.ts'

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

const port = contextPort<WebAccess>()
export function webAccessOf(context: ToolExecutionContext): WebAccess | undefined {
  return port.of(context)
}

export function attachWebAccess(
  scope: ToolExecutionScope,
  access: WebAccess,
): ToolExecutionScope {
  return port.attach(scope, access)
}
