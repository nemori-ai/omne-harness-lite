import type { ExtensionInput } from '@omne-harness-lite/loop-extension'
import type { RunnerInvocationMode, RunnerInvocationResult } from './run-pass-types.ts'
import type { SessionAccess, SessionScope } from '@omne-harness-lite/session-tenancy'
import type { AdmissionInput, AdmissionJudgment } from '@omne-harness-lite/tool-admission'

export type OfficialAdmissionContribution = (
  access: SessionAccess,
  scope: SessionScope,
  pass: string,
  batch: readonly [AdmissionInput, ...AdmissionInput[]],
) => ReturnType<AdmissionJudgment['admit']>

export interface OfficialAdmissionRegistration {
  readonly registerAdmission: (contribution: OfficialAdmissionContribution) => () => void
}

export interface OfficialAdmissionLease {
  readonly invoke: OfficialAdmissionContribution
  readonly isActive: () => boolean
}

/** The one builtin ledger; contributors may implement a structural subset of its result. */
export type RunnerBuiltinImplementation = (
  input: ExtensionInput,
  signal: AbortSignal,
  mode: RunnerInvocationMode,
) => Promise<RunnerInvocationResult>

export interface RunnerImplementations extends OfficialAdmissionRegistration {
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
  readonly captureAdmission: () => OfficialAdmissionLease | { readonly absent: true }
  readonly closeAdmission: () => void
  /** Wait for actual contributor promises; closing admission alone does not stop them. */
  readonly drain: () => Promise<void>
}
