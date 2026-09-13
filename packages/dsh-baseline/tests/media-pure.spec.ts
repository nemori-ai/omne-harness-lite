import { describe, expect, it } from 'vitest'
import {
  AttachmentError,
  AttachmentId,
  ImageVariantId,
  isAttachmentError,
  isImageAdmissionError,
  requestImageDimensions,
  type FileAttachmentRef,
  type ImageAttachmentRef,
} from '../dist/media/index.js'

describe('source media pure mechanisms', () => {
  it('keeps brands runtime-transparent while type projections remain constructible', () => {
    const image: ImageAttachmentRef = {
      attachmentId: AttachmentId('sha256:image'),
      mediaType: 'image/png',
      bytes: 10,
      width: 2,
      height: 3,
    }
    const file: FileAttachmentRef = { attachmentId: AttachmentId('sha256:file'), name: 'a.txt', bytes: 4 }
    expect(image.attachmentId).toBe('sha256:image')
    expect(file.name).toBe('a.txt')
    expect(ImageVariantId('variant')).toBe('variant')
  })

  it('projects dimensions inward without enlarging and stays within the pixel budget', () => {
    expect(requestImageDimensions(10, 20, 1_000)).toEqual({ width: 10, height: 20 })
    const projected = requestImageDimensions(4_000, 3_000, 1_000_000)
    expect(projected.width * projected.height).toBeLessThanOrEqual(1_000_000)
    expect(projected.width / projected.height).toBeCloseTo(4 / 3, 2)
  })

  it('routes stable attachment errors by code', () => {
    const admission = new AttachmentError('too large', 'IMAGE_TOO_LARGE')
    const storage = new AttachmentError('missing', 'ATTACHMENT_NOT_FOUND')
    expect(isAttachmentError(admission)).toBe(true)
    expect(isImageAdmissionError(admission)).toBe(true)
    expect(isImageAdmissionError(storage)).toBe(false)
  })
})
