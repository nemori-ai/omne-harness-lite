// MCP 限界上下文：值对象。
// 成员落点：@omne-harness/mcp-contract 的公开根。

import type { Brand, JsonValue, TenantId } from '../shared.ts'

// ───────────── 品牌原始值 ─────────────

export type EndpointName = Brand<string, 'EndpointName'>
/** 接入点持有：资产一侧的持有引用（带层与作用域），对 MCP 不透明，只比较相等。 */
export type EndpointHolding = Brand<string, 'EndpointHolding'>
/** 采用修订：由 AdoptionView 交出；正文或任一配值变化，修订就变。 */
export type AdoptionRevision = Brand<string, 'AdoptionRevision'>
/** 凭据配值的引用：指向本租户的一份 MCP 凭据，不是秘密值。 */
export type CredentialBinding = Brand<string, 'CredentialBinding'>
/** 对端动作名：原样保存，项名 execute:<动作名> 只由它决定。 */
export type ActionName = Brand<string, 'ActionName'>
/** 定义的内容摘要：lastLawful 的内容摘要。定义一变，它就变。 */
export type DefinitionDigest = Brand<string, 'DefinitionDigest'>
/** 连接代际：每次重建加一。迟到响应按代际识别。 */
export type Generation = Brand<number, 'Generation'>
/** 清单修订：每次成功采用加一。 */
export type CatalogRevision = Brand<number, 'CatalogRevision'>
/** 调用方给出的关联键。它不是 MCP 的身份，只用来在在途表里定位请求号。 */
export type CorrelationKey = Brand<string, 'CorrelationKey'>
export type RequestState = Brand<string, 'RequestState'>
export type TaskId = Brand<string, 'TaskId'>
export type ProtocolVersion = Brand<string, 'ProtocolVersion'>
/** 时长（毫秒），正数。 */
export type Millis = Brand<number, 'Millis'>

/** 不可信：对端自报的内容。类型上与可信值分开，不能直接当作身份或授权依据。 */
export type Untrusted<T> = Readonly<{ untrusted: T }>

// ───────────── 接入点 ─────────────

export type EndpointRef = Readonly<{ name: EndpointName; holding: EndpointHolding }>

export type AuthKind = 'none' | 'static' | 'oauth'

export type StdioLaunch = Readonly<{
  command: string
  args: readonly string[]
  cwd?: string
  envNames: readonly string[] // 只写变量名，不写值
  facilities: readonly string[]
}>

/** 传输种类写在正文里，加载期就能判定「可能启动本机命令」。 */
export type TransportDeclaration =
  | Readonly<{ kind: 'stdio'; launch: StdioLaunch }>
  | Readonly<{ kind: 'streamable-http' }> // 远端地址是连接目标设置，不在正文里

export type EndpointDefinition = Readonly<{
  name: EndpointName
  transport: TransportDeclaration
  auth: AuthKind
}>

/** 连接目标：只对 Streamable HTTP。句法已校验的绝对 http(s) 地址。 */
export type ConnectionTarget = Brand<string, 'ConnectionTarget'>

/** 三项固定设置的配值。缺值如实为 undefined，不补缺省值。 */
export type EndpointSettings = Readonly<{
  target?: ConnectionTarget
  credential?: CredentialBinding
  connectTimeout?: Millis
}>

/**
 * 对端账号：由凭据配值唯一确定（「换账号属于配值变更」）。
 * 认证方式为 none 时是 anonymous。一个事实一个来源：只由 peerAccountOf 派生。
 */
export type PeerAccount =
  | Readonly<{ kind: 'anonymous' }>
  | Readonly<{ kind: 'credential'; binding: CredentialBinding }>

// ───────────── 键 ─────────────

/** MCP 连接的键。不同租户、不同对端账号永不共用一条连接。 */
export type ConnectionKey = Readonly<{
  tenant: TenantId
  holding: EndpointHolding
  adoptionRevision: AdoptionRevision
  account: PeerAccount
}>

/** MCP 动作清单的键。不含协议版本与采用修订：换版本不让已知动作离开清单。 */
export type CatalogKey = Readonly<{
  tenant: TenantId
  account: PeerAccount
  holding: EndpointHolding
}>

// ───────────── 对端 ─────────────

export type PeerIdentity = Readonly<{
  protocolVersion: ProtocolVersion
  capabilities: JsonValue
  serverInfo: Untrusted<JsonValue>
  instructions?: Untrusted<Readonly<{ text: string; truncated: boolean; digest: string }>>
}>

/** 对端动作的最近合法定义，按对端原样保存；只读出 MCP 自己要用的两项。 */
export type ActionDefinition = Readonly<{
  name: ActionName
  taskSupport: 'forbidden' | 'optional' | 'required'
  raw: JsonValue // title、description、schemas、annotations（不可信）、_meta、icons，原样
}>

export type KnownActionId = Readonly<{ endpoint: EndpointName; action: ActionName }>

export type CallMode = 'direct' | 'task'
