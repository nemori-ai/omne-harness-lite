// The call port `cancel` (SPEC S2, MC-12, MC-16): it reads the in-flight table only, so another
// principal or tenant on the same correlation key gets `unknown`; a cancel before the send keeps
// the call off the wire; a cancel after the send, or one that lands between the send and its
// record, tells the peer once and ends the call as unknown (abandoned).
import { describe, expect, it } from 'vitest'
import type { DefinitionDigest, InvokeRequest } from '@omne-harness/mcp-contract'
import {
  actionNameOf,
  correlationKeyOf,
  endpointRefOf,
  jsonOf,
  type Replies,
} from '@omne-harness/mcp-contract/testing'
import { deferred, settled } from './doubles/deferred.ts'
import { alice, aliceAway, bob, mallory } from './doubles/identities.ts'
import { completed, listing, peer, services, text, type Peer } from './doubles/peer.ts'
import { stallingEligibility } from './doubles/stalls.ts'
import { adoptStdio, storedRecord } from './doubles/world.ts'

const files = endpointRefOf('files')
const READ = actionNameOf('read')
const c1 = correlationKeyOf('c1')
const anonymousKey = {
  tenant: alice.tenant,
  account: { kind: 'anonymous' as const },
  holding: files.holding,
}

/** A peer that lists `read` and answers it as scripted, adopted for alice, with the catalog stored. */
async function arranged(read: Replies, options: Parameters<typeof peer>[1] = {}) {
  const p = peer({ listing: { '': listing([{ name: 'read' }]) }, calls: { read } }, options)
  adoptStdio(p, files)
  const stored = await storedRecord(p, anonymousKey, ['read'])
  const digest = stored.actions[0]?.definitionDigest
  if (digest === undefined) throw new Error('no digest')
  return { p, digest }
}

function request(expectedDefinition: DefinitionDigest, signal?: AbortSignal): InvokeRequest {
  return {
    ref: files,
    action: READ,
    args: jsonOf({}),
    expectedDefinition,
    correlationKey: c1,
    signal: signal ?? new AbortController().signal,
  }
}

const ABANDONED = { kind: 'sent', outcome: { kind: 'unknown', cause: 'abandoned' } }

function portCalls(p: Peer) {
  return { adoption: p.adoption.calls(), eligibility: p.eligibility.calls() }
}

describe('cancel reads the in-flight table only (SPEC S2)', () => {
  it('answers unknown to another principal and to another tenant on the same correlation key, and asks no port', async () => {
    const { p, digest } = await arranged({ kind: 'silent' })
    const { services: s } = services(p)
    const call = s.invoker.invoke(alice, request(digest))
    await settled()
    const asked = portCalls(p)
    expect(await s.invoker.cancel(bob, c1)).toBe('unknown')
    expect(await s.invoker.cancel(mallory, c1)).toBe('unknown')
    expect(await s.invoker.cancel(aliceAway, c1)).toBe('unknown')
    expect(portCalls(p)).toEqual(asked)
    expect(p.cancels()).toBe(0)
    expect(await s.invoker.cancel(alice, c1)).toBe('signalled')
    expect(await call).toEqual(ABANDONED)
    expect(p.cancels()).toBe(1)
  })

  it('answers unknown for a key never used, and no-call-in-flight for a call that ended', async () => {
    const { p, digest } = await arranged(completed([text('hi')]))
    const { services: s } = services(p)
    expect(await s.invoker.cancel(alice, c1)).toBe('unknown')
    expect(await s.invoker.invoke(alice, request(digest))).toMatchObject({ kind: 'sent' })
    expect(await s.invoker.cancel(alice, c1)).toBe('no-call-in-flight')
  })
})

describe('a cancel before the send (SPEC S2, MC-16 step 6)', () => {
  it('makes the call answer not sent (cancelled) with no call on the wire; the key has ended', async () => {
    const { p, digest } = await arranged(completed([text('hi')]))
    // The invoke's gate is the first eligibility call; it waits until the case lets it go.
    const stalled = stallingEligibility(p.eligibility, 1)
    const { services: s } = services({ ...p, ports: { ...p.ports, eligibility: stalled.port } })
    const call = s.invoker.invoke(alice, request(digest))
    await settled()
    expect(stalled.calls()).toBe(1)
    expect(await s.invoker.cancel(alice, c1)).toBe('signalled')
    stalled.gate.resolve()
    expect(await call).toEqual({ kind: 'not-sent', reason: { kind: 'cancelled' } })
    expect(p.requests('tools/call')).toHaveLength(0)
    expect(p.opens()).toBe(0)
    expect(p.cancels()).toBe(0)
    expect(await s.invoker.cancel(alice, c1)).toBe('no-call-in-flight')
  })
})

describe('a cancel after the send (SPEC S2, MC-16 step 8)', () => {
  it('tells the peer once and ends the call as unknown (abandoned), without waiting for the peer', async () => {
    const { p, digest } = await arranged({ kind: 'silent' })
    const { services: s } = services(p)
    const call = s.invoker.invoke(alice, request(digest))
    await settled()
    expect(p.requests('tools/call')).toHaveLength(1)
    expect(await s.invoker.cancel(alice, c1)).toBe('signalled')
    expect(await call).toEqual(ABANDONED)
    expect(p.cancels()).toBe(1)
    expect(await s.invoker.cancel(alice, c1)).toBe('no-call-in-flight')
    expect(p.cancels()).toBe(1)
  })

  it('that lands between the send and its record is the same: the call is on the wire, so the peer is told once', async () => {
    const gate = deferred<void>()
    const { p, digest } = await arranged(completed([text('hi')]), {
      callGate: { after: () => gate.promise },
    })
    const { services: s } = services(p)
    const call = s.invoker.invoke(alice, request(digest))
    await settled()
    expect(p.requests('tools/call')).toHaveLength(1)
    expect(await s.invoker.cancel(alice, c1)).toBe('signalled')
    gate.resolve()
    expect(await call).toEqual(ABANDONED)
    expect(p.cancels()).toBe(1)
  })

  it('that races the send, which the transport then refuses, is a cancel before the send: nothing is lost', async () => {
    const gate = deferred<void>()
    const { p, digest } = await arranged(completed([text('hi')]), {
      callGate: { before: () => gate.promise },
    })
    const { services: s } = services(p)
    const call = s.invoker.invoke(alice, request(digest))
    await settled()
    expect(await s.invoker.cancel(alice, c1)).toBe('signalled')
    gate.resolve()
    expect(await call).toEqual({ kind: 'not-sent', reason: { kind: 'cancelled' } })
    expect(p.requests('tools/call')).toHaveLength(0)
    expect(p.cancels()).toBe(0)
    expect(await s.status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'ready' } },
    })
  })

  it('with the caller abort too tells the peer once only', async () => {
    const { p, digest } = await arranged({ kind: 'silent' })
    const { services: s } = services(p)
    const controller = new AbortController()
    const call = s.invoker.invoke(alice, request(digest, controller.signal))
    await settled()
    expect(await s.invoker.cancel(alice, c1)).toBe('signalled')
    controller.abort()
    expect(await call).toEqual(ABANDONED)
    await settled()
    expect(p.cancels()).toBe(1)
  })
})
