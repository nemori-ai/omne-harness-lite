// 黑盒客户端：只凭两份冻结契约与中心交谈，只依赖 Node 内置（node:tls、node:net、node:crypto），
// 不 import 任何 `@omne-harness-lite/*` 包——它不知道中心是怎样实现的，只知道线上的字节。
//
//   传输绑定：spec/compositions/governance-center-entry-https-json/v1/contract.md
//     S-4 只有 TLS 1.3、服务端认证；S-5 一连接一请求；S-6 只看请求体、客户端一律 POST；
//     S-9 公开体检请求；S-11～S-15 答复的字节；S-17 客户端怎样读答复；S-20 运维面是本机套接字上的明文 HTTP/1.1。
//   入口契约：spec/compositions/governance-center-entry/v1/contract.md
//     S-4 信封；S-6 四种入口答复；S-17 路由表与载荷成员名；S-18 公开体检。
//   信任中心的规则：realization/apps/cli/design.md「客户端信任中心的规则（D-029）」——
//     默认路径 CA 链加主机名；确认不了按「问不到」明确失败、不交出示物；中心标识不参与信任。
//
// 本模块不断言任何东西：它把线上发生的事如实交给调用方（套件或手动演练），判据在调用方。
import { X509Certificate } from 'node:crypto'
import { isIP, connect as netConnect } from 'node:net'
import {
  type PeerCertificate,
  type TLSSocket,
  checkServerIdentity,
  connect as tlsConnect,
} from 'node:tls'

/**
 * 本客户端声明的协议版本。哪些版本算对得上是中心的具名参数 `accepted_protocol_versions`（EC S-8），
 * 取值归入口层的实现映射（入口层包 README）；客户端只是照着那份映射发。
 */
export const PROTOCOL_VERSION = '1'

/** EC S-18：公开体检的路由标识；它不是信封路由。 */
export const PUBLIC_HEALTH_ROUTE = 'composition.governance-center-entry/v1#S-18'

const OG = 'capability.organization-governance/v1'

/** EC S-17 路由表：27 条，路由标识即被投影条款的坐标。 */
export const ROUTE = {
  register: 'composition.account-registration/v1#S-8',
  login: 'capability.account-identity/v2#S-15',
  revokeLoginState: 'capability.account-identity/v2#S-16',
  listLoginStates: 'capability.account-identity/v2#S-37',
  createOrganization: `${OG}#S-21`,
  readOrganization: `${OG}#S-22`,
  invite: `${OG}#S-23`,
  withdrawInvitation: `${OG}#S-24`,
  acceptInvitation: `${OG}#S-25`,
  membershipStanding: `${OG}#S-26`,
  myTenants: `${OG}#S-27`,
  changeRole: `${OG}#S-28`,
  removeMember: `${OG}#S-29`,
  requestAffiliation: `${OG}#S-30`,
  withdrawAffiliationRequest: `${OG}#S-31`,
  acceptAffiliationRequest: `${OG}#S-32`,
  dissolveAffiliation: `${OG}#S-33`,
  superiorChain: `${OG}#S-34`,
  layerIdentity: `${OG}#S-35`,
  currentTenant: `${OG}#S-36`,
  switchTenant: `${OG}#S-37`,
  readInvitation: `${OG}#S-55`,
  readAffiliationRequest: `${OG}#S-56`,
  listReceivedInvitations: `${OG}#S-57`,
  listIssuedOffers: `${OG}#S-58`,
  listMembers: `${OG}#S-59`,
  listIncomingAffiliationRequests: `${OG}#S-60`,
} as const

export type RouteName = keyof typeof ROUTE

/** 客户端要连的那个中心：地址、主机名与它信任的私有 CA（D-029 ②：都是客户端配置输入）。 */
export interface CenterAddress {
  readonly host: string
  readonly port: number
  /** 握手里带的服务器名，也是核对证书的主机名（D-029 ②：取配置地址的主机部分）。 */
  readonly servername: string
  /** 私有 CA 的根证书（PEM）。 */
  readonly ca: string
  /** 从本机哪个地址发起连接（演练「另一台机器」时换一个回环地址）。 */
  readonly localAddress?: string
}

