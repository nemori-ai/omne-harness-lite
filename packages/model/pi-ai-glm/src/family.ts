import type { PiFamily } from '@omne-harness/pi-ai-transport'
import { bindChatCompletions } from '@omne-harness/pi-ai-transport/chat-completions'
import {
  chatTextHooks,
  defineGatewayFamily,
  optionalImageBytes,
  type GatewayFamilyConfig,
} from '@omne-harness/pi-ai-transport/family-kit'
import type { TiktokenExecutor, TiktokenResources } from '@omne-harness/tokenizer-tiktoken'
import { createGlmMeter } from './meter.ts'
import { GLM_OWNER } from './owner.ts'
import { effortMapping } from './profiles.ts'
import { GLM_RECORDS } from './records.ts'
import { withToolChoiceRule } from './rules.ts'

export type GlmFamilyConfig = GatewayFamilyConfig &
  Readonly<{ tokenizer: TiktokenResources; executor: Pick<TiktokenExecutor, 'acquire'> }>

export function createGlmFamily(config: GlmFamilyConfig): PiFamily {
  return defineGatewayFamily({
    owner: GLM_OWNER,
    title: 'GLM',
    records: GLM_RECORDS,
    config,
    bind(record, { supplier, tokenizer, release }) {
      const imageBytes = optionalImageBytes(record)
      const binding = bindChatCompletions({
        record,
        bindingEfforts: effortMapping(record),
        supplier,
        hooks: chatTextHooks(GLM_OWNER, record),
        meter: createGlmMeter(record, tokenizer, config.margin),
        limits: config.limits,
        ...imageBytes,
        release,
      })
      return withToolChoiceRule(binding, record.rules.check)
    },
  })
}
