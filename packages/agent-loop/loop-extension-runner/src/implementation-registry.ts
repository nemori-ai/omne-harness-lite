import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { ExtensionInput } from '@omne-harness-lite/loop-extension'
import type { RunnerInvocationMode, RunnerInvocationResult } from './run-pass.ts'

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

/** A synchronous, instance-owned contribution ledger, independently usable without Cordis. */
export function createRunnerImplementationRegistry(): RunnerImplementationRegistry {
  const entries = new Map<string, { readonly implementation: RunnerBuiltinImplementation }>()
  const running = new Set<Promise<unknown>>()
  let admitting = true
  return Object.freeze({
    registerBuiltin(name: string, implementation: RunnerBuiltinImplementation) {
      if (!admitting) throw new Error('Runner contribution registry is closed')
      if (
        !('ok' in parseOpaqueIdentifier(name, 'BuiltinName')) ||
        typeof implementation !== 'function'
      )
        throw new TypeError('Invalid builtin registration')
      if (entries.has(name)) throw new Error('Builtin implementation already registered')
      const entry = Object.freeze({ implementation })
      entries.set(name, entry)
      return () => {
        if (entries.get(name) === entry) entries.delete(name)
      }
    },
    capture(name: string): RunnerImplementationLease | { readonly absent: true } {
      const entry = entries.get(name)
      if (!admitting || entry === undefined) return { absent: true }
      return Object.freeze({
        invoke(
          input: ExtensionInput,
          signal: AbortSignal,
          mode: RunnerInvocationMode,
        ): Promise<RunnerInvocationResult> {
          if (!admitting || signal.aborted) return Promise.resolve({ kind: 'controlUnavailable' })
          if (entries.get(name) !== entry) return Promise.resolve({ kind: 'notStartedUnavailable' })
          const work = Promise.resolve().then(async (): Promise<RunnerInvocationResult> => {
            if (!admitting || signal.aborted) return { kind: 'controlUnavailable' }
            if (entries.get(name) !== entry) return { kind: 'notStartedUnavailable' }
            let result: RunnerInvocationResult
            try {
              result = await entry.implementation(input, signal, mode)
            } catch {
              result = { kind: 'errored', error: 'Builtin implementation failed' }
            }
            if (!admitting || signal.aborted) return { kind: 'controlUnavailable' }
            if (entries.get(name) !== entry)
              return {
                kind: 'errored',
                error: 'Builtin implementation withdrawn during invocation',
              }
            return result
          })
          running.add(work)
          void work.then(
            () => running.delete(work),
            () => running.delete(work),
          )
          return work
        },
      })
    },
    closeAdmission() {
      admitting = false
      entries.clear()
    },
    async drain() {
      while (running.size !== 0) await Promise.allSettled([...running])
    },
  })
}
