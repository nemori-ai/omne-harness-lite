import type * as M from '@omne-harness/model-contract'
import {
  judgeContentBlock,
  type ContentBlock,
  type BlockId,
  type ContentReference,
} from '@omne-harness/content-block'
import { judgeMessage, type Message, type MessageId, type MessagePart } from '@omne-harness/message'
import { judgeMediaType, type Modality } from '@omne-harness/modality'
import type { RepresentationChoice, RepresentationOption } from './values.js'
import type { RepresentationPolicyPort } from './ports.js'
import { digest, textBlock, nonEmpty } from './internal.js'

/** What a model takes as it is: the input modalities of its profile and the file types it lists. */
export type NativeCapability = Pick<M.ModelProfileDefinition, 'input' | 'fileTypes'>
export type RepresentationResult =
  | Readonly<{
      kind: 'chosen'
      choices: readonly RepresentationChoice[]
      messages: readonly Message[]
      modality: M.ModalityRequirement | null
      deferred: readonly ContentReference[]
    }>
  | Readonly<{ kind: 'unavailable'; reason: 'modality'; block: BlockId; message: MessageId }>

type Need = Readonly<{ modality: Modality }> | Readonly<{ fileType: string }>
export type BlockPosition = Readonly<{ message: MessageId; block: BlockId; needs: Need }>
export type NativeRequirement = Readonly<{
  modalities: readonly Modality[]
  fileTypes: readonly string[]
  blocks: readonly BlockPosition[]
}>

const WORDS: Need = { modality: 'text' }

function needOf(mediaType: string): Need {
  const judged = judgeMediaType(mediaType)
  if ('rejected' in judged) return { fileType: mediaType }
  const { modality } = judged.ok
  return modality === null ? { fileType: judged.ok.mediaType } : { modality }
}
function needOfBlock(block: ContentBlock): Need {
  if (block.kind === 'text' || block.kind === 'thinking') return WORDS
  return needOf('ref' in block ? block.ref.mediaType : block.mediaType)
}
function takes(capability: NativeCapability, need: Need): boolean {
  if ('fileType' in need) return (capability.fileTypes ?? []).includes(need.fileType)
  const input: readonly Modality[] = capability.input
  return input.includes(need.modality)
}

/** The modality a block's own content belongs to; null for a file of no modality. */
export function modalityOfBlock(block: ContentBlock): Modality | null {
  const need = needOfBlock(block)
  return 'modality' in need ? need.modality : null
}

type RepresentationInput = Readonly<{
  messages: readonly Message[]
  capability: NativeCapability
  policy: RepresentationPolicyPort
}>
type Candidate = Readonly<{
  option: RepresentationOption
  parts: readonly ContentBlock[]
  deferred: readonly ContentReference[]
  needs: readonly Need[]
}>

const REFERENCE_KIND = { image: 'image', voice: 'voice' } as const
function referenceBlock(ref: ContentReference, identity: unknown): ContentBlock {
  const need = needOf(ref.mediaType)
  const kind =
    'modality' in need && need.modality in REFERENCE_KIND
      ? REFERENCE_KIND[need.modality as keyof typeof REFERENCE_KIND]
      : 'file'
  const visibility = { toHuman: true, toModel: true }
  const judged = judgeContentBlock({
    kind,
    id: `rq_${digest(identity)}`,
    visibility,
    ref,
    transcript: null,
  })
  if ('rejected' in judged) throw new Error(`A representation is no block: ${judged.rejected}`)
  return judged.ok
}

/** The rows of the table one block can take with this model, in the order of the table. */
function candidatesOf(
  message: Message,
  block: ContentBlock,
  capability: NativeCapability,
): readonly Candidate[] {
  const own = needOfBlock(block)
  const referring = 'ref' in block
  const found: Candidate[] = []
  if (takes(capability, own))
    found.push({
      option: 'original',
      parts: [block],
      deferred: referring ? [block.ref] : [],
      needs: [own],
    })
  if (!referring) return found
  const identity = (representation: RepresentationOption) => ({
    message: message.id,
    block: block.id,
    representation,
  })
  const made = block.snapshot?.outcome === 'converted' ? block.snapshot : null
  const other = made?.others.find(ref => takes(capability, needOf(ref.mediaType)))
  if (other !== undefined)
    found.push({
      option: 'derived',
      parts: [referenceBlock(other, identity('derived'))],
      deferred: [other],
      needs: [needOf(other.mediaType)],
    })
  const kept = made?.text ?? null
  if ((block.transcript ?? '') !== '' && takes(capability, WORDS))
    found.push({
      option: 'transcript',
      parts: [textBlock(block.transcript ?? '', identity('transcript'))],
      deferred: [],
      needs: [WORDS],
    })
  else if (kept !== null && takes(capability, needOf(kept.mediaType)))
    found.push({
      option: 'transcript',
      parts: [referenceBlock(kept, identity('transcript'))],
      deferred: [kept],
      needs: [needOf(kept.mediaType)],
    })
  return found
}

