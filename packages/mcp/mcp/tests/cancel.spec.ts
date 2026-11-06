// The call port `cancel` (SPEC S2, MC-12, MC-16): it reads the in-flight table only, so another
// principal or tenant on the same correlation key gets `unknown`; from the reservation on, a
// cancel and the caller's abort fire the one stop signal of the call, so a stop before the send
// keeps the call off the wire and ends the key, and a stop after the send, or between the send
// and its record, tells the peer once, does not wait for it, and ends the call as unknown
// (abandoned).
import { describe, expect, it } from 'vitest'
import {
  digestDefinition,
  type DefinitionDigest,
  type InvokeRequest,
  type InvokeResult,
} from '@omne-harness/mcp-contract'
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
import { stallingEligibility, stallingLanding } from './doubles/stalls.ts'
import { never, reshapedTransports } from './doubles/transports.ts'
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

/**
 * A call gate that tells the case when the call reached the transport (`before` the send, or
 * `after` it), and holds the call there until the case releases it: the case orders a cancel
 * against the send by what has happened, not by a number of turns.
 */
function holdingAt(where: 'before' | 'after') {
  const reached = deferred<void>()
  const held = deferred<void>()
  const hold = async () => {
    reached.resolve()
    await held.promise
  }
  return {
    reached: reached.promise,
    release: () => held.resolve(),
    callGate: where === 'before' ? { before: hold } : { after: hold },
  }
}

describe('cancel reads the in-flight table only (SPEC S2)', () => {
  it('answers unknown to another principal and to another tenant on the same correlation key, and asks no port', async () => {
    const hold = holdingAt('after')
    const { p, digest } = await arranged({ kind: 'silent' }, { callGate: hold.callGate })
    const { services: s } = services(p)
    const call = s.invoker.invoke(alice, request(digest))
    await hold.reached
    const asked = portCalls(p)
    expect(await s.invoker.cancel(bob, c1)).toBe('unknown')
    expect(await s.invoker.cancel(mallory, c1)).toBe('unknown')
    expect(await s.invoker.cancel(aliceAway, c1)).toBe('unknown')
    expect(portCalls(p)).toEqual(asked)
    expect(p.cancels()).toBe(0)
    expect(await s.invoker.cancel(alice, c1)).toBe('signalled')
    hold.release()
    expect(await call).toEqual(ABANDONED)
    await settled()
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

describe('a cancel before the send (SPEC S2, MC-16 steps 2–8)', () => {
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

  it('step 8: at whichever microtask the cancel lands, the transport is never called with a stop signal that fired', async () => {
    // The cancel lands k microtasks after the invoke, for every k up to the one at which the call
    // has concluded already (the cancel answers no-call-in-flight). The last wait of the send
    // order and `transport.call` are a few microtasks apart; a stop that lands in between must
    // keep the call off the transport, not be left to the transport's own T5 answer.
    const LIMIT = 400
    let concluded = false
    for (let k = 0; k < LIMIT && !concluded; k += 1) {
      const { p, digest } = await arranged(completed([text('hi')]))
      const stopsSeen: boolean[] = []
      const transports = reshapedTransports(p.ports.transports, transport => ({
        call(request, signal, observe) {
          stopsSeen.push(signal.aborted)
          return transport.call(request, signal, observe)
        },
      }))
      const { services: s } = services({ ...p, ports: { ...p.ports, transports } })
      const call = s.invoker.invoke(alice, request(digest))
      for (let i = 0; i < k; i += 1) await Promise.resolve()
      const answer = await s.invoker.cancel(alice, c1)
      const result = await call
      expect(stopsSeen, `k=${k}: transport.call entered with the stop fired`).not.toContain(true)
      if (result.kind === 'not-sent') {
        expect(result.reason, `k=${k}`).toEqual({ kind: 'cancelled' })
        expect(p.requests('tools/call'), `k=${k}`).toHaveLength(0)
      }
      concluded = answer === 'no-call-in-flight'
    }
    expect(concluded).toBe(true)
  })
})

describe('a cancel after the send (SPEC S2, MC-16 step 11)', () => {
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
    const hold = holdingAt('after')
    const { p, digest } = await arranged(completed([text('hi')]), { callGate: hold.callGate })
    const { services: s } = services(p)
    const call = s.invoker.invoke(alice, request(digest))
    await hold.reached
    expect(p.requests('tools/call')).toHaveLength(1)
    expect(await s.invoker.cancel(alice, c1)).toBe('signalled')
    hold.release()
    expect(await call).toEqual(ABANDONED)
    await settled()
    expect(p.cancels()).toBe(1)
  })

  it('that races the send, which the transport then refuses, is a cancel before the send: nothing is lost', async () => {
    const hold = holdingAt('before')
    const { p, digest } = await arranged(completed([text('hi')]), { callGate: hold.callGate })
    const { services: s } = services(p)
    const call = s.invoker.invoke(alice, request(digest))
    await hold.reached
    expect(await s.invoker.cancel(alice, c1)).toBe('signalled')
    hold.release()
    expect(await call).toEqual({ kind: 'not-sent', reason: { kind: 'cancelled' } })
    expect(p.requests('tools/call')).toHaveLength(0)
    expect(p.cancels()).toBe(0)
    expect(await s.status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'ready' } },
    })
  })

  it('that races the send, followed by closeAll, which the transport then refuses: cancelled, not connection-unavailable; the stop signal is read before the shutdown (S2, S8)', async () => {
    const hold = holdingAt('before')
    const { p, digest } = await arranged(completed([text('hi')]), { callGate: hold.callGate })
    const { services: s } = services(p)
    const call = s.invoker.invoke(alice, request(digest))
    await hold.reached
    expect(await s.invoker.cancel(alice, c1)).toBe('signalled')
    const closing = s.connections.closeAll()
    hold.release()
    expect(await call).toEqual({ kind: 'not-sent', reason: { kind: 'cancelled' } })
    await closing
    expect(p.requests('tools/call')).toHaveLength(0)
    expect(p.cancels()).toBe(0)
  })

  it('that races the send, which the transport then refuses for an ended session, is cancelled too, but the connection is lost: the answer carries the mark that the transport is not usable any more (T1, S7)', async () => {
    const hold = holdingAt('before')
    const base = await arranged(completed([text('hi')]), { callGate: hold.callGate })
    // The scripted transport answers a fired signal with an unmarked connection-unavailable (T5);
    // this one reports an ended legacy session instead, marked as the decision layer marks it.
    const transports = reshapedTransports(base.p.ports.transports, transport => ({
      async call(request, signal, observe) {
        await transport.call(request, signal, observe)
        return { failure: { kind: 'not-sent', cause: 'session-ended', unusable: 'session-ended' } }
      },
    }))
    const { services: s } = services({ ...base.p, ports: { ...base.p.ports, transports } })
    const call = s.invoker.invoke(alice, request(base.digest))
    await hold.reached
    expect(await s.invoker.cancel(alice, c1)).toBe('signalled')
    hold.release()
    expect(await call).toEqual({ kind: 'not-sent', reason: { kind: 'cancelled' } })
    expect(base.p.cancels()).toBe(0)
    expect(await s.status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'lost', reason: 'session-ended' } },
    })
  })

  it('with the caller abort too tells the peer once only', async () => {
    const hold = holdingAt('after')
    const { p, digest } = await arranged({ kind: 'silent' }, { callGate: hold.callGate })
    const { services: s } = services(p)
    const controller = new AbortController()
    const call = s.invoker.invoke(alice, request(digest, controller.signal))
    await hold.reached
    expect(await s.invoker.cancel(alice, c1)).toBe('signalled')
    controller.abort()
    hold.release()
    expect(await call).toEqual(ABANDONED)
    await settled()
    expect(p.cancels()).toBe(1)
  })
})

