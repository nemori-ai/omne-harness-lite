import type { ImageFormat } from '@omne-harness/image'
import type { VariantTarget } from '@omne-harness/media-contract'

export type Source = Readonly<{
  format: ImageFormat
  width: number
  height: number
  opaque: boolean
}>
export type Attempt = Readonly<{
  format: ImageFormat
  width: number
  height: number
  quality?: number
}>

const LADDER = [85, 75, 60]
const LOSSY: readonly ImageFormat[] = ['jpeg', 'webp']

/** What to encode, in order, until one fits the bytes: size first, then the type, then the quality ladder. */
export function attempts(source: Source, target: VariantTarget): Attempt[] {
  const scale = Math.min(1, target.maxWidth / source.width, target.maxHeight / source.height)
  const width = Math.max(1, Math.floor(source.width * scale))
  const height = Math.max(1, Math.floor(source.height * scale))
  const preferred: ImageFormat[] = source.opaque
    ? [source.format, 'jpeg', 'webp', 'png']
    : [source.format, 'webp', 'png']
  return [...new Set(preferred)]
    .filter(format => target.mediaTypes.includes(`image/${format}`))
    .flatMap(format =>
      LOSSY.includes(format)
        ? LADDER.map(quality => ({ format, width, height, quality }))
        : [{ format, width, height }],
    )
}
