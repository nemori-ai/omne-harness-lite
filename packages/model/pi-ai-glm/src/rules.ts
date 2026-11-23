import type { AssembledModelInput } from '@omne-harness/model-contract'
import { recordAdoption, type PiFamilyBinding } from '@omne-harness/pi-ai-transport'
import {
  reasoningTextCodec,
  usageWithCacheWrites,
  type VendorHooks,
} from '@omne-harness/pi-ai-transport/chat-completions'
import { GLM_OWNER } from './owner.ts'
import type { GlmRecord } from './record.ts'

export function hooksOf(record: GlmRecord): VendorHooks {
  const adapter = recordAdoption(GLM_OWNER, record)
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

export function withToolChoiceRule(
  binding: PiFamilyBinding,
  check: GlmRecord['rules']['check'],
): PiFamilyBinding {
  if (check === 'none/1') return binding
  // With no tools the encoder omits tool_choice, regardless of an internal none.
  const refused = (input: AssembledModelInput) =>
    input.tools.length > 0 && input.toolChoice === 'none'
  const failure = {
    failure: { kind: 'unsupported', field: 'toolChoice', adapter: binding.adoption },
  } as const
  return Object.freeze({
    ...binding,
    rules: Object.freeze({
      plan: (input: Parameters<PiFamilyBinding['rules']['plan']>[0]) =>
        refused(input.assembled) ? failure : binding.rules.plan(input),
    }),
    encode: (input: Parameters<PiFamilyBinding['encode']>[0]) =>
      refused(input.request) ? failure : binding.encode(input),
  })
}
