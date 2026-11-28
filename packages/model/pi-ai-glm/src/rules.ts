import type { AssembledModelInput } from '@omne-harness/model-contract'
import type { PiChatBinding } from '@omne-harness/pi-ai-transport'
import type { GlmRecord } from './record.ts'

export function withToolChoiceRule(
  binding: PiChatBinding,
  check: GlmRecord['rules']['check'],
): PiChatBinding {
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
      plan: (input: Parameters<PiChatBinding['rules']['plan']>[0]) =>
        refused(input.assembled) ? failure : binding.rules.plan(input),
    }),
    encode: (input: Parameters<PiChatBinding['encode']>[0]) =>
      refused(input.request) ? failure : binding.encode(input),
  })
}
