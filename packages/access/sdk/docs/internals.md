# 客户端 SDK 内部设计

行为以[成员行为规格](../SPEC.md)为准。结果含义以公开契约为准。路径、状态码和客户端规则以[承载绑定页](../../public-contract/docs/http-binding.md)为准。

## 接缝

SDK 持有传输适配和登录证明。它不解释 `outcome`。自动再送只发生在请求字节没有发出的时候。允许结果不进入 SDK 的缓存。信任核验失败时，SDK 不发送凭据或登录证明。

本成员不依赖服务端接入。

## 模块

| 模块                    | 责任                                                                              |
| ----------------------- | --------------------------------------------------------------------------------- |
| `src/transport.ts`      | `GovernanceTransport` 与 `TransportReport` 的形状。传输适配只见字节，不见消息。   |
| `src/http-transport.ts` | `createHttpTransport`。地址校验、`fetch` 调用、`not-sent` 与 `uncertain` 的分类。 |
| `src/client.ts`         | 两个客户端。编码、发送、再送、读响应、核对 `messageId`。                          |
| `src/tenant.ts`         | `parseTenantText` 与 `tenantText`。                                               |
| `src/user-message.ts`   | `userTextMessage`。                                                               |
| `src/limits.ts`         | 客户端缺省的 json-text 预算。                                                     |

## 客户端怎样关联响应

`deliver` 持有再送规则，两个客户端共用它。客户端把请求交给公开契约编码，再把响应字节交给公开契约的 `readSessionResponse` 或 `readGovernanceResponse`，并传入本次的 `messageId`。读取函数返回 `response` 才交出结果。返回 `unmatched` 或 `unreadable` 时，结果是 `uncertain`，不再送。公开契约已经证明字节是严格 JSON，所以交给调用者的 `message` 是对同一份字节再做一次 `JSON.parse` 的结果。它是线上形状，租户标识和时刻是文本。

没有 `messageId` 的 `protocol-rejected` 读成 `unmatched`，不记到任何一次调用上。

## 传输适配怎样分类失败

- 只有连接在写出第一个请求字节之前失败，才报 `not-sent`。判据是错误原因的系统码属于固定的一组：`ECONNREFUSED`、`ENOTFOUND`、`EAI_AGAIN`、`EHOSTUNREACH`、`ENETUNREACH`、`EADDRNOTAVAIL`、`UND_ERR_CONNECT_TIMEOUT`。双栈解析失败时，错误带一组子错误，所有子错误都要在这一组里。
- 其余失败都报 `uncertain`。包括 `ECONNRESET`、取消发生在请求开始之后、响应中途断开、响应不是 JSON 和响应体为空。保守的一边是 `uncertain`，因为它阻止再送。
- 调用者在 `send` 开始前取消，报 `not-sent`。

`fetch` 用 `redirect: 'manual'`，所以登录证明不会随重定向送到别处。

## 为什么租户文本借用请求编解码

公开契约不导出身份编解码，SDK 的依赖里也没有身份包。`TenantId` 只有身份包的编解码能铸造。`parseTenantText` 把文本放进一份探测用的 `query-create-session` 请求，交给 `readSessionRequest`，取出读到的租户。`tenantText` 反向用 `encodeSessionRequest`。这两个函数的行为就是公开契约的租户读写规则，没有第二份规则。公开契约若导出身份编解码，这两个函数改为直接调用它们。

## 验证与维护

改再送或缓存规则时只改本成员规格，并核对它没有抄出第二份结果表。改传输适配的失败分类时，同时改 `tests/http-transport.spec.ts` 里对应的真实服务器用例。
