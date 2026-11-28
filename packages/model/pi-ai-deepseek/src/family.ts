import type { PiChatBinding, PiFamily } from '@omne-harness/pi-ai-transport'
import { bindChatCompletions } from '@omne-harness/pi-ai-transport/chat-completions'
import {
  defineGatewayFamily,
  optionalImageBytes,
  type GatewayFamilyConfig,
} from '@omne-harness/pi-ai-transport/family-kit'
import type { TiktokenExecutor, TiktokenResources } from '@omne-harness/tokenizer-tiktoken'
import { createDeepSeekMeter } from './meter.ts'
import { DEEPSEEK_OWNER } from './owner.ts'
import { effortMapping } from './profiles.ts'
import { DEEPSEEK_RECORDS } from './records.ts'
import { hooksOf } from './rules.ts'

export type DeepSeekFamilyConfig = GatewayFamilyConfig &
  Readonly<{ tokenizer: TiktokenResources; executor: Pick<TiktokenExecutor, 'acquire'> }>

export function createDeepSeekFamily(config: DeepSeekFamilyConfig): PiFamily<PiChatBinding> {
  return defineGatewayFamily({
    owner: DEEPSEEK_OWNER,
    title: 'DeepSeek',
    records: DEEPSEEK_RECORDS,
    config,
    bind(record, { supplier, tokenizer, release }) {
      const imageBytes = optionalImageBytes(record)
      const binding = bindChatCompletions({
        record,
        bindingEfforts: effortMapping(record),
        supplier,
        hooks: hooksOf(record),
        meter: createDeepSeekMeter(record, tokenizer, config.margin),
        limits: config.limits,
        ...imageBytes,
        release,
      })
      return binding
    },
  })
}
