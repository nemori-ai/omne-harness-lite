import loopSchema from '@omne-harness-lite/loop-extension/schema/v3' with { type: 'json' }
import schema from '../../schema/v5/model-response.schema.json' with { type: 'json' }
import { judgeModelResponseWithSchema } from '../judge-kernel.ts'
import { membersValid, responseValid } from './schema.ts'
import type { ModelResponseJudgment } from './types.ts'

const judgmentSchema = Object.freeze({
  outcomes: Object.freeze([...schema.$defs.ResponseOutcome.enum]),
  causes: Object.freeze([...loopSchema.$defs.FailureCause.enum]),
  membersValid,
  responseValid,
})

/** S-27 fixed order over the frozen MR5 resource graph. */
export function judgeModelResponse(value: unknown): ModelResponseJudgment {
  return judgeModelResponseWithSchema(value, judgmentSchema)
}
