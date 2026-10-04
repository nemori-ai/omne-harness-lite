import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '@omne-harness-lite/content-blocks'
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'
import type { PlanInput, ReplaySelection } from '@omne-harness-lite/model-request-runtime'
import { request } from './invoke-policy-fixture.ts'
import { response } from './log-codec-fixture.ts'

function firstRequest(input: Omit<PlanInput, 'calibration'>): PlanInput {
  return { ...input, calibration: { kind: 'none', reason: 'no_observation' } }
}

function nextRequest(
  input: Omit<PlanInput, 'calibration'>,
  original: ModelResponse,
  outputBlocks: readonly ContentBlock[],
  replaySelection: readonly ReplaySelection[],
): PlanInput {
  return {
    ...input,
    calibration: {
      kind: 'observation',
      inputCalibration: original.inputCalibration,
      usage: original.usage,
      outputBlocks,
      replaySelection,
    },
  }
}

function isResponse(value: unknown): value is ModelResponse {
  return 'ok' in judgeModelResponse(value)
}

describe('README public calibration examples', () => {
  it('compiles and runs both independent callers without a service or network', () => {
    const { calibration: _calibration, ...input } = request()
    expect(firstRequest(input).calibration).toEqual({ kind: 'none', reason: 'no_observation' })
    const original: unknown = response
    if (!isResponse(original)) throw new Error('original response fixture')
    const next = nextRequest(input, original, [], [])
    expect(next.calibration).toMatchObject({
      kind: 'observation',
      usage: original.usage,
      inputCalibration: original.inputCalibration,
    })
  })
})
