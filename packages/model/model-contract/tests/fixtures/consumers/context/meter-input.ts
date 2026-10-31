// What the context and the stand-in services of this fixture read out of an assembled input:
// its content blocks, the references that point at media, the input that the meter measures and the
// token bounds that its profile declares.
import {
  CONTENT_BLOCK_KINDS,
  type ContentBlock,
  type ContentReference,
} from '@omne-harness/content-block'
import type { MessagePart } from '@omne-harness/message'
import type {
  AssembledModelInput,
  ContextLimits,
  ModelInputMeter,
  ModelProfile,
} from '@omne-harness/model-contract'
import { adoption, json } from './values.ts'

export function isContentBlock(part: MessagePart): part is ContentBlock {
  return CONTENT_BLOCK_KINDS.some(kind => kind === part.kind)
}

export function blocksOf(assembled: AssembledModelInput): ContentBlock[] {
  return [
    ...assembled.system,
    ...assembled.messages.flatMap(message => message.blocks.filter(isContentBlock)),
  ]
}

export function referencesOf(blocks: readonly ContentBlock[]): ContentReference[] {
  return blocks.flatMap(block => ('ref' in block ? [block.ref] : []))
}

export type MeterInput = Parameters<ModelInputMeter['measure']>[0]

/** The most tokens an input may hold: the separate input limit, else the window less the output limit. */
export function inputBound(context: ContextLimits): bigint {
  if (context.input !== null) return BigInt(context.input.provided)
  return BigInt(context.window.provided) - BigInt(context.output.provided)
}

/**
 * This stand-in's own trigger rule: the profile's default share of the window. The rule belongs to
 * the compaction owner; the Model contract does not define it.
 */
export function triggerLine(context: ContextLimits): bigint {
  return (BigInt(context.window.provided) * BigInt(context.compactionTriggerPercent)) / 100n
}

/** The input for the meter: the texts to count, and any media that is still only a reference. */
export function meterInput(profile: ModelProfile, assembled: AssembledModelInput): MeterInput {
  const blocks = blocksOf(assembled)
  const [first, ...rest] = referencesOf(blocks)
  const base = {
    adoption: adoption('representation'),
    tokenInput: json(blocks.flatMap(block => ('text' in block ? [block.text] : []))),
    media: [],
  }
  return {
    profile: profile.adoption,
    supplier: profile.definition.suppliers[0],
    context: profile.definition.context,
    limits: profile.definition.limits,
    assembled,
    parameters: [],
    representation:
      first === undefined
        ? { ...base, kind: 'materialized', requestBytes: '0' }
        : { ...base, kind: 'pending-media', references: [first, ...rest] },
  }
}
