// 传输绑定在真实连接上（https-json/1）：V-5 只看请求体与一连接一请求、V-6 问不到、V-7 只有 TLS 与早期数据、
// V-11 恰在下限上照答与上界 + 1 被切、V-1 的「一次写出」；入口节点 T-19（防冒充中心一侧）。
// 客户端是 Node 的 tls／net 与 OpenSSL 1.1.1 的 s_client（看 close_notify 与早期数据）。按 ccd39d9：关闭方式只断言「先发
// close_notify」，不断言「没有重置」——对端还有未读字节时传输层可能以重置收场。
import { spawn, spawnSync } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { type Socket, createServer as createNetServer, connect as netConnect } from 'node:net'
import { join } from 'node:path'
import { connect as tlsConnect } from 'node:tls'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { RECEIVE_LIMITS } from '../src/index.ts'
import { Http1Connection } from '../src/ops/http1.ts'
import { entryAnswerBytes } from '../src/routing/answers.ts'
import {
  type Center,
  HEALTH,
  OG,
  REGISTER,
  PASSWORD,
  bodyOf,
  bootCenter,
  envelopeOf,
  registerAndLogin,
  tempDirectory,
} from './support/composition.ts'
import { TLS_FIXTURES, httpRequest, splitReply, tcpExchange, tlsExchange } from './support/wire.ts'

const REJECTED = entryAnswerBytes('login-state-rejected')
const FIXTURES = join(import.meta.dirname, 'fixtures/tls')

let center: Center
let health: Buffer
let presentation: string
beforeAll(async () => {
  center = await bootCenter({ label: 'transport' })
  await center.open()
  presentation = (await registerAndLogin(center, 'ada@example.invalid')).presentation
  health = (await tlsExchange(center.port, httpRequest(JSON.stringify({ operation: HEALTH }))))
    .bytes
  expect(bodyOf(health)).toMatchObject({ reachable: true })
})
afterAll(async () => {
  // 撤除有界：明文与 TLS 1.2 那几条握手没成的连接也在内（它们曾让端口释放等不到头）
  const started = performance.now()
  await center.dispose()
  expect(performance.now() - started).toBeLessThan(5_000)
})

const noPresentation = JSON.stringify(envelopeOf(OG(27), {}))

/**
 * OpenSSL 1.1.1 的 s_client；`input` 是写到它 stdin 的字节（之后 EOF）。必须异步起子进程：中心跑在本进程的事件循环上，
 * 同步等子进程会让中心答不了。
 */
function sClient(args: readonly string[], input: Buffer | string = ''): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('openssl', [
      's_client',
      '-connect',
      `127.0.0.1:${String(center.port)}`,
      '-servername',
      'localhost',
      '-CAfile',
      join(FIXTURES, 'ca.pem'),
      ...args,
    ])
    const output: Buffer[] = []
    child.stdout.on('data', chunk => output.push(chunk))
    child.stderr.on('data', chunk => output.push(chunk))
    const timer = setTimeout(() => child.kill(), 10_000)
    child.on('error', reject)
    child.on('close', () => {
      clearTimeout(timer)
      resolve(Buffer.concat(output).toString('latin1'))
    })
    child.stdin.end(input)
  })
}

