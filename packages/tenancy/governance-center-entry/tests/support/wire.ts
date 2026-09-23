// 测试用的线上客户端：真 TLS 连接、真 Unix 套接字、原始 TCP；请求字节由测试自己拼（HTTP/1.1 报文层）。
import { readFileSync } from 'node:fs'
import { type Socket, connect as tcpConnect, createServer } from 'node:net'
import { join } from 'node:path'
import { connect as tlsConnect, type ConnectionOptions, type TLSSocket } from 'node:tls'

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'tls')

/** 测试证书：一张自签的根与它签的 `localhost` 叶子；`chain.pem` = 叶子 + 根；`stray.key` 与叶子不配。 */
export const TLS_FIXTURES = {
  caPem: readFileSync(join(FIXTURES, 'ca.pem'), 'utf8'),
  leafPem: readFileSync(join(FIXTURES, 'leaf.pem'), 'utf8'),
  chainPem: readFileSync(join(FIXTURES, 'chain.pem'), 'utf8'),
  leafKeyPem: readFileSync(join(FIXTURES, 'leaf.key'), 'utf8'),
  strayKeyPem: readFileSync(join(FIXTURES, 'stray.key'), 'utf8'),
} as const

/** 取一个此刻空闲的本机端口（测试里预先选好，再交给 config）。 */
export async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  await new Promise<void>(resolve => server.close(() => resolve()))
  if (address === null || typeof address === 'string') throw new Error('no port')
  return address.port
}

export interface RequestOptions {
  readonly method?: string
  readonly path?: string
  /** 额外的请求头行（不含 CR LF）；默认只有 Host 与 Content-Length。 */
  readonly headers?: readonly string[]
  readonly omitHost?: boolean
  readonly omitContentLength?: boolean
}

/** 拼一份 HTTP/1.1 请求报文：客户端一律 POST、以 Content-Length 成帧（https-json/1 S-6）。 */
export function httpRequest(body: string | Buffer, options: RequestOptions = {}): Buffer {
  const bytes = typeof body === 'string' ? Buffer.from(body, 'utf8') : body
  const lines = [`${options.method ?? 'POST'} ${options.path ?? '/'} HTTP/1.1`]
  if (options.omitHost !== true) lines.push('Host: center.example.invalid')
  lines.push(...(options.headers ?? []))
  if (options.omitContentLength !== true) lines.push(`Content-Length: ${String(bytes.length)}`)
  return Buffer.concat([Buffer.from(`${lines.join('\r\n')}\r\n\r\n`, 'latin1'), bytes])
}

/** 一份信封的请求体（成员按传入次序）。 */
export function envelope(members: Record<string, unknown>): string {
  return JSON.stringify(members)
}

export interface Exchange {
  /** 连接上收到的全部字节。 */
  readonly bytes: Buffer
  /** 对端以错误收场（例如重置）。 */
  readonly error: string | undefined
  /** 收到对端的关闭（TLS 上 `end` 就是见到了 close_notify 或 FIN）。 */
  readonly ended: boolean
}

export interface ClientOptions {
  /** 写完请求之后半关写方向（缺省 true）。 */
  readonly endAfterWrite?: boolean
  /** 等待上界（毫秒）。 */
  readonly timeoutMs?: number
  readonly localAddress?: string
  /** 分几次写：每段之间的间隔（毫秒）。 */
  readonly chunks?: readonly Buffer[]
  readonly chunkDelayMs?: number
  /** 在握手之后、写之前等待。 */
  readonly delayBeforeWriteMs?: number
}

function collect(
  socket: Socket | TLSSocket,
  request: Buffer,
  options: ClientOptions,
): Promise<Exchange> {
  return new Promise(resolve => {
    const parts: Buffer[] = []
    let error: string | undefined
    let ended = false
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ bytes: Buffer.concat(parts), error, ended })
    }
    const timer = setTimeout(() => {
      socket.destroy()
      done()
    }, options.timeoutMs ?? 10_000)
    socket.on('data', chunk => parts.push(chunk as Buffer))
    socket.on('end', () => {
      ended = true
    })
    socket.on('error', err => {
      error = (err as NodeJS.ErrnoException).code ?? err.name
    })
    socket.on('close', done)
    const write = async () => {
      if (options.delayBeforeWriteMs !== undefined) await sleep(options.delayBeforeWriteMs)
      const chunks = options.chunks ?? [request]
      for (const [index, chunk] of chunks.entries()) {
        if (index > 0 && options.chunkDelayMs !== undefined) await sleep(options.chunkDelayMs)
        if (socket.destroyed) return
        socket.write(chunk)
      }
      if (options.endAfterWrite !== false && !socket.destroyed) socket.end()
    }
    void write()
  })
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export interface TlsClientOptions extends ClientOptions {
  readonly minVersion?: ConnectionOptions['minVersion']
  readonly maxVersion?: ConnectionOptions['maxVersion']
}

/** 真 TLS 客户端：以测试根证书核中心的证书链与主机名 `localhost`。 */
export function tlsExchange(
  port: number,
  request: Buffer,
  options: TlsClientOptions = {},
): Promise<Exchange & { readonly handshake: boolean }> {
  return new Promise(resolve => {
    let handshake = false
    const socket = tlsConnect({
      host: '127.0.0.1',
      port,
      servername: 'localhost',
      ca: TLS_FIXTURES.caPem,
      minVersion: options.minVersion ?? 'TLSv1.3',
      ...(options.maxVersion === undefined ? {} : { maxVersion: options.maxVersion }),
      ...(options.localAddress === undefined ? {} : { localAddress: options.localAddress }),
    })
    socket.once('secureConnect', () => {
      handshake = true
    })
    const exchange = collect(socket, request, {
      ...options,
      delayBeforeWriteMs: options.delayBeforeWriteMs ?? 0,
    })
    void exchange.then(result => resolve({ ...result, handshake }))
  })
}

/** 原始 TCP（不握 TLS）：用来发明文 HTTP。 */
export function tcpExchange(
  port: number,
  request: Buffer,
  options: ClientOptions = {},
): Promise<Exchange> {
  const socket = tcpConnect({ host: '127.0.0.1', port, allowHalfOpen: true })
  return collect(socket, request, options)
}

/** 本机 Unix 套接字。 */
export function unixExchange(
  path: string,
  request: Buffer,
  options: ClientOptions = {},
): Promise<Exchange> {
  const socket = tcpConnect({ path, allowHalfOpen: true })
  return collect(socket, request, options)
}

/** 答复拆成头部与体（按第一个空行）。 */
export function splitReply(bytes: Buffer): { readonly head: string; readonly body: string } {
  const index = bytes.indexOf('\r\n\r\n')
  if (index < 0) return { head: bytes.toString('latin1'), body: '' }
  return {
    head: bytes.subarray(0, index).toString('latin1'),
    body: bytes.subarray(index + 4).toString('utf8'),
  }
}
