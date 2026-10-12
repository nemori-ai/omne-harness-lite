import type { MultiCommandTool, ParameterJudge } from '@omne-harness-lite/tool-definition'
import type {
  ToolExecutor,
  InvocationDependencies,
} from '@omne-harness-lite/tool-execution-runtime'
import type {
  EnvironmentDescription,
  CommandOutcome,
  TerminalInformation,
  FacilityFailure,
} from '@omne-harness-lite/execution-environments'

/** Workspace can supply this data through the existing Runtime Context source mechanism. */
export const SHELL_CONTEXT_KEY = 'shell.initial'
export interface ShellInitialContext {
  readonly cwd: string
  readonly envs: Readonly<Record<string, string>>
}
export interface ShellOptions {
  readonly shell: { readonly executable: string; readonly args: readonly string[] }
  /** Combined retention budget across all output channels. Does not stop the process. */
  readonly maxOutputBytes: number
  readonly contextKey?: string
  /** Upper caller's waiting threshold. Omitted means PT10M, not an execution deadline. */
  readonly backgroundThreshold?: string
  readonly executePermission?: 'forbid' | 'auto' | 'ask'
  readonly parameters?: ParameterJudge
}
export interface ShellTool {
  readonly definition: MultiCommandTool
  readonly executor: ToolExecutor
}
export interface ShellOutput {
  readonly streams: readonly {
    readonly stream: 'stdout' | 'stderr' | 'terminal'
    readonly text: string
  }[]
  readonly retainedBytes: number
  readonly toolDiscardedBytes: number
  readonly droppedFrames: number
}
export interface ShellExecutionResult {
  readonly kind: 'execution'
  readonly environment: EnvironmentDescription
  readonly outcome: CommandOutcome
  readonly output: ShellOutput
  readonly stopObservation?: 'confirmed' | 'unconfirmed'
}
export interface ShellSessionResult {
  readonly kind: 'session'
  readonly terminal_id: string
  readonly environment: EnvironmentDescription
  readonly observation: TerminalInformation
}
/** Business failure payload. A partial creation retains the original terminal reference. */
export type ShellContextFailureReason =
  | `context:${Extract<Awaited<ReturnType<InvocationDependencies['context']['read']>>, { kind: 'rejected' }>['reason']}`
  | 'context:missingValue'
  | 'context:invalidValue'
export type ShellFailureReason =
  | ShellContextFailureReason
  | `facility:${FacilityFailure['reason']}`
  | `created:observation:${FacilityFailure['reason'] | 'missing'}`
  | 'arguments:invalid'
  | 'arguments:unsupported'
  | 'arguments:invalidTerminal'
  | 'interrupted'
export interface ShellBusinessFailure {
  readonly kind: 'rejected'
  readonly reason: ShellFailureReason
  readonly detail?: { readonly terminal_id: string }
}
export interface ShellClosureResult {
  readonly kind: 'closure'
  readonly terminal_id: string
  readonly status: 'confirmed' | 'unconfirmed'
}
export type ShellResultPayload =
  ShellExecutionResult | ShellSessionResult | ShellClosureResult | ShellBusinessFailure
