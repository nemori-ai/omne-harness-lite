# 客户端 SDK

[English](README.md)

本成员是调用者使用治理协议和会话协议的唯一客户端入口。它接收调用者提供的传输适配，把请求编码成公开契约的字节，发送，再把与本次调用对应的响应交回。调用者用它访问完整 Harness，不必自己写编解码和响应关联。

消息字段和 `outcome` 的含义只归[公开契约](../public-contract/SPEC.md)。路径、方法、状态码和两端共用的客户端规则归[承载绑定页](../public-contract/docs/http-binding.md)。本页的行为在[行为规格](SPEC.md)，实现的组织在[内部设计](docs/internals.md)。

## 职责与状态

本成员拥有治理客户端、会话客户端和基于 `fetch` 的 HTTP 传输适配。它不解释 `outcome`，不另定拒绝原因，也不保存登录表。

已实现：

- `createGovernanceClient` 与 `createSessionClient`。`submit` 编码请求，发送，读响应，只交出 `messageId` 相同的那一份。
- `createHttpTransport`。基于 `fetch` 的传输适配，绑定一个位置和一个回环 `http:` 地址。
- `parseTenantText`、`tenantText`、组织、账号与登录的身份文本函数，以及 `userTextMessage`。
- 自动再送：只有传输适配证明请求字节没有发出时才再送一次。
- `read-session-diagnostics` 页的类型（`SessionDiagnosticsPage`、`SessionRunDiagnostic`、`SessionDiagnosticGap` 及其各部分），从公开契约透传。会话客户端用 `submit` 发这个操作，与其他七个操作一样。调用者按这些类型读成功的 `body`。

未实现：

- 两个观察操作和观察客户端。公开契约的会话编解码函数不读写观察消息，所以公开契约提供观察消息的函数之前，SDK 不发观察操作。

## 使用

SDK 把请求交给传输适配。传输适配可以是调用者自己的实现，也可以是 `createHttpTransport`。注册和签发登录之前，调用者必须已经选定对端信任材料。信任核验失败时，SDK 不发送凭据或登录证明。

```ts
import {
  createHttpTransport,
  createSessionClient,
  parseTenantText,
  userTextMessage,
} from '@omne-harness/sdk'

const transport = createHttpTransport({ origin: 'http://127.0.0.1:8787', location: 'session' })
const client = createSessionClient({ transport })
const tenant = parseTenantText(tenantText) // 租户文本来自 issue-login 的响应
if (tenant === undefined) throw new Error('not a tenant text')

const result = await client.submit({
  protocolVersion: 'session-public/1',
  messageId: crypto.randomUUID(),
  operation: 'send-input',
  proof: { kind: 'present', value: loginProof },
  body: {
    tenant,
    session,
    acceptId,
    inputId,
    message: userTextMessage('hello', inputId),
  },
})
// result.kind === 'response'：result.message.outcome 是公开契约的 outcome，body 是响应体。
// result.kind === 'uncertain'：没有可信答复。请求字节可能已经发出。
```

导出清单如下。

