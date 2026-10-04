// 客户端一面的传输（https-json/1 S-4、S-5、S-16；入口契约 S-34 的停机次序）：只有 TLS 监听、最低 TLS 1.3、服务端认证，
// 在 `node:tls` 的原始套接字上自己成帧（../ops/http1.ts）；不用 node:http 服务器（它会写 400／408／431、100 Continue、对 HEAD 去体）。
// 分派闸：closed（端口已绑、不受理）→ serving → draining（停收、等在途）；未开门就撤除或开门失败 ⇒ retired。
import type { Socket } from 'node:net'
import { type Server, type TLSSocket, createSecureContext, createServer } from 'node:tls'
import { type ConnectionLimits, Http1Connection, type NoAnswerReason } from '../ops/http1.ts'

/** TLS 握手阶段的时长上界（https-json/1 S-3：归实现映射，契约不给下限）；接收时限从握手完成起算。 */
export const TLS_HANDSHAKE_TIMEOUT_MS = 30_000

/** 部署配置输入：证书链与私钥（PEM）。不是部署密钥；私钥按秘密处理，不进任何输出（S-22）。 */
export interface TlsMaterial {
  readonly certificateChainPem: string
  readonly privateKeyPem: string
}

/** 证书链或私钥缺、解析不了或两者不配 ⇒ 启动失败。说明只带 OpenSSL 的错误码，不带任何 PEM 内容。 */
export class TlsMaterialError extends Error {
  override readonly name = 'TlsMaterialError'
}

function errorCode(error: unknown): string {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'unknown'
}

function materialError(error: unknown): TlsMaterialError {
  return new TlsMaterialError(
    `governance-center-entry: the TLS certificate chain or private key could not be loaded, or they do not match (${errorCode(error)})`,
  )
}

/**
 * 核材料：证书链与私钥解析得了、两者相配（OpenSSL 在载入私钥时核配对）。不合 ⇒ {@link TlsMaterialError}。
 * 只用来在绑定端口之前判启动失败；服务器本身用同一份材料直接构造（见 {@link ClientFace.bind}）。
 */
export function verifyTlsMaterial(pem: TlsMaterial): void {
  try {
    createSecureContext({
      cert: pem.certificateChainPem,
      key: pem.privateKeyPem,
      minVersion: 'TLSv1.3',
    })
  } catch (error) {
    throw materialError(error)
  }
}

export type GateState = 'closed' | 'serving' | 'draining' | 'retired'

export interface ClientFaceOptions {
  readonly host: string
  readonly port: number
  readonly tls: TlsMaterial
  readonly limits: ConnectionLimits
  /** 报文完整收到且闸开着：给出整份答复字节，或 `undefined` 表示不答。 */
  readonly accepting?: () => boolean
  readonly answer: (body: Buffer) => Promise<Buffer | undefined>
  readonly closedWithoutAnswer?: (reason: NoAnswerReason, error?: unknown) => void
  /** 监听期间的服务器错误（只给诊断用，不带对端地址）。 */
  readonly serverError?: (error: Error) => void
}

/** 客户端一面：一个 TLS 监听与它上面的连接。 */
export class ClientFace {
  readonly #server: Server
  readonly #options: ClientFaceOptions
  readonly #connections = new Set<Http1Connection>()
  /** 全部传输连接（含握手还没完成的）：撤除收尾时一律关掉，端口释放才有界。 */
  readonly #transports = new Set<Socket>()
  readonly #closed: Promise<void>
  #gate: GateState = 'closed'

