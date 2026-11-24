export class PortClosedError extends Error {
  override name = 'PortClosedError'
  constructor(message = 'The port closed before the request completed') {
    super(message)
  }
}

export type PortBusyBudget = 'requests' | 'unread'

export class PortBusyError extends Error {
  override name = 'PortBusyError'
  readonly budget: PortBusyBudget
  readonly maxConcurrentRequests: number
  constructor(
    maxConcurrentRequests: number,
    budget: PortBusyBudget = 'requests',
    maxQueuedBytes?: number,
  ) {
    super(
      budget === 'requests'
        ? `${maxConcurrentRequests} requests are already in flight on this port`
        : `More than ${maxQueuedBytes} bytes of finished responses are unread on this port`,
    )
    this.budget = budget
    this.maxConcurrentRequests = maxConcurrentRequests
  }
}

export interface RemoteFetchErrorOptions {
  code?: string | undefined
  remoteName?: string | undefined
}

export class RemoteFetchError extends Error {
  override name = 'RemoteFetchError'
  readonly code: string | undefined
  readonly remoteName: string | undefined
  constructor(message: string, { code, remoteName }: RemoteFetchErrorOptions = {}) {
    super(message)
    this.code = code
    this.remoteName = remoteName
  }
}

export type TimeoutPhase = 'headers' | 'idle' | 'total'

export class PortFetchTimeoutError extends Error {
  override name = 'TimeoutError'
  readonly phase: TimeoutPhase
  constructor(timeoutMs: number, phase: TimeoutPhase = 'total') {
    super(
      phase === 'headers'
        ? `The response headers did not arrive within ${timeoutMs} ms`
        : phase === 'idle'
          ? `No response body data arrived for ${timeoutMs} ms`
          : `The request did not complete within ${timeoutMs} ms`,
    )
    this.phase = phase
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
