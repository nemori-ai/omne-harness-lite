import { placeContext, type Placement } from './placement.js'
import type { StablePreparation } from './preparation.js'
import type { AssemblyFailure } from './values.js'
import type * as M from '@omne-harness/model-contract'
import type { Message } from '@omne-harness/message'
import type { AssemblyInput, RequestLayers } from './values.js'
import type { AssemblyPolicies } from './ports.js'
import { digest } from './internal.js'
export function assembledInput<P>(
  input: AssemblyInput<P>,
  policies: AssemblyPolicies,
  layers: RequestLayers,
  messages: readonly Message[],
): M.AssembledModelInput {
  return {
    system: layers.systemPrompt,
    messages,
    tools: layers.toolDeclarations.direct,
    toolChoice: 'auto',
    parameters: input.selection.parameters.map(p => p.applied),
    ...(input.selection.replay === 'off' ? { replay: 'off' as const } : {}),
    representation: policies.representation.identity,
    source: {
      owner: 'request-context-contract',
      name: 'assembly',
      revision: '1',
      digest: digest(input.identity.candidate),
    },
  }
}

export type LayeredRequest = Readonly<{
  kind: 'layers'
  layers: RequestLayers
  messages: readonly Message[]
  anchorSource: Placement['anchorSource']
}>
export function placeLayers<P>(
  input: AssemblyInput<P>,
  prepared: StablePreparation,
): LayeredRequest | AssemblyFailure {
  const placement = placeContext({
    candidate: input.identity.candidate,
    contextRead: input.contextRead,
    adopted: input.adopted,
    transition: input.transition,
    view: prepared.view,
    newInputs: input.inputs,
  })
  if ('kind' in placement) return placement
  const anchor = placement.snapshot.anchor
  // The history owner supplies the chained digest; never manufacture it from content.
  const anchorRow = prepared.history.rows.find(r => r.seq === anchor.seq)
  const actualAnchor = { ...anchor, prefixDigest: anchorRow?.prefixDigest ?? null }
  const snapshot = { ...placement.snapshot, anchor: actualAnchor }
  const layers: RequestLayers = {
    systemPrompt: prepared.prompt.blocks,
    toolDeclarations: prepared.declarations,
    historyHead: prepared.view.messages.filter(r => r.seq <= anchor.seq).map(r => r.message),
    snapshotReminder: snapshot,
    historyBody: prepared.view.messages.filter(r => r.seq > anchor.seq).map(r => r.message),
    tailFacts: placement.tail,
  }
  const messages = [
    ...layers.historyHead,
    ...(snapshot.message === null ? [] : [snapshot.message]),
    ...layers.historyBody,
    ...(layers.tailFacts.message === null ? [] : [layers.tailFacts.message]),
  ]
  return { kind: 'layers', layers, messages, anchorSource: placement.anchorSource }
}
