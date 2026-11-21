import { describe, expect, it } from 'vitest'
import { imageLimits } from '../src/media.ts'

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
    const limits = imageLimits(PNG_AND_JPEG, 4_194_304)
    const expected = { mediaTypes: PNG_AND_JPEG.mediaTypes, maxBytes: 4_194_304, image: null }
    expect(limits(reference('image/png'))).toEqual(expected)
    // A type the model does not take is still an image: the source is asked for a version it takes.
    expect(limits(reference('image/tiff'))).toEqual(expected)
  })

  it('an image of a profile without a byte limit is bounded by nothing here', () => {
    expect(imageLimits(PNG_AND_JPEG, undefined)(reference('image/png'))).toEqual({
      mediaTypes: PNG_AND_JPEG.mediaTypes,
      maxBytes: Number.MAX_SAFE_INTEGER,
      image: null,
    })
  })

  it('a voice, a file, or any reference of a model without image types gets none', () => {
    const limits = imageLimits(PNG_AND_JPEG, 4_194_304)
    expect(limits(reference('audio/wav'))).toBeNull()
    expect(limits(reference('application/pdf'))).toBeNull()
    expect(limits(reference('imagery/png'))).toBeNull()
    expect(imageLimits(null, 4_194_304)(reference('image/png'))).toBeNull()
  })
})
