import { createServer } from 'node:http'
import { connect } from 'node:net'
import type { Duplex } from 'node:stream'

export type TunnelProxy = Readonly<{
  url: URL
  connects: readonly string[]
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
    res.writeHead(405).end()
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
