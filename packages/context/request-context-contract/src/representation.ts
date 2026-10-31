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
export type { ConversionIndex } from './values.js'
import type { ConversionIndex } from './values.js'
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
type RepresentationInput = Readonly<{
  messages: readonly Message[]
  conversions: ConversionIndex
  modalities: readonly M.ModelModality[]
  policy: RepresentationPolicyPort
}>
type ChosenPart = Readonly<{
  kind: 'selected'
  parts: readonly MessagePart[]
  choice: RepresentationChoice | null
  required: readonly M.ModelModality[]
  deferred: readonly ContentReference[]
}>
type Unavailable = Extract<RepresentationResult, { kind: 'unavailable' }>
function unavailable(
  message: Message,
  block: ContentBlock,
  original: M.ConversionResult,
): Unavailable {
  return { kind: 'unavailable', block: block.id, message: message.id, original }
}
function representedBlocks(
  message: Message,
  block: ContentBlock,
  original: M.ConversionResult,
  choice: RepresentationChoice['choice'],
): readonly ContentBlock[] | null {
  if (choice !== 'derived' && choice !== 'transcript') return [block]
  if (original.kind !== 'converted') return null
  return choice === 'derived'
    ? original.value.derived
    : [
        textBlock(original.value.transcript, {
          message: message.id,
          block: block.id,
          representation: 'transcript',
        }),
      ]
}
function requiredModalities(
  selected: readonly ContentBlock[],
  pending: boolean,
  supported: readonly M.ModelModality[],
): readonly M.ModelModality[] | null {
  const required: M.ModelModality[] = []
  for (const block of selected) {
    if (!block.visibility.toModel) return null
    const kind = modality(block)
    if (!pending && (kind === null || !supported.includes(kind))) return null
    if (kind !== null) required.push(kind)
  }
  return required
}
function choosePart(
  message: Message,
  part: MessagePart,
  input: RepresentationInput,
): ChosenPart | Unavailable {
  const parsed = judgeContentBlock(part)
  if ('rejected' in parsed)
    return { kind: 'selected', parts: [part], choice: null, required: [], deferred: [] }
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
    return unavailable(message, block, original)
  const selected = representedBlocks(message, block, original, choice)
  if (selected === null) return unavailable(message, block, original)
  const required = requiredModalities(selected, pending, input.modalities)
  if (required === null) return unavailable(message, block, original)
  return {
    kind: 'selected',
    parts: selected,
    required,
    deferred: pending && 'ref' in block ? [block.ref] : [],
    choice: representationEvidence(message, block, original, choice),
  }
}
function representationEvidence(
  message: Message,
  block: ContentBlock,
  original: M.ConversionResult,
  choice: RepresentationChoice['choice'],
): RepresentationChoice {
  return {
    message: message.id,
    block: block.id,
    choice,
    converter:
      original.kind === 'converted' && choice !== 'original' ? original.value.converter : null,
    mediaType: 'ref' in block ? block.ref.mediaType : 'mediaType' in block ? block.mediaType : null,
  }
}
export function chooseRepresentations(input: RepresentationInput): RepresentationResult {
  const choices: RepresentationChoice[] = []
  const messages: Message[] = []
  const deferred: ContentReference[] = []
  const required = new Set<M.ModelModality>()
  for (const message of input.messages) {
    const blocks: MessagePart[] = []
    for (const part of message.blocks) {
      const chosen = choosePart(message, part, input)
      if (chosen.kind === 'unavailable') return chosen
      blocks.push(...chosen.parts)
      deferred.push(...chosen.deferred)
      chosen.required.forEach(kind => required.add(kind))
      if (chosen.choice !== null) choices.push(chosen.choice)
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
