import type { CommitRejectReason } from './types.ts'

/**
 * `temporary`: the reason comes from the storage's present state, so the same request can be
 * accepted later; the caller waits and commits again with the same identity. `definite`: the reason
 * comes from the request or from the build, so the same request gets the same rejection; the caller
 * does not wait (SPEC "提交拒绝原因的定性").
 */
export type RejectionNature = 'temporary' | 'definite'

const COMMIT_NATURE: Readonly<Record<CommitRejectReason, RejectionNature>> = {
  closing: 'temporary',
  queue_full: 'temporary',
  writer_not_current: 'temporary',
  domain_unavailable: 'temporary',
  // The SPEC leaves `cancelled` undecided: it comes from the caller's own signal. Temporary until
  // it is decided.
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

/** The nature of a `rejected_before_accept` reason of `commit`. */
export const commitRejectionNature = (reason: CommitRejectReason): RejectionNature =>
  COMMIT_NATURE[reason]
