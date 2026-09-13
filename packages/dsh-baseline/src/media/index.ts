/** Selected pure attachment vocabulary and request projection source baseline. */

export { AttachmentId, ImageVariantId } from './brand.ts'
export { AttachmentError, isAttachmentError, isImageAdmissionError } from './error.ts'
export type { AttachmentErrorCode, ImageAdmissionErrorCode } from './error.ts'
export { requestImageDimensions } from './request-projection.ts'
export type {
  AdmittedPromptContentPart,
  AttachmentAdmissionPart,
  EncodedFileAttachment,
  EncodedImageAttachment,
  FileAttachmentRef,
  ImageAttachmentLimits,
  ImageAttachmentRef,
  ImageMediaType,
  ImageRequestPolicy,
  PromptContentPart,
  RequestImageAttachment,
  SaveFileAttachment,
  SaveFileStreamAttachment,
  SaveImageAttachment,
  StoredImageAttachment,
} from './types.ts'