/** 一份请求报文的外形。客户端一律 POST、以 Content-Length 成帧（HB S-6）；其余只为演练「中心不看」。 */
export interface RequestShape {
  readonly method?: string
  readonly path?: string
  /** `Host` 头的值；`null` ⇒ 不带 `Host`。缺省是地址的主机名。 */
  readonly host?: string | null
  /** 追加的请求头（按给出的次序写在 `Host` 之后、`Content-Length` 之前）。 */
  readonly headers?: readonly (readonly [string, string])[]
}

/** HTTP/1.1 请求报文：`<method> <path> HTTP/1.1`、头、以 Content-Length 成帧的体。 */
export function httpRequest(
  body: string | Buffer,
  host: string | null,
  shape: RequestShape = {},
): Buffer {
  const bytes = typeof body === 'string' ? Buffer.from(body, 'utf8') : body
  const lines = [`${shape.method ?? 'POST'} ${shape.path ?? '/'} HTTP/1.1`]
  const hostValue = shape.host === undefined ? host : shape.host
  if (hostValue !== null) lines.push(`Host: ${hostValue}`)
  for (const [name, value] of shape.headers ?? [['Content-Type', 'application/json']])
    lines.push(`${name}: ${value}`)
  lines.push(`Content-Length: ${String(bytes.length)}`)
  return Buffer.concat([Buffer.from(`${lines.join('\r\n')}\r\n\r\n`, 'latin1'), bytes])
}

/** EC S-4 信封：恰四个成员；没带出示物就不写那个成员。 */
export interface Envelope {
  readonly protocolVersion: string
  readonly presentedLoginState?: string
  readonly operation: string
  readonly payload: Readonly<Record<string, unknown>>
}

export function envelopeBody(envelope: Envelope): string {
  return JSON.stringify(envelope)
}

/** HB S-9：最短的公开体检请求体。 */
export const PUBLIC_HEALTH_BODY = JSON.stringify({ operation: PUBLIC_HEALTH_ROUTE })

// ---- 线上一来一往 ----

/** 一次连接上发生的事，如实记下；不判读。 */
export interface Wire {
  /** 请求报文是否写出去了。TLS 上只在确认对端证书之后才写（D-029 ①）。 */
  readonly requestWritten: boolean
  /** TLS 握手的结果；Unix 套接字上为 `undefined`。 */
  readonly tls:
    | {
        readonly authorized: boolean
        readonly protocol: string | null
        /** 对端出示的叶子证书（DER）。 */
        readonly peerLeafDer: Buffer | undefined
      }
    | undefined
  /** 收到的全部字节（到对端关闭为止）。 */
  readonly received: Buffer
  /** 连接上的错误（`code`，没有则取错误名）。 */
  readonly error: string | undefined
  readonly timedOut: boolean
}

const DEFAULT_TIMEOUT_MS = 20_000

/**
 * 经 TLS 发一个请求报文并读到对端关闭（HB S-5：一连接一请求，写完即半关）。
 * 信任按 D-029 默认路径：CA 链加主机名（Node 的 `ca` 与 `servername` 核对）；**确认不了就不写请求**——
 * 握手失败时写的机会根本不会到来，另在 `secureConnect` 里再核一次 `authorized`，不以握手成功代替核对。
 */
export function sendTls(
  address: CenterAddress,
  request: Buffer,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  /** 请求报文交给传输层写出之后调用（演练「回执没到」时据此掐掉对端）。 */
  onWritten?: () => void,
): Promise<Wire> {
  const socket = tlsConnect({
    host: address.host,
    port: address.port,
    // SNI 不带 IP（RFC 6066 §3）；主机名是 IP 时照样按它核证书里的 IP 名
    ...(isIP(address.servername) === 0
      ? { servername: address.servername }
      : {
          checkServerIdentity: (_host: string, certificate: PeerCertificate) =>
            checkServerIdentity(address.servername, certificate),
        }),
    ca: address.ca,
    minVersion: 'TLSv1.3',
    rejectUnauthorized: true,
    ...(address.localAddress === undefined ? {} : { localAddress: address.localAddress }),
  })
  return new Promise(resolve => {
    const parts: Buffer[] = []
    let error: string | undefined
    let written = false
    let tls: Wire['tls']
    let timedOut = false
    let settled = false
    const timer = setTimeout(() => {
      timedOut = true
      socket.destroy()
    }, timeoutMs)
    socket.on('data', (chunk: Buffer) => parts.push(chunk))
    socket.on('error', (err: NodeJS.ErrnoException) => {
      error ??= err.code ?? err.name
    })
    socket.once('secureConnect', () => {
      tls = describeTls(socket)
      if (!socket.authorized) {
        error ??= 'UNAUTHORIZED_PEER'
        socket.destroy()
        return
      }
      written = true
      socket.end(request, () => onWritten?.())
    })
    socket.once('close', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        requestWritten: written,
        tls,
        received: Buffer.concat(parts),
        error,
        timedOut,
      })
    })
  })
}

