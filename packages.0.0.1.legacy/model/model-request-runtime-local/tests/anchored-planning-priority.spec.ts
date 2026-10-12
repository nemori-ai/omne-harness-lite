import { describe, expect, it } from 'vitest'
import type { PlanFailure } from '@omne-harness-lite/model-request-runtime'
import { createAnchoredModelInvocation } from '@omne-harness-lite/session-runtime-local'
import { harness, transport } from './anchored-invocation-fixture.ts'

describe('anchored planning rejection priority with a missing current input cap', () => {
  it.each([
    { rejected: 'invalidInput', reason: 'malformed' },
    { rejected: 'modality_not_carried' },
    { rejected: 'orphan_tool_call' },
    { rejected: 'tool_internal_in_request' },
    { rejected: 'unavailable' },
  ] satisfies PlanFailure[])('preserves the public priority for $rejected', async failure => {
    await harness(async h => {
      const { maxInputTokens: _missing, ...snapshot } = h.input.planInput.snapshot
      const t = transport()
      let plans = 0
      const handle = Reflect.apply(createAnchoredModelInvocation, undefined, [
        {
          ...h.input,
          planInput: { ...h.input.planInput, snapshot },
          transport: {
            ...t.adapter,
            async plan() {
              plans++
              return failure
            },
          },
        },
      ])
      const outcome = await handle.outcome
      if (failure.rejected === 'unavailable') {
        expect(outcome).toEqual({
          rejected: 'invalidInput',
          reason: 'input_limit_missing',
          metrics: ['maxInputTokens'],
        })
      } else expect(outcome).toBe(failure)
      expect(plans).toBe(1)
      expect(t.sends()).toBe(0)
      expect(h.writes).toHaveLength(0)
      expect(h.owner.active).toBe(0)
      expect(h.owner.releases).toBe(1)
      expect(h.released()).toBe(0)
      expect(await handle.close()).toEqual({ released: true })
      expect(h.released()).toBe(1)
    })
  })
})
