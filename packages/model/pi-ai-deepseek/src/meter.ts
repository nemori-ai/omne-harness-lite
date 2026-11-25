import type { ModelTextTokenizer } from '@omne-harness/model-contract/provider'
import type { FamilyMeter, MeterMargin } from '@omne-harness/pi-ai-transport/chat-completions'
import {
  chatRepresentation,
  chatUnitsOf,
  createGatewayMeter,
  tileImageTokens,
} from '@omne-harness/pi-ai-transport/family-kit'
import { DEEPSEEK_OWNER } from './owner.ts'
import type { DeepSeekRecord } from './record.ts'
import { projectedTools } from './rules.ts'
export const OUTPUT_GROUP_METHOD = 'deepseek-complete-output-group-workload-estimated/1'
export { ANCHORED_METHOD, type MeterMargin } from '@omne-harness/pi-ai-transport/chat-completions'

export function createDeepSeekMeter(
  record: DeepSeekRecord,
  tokenizer: ModelTextTokenizer,
  margin: MeterMargin,
): FamilyMeter {
  return createGatewayMeter({
    owner: DEEPSEEK_OWNER,
    record,
    tokenizer,
    margin,
    outputGroup: OUTPUT_GROUP_METHOD,
    uncountable: 'reasoning-not-countable',
    form: 'as-written',
    contentOf: tokenInput => chatUnitsOf(tokenInput),
    imageTokens: ({ units, media }) =>
      tileImageTokens(DEEPSEEK_OWNER, record.meter.image, units, media),
    represent: view =>
      chatRepresentation(projectedTools(record, view), {
        instructionRole: record.wire.roles.instruction,
        imageDetail: record.wire.image?.detail ?? 'auto',
        files: true,
      }),
  })
}
