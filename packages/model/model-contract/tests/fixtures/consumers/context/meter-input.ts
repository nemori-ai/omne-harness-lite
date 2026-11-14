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

export function inputBound(context: ContextLimits): bigint {
  if (context.input !== null) return BigInt(context.input.provided)
  return BigInt(context.window.provided) - BigInt(context.output.provided)
}

export function triggerLine(context: ContextLimits): bigint {
  return (BigInt(context.window.provided) * BigInt(context.compactionTriggerPercent)) / 100n
}

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
