// How one started send ends: a pure mapping from what the exchange and the decoder gave to the
// termination of the fact stream. No response header and no error body enters a termination.
import type { ModelFault } from '@omne-harness/model-contract'
import type { TransportTermination } from '@omne-harness/model-contract/provider'
import type { FrameFailure } from './frames.ts'
import type { SseFailureReason } from './sse.ts'

/** Every way a started send ends, as the fact stream sees it. */
export type SendEnd =
  /** The body reached its end and the decoder ended; `termination` is the decoder's own, if it gave one. */
  | Readonly<{ kind: 'decoded'; termination: TransportTermination | null }>
  /** The decoder answered a fault for a frame or for the end of the body. */
  | Readonly<{ kind: 'decoder-fault'; fault: ModelFault }>
  /** A response with a status outside 2xx; nothing was followed. */
  | Readonly<{ kind: 'http-error'; status: number }>
  /** The connection closed before a response, or the connect timeout ended it. */
  | Readonly<{ kind: 'connect-failed'; timeout: boolean }>
  /** The 2xx body ended before its end without a local stop. */
  | Readonly<{ kind: 'body-lost' }>
  | Readonly<{ kind: 'sse-failed'; reason: SseFailureReason }>
  | Readonly<{ kind: 'frame-failed'; reason: FrameFailure }>
  /** The signal, the close of the send or the close of the network resources stopped it, after the physical stop or before any send. */
  | Readonly<{ kind: 'stopped' }>
  /** The slot held no credential: nothing was sent. */
  | Readonly<{ kind: 'credential-missing' }>
  /** The credential cannot be written in an HTTP header: nothing was sent. */
  | Readonly<{ kind: 'credential-unusable' }>

/** The termination of the fact stream for the end of a send. */
export function terminationOf(end: SendEnd): TransportTermination {
  switch (end.kind) {
    case 'decoded':
      return end.termination ?? failed('upstream-protocol', 'no-termination', null)
    case 'decoder-fault':
      return { kind: 'failed', fault: end.fault }
    case 'http-error':
      return failed(causeOfStatus(end.status), `http-${end.status}`, String(end.status))
    case 'connect-failed':
      return failed(
        'upstream-unavailable',
        end.timeout ? 'connect-timeout' : 'connect-failed',
        null,
      )
    case 'body-lost':
      return failed('stream-lost', 'response-body-lost', null)
    case 'sse-failed':
      return failed('upstream-protocol', `sse-${end.reason}`, null)
    case 'frame-failed':
      return failed('upstream-protocol', `frame-${end.reason}`, null)
    case 'stopped':
      return { kind: 'interrupted', stop: 'confirmed' }
    case 'credential-missing':
      return failed('credential', 'credential-not-provided', null)
    case 'credential-unusable':
      return failed('credential', 'credential-not-a-header-value', null)
    default: {
      const _exhaustive: never = end
      return _exhaustive
    }
  }
}

export type StatusCause =
  | 'credential'
  | 'upstream-unavailable'
  | 'input-rejected'
  | 'upstream-protocol'

/** 401 and 403: credential. 429 and 5xx: unavailable. Other 4xx: rejected input. 3xx and the rest: protocol. */
export function causeOfStatus(status: number): StatusCause {
  if (status === 401 || status === 403) return 'credential'
  if (status === 429 || (status >= 500 && status <= 599)) return 'upstream-unavailable'
  if (status >= 400 && status <= 499) return 'input-rejected'
  return 'upstream-protocol'
}

function failed(
  cause: StatusCause | 'stream-lost',
  diagnostic: string,
  upstreamStatus: string | null,
): TransportTermination {
  return { kind: 'failed', fault: { cause, diagnostic, upstreamStatus } }
}
