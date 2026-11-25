import type { PiFamily } from '@omne-harness/pi-ai-transport'
import { bindChatCompletions } from '@omne-harness/pi-ai-transport/chat-completions'
import {
  byteLimitOf,
  chatTextHooks,
  defineGatewayFamily,
  type GatewayFamilyConfig,
} from '@omne-harness/pi-ai-transport/family-kit'
import type { TiktokenExecutor, TiktokenResources } from '@omne-harness/tokenizer-tiktoken'
import { createKimiMeter } from './meter.ts'
import { KIMI_OWNER } from './owner.ts'
import { effortMapping } from './profiles.ts'
import { KIMI_RECORDS } from './records.ts'

export type KimiFamilyConfig = GatewayFamilyConfig &
  Readonly<{ tokenizer: TiktokenResources; executor: Pick<TiktokenExecutor, 'acquire'> }>

export function createKimiFamily(config: KimiFamilyConfig): PiFamily {
  return defineGatewayFamily({
    owner: KIMI_OWNER,
    title: 'Kimi',
    records: KIMI_RECORDS,
    config,
    bind(record, { supplier, tokenizer, release }) {
      const imageBytes = byteLimitOf(record, 'image-bytes')
      if (imageBytes === undefined)
        throw new RangeError(`record ${record.name} has no image-bytes limit`)
      return bindChatCompletions({
        record,
        bindingEfforts: effortMapping(record),
        supplier,
        hooks: chatTextHooks(KIMI_OWNER, record),
        meter: createKimiMeter(record, tokenizer, config.margin),
        limits: config.limits,
        imageBytes,
        release,
      })
    },
  })
}