| 导出                                                                                                                                               | 作用                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createSessionClient`、`createGovernanceClient`                                                                                                    | 由一个传输适配构造的客户端。`submit` 编码请求，发送，读响应，并只交出 `messageId` 相同的那一份。                                                                   |
| `createHttpTransport`                                                                                                                              | 基于 `fetch` 的传输适配，绑定一个位置和一个回环 `http:` 地址。                                                                                                     |
| `RequestInvalidError`                                                                                                                              | 请求的本地模型不合公开契约。没有发送任何字节。                                                                                                                     |
| `parseTenantText`、`tenantText`                                                                                                                    | 租户文本与租户标识互转。两者调用公开契约的身份文本函数。                                                                                                           |
| `readOrganizationIdText`、`encodeOrganizationIdText`、`readAccountIdText`、`encodeAccountIdText`、`readLoginStateIdText`、`encodeLoginStateIdText` | 公开契约身份文本函数的转出。调用者把文本读成身份值，例如构造 `targetLoginId`，也可以写回文本。不合法的文本读出 `undefined`。写入身份包没有铸造的值抛 `TypeError`。 |
| `userTextMessage`                                                                                                                                  | 构造 `send-input` 的用户消息。消息标识由 `inputId` 导出，所以保持 `inputId` 与文本不变的重试发送同一份内容。                                                       |

调用者在首次发送前生成 `createCallId`、`acceptId`、`inputId` 和 `controlId`，并在重试同一意图时保持不变。SDK 不替调用者换这些标识。`messageId` 只关联一次发送，调用者每次调用可以生成新值。

## 契约

调用者得到两种结果，由 `CallerResult` 表达：

- `response` 带公开契约核对过的响应。调用者按公开契约解释 `outcome`。
- `uncertain` 表示调用者没有可信答复。请求字节可能已经发出，也可能没有发出。它不是业务成功，也不是没有发生。

稳定的承诺：

- 一次调用只收到 `messageId` 相同的响应。没有 `messageId` 的 `protocol-rejected` 不记到任何一次调用上。
- 传输适配只接受回环 `http:` 地址，不跟随重定向。
- 传输适配报告请求字节没有发出时，SDK 自动再送一次。字节已经发出，或适配不能证明没有发出时，SDK 不再送。
- SDK 不缓存准入允许、登录证明或凭据，也不提供 `prefer-copy`。
- 登录证明放进消息体。它不进 HTTP 头、日志或错误文本。
- 这些调用不刷新登录的空闲计时。

实现细节可以改变：内部模块划分、再送判据用到的系统错误码集合，以及 HTTP 传输适配用 `fetch` 的具体选项。

## 设计

SDK 持有传输适配和调用者交给它的登录证明。传输适配只见字节，不见消息。客户端把请求交给公开契约编码，再把响应字节交给公开契约的读取函数，并传入本次的 `messageId`。读取函数返回 `response` 才交出结果，返回 `unmatched` 或 `unreadable` 时结果是 `uncertain`。

再送规则只写在一次 `deliver` 里，两个客户端共用它。失败分类只有一边：连接在写出第一个请求字节之前失败才报 `not-sent`，其余失败都报 `uncertain`。保守的一边是 `uncertain`，因为它阻止再送。

`parseTenantText` 与 `tenantText` 调用公开契约的身份文本函数，所以身份文本规则只有公开契约一份。

## 配置与运行

调用者提供传输适配和登录证明。SDK 没有环境变量、时钟、数据库或网络配置。`createHttpTransport` 的选项只有两个：`origin` 与 `location`。

已接受 `outcome` 的调用者在收到 `unknown` 或 `uncertain` 时，自己决定是否再发起一次新调用。再发起是一次新调用，遵守该操作自己的重复规则。

已知限制：

- 只支持回环 `http:` 地址。TLS 和非回环地址不在本阶段。
- 没有观察客户端。
- `UND_ERR_CONNECT_TIMEOUT` 只在错误码表里，没有测试覆盖连接超时。

安装闭包只含公开契约，不含服务端接入，也不含服务器存储类型。

## 验证

测试经包名导入构建后的 `dist`，所以先在本目录运行 `pnpm run build`，再运行 `pnpm run test`。`pnpm run typecheck` 检查类型。

- `tests/http-transport.spec.ts`：对 `127.0.0.1` 上的真实 HTTP 服务器核对地址限制、路径、状态码与响应体、重定向、连接被拒、中途断开和取消。
- `tests/session-client.spec.ts`：会话八个操作和一个治理操作的往返、部署声明不提供的治理操作所得的 `stage-not-provided`、`issue-login` 成功响应可选的 `loginId`、`messageId` 关联（含交叉答复）、零字节再送一次、字节已发出后不再送，以及错误文本不含登录证明。
- `tests/public-entry.spec.ts`：核对运行时导出清单。

未覆盖：

- 没有对真实服务端接入的往返。服务端接入由另一个成员提供，往返由线负责人在它合入后另行运行。
- 没有 TLS、非回环地址和观察客户端。
- 没有测试连接超时。
- 没有在 Windows 以外的平台运行。

## 维护

改再送或缓存规则时，只改[行为规格](SPEC.md)，并核对它没有抄出第二份结果表。改传输适配的失败分类时，同时改 `tests/http-transport.spec.ts` 里对应的真实服务器用例。公开契约的会话编解码出口变化时，核对本成员的安装闭包。

本成员不依赖服务端接入。服务端接入和 SDK 各自拥有自己的消费者迁移。

[README_ZH.md](README_ZH.md) 是本页摘要，两者表达同一份承诺，修改时同步。
