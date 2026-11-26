import { describe, expect, it } from 'vitest'
import {
  decodePassageId,
  endsWithUntakenInput,
  type AgentConclusion,
  type DurableEvidence,
  type FailureCandidate,
} from '@omne-harness/agent-contract'

const evidence: DurableEvidence = { owner: 'agent', record: 'sample', revision: '1', digest: 'd' }
const head = { step: null, at: '2026-11-25T00:00:00.000Z', source: evidence }

function passage() {
  const decoded = decodePassageId('passage-1')
  if ('failure' in decoded) throw new Error('passage id')
  return decoded.ok
}

const failures = {
  'node-failed': {
    ...head,
    kind: 'node-failed',
    node: 'F2',
    category: 'rejected',
    failureKind: 'invalid',
  },
  'extension-stop': { ...head, kind: 'extension-stop', passage: passage(), reason: 'stop' },
  guard: { ...head, kind: 'guard', level: 3, basis: evidence },
  'request-rejected': {
    ...head,
    kind: 'request-rejected',
    failure: { kind: 'invalid', field: 'messages', reason: 'empty' },
    model: evidence,
    selection: evidence,
  },
} as const satisfies Record<string, FailureCandidate>

const fail: AgentConclusion = { kind: 'fail', cause: evidence }
const cancelled: AgentConclusion = { kind: 'cancelled', cause: evidence }
const complete: AgentConclusion = { kind: 'complete' }

describe('whether a finish may leave an accepted input untaken', () => {
  it.each(['node-failed', 'extension-stop', 'guard'] as const)(
    'a failed conclusion with a %s failure ends whatever was accepted since',
    kind => {
      expect(endsWithUntakenInput({ conclusion: fail, failure: failures[kind] })).toBe(true)
    },
  )

  it('a failed conclusion with any other failure does not', () => {
    expect(endsWithUntakenInput({ conclusion: fail, failure: failures['request-rejected'] })).toBe(
      false,
    )
  })

  it('a failed conclusion without a failure candidate does not', () => {
    expect(endsWithUntakenInput({ conclusion: fail, failure: null })).toBe(false)
  })

  it.each([
    ['complete', complete],
    ['cancelled', cancelled],
  ] as const)('a %s conclusion does not, whatever the failure', (_name, conclusion) => {
    for (const failure of Object.values(failures))
      expect(endsWithUntakenInput({ conclusion, failure })).toBe(false)
  })
})
