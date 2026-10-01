import type { Context } from '@deepseek-ai/cordis'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type { Conclusion, PositionedSubject } from '@omne-harness-lite/loop-extension'
import type { LogPrefixView } from '@omne-harness-lite/messages'
import type { SessionLog } from '@omne-harness-lite/session-log-jsonl'
import type { RunnerReplayFailure } from './pass-history.ts'
import type { RunnerChainSources } from './runner-chain.ts'
import type { RunnerFailure, RunnerPassResult, RunnerPorts } from './run-pass.ts'
import type { createRunnerLogAdapter } from './run-log.ts'
import type { RunnerLogBinding, RunnerTaskOwner } from './task-owner.ts'

export type RunnerReplayRequest = PositionedSubject & {
  readonly manifest: string
  readonly anchor: string
  readonly run?: string
}
export type RunnerDispatchRequest = RunnerReplayRequest & { readonly attempt?: JsonNumber }

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
  readonly ports: RunnerExecutionPorts
  readonly subjectForCandidate: Parameters<typeof createRunnerLogAdapter>[0]['subjectForCandidate']
  readonly readMessagePrefix: () => Promise<LogPrefixView | { readonly unavailable: true }>
}
export type RunnerScopeFailure = Extract<
  RunnerFailure,
  { readonly failure: 'invalidInput' | 'manifestMissing' | 'unavailable' }
>

/** Trusted assembly boundary, not a request-carried proof. Methods capture actual same-call sources. */
export interface RunnerServiceHost {
  readonly acquireDispatch: (
    request: RunnerDispatchRequest,
    signal: AbortSignal,
  ) => Promise<RunnerDispatchScope | RunnerScopeFailure>
  /** This branch must not acquire a failure-consumption right or execute/guard/write anything. */
  readonly acquireReplay: (
    request: RunnerReplayRequest,
    signal: AbortSignal,
  ) => Promise<RunnerReadScope | RunnerScopeFailure>
}
export type RunnerHostFactory = (context: Context, log: SessionLog) => RunnerServiceHost
export interface LoopExtensionRunnerService {
  readonly dispatch: (
    request: RunnerDispatchRequest,
    signal: AbortSignal,
  ) => Promise<RunnerPassResult>
  readonly replay: (
    request: RunnerReplayRequest,
  ) => Promise<readonly Conclusion[] | RunnerReplayFailure>
}
