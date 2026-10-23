import type { ModelFault, TransportTermination } from '@omne-harness/model-contract'
import { describe, expect, it } from 'vitest'
import { terminationOf, type SendEnd } from '../src/termination.ts'

type PlainCause = Exclude<ModelFault['cause'], 'input-over-limit' | 'replay-rejected'>

function failed(
  cause: PlainCause,
  diagnostic: string,
  upstreamStatus: string | null,
): TransportTermination {
  return { kind: 'failed', fault: { cause, diagnostic, upstreamStatus } }
}

describe('the termination of a send', () => {
  it('a decoded body ends with the termination of the decoder', () => {
    const termination: TransportTermination = { kind: 'completed', reason: 'stop' }
    expect(terminationOf({ kind: 'decoded', termination })).toBe(termination)
  })

  it('a decoded body without a termination of the decoder fails as upstream-protocol', () => {
    expect(terminationOf({ kind: 'decoded', termination: null })).toEqual(
      failed('upstream-protocol', 'no-termination', null),
    )
  })

  it('a fault of the decoder is the fault of the termination', () => {
    const fault: ModelFault = { cause: 'input-rejected', diagnostic: 'x', upstreamStatus: null }
    expect(terminationOf({ kind: 'decoder-fault', fault })).toEqual({ kind: 'failed', fault })
  })

  it.each([
    [401, 'credential'],
    [403, 'credential'],
    [429, 'upstream-unavailable'],
    [500, 'upstream-unavailable'],
    [503, 'upstream-unavailable'],
    [599, 'upstream-unavailable'],
    [400, 'input-rejected'],
    [404, 'input-rejected'],
    [413, 'input-rejected'],
    [499, 'input-rejected'],
    [301, 'upstream-protocol'],
    [302, 'upstream-protocol'],
    [308, 'upstream-protocol'],
    [101, 'upstream-protocol'],
  ] satisfies readonly (readonly [number, PlainCause])[])(
    'HTTP %i fails as %s with the status and nothing else of the response',
    (status, cause) => {
      expect(terminationOf({ kind: 'http-error', status })).toEqual(
        failed(cause, `http-${status}`, String(status)),
      )
    },
  )

  it.each([
    [false, 'connect-failed'],
    [true, 'connect-timeout'],
  ])(
    'a connection failure (timeout %s) fails as upstream-unavailable without a status',
    (timeout, diagnostic) => {
      expect(terminationOf({ kind: 'connect-failed', timeout })).toEqual(
        failed('upstream-unavailable', diagnostic, null),
      )
    },
  )

  it('a body lost before its end fails as stream-lost', () => {
    expect(terminationOf({ kind: 'body-lost' })).toEqual(
      failed('stream-lost', 'response-body-lost', null),
    )
  })

  it.each([
    [{ kind: 'sse-failed', reason: 'event-too-large' }, 'sse-event-too-large'],
    [{ kind: 'sse-failed', reason: 'unterminated' }, 'sse-unterminated'],
    [{ kind: 'frame-failed', reason: 'invalid-json' }, 'frame-invalid-json'],
    [{ kind: 'frame-failed', reason: 'event-after-end' }, 'frame-event-after-end'],
  ] satisfies readonly (readonly [SendEnd, string])[])(
    'a framing failure %o fails as upstream-protocol',
    (end, diagnostic) => {
      expect(terminationOf(end)).toEqual(failed('upstream-protocol', diagnostic, null))
    },
  )

  it('a stop is a confirmed interruption', () => {
    expect(terminationOf({ kind: 'stopped' })).toEqual({ kind: 'interrupted', stop: 'confirmed' })
  })

  it('a missing or unusable credential fails as credential without a status', () => {
    expect(terminationOf({ kind: 'credential-missing' })).toEqual(
      failed('credential', 'credential-not-provided', null),
    )
    expect(terminationOf({ kind: 'credential-unusable' })).toEqual(
      failed('credential', 'credential-not-a-header-value', null),
    )
  })
})
