// A real loopback `ServerResponse` held open for a unit case, with the client side in hand: the
// body the client received so far, the end of the response, and a disconnect before any byte.
import {
  createServer,
  request,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'

export type HeldResponse = Readonly<{
  res: ServerResponse
  /** The body text the client has received so far. */
  received(): string
  /** Resolves when the client saw the response end or the connection close. */
  ended: Promise<void>
  /** Destroys the client side and resolves when the server response saw `close`. */
  disconnect(): Promise<void>
  /** Closes the server and every connection. */
  dispose(): Promise<void>
}>

export async function holdResponse(): Promise<HeldResponse> {
  let server: Server | undefined
  const held = new Promise<ServerResponse>(resolve => {
    server = createServer((_req, res) => resolve(res))
  })
  const listening = server as Server
  const port = await new Promise<number>(resolve => {
    listening.listen(0, '127.0.0.1', () => {
      const address = listening.address()
      resolve(typeof address === 'object' && address !== null ? address.port : 0)
    })
  })
  const chunks: string[] = []
  let resolveEnded: () => void = () => {}
  const ended = new Promise<void>(resolve => {
    resolveEnded = resolve
  })
  const req = request(
    { host: '127.0.0.1', port, method: 'POST', path: '/' },
    (reply: IncomingMessage) => {
      reply.setEncoding('utf8')
      reply.on('data', (chunk: string) => chunks.push(chunk))
      reply.on('end', () => resolveEnded())
      reply.on('close', () => resolveEnded())
    },
  )
  req.on('error', () => resolveEnded())
  req.flushHeaders()
  const res = await held
  return {
    res,
    received: () => chunks.join(''),
    ended,
    disconnect: () => {
      const closed = new Promise<void>(resolve => {
        if (res.destroyed) resolve()
        else res.once('close', () => resolve())
      })
      req.destroy()
      return closed
    },
    dispose: () =>
      new Promise<void>(resolve => {
        listening.closeAllConnections()
        listening.close(() => resolve())
      }),
  }
}
