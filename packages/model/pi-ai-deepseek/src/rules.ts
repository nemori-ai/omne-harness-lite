import { recordAdoption } from '@omne-harness/pi-ai-transport'
import {
  reasoningTextCodec,
  usageWithCacheWrites,
  type VendorHooks,
} from '@omne-harness/pi-ai-transport/chat-completions'
import { DEEPSEEK_OWNER } from './owner.ts'
import type { DeepSeekRecord } from './record.ts'

export function hooksOf(record: DeepSeekRecord): VendorHooks {
  const adapter = recordAdoption(DEEPSEEK_OWNER, record)
  return {
    reasoning: reasoningTextCodec,
    usage: usageWithCacheWrites,
    toolSchema: schema =>
      schema.kind === 'object'
        ? { ok: schema }
        : { failure: { kind: 'unsupported', field: 'argumentsSchema', adapter } },
    check: () => ({ ok: undefined }),
  }
}
