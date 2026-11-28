import type { PiChatBinding, PiFamily } from '@omne-harness/pi-ai-transport'
import { bindChatCompletions } from '@omne-harness/pi-ai-transport/chat-completions'
import {
  byteLimitOf,
  chatTextHooks,
  defineGatewayFamily,
  type GatewayFamilyConfig,
} from '@omne-harness/pi-ai-transport/family-kit'
import type { TiktokenExecutor, TiktokenResources } from '@omne-harness/tokenizer-tiktoken'
import { createQwenMeter } from './meter.ts'
import { QWEN_OWNER } from './owner.ts'
import { effortMapping } from './profiles.ts'
import { QWEN_RECORDS } from './records.ts'

export type QwenFamilyConfig = GatewayFamilyConfig &
  Readonly<{ tokenizer: TiktokenResources; executor: Pick<TiktokenExecutor, 'acquire'> }>

export function createQwenFamily(config: QwenFamilyConfig): PiFamily<PiChatBinding> {
  return defineGatewayFamily({
    owner: QWEN_OWNER,
    title: 'Qwen',
    records: QWEN_RECORDS,
    config,
    bind(record, { supplier, tokenizer, release }) {
      const voiceBytes = byteLimitOf(record, 'voice-bytes')
      if (voiceBytes === undefined)
        throw new RangeError(`record ${record.name} has no voice-bytes limit`)
      return bindChatCompletions({
        record,
        bindingEfforts: effortMapping(record),
        supplier,
        hooks: chatTextHooks(QWEN_OWNER, record),
        meter: createQwenMeter(record, tokenizer, config.margin),
        limits: config.limits,
        voiceBytes,
        release,
      })
    },
  })
}
