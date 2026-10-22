import type * as M from '@omne-harness/model-contract'
import {
  judgeContentBlock,
  type ContentBlock,
  type BlockId,
  type ContentReference,
} from '@omne-harness/content-block'
import { judgeMessage, type Message, type MessageId, type MessagePart } from '@omne-harness/message'
import type { RepresentationChoice } from './values.js'
import type { RepresentationPolicyPort } from './ports.js'
import { textBlock, nonEmpty } from './internal.js'
export type ConversionIndex = ReadonlyMap<BlockId, M.ConversionResult>
export type RepresentationResult =
  | Readonly<{
      kind: 'chosen'
      choices: readonly RepresentationChoice[]
      messages: readonly Message[]
      modality: M.ModalityRequirement | null
      deferred: readonly ContentReference[]
    }>
  | Readonly<{
      kind: 'unavailable'
      block: BlockId
      message: MessageId
      original: M.ConversionResult
    }>
function modality(block: ContentBlock): M.ModelModality | null {
  if (block.kind === 'text' || block.kind === 'thinking') return 'text'
  const media = 'ref' in block ? block.ref.mediaType : block.mediaType
  return media.startsWith('image/')
    ? 'image'
    : media.startsWith('audio/')
      ? 'voice'
      : media.startsWith('text/')
        ? 'text'
        : null
}
export function chooseRepresentations(
  input: Readonly<{
    messages: readonly Message[]
    conversions: ConversionIndex
    modalities: readonly M.ModelModality[]
    policy: RepresentationPolicyPort
  }>,
): RepresentationResult {
  const choices: RepresentationChoice[] = []
  const messages: Message[] = []
  const deferred: ContentReference[] = []
  const required = new Set<M.ModelModality>()
  for (const message of input.messages) {
    const blocks: MessagePart[] = []
    for (const part of message.blocks) {
      const parsed = judgeContentBlock(part)
      if ('rejected' in parsed) {
        blocks.push(part)
        continue
      }
      const block = parsed.ok
      const original = input.conversions.get(block.id) ?? {
        kind: 'unchanged',
        original: block,
        reason: block.kind === 'text' ? 'text' : 'no-converter',
      }
      const pending = message.role === 'tool' && 'ref' in block
      const choice = pending
        ? 'pending-load'
        : input.policy.choose({ block, conversion: original, modalities: input.modalities })
      if (choice === 'none' || (choice === 'pending-load' && !pending))
        return { kind: 'unavailable', block: block.id, message: message.id, original }
      let selected: readonly ContentBlock[] = [block]
      if (choice === 'derived' || choice === 'transcript') {
        if (original.kind !== 'converted')
          return { kind: 'unavailable', block: block.id, message: message.id, original }
        selected =
          choice === 'derived'
            ? original.value.derived
            : [
                textBlock(original.value.transcript, {
                  message: message.id,
                  block: block.id,
                  representation: 'transcript',
                }),
              ]
      }
      if (pending && 'ref' in block) deferred.push(block.ref)
      for (const selectedBlock of selected) {
        if (!selectedBlock.visibility.toModel)
          return { kind: 'unavailable', block: block.id, message: message.id, original }
        const kind = modality(selectedBlock)
        if (!pending && (kind === null || !input.modalities.includes(kind)))
          return { kind: 'unavailable', block: block.id, message: message.id, original }
        if (kind !== null) required.add(kind)
        blocks.push(selectedBlock)
      }
      choices.push({
        message: message.id,
        block: block.id,
        choice,
        converter:
          original.kind === 'converted' && choice !== 'original' ? original.value.converter : null,
        mediaType:
          'ref' in block ? block.ref.mediaType : 'mediaType' in block ? block.mediaType : null,
      })
    }
    const judged = judgeMessage({ ...message, blocks })
    if ('ok' in judged) messages.push(judged.ok)
    else throw new Error(`Representation policy produced an invalid message: ${judged.rejected}`)
  }
  const modalities = [...required]
  return {
    kind: 'chosen',
    choices,
    messages,
    deferred,
    modality: nonEmpty(modalities)
      ? {
          modalities,
          source: {
            owner: 'request-context-contract',
            record: 'representation',
            revision: '1',
            digest: input.policy.identity.digest,
          },
        }
      : null,
  }
}