function describeTls(socket: TLSSocket): NonNullable<Wire['tls']> {
  const peer = socket.getPeerX509Certificate()
  return {
    authorized: socket.authorized,
    protocol: socket.getProtocol(),
    peerLeafDer: peer instanceof X509Certificate ? peer.raw : undefined,
  }
}

/** 经本机 Unix 套接字发一个明文请求报文（运维面，HB S-20）。 */
export function sendUnix(
  path: string,
  request: Buffer,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Wire> {
  const socket = netConnect({ path, allowHalfOpen: true })
  return new Promise(resolve => {
    const parts: Buffer[] = []
    let error: string | undefined
    let written = false
    let timedOut = false
    let settled = false
    const timer = setTimeout(() => {
      timedOut = true
      socket.destroy()
    }, timeoutMs)
    socket.on('data', (chunk: Buffer) => parts.push(chunk))
    socket.on('error', (err: NodeJS.ErrnoException) => {
      error ??= err.code ?? err.name
    })
    socket.once('connect', () => {
      written = true
      socket.end(request)
    })
    socket.once('close', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        requestWritten: written,
        tls: undefined,
        received: Buffer.concat(parts),
        error,
        timedOut,
      })
    })
  })
}

// ---- 读答复（HB S-17） ----

export interface HttpAnswer {
  readonly statusLine: string
  readonly status: number
  readonly headers: readonly (readonly [string, string])[]
  readonly body: Buffer
}

/**
 * HB S-17 第 1 步：按 HTTP/1.1 读完一份答复——状态行、头，再按 `Content-Length` 读满体。
 * 读不成一份完整答复 ⇒ 返回原因（字符串），调用方按「问不到」处理。体之后多出字节也读不成：本传输一连接只有一份答复。
 */
export function parseHttpAnswer(bytes: Buffer): HttpAnswer | string {
  if (bytes.length === 0) return 'no bytes'
  const end = bytes.indexOf('\r\n\r\n')
  if (end < 0) return 'header block not terminated'
  const lines = bytes.subarray(0, end).toString('latin1').split('\r\n')
  const statusLine = lines[0] ?? ''
  const status = /^HTTP\/1\.1 (\d{3}) [^\r\n]*$/.exec(statusLine)
  if (status === null) return 'not an HTTP/1.1 status line'
  const headers: [string, string][] = []
  for (const line of lines.slice(1)) {
    const field = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+):[ \t]*(.*?)[ \t]*$/.exec(line)
    if (field === null) return 'malformed header line'
    headers.push([field[1] ?? '', field[2] ?? ''])
  }
  const lengths = headers.filter(([name]) => name.toLowerCase() === 'content-length')
  const [only] = lengths
  if (lengths.length !== 1 || only === undefined || !/^\d+$/.test(only[1]))
    return 'no single Content-Length'
  const length = Number(only[1])
  const body = bytes.subarray(end + 4)
  if (body.length < length) return 'body shorter than Content-Length'
  if (body.length > length) return 'bytes after the answer'
  return { statusLine, status: Number(status[1]), headers, body }
}

/** EC S-6 四种入口答复。 */
export type EntryAnswer =
  'version-mismatch' | 'login-state-rejected' | 'unavailable' | 'invalid-input'
const OTHER_ENTRY_ANSWERS: readonly EntryAnswer[] = [
  'login-state-rejected',
  'unavailable',
  'invalid-input',
]

