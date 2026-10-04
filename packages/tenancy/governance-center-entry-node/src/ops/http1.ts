// 本传输（https-json/1）的 HTTP/1.1 连接层，两张面共用：成帧、接收上界与时限、一连接一请求、写完后的关闭次序。
// 契约：composition.governance-center-entry-https-json v1 S-5（一连接一请求与关闭次序）、S-10（只答完整收到能成帧的报文）、
// S-16（问不到：不写任何字节）、S-20（运维面同样适用成帧、接收时限与头部块、请求体两个上界）。
// 不用 node:http 服务器：它会自己写 400／408／431、`100 Continue`、对 HEAD 去体，与 S-5／S-6／S-10 冲突。
// 放在 ops 目录下的理由同 wire.ts：运维面的导入白名单只许 ops 目录内文件，客户端面从这里导入。
import type { Socket } from 'node:net'

export interface FramingLimits {
  /** 请求头部块：从请求行第一个字节到结束头部的空行（含 CR LF）为止的字节数上界。 */
  readonly headerBlockBytes: number
  /** 请求体字节数上界：头部收齐时 `Content-Length` 大于它即判，不读请求体。 */
  readonly bodyBytes: number
}

export interface ConnectionLimits extends FramingLimits {
  /** 接收时限：从连接就绪（客户端面是握手完成，运维面是连接被接受）到读到报文最后一个字节。 */
  readonly receiveTimeoutMs: number
  /** 读尽上界：写出答复（或决定不写）之后，报文之后对端送来的字节数（HTTP 报文层）。 */
  readonly drainBytes: number
  /** 读尽时限：从关写方向起，等对端关写方向的上界。 */
  readonly drainTimeoutMs: number
}

export type FrameStep =
  | { readonly kind: 'need-more' }
  | { readonly kind: 'unframeable' }
  | { readonly kind: 'exceeds-limit' }
  /** `trailing`：与报文同一批到达、排在报文之后的字节数（例如流水线里的下一个请求），不当作请求。 */
  | { readonly kind: 'complete'; readonly body: Buffer; readonly trailing: number }

const CR = 0x0d
const LF = 0x0a

// RFC 9110 §5.6.2 token
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
// RFC 9110 §5.5 field-value（前后 OWS 已剥）：field-vchar 之间只许 SP／HTAB；CR、LF、NUL 与其他控制字符一律不合
const FIELD_VALUE = /^(?:[\x21-\x7e\x80-\xff](?:[\t\x20-\x7e\x80-\xff]*[\x21-\x7e\x80-\xff])?)?$/
const HTTP_1_VERSION = /^HTTP\/1\.[0-9]$/

// RFC 9112 §3.2 request-target 的四种形式。absolute-form 与 IP-literal 只核到字符类一级（不展开完整的 URI 文法）。
const PCT = '%[0-9A-Fa-f]{2}'
const PCHAR = `(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@]|${PCT})`
const ORIGIN_FORM = new RegExp(`^(?:/${PCHAR}*)+(?:\\?(?:${PCHAR}|[/?])*)?$`)
const ABSOLUTE_FORM = new RegExp(`^[A-Za-z][A-Za-z0-9+\\-.]*:(?:${PCHAR}|[/?\\[\\]])*$`)
const AUTHORITY_FORM = new RegExp(
  `^(?:\\[[0-9A-Za-z:.\\-_~!$&'()*+,;=]+\\]|(?:[A-Za-z0-9\\-._~!$&'()*+,;=]|${PCT})*):[0-9]*$`,
)

function validRequestTarget(target: string): boolean {
  return (
    target === '*' ||
    ORIGIN_FORM.test(target) ||
    AUTHORITY_FORM.test(target) ||
    ABSOLUTE_FORM.test(target)
  )
}

/** 请求行：method SP request-target SP HTTP-version，只按单个 SP 分词（RFC 9112 §3 的宽松分词不采用）。 */
function validRequestLine(line: string): boolean {
  const parts = line.split(' ')
  if (parts.length !== 3) return false
  const [method, target, version] = parts
  return (
    method !== undefined &&
    target !== undefined &&
    version !== undefined &&
    TOKEN.test(method) &&
    validRequestTarget(target) &&
    HTTP_1_VERSION.test(version)
  )
}

