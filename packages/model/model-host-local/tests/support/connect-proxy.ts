// Test support of the recorder: a local HTTP proxy that tunnels every CONNECT to its target and
// records the target. It never terminates TLS. The pi transport keeps its own proxy with more
// modes; tests do not import across members, so this one only tunnels, which is what the
// recorder's path through a proxy needs.
import { createServer } from 'node:http'
import { connect } from 'node:net'
import type { Duplex } from 'node:stream'

export type TunnelProxy = Readonly<{
  /** `http://127.0.0.1:<port>`, without credentials. */
  url: URL
  /** The `host:port` of every CONNECT received so far, in arrival order. */
  connects: readonly string[]
  /** Destroys every connection and closes the listener. */
  close(): Promise<void>
}>

export async function startTunnelProxy(): Promise<TunnelProxy> {
  const connects: string[] = []
  const open = new Set<Duplex>()
  const keep = (socket: Duplex) => {
    open.add(socket)
    socket.on('close', () => open.delete(socket))
    socket.on('error', () => socket.destroy())
  }
  const server = createServer((_req, res) => {
    res.writeHead(405).end() // Only CONNECT is a proxy request here.
  })
  server.on('connect', (req, client: Duplex) => {
    const target = req.url ?? ''
    connects.push(target)
    keep(client)
    const separator = target.lastIndexOf(':')
    const upstream = connect(Number(target.slice(separator + 1)), target.slice(0, separator))
    keep(upstream)
    upstream.on('connect', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      upstream.pipe(client)
      client.pipe(upstream)
    })
    upstream.on('close', () => client.destroy())
    client.on('close', () => upstream.destroy())
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('proxy has no TCP port')
  return {
    url: new URL(`http://127.0.0.1:${address.port}`),
    connects,
    close: async () => {
      for (const socket of open) socket.destroy()
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error === undefined ? resolve() : reject(error))),
      )
    },
  }
}