const CANCELLED = { kind: 'not-sent', reason: { kind: 'cancelled' } }

/** `n` turns of the event loop: a bound on how long an answer may take once nothing is awaited. */
async function turns(n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) await settled()
}

/** The result of `call` once it settled, else `pending`: the test reads it after some turns. */
function tracked(call: Promise<InvokeResult>) {
  let answer: InvokeResult | 'pending' = 'pending'
  const done = call.then(result => {
    answer = result
  })
  return { read: () => answer, done }
}

describe('one stop signal from the reservation on (SPEC S2, MC-16 step 2)', () => {
  it.each(['cancel', 'abort'] as const)(
    'after the send, a %s does not wait for cancelRequest: the call answers unknown (abandoned) within a few turns',
    async how => {
      const { p, digest } = await arranged({ kind: 'silent' })
      let hanging = 0
      const transports = reshapedTransports(p.ports.transports, () => ({
        cancelRequest: () => {
          hanging += 1
          return never()
        },
      }))
      const { services: s } = services({ ...p, ports: { ...p.ports, transports } })
      const controller = new AbortController()
      const call = tracked(s.invoker.invoke(alice, request(digest, controller.signal)))
      await settled()
      expect(p.requests('tools/call')).toHaveLength(1)
      if (how === 'cancel') expect(await s.invoker.cancel(alice, c1)).toBe('signalled')
      else controller.abort()
      await turns(5)
      expect(call.read()).toEqual(ABANDONED)
      expect(hanging).toBe(1)
      expect(await s.invoker.cancel(alice, c1)).toBe('no-call-in-flight')
      await call.done
    },
  )

  it('a cancel while the gate is asked, followed by a refusing step, answers cancelled, and the key has ended', async () => {
    const { p } = await arranged(completed([text('hi')]))
    const stalled = stallingEligibility(p.eligibility, 1)
    const { services: s } = services({ ...p, ports: { ...p.ports, eligibility: stalled.port } })
    // The expected definition is stale: step 5 would refuse with definition-changed.
    const stale = digestDefinition({ name: READ, definition: jsonOf({ name: 'read', v: 2 }) })
    const call = s.invoker.invoke(alice, request(stale))
    await settled()
    expect(stalled.calls()).toBe(1)
    expect(await s.invoker.cancel(alice, c1)).toBe('signalled')
    stalled.gate.resolve()
    expect(await call).toEqual(CANCELLED)
    expect(p.requests('tools/call')).toHaveLength(0)
    expect(await s.invoker.cancel(alice, c1)).toBe('no-call-in-flight')
  })

  it('a cancel the call answers signalled, at whichever microtask it lands, makes the call answer cancelled, not the setting defect that refuses it in the same turn', async () => {
    // No connect-timeout and no connectBound: step 4 refuses with config-missing in the same
    // synchronous run as the gate's answer. The cancel lands k microtasks after the invoke; one
    // k falls between the gate's answer and the resumption of the wait, where only the look at
    // the stop signal after the wait tells the two apart.
    const LIMIT = 400
    let concluded = false
    for (let k = 0; k < LIMIT && !concluded; k += 1) {
      const p = peer({
        listing: { '': listing([{ name: 'read' }]) },
        calls: { read: completed([]) },
      })
      adoptStdio(p, files, { settings: { connectTimeout: { kind: 'absent' } } })
      await storedRecord(p, anonymousKey, ['read'])
      const { services: s } = services(p)
      const digest = digestDefinition({ name: READ, definition: jsonOf({ name: 'read' }) })
      const call = s.invoker.invoke(alice, request(digest))
      for (let i = 0; i < k; i += 1) await Promise.resolve()
      const answer = await s.invoker.cancel(alice, c1)
      const result = await call
      if (answer === 'signalled') expect(result, `k=${k}`).toEqual(CANCELLED)
      else
        expect(result, `k=${k}`).toEqual({
          kind: 'not-sent',
          reason: { kind: 'config-missing', item: 'connect-timeout' },
        })
      concluded = answer !== 'signalled'
    }
    expect(concluded).toBe(true)
  })

  it.each(['cancel', 'abort'] as const)(
    'a store read that never answers: a %s ends the wait, the call answers cancelled, and the key has ended',
    async how => {
      const { p, digest } = await arranged(completed([text('hi')]))
      const store = { ...p.store, read: () => never<never>() }
      const { services: s } = services({ ...p, ports: { ...p.ports, store } })
      const controller = new AbortController()
      const call = tracked(s.invoker.invoke(alice, request(digest, controller.signal)))
      await turns(2)
      expect(call.read()).toBe('pending')
      if (how === 'cancel') expect(await s.invoker.cancel(alice, c1)).toBe('signalled')
      else controller.abort()
      await turns(5)
      expect(call.read()).toEqual(CANCELLED)
      expect(p.requests('tools/call')).toHaveLength(0)
      expect(await s.invoker.cancel(alice, c1)).toBe('no-call-in-flight')
      await call.done
    },
  )

  it.each(['cancel', 'abort'] as const)(
    'while the build is under way, a %s answers the call cancelled at once; the build goes on for the key and nothing is sent',
    async how => {
      const { p, digest } = await arranged(completed([text('hi')]))
      const stalled = stallingLanding(p.landing)
      const { services: s } = services({ ...p, ports: { ...p.ports, landing: stalled.port } })
      const controller = new AbortController()
      const call = tracked(s.invoker.invoke(alice, request(digest, controller.signal)))
      await settled()
      expect(stalled.calls()).toBe(1)
      if (how === 'cancel') expect(await s.invoker.cancel(alice, c1)).toBe('signalled')
      else controller.abort()
      await turns(5)
      expect(call.read()).toEqual(CANCELLED)
      expect(await s.invoker.cancel(alice, c1)).toBe('no-call-in-flight')
      stalled.gate.resolve()
      await turns(5)
      expect(p.requests('tools/call')).toHaveLength(0)
      expect(p.opens()).toBe(1)
      expect(await s.status.inspect(alice, files)).toMatchObject({
        ok: { connection: { kind: 'ready' } },
      })
      await call.done
    },
  )

  it('a signal that fired before the call starts no wait: no port is asked, the call answers cancelled', async () => {
    const { p, digest } = await arranged(completed([text('hi')]))
    const { services: s } = services(p)
    const asked = portCalls(p)
    const controller = new AbortController()
    controller.abort()
    expect(await s.invoker.invoke(alice, request(digest, controller.signal))).toEqual(CANCELLED)
    expect(portCalls(p)).toEqual(asked)
    expect(p.opens()).toBe(0)
    expect(await s.invoker.cancel(alice, c1)).toBe('no-call-in-flight')
  })
})
