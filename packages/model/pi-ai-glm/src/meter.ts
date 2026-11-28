import type { ModelTextTokenizer } from '@omne-harness/model-contract/provider'
import type { FamilyMeter, MeterMargin } from '@omne-harness/pi-ai-transport/chat-completions'
import {
  chatRepresentation,
  chatUnitsOf,
  createGatewayMeter,
  tileImageTokens,
} from '@omne-harness/pi-ai-transport/family-kit'
import { GLM_OWNER } from './owner.ts'
import type { GlmRecord } from './record.ts'

export const OUTPUT_GROUP_METHOD = 'glm-complete-output-group-workload-estimated/1'
export { ANCHORED_METHOD, type MeterMargin } from '@omne-harness/pi-ai-transport/chat-completions'

export function createGlmMeter(
  record: GlmRecord,
  tokenizer: ModelTextTokenizer,
  margin: MeterMargin,
): FamilyMeter {
  return createGatewayMeter({
    owner: GLM_OWNER,
    record,
    tokenizer,
    margin,
    outputGroup: OUTPUT_GROUP_METHOD,
    uncountable: 'reasoning-not-countable',
    form: 'as-written',
    contentOf: tokenInput => chatUnitsOf(tokenInput),
    imageTokens: ({ units, media }) => tileImageTokens(GLM_OWNER, record.meter.image, units, media),
    represent: view =>
      chatRepresentation(view, {
        instructionRole: record.wire.roles.instruction,
        imageDetail: record.wire.image?.detail ?? 'auto',
        files: true,
      }),
  })
}
