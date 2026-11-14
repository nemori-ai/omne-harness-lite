import type { CommitRejectReason } from './types.ts'

export type RejectionNature = 'temporary' | 'definite'

const COMMIT_NATURE: Readonly<Record<CommitRejectReason, RejectionNature>> = {
  closing: 'temporary',
  queue_full: 'temporary',
  writer_not_current: 'temporary',
  domain_unavailable: 'temporary',
  cancelled: 'temporary',
  field_missing: 'definite',
  unsupported_protocol: 'definite',
  participant_repeated: 'definite',
  facts_not_json: 'definite',
  command_limit: 'definite',
  combination_unregistered: 'definite',
  manifest_mismatch: 'definite',
  material_unavailable: 'definite',
  participant_not_in_combination: 'definite',
  participant_dependency_missing: 'definite',
}

export const commitRejectionNature = (reason: CommitRejectReason): RejectionNature =>
  COMMIT_NATURE[reason]
