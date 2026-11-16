import { Agent, type RequestOptions } from 'node:https'
import type { Duplex } from 'node:stream'

export const CONNECTION_CANCEL: unique symbol = Symbol('pi-ai-transport.connection-cancel')

const PROXY_ENV_SINCE = Object.freeze({ major: 24, minor: 5 })

export function supportsProxyEnv(version: string): boolean {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version)
  if (match === null) return false
  const major = Number(match[1])
  const minor = Number(match[2])
  return (
    major > PROXY_ENV_SINCE.major ||
    (major === PROXY_ENV_SINCE.major && minor >= PROXY_ENV_SINCE.minor)
  )
}

type ConnectionCallback = (err: Error | null, stream: Duplex) => void

export class PoolAgent extends Agent {
  override createConnection(
    options: RequestOptions,
    callback?: ConnectionCallback,
  ): Duplex | null | undefined {
    const cancel: unknown = Reflect.get(options, CONNECTION_CANCEL)
    const signal = cancel instanceof AbortSignal ? cancel : undefined
    let socket: Duplex | null | undefined
    let handedOver = false
    const onCancel = (): void => {
      if (handedOver || socket == null || this.isPooled(socket)) return
      socket.on('error', noop)
      socket.destroy(new ConnectionCancelledError())
    }
    const onCreated: ConnectionCallback = (err, stream) => {
      handedOver = true
      signal?.removeEventListener('abort', onCancel)
      if (err !== null) discard(stream)
      callback?.(err, stream)
    }
    socket = super.createConnection(options, onCreated)
    if (signal !== undefined && !handedOver) {
      if (signal.aborted) onCancel()
      else signal.addEventListener('abort', onCancel, { once: true })
    }
    return socket
  }

  private isPooled(socket: Duplex): boolean {
    return [this.sockets, this.freeSockets].some(pool =>
      Object.values(pool).some(list => list?.some(entry => entry === socket) === true),
    )
  }
}

function discard(socket: Duplex | undefined): void {
  if (socket === undefined) return
  socket.on('error', noop)
  socket.destroy()
}

class ConnectionCancelledError extends Error {
  constructor() {
    super('the exchange stopped while its connection was being built')
    this.name = 'ConnectionCancelledError'
  }
}

function noop(): void {}
