import { reasoningTextCodec } from '../chat-completions/reasoning-text.ts'
import { usageWithCacheWrites } from '../chat-completions/cache-usage.ts'
import type { VendorHooks } from '../chat-completions/vocabulary.ts'
import { recordAdoption, type PiModelRecordHead } from '../family-table.ts'

// Plain-text reasoning, usage with cache writes, an object root for tool arguments, no check.
export function chatTextHooks(owner: string, record: PiModelRecordHead): VendorHooks {
  const adapter = recordAdoption(owner, record)
  const toolSchema: VendorHooks['toolSchema'] = schema =>
    schema.kind === 'object'
      ? { ok: schema }
      : { failure: { kind: 'unsupported', field: 'argumentsSchema', adapter } }
  return Object.freeze({
    reasoning: reasoningTextCodec,
    usage: usageWithCacheWrites,
    toolSchema,
    check: () => ({ ok: undefined }),
  })
}
