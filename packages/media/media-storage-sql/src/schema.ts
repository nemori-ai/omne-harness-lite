export const PARTICIPANT = 'media.index'
export const PROTOCOL = 'media-index/1'
export const HANDLER = 'media.index.read'
export const MIGRATION = { owner: PARTICIPANT, id: 'media-1' }
export const TABLES = ['md_objects', 'md_holds', 'md_uploads']
export const ROW_LIMIT = 10_000

export const SCRIPTS = [
  'insertUploading',
  'attachWrite',
  'advance',
  'stageOrMerge',
  'holdIfLive',
  'markDeleting',
  'markDeletingIfExpired',
  'dropRow',
] as const
export type ScriptName = (typeof SCRIPTS)[number]

export const READS = ['readUpload', 'readLive', 'listDeleting'] as const
export type ReadName = (typeof READS)[number]
export type ReadRequest = Readonly<{ read: ReadName; name: string; limit: number }>
