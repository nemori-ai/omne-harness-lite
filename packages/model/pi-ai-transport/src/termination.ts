import type { ModelFault } from '@omne-harness/model-contract'
import type { TransportTermination } from '@omne-harness/model-contract/provider'
import type { FrameFailure } from './frames.ts'
import type { SseFailureReason } from './sse.ts'

export type SendEnd =
  | Readonly<{ kind: 'decoded'; termination: TransportTermination | null }>
  | Readonly<{ kind: 'decoder-fault'; fault: ModelFault }>
  | Readonly<{ kind: 'http-error'; status: number }>
  | Readonly<{ kind: 'connect-failed'; timeout: boolean }>
  | Readonly<{ kind: 'body-lost' }>
  | Readonly<{ kind: 'sse-failed'; reason: SseFailureReason }>
  | Readonly<{ kind: 'frame-failed'; reason: FrameFailure }>
  | Readonly<{ kind: 'stopped' }>
  | Readonly<{ kind: 'credential-missing' }>
  | Readonly<{ kind: 'credential-unusable' }>

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