describe('V-5 只看请求体（规范场景 S-26）', () => {
  it.each([
    ['GET', { method: 'GET' }],
    ['PUT', { method: 'PUT' }],
    ['HEAD（照样带体）', { method: 'HEAD' }],
    ['改路径', { path: '/other/path?x=1' }],
    ['Connection: keep-alive', { headers: ['Connection: keep-alive'] }],
    ['Expect: 100-continue', { headers: ['Expect: 100-continue'] }],
    ['去掉 Host', { omitHost: true }],
    ['两个 Host', { headers: ['Host: a.example'] }],
  ])('%s ⇒ 恰那 137 个字节，此外一个字节都没有', async (_name, options) => {
    const reply = await tlsExchange(center.port, httpRequest(noPresentation, options))
    expect(reply.bytes).toEqual(REJECTED)
  })

  it('Authorization 头里带一个有效出示物 ⇒ 仍是没带出示物（examples §6 #20）', async () => {
    const reply = await tlsExchange(
      center.port,
      httpRequest(noPresentation, { headers: [`Authorization: Bearer ${presentation}`] }),
    )
    expect(reply.bytes).toEqual(REJECTED)
    const withBody = await tlsExchange(
      center.port,
      httpRequest(JSON.stringify(envelopeOf(OG(27), {}, presentation))),
    )
    expect(bodyOf(withBody.bytes)).toMatchObject({ result: [{}] })
  })

  it('公开体检请求以 GET /x 与 POST / 各发一次：两份答复逐字节相同', async () => {
    const body = JSON.stringify({ operation: HEALTH })
    const a = await tlsExchange(center.port, httpRequest(body, { method: 'GET', path: '/x' }))
    const b = await tlsExchange(center.port, httpRequest(body))
    expect(a.bytes).toEqual(b.bytes)
    expect(a.bytes).toEqual(health)
  })

  it('Expect: 100-continue：头部收齐后不写 100 Continue，等请求体收齐再答', async () => {
    const body = Buffer.from(JSON.stringify({ operation: HEALTH }))
    const head = Buffer.from(
      `POST / HTTP/1.1\r\nHost: x\r\nExpect: 100-continue\r\nContent-Length: ${String(body.length)}\r\n\r\n`,
      'latin1',
    )
    const reply = await tlsExchange(center.port, Buffer.alloc(0), {
      chunks: [head, body],
      chunkDelayMs: 400,
    })
    expect(reply.bytes).toEqual(health)
  })

  it('流水线里的第二个请求（多写的字节在读尽上界之内）不被答，第一份答复完整到达', async () => {
    const first = httpRequest(noPresentation)
    const second = httpRequest(JSON.stringify({ operation: HEALTH }))
    const reply = await tlsExchange(center.port, Buffer.concat([first, second]))
    expect(reply.bytes).toEqual(REJECTED)
  })

  it('写完答复先发 close_notify：客户端发完不关写，也先读完整份答复、再见到对端关写（end），随后全关', async () => {
    const reply = await tlsExchange(
      center.port,
      httpRequest(JSON.stringify({ operation: HEALTH })),
      { endAfterWrite: false },
    )
    expect(reply.bytes).toEqual(health)
    expect(reply.ended).toBe(true)
  })

  it('OpenSSL 看到的次序：HTTP 答复，然后中心的 close_notify 告警', async () => {
    const output = await sClient(
      ['-tls1_3', '-msg', '-ign_eof'],
      httpRequest(JSON.stringify({ operation: HEALTH })),
    )
    const answer = output.indexOf('HTTP/1.1 200 OK')
    const alert = output.search(/<<< TLS 1\.3, Alert \[length 0002\], warning close_notify/)
    expect(answer).toBeGreaterThanOrEqual(0)
    expect(alert).toBeGreaterThan(answer)
    expect(output).not.toMatch(/<<< TLS 1\.3, Alert \[length 0002\], fatal/)
  })

  it('读尽中多写的字节超出读尽上界 ⇒ 中心立即全关（不等读尽时限）', async () => {
    const extra = Buffer.alloc(RECEIVE_LIMITS.drainBytes + 4096, 0x61)
    const started = performance.now()
    const reply = await tlsExchange(
      center.port,
      Buffer.concat([httpRequest(noPresentation), extra]),
      { endAfterWrite: false },
    )
    expect(performance.now() - started).toBeLessThan(RECEIVE_LIMITS.drainTimeoutMs)
    // S-5 允许客户端收不全：只断言中心关得快、且没有第二份答复
    expect(reply.bytes.length).toBeLessThanOrEqual(REJECTED.length)
  })
})

