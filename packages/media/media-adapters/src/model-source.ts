import type { Media, MediaFacts, VariantTarget } from '@omne-harness/media-contract'
import type {
  ModelMedia,
  ModelMediaLimits,
  ModelMediaSource,
} from '@omne-harness/model-contract/provider'

type Measurement = ModelMedia['measurement']
type Measured = Pick<Measurement, 'reference' | 'bytes' | 'mediaType'>

function targetOf(limits: ModelMediaLimits): VariantTarget {
  const { mediaTypes, maxBytes, image } = limits
  const unbounded = Number.MAX_SAFE_INTEGER
  return {
    mediaTypes,
    maxBytes,
    maxWidth: image?.maxWidth ?? unbounded,
    maxHeight: image?.maxHeight ?? unbounded,
  }
}

function measurementOf(measured: Measured, facts: MediaFacts): Measurement {
  if (facts.kind === 'image')
    return {
      ...measured,
      kind: 'image',
      widthPixels: String(facts.widthPixels),
      heightPixels: String(facts.heightPixels),
    }
  if (facts.kind === 'file') return { ...measured, kind: 'file' }
  return {
    ...measured,
    kind: 'voice',
    durationMs: String(facts.durationMs),
    sampleRate: String(facts.sampleRate),
    channels: String(facts.channels),
  }
}

/** Reads for Model what a request refers to: the original, or a version within the model's limits. */
export function createModelMediaSource<P>(
  media: () => Pick<Media, 'variants'> | undefined,
): ModelMediaSource<P> {
  return {
    async open({ tenant, reference, limits }) {
      const variants = media()?.variants
      if (variants === undefined)
        return { failure: { kind: 'unavailable', diagnostic: 'media is not there' } }
      const opened = await variants.open({ tenant, ref: reference, target: targetOf(limits) })
      if ('ok' in opened) {
        const { mediaType, bytes, facts } = opened.ok
        const measured = { reference, bytes: String(bytes.byteLength), mediaType }
        return { ok: { mediaType, bytes, measurement: measurementOf(measured, facts) } }
      }
      const { failure } = opened
      if (failure.kind === 'too-large') return { failure: { kind: 'too-large' } }
      if (failure.kind === 'unavailable')
        return {
          failure: {
            kind: 'unavailable',
            diagnostic: `media: ${failure.dependency} is unavailable`,
          },
        }
      // No such medium, another tenant's, or bytes that are gone: the same answer to Model.
      return { failure: { kind: 'material-unavailable' } }
    },
  }
}
