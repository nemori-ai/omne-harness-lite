// 测试用的线上客户端：真 TLS 连接（测试根证书核中心证书与主机名）、真 Unix 套接字。请求字节由测试自己拼（HTTP/1.1 报文层）。
import { readFileSync } from 'node:fs'
import { type Socket, connect as netConnect, createServer } from 'node:net'
import { join } from 'node:path'
import { connect as tlsConnect, type TLSSocket } from 'node:tls'

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'tls')

/** 测试证书：自签根与它签的 `localhost` 叶子（入口层包测试夹具的同一份副本）；`chain.pem` = 叶子 + 根。 */
export const TLS_FIXTURES = {
  caPem: readFileSync(join(FIXTURES, 'ca.pem'), 'utf8'),
  chainPem: readFileSync(join(FIXTURES, 'chain.pem'), 'utf8'),
  leafKeyPem: readFileSync(join(FIXTURES, 'leaf.key'), 'utf8'),
} as const

export const REGISTER = 'composition.account-registration/v1#S-8'
export const LOGIN = 'capability.account-identity/v2#S-15'
export const HEALTH = 'composition.governance-center-entry/v1#S-18'

/** 取一个此刻空闲的本机端口。 */
export async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  await new Promise<void>(resolve => server.close(() => resolve()))
  if (address === null || typeof address === 'string') throw new Error('no port')
  return address.port
}

/** 一份 HTTP/1.1 请求：一律 POST、以 Content-Length 成帧。 */
export function httpRequest(body: string): Buffer {
  const bytes = Buffer.from(body, 'utf8')
  return Buffer.concat([
    Buffer.from(
      `POST / HTTP/1.1\r\nHost: center.example.invalid\r\nContent-Length: ${String(bytes.length)}\r\n\r\n`,
      'latin1',
    ),
    bytes,
  ])
}

export function envelope(operation: string, payload: Record<string, unknown>): string {
  return JSON.stringify({ protocolVersion: '1', operation, payload })
}

export const PUBLIC_HEALTH_BODY = JSON.stringify({ operation: HEALTH })

export interface Exchange {
  readonly bytes: Buffer
  readonly error: string | undefined
  /** TLS 握手是否完成（Unix 套接字恒为 true）。 */
  readonly connected: boolean
}

function collect(
  socket: Socket | TLSSocket,
  request: Buffer,
  timeoutMs: number,
): Promise<Exchange> {
  return new Promise(resolve => {
    const parts: Buffer[] = []
    let error: string | undefined
    let connected = false
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ bytes: Buffer.concat(parts), error, connected })
    }
    const timer = setTimeout(() => {
      socket.destroy()
      done()
    }, timeoutMs)
    socket.on('data', chunk => parts.push(chunk as Buffer))
    socket.on('error', err => {
      error = (err as NodeJS.ErrnoException).code ?? err.name
    })
    socket.on('close', done)
    const write = () => {
      connected = true
      if (!socket.destroyed) socket.end(request)
    }
    if ('encrypted' in socket) socket.once('secureConnect', write)
    else socket.once('connect', write)
  })
}

/** 经 TLS 发一个请求，收到对端关闭为止。 */
export function tlsExchange(port: number, body: string, timeoutMs = 10_000): Promise<Exchange> {
  const socket = tlsConnect({
    host: '127.0.0.1',
    port,
    servername: 'localhost',
    ca: TLS_FIXTURES.caPem,
    minVersion: 'TLSv1.3',
  })
  return collect(socket, httpRequest(body), timeoutMs)
}

/** 经本机套接字发一个请求（运维面：任何请求都答完整体检）。 */
export function unixExchange(path: string, timeoutMs = 10_000): Promise<Exchange> {
  const socket = netConnect({ path, allowHalfOpen: true })
  return collect(socket, httpRequest('{}'), timeoutMs)
}

/** 答复的体（按 JSON 读）；没有答复 ⇒ undefined。 */
export function bodyOf(exchange: Exchange): unknown {
  const index = exchange.bytes.indexOf('\r\n\r\n')
  if (index < 0) return undefined
  return JSON.parse(exchange.bytes.subarray(index + 4).toString('utf8')) as unknown
}

/** 端口此刻有没有人在听（TCP 连得上）。 */
export function portAccepting(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = netConnect({ host: '127.0.0.1', port })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

/** 占住一个端口（入口层端口被占的演练），返回释放函数。 */
export async function occupyPort(port: number): Promise<() => Promise<void>> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  return () => new Promise<void>(resolve => server.close(() => resolve()))
}
