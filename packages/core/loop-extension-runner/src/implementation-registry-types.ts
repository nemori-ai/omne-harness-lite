
import type { ExtensionInput } from '@omne-harness-lite/loop-extension'
import type { RunnerInvocationMode, RunnerInvocationResult } from './run-pass-types.ts'


/** The one builtin ledger; contributors may implement a structural subset of its result. */
export type RunnerBuiltinImplementation = (
  input: ExtensionInput,
  signal: AbortSignal,
  mode: RunnerInvocationMode,
) => Promise<RunnerInvocationResult>

export interface RunnerImplementations {
  readonly registerBuiltin: (
    name: string,
    implementation: RunnerBuiltinImplementation,
  ) => () => void
}

export interface RunnerImplementationLease {
  readonly invoke: RunnerBuiltinImplementation
}

export interface RunnerImplementationRegistry extends RunnerImplementations {
  /** Capture this generation before starting the contribution, never resolve it again on return. */
  readonly capture: (name: string) => RunnerImplementationLease | { readonly absent: true }
  readonly closeAdmission: () => void
  /** Wait for actual contributor promises; closing admission alone does not stop them. */
  readonly drain: () => Promise<void>
}
