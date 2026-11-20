import { judgeContentBlock } from '@omne-harness/content-block'
import { imageBudget, open, type ImageBudget, type ImageRejectReason } from '@omne-harness/image'
import type { ToolResult } from '@omne-harness/tool-contract'
import type {
  ToolMediaProduct,
  ToolMessageContentBlock,
  ToolPrimitiveFailure,
} from '@omne-harness/tool-contract/provider'
import type { FilesAuthorEnvironment } from './environment.ts'
import type { Field } from './protocol.ts'
import { confirmation } from './text.ts'

const limit = (name: string, description: string): Field => ({
  name,
  kind: 'positive',
  required: true,
  description,
})
export const openLimitFields: readonly Field[] = [
  limit('openMaxBytes', 'Required positive safe integer: the largest file open reads, in bytes.'),
  limit('imageMaxWidth', 'Required positive safe integer: the widest picture open decodes.'),
  limit('imageMaxHeight', 'Required positive safe integer: the tallest picture open decodes.'),
  limit(
    'imageMaxDecodedBytes',
    'Required positive safe integer: the decoded bytes of one picture.',
  ),
  limit('imageConcurrency', 'Required positive safe integer: the pictures decoded at once.'),
]
export type OpenLimits = Readonly<{ maxBytes: number; budget: ImageBudget }>

export function openLimits(number: (name: string, minimum: number) => number): OpenLimits {
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
  if (created.kind !== 'budget') throw new TypeError(`Files image budget: ${created.reason}`)
  return { maxBytes: number('openMaxBytes', 1), budget: created.budget }
}

const REFUSALS: Readonly<Record<ImageRejectReason, string>> = {
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

function unstored(failure: ToolPrimitiveFailure, header: string): string {
  if (failure.kind === 'unavailable')
    return `unavailable ${header} the picture was not stored: ${failure.reason}`
  if (failure.kind === 'unknown')
    return `unknown ${header} whether the picture was stored is not known: ${failure.reason}`
  return `rejected reason=${failure.kind} ${header} ${failure.reason}`
}

type Opened = Readonly<{ text: string; product?: ToolMediaProduct }>

/** Reads the whole file, passes it through the image budget, then hands it to the store. */
export async function openPicture(
  path: string,
  header: string,
  environment: Pick<FilesAuthorEnvironment, 'files' | 'media'>,
  limits: OpenLimits,
): Promise<Opened> {
  const read = await environment.files.read({ path, limitBytes: limits.maxBytes + 1 })
  if (read.kind !== 'done') return { text: confirmation(read, () => '') }
  const { bytes } = read.value
  if (bytes.byteLength > limits.maxBytes)
    return {
      text: `rejected reason=over-budget ${header} the file is larger than ${limits.maxBytes} bytes`,
    }
  const picture = await open({ bytes, budget: limits.budget })
  if (picture.kind !== 'opened')
    return { text: `rejected reason=${REFUSALS[picture.reason]} ${header}` }
  const { mediaType, orientedWidth, orientedHeight } = picture.declaration
  await picture.handle.close()
  const stored = await environment.media.put({ mediaType, bytes: picture.verifiedBytes })
  if ('failure' in stored) return { text: unstored(stored.failure, header) }
  return {
    text: `done Files open ${header} media_type=${mediaType} width=${orientedWidth} height=${orientedHeight} bytes=${bytes.byteLength}`,
    product: stored.ok,
  }
}

const VISIBLE = { toHuman: true, toModel: true }

function block(value: unknown): ToolMessageContentBlock {
  const judged = judgeContentBlock(value)
  if ('rejected' in judged) throw new TypeError(`Invalid Files open block: ${judged.rejected}`)
  return judged.ok as ToolMessageContentBlock
}

/** One line of text, then the picture as a reference: the bytes are never in the result. */
export function openResult(opened: Opened): ToolResult<ToolMessageContentBlock> {
  const text = block({
    kind: 'text',
    id: 'Files.open.text',
    visibility: VISIBLE,
    text: opened.text,
  })
  const { product } = opened
  const content =
    product === undefined
      ? [text]
      : [
          text,
          block({
            kind: 'image',
            id: 'Files.open.image',
            visibility: VISIBLE,
            ref: product.ref,
            transcript: null,
            facts: product.facts,
          }),
        ]
  return { content, data: { kind: 'none' }, original: { kind: 'none' }, attachments: [] }
}
