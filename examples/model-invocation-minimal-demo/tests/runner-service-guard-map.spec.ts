import { describe, expect, it } from 'vitest'
import type {CanDispatchAgainResult} from '@omne-harness-lite/model-request-runtime-local'
import type { RunnerCapabilityResult } from '@omne-harness-lite/loop-extension-runner'
import { projectRunnerRetryGuard } from '../src/runner-service-host.ts'

describe('runner service adapter preserves the model retry guard result', () => {
  const rows: readonly {
    readonly name: string
    readonly input: CanDispatchAgainResult
    readonly expected: RunnerCapabilityResult
  }[] = [
    { name: 'allowed', input: { allowed: true }, expected: { kind: 'accepted' } },
    {
      name: 'refused reason',
      input: { refused: { why: 'provider_not_allowed' } },
      expected: { kind: 'rejected', reason: 'provider_not_allowed' },
    },
    {
      name: 'already ended',
      input: { alreadyEnded: true },
      expected: { kind: 'rejected', reason: 'alreadyEnded' },
    },
    {
      name: 'call absent',
      input: { callNotFound: true },
      expected: { kind: 'rejected', reason: 'callNotFound' },
    },
    {
      name: 'wrong phase',
      input: { wrongPhase: { phase: 'open' } },
      expected: { kind: 'rejected', reason: 'wrongPhase' },
    },
    {
      name: 'invalid input',
      input: { invalidInput: { reason: 'malformed' } },
      expected: { kind: 'invalidInput' },
    },
    {
      name: 'unknown facts',
      input: { unavailable: true },
      expected: { kind: 'unavailable' },
    },
  ]

  for (const row of rows)
    it(row.name, () => {
      expect(projectRunnerRetryGuard(row.input)).toEqual(row.expected)
    })
})
