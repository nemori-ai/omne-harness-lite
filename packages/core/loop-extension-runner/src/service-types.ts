import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type { Conclusion, PositionedSubject } from '@omne-harness-lite/loop-extension'
import type { LogPrefixView } from '@omne-harness-lite/messages'

import type { RunnerReplayFailure } from './pass-history-types.ts'
import type { RunnerChainSources } from './runner-chain-types.ts'
import type { RunnerFailure, RunnerPassResult, RunnerPorts } from './run-pass-types.ts'
import type { LogEntryInput } from '@omne-harness-lite/session-log'
import type { RunnerLogBinding, RunnerTaskOwner } from './task-owner-types.ts'
import type { RunnerActionRequest, RunnerActionResult, RunnerActionSource } from './action-types.ts'

export type RunnerReplayRequest = PositionedSubject & {
  readonly manifest: string
  readonly anchor: string
  readonly run?: string
}
export type RunnerDispatchRequest = Exclude<
  RunnerReplayRequest,
  { readonly position: 'before_action' }
> & { readonly attempt?: JsonNumber }
export type RunnerAnyDispatchRequest = RunnerDispatchRequest | RunnerActionRequest

export interface RunnerReadScope {
  readonly binding: RunnerLogBinding
  readonly sources: RunnerChainSources
  /** The shared physical-log owner survives runner replacement. No close right is transferred. */
  readonly owner: RunnerTaskOwner
  readonly isActive: () => boolean
  /** Revokes this call's borrowed sources and handles. It never closes the physical log. */
  readonly release: () => void
}
/** Execution sources supplied by the authorized host; the runner alone supplies log and registry ports. */
export type RunnerExecutionPorts = Pick<
  RunnerPorts,
  | 'readAskState'
  | 'openHandles'
  | 'verifyFailure'
  | 'judgeCapabilities'
  | 'now'
  | 'mintReminder'
  | 'fallbackNeedsProjection'
> & {
  /** Only non-builtin execution belongs to this owner; builtins always use the real registry. */
  readonly invokeCommand: RunnerPorts['invoke']
  readonly commandPresence: RunnerPorts['presence']
}
export interface RunnerDispatchScope extends RunnerReadScope {
  /** Required only for before_action. It is never taken from caller-supplied proof fields. */
  readonly action?: RunnerActionSource
  readonly ports: RunnerExecutionPorts
  readonly subjectForCandidate: (
    entry: LogEntryInput,
  ) => PositionedSubject | { readonly unavailable: true }
  readonly readMessagePrefix: () => Promise<LogPrefixView | { readonly unavailable: true }>
}
export type RunnerScopeFailure = Extract<
  RunnerFailure,
  { readonly failure: 'invalidInput' | 'manifestMissing' | 'unavailable' }
>

/** Trusted assembly boundary, not a request-carried proof. Methods capture actual same-call sources. */
export interface RunnerServiceHost {
  readonly acquireDispatch: (
    request: RunnerAnyDispatchRequest,
    signal: AbortSignal,
  ) => Promise<
    | RunnerDispatchScope
    | RunnerScopeFailure
    | Extract<RunnerFailure, { readonly failure: 'attemptSuperseded' }>
  >
  /** This branch must not acquire a failure-consumption right or execute/guard/write anything. */
  readonly acquireReplay: (
    request: RunnerReplayRequest,
    signal: AbortSignal,
  ) => Promise<RunnerReadScope | RunnerScopeFailure>
}
export interface LoopExtensionRunnerService {
  readonly dispatch: {
    (request: RunnerDispatchRequest, signal: AbortSignal): Promise<RunnerPassResult>
    (request: RunnerActionRequest, signal: AbortSignal): Promise<RunnerActionResult>
  }
  readonly replay: (
    request: RunnerReplayRequest,
  ) => Promise<readonly Conclusion[] | RunnerReplayFailure>
}
