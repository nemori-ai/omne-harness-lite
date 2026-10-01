import { expectTypeOf, it } from 'vitest'
import {
  judgeResponseFinalization,
  type ModelResponseJudgment,
  type PendingModelResponse,
} from '@omne-harness-lite/model-response'

it('uses the one complete Pending and the existing judgment with unknown public inputs', () => {
  expectTypeOf(judgeResponseFinalization).toEqualTypeOf<
    (pending: unknown, final: unknown) => ModelResponseJudgment
  >()
  expectTypeOf<PendingModelResponse['inputCalibration']>().not.toBeNever()
  expectTypeOf<PendingModelResponse['reply']>().not.toBeNever()
})
