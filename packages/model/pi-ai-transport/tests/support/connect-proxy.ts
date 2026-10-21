// Test support for the proxy seam: a local HTTP proxy that answers CONNECT in one of three ways and
// records the target of every CONNECT it receives. It never terminates TLS: a tunnel carries the
// client's TLS session to the target unchanged.
import { createServer, type IncomingMessage } from 'node:http'
import { connect, Socket } from 'node:net'
import type { Duplex } from 'node:stream'

/**
 * - `tunnel`: connects to the requested target, answers 200 and relays bytes both ways.
 * - `refuse-then-reset`: answers 403, then resets the connection a moment later.
 * - `silent`: keeps the connection open and never answers.
 */
export type ProxyMode = 'tunnel' | 'refuse-then-reset' | 'silent'

/** The delay between the 403 and the reset: long enough that the client reads the 403 first. */
const RESET_DELAY_MS = 50

export interface ConnectProxy {
  /** `http://127.0.0.1:<port>`, without credentials. */
  readonly url: URL
  /** The `host:port` of every CONNECT received so far, in arrival order. */
  readonly connects: readonly string[]
  /** Tunnels whose target connection is open and answered 200. */
  tunnels(): number
  /** Connections this proxy has reset after a 403. */
  resets(): number
  /** Destroys every client and target connection and closes the listener. */
  close(): Promise<void>
}

export async function startConnectProxy(mode: ProxyMode): Promise<ConnectProxy> {
  const connects: string[] = []
  const open = new Set<Duplex>()
  let tunnels = 0
  let resets = 0
  const server = createServer((_req, res) => {
    res.writeHead(405).end() // Only CONNECT is a proxy request here.
  })
  server.on('connect', (req: IncomingMessage, client: Duplex) => {
    connects.push(req.url ?? '')
    keep(open, client)
    switch (mode) {
      case 'tunnel':
        tunnel(req.url ?? '', client, open, () => {
          tunnels += 1
        })
        return
      case 'refuse-then-reset':
        client.write('HTTP/1.1 403 Forbidden\r\ncontent-length: 0\r\n\r\n')
        setTimeout(() => {
          if (client instanceof Socket) client.resetAndDestroy()
          else client.destroy()
          resets += 1
        }, RESET_DELAY_MS)
        return
      case 'silent':
        return
      default: {
        const _exhaustive: never = mode
        return _exhaustive
      }
    }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('proxy has no TCP port')
  return {
    url: new URL(`http://127.0.0.1:${address.port}`),
    connects,
    tunnels: () => tunnels,
    resets: () => resets,
    close: async () => {
      for (const socket of open) socket.destroy()
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error === undefined ? resolve() : reject(error))),
      )
    },
  }
}

function tunnel(target: string, client: Duplex, open: Set<Duplex>, onOpen: () => void): void {
  const [host, port] = splitTarget(target)
  const upstream = connect(port, host, () => {
    onOpen()
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    upstream.pipe(client)
    client.pipe(upstream)
  })
  keep(open, upstream)
  upstream.once('close', () => client.destroy())
  client.once('close', () => upstream.destroy())
}

function splitTarget(target: string): [string, number] {
  const colon = target.lastIndexOf(':')
  const port = Number(target.slice(colon + 1))
  if (colon === -1 || !Number.isInteger(port)) throw new Error('CONNECT target without a port')
  return [target.slice(0, colon), port]
}

function keep(open: Set<Duplex>, socket: Duplex): void {
  open.add(socket)
  socket.on('error', () => {})
  socket.once('close', () => open.delete(socket))
}
