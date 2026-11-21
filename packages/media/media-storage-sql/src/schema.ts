export const PARTICIPANT = 'media.index'
export const PROTOCOL = 'media-index/1'
export const HANDLER = 'media.index.read'
export const MIGRATION = { owner: PARTICIPANT, id: 'media-1' }
export const REPRESENTATIONS = { owner: PARTICIPANT, id: 'media-2' }
export const TABLES = ['md_objects', 'md_holds', 'md_uploads', 'md_representations']

export const SCRIPTS = [
  'insertUploading',
  'attachWrite',
  'advance',
  'stageOrMerge',
  'holdIfLive',
  'markDeleting',
  'markDeletingIfExpired',
  'dropRow',
  'recordRepresentation',
] as const
export type ScriptName = (typeof SCRIPTS)[number]

export const READS = ['readUpload', 'readLive', 'listDeleting', 'readRepresentation'] as const
export type ReadName = (typeof READS)[number]
export type ReadRequest = Readonly<{
  read: ReadName
  name: string
  limit: number
  definition?: Readonly<{ name: string; revision: string }>
}>
