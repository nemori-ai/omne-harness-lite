# 服务端接入

[English](README.md)

治理位置与会话位置的 HTTP 入口。它接收已经过传输保护的字节，按公开契约读取消息，识别登录，把请求交给 identity 与 Session 的公开入口，再按公开契约写出响应。应用装配用它把一个 Harness Server 暴露在回环地址上。

消息和 `outcome` 的含义只归[公开契约](../public-contract/SPEC.md)。路径、方法、状态码、请求体上限与 SSE 格式只归公开契约的[承载绑定](../public-contract/docs/http-binding.md)。本成员的行为在[行为规格](SPEC.md)，实现的组织在[内部设计](docs/internals.md)。本页与 [README.md](README.md) 是同一成员、同一份承诺，导出清单、依赖与配置字段的完整说明在那边。

## 职责与状态

本成员拥有两个位置的入口职责：HTTP 监听、请求读取与计数、按路径分派、登录识别、行事租户核对、Session 调用、状态码映射、SSE 观察写出，以及有序停止。它不拥有业务行为，也不持有登录表。

已实现：

- `createServerEntry({ config, dependencies })`，返回 `start()` 与 `stop()`。
- 治理位置的 `register-and-activate` 与 `issue-login`。`issue-login` 成功时带新登录的 `loginId`。
- 治理位置的 18 个治理操作：组织、成员邀请、成员资格、当前租户与账号的登录。它们交给 identity 的治理端口。
- 治理位置的 3 个模型凭据操作：绑定、解绑与查看行事租户的模型凭据。它们交给 `modelCredentials` 端口。没有这个端口时答 `stage-not-provided`。
- 成功业务访问的报告，以及登录失效时结束观察。
- 会话位置的八个会话操作与两个观察操作。观察流只有确认、心跳与 `ended` 帧。
- `read-session-diagnostics` 背后的会话诊断投影：Session 给 Run 时间线，Agent 给结束原因，Model 给派发诊断，Tool 给调用状态与账目；来源没有答的每一次读取都是一条缺口（规格「会话诊断投影」）。
- 会话操作身份 `SessionOperationId` 的确定性派生。

不在本阶段：

- 本部署声明不提供的 14 个治理操作答 `stage-not-provided`：`public-health`、`replace-credential`、`query-organization`、隶属的 8 个操作、`judge-admission` 与两个授权表达操作。
- 观察的 `state`、`refreshing`、`snapshot`、`delta` 与 `gap` 帧。
- TLS、远程访问与多实例部署的粘性路由。

