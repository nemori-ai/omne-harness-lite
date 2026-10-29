# 公开接口

本页给出本成员的导出入口与定义索引。行为归 [SPEC.md](../SPEC.md)，端口接口归 [session-contract 的公开接口](../../session-contract/docs/public-api.md#出站端口与块声明)，服务键归 [session-cordis-contract](../../session-cordis-contract/docs/cordis.md#端口服务键)。

现状：`src/index.ts` 与 `src/cordis.ts` 只有模板标记，两个入口都没有导出。下文是随实现进入的目标导出，名称随实现确定。

## 导出入口

| 入口 | 内容 | 是否导入 Cordis |
| --- | --- | --- |
| `@omne-harness/session-adapters` | 翻译纯函数：模式翻译、身份编码、结果对应 | 否 |
| `@omne-harness/session-adapters/cordis` | 全部插件、端口提供者子类、`ContextBlocks` 增补 | 是 |

本成员不导出新的端口接口、服务键或事件。它不导出可以被别的成员继承的抽象类。

## 定义索引

| 定义 | 入口 | 用途 | 行为 |
| --- | --- | --- | --- |
| 模式翻译函数 | 根入口 | 把 `session.modes` 的值翻译为授权域与元能力宿主的需要 | [模式翻译表](../SPEC.md#模式翻译表) |
| 身份编码函数 | 根入口 | 把 Session 的操作身份确定地编码为邻域的操作身份 | [AD-00](../SPEC.md#ad-00) |
| 结果对应函数 | 根入口 | 把邻域结果对应为 Session 结果或参加者响应 | 各插件的对应表 |
| 入站插件 AD-01 至 AD-08、AD-13 | `./cordis` | 邻域调用本成员或本成员读取邻域 | [插件清单](../SPEC.md#插件清单) |
| 构造依赖端口提供者 AD-09 至 AD-12 | `./cordis` | `sessionIdentity`、`sessionEvidence`、`sessionIdleInput`、`sessionContextInput` | 同上 |
| 出站端口提供者 AD-14 至 AD-17 | `./cordis` | `sessionAgentDrive`、`sessionScopeRelease`、`sessionToolStartFence`、`sessionDeliveryRelease` | 同上 |
| 模型选择提供者 AD-07 | `./cordis` | `agentModelSelection` | [AD-07](../SPEC.md#ad-07) |
| `ContextBlocks` 增补 | `./cordis` | 把 `session.modes` 加入 Runtime Context 的块目录 | [AD-03](../SPEC.md#ad-03) |
| AD-15 的构造入口 | `./cordis` | 装配入口交入恢复授权 | [AD-15](../SPEC.md#ad-15) |

翻译纯函数是根入口的值导出，可以不装 Cordis 单独使用和测试。

## 初始化协议的形状边界

初始化来源、可选 creation.initialization 与 Session 自有守卫编码归 [session-contract](../../session-contract/SPEC.md#初始化来源与提交)。本成员以 AD-10 的既有 SessionEvidenceBridge.prepare 核验完整计划及原项结果，复用 AD-12 注册适配函数。SessionContextInput.prepare 仍只接受 create、change、startRun、reload。原注册键到 Context CommitRef、basedOn/revision 的确定映射在 Session 提交中保存，见 [AD-12](../SPEC.md#ad-12)。实际插件和导出范围仍以本页现状及源码为准，Context、Agent 和 Model 接口保持。

## 同日志归一与历史读取

[AD-02](../SPEC.md#ad-02)消费 Session 自有的根、历史目录、原批次、原 attempt 与归一调用登记候选值。该成员负责公开 Agent identity decoder、Model/Tool invocation resolver 与原 effect/pending/Authority 的校验；session-contract 负责其语言内的完整性与不变量。

已有 AgentJournal、AgentJournalEntries、AgentReceivedCommits 与 AgentMaterials 形状保持，不新增 Agent 端口。候选 testing 提供者直接用 Session 的 decide/projectSessionLog/reduce/commandDigest 组合同一个 per-session 根。它不包装第二个独立内存日志。新增 Session 值、第三个可选 reads 与 executionEvidence 的候选导航归 [Session 公开接口页](../../session-contract/docs/public-api.md#同日志历史材料的候选增加)。本页所列能力仍未在本成员实现。


## 共同日志内存提供者

`./testing` 导出 `createMemorySessionJournal` 与 `MemorySessionJournalOptions`。公开签名归 [testing.ts](../src/testing.ts)，使用顺序、资格依赖、受信夹具及非耐久边界见 [testing.md](testing.md)。根入口和 Cordis 入口的状态不因该测试提供者改变。
