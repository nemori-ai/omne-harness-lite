import type { AttemptId, RunId } from '@omne-harness-lite/call-accounts'
import type { JsonNumber, JsonValue } from '@omne-harness-lite/content-blocks'
import type { Position } from '@omne-harness-lite/loop-extension'
import type { SourceToken } from '@omne-harness-lite/session-log'
import type { AttemptPermit, Terminal } from '@omne-harness-lite/session-runtime'
export type Continuation =
  | {
      readonly kind: 'adoptInputs'
      readonly originalPosition: string
      readonly positions: readonly JsonNumber[]
    }
  | {
      readonly kind: 'invokeModel'
      readonly originalPosition: string
      readonly preparation: JsonValue
    }
  | {
      readonly kind: 'executeActions'
      readonly originalPosition: string
      readonly batch: JsonValue
    }
  | { readonly kind: 'compact'; readonly originalPosition: string; readonly plan: JsonValue }
  | {
      readonly kind: 'runExtensions'
      readonly originalPosition: string
      readonly position: Position
      readonly subject: JsonValue
    }
  | {
      readonly kind: 'finish'
      readonly originalPosition: string
      readonly terminal: Terminal
      readonly reason: string
    }
  | {
      readonly kind: 'wait'
      readonly originalPosition: string
      readonly originalCalls: readonly string[]
    }
export interface LoopFacts {
  readonly source: SourceToken
  readonly run: null | {
    readonly id: RunId
    readonly attempt: AttemptId | null
    readonly terminal: Terminal | null
    readonly continuation: Continuation | null
  }
}
/** These are fixed observations supplied by their real owners, not reads performed by nextStep. */
export interface CurrentInputs {
  readonly source: SourceToken | null
  readonly authorized: boolean | null
  readonly assembly: string | null
  readonly contextGeneration: string | null
  readonly reconciled: boolean | null
}
export interface DecisionOrigin {
  readonly expectedSourceToken: SourceToken
  readonly run: RunId
  readonly attempt: AttemptId
}
export type RunnableDecision = Continuation & DecisionOrigin
export type LoopDecision =
  | RunnableDecision
  | {
      readonly kind: 'idle'
      readonly reason: 'noRunnableAttempt'
      readonly expectedSourceToken: SourceToken
    }
  | {
      readonly kind: 'blocked'
      readonly reason: 'denied' | 'refreshFacts' | 'reconcile'
      readonly expectedSourceToken: SourceToken
    }
export type InvalidInput = { readonly invalidInput: true }
export type Unavailable = { readonly unavailable: true; readonly reason: 'requiredSource' }
export type DriveResult =
  | { readonly kind: 'committed'; readonly source: SourceToken }
  | {
      readonly kind: 'waiting'
      readonly originalPosition: string
      readonly originalCalls: readonly string[]
    }
  | { readonly kind: 'retryFromFacts' }
  | { readonly kind: 'handedBack'; readonly originalCalls: readonly string[] }
  | {
      readonly kind: 'blocked'
      readonly obligation: string
      readonly reason: 'unsupported' | 'denied' | 'unavailable' | 'awaitCancelled' | 'released'
    }
  | InvalidInput
/** Bound capabilities validate current permit and own their real execution and commit semantics. */
export interface AttemptCapabilities {
  readonly authorize: (
    permit: AttemptPermit,
    origin: DecisionOrigin,
  ) => Promise<'authorized' | 'denied' | 'unavailable'>
  readonly adoptInputs?: (
    decision: Extract<RunnableDecision, { kind: 'adoptInputs' }>,
    permit: AttemptPermit,
    signal: AbortSignal,
  ) => Promise<DriveResult>
  readonly invokeModel?: (
    decision: Extract<RunnableDecision, { kind: 'invokeModel' }>,
    permit: AttemptPermit,
    signal: AbortSignal,
  ) => Promise<DriveResult>
  readonly executeActions?: (
    decision: Extract<RunnableDecision, { kind: 'executeActions' }>,
    permit: AttemptPermit,
    signal: AbortSignal,
  ) => Promise<DriveResult>
  readonly compact?: (
    decision: Extract<RunnableDecision, { kind: 'compact' }>,
    permit: AttemptPermit,
    signal: AbortSignal,
  ) => Promise<DriveResult>
  readonly runExtensions?: (
    decision: Extract<RunnableDecision, { kind: 'runExtensions' }>,
    permit: AttemptPermit,
    signal: AbortSignal,
  ) => Promise<DriveResult>
  readonly finish?: (
    decision: Extract<RunnableDecision, { kind: 'finish' }>,
    permit: AttemptPermit,
    signal: AbortSignal,
  ) => Promise<DriveResult>
  /** Transfer original execution handles. This operation never cancels those executions. */
  readonly handBack: (
    originalCalls: readonly string[],
  ) => Promise<{ readonly kind: 'handedBack' } | { readonly kind: 'pending' }>
}
declare const ownerBrand: unique symbol
export interface AttemptOwner {
  readonly [ownerBrand]: true
}
declare const portsBrand: unique symbol
export interface AttemptPorts {
  readonly [portsBrand]: true
}
export interface DriveInput {
  readonly decision: RunnableDecision
  readonly permit: AttemptPermit
  readonly ports: AttemptPorts
  readonly signal?: AbortSignal
}
