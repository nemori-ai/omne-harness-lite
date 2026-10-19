import { expectTypeOf, it } from 'vitest'
import type {
  BlockId,
  ContentBlock,
  ContentReference,
  ReferenceContentBlock,
  Visibility,
} from '@omne-harness/content-block'

it('a reference block is a content block of a referable kind', () => {
  expectTypeOf<ReferenceContentBlock>().toExtend<ContentBlock>()
  expectTypeOf<ReferenceContentBlock['kind']>().toEqualTypeOf<'voice' | 'image' | 'file'>()
  expectTypeOf<ReferenceContentBlock['ref']>().toEqualTypeOf<ContentReference>()
  expectTypeOf<ReferenceContentBlock['transcript']>().toEqualTypeOf<string | null>()
})

it('a content reference has exactly five readonly string fields', () => {
  expectTypeOf<ContentReference>().toEqualTypeOf<
    Readonly<{ storage: string; key: string; mediaType: string; bytes: string; digest: string }>
  >()
})

it('rejects a reference block without a digest, a transcript, or a referable kind', () => {
  const id = 'r1' as BlockId
  const visibility: Visibility = { toHuman: true, toModel: true }
  // @ts-expect-error digest is required
  const withoutDigest: ContentReference = {
    storage: 'blob',
    key: 'k',
    mediaType: 'image/png',
    bytes: '1',
  }
  const ref: ContentReference = { ...withoutDigest, digest: 'sha256:base64:x' }
  // @ts-expect-error transcript is required, possibly null
  const withoutTranscript: ReferenceContentBlock = { kind: 'image', id, visibility, ref }
  const textReference: ReferenceContentBlock = {
    // @ts-expect-error text has no reference form
    kind: 'text',
    id,
    visibility,
    ref,
    transcript: null,
  }
  const mixed: ReferenceContentBlock = {
    kind: 'image',
    id,
    visibility,
    ref,
    transcript: null,
    // @ts-expect-error a reference block does not carry inline data
    inline: 'png',
  }
  void [withoutTranscript, textReference, mixed]
})