interface FieldLine {
  /** 小写的字段名。 */
  readonly name: string
  /** 剥掉前后 OWS 的原样字面。 */
  readonly value: string
}

/** field-line = field-name ":" OWS field-value OWS；字段名与冒号之间的空白、obs-fold（以空白开头的行）都判不合。 */
function parseFieldLine(line: string): FieldLine | undefined {
  const colon = line.indexOf(':')
  if (colon <= 0) return undefined
  const name = line.slice(0, colon)
  if (!TOKEN.test(name)) return undefined
  const value = line
    .slice(colon + 1)
    .replace(/^[\t ]+/, '')
    .replace(/[\t ]+$/, '')
  if (!FIELD_VALUE.test(value)) return undefined
  return { name: name.toLowerCase(), value }
}

/**
 * 请求报文的成帧器（S-10）：按 ABNF 严格判，规范给接收方的宽松或替换选项一律不采用；只认 `Content-Length`。
 * 逐行判：一行一完整就核它，单独 LF、裸 CR、请求行之前的空行即刻判成帧不了，不等头部收齐。
 */
export class RequestFramer {
  readonly #limits: FramingLimits
  #phase: 'head' | 'body' | 'settled' = 'head'
  #head: Buffer = Buffer.alloc(0)
  #lineStart = 0
  #lines = 0
  readonly #fields: FieldLine[] = []
  #bodyLength = 0
  readonly #bodyParts: Buffer[] = []
  #bodyReceived = 0

  constructor(limits: FramingLimits) {
    this.#limits = limits
  }

