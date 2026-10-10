import { modalityOf, type ContentBlock, type Modality } from '@omne-harness-lite/content-blocks'
import {
  parseOpaqueIdentifier,
  parseTenantId,
  tenantIdEquals,
  unwrap,
} from '@omne-harness-lite/identity-values'
import {
  isOwnedSettlementPrefix,
  settlementPrefixContent,
  settlementGenerationCurrent,
  type SessionModelSelectionInput,
  type SelectionProjection,
  type SettlementLogBinding,
  type SettlementPrefix,
} from '@omne-harness-lite/model-request-runtime'
import { checkLogPayload, type SourceToken } from '@omne-harness-lite/session-log'

const bits = { text: 1, image: 2, audio: 4, video: 8 } as const
const modalities: readonly Modality[] = ['text', 'image', 'audio', 'video']
const unknown = Object.freeze({ unknown: true } as const)
interface Snapshot {
  readonly binding: SettlementLogBinding
  readonly generation: string
  readonly entries: number
  readonly mask: number
  readonly result: SelectionProjection
}

/** Historical requirements remain present after compaction hides an original block. */
export function createModalityProjection(
  scope: Pick<SourceToken, 'tenant' | 'session'>,
): SessionModelSelectionInput['projection'] {
  const tenant = unwrap(parseTenantId(scope.tenant))
  const session = unwrap(parseOpaqueIdentifier(scope.session, 'SessionRef'))
  let snapshot: Snapshot | undefined
  return async prefix => {
    if (!isOwnedSettlementPrefix(prefix) || !settlementGenerationCurrent(prefix.binding))
      return unknown
    if (prefix.source.session !== session || !tenantIdEquals(prefix.source.tenant, tenant))
      return unknown
    const previous = reusableSnapshot(snapshot, prefix)
    if (previous?.entries === prefix.history.length) return previous.result
    let mask = previous?.mask ?? 0
    const content = settlementPrefixContent({ prefix, after: previous?.entries ?? 0 })
    if ('unavailable' in content) return unknown
    for (const entry of content.ok) {
      const payload = checkLogPayload(entry.payload)
      if ('failure' in payload) return unknown
      if (payload.kind === 'message') mask |= blockModalities(payload.payload.value.blocks)
    }
    const result = Object.freeze({
      known: Object.freeze(modalities.filter(value => mask & bits[value])),
    })
    snapshot = {
      binding: prefix.binding,
      generation: prefix.source.journalGeneration,
      entries: prefix.history.length,
      mask,
      result,
    }
    return result
  }
}

function reusableSnapshot(snapshot: Snapshot | undefined, prefix: SettlementPrefix) {
  return snapshot?.binding === prefix.binding &&
    snapshot.generation === prefix.source.journalGeneration &&
    snapshot.entries <= prefix.history.length
    ? snapshot
    : undefined
}

function blockModalities(roots: readonly ContentBlock[]): number {
  let mask = 0
  const pending = [...roots]
  while (pending.length) {
    const block = pending.pop()!
    if (!block.visibility.toModel) continue
    if (block.kind === 'tool_result') {
      for (const child of block.blocks) pending.push(child)
    } else mask |= leafModality(block)
  }
  return mask
}

function leafModality(block: Exclude<ContentBlock, { readonly kind: 'tool_result' }>): number {
  if ('transcript' in block && block.transcript !== undefined) return bits.text
  switch (block.kind) {
    case 'voice':
      return bits.audio
    case 'image':
      return bits.image
    case 'file': {
      const modality = modalityOf(block.attachment.mediaType)
      return modality === undefined ? 0 : bits[modality]
    }
    case 'text':
    case 'thinking':
    case 'tool_call':
      return bits.text
  }
}
