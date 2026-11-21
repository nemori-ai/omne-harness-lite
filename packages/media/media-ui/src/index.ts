export { AttachmentTrayView, type AttachmentTrayProps } from './view/attachment-tray.tsx'
export { MediaBlock, type MediaBlockProps } from './view/media-block.tsx'
export {
  AttachmentTray,
  IMAGE_TYPES,
  type Attachment,
  type AttachmentState,
  type DraftOffer,
  type Drafts,
  type PickedFile,
} from './model/attachment-tray.ts'
export {
  readWhole,
  uploadMedium,
  type MediaClient,
  type ReadOutcome,
  type UploadOutcome,
} from './model/upload.ts'