function isOtherEntryAnswer(value: unknown): value is EntryAnswer {
  return OTHER_ENTRY_ANSWERS.some(answer => answer === value)
}

/** HB S-17 第 2 步：版本对不上就是体逐字节等于这 18 个字节，跨协议版本不改。 */
export const VERSION_MISMATCH_BODY = Buffer.from('"version-mismatch"', 'utf8')

export interface PublicHealth {
  readonly reachable: true
  readonly centerId: string
  readonly version: string
}

/** 客户端一面一次请求的读法；`unreachable` 就是「问不到」（HB S-17 第 1、4 步）。 */
export type Reply =
  | { readonly kind: 'unreachable'; readonly why: string }
  | { readonly kind: 'entry'; readonly answer: EntryAnswer }
  | { readonly kind: 'result'; readonly value: unknown }
  | { readonly kind: 'failure'; readonly name: string }
  | { readonly kind: 'public-health'; readonly value: PublicHealth }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readJson(body: Buffer): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) }
  } catch {
    return { ok: false }
  }
}

/**
 * HB S-17：读一份答复。`expect` 是这次请求应得的那一类——信封得入口答复或路由结果，公开体检请求得公开体检答复；
 * 读成的值不属于这一类 ⇒ 问不到（第 4 步：作为对端异常记下，不猜它是什么）。
 */
export function readReply(wire: Wire, expect: 'envelope' | 'public-health'): Reply {
  if (wire.tls !== undefined && !wire.tls.authorized)
    return { kind: 'unreachable', why: `peer not confirmed (${wire.error ?? 'unauthorized'})` }
  if (!wire.requestWritten)
    return { kind: 'unreachable', why: `request not sent (${wire.error ?? 'no connection'})` }
  const answer = parseHttpAnswer(wire.received)
  if (typeof answer === 'string') return { kind: 'unreachable', why: answer }
  if (answer.body.equals(VERSION_MISMATCH_BODY))
    return { kind: 'entry', answer: 'version-mismatch' }
  if (answer.status !== 200)
    return { kind: 'unreachable', why: `peer anomaly: status ${answer.status}` }
  const json = readJson(answer.body)
  if (!json.ok) return { kind: 'unreachable', why: 'peer anomaly: body is not JSON' }
  const value = json.value
  if (expect === 'public-health') {
    if (
      isRecord(value) &&
      Object.keys(value).length === 3 &&
      value['reachable'] === true &&
      typeof value['centerId'] === 'string' &&
      typeof value['version'] === 'string'
    )
      return {
        kind: 'public-health',
        value: { reachable: true, centerId: value['centerId'], version: value['version'] },
      }
    return { kind: 'unreachable', why: 'peer anomaly: not a public health reply' }
  }
  if (isOtherEntryAnswer(value)) return { kind: 'entry', answer: value }
  if (isRecord(value) && Object.keys(value).length === 1) {
    if ('result' in value) return { kind: 'result', value: value['result'] }
    if (typeof value['failure'] === 'string') return { kind: 'failure', name: value['failure'] }
  }
  return { kind: 'unreachable', why: 'peer anomaly: not an entry answer or a route result' }
}

/** 运维面的答复：一份完整体检（EC S-26），体按 JSON 读成对象；读不成 ⇒ `undefined`（问不到）。 */
export function readFullHealth(wire: Wire): Record<string, unknown> | undefined {
  const answer = parseHttpAnswer(wire.received)
  if (typeof answer === 'string' || answer.status !== 200) return undefined
  const json = readJson(answer.body)
  return json.ok && isRecord(json.value) ? json.value : undefined
}

/** 体的写出规则（HB S-12）里不依赖 Schema 的那一半：无空白、字符串按 RFC 8785 写——重新序列化与原文逐字相同。 */
export function isCompactCanonical(body: Buffer): boolean {
  const json = readJson(body)
  return json.ok && Buffer.from(JSON.stringify(json.value), 'utf8').equals(body)
}

// ---- 一次来往 ----

