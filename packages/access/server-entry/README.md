# 服务端接入

本成员拥有治理位置与会话位置的入口职责。消息和 `outcome` 的含义只归[公开契约](../public-contract/SPEC.md)。路径、方法、状态码、请求体上限与 SSE 格式只归公开契约的[承载绑定](../public-contract/docs/http-binding.md)（候选，待批复：#978 DP-2）。本成员的行为在[行为规格](SPEC.md)，实现的组织在[内部设计](docs/internals.md)。

## 阅读路径

服务端实现者先读公开契约的判断次序，再读行为规格的[位置与操作范围](SPEC.md#位置与操作范围)，最后读本页的用法。装配者读本页的「使用」和「配置」。

## 使用

公开入口只有一个构造函数：

```ts
import { createServerEntry } from '@omne-harness/server-entry'

const entry = createServerEntry({
  config: {
    listenAddress: '127.0.0.1',
    listenPort: 0,
    maxBodyBytes: { small: 16384, input: 1048576 },
    heartbeatIntervalMs: 15000,
    jsonBudgets: {
      maxDepth: 32,
      maxItems: 65536,
      maxMembers: 1024,
      maxStringLength: 1048576,
      maxNumberLength: 64,
    },
    maxPageBytes: 1048576,
    historyKinds: ['message.user', 'message.assistant'],
    observation: { perLogin: 4, perInstance: 1000, cancelRetentionMs: 60000 },
  },
  dependencies: { identity, issuer, session, resolveDefinition, diagnostics },
})
const { address, port } = await entry.start()
await entry.stop()
```

上面的数值只是示例。初值归装配配置，本成员不写死任何初值。

- `start()` 只在 `127.0.0.1` 上监听，明文 HTTP/1.1。`listenAddress` 是其他地址时，`start()` 以 `ServerEntryConfigError` 拒绝，不改写地址。`listenPort` 为 0 时由宿主分配端口，实际端口在返回值里。
- `stop()` 停止接受新连接，给每个活动观察发 `ended(unavailable)`，等在途请求写完答复，然后关闭全部连接。
- 两个位置的路径固定：`/governance-public/1` 与 `/session-public/1`。

### 依赖

| 依赖                | 类型                                                 | 本成员怎样用                                                                            |
| ------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `identity`          | identity 的 `IdentityOperations`                     | 治理位置的注册激活与签发登录；会话位置的登录识别                                        |
| `issuer`            | identity 的 `PrincipalIssuer`                        | 签发本成员的系统主体（`component` 为 `server-entry`），以及每个会话请求的代租户行事主体 |
| `session`           | `SessionIngressFaces`（本成员声明的 Session 面子集） | 会话位置的七个操作与观察建立时的读取资格核对。真实 `SessionService` 按结构满足它        |
| `resolveDefinition` | `DefinitionResolver`                                 | `create-session` 把定义名解析为创建采用字段。返回 `undefined` 时答 `invalid`            |
| `diagnostics`       | `DiagnosticSink`，可省略                             | 结构化诊断事件。事件不含正文、登录证明、凭据、主体或依赖的错误文本                      |

### 配置

| 字段                                                                               | 含义                                                                     |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `listenAddress`、`listenPort`                                                      | 监听地址只能是 `127.0.0.1`；端口 0 表示由宿主分配                        |
| `maxBodyBytes.small`、`maxBodyBytes.input`                                         | 治理路径与会话路径的请求体上限。它也是该路径 json-text 读取的 `maxBytes` |
| `heartbeatIntervalMs`                                                              | SSE 心跳间隔                                                             |
| `jsonBudgets`                                                                      | json-text 读取的其余五项预算                                             |
| `maxPageBytes`                                                                     | `read-history` 的 `pageBytes` 上界                                       |
| `historyKinds`                                                                     | `read-history` 披露的条目种类                                            |
| `observation.perLogin`、`observation.perInstance`、`observation.cancelRetentionMs` | 每个登录与本实例的观察并发上界；观察结束后记录的保留期                   |

## 本阶段提供什么

- 治理位置只提供 `register-and-activate` 与 `issue-login`。其余 32 个操作答 `stage-not-provided`，见行为规格的[治理位置的偏离](SPEC.md#治理位置的偏离)。
- 会话位置提供七个会话操作与两个观察操作。观察在本阶段只有确认、心跳与 `ended` 帧，不定位 Model 调用，见内部设计的[本阶段的观察范围](docs/internals.md#本阶段的观察范围)。
- 本成员不调用 authorization。会话操作的资格由 Session 的面裁定。

## 已知限制

- 明文、只绑回环。TLS 与远程访问不在 M2。
- 观察不发 `state`、`refreshing`、`snapshot`、`delta`、`gap`，重附着与刷新归联调。
- 成功业务访问报告尚未定义，会话操作不刷新登录的空闲计时。
- `startRun` 时不再核登录是否仍有效。
- 观察记录只在本实例内存里，多实例部署的粘性路由由部署另行给出。
- Tool 目标的 `stop-call` 先到达 Session 的 `stopCall`，接入再把对外答案定为 `unsupported`。「不写任何记录」由 Session 的契约承诺（`stopCall` 对 Tool 目标在会话存在核对之前返回 `unsupported`），接入只兜住对外答案，挡不住一个不按契约写入的 Session。
- `send-input` 交给 Session 的输入来源（`origin.record`）带登录状态文本。真实 Session 若把来源写进历史条目的 `payload`，`read-history` 会原样透传它。来源是否入 `payload`、登录状态文本是否机密，归 Session 与 identity 的拥有者，本成员不替它们裁定。

## 验证

在本目录运行 `pnpm run build`、`pnpm run typecheck` 与 `NO_COLOR=1 pnpm exec vitest run`。用例经真实回环 HTTP 调用本成员，用 identity 的 `./testing` 参考替身、进程内主体权威与测试目录里的 Session 面替身。用例清单在[内部设计](docs/internals.md#验证与维护)。替身通过不证明真实 Session、持久 identity 或跨进程主体来源。

## English promise

This member owns the entry duties of the governance and session locations. Outcome meanings stay in the public contract; the HTTP carriage stays in its binding page. The entry listens on 127.0.0.1 only, stops at the first terminal result, does not rewrite an identity or Session result, keeps no login table, and never puts a login proof, a credential or an issuer into an output. At this stage the governance location provides registration and login issue only, and an observation stream carries the confirmation, heartbeats and the `ended` frame only.
