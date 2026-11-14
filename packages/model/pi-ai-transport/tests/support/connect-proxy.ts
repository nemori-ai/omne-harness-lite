import { createServer, type IncomingMessage } from 'node:http'
import { connect, Socket } from 'node:net'
import type { Duplex } from 'node:stream'

export type ProxyMode = 'tunnel' | 'refuse-then-reset' | 'silent' | 'close'

const RESET_DELAY_MS = 50

export interface ConnectProxy {
  readonly url: URL
  readonly connects: readonly string[]
  tunnels(): number
  resets(): number
  close(): Promise<void>
}

export async function startConnectProxy(mode: ProxyMode): Promise<ConnectProxy> {
  const connects: string[] = []
  const open = new Set<Duplex>()
  let tunnels = 0
  let resets = 0
  const server = createServer((_req, res) => {
    res.writeHead(405).end()
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
      case 'close':
        client.end()
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
