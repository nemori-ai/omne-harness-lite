// The one rule of what a transport's answer means for a ready connection (SPEC MC-16, MC-17,
// MC-7; contract S5, S7, T1): `lostOf` over every answer the three services hand it.
import { describe, expect, it } from 'vitest'
import type { PeerAnswer } from '@omne-harness/mcp-contract'
import type { TransportFailure } from '@omne-harness/mcp-contract/provider'
import { endpointRefOf, jsonOf, peerIdentityOf } from '@omne-harness/mcp-contract/testing'
import { admit } from '../src/internal/gate.ts'
import { loseIfLost, lostOf } from '../src/internal/lost.ts'
import { createConnectionTable } from '../src/internal/table.ts'
import { alice } from './doubles/identities.ts'
import { adoptStdio, world } from './doubles/world.ts'

const files = endpointRefOf('files')

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

describe('loseIfLost: the one place a request hands what lostOf found to the table', () => {
  async function readyTable() {
    const w = world({ script: [{ discover: peerIdentityOf() }] })
    adoptStdio(w, files)
    const table = createConnectionTable(w.ports, w.config)
    const decision = await admit(w.ports, alice, files)
    if (decision.kind !== 'admitted') throw new Error(`not admitted: ${decision.kind}`)
    const ensured = await table.ensure(decision.endpoint, alice)
    if (!('ok' in ensured)) throw new Error('ensure failed')
    return { table, ensured: ensured.ok, holding: decision.endpoint.ref.holding }
  }

  it.each<[TransportFailure | PeerAnswer, string]>([
    [{ kind: 'no-answer', cause: 'abandoned', unusable: 'process-exited' }, 'process-exited'],
    [
      { kind: 'not-sent', cause: 'authorization-required', discovery: DISCOVERY },
      'authorization-required',
    ],
  ])('%o loses the ready connection for %s', async (answer, reason) => {
    const { table, ensured, holding } = await readyTable()
    loseIfLost(table, ensured, answer)
    expect(table.stateOf(alice.tenant, holding)).toMatchObject({ kind: 'lost', reason })
  })

  it.each<TransportFailure | PeerAnswer>([
    { kind: 'no-answer', cause: 'stream-broken' },
    { kind: 'not-sent', cause: 'connection-unavailable' },
    { kind: 'error', error: jsonOf({ code: -32603, message: 'internal' }) },
  ])('%o leaves the ready connection ready', async answer => {
    const { table, ensured, holding } = await readyTable()
    loseIfLost(table, ensured, answer)
    expect(table.stateOf(alice.tenant, holding)).toMatchObject({ kind: 'ready' })
  })
})
