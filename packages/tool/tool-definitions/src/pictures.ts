import { judgeContentBlock } from '@omne-harness/content-block'
import { imageBudget, type ImageBudget, type ImageRejectReason } from '@omne-harness/image'
import type { ToolResult } from '@omne-harness/tool-contract'
import type {
  ToolMediaProduct,
  ToolMessageContentBlock,
  ToolPrimitiveFailure,
} from '@omne-harness/tool-contract/provider'
import type { Field } from './protocol.ts'

export const limitField = (name: string, description: string): Field => ({
  name,
  kind: 'positive',
  required: true,
  description,
})
export const imageBudgetFields: readonly Field[] = [
  limitField('imageMaxWidth', 'Required positive safe integer: the widest picture decoded.'),
  limitField('imageMaxHeight', 'Required positive safe integer: the tallest picture decoded.'),
  limitField(
    'imageMaxDecodedBytes',
    'Required positive safe integer: the decoded bytes of one picture.',
  ),
  limitField('imageConcurrency', 'Required positive safe integer: the pictures decoded at once.'),
]

/** The image budget a tool decodes within, from its construction values. */
export function imageBudgetOf(number: (name: string, minimum: number) => number): ImageBudget {
  const decoded = number('imageMaxDecodedBytes', 1)
  const concurrency = number('imageConcurrency', 1)
  const created = imageBudget({
    formats: ['image/png', 'image/jpeg', 'image/webp'],
    maxWidth: number('imageMaxWidth', 1),
    maxHeight: number('imageMaxHeight', 1),
    maxDecodedBytes: decoded,
    maxConcurrentDecodes: concurrency,
    maxInFlightBytes: decoded * concurrency,
  })
  if (created.kind !== 'budget') throw new TypeError(`image budget: ${created.reason}`)
  return created.budget
}

/** Why a picture was not taken, as the model reads it. */
export const PICTURE_REFUSALS: Readonly<Record<ImageRejectReason, string>> = {
  empty: 'not-image',
  'not-image': 'not-image',
  truncated: 'damaged',
  decode: 'damaged',
  format: 'unsupported-format',
  'multi-frame': 'animated',
  width: 'over-budget',
  height: 'over-budget',
  'decoded-bytes': 'over-budget',
  concurrent: 'busy',
  'in-flight-bytes': 'busy',
}

/** What the store of products answered when it did not store, about the thing `subject` names. */
export function unstored(failure: ToolPrimitiveFailure, subject: string): string {
  if (failure.kind === 'unavailable')
    return `unavailable ${subject} the picture was not stored: ${failure.reason}`
  if (failure.kind === 'unknown')
    return `unknown ${subject} whether the picture was stored is not known: ${failure.reason}`
  return `rejected reason=${failure.kind} ${subject} ${failure.reason}`
}

const VISIBLE = { toHuman: true, toModel: true }

function block(value: unknown): ToolMessageContentBlock {
  const judged = judgeContentBlock(value)
  if ('rejected' in judged) throw new TypeError(`Invalid picture block: ${judged.rejected}`)
  return judged.ok as ToolMessageContentBlock
}

export type PictureAnswer = Readonly<{ text: string; product?: ToolMediaProduct }>

/** One line of text and, when a picture was stored, a reference to it: the bytes are never here. */
export function pictureResult(
  id: string,
  answer: PictureAnswer,
  first: 'text' | 'image',
): ToolResult<ToolMessageContentBlock> {
  const text = block({ kind: 'text', id: `${id}.text`, visibility: VISIBLE, text: answer.text })
  const { product } = answer
  const image =
    product === undefined
      ? []
      : [
          block({
            kind: 'image',
            id: `${id}.image`,
            visibility: VISIBLE,
            ref: product.ref,
            transcript: null,
            facts: product.facts,
          }),
        ]
  const content = first === 'text' ? [text, ...image] : [...image, text]
  return { content, data: { kind: 'none' }, original: { kind: 'none' }, attachments: [] }
}