  private constructor(server: Server, options: ClientFaceOptions) {
    this.#server = server
    this.#options = options
    this.#closed = new Promise(resolve => server.once('close', () => resolve()))
    server.on('connection', (socket: Socket) => {
      this.#transports.add(socket)
      socket.once('close', () => this.#transports.delete(socket))
    })
    server.on('secureConnection', socket => this.#accept(socket))
    // 握手不成（明文、低于 1.3、握手超时）：关掉那条连接（服务器以 allowHalfOpen 建，不关就一直半开着）；不记对端
    server.on('tlsClientError', (_error, socket) => socket.destroy())
    server.on('error', error => options.serverError?.(error))
  }

  /** 撤除收尾：还开着的连接（在途超时的、握手没完成的）一律立即关闭，再等端口释放。 */
  async #release(): Promise<void> {
    for (const connection of this.#connections) connection.destroy()
    for (const socket of this.#transports) socket.destroy()
    await this.#closed
  }

  /** 绑好端口、闸关着：连接一律关闭不答，直到 {@link open}。端口占用、材料不合 ⇒ 抛出。 */
  static async bind(options: ClientFaceOptions): Promise<ClientFace> {
    verifyTlsMaterial(options.tls)
    // 材料直接交给服务器，不传预先建好的 `secureContext`：Node 24.18（OpenSSL 3.5.7）下那样建的服务器
    // 对 ECDSA 证书握手失败（ERR_SSL_NO_SUITABLE_SIGNATURE_ALGORITHM），包内 tests/basis 有取证
    let server: Server
    try {
      server = createServer({
        cert: options.tls.certificateChainPem,
        key: options.tls.privateKeyPem,
        minVersion: 'TLSv1.3',
        handshakeTimeout: TLS_HANDSHAKE_TIMEOUT_MS,
        allowHalfOpen: true,
      })
    } catch (error) {
      throw materialError(error)
    }
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off('listening', onListening)
        reject(error)
      }
      const onListening = () => {
        server.off('error', onError)
        resolve()
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen({ host: options.host, port: options.port })
    })
    return new ClientFace(server, options)
  }

  get gate(): GateState {
    return this.#gate
  }

  /** 实际绑定的端口（config 给 0 时由系统分配）。 */
  get port(): number {
    const address = this.#server.address()
    if (address === null || typeof address === 'string') throw new Error('client face is not bound')
    return address.port
  }

  /** 在途的请求数：报文已完整收到、还没写出答复的。 */
  get inFlight(): number {
    let count = 0
    for (const connection of this.#connections) if (connection.phase === 'answering') count += 1
    return count
  }

  open(): void {
    if (this.#gate === 'closed') this.#gate = 'serving'
  }

  #accept(socket: TLSSocket): void {
    const connection = new Http1Connection(socket, this.#options.limits, {
      accepting: () => this.#gate === 'serving' && (this.#options.accepting?.() ?? true),
      answer: this.#options.answer,
      ...(this.#options.closedWithoutAnswer === undefined
        ? {}
        : { closedWithoutAnswer: this.#options.closedWithoutAnswer }),
    })
    this.#connections.add(connection)
    void connection.closed.then(() => this.#connections.delete(connection))
    // 闸没开或已关：握手完成的连接先发 close_notify 再关，不写任何 HTTP 字节
    if (this.#gate !== 'serving' || this.#options.accepting?.() === false)
      connection.stopReceiving()
  }

  /**
   * 已开门的停机第一步（S-34）：闸 serving → draining，报文还没收齐的连接直接关闭不写（S-16）；
   * 在途的照常答完。调用方在这之后发 `stopped`，再 {@link drain}。
   */
  beginDraining(): void {
    if (this.#gate === 'serving') this.#gate = 'draining'
    for (const connection of this.#connections) connection.stopReceiving()
  }

  /**
   * 已开门的停机其余几步：不再接受新连接 → 有界等在途答完（上界 `drainTimeoutMs`）→ 同一上界内等各连接读尽收尾 →
   * 到时仍未关的销毁 → 等端口释放。
   */
  async drain(drainTimeoutMs: number): Promise<void> {
    this.#server.close()
    let timer: NodeJS.Timeout | undefined
    const deadline = new Promise<void>(resolve => {
      timer = setTimeout(resolve, drainTimeoutMs)
    })
    try {
      const answering = [...this.#connections].filter(c => c.phase === 'answering')
      await Promise.race([Promise.all(answering.map(c => c.answered)), deadline])
      // 答完的连接在读尽上界内收尾；同一个上界到了还没关的，一律立即全关
      await Promise.race([Promise.all([...this.#connections].map(c => c.closed)), deadline])
    } finally {
      clearTimeout(timer)
    }
    await this.#release()
  }

  /** 未开门就撤除或开门失败：闸置 retired（此后再也不开），关闭已接的连接，释放端口；不等在途（没有受理过请求）。 */
  async retire(): Promise<void> {
    this.#gate = 'retired'
    this.#server.close()
    await this.#release()
  }
}
