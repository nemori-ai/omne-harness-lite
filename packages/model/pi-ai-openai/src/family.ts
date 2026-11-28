import type { PiChatBinding, PiFamily } from '@omne-harness/pi-ai-transport'
import { bindChatCompletions } from '@omne-harness/pi-ai-transport/chat-completions'
import {
  byteLimitOf,
  defineGatewayFamily,
  type GatewayFamilyConfig,
} from '@omne-harness/pi-ai-transport/family-kit'
import { bindResponses } from '@omne-harness/pi-ai-transport/responses'
import type { TiktokenExecutor, TiktokenResources } from '@omne-harness/tokenizer-tiktoken'
import { createOpenAiMeter } from './meter.ts'
import { OPENAI_OWNER } from './owner.ts'
import { effortMapping } from './profiles.ts'
import { OPENAI_RECORDS } from './records.ts'
import { hooksOf } from './rules.ts'

export type OpenAiFamilyConfig = GatewayFamilyConfig &
  Readonly<{ tokenizer: TiktokenResources; executor: Pick<TiktokenExecutor, 'acquire'> }>

export function createOpenAiFamily(config: OpenAiFamilyConfig): PiFamily<PiChatBinding> {
  return defineGatewayFamily({
    owner: OPENAI_OWNER,
    title: 'OpenAI',
    records: OPENAI_RECORDS,
    config,
    bind(record, { supplier, tokenizer, release }) {
      const imageBytes = byteLimitOf(record, 'image-bytes')
      const input = {
        bindingEfforts: effortMapping(record),
        supplier,
        meter: createOpenAiMeter(record, tokenizer, config.margin),
        limits: config.limits,
        ...(imageBytes === undefined ? {} : { imageBytes }),
        release,
      }
      return 'engine' in record
        ? bindResponses({ record, ...input })
        : bindChatCompletions({ record, ...input, hooks: hooksOf(record) })
    },
  })
}
