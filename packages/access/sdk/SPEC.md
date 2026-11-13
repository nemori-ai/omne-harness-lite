# 客户端 SDK 行为规格

本页拥有治理协议、会话协议与 HITL 协议的客户端职责。消息字段和 `outcome` 的含义只归[公开契约](../public-contract/SPEC.md)。路径、方法、状态码、SSE 格式和两端共用的[客户端规则](../public-contract/docs/http-binding.md#客户端规则)只归[承载绑定页](../public-contract/docs/http-binding.md)。SDK 引用那一页，不复制它。

下列条款由 #978 波 1 设计点 DP-2 采用，依据是 DP-2 决策记录（评论 6561904972）与 R1-D27（评论 6562041248）：本段第一段对会话协议和承载页的引用、「[会话客户端](#会话客户端)」与「[HTTP 传输适配](#http-传输适配)」两节、「[自动再送与缓存](#自动再送与缓存)」中把规则扩到会话操作的两句、「[验证](#验证)」一节中会话客户端与 HTTP 适配的验证义务、「[已知限制](#已知限制)」整节。其余条款保持原有的采用状态。「[HITL 客户端](#hitl-客户端)」一节、HTTP 传输适配的 `hitl` 位置，以及「[验证](#验证)」中 HITL 客户端的验证义务，按系统架构的[领域能力的公开位置](../../../docs/architecture/layers-and-dependencies.md#领域能力的公开位置)写定。

## 客户端职责

SDK 是调用者使用完整 Harness 治理消息的客户端入口。它持有调用者提供的传输适配，以及调用者交给它的登录证明。它把请求交给传输适配。它只把带有相同 `messageId` 的响应交给该次调用。没有 `messageId` 的 `protocol-rejected` 不记到任何一次调用上。该次调用的字节可能已经发出时，调用者仍没有可信答复。

注册和签发登录之前，调用者必须已经选定对端信任材料。信任核验失败时，SDK 不发送凭据或登录证明。

SDK 对同一个 `outcome` 使用公开契约里的解释。它不另定拒绝原因，也不把超时写成没有业务效果。

## 会话客户端

会话客户端使用公开契约的会话一组编解码函数。它发送 `session-public/1` 的消息，覆盖公开契约的八个会话操作，`read-session-diagnostics` 在内。两个观察操作和观察客户端在后续波。公开契约的会话编解码函数不读写观察消息，所以公开契约提供观察消息的函数之前，SDK 不发观察操作。

- 会话客户端只把带有相同 `messageId` 的响应交给该次调用，规则同治理客户端。
- 会话客户端把 `loginProof` 放进消息体。它不把登录证明写进 HTTP 头、日志或错误文本。
- 调用者在首次发送前生成 `createCallId`、`acceptId`、`inputId` 和 `controlId`，并在重试同一意图时保持不变。SDK 不替调用者换这些标识。`messageId` 不在此列。它只关联一次发送，不是去重键，调用者每次调用可以生成新的 `messageId`，见公开契约的[共同消息](../public-contract/SPEC.md#共同消息)。SDK 的自动再送发送同一份字节，所以沿用同一个 `messageId`。
- 调用者不填写 `SessionOperationId`、登录或操作身份。SDK 不提供这样的参数。
- 会话操作得到 `unknown`，或没有收到可信答复时，SDK 把它交给调用者。再送和认回由调用者发起，规则见承载页的客户端规则。
- SDK 重新导出调用者构造请求所需的公开契约类型与编码入口。CLI 因此只依赖 SDK，不直接导入公开契约。
- `read-session-diagnostics` 没有专门的方法。调用者用 `submit` 发它，与其他会话操作一样。SDK 重新导出公开契约的[会话诊断页](../public-contract/SPEC.md#会话诊断页)类型（`SessionDiagnosticsPage`、`SessionRunDiagnostic`、`SessionDiagnosticGap` 等），调用者按这些类型读成功的 `body`。SDK 只在公开契约读过响应之后才交出 `body`，所以 `body` 已经有契约的形状。

```ts
type SessionClient = {
  submit(message: unknown): Promise<CallerResult>
}
```

`SessionClient` 与 `GovernanceClient` 对称，由同一个传输适配构造。上面是设计形状，本包现在不导出它。

## HITL 客户端

HITL 客户端由 `createHitlClient` 构造。它使用公开契约的 HITL 一组编解码函数，发送 `hitl-public/1` 的消息，覆盖公开契约的四个 [HITL 公开操作](../public-contract/SPEC.md#hitl-公开操作)：`list-cards`、`read-card`、`submit-reply` 与 `query-submit-reply`。一个位置对应一个客户端，交付面只经这个客户端读卡和答复。

- HITL 客户端只把带有相同 `messageId` 的响应交给该次调用，规则同治理客户端。
- HITL 客户端把 `loginProof` 放进消息体。它不把登录证明写进 HTTP 头、日志或错误文本。
- 调用者在首次发送前生成 `replyId`，并在重试同一次提交时保持不变。人的新一次处理用新的 `replyId`。SDK 不替调用者换这个标识。
- 调用者不填写提交身份、操作者或位置引用。SDK 不提供这样的参数。
- `submit-reply` 得到 `unknown`，或没有收到可信答复时，SDK 把它交给调用者。再送和认回由调用者发起：用同一 `replyId` 原样再送，或用同样的内容发 `query-submit-reply`。
- 会话入口与待办池是同一个 `list-cards`。调用者用 `filter` 的 `sessionRef` 区分，SDK 不另设方法。
- SDK 重新导出调用者构造 HITL 请求和读取卡片视图所需的公开契约类型。CLI 因此只依赖 SDK，不直接导入公开契约。SDK 只在公开契约读过响应之后才交出 `body`，所以 `body` 已经有契约的形状。
- SDK 不缓存卡片视图，也不据本地状态判断一张卡能否答复。卡片能否答复以服务端这一次的结果为准。

```ts
type HitlClient = {
  submit(request: HitlRequest): Promise<CallerResult>
}

function createHitlClient(options: ClientOptions): HitlClient
```

`HitlClient` 与 `SessionClient` 对称，由同一种传输适配构造。`HitlRequest` 是公开契约的 HITL 请求类型。上面是设计形状。

## HTTP 传输适配

SDK 提供一个基于 `fetch` 的 HTTP 传输适配，实现 `GovernanceTransport` 的形状。该形状对三个位置通用。CLI 通过它发请求，不自己写 HTTP。调用者仍然可以交入自己的传输适配。

适配按[承载绑定表](../public-contract/docs/http-binding.md#承载绑定表)工作。

- 适配实例绑定一个位置和一个服务地址。它向该位置的固定路径发 POST。
- 适配不跟随重定向。登录证明在请求体里，重定向会把它送到别处。
- 适配按响应的 `Content-Type` 选择读取方式。响应是 JSON 时，无论状态码是什么，适配把完整的响应体字节作为 `response` 交出。所以 `unknown` 的状态 500 作为一条可读消息交给客户端。客户端再按 `messageId` 核对，读不出匹配的消息时，结果是 `uncertain`。
- 适配在下列情况报告 `not-sent`：连接在写出任何请求字节之前失败（连接被拒、地址不可达、连接超时），或调用者在请求开始前取消。
- 其他失败都报告 `uncertain`：已经写出部分请求字节后失败、响应体为空（例如 404、405、421 和响应体为空的 500）、响应不是 JSON，以及响应中途断开。

```ts
type HttpTransportOptions = {
  origin: string
  location: 'governance' | 'session' | 'hitl'
}

function createHttpTransport(options: HttpTransportOptions): GovernanceTransport
```

上面是设计形状，本包现在不导出它。

## 自动再送与缓存

本页每一个治理操作、会话操作和 HITL 操作都使用这一条再送规则。传输适配报告请求字节没有发出时，SDK 自动再送一次。字节已经发出，或适配不能证明没有发出时，SDK 不自动再送。未知效果不能靠这次再送重做。调用者自己发起的下一次调用是一次新调用，并遵守该操作自己的重复规则。

SDK 不缓存准入允许、登录证明或凭据。它不提供 `prefer-copy`。客户端应用可以保存屏幕投影。投影失败不改变已经返回的 `succeeded`。清掉投影不把 `unknown` 变成成功或没有发生。

这些治理调用、会话调用和 HITL 调用不刷新登录的空闲计时。`public-health` 不带登录证明，也不带行事租户。

## 客户端核心

子路径 `@omne-harness/sdk/core`（`src/core/`）是新地址 `/api/<协议名>/v<主版本>/<名字>` 的客户端核心。设计依据是 [RFC-0015](../../../docs/rfcs/RFC-0015-access-dynamic-registration.md#6-客户端) 第 6 节「客户端核心」，交付卡 #1249。上面三个手写的客户端与根入口不变。

`createClient(protocol, transport, settings?)` 从一份协议契约得到客户端 `ClientOf<P>`：每个操作是一个方法，`observe.<名字>` 是每个观察。消息体与帧都按契约的编解码写出、读回，类型从契约推出。消息体按契约写不出时抛 `ClientRequestError`，什么都不发。消息编号取 `options.messageId`，不给时取 `crypto.randomUUID()`。

一次调用的结果只有契约的结果，加上两种本地结果：

| 传输的结果 | 客户端怎样处理 |
| --- | --- |
| 有答复，结果在契约的结果集里，正文合它的编解码 | 交出解码后的答复 |
| 有答复，结果不认识或正文不合 | `uncertain` |
| `uncertain`：字节可能已经发出 | `uncertain`，不再送 |
| `not-sent`：可以证明一个字节也没发出 | 用同一个消息编号再送一次；仍是 `not-sent` 时答 `unavailable`，传输一共被调两次 |

两种本地结果都不写成成功或失败。

观察是一个异步生成器：每一帧按契约的帧编解码读出；生成器的返回值是怎样结束的。结束有五种：`ended`（带原因，原因要在契约的 `ends` 里，或是 `denied`、`unavailable`，否则算 `uncertain`）、`refused`（建立被拒，带结果）、`unavailable`（没发出）、`uncertain`（流在没有结束帧时断了，或帧不合契约）、`aborted`（调用方中止）。提案把观察写成只给帧的 `AsyncIterable`；这里把结束放进生成器的返回值，`for await` 只看帧。

传输 `Transport` 有 `call` 与 `observe` 两个方法，负责带上身份，客户端核心看不到登录证明。本成员给两种：

- HTTP 传输 `createHttpProtocolTransport({ origin, credentials?, limits? })`。每次请求前读一次凭据来源：有登录证明时带 `Authorization: Bearer`，有租户时带 `Omne-Acting-Tenant`。它向 `<origin>/api/<名字>/v<主版本>/<操作或观察>` 发 POST，不跟随重定向。`fetch` 失败时，只有错误代码全属于「首字节写出之前」那一组才算 `not-sent`；浏览器的 `fetch` 给不出这种证明，所以在浏览器里一律是 `uncertain`。观察读 `text/event-stream`，用 `eventsource-parser`（工作区目录钉的 3.1.1）切出事件；调用方中止或提前离开迭代时，取消读流，关掉连接。
- 进程内传输 `createInProcessTransport(peer)`，测试用。每个消息体、开头与帧都写成 JSON 文本再读回，两边不共享值。

客户端核心的源码不导入 Node 专有的模块，也不导入本成员里用了 `node:crypto` 的 `user-message.ts`。

### 浏览器夹具

[tests/fixtures/browser/](tests/fixtures/browser/main.ts) 是客户端核心的浏览器消费者。它只导入 `@omne-harness/sdk/core` 与公开契约，按 `source` 条件编译源码，类型库是 ES2024 加 DOM，不带 Node 类型。这次编译是慢层成员测试 [tests/browser-fixture.spec.ts](tests/browser-fixture.spec.ts) 的一条；核心里加一行 `node:crypto` 的导入时它变红。

在无界面浏览器里跑它是一次性的证据，不进常驻检查。2026-11-13 在本机做过一次：在仓库根用 esbuild 0.28.2 打包（`--bundle --platform=browser --format=esm --conditions=source`），起服务端接入的测试入口 `packages/access/server-entry/tests/fixtures/entry-peer.ts`，用无界面 Chrome 打开导入打包结果的页面，页面参数是入口的地址。页面写出第一帧 `{"kind":"snapshot","revision":2,"protocols":[{"name":"notes","major":1},{"name":"access","major":1}]}`。入口不答 CORS 的预检，所以这次页面从 `file://` 打开，并加了 `--disable-web-security`，见[已知限制](#已知限制)。

### 演示

先 `pnpm run build`，再在本成员目录运行 `node tests/fixtures/core-demo.ts <一个在运行的服务端的地址>`。第一段订阅这个服务端的可用性，打印第一帧。第二段起测试入口，调一次 `read-note` 并打印答复，然后停掉入口，再调一次，打印 `{"outcome":"unavailable"}`。不带 `--conditions=source`：`eventsource-parser` 在这个条件下给出它自己的 TypeScript 源码，Node 不剥 `node_modules` 下文件的类型。

## 安装闭包

SDK 依赖公开契约，以及调用者提供的传输适配接口；客户端核心另依赖 json-text 与 `eventsource-parser`。它不依赖服务端接入。它不依赖服务器存储类型。

安装闭包以 SDK 发布产物的依赖清单为准。源码能够编译不能代替该清单。

## 设计签名

下面的类型和函数是设计形状。本包不导出它们。它们不是已经可安装的调用。

消息对象仍是公开契约里的请求和响应。本页不另写字段或 `outcome`。

```ts
type TransportReport =
  | { kind: 'response'; bytes: Uint8Array }
  | { kind: 'not-sent' }
  | { kind: 'uncertain' }

type GovernanceTransport = {
  send(bytes: Uint8Array): Promise<TransportReport>
}

type PublicResponse = {
  protocolVersion: string
  messageId: string
  outcome: string
  body: unknown
}

type CallerResult = { kind: 'response'; message: PublicResponse } | { kind: 'uncertain' }

type GovernanceClient = {
  submit(message: unknown): Promise<CallerResult>
}
```

`GovernanceTransport` 由调用者交入。`submit` 接收公开契约的共同消息，并带上这次发送的 `messageId`。传输字节先按公开契约读取，再核对这个 `messageId`。对上了才成为 `response`。读不出，或 `messageId` 不是这一次，结果是 `uncertain`，不再交成 `response`。

```ts
type ReadReport = { kind: 'message'; response: PublicResponse } | { kind: 'unreadable' }

async function submitOnce(
  transport: GovernanceTransport,
  bytes: Uint8Array,
  expectedMessageId: string,
  readPublicContract: (input: Uint8Array) => ReadReport,
): Promise<CallerResult> {
  const matched = (report: TransportReport): CallerResult | undefined => {
    if (report.kind !== 'response') return undefined
    const read = readPublicContract(report.bytes)
    if (read.kind !== 'message' || read.response.messageId !== expectedMessageId) {
      return { kind: 'uncertain' }
    }
    return { kind: 'response', message: read.response }
  }
  const first = await transport.send(bytes)
  if (first.kind === 'uncertain') return { kind: 'uncertain' }
  const firstResult = matched(first)
  if (firstResult) return firstResult
  const second = await transport.send(bytes)
  const secondResult = matched(second)
  if (secondResult) return secondResult
  return { kind: 'uncertain' }
}
```

`readPublicContract` 表示公开契约的严格读取。成功时 `response` 是那份共同响应，至少含 `protocolVersion`、`messageId`、`outcome` 和 `body`。`body` 里的结果字段仍只由公开契约定义。本页不实现解析器。核对通过后，调用者拿到的是这份 `response`，不是读取标签。适配报告 `not-sent` 时，`matched` 没有结果，函数再送一次。第二次仍是 `not-sent`，或任一次报告 `uncertain`，调用者得到 `uncertain`。`uncertain` 不是业务成功，也不是没有发生。

```ts
function revokeOwnLogin(
  client: GovernanceClient,
  proof: string,
  targetLoginId: string,
): Promise<CallerResult> {
  return client.submit({
    protocolVersion: 'governance-public/1',
    messageId: 'caller-generated',
    operation: 'revoke-login',
    loginProof: proof,
    body: { targetLoginId },
  })
}
```

`messageId` 的值只是占位。`revoke-login` 的字段表禁止行事租户。这个调用不带 `actingTenant`。字段表写明必填的操作才带上当前选择。

## 验证

SDK 不另写结果含义。必须遵守的客户端规则是自动再送条件和不缓存允许。下列输入的结果以公开契约为准。

- 字段表要求登录证明时，缺失或空字符串只有 `denied`。字段表禁止该字段时，出现该字段是 `protocol-rejected`。
- 留存期内的接续在激活完成时是 `succeeded`。已经激活后再注册是 `not-loginable`。
- 陌生账号接受邀请是 `not-visible`。过期且有权看见的邀请返回已有的过期终结。看不见时是 `not-visible`。
- `query-current-tenant` 不带行事租户。
- `issue-login` 的 `basis-unavailable` 不来自凭据已匹配的分支。
- 版本是 `governance-public/1` 时，`disable-subject`、`restore-subject`、`end-subject` 和 `reopen-after-media-loss` 在坏正文和坏证明下都是 `stage-not-provided`。版本不是 `governance-public/1` 时是 `protocol-rejected`。
- 部署声明不提供的治理操作，答复是空 `body` 的 `stage-not-provided`，见公开契约的[部署声明不提供的操作](../public-contract/SPEC.md#部署声明不提供的操作)。客户端把它交成这次调用的 `response`，不是 `uncertain`，也不再送。`messageId` 对不上或 `body` 不为空的这类答复仍是 `uncertain`。
- `issue-login` 成功响应的可选 `loginId` 原样交给调用者。缺席时照常读出。格式不合法时，公开契约读不出该响应，结果是 `uncertain`。

会话客户端与 HTTP 适配另有下列验证义务。

- 会话操作的往返用环回服务端替身通过，响应按 `messageId` 关联。
- 零字节再送只发生一次。写出部分字节后失败不再送。
- 非回环地址的构造失败。
- 重定向响应不被跟随，结果是 `uncertain`。
- 状态 500 且响应体是匹配的 `unknown` 消息时，调用者得到 `response`，`outcome` 是 `unknown`。响应体为空的 500 得到 `uncertain`。
- 任何输出、日志和错误文本都不含登录证明与凭据。

客户端核心另有下列验证义务（交付卡 #1249）。

- 消息体按契约写出、答复按契约读回；传错形状、不存在的操作在编译期失败（`tests/core.spec-d.ts`）。
- 进程内传输注入三种结果：`not-sent` 后再送一次且编号不变，两次都 `not-sent` 答 `unavailable`；`uncertain` 不再送；契约之外的答复是 `uncertain`（`tests/core-client.spec.ts`）。
- HTTP 传输对着真的入口：入口不在时两次 `not-sent`、答 `unavailable`；请求发出后入口死掉时一次 `uncertain`；不登录订阅可用性得到快照；测试协议的观察读出三帧与结束原因；中止或 `break` 关掉连接，入口那一侧的帧来源收到中止；建立被拒读成 `refused`（`tests/core-http.spec.ts`）。测试入口是服务端接入的 `tests/fixtures/entry-peer.ts`，以进程启动，因为本成员不导入服务端接入。

HITL 客户端另有下列验证义务。

- 四个 HITL 操作的往返用环回服务端替身通过，响应按 `messageId` 关联。
- `location` 为 `hitl` 的适配向 `/hitl-public/1` 发 POST。
- 部署声明不提供的 HITL 操作，答复是空 `body` 的 `stage-not-provided`。客户端把它交成这次调用的 `response`，不再送。
- `submit-reply` 的状态 500 且响应体是匹配的 `unknown` 消息时，调用者得到 `response`，`outcome` 是 `unknown`。SDK 不自动换 `replyId` 重发。

## 已知限制

- M2 的适配只接受 `127.0.0.1` 或 `localhost` 上的 `http:` 地址。其他地址的构造失败，包括 `https:`。这是 M2 的范围限制，不是登录证明的保护规则。M2 的服务只在回环地址上提供明文，见承载页的[已知限制](../public-contract/docs/http-binding.md#已知限制)。远程访问或 TLS 进入范围时，适配的这条限制随之改。
- 「[客户端职责](#客户端职责)」要求注册和签发登录之前选定对端信任材料。M2 的明文回环连接没有可以核验的信任材料。M2 用上一条的回环地址限制代替这项核验，适配不要求调用者给出信任材料。TLS 进入范围时，这项核验随之生效。
- 会话观察客户端不在波 1。
- 客户端核心在浏览器里只能对同源的入口用：入口不答 CORS 的预检，跨源的页面要等入口支持它。在浏览器里，`fetch` 的失败一律是 `uncertain`，不会自动再送。