## 使用

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
  dependencies: { identity, governance, issuer, session, resolveDefinition, diagnostics },
})
const { address, port } = await entry.start()
await entry.stop()
```

上面的数值只是示例。初值归装配配置，本成员不写死任何初值。

`start()` 只在 `127.0.0.1` 上监听明文 HTTP/1.1。地址是其他值时以 `ServerEntryConfigError` 拒绝，不改写地址。端口 0 由宿主分配，实际端口在返回值里。`stop()` 停止接受新连接，给每个活动观察发 `ended(unavailable)`，等在途请求写完答复，再关闭全部连接。两个位置的路径固定：`/governance-public/1` 与 `/session-public/1`。

依赖有三类：identity 的操作、治理端口与签发者，Session 的面，以及定义名到创建字段的解析函数。治理端口是必需的，必须与 identity 的操作用同一份记录。装配按调用现取治理服务时，服务缺席由端口答 `basis-unavailable`。可选的 `modelCredentials` 端口承接 3 个模型凭据操作，省略时这 3 个操作答 `stage-not-provided`。可选的诊断汇在省略时不影响运行。会话诊断投影另有四个可选的读端口：`agentJournal`（Agent 的 `readFinish`）、`modelCalls`（Model 的 `inspect` 与 `dispatches`）、`modelDiagnostics`（Model 的派发诊断）与 `toolQueries`（Tool 的 `lookup`、`account` 与 `readDiagnostics`）；缺席的端口让对应的值成为 `unknown`，原因 `unsupported`。完整的依赖表与配置字段表在 [README.md](README.md#dependencies)。

## 契约

稳定的承诺：

- 只绑 `127.0.0.1`，只说明文 HTTP/1.1。地址不合时启动失败。
- 状态码只由 `outcome` 决定。同一个 `outcome` 总是得到同一个状态码和同样形状的响应体。
- 会话位置的 `denied` 不披露会话是否存在，各个原因下响应除 `messageId` 外逐字节相同。
- 本成员不改写 identity 与 Session 的 `denied` 和 `basis-unavailable`，也不另持登录表。登录证明、凭据与签发者不进任何输出。
- Tool 目标的 `stop-call` 得到 `unsupported`，与会话存在与否、`controlId` 是否用过无关，并且不写任何记录。
- 观察记录只在本实例内存里。

实现细节可以改变：模块划分、诊断事件的 code 集合，以及 SSE 写入队列的实现。

## 设计

接入把字节读成公开消息，再把通过协议检查的请求交给 identity 的公开入口、治理端口与 Session 的面。每个位置的处理函数向 HTTP 层交回 `json`、`no-answer` 或观察流三种答复之一。`no-answer` 表示本成员自身没有可信答复，HTTP 层写空正文的 500。`outcome` 到状态码的表是穷尽的，公开契约新增一个可编码的 `outcome` 而表里缺行时，类型检查失败。

会话操作身份由登录文本、租户文本和请求标识确定性派生，所以同一业务意图在崩溃前后得到同一个身份。

公开契约不依赖本成员，SDK 也不依赖本成员。

## 配置与运行

配置字段、依赖类型与限制的完整说明在 [README.md](README.md)。要点：

- 监听地址只能是 `127.0.0.1`，端口 0 表示由宿主分配。
- 两个路径各有请求体上限，它同时是该路径 json-text 读取的 `maxBytes`。
- 观察有每登录与本实例的并发上界，以及观察结束后记录的保留期。
- `read-history` 与 `read-session-diagnostics` 的页大小受 `maxPageBytes` 约束，`read-history` 披露的条目种类由 `historyKinds` 给出。
- 会话诊断投影读取的种类、每页 Run 数上限与每个 Run 进入扇出的调用数上限由 `diagnosticsKinds`、`maxRuns`、`maxCallsPerRun` 给出。三项一起给或一起省略；省略时 `read-session-diagnostics` 答 `basis-unavailable`。

要求 Node 24 或更高版本。本成员不读环境变量，也不读真实机密。传输保护由调用者完成。

已知限制：

- 明文，只绑回环。TLS 与远程访问不在本阶段。
- 观察不发 `state`、`refreshing`、`snapshot`、`delta`、`gap`。
- 成功业务访问的报告尚未定义，会话操作不刷新登录的空闲计时。
- `startRun` 时不再核登录是否仍有效。
- 观察记录只在本实例内存里，多实例的粘性路由归部署。
- Tool 目标的 `stop-call` 先到达 Session 的 `stopCall`，接入再把对外答案定为 `unsupported`。不写记录由 Session 的契约承诺，接入挡不住一个不按契约写入的 Session。
- `send-input` 交给 Session 的输入来源带登录状态文本，真实 Session 若把它写进历史条目的 `payload`，`read-history` 会原样透传。来源是否入 `payload` 归 Session 与 identity。
- `read-session-diagnostics` 的游标用只活在本实例里的密钥封印。另一实例或重启后的实例签发的游标答 `invalid`，调用者从首页重读。
- `read-session-diagnostics` 不报告 Run 开始的时刻与模型调用的用量：Session 的载荷不带时间，Model 的诊断不带账目。两项在拥有者加字段之前都是 `unknown`（RFC-0013 的 DA7 与「实质备选」）。

## 验证

在本目录运行：

```sh
pnpm run build
pnpm run typecheck
NO_COLOR=1 pnpm exec vitest run
```

用例经真实回环 HTTP 调用本成员，用 identity 的 `./testing` 参考替身与测试目录里的 Session 面替身。替身通过不证明真实 Session、持久 identity 或跨进程主体来源。用例清单在[内部设计](docs/internals.md#验证与维护)。

## 维护

改行为先改[行为规格](SPEC.md)，再改代码与用例。公开契约新增或改动词汇时，先核对 `src/status.ts` 的状态码表与 `src/session.ts` 的结果映射。Session 的面或 identity 的公开类型变化时，核对 `src/faces.ts` 与 `src/identity-steps.ts` 用的子集。

本页与 [README.md](README.md) 保持同步，两者表达同一份承诺。
