import type { StablePreparation } from './preparation.js'
import type * as M from '@omne-harness/model-contract'
import type { Message } from '@omne-harness/message'
import type { AssemblyInput, RequestLayers } from './values.js'
import { adoptionDigest } from './internal.js'
import { buildModelInput } from './model-input.js'
export function assembledInput<P>(
  input: AssemblyInput<P>,
  layers: RequestLayers,
  messages: readonly Message[],
): M.AssembledModelInput {
  return buildModelInput(input.selection, {
    system: layers.systemPrompt,
    messages,
    tools: layers.toolDeclarations.direct,
    toolChoice: 'auto',
    source: {
      owner: 'request-context-contract',
      name: 'assembly',
      revision: '1',
      digest: adoptionDigest(input.identity.candidate),
    },
  })
}

// The history layer is the model view of the session log, in log order. Nothing outside the log
// enters a request, so a later request starts with an earlier one while the log only grows.
export function layersOf(prepared: StablePreparation): RequestLayers {
  return {
    systemPrompt: prepared.prompt.blocks,
    toolDeclarations: prepared.declarations,
    history: prepared.view.messages.map(row => row.message),
  }
}
