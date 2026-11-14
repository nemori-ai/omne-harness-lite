import { describe, expect, it } from 'vitest'
import { commitRejectionNature } from '../src/index.ts'
import type { CommitRejectReason } from '../src/index.ts'

const temporary: CommitRejectReason[] = [
  'closing',
  'queue_full',
  'writer_not_current',
  'domain_unavailable',
  'cancelled',
]

const definite: CommitRejectReason[] = [
  'field_missing',
  'unsupported_protocol',
  'participant_repeated',
  'facts_not_json',
  'command_limit',
  'combination_unregistered',
  'manifest_mismatch',
  'material_unavailable',
  'participant_not_in_combination',
  'participant_dependency_missing',
]

describe('commitRejectionNature', () => {
  it.each(temporary)('%s is temporary', reason => {
    expect(commitRejectionNature(reason)).toBe('temporary')
  })

  it.each(definite)('%s is definite', reason => {
    expect(commitRejectionNature(reason)).toBe('definite')
  })
})