describe('V-1：每一份答复在连接上一次写出', () => {
  it('Http1Connection 只调一次 end(整份答复)，不调 write', async () => {
    const server = createNetServer({ allowHalfOpen: true })
    const sockets: Socket[] = []
    server.on('connection', socket => {
      sockets.push(socket)
      const end = vi.spyOn(socket, 'end')
      const write = vi.spyOn(socket, 'write')
      const connection = new Http1Connection(socket, RECEIVE_LIMITS, {
        accepting: () => true,
        answer: async () => REJECTED,
      })
      void connection.answered.then(() => {
        expect(write).not.toHaveBeenCalled()
        expect(end).toHaveBeenCalledTimes(1)
        expect(end.mock.calls[0]?.[0]).toBe(REJECTED)
      })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no port')
    const reply = await tcpExchange(address.port, httpRequest('{}'))
    expect(reply.bytes).toEqual(REJECTED)
    await new Promise<void>(resolve => server.close(() => resolve()))
    expect(sockets).toHaveLength(1)
  })
})

describe('V-6 成帧不了与超界：收不到任何 HTTP 字节，也收不到 4xx', () => {
  it.each([
    [
      'Transfer-Encoding: chunked',
      Buffer.from(
        'POST / HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\n\r\n2\r\n{}\r\n0\r\n\r\n',
      ),
    ],
    [
      '单独 LF 结尾的头部行',
      Buffer.from('POST / HTTP/1.1\r\nHost: x\nContent-Length: 2\r\n\r\n{}'),
    ],
    [
      'obs-fold 续行',
      Buffer.from('POST / HTTP/1.1\r\nX-A: a\r\n b\r\nContent-Length: 2\r\n\r\n{}'),
    ],
    [
      '字段名与冒号之间有空白',
      Buffer.from('POST / HTTP/1.1\r\nHost : x\r\nContent-Length: 2\r\n\r\n{}'),
    ],
    [
      '两个不同的 Content-Length',
      Buffer.from('POST / HTTP/1.1\r\nContent-Length: 2\r\nContent-Length: 3\r\n\r\n{} '),
    ],
    ['Content-Length: 42, 42', Buffer.from('POST / HTTP/1.1\r\nContent-Length: 42, 42\r\n\r\n{}')],
    ['没收齐就断开', Buffer.from('POST / HTTP/1.1\r\nContent-Length: 20\r\n\r\n{}')],
  ])('%s', async (_name, request) => {
    const reply = await tlsExchange(center.port, request)
    expect(reply.handshake).toBe(true)
    expect(reply.bytes.length).toBe(0)
  })

  const padded = (headerBytes: number) => {
    const body = JSON.stringify({ operation: HEALTH })
    const base = httpRequest(body, { headers: ['X-Pad: '] })
    const headLength = base.indexOf('\r\n\r\n') + 4
    return httpRequest(body, { headers: [`X-Pad: ${'a'.repeat(headerBytes - headLength)}`] })
  }
  const withMember = (value: string) => `{"operation":"${HEALTH}","x":${value}}`
  const nested = (depth: number) => withMember(`${'['.repeat(depth - 1)}${']'.repeat(depth - 1)}`)
  const members = (count: number) =>
    `{"operation":"${HEALTH}"${Array.from({ length: count - 1 }, (_, i) => `,"m${String(i)}":0`).join('')}}`
  const bodyOfSize = (size: number) => {
    const base = `{"operation":"${HEALTH}","pad":""}`
    return `{"operation":"${HEALTH}","pad":"${'a'.repeat(size - base.length)}"}`
  }

  it('恰在下限上（V-11；规范场景 S-28）：头部块 8192、请求体 65536、嵌套 64、成员 1024 ⇒ 都得公开体检答复', async () => {
    expect(padded(8192).indexOf('\r\n\r\n') + 4).toBe(8192)
    expect(Buffer.byteLength(bodyOfSize(65536))).toBe(65536)
    for (const request of [
      padded(8192),
      httpRequest(bodyOfSize(65536)),
      httpRequest(nested(64)),
      httpRequest(members(1024)),
    ]) {
      expect((await tlsExchange(center.port, request)).bytes).toEqual(health)
    }
  })

  it('上界 + 1：头部块 8193、请求体 65537、嵌套 65、成员 1025 ⇒ 一个字节都收不到', async () => {
    for (const request of [
      padded(8193),
      httpRequest(bodyOfSize(65537)),
      httpRequest(nested(65)),
      httpRequest(members(1025)),
    ]) {
      const reply = await tlsExchange(center.port, request)
      expect(reply.bytes.length).toBe(0)
    }
  })

  it('Content-Length 大于请求体上界 ⇒ 头部收齐即关，不读请求体（体一个字节都没发也关）', async () => {
    const reply = await tlsExchange(
      center.port,
      Buffer.from(
        `POST / HTTP/1.1\r\nContent-Length: ${String(RECEIVE_LIMITS.bodyBytes + 1)}\r\n\r\n`,
      ),
      {
        endAfterWrite: false,
        timeoutMs: 3_000,
      },
    )
    expect(reply.bytes.length).toBe(0)
    expect(reply.ended).toBe(true)
  })
})

describe('V-7 与 T-19：只有 TLS、服务端认证、不收早期数据', () => {
  it('明文 HTTP 请求得不到任何 HTTP 字节（没有明文监听）', async () => {
    const reply = await tcpExchange(center.port, httpRequest(JSON.stringify({ operation: HEALTH })))
    expect(reply.bytes.toString('latin1')).not.toContain('HTTP/')
  })

  it('只提供 TLS 1.2 的客户端握不了手', async () => {
    const reply = await tlsExchange(center.port, httpRequest('{}'), {
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.2',
    })
    expect(reply.handshake).toBe(false)
    expect(reply.bytes.length).toBe(0)
  })

  it('握手里出示的证书链与 config 给的那一份逐字节相同（叶子 + 根，DER）', async () => {
    const chain = await new Promise<Buffer[]>((resolve, reject) => {
      const socket = tlsConnect({
        host: '127.0.0.1',
        port: center.port,
        servername: 'localhost',
        ca: TLS_FIXTURES.caPem,
      })
      socket.once('secureConnect', () => {
        const certificates: Buffer[] = []
        let current = socket.getPeerCertificate(true)
        const seen = new Set<string>()
        while (current.raw !== undefined && !seen.has(current.fingerprint256)) {
          seen.add(current.fingerprint256)
          certificates.push(current.raw)
          current = current.issuerCertificate
        }
        socket.destroy()
        resolve(certificates)
      })
      socket.once('error', reject)
    })
    const configured = TLS_FIXTURES.chainPem
      .split(/(?=-----BEGIN CERTIFICATE-----)/)
      .map(pem => new X509Certificate(pem).raw)
    expect(chain).toEqual(configured)
  })

  it('OpenSSL：会话票据不许早期数据（Max Early Data: 0）；以早期数据送出的注册请求不被当作请求，那件事没有发生', async () => {
    const directory = tempDirectory('early-data')
    const session = join(directory, 'session.pem')
    const first = await sClient(
      ['-tls1_3', '-ign_eof', '-sess_out', session],
      httpRequest(JSON.stringify({ operation: HEALTH })),
    )
    expect(first).toContain('HTTP/1.1 200 OK')
    // sess_id 不连中心，同步跑无妨
    const text = spawnSync('openssl', ['sess_id', '-in', session, '-noout', '-text'], {
      encoding: 'latin1',
    }).stdout
    expect(text).toMatch(/Max Early Data: 0\b/)
    const early = join(directory, 'early.bin')
    const registration = httpRequest(
      JSON.stringify(
        envelopeOf(REGISTER, { loginIdentifier: 'early@example.invalid', credential: PASSWORD }),
      ),
    )
    writeFileSync(early, registration)
    const second = await sClient(['-tls1_3', '-sess_in', session, '-early_data', early])
    expect(second).toMatch(/Early data was (not sent|rejected)/)
    expect(second).not.toContain('HTTP/1.1 200 OK')
    const reply = await tlsExchange(center.port, registration)
    expect(bodyOf(reply.bytes)).toEqual({ result: 'registered' })
  })
})

describe('V-6：开门之前问不到', () => {
  it('端口已绑、闸关着：握手完成的连接收到 close_notify，没有任何 HTTP 字节；运维面也不答', async () => {
    const closed = await bootCenter({ label: 'not-open' })
    try {
      const reply = await tlsExchange(
        closed.port,
        httpRequest(JSON.stringify({ operation: HEALTH })),
        { endAfterWrite: false },
      )
      expect(reply.handshake).toBe(true)
      expect(reply.bytes.length).toBe(0)
      expect(reply.ended).toBe(true)
      const ops = await closed.ops()
      expect(ops.bytes.length).toBe(0)
      expect(closed.serving).toHaveLength(0)
    } finally {
      await closed.dispose()
    }
  })
})

describe('读尽时限（S-5；两张面同一连接层）', () => {
  it('写完答复后对端一直不关写 ⇒ 读尽时限到了中心全关（在中心一侧观察连接关闭的时刻）', async () => {
    const server = createNetServer({ allowHalfOpen: true })
    const closedAfter = new Promise<number>(resolve => {
      server.on('connection', socket => {
        const connection = new Http1Connection(socket, RECEIVE_LIMITS, {
          accepting: () => true,
          answer: async () => REJECTED,
        })
        void connection.answered.then(() => {
          const answeredAt = performance.now()
          void connection.closed.then(() => resolve(performance.now() - answeredAt))
        })
      })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no port')
    const client = netConnect({ host: '127.0.0.1', port: address.port, allowHalfOpen: true })
    const received: Buffer[] = []
    client.on('data', chunk => received.push(chunk))
    client.on('error', () => undefined)
    client.write(httpRequest('{}'))
    const elapsed = await closedAfter
    expect(Buffer.concat(received)).toEqual(REJECTED)
    expect(elapsed).toBeGreaterThanOrEqual(RECEIVE_LIMITS.drainTimeoutMs - 50)
    expect(elapsed).toBeLessThan(RECEIVE_LIMITS.drainTimeoutMs + 1_000)
    client.destroy()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }, 15_000)
})
