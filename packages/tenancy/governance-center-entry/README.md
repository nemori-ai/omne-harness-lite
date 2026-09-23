# `@omne-harness-lite/governance-center-entry`

治理中心入口层：兑现 `composition.governance-center-entry` v1，落在传输绑定
`composition.governance-center-entry-https-json` v1 上（按 `ccd39d9` 那一版绑定候选实施）。
设计、证据义务与缺口归实现映射节点
[`realization/packages/tenancy/governance-center-entry`](../../../.meta_harness/design/realization/packages/tenancy/governance-center-entry/README.md)；
本页只记源码怎样对应它、包内常量取了什么值。

## 公开入口

| 名字 | 是什么 | 消费者 |
|---|---|---|
| `governanceCenterEntryPlugin`、`GovernanceCenterEntryConfigSchema` | 插件 `governance-center-entry`：客户端一面（TLS 监听、判定次序、27 条路由） | `apps/tenancy-host` |
| `governanceCenterOpsPlugin`、`GovernanceCenterOpsConfigSchema` | 插件 `governance-center-ops`：运维面（`<socketDirectory>/governance-center-ops.sock`，任何请求答完整体检） | `apps/tenancy-host` |
| `governanceCenterMigrations` | 迁移片段（`governance_center` 表 + 占位行），由装配经 `composeMigrations` 合成 | `apps/tenancy-host` |
| `governanceCenterPreflight` | 迁移前核对：非空库却没有 `governance_center` ⇒ 不过；装配放进 `upgrade.checks` | `apps/tenancy-host` |
| `SERVING_EVENT` 等四个通知名、`ServingNotice` | 两个插件之间的 `emit` 通知 | 装配（等 `serving`） |

## 源码布局（结构规则按它写）

`src/transport/**` 客户端一面；`src/json.ts` 严格 JSON 读取器；`src/routing/**` 路由表与判定次序；
`src/ops/**` 运维面，以及两张面共用的 HTTP/1.1 连接层（`http1.ts`）、答复外形（`wire.ts`）与接收上界（`limits.ts`）——
共用件放在 ops 目录，是因为运维面的导入白名单只许本目录内文件；`src/events.ts` 只有四个通知名；`src/center-id/**` 中心标识。

## 实现映射：包内常量

契约把取值留给入口层的几处（https-json/1 S-3、S-5、S-10、S-20），本包取值如下。都是包内常量、不是 config：
可配就可能配到契约下限以下。

| 量 | 取值 | 契约约束 | 源码 |
|---|---|---|---|
| 请求头部块上界 | 8192 字节 | S-10 下限 8 KiB | `src/ops/limits.ts` |
| 请求体上界 | 65536 字节 | S-10 下限 64 KiB | 同上 |
| JSON 嵌套深度上界（只客户端一面） | 64 层 | S-10 下限 64 | 同上 |
| JSON 对象成员数上界（只客户端一面） | 1024 个 | S-10 下限 1024 | 同上 |
| 接收时限（两张面） | 30 秒 | S-10、S-20 下限 30 秒；起点：客户端一面握手完成、运维面连接被接受 | 同上 |
| 读尽上界 | 65536 字节（HTTP 报文层） | S-5：与请求体上界同值、同一计量层 | 同上 |
| 读尽时限 | 5 秒 | S-5：有界，取值归实现 | 同上 |
| TLS 握手时限 | 30 秒（`TLS_HANDSHAKE_TIMEOUT_MS`） | S-3：握手阶段的时长归实现映射，契约不给下限；超时的连接问不到 | `src/transport/client-face.ts` |
| 运维面撤除时等在途体检的上界 | 3 秒 | 入口契约 S-34：有界 | `src/ops/plugin.ts` |
| 完整体检里现探存储的上界 | 2 秒（超时即 `storageReachable: false`） | 入口契约 S-26：每次现探 | `src/ops/health.ts` |
| 等钟可读的轮询间隔 | 100 毫秒（上界是 config `clockReadyTimeoutMs`） | 入口契约 S-34 | `src/plugin.ts` |
| 接受的协议版本 | `['1']`（`ACCEPTED_PROTOCOL_VERSIONS`） | 入口契约 S-8 | `src/routing/route-ids.ts` |

## 验证

`pnpm --filter @omne-harness-lite/governance-center-entry run test`：真实 TLS 连接、真实 Unix 套接字、真实 sqlite 文件库与四个真实参与方插件；
`tests/slow.spec.ts` 按真实时长跑接收时限（约 30 秒）；`tests/transport.spec.ts` 里有两例调用本机 `openssl s_client`（1.1.1）看
`close_notify` 与早期数据。T-2 的固定字节快照直接读传输绑定的 `examples.md`，不另抄一份。各条证据义务的对应见节点 verification。
