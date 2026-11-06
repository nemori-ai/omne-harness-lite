// The one rule of what a transport's answer means for a ready connection (SPEC MC-16, MC-17,
// MC-7; contract S5, S7, T1): `lostOf` over every answer the three services hand it.
import { describe, expect, it } from 'vitest'
import type { PeerAnswer } from '@omne-harness/mcp-contract'
import type { TransportFailure } from '@omne-harness/mcp-contract/provider'
import { jsonOf } from '@omne-harness/mcp-contract/testing'
import { lostOf } from '../src/internal/lost.ts'

const DISCOVERY = {
  resourceMetadataUrl: 'https://peer.test/.well-known/oauth-protected-resource',
  metadata: 'unavailable',
  issuers: [],
  scopes: [],
} as const

describe('lostOf: what one answer of the transport means for a ready connection', () => {
  it.each([
    [
      { kind: 'not-sent', cause: 'connection-unavailable', unusable: 'stream-broken' },
      'stream-broken',
    ],
    [{ kind: 'not-sent', cause: 'session-ended', unusable: 'session-ended' }, 'session-ended'],
    [{ kind: 'no-answer', cause: 'process-exited', unusable: 'process-exited' }, 'process-exited'],
    [{ kind: 'no-answer', cause: 'abandoned', unusable: 'stream-broken' }, 'stream-broken'],
  ] as const)(
    'rule 1: an answer with the mark (%o) loses the connection for the mark, not the cause (%s), and marks the catalog connection-unavailable',
    (answer, reason) => {
      expect(lostOf(answer)).toEqual({ reason, mark: 'connection-unavailable' })
    },
  )

  it('rule 2: not-sent (authorization-required) loses the connection for it and marks the catalog with it', () => {
    expect(
      lostOf({ kind: 'not-sent', cause: 'authorization-required', discovery: DISCOVERY }),
    ).toEqual({ reason: 'authorization-required', mark: 'authorization-required' })
  })

  it.each<TransportFailure | PeerAnswer>([
    { kind: 'not-sent', cause: 'connection-unavailable' },
    { kind: 'not-sent', cause: 'session-ended' },
    { kind: 'no-answer', cause: 'stream-broken' },
    { kind: 'no-answer', cause: 'process-exited' },
    { kind: 'no-answer', cause: 'abandoned' },
    { kind: 'error-answer', code: -32603, message: 'internal' },
    { kind: 'answer-malformed', what: 'tools-missing' },
    { kind: 'result', result: jsonOf({}) },
    { kind: 'error', error: jsonOf({ code: -32603, message: 'internal' }) },
  ])('rule 3: %o without the mark leaves the connection as it is', answer => {
    expect(lostOf(answer)).toBeUndefined()
  })
})
