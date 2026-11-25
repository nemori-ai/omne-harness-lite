import type { AssembledModelInput } from '@omne-harness/model-contract'
import type { PiFamilyBinding } from '@omne-harness/pi-ai-transport'
import type { GlmRecord } from './record.ts'


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