  push(chunk: Buffer): FrameStep {
    if (this.#phase === 'settled') throw new Error('request framer already settled')
    if (this.#phase === 'body') return this.#takeBody(chunk)
    this.#head = this.#head.length === 0 ? chunk : Buffer.concat([this.#head, chunk])
    return this.#scanHead()
  }

  #settle(step: FrameStep): FrameStep {
    this.#phase = 'settled'
    this.#head = Buffer.alloc(0)
    return step
  }

  #scanHead(): FrameStep {
    const limit = this.#limits.headerBlockBytes
    for (;;) {
      const lf = this.#head.indexOf(LF, this.#lineStart)
      if (lf < 0) break
      // 行终止恰为 CR LF：单独 LF（含没有 CR 的空行）成帧不了
      if (lf === this.#lineStart || this.#head[lf - 1] !== CR) {
        return this.#settle({ kind: 'unframeable' })
      }
      const content = this.#head.subarray(this.#lineStart, lf - 1)
      if (content.includes(CR)) return this.#settle({ kind: 'unframeable' })
      const blockLength = lf + 1
      if (content.length === 0) {
        // 请求行之前的空行不忽略（RFC 9112 §2.2 的「应当」有意不采用）
        if (this.#lines === 0) return this.#settle({ kind: 'unframeable' })
        if (blockLength > limit) return this.#settle({ kind: 'exceeds-limit' })
        return this.#headComplete(blockLength)
      }
      const text = content.toString('latin1')
      if (this.#lines === 0) {
        if (!validRequestLine(text)) return this.#settle({ kind: 'unframeable' })
      } else {
        const field = parseFieldLine(text)
        if (field === undefined) return this.#settle({ kind: 'unframeable' })
        this.#fields.push(field)
      }
      if (blockLength > limit) return this.#settle({ kind: 'exceeds-limit' })
      this.#lines += 1
      this.#lineStart = blockLength
    }
    // 还没见到结束头部的空行，而已收的字节已够上界：那一行结束时必越过上界
    if (this.#head.length >= limit) return this.#settle({ kind: 'exceeds-limit' })
    return { kind: 'need-more' }
  }

  #headComplete(blockLength: number): FrameStep {
    if (this.#fields.some(field => field.name === 'transfer-encoding')) {
      return this.#settle({ kind: 'unframeable' })
    }
    const lengths = this.#fields.filter(field => field.name === 'content-length')
    let bodyLength = 0
    if (lengths.length > 0) {
      const first = lengths[0]?.value ?? ''
      // 每一处都是 1*DIGIT，多处逐字节相同（`05` 与 `5` 不同）；前导零按 ABNF 允许，按十进制取值
      if (!/^[0-9]+$/.test(first) || lengths.some(field => field.value !== first)) {
        return this.#settle({ kind: 'unframeable' })
      }
      const digits = first.replace(/^0+/, '')
      if (digits.length > 15) return this.#settle({ kind: 'exceeds-limit' })
      bodyLength = digits === '' ? 0 : Number(digits)
      if (bodyLength > this.#limits.bodyBytes) return this.#settle({ kind: 'exceeds-limit' })
    }
    const rest = this.#head.subarray(blockLength)
    this.#head = Buffer.alloc(0)
    this.#phase = 'body'
    this.#bodyLength = bodyLength
    return this.#takeBody(rest)
  }

  #takeBody(chunk: Buffer): FrameStep {
    const need = this.#bodyLength - this.#bodyReceived
    if (chunk.length < need) {
      this.#bodyParts.push(chunk)
      this.#bodyReceived += chunk.length
      return { kind: 'need-more' }
    }
    this.#bodyParts.push(chunk.subarray(0, need))
    const body = Buffer.concat(this.#bodyParts)
    return this.#settle({ kind: 'complete', body, trailing: chunk.length - need })
  }
}

/** 连接以不写答复收场的原因，只给诊断用；对端看到的都是「问不到」。 */
export type NoAnswerReason =
  | 'unframeable'
  | 'exceeds-limit'
  | 'receive-timeout'
  | 'peer-closed'
  | 'not-accepting'
  | 'stopped'
  | 'declined'
  | 'failed'

export interface ConnectionHooks {
  /** 报文完整收到的那一刻，这张面还受不受理（闸）。不受理 ⇒ 关连接不写。 */
  accepting(): boolean
  /** 在途：给出整份答复字节，或 `undefined` 表示不答（例如 JSON 超出嵌套或成员数上界）。约定不拒绝。 */
  answer(body: Buffer): Promise<Buffer | undefined>
  /** 连接以不写答复收场。 */
  closedWithoutAnswer?(reason: NoAnswerReason, error?: unknown): void
}

export type ConnectionPhase = 'receiving' | 'answering' | 'closing' | 'closed'

/**
 * 一条连接恰承载一个请求—答复（S-5）。状态：receiving（收报文）→ answering（在途：报文已完整收到）
 * → closing（已关写方向，读尽丢弃）→ closed。答复作为一整串一次写出；写完或决定不写之后：
 * 关写方向（TLS 上 `end()` 先发 `close_notify`）→ 在读尽上界与读尽时限内读尽丢弃、直到对端关写 → 全关；
 * 读尽超界或超时即立即全关。套接字须以 `allowHalfOpen: true` 创建：对端先半关也要能写出答复。
 */
export class Http1Connection {
  readonly #socket: Socket
  readonly #limits: ConnectionLimits
  readonly #hooks: ConnectionHooks
  readonly #framer: RequestFramer
  #phase: ConnectionPhase = 'receiving'
  #afterMessage = 0
  #peerEnded = false
  #receiveTimer: NodeJS.Timeout | undefined
  #drainTimer: NodeJS.Timeout | undefined
  #resolveClosed!: () => void
  #resolveAnswered!: () => void
  /** 套接字关闭（含读尽之后的全关）时兑现。 */
  readonly closed: Promise<void>
  /** 不再在途时兑现：答复已写出（或决定不写），或连接已关闭。 */
  readonly answered: Promise<void>

  constructor(socket: Socket, limits: ConnectionLimits, hooks: ConnectionHooks) {
    this.#socket = socket
    this.#limits = limits
    this.#hooks = hooks
    this.#framer = new RequestFramer(limits)
    this.closed = new Promise(resolve => {
      this.#resolveClosed = resolve
    })
    this.answered = new Promise(resolve => {
      this.#resolveAnswered = resolve
    })
    socket.on('data', chunk => this.#onData(chunk as Buffer))
    socket.on('end', () => this.#onEnd())
    socket.on('finish', () => this.#maybeFullClose())
    // 连接层的错误（对端重置等）只让这条连接结束；Node 随后发 close
    socket.on('error', () => undefined)
    socket.on('close', () => this.#onClose())
    this.#receiveTimer = setTimeout(() => this.#onReceiveDeadline(), limits.receiveTimeoutMs)
  }

  get phase(): ConnectionPhase {
    return this.#phase
  }

  /** 停收（S-16）：报文还没完整收到的连接直接关闭、不写任何字节；在途的照常答完。 */
  stopReceiving(): void {
    if (this.#phase === 'receiving') this.#closeWithoutAnswer('stopped')
  }

  /** 立即全关（排空超时、撤除收尾）。 */
  destroy(): void {
    this.#socket.destroy()
  }

  #onData(chunk: Buffer): void {
    if (this.#phase === 'receiving') {
      const step = this.#framer.push(chunk)
      if (step.kind === 'need-more') return
      this.#clearReceiveTimer()
      if (step.kind !== 'complete') {
        this.#closeWithoutAnswer(step.kind)
        return
      }
      this.#afterMessage = step.trailing
      this.#answer(step.body)
      return
    }
    if (this.#phase === 'closed') return
    this.#afterMessage += chunk.length
    if (this.#afterMessage <= this.#limits.drainBytes) return
    if (this.#phase === 'closing') this.#socket.destroy()
    // 在途时多写的字节已超读尽上界：先停读（背压），答复写出之后立即全关
    else this.#socket.pause()
  }

  #answer(body: Buffer): void {
    if (!this.#hooks.accepting()) {
      this.#closeWithoutAnswer('not-accepting')
      return
    }
    this.#phase = 'answering'
    this.#hooks.answer(body).then(
      bytes => {
        if (this.#phase !== 'answering') return
        if (bytes === undefined) this.#closeWithoutAnswer('declined')
        else this.#closeAfter(bytes)
      },
      (error: unknown) => {
        if (this.#phase === 'answering') this.#closeWithoutAnswer('failed', error)
      },
    )
  }

  #onEnd(): void {
    this.#peerEnded = true
    // 报文没收齐连接就断了（S-10）：关闭，不写
    if (this.#phase === 'receiving') this.#closeWithoutAnswer('peer-closed')
    else this.#maybeFullClose()
  }

  #onReceiveDeadline(): void {
    this.#receiveTimer = undefined
    // 到时限那一刻先把已到达的字节读尽（本轮 I/O 之后），再判收没收齐
    setImmediate(() => {
      if (this.#phase === 'receiving') this.#closeWithoutAnswer('receive-timeout')
    })
  }

  #closeWithoutAnswer(reason: NoAnswerReason, error?: unknown): void {
    this.#clearReceiveTimer()
    this.#hooks.closedWithoutAnswer?.(reason, error)
    this.#closeAfter(undefined)
  }

  /** 写出整份答复（或什么都不写）并关写方向，进入读尽。 */
  #closeAfter(bytes: Buffer | undefined): void {
    if (this.#phase === 'closing' || this.#phase === 'closed') return
    this.#phase = 'closing'
    this.#resolveAnswered()
    if (bytes === undefined) this.#socket.end()
    else this.#socket.end(bytes)
    if (this.#afterMessage > this.#limits.drainBytes) {
      this.#socket.destroy()
      return
    }
    this.#socket.resume()
    this.#drainTimer = setTimeout(() => {
      this.#drainTimer = undefined
      this.#socket.destroy()
    }, this.#limits.drainTimeoutMs)
    this.#maybeFullClose()
  }

  /** 对端已关写方向、本端写方向已关完 ⇒ 全关。 */
  #maybeFullClose(): void {
    if (this.#phase === 'closing' && this.#peerEnded && this.#socket.writableFinished) {
      this.#socket.destroy()
    }
  }

  #clearReceiveTimer(): void {
    if (this.#receiveTimer !== undefined) clearTimeout(this.#receiveTimer)
    this.#receiveTimer = undefined
  }

  #onClose(): void {
    this.#phase = 'closed'
    this.#resolveAnswered()
    this.#clearReceiveTimer()
    if (this.#drainTimer !== undefined) clearTimeout(this.#drainTimer)
    this.#drainTimer = undefined
    this.#resolveClosed()
  }
}
