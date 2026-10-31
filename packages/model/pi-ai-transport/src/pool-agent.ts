import { Agent, type RequestOptions } from 'node:https'
import type { Duplex } from 'node:stream'

/**
 * The request option under which an exchange gives its connection-cancel signal to the pool. The
 * exchange aborts it when it destroys its request. Package-private: only http.ts sets it.
 */
export const CONNECTION_CANCEL: unique symbol = Symbol('pi-ai-transport.connection-cancel')

/** The first Node release whose `https.Agent` takes the `proxyEnv` option. */
const PROXY_ENV_SINCE = Object.freeze({ major: 24, minor: 5 })

/**
 * `true` when the Node version (`process.versions.node`, e.g. `26.12.0`) takes `proxyEnv`. An older
 * Node ignores the option without an error and connects directly. A version string that does not
 * parse is unsupported.
 */
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

/** The pool's callback, as Node declares it. On an error Node may still pass the socket. */
type ConnectionCallback = (err: Error | null, stream: Duplex) => void

/**
 * The socket pool of the network resources. It controls how a connection is built, on two points
 * that both apply only while Node builds a connection through a proxy:
 *
 * 1. The defect workaround. When the proxy answers CONNECT with a status other than 200, Node
 *    (`lib/https.js`, `establishTunnel` and `createConnection`) removes its error listener from the
 *    proxy socket and passes the error to the callback together with that socket, without destroying
 *    it. The pool's callback drops the socket. When the proxy then resets the connection, the socket
 *    emits `error` with no listener and the process crashes. This override destroys the socket first.
 *    Delete it when the engines floor reaches a Node release that destroys the socket itself.
 * 2. The cancel. While Node builds a connection through a proxy, the pool holds the socket and the
 *    request has none: `req.destroy()` only marks the request, and its `close` comes when Node hands
 *    it a socket or an error. That is after Node's tunnel timeout (the agent `timeout`) during
 *    CONNECT, and never while the TLS handshake through the tunnel stalls. So the exchange passes a
 *    signal under `CONNECTION_CANCEL`. When it fires before Node hands the request its socket, this
 *    override destroys the socket it returned with an error, and Node hands the request that error.
 *
 * Node passes the request options on to `createConnection` (`ClientRequest` to `addRequest` to
 * `createSocket`, each copying the own keys, symbols included). Node documents the options only as
 * connection details, not this pass-through. The slow proxy tests (tests/proxy.spec.ts) depend on
 * it: a stop or a connect timeout during CONNECT or the tunnel's TLS handshake fails them when the
 * signal stops reaching this method.
 *
 * Without a proxy, Node returns the connected socket at once, the pool hands it to the request in
 * the same call, and Node never calls the callback: neither point has an effect.
 */
export class PoolAgent extends Agent {
  override createConnection(
    options: RequestOptions,
    callback?: ConnectionCallback,
  ): Duplex | null | undefined {
    const cancel: unknown = Reflect.get(options, CONNECTION_CANCEL)
    const signal = cancel instanceof AbortSignal ? cancel : undefined
    let socket: Duplex | null | undefined
    let handedOver = false
    // The pool already counts a socket it took at once; only one that Node still builds is cancelled.
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

  /** The socket is in the documented `sockets` or `freeSockets` of this pool. */
  private isPooled(socket: Duplex): boolean {
    return [this.sockets, this.freeSockets].some(pool =>
      Object.values(pool).some(list => list?.some(entry => entry === socket) === true),
    )
  }
}

/** Destroys a socket that nobody listens to any more, so its late errors are not uncaught. */
function discard(socket: Duplex | undefined): void {
  if (socket === undefined) return
  socket.on('error', noop)
  socket.destroy()
}

/** Node hands this to the request whose connection was cancelled while it was being built. */
class ConnectionCancelledError extends Error {
  constructor() {
    super('the exchange stopped while its connection was being built')
    this.name = 'ConnectionCancelledError'
  }
}

function noop(): void {}
