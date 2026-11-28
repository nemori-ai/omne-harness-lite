import type { ModelTextTokenizer } from '@omne-harness/model-contract/provider'
import type { FamilyMeter, MeterMargin } from '@omne-harness/pi-ai-transport/chat-completions'
import {
  chatRepresentation,
  chatUnitsOf,
  createGatewayMeter,
} from '@omne-harness/pi-ai-transport/family-kit'
import { QWEN_OWNER } from './owner.ts'
import type { QwenRecord } from './record.ts'

export const OUTPUT_GROUP_METHOD = 'qwen-complete-output-group-workload-estimated/1'
export { ANCHORED_METHOD, type MeterMargin } from '@omne-harness/pi-ai-transport/chat-completions'

// Speech is not counted: the o200k proxy has no rule for it. The projection refuses an image
// for this record before the meter sees the request, so no part costs tokens beyond its text.
export function createQwenMeter(
  record: QwenRecord,
  tokenizer: ModelTextTokenizer,
  margin: MeterMargin,
): FamilyMeter {
  return createGatewayMeter({
    owner: QWEN_OWNER,
    record,
    tokenizer,
    margin,
    outputGroup: OUTPUT_GROUP_METHOD,
    uncountable: 'reasoning-not-countable',
    form: 'as-written',
    contentOf: tokenInput => chatUnitsOf(tokenInput),
    imageTokens: ({ units }) => ({ ok: units.map(() => 0n) }),
    represent: view =>
      chatRepresentation(view, {
        instructionRole: record.wire.roles.instruction,
        imageDetail: null,
        files: false,
      }),
  })
}