/** 一次来往的全部可观察事实：发了什么字节、线上发生了什么、读成了什么。 */
export interface Exchange {
  readonly label: string
  readonly face: 'client' | 'ops'
  readonly request: Buffer
  readonly wire: Wire
  readonly reply: Reply
}

/** 每一次来往之后调用（套件据此留证据、演练据此打印）。 */
export type Observer = (exchange: Exchange) => void

/** 一个据点侧的客户端：一个中心地址，加一个观察者。 */
export interface Client {
  readonly address: CenterAddress
  readonly protocolVersion: string
  readonly observe: Observer | undefined
}

export function client(
  address: CenterAddress,
  options: { readonly protocolVersion?: string; readonly observe?: Observer } = {},
): Client {
  return {
    address,
    protocolVersion: options.protocolVersion ?? PROTOCOL_VERSION,
    observe: options.observe,
  }
}

async function exchange(
  c: Client,
  label: string,
  request: Buffer,
  expect: 'envelope' | 'public-health',
): Promise<Exchange> {
  const wire = await sendTls(c.address, request)
  const result: Exchange = { label, face: 'client', request, wire, reply: readReply(wire, expect) }
  c.observe?.(result)
  return result
}

/** 发一个信封：`presentation` 为 `undefined` 就不带出示物。 */
export function call(
  c: Client,
  route: RouteName,
  payload: Readonly<Record<string, unknown>>,
  presentation: string | undefined,
  label: string = route,
): Promise<Exchange> {
  const body = envelopeBody({
    protocolVersion: c.protocolVersion,
    ...(presentation === undefined ? {} : { presentedLoginState: presentation }),
    operation: ROUTE[route],
    payload,
  })
  return exchange(c, label, httpRequest(body, c.address.servername), 'envelope')
}

/** 发任意请求体（或整份自拼的报文外形），按信封的读法读答复。 */
export function callRaw(
  c: Client,
  label: string,
  body: string | Buffer,
  shape: RequestShape = {},
): Promise<Exchange> {
  return exchange(c, label, httpRequest(body, c.address.servername, shape), 'envelope')
}

/** 公开体检（EC S-18）：不带信封，任何人都能读。 */
export function publicHealth(
  c: Client,
  label = 'public-health',
  shape: RequestShape = {},
): Promise<Exchange> {
  return exchange(
    c,
    label,
    httpRequest(PUBLIC_HEALTH_BODY, c.address.servername, shape),
    'public-health',
  )
}

/** 运维面（EC S-25／S-26）：本机套接字上任何请求都答完整体检。 */
export async function fullHealth(
  socketPath: string,
  label = 'full-health',
  body: string | Buffer = '{}',
  shape: RequestShape = {},
  observe?: Observer,
): Promise<Exchange & { readonly health: Record<string, unknown> | undefined }> {
  const request = httpRequest(body, 'localhost', shape)
  const wire = await sendUnix(socketPath, request)
  const health = readFullHealth(wire)
  const reply: Reply =
    health === undefined
      ? { kind: 'unreachable', why: parseHttpAnswerReason(wire) }
      : { kind: 'result', value: health }
  const result = { label, face: 'ops' as const, request, wire, reply, health }
  observe?.(result)
  return result
}

function parseHttpAnswerReason(wire: Wire): string {
  const answer = parseHttpAnswer(wire.received)
  if (typeof answer === 'string')
    return wire.error === undefined ? answer : `${answer} (${wire.error})`
  return `status ${answer.status}`
}

/** 读成功的结果；不是成功 ⇒ 抛出，说明拿到的是什么（演练与套件的前置步骤用）。 */
export function resultOf(e: Exchange): unknown {
  if (e.reply.kind !== 'result')
    throw new Error(`${e.label}: expected a result, got ${describe(e)}`)
  return e.reply.value
}

/** 一次来往读成了什么，一行字。 */
export function describe(e: Exchange): string {
  const reply = e.reply
  switch (reply.kind) {
    case 'unreachable':
      return `unreachable (${reply.why})`
    case 'entry':
      return reply.answer
    case 'result':
      return `result ${JSON.stringify(reply.value)}`
    case 'failure':
      return `failure ${reply.name}`
    case 'public-health':
      return `public health ${JSON.stringify(reply.value)}`
  }
}
