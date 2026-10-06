import {
  type RunnerBuiltinImplementation,
  type RunnerImplementationLease,
  type RunnerImplementationRegistry,
} from '@omne-harness-lite/loop-extension-runner'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { ExtensionInput } from '@omne-harness-lite/loop-extension'
import type {
  RunnerInvocationMode,
  RunnerInvocationResult,
} from '@omne-harness-lite/loop-extension-runner'
import type {
  OfficialAdmissionContribution,
  OfficialAdmissionLease,
} from '@omne-harness-lite/loop-extension-runner'
import { OFFICIAL_ADMISSION_NAME } from '@omne-harness-lite/tool-admission'

/** A synchronous, instance-owned contribution ledger, independently usable without Cordis. */
export function createRunnerImplementationRegistry(): RunnerImplementationRegistry {
  const entries = new Map<string, { readonly implementation: RunnerBuiltinImplementation }>()
  const running = new Set<Promise<unknown>>()
  let admission: { readonly contribution: OfficialAdmissionContribution } | undefined
  let admitting = true
  return Object.freeze({
    registerBuiltin(name: string, implementation: RunnerBuiltinImplementation) {
      if (!admitting) throw new Error('Runner contribution registry is closed')
      if (
        !('ok' in parseOpaqueIdentifier(name, 'BuiltinName')) ||
        typeof implementation !== 'function' ||
        name === OFFICIAL_ADMISSION_NAME
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
    registerAdmission(contribution: OfficialAdmissionContribution) {
      if (!admitting) throw new Error('Runner contribution registry is closed')
      if (typeof contribution !== 'function')
        throw new TypeError('Invalid official admission contribution')
      if (admission !== undefined)
        throw new Error('Official admission contribution already registered')
      const entry = Object.freeze({ contribution })
      admission = entry
      return () => {
        if (admission === entry) admission = undefined
      }
    },
    captureAdmission(): OfficialAdmissionLease | { readonly absent: true } {
      const entry = admission
      if (!admitting || entry === undefined) return { absent: true }
      const isActive = () => admitting && admission === entry
      const failed = Object.freeze({ kind: 'failed', reason: 'unavailable' } as const)
      return Object.freeze({
        isActive,
        invoke(...args: Parameters<OfficialAdmissionContribution>) {
          if (!isActive()) return Promise.resolve(failed)
          const work = Promise.resolve().then(async () => {
            if (!isActive()) return failed
            try {
              const result = await entry.contribution(...args)
              return isActive() ? result : failed
            } catch {
              return failed
            }
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
      admission = undefined
    },
    async drain() {
      while (running.size !== 0) await Promise.allSettled([...running])
    },
  })
}
