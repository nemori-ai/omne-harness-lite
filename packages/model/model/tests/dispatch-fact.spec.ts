import { describe, expect, it } from 'vitest'
import type { Termination } from '@omne-harness/model-contract'
import { dispatchFactOf, dispatchOutcome } from '@omne-harness/model/commands'
import { fixture } from './memory-fixture.ts'

type Call = Parameters<typeof dispatchFactOf>[0]
type Dispatch = Parameters<typeof dispatchFactOf>[1]

const f = fixture()
const WINDOW = { tokens: '128000', compactionTriggerPercent: '85' }
const consumer = { owner: 'agent', work: 'run/execution/step-1', position: 'p', purpose: 'main' }

function callOf(request: unknown): Call {
  return { state: { call: f.admit.call, consumer }, request } as unknown as Call
}

function dispatchOf(record: Record<string, unknown>, logicalTerminal: Termination | null = null) {
  return {
    record: {
      dispatch: 'mdisp_fact',
      supplier: f.admit.request.suppliers[0],
      send: 'started',
      terminal: null,
      account: null,
      materialization: null,
      ...record,
    },
    logicalTerminal,
  } as unknown as Dispatch
}

describe('the fact of one dispatch', () => {
  it('takes the consumer, the profile and window of the request, the moments, the retries and the account', () => {
    const instants = {
      prepared: '2026-11-19T08:00:00.000Z',
      sent: '2026-11-19T08:00:00.010Z',
      responseStarted: null,
      firstContent: null,
      ended: null,
    }
    const fact = dispatchFactOf(
      callOf({ ...f.admit.request, contextWindow: WINDOW }),
      dispatchOf({ instants, connectRetries: ['connect-failed', 'connect-timeout'] }),
    )
    expect(fact).toEqual({
      call: f.admit.call,
      dispatch: 'mdisp_fact',
      consumer,
      profile: f.admit.request.profile,
      supplier: f.admit.request.suppliers[0],
      contextWindow: WINDOW,
      instants,
      send: 'sent',
      outcome: { kind: 'pending' },
      connectRetries: 2,
      account: null,
      costLookup: 'not-needed',
      effort: { value: null, basis: 'provider' },
    })
  })

  it('takes the reasoning effort the request carried, and where it came from', () => {
    const effortOf = (parameters: readonly unknown[]) =>
      dispatchFactOf(callOf({ ...f.admit.request, parameters }), dispatchOf({})).effort
    expect(effortOf([{ kind: 'reasoning-effort', value: 'high', scale: 'unified' }])).toEqual({
      value: 'high',
      basis: 'selection',
    })
    const preferred = {
      kind: 'reasoning-effort',
      value: 'medium',
      scale: 'unified',
      basis: 'preference',
    }
    expect(effortOf([{ kind: 'temperature', value: 1 }, preferred])).toEqual({
      value: 'medium',
      basis: 'preference',
    })
    expect(effortOf([{ kind: 'reasoning-effort', value: 'max' }])).toEqual({
      value: 'max',
      basis: 'selection',
    })
    expect(effortOf([{ kind: 'temperature', value: 1 }])).toEqual({
      value: null,
      basis: 'provider',
    })
  })

  it('says no profile and no window once the call released its request, and no moment for an older record', () => {
    const fact = dispatchFactOf(callOf(null), dispatchOf({ send: 'prepared' }))
    expect('effort' in fact).toBe(false)
    expect(fact.profile).toBeNull()
    expect(fact.contextWindow).toBeNull()
    expect(fact.send).toBe('not-sent')
    expect(fact.connectRetries).toBe(0)
    expect(fact.instants).toEqual({
      prepared: null,
      sent: null,
      responseStarted: null,
      firstContent: null,
      ended: null,
    })
  })

  it('takes the logical terminal over the recorded one, and maps each send state', () => {
    const lost: Termination = {
      kind: 'failed',
      fault: { cause: 'stream-lost', diagnostic: 'x', upstreamStatus: null },
    }
    const fact = dispatchFactOf(
      callOf(f.admit.request),
      dispatchOf({ terminal: { kind: 'completed', reason: 'stop' }, send: 'unknown' }, lost),
    )
    expect(fact.outcome).toEqual({ kind: 'failed', cause: 'stream-lost', upstreamStatus: null })
    expect(fact.send).toBe('unknown')
    expect(dispatchFactOf(callOf(f.admit.request), dispatchOf({ send: 'not-sent' })).send).toBe(
      'not-sent',
    )
  })

  it('a prepared dispatch whose request is materialized may already be out: its send is unknown, never not-sent', () => {
    const materialization = { receipt: { digest: 'sha256:body' }, source: { owner: 'model' } }
    expect(
      dispatchFactOf(callOf(f.admit.request), dispatchOf({ send: 'prepared', materialization }))
        .send,
    ).toBe('unknown')
  })
})

describe('the outcome of a terminal', () => {
  it.each([
    [null, { kind: 'pending' }],
    [
      { kind: 'completed', reason: 'limit' },
      { kind: 'completed', reason: 'limit' },
    ],
    [{ kind: 'interrupted', control: 'mop_x' }, { kind: 'interrupted' }],
    [
      {
        kind: 'failed',
        fault: { cause: 'upstream-unavailable', diagnostic: 'SECRET', upstreamStatus: '503' },
      },
      { kind: 'failed', cause: 'upstream-unavailable', upstreamStatus: '503' },
    ],
  ])('maps %j without its diagnostic', (terminal, outcome) => {
    expect(dispatchOutcome(terminal as Termination | null)).toEqual(outcome)
  })
})
