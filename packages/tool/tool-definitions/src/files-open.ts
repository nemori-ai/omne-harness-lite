import { open, type ImageBudget } from '@omne-harness/image'
import type { FilesAuthorEnvironment } from './environment.ts'
import {
  imageBudgetFields,
  imageBudgetOf,
  limitField,
  PICTURE_REFUSALS,
  unstored,
  type PictureAnswer,
} from './pictures.ts'
import type { Field } from './protocol.ts'
import { confirmation } from './text.ts'

export const openLimitFields: readonly Field[] = [
  limitField(
    'openMaxBytes',
    'Required positive safe integer: the largest file open reads, in bytes.',
  ),
  ...imageBudgetFields,
]
export type OpenLimits = Readonly<{ maxBytes: number; budget: ImageBudget }>

export function openLimits(number: (name: string, minimum: number) => number): OpenLimits {
  return { maxBytes: number('openMaxBytes', 1), budget: imageBudgetOf(number) }
}

/** Reads the whole file, passes it through the image budget, then hands it to the store. */
export async function openPicture(
  path: string,
  header: string,
  environment: Pick<FilesAuthorEnvironment, 'files' | 'media'>,
  limits: OpenLimits,
): Promise<PictureAnswer> {
  const read = await environment.files.read({ path, limitBytes: limits.maxBytes + 1 })
  if (read.kind !== 'done') return { text: confirmation(read, () => '') }
  const { bytes } = read.value
  if (bytes.byteLength > limits.maxBytes)
    return {
      text: `rejected reason=over-budget ${header} the file is larger than ${limits.maxBytes} bytes`,
    }
  const picture = await open({ bytes, budget: limits.budget })
  if (picture.kind !== 'opened')
    return { text: `rejected reason=${PICTURE_REFUSALS[picture.reason]} ${header}` }
  const { mediaType, orientedWidth, orientedHeight } = picture.declaration
  await picture.handle.close()
  const stored = await environment.media.put({ mediaType, bytes: picture.verifiedBytes })
  if ('failure' in stored) return { text: unstored(stored.failure, header) }
  return {
    text: `done Files open ${header} media_type=${mediaType} width=${orientedWidth} height=${orientedHeight} bytes=${bytes.byteLength}`,
    product: stored.ok,
  }
}
