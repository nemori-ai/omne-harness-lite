import { describe, expect, it } from 'vitest'
import type { ModelFailure } from '@omne-harness/model-contract'
import { drivable } from '@omne-harness/model/commands'
import { executionFailure, verdictOf, type WriteVerdict } from '../src/commands/execution-write.ts'
import { instance, op } from './memory-fixture.ts'

const FAILURES: Readonly<Record<ModelFailure['kind'], ModelFailure>> = {
  'commit-unknown': { kind: 'commit-unknown', operation: op('write') },
  unavailable: { kind: 'unavailable', dependency: 'model-records', diagnostic: 'busy' },
  conflict: { kind: 'conflict', operation: op('write'), revision: '1' as never },
  'stale-instance': { kind: 'stale-instance', instance: instance('successor') },
  'handoff-invalid': { kind: 'handoff-invalid' } as ModelFailure,
  denied: { kind: 'denied' } as ModelFailure,
  invalid: { kind: 'invalid', field: 'storage', reason: 'command_limit' },
  unsupported: { kind: 'unsupported' } as ModelFailure,
  'not-settled': { kind: 'not-settled' } as ModelFailure,
}

const VERDICTS: Readonly<Record<ModelFailure['kind'], WriteVerdict>> = {
  'commit-unknown': 'unconfirmed',
  unavailable: 'unconfirmed',
  conflict: 'outdated',
  'stale-instance': 'superseded',
  'handoff-invalid': 'superseded',
  denied: 'superseded',
  invalid: 'refused',
  unsupported: 'refused',
  'not-settled': 'refused',
}

describe('what a failed execution write means', () => {
  it.each(Object.entries(VERDICTS))('answers every kind of failure: %s is %s', (kind, verdict) => {
    const failure = FAILURES[kind as ModelFailure['kind']]
    expect(verdictOf(failure)).toBe(verdict)
    expect(drivable(failure)).toBe(verdict === 'unconfirmed' || verdict === 'outdated')
  })

  it('gives a refused write one fixed terminal that names the kind of the refusal', () => {
    expect(executionFailure(FAILURES.invalid)).toEqual({
      kind: 'failed',
      fault: {
        cause: 'persistence',
        upstreamStatus: null,
        diagnostic: 'execution-write-refused:invalid',
      },
    })
  })
})
