import { describe, expect, it } from 'vitest'
import { acceptedLimits, wireLimits } from '../src/media.ts'

const reference = (mediaType: string) => ({
  storage: 'tests',
  key: 'k',
  mediaType,
  bytes: '1',
  digest: '0'.repeat(64),
})
const PNG_AND_JPEG = { mediaTypes: ['image/png', 'image/jpeg'] }

describe('the limits a binding gives for a reference', () => {
  it('an image gets the image types of the wire profile and the byte limit of one image', () => {
    const limits = wireLimits({ image: PNG_AND_JPEG }, { image: 4_194_304 })
    const expected = { mediaTypes: PNG_AND_JPEG.mediaTypes, maxBytes: 4_194_304, image: null }
    expect(limits(reference('image/png'))).toEqual(expected)
    // A type the model does not take is still an image: the source is asked for a version it takes.
    expect(limits(reference('image/tiff'))).toEqual(expected)
  })

  it('an image of a profile without a byte limit is bounded by nothing here', () => {
    expect(wireLimits({ image: PNG_AND_JPEG }, {})(reference('image/png'))).toEqual({
      mediaTypes: PNG_AND_JPEG.mediaTypes,
      maxBytes: Number.MAX_SAFE_INTEGER,
      image: null,
    })
  })

  it('a voice or a file the wire does not take, or any reference of a model without image types, gets none', () => {
    const limits = wireLimits({ image: PNG_AND_JPEG }, { image: 4_194_304 })
    expect(limits(reference('audio/wav'))).toBeNull()
    expect(limits(reference('application/pdf'))).toBeNull()
    expect(limits(reference('imagery/png'))).toBeNull()
    expect(wireLimits({ image: null }, { image: 4_194_304 })(reference('image/png'))).toBeNull()
  })
})

describe('the limits of a binding that takes images and voice', () => {
  it('each reference gets the types and the byte limit of its own kind; anything else gets none', () => {
    const limits = acceptedLimits([
      { prefix: 'image/', mediaTypes: ['image/png'], maxBytes: 4_194_304 },
      { prefix: 'audio/', mediaTypes: ['audio/wav'], maxBytes: undefined },
    ])
    expect(limits(reference('image/png'))).toEqual({
      mediaTypes: ['image/png'],
      maxBytes: 4_194_304,
      image: null,
    })
    expect(limits(reference('audio/mpeg'))).toEqual({
      mediaTypes: ['audio/wav'],
      maxBytes: Number.MAX_SAFE_INTEGER,
      image: null,
    })
    expect(limits(reference('application/pdf'))).toBeNull()
    expect(acceptedLimits([])(reference('audio/wav'))).toBeNull()
  })
})

describe('files and words kept apart', () => {
  it('a file type the wire takes gets its own type and the byte limit of one file; another type gets none', () => {
    const limits = wireLimits(
      { image: null, file: { mediaTypes: ['application/pdf'], maxBytes: 1024 } },
      {},
    )
    expect(limits(reference('application/pdf'))).toEqual({
      mediaTypes: ['application/pdf'],
      maxBytes: 1024,
      image: null,
    })
    expect(limits(reference('application/zip'))).toBeNull()
  })

  it('words kept apart as text/plain are taken by any wire, without a byte limit', () => {
    expect(wireLimits({ image: null }, {})(reference('text/plain'))).toEqual({
      mediaTypes: ['text/plain'],
      maxBytes: Number.MAX_SAFE_INTEGER,
      image: null,
    })
  })
})
