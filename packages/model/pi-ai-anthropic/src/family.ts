import type { PiChatBinding, PiFamily } from '@omne-harness/pi-ai-transport'
import {
  byteLimitOf,
  defineGatewayFamily,
  type GatewayFamilyConfig,
} from '@omne-harness/pi-ai-transport/family-kit'
import { bindMessages } from '@omne-harness/pi-ai-transport/messages'
import type { TiktokenExecutor, TiktokenResources } from '@omne-harness/tokenizer-tiktoken'
import { createAnthropicMeter } from './meter.ts'
import { ANTHROPIC_OWNER } from './owner.ts'
import { effortMapping } from './profiles.ts'
import { ANTHROPIC_RECORDS } from './records.ts'

export type AnthropicFamilyConfig = GatewayFamilyConfig &
  Readonly<{ tokenizer: TiktokenResources; executor: Pick<TiktokenExecutor, 'acquire'> }>

export function createAnthropicFamily(config: AnthropicFamilyConfig): PiFamily<PiChatBinding> {
  return defineGatewayFamily({
    owner: ANTHROPIC_OWNER,
    title: 'Anthropic',
    records: ANTHROPIC_RECORDS,
    config,
    bind(record, { supplier, tokenizer, release }) {
      const imageBytes = byteLimitOf(record, 'image-bytes')
      return bindMessages({
        record,
        bindingEfforts: effortMapping(record),
        supplier,
        meter: createAnthropicMeter(record, tokenizer, config.margin),
        limits: config.limits,
        ...(imageBytes === undefined ? {} : { imageBytes }),
        release,
      })
    },
  })
}
