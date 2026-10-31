import { expectTypeOf, it } from 'vitest'
import type { Modality } from '@omne-harness/modality'
import type { ConversionResult, ConvertedContent } from '@omne-harness/model-contract'
import type {
  ConversionFailure,
  ConversionReply,
  ConverterKey,
  ConverterLookup,
  ModelConverter,
  ModelConverterCatalog,
  ModelMessageConversion,
} from '@omne-harness/model-contract/provider'
import { adoption, block, evidence } from './values.ts'

const converted: ConvertedContent = {
  original: block,
  derived: [block],
  transcript: 't',
  converter: adoption,
}

it('converter keys select by media type or by modality', () => {
  const keys: ConverterKey[] = [
    { kind: 'media-type', mediaType: 'audio/wav' },
    { kind: 'modality', modality: 'voice' },
    { kind: 'modality', modality: 'video' },
  ]
  // @ts-expect-error an unlisted modality
  const unknown: ConverterKey = { kind: 'modality', modality: 'smell' }
  void [keys, unknown]
})

it('a converter lookup may ask for any modality of the shared vocabulary, or for none', () => {
  type Request = Parameters<ModelConverterCatalog<unknown>['acquire']>[0]
  expectTypeOf<Request['modality']>().toEqualTypeOf<Modality | null>()
  const video: Request = { mediaType: 'video/mp4', modality: 'video' }
  const none: Request = { mediaType: 'application/pdf', modality: null }
  void [video, none]
})

it('converted content carries a transcript and at least one derived block', () => {
  // @ts-expect-error a conversion without a transcript
  const noTranscript: ConvertedContent = { original: block, derived: [block], converter: adoption }
  // @ts-expect-error a conversion needs at least one derived block
  const noDerived: ConvertedContent = { ...converted, derived: [] }
  void [noTranscript, noDerived]
})

it('conversion results separate unchanged, deferred and converted content', () => {
  const results: ConversionResult[] = [
    { kind: 'unchanged', original: block, reason: 'no-converter' },
    { kind: 'deferred', original: block, source: evidence },
    { kind: 'converted', value: converted },
  ]
  // @ts-expect-error an unlisted reason
  const reason: ConversionResult = { kind: 'unchanged', original: block, reason: 'unsupported' }
  void [results, reason]
})

it('a cancelled conversion is a named failure, not an exception', () => {
  const cancelled: ConversionFailure = { kind: 'cancelled' }
  const failure: ConversionFailure = { kind: 'not-settled' }
  expectTypeOf<ConversionReply<number>>().toExtend<Promise<unknown>>()
  void [cancelled, failure]
})

it('an adapter can implement the converter ports from the contract alone', () => {
  const converter: ModelConverter<string> = {
    adoption,
    convert: async () => ({ ok: converted }),
  }
  const catalog: ModelConverterCatalog<string> = {
    acquire: async () => ({ ok: { kind: 'selected', converter, release: async () => {} } }),
  }
  const lookups: ConverterLookup<string>[] = [{ kind: 'absent' }]
  const conversion: ModelMessageConversion<string> = {
    prepare: async () => ({ ok: { kind: 'unchanged', original: block, reason: 'text' } }),
  }
  void [catalog, lookups, conversion]
})
