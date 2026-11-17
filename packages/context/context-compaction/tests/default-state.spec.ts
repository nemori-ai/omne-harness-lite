import { expect, it } from 'vitest'
import { readDefaultState, type DefaultExecutionState } from '../src/default-state.ts'
import { request } from './request-fixture.ts'
import { DEFAULT_COMPACTION_CONFIGURATION } from '../src/default-configuration.ts'

export function initialState(): DefaultExecutionState {
  const input = request().input
  const profile = input.target.profile.profile
  return {
    version: 1,
    phase: 'running',
    configuration: DEFAULT_COMPACTION_CONFIGURATION,
    coverTo: input.history.upper,
    retained: [],
    attempt: 1,
    processed: [],
    fixed: {
      profile: profile.adoption,
      suppliers: [{ ...profile.definition.suppliers[0], credential: { layer: 'official' } }],
      fallback: false,
      retryPolicy: profile.definition.retryPolicy,
      parameters: [],
      system: [],
      messages: input.history.entries.map(e => e.message),
      tools: [],
      toolChoice: 'none',
      declarations: [{ produces: 'test/test', accepts: ['test/test'], foreignThinking: 'omit' }],
      representation: profile.definition.representation,
      parameterAdoptions: [],
      source: profile.adoption,
    },
  }
}

it('restores the exact fixed model request before any admission can be retried', () => {
  const state = initialState()
  expect(readDefaultState(JSON.stringify(state))).toEqual({ ok: state })
})

it('rejects an attempt that skips an unprocessed or unacknowledged predecessor', () => {
  expect(readDefaultState(JSON.stringify({ ...initialState(), attempt: 2 }))).toMatchObject({
    failure: { kind: 'invalid', field: 'execution' },
  })
})
