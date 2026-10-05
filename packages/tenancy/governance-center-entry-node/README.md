# `@omne-harness-lite/governance-center-entry-node`

治理中心入口层：兑现 `composition.governance-center-entry` v3，落在传输绑定
`composition.governance-center-entry-https-json` v3 上；精确未迁条款见[保持清单](../../../.meta_harness/design/architecture/identity-integration/preservation.md)。
设计、证据义务与缺口归实现映射节点
[`realization/packages/tenancy/governance-center-entry`](../../../.meta_harness/design/realization/packages/tenancy/governance-center-entry/README.md)；
本页说明源码和包内常量；本批公开集成承诺归[薄规格](SPEC.md)，未迁业务继续消费精确旧源。

## 公开入口

| 名字 | 是什么 | 消费者 |
|---|---|---|
| `./cordis` 的 `governanceCenterEntryPlugin`／`managedGovernanceCenterEntryPlugin` | 客户端面：独立绑定／管理绑定。限定名为 `governance-center-entry-node`／`governance-center-entry-node-managed` | 独立装配／`apps/tenancy-host` |
| `./cordis` 的 `governanceCenterOpsPlugin`／`managedGovernanceCenterOpsPlugin` | Unix 运维面：完整体检与维护操作。限定名为 `governance-center-entry-node-ops`／`governance-center-entry-node-ops-managed` | 独立装配／`apps/tenancy-host` |
| 两份 `GovernanceCenter…ConfigSchema` 与配置类型 | 根入口提供配置校验；配置不再接受 `openSignal` | 两种绑定的装配 |
| `createGovernanceCenterEntry`／`createGovernanceCenterOps` 及其依赖类型、`GovernanceCenterWork` | 不依赖 Cordis 的服务端工厂；稳定 setup/close，构造无 I/O | 独立调用者及同一组绑定 |
| `governanceCenterMigrations` | 迁移片段（`governance_center` 表 + 占位行），由装配经 `composeMigrations` 合成 | `apps/tenancy-host` |
| `governanceCenterPreflight` | 迁移前核对：非空库却没有 `governance_center` ⇒ 不过；装配放进 `upgrade.checks` | `apps/tenancy-host` |
| core/governance-center-entry 的 `SERVING_EVENT` 等四个常量、`ServingNotice` | 唯一公共通知定义；提供者不重导出 | 工厂调用方、绑定及装配 |
| `GovernanceCenterClockTimeoutError` | 入口层加载期间等钟超界的具名错误；按类型归类，说明文字不是协议 | `apps/tenancy-host` 映射到 `clock-unreadable` |

两张面均必需注入公共 [EntryOpening](../../core/governance-center-entry/SPEC.md)，并直接检查当前准入资格。
管理绑定另必需注入 `assemblyLifetime`，声明 `assemblyLifecycle: 1`，同步启动、独立报告资源 ready。
完整已准入工作先收场，再释放依赖；网络排空超时不能代替业务完成。
采用范围与顺序见[生命周期设计](../../../.meta_harness/design/architecture/identity-integration/retirement.md)。
ops 维护检查与完成目标经公共 EntryMaintenance 注入；配置只保留路径、版本和迁移名字。
T4 的真实宿主接入、完整制品及独立 L3 尚未完成；切片验证不提升整批接受状态。

## 源码布局（结构规则按它写）

`src/transport/**` 客户端一面；`src/json.ts` 严格 JSON 读取器；`src/routing/**` 路由表与判定次序；
`src/ops/**` 运维面，以及两张面共用的 HTTP/1.1 连接层（`http1.ts`）、答复外形（`wire.ts`）与接收上界（`limits.ts`）——
共用传输件留在 ops 目录；`src/entry.ts` 与 `src/ops/entry.ts` 拥有纯工厂，`src/work.ts` 拥有共有生命周期。
四个通知名及载荷在 core/governance-center-entry；`src/center-id/**` 维护中心标识。精确白名单见薄规格。

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
| 接受的协议版本 | `['2']`（`ACCEPTED_PROTOCOL_VERSIONS`） | 入口契约 S-8 | `src/routing/route-ids.ts` |

## 验证

`pnpm --filter @omne-harness-lite/governance-center-entry-node run test`：真实 TLS 连接、真实 Unix 套接字、真实 sqlite 文件库与四个真实参与方插件；
`tests/slow.spec.ts` 按真实时长跑接收时限（约 30 秒）；`tests/transport.spec.ts` 里有两例调用本机 `openssl s_client`（1.1.1）看
`close_notify` 与早期数据。T-2 的固定字节快照直接读传输绑定的 `examples.md`，不另抄一份。各条证据义务的对应见节点 verification。

`center.spec.ts` 的两来源地址场景缺省使用 `127.0.0.1` 与 `127.0.0.2`。第二个地址不可绑定时，
用 `OMNE_TEST_ALTERNATE_SOURCE_ADDRESS` 指定另一个本机 IPv4 地址；条件与失败处置见
[黑盒套件的环境说明](../../../apps/tenancy-host/tests/e2e/README.md#跑套件)。