type ChosenPart = Readonly<{
  kind: 'selected'
  parts: readonly MessagePart[]
  choice: RepresentationChoice | null
  needs: readonly Need[]
  deferred: readonly ContentReference[]
}>
type Unavailable = Extract<RepresentationResult, { kind: 'unavailable' }>

function choosePart(
  message: Message,
  part: MessagePart,
  input: RepresentationInput,
): ChosenPart | Unavailable {
  const parsed = judgeContentBlock(part)
  if ('rejected' in parsed)
    return { kind: 'selected', parts: [part], choice: null, needs: [], deferred: [] }
  const block = parsed.ok
  const candidates = block.visibility.toModel ? candidatesOf(message, block, input.capability) : []
  const option = input.policy.choose({ block, available: candidates.map(each => each.option) })
  const taken = candidates.find(each => each.option === option)
  if (taken === undefined)
    return { kind: 'unavailable', reason: 'modality', message: message.id, block: block.id }
  const snapshot = 'ref' in block ? block.snapshot : undefined
  const converted = taken.option !== 'original' && snapshot !== undefined
  return {
    kind: 'selected',
    parts: taken.parts,
    needs: taken.needs,
    deferred: taken.deferred,
    choice: {
      message: message.id,
      block: block.id,
      choice: taken.option,
      source: converted ? { definition: snapshot.definition, engine: snapshot.engine } : null,
      mediaType:
        'ref' in block ? block.ref.mediaType : 'mediaType' in block ? block.mediaType : null,
    },
  }
}

function requirementOf(
  needs: readonly Need[],
  policy: RepresentationPolicyPort,
): M.ModalityRequirement | null {
  const modalities = [
    ...new Set(needs.flatMap(need => ('modality' in need ? [need.modality] : []))),
  ]
  const fileTypes = [...new Set(needs.flatMap(need => ('fileType' in need ? [need.fileType] : [])))]
  if (!nonEmpty(modalities) && fileTypes.length === 0) return null
  return {
    modalities: nonEmpty(modalities) ? modalities : ['text'],
    ...(fileTypes.length === 0 ? {} : { fileTypes }),
    source: {
      owner: 'request-context-contract',
      record: 'representation',
      revision: '1',
      digest: policy.identity.digest,
    },
  }
}

/** Reads the messages only: the same history and the same capability choose the same (CX-48). */
export function chooseRepresentations(input: RepresentationInput): RepresentationResult {
  const choices: RepresentationChoice[] = []
  const messages: Message[] = []
  const deferred: ContentReference[] = []
  const needs: Need[] = []
  for (const message of input.messages) {
    const blocks: MessagePart[] = []
    for (const part of message.blocks) {
      const chosen = choosePart(message, part, input)
      if (chosen.kind === 'unavailable') return chosen
      blocks.push(...chosen.parts)
      deferred.push(...chosen.deferred)
      needs.push(...chosen.needs)
      if (chosen.choice !== null) choices.push(chosen.choice)
    }
    const judged = judgeMessage({ ...message, blocks })
    if ('ok' in judged) messages.push(judged.ok)
    else throw new Error(`Representation policy produced an invalid message: ${judged.rejected}`)
  }
  return {
    kind: 'chosen',
    choices,
    messages,
    deferred,
    modality: requirementOf(needs, input.policy),
  }
}

function standsAlone(block: ContentBlock): boolean {
  if (block.kind === 'text' || block.kind === 'thinking' || !block.visibility.toModel) return false
  if (!('ref' in block)) return true
  const made = block.snapshot?.outcome === 'converted' ? block.snapshot : null
  const worded = (block.transcript ?? '') !== '' || (made?.text ?? null) !== null
  return !worded && (made?.others.length ?? 0) === 0
}

/** What a history asks of a model natively: its blocks that have no other representation and no words. */
export function nativeRequirement(messages: readonly Message[]): NativeRequirement {
  const blocks: BlockPosition[] = []
  for (const message of messages)
    for (const part of message.blocks) {
      const parsed = judgeContentBlock(part)
      if ('ok' in parsed && standsAlone(parsed.ok))
        blocks.push({ message: message.id, block: parsed.ok.id, needs: needOfBlock(parsed.ok) })
    }
  const needs = blocks.map(each => each.needs)
  return {
    modalities: [...new Set(needs.flatMap(need => ('modality' in need ? [need.modality] : [])))],
    fileTypes: [...new Set(needs.flatMap(need => ('fileType' in need ? [need.fileType] : [])))],
    blocks,
  }
}

/** The blocks of a requirement a model does not take: the ones to name when it is not selectable. */
export function unmetBy(
  requirement: NativeRequirement,
  capability: NativeCapability,
): readonly BlockPosition[] {
  return requirement.blocks.filter(each => !takes(capability, each.needs))
}
