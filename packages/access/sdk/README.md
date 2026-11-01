# 客户端 SDK

本成员拥有治理协议和会话协议的客户端职责。消息和 `outcome` 的含义只归[公开契约](../public-contract/SPEC.md)。路径、方法、状态码和客户端规则归[承载绑定页](../public-contract/docs/http-binding.md)。本页的行为在[行为规格](SPEC.md)。

## 阅读路径

客户端实现者先读公开契约的结果表和承载绑定页，再读本成员的自动再送和缓存规则。内部说明见[内部设计](docs/internals.md)。

## 使用

SDK 把请求交给传输适配。传输适配可以是调用者自己的实现，也可以是 `createHttpTransport`。注册和签发登录之前，调用者必须已经选定对端信任材料。信任核验失败时，SDK 不发送凭据或登录证明。传输适配证明请求字节没有发出时，SDK 自动再送一次。它不缓存准入允许。

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

| 导出                                            | 作用                                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `createSessionClient`、`createGovernanceClient` | 由一个传输适配构造的客户端。`submit` 编码请求，发送，读响应，并只交出 `messageId` 相同的那一份。             |
| `createHttpTransport`                           | 基于 `fetch` 的传输适配，绑定一个位置和一个回环 `http:` 地址。                                               |
| `RequestInvalidError`                           | 请求的本地模型不合公开契约。没有发送任何字节。                                                               |
| `parseTenantText`、`tenantText`                 | 租户文本与租户标识互转。公开契约不导出身份编解码，所以这两个函数借用它的请求编解码。                         |
| `userTextMessage`                               | 构造 `send-input` 的用户消息。消息标识由 `inputId` 导出，所以保持 `inputId` 与文本不变的重试发送同一份内容。 |

`CallerResult` 只有两种。`response` 带公开契约核对过的响应。`uncertain` 表示调用者没有可信答复。`uncertain` 不是业务成功，也不是没有发生。

安装闭包只含公开契约，不含服务端接入，也不含服务器存储类型。

## 验证

测试经包名导入构建后的 `dist`，所以先在本目录运行 `pnpm run build`。

- `tests/http-transport.spec.ts`：对 `127.0.0.1` 上的真实 HTTP 服务器核对地址限制、路径、状态码与响应体、重定向、连接被拒、中途断开和取消。
- `tests/session-client.spec.ts`：会话七个操作和一个治理操作的往返、`messageId` 关联（含交叉答复）、零字节再送一次、字节已发出后不再送，以及错误文本不含登录证明。
- `tests/public-entry.spec.ts`：核对运行时导出清单。

未覆盖：

- 没有对真实服务端接入的往返。服务端接入由另一个成员提供，往返由线负责人在它合入后另行运行。
- 没有 TLS、非回环地址和观察客户端。这些是[已知限制](SPEC.md#已知限制)。
- 没有测试连接超时。`UND_ERR_CONNECT_TIMEOUT` 只在错误码表里。
- 没有在 Windows 以外的平台运行。

## English promise

This member owns the client duties for the governance and session protocols. Outcome meanings stay in the public contract. The SDK resends once only when the transport proves the request bytes were not sent. It does not cache an allow result. A failed trust check sends neither a credential nor a login proof. The HTTP transport accepts only a loopback `http:` origin, does not follow redirects, and reports `not-sent` only when no request byte can have left.
