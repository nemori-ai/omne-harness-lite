import type * as M from '@omne-harness/model-contract'
import type { Message, MessageId } from '@omne-harness/message'
import { tenantEquals } from '@omne-harness/legal-identity'
import type { Access, DurableEvidence } from './refs.js'
import type {
  AdoptedRequestFact,
  AssemblyFailure,
  ContinuationBasis,
  HistoryEvidence,
  ProjectedMessage,
  SelectedModel,
} from './values.js'
import { digest } from './internal.js'

export type ModelInputContent = Pick<
  M.AssembledModelInput,
  'system' | 'messages' | 'tools' | 'toolChoice' | 'representation' | 'source'
>
/**
 * The one conversion from a selection to a Model input (RQ-05). Request parameters carry only
 * the applied values; an explicit `replay: 'off'` is written, `on` is omitted. The parameter
 * adoption records stay on the selection and on the supplier measuring path.
 */
export function buildModelInput(
  selection: Pick<SelectedModel, 'parameters' | 'replay'>,
  content: ModelInputContent,
): M.AssembledModelInput {
  return {
    system: content.system,
    messages: content.messages,
    tools: content.tools,
    toolChoice: content.toolChoice,
    parameters: selection.parameters.map(value => value.applied),
    ...(selection.replay === 'off' ? { replay: 'off' as const } : {}),
    representation: content.representation,
    source: content.source,
  }
}

function evidenceOf(record: string, value: unknown): DurableEvidence {
  return { owner: 'request-context-contract', record, revision: '1', digest: digest(value) }
}
/** The facts of one candidate that a later request compares before it declares `continues`. */
export type ContinuationFacts = Omit<ContinuationBasis, 'call' | 'fixed'>
export function continuationFacts(
  history: HistoryEvidence,
  selection: SelectedModel,
  assembled: M.AssembledModelInput,
): ContinuationFacts {
  return {
    history,
    messagePrefix: assembled.messages.map(message => message.id),
    projection: assembled.representation,
    system: evidenceOf('system', assembled.system),
    tools: evidenceOf('tools', assembled.tools),
    parameters: evidenceOf('parameters', selection.parameters),
    replay: evidenceOf('replay', {
      replay: selection.replay,
      profile: selection.profile.adoption,
      revision: selection.profile.revision,
    }),
    visibility: evidenceOf('visibility', assembled.messages),
  }
}
function continues<P>(
  access: Access<P>,
  adopted: AdoptedRequestFact | null,
  facts: ContinuationFacts,
  messages: readonly Message[],
): M.ModelCallId | null {
  const basis = adopted?.continuation ?? null
  if (adopted === null || basis === null) return null
  const n = basis.messagePrefix.length
  const prefix = messages.slice(0, n)
  const holds =
    tenantEquals(basis.call.tenant, access.tenant) &&
    basis.call.call === adopted.call.call &&
    digest(basis.fixed) === digest(adopted.committed) &&
    basis.history.epoch === facts.history.epoch &&
    n > 0 &&
    prefix.length === n &&
    prefix.every((message, index) => message.id === basis.messagePrefix[index]) &&
    digest(basis.projection) === digest(facts.projection) &&
    basis.system.digest === facts.system.digest &&
    basis.tools.digest === facts.tools.digest &&
    basis.parameters.digest === facts.parameters.digest &&
    basis.replay.digest === facts.replay.digest &&
    basis.visibility.digest === digest(prefix)
  return holds ? basis.call.call : null
}

/**
 * The lineage of one candidate (J48): the source call of each assistant message that enters it,
 * once, in candidate order; `continues` only when every precondition holds, otherwise omitted.
 */
export function lineageFor<P>(
  access: Access<P>,
  projected: readonly ProjectedMessage[],
  messages: readonly Message[],
  continuation: Readonly<{ adopted: AdoptedRequestFact | null; facts: ContinuationFacts }> | null,
): M.PreparationLineage | AssemblyFailure {
  const present = new Set<MessageId>(messages.map(message => message.id))
  const seen = new Map<MessageId, M.ModelCallId>()
  const sources: { message: MessageId; call: M.ModelCallId }[] = []
  for (const item of projected) {
    if (item.sourceCall === undefined || !present.has(item.message.id)) continue
    if (!tenantEquals(item.sourceCall.tenant, access.tenant))
      return { kind: 'invalid', field: 'history.sourceCall', reason: 'tenant-mismatch' }
    const previous = seen.get(item.message.id)
    if (previous !== undefined) {
      if (previous !== item.sourceCall.call)
        return { kind: 'invalid', field: 'history.sourceCall', reason: 'source-evidence-conflict' }
      continue
    }
    seen.set(item.message.id, item.sourceCall.call)
    sources.push({ message: item.message.id, call: item.sourceCall.call })
  }
  const order = new Map(messages.map((message, index) => [message.id, index]))
  sources.sort((a, b) => (order.get(a.message) ?? 0) - (order.get(b.message) ?? 0))
  const continued =
    continuation === null
      ? null
      : continues(access, continuation.adopted, continuation.facts, messages)
  return {
    ...(continued === null ? {} : { continues: continued }),
    ...(sources.length ? { sources } : {}),
  }
}
