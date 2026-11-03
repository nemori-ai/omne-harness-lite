# L-RUN 行的生产接线：Context 侧与 Session 适配行

本页说明发行树里 B1（R2-D136）接上的八行怎样接到成员工厂，哪些参数在发行里没有生产来源，以及还没接的行为什么没接。
系统责任归[应用装配](../../../../docs/architecture/runtime/application-assembly.md#插件树)。接口事实归各成员：
[session-adapters](../../../../packages/session/session-adapters/docs/cordis.md)、
[request-context-cordis](../../../../packages/context/request-context-cordis/docs/cordis.md)、
[agent-context](../../../../packages/context/agent-context/SPEC.md#context-plugin)。
依据：R2-D117、R2-D124、R2-D136，L-RUN 的事实清单 `C-ADAPTERS-A`、`C-ADAPTERS-B`、`C-TOOLREQ`。

## 八行与配置

配置只放数据；数值由运维者层给，发行层不写（R2-D6）。r9 与 serve 的测试运维层在 `tests/r9/support.ts`。

| 行 | 成员工厂 | 构造时交入的运行时对象 | 配置 |
| --- | --- | --- | --- |
| `request-context` | `RequestContextProvider`，行体以子 fiber 装载 | 账目四个端口（见下节的具名缺件） | `limits`（运维者层）；可选 `selection` |
| `agent-context` | `createAgentContextPlugin()` | 无（不带测量观察者；C1 采集时交入） | `owner`、`resultCapacity`、可选 `materials`（运维者层） |
| `agent-account-outlet` | `AgentAccountOutletProvider` | 无 | `sender`：出站插件的采用身份（发行数据） |
| `session-ad02` | `createSessionJournalInterpretationPlugin({ coordinator })` | 协调者主体来源 | 无 |
| `session-ad03` | `createSessionContextHolder({ coordinator, translation, … })`，三个子插件来自同一次调用 | 协调者主体来源；`createSessionContextTranslation(adoptedContextDefinitions)` | `scopeIndexEntries`、`pageBytes`（运维者层） |
| `session-ad04` | `createSessionHistorySource({ heads, … })`，源与下界两个子插件 | `heads.sessionOf = historySessionOf` | `scopeIndexEntries`、`pageBytes`（运维者层） |
| `session-ad05` | `createSessionModelLogConsumptionPlugin({ coordinator })` | 协调者主体来源 | 无 |
| `session-handoff` | `createSessionMessageHandoffPlugin({ coordinator, principalIdentity, provider })` | 协调者主体来源；主体身份文本；提供者采用身份 | `combinationVersion`、`manifestDigest`（与 `agent-journal` 行相同） |
| `session-conditions`（SC1，R2-D145） | `createSessionConditionsPlugin({ defaultModes })` | 租户默认模式解析器 `defaultModesOf(definitionMappings)`：映射条目的模式采用须与创建所记来源逐字相等 | 无 |

协调者主体来源是 `src/rows/session-adapters/coordinator.ts`：行 inject 受信的 `sessionWorkPrincipals`，以 `forSession({ actor: 'coordinator', tenant, session })` 作答。它是运行时对象，不进配置。

## 具名缺件（发行里没有生产来源，答不可用，不默认放行）

| 缺件 | 位置 | 后果 |
| --- | --- | --- |
| B1-GAP-ACCOUNTING-SOURCE-AUTHORITY、B1-GAP-ACCOUNTING-READ-ELIGIBILITY、B1-GAP-ACCOUNTING-RECOVERY-AUTHORITY | `src/rows/request-context/accounting.ts` | 账目收件口拒收、窗口占用不可用；系统提示词与候选组装不受影响 |
| B1-GAP-ADOPTED-REQUEST-SOURCE | 同上，以及 `session-ad04` 的 `adopted` 缺席 | 协调者固定请求事实（CX-08）读不到，窄采用来源答不可用 |
| B1-GAP-REPLAY-FACTS-LINK | `src/entry/runtime-context-trust.ts` 仍用 `absentReplayFacts` | RC-09 恢复会话取不到持有者事实；把事实子插件的 `replayFacts` 接给信任对象是入口模块的改动 |
| B1-GAP-TOOL-REQUESTS（Tool B 段） | `src/rows/agent-host/index.ts:42` 的行体用 `agentHostPlugin.apply`；改为 `createAgentHostLocalPlugin({ toolRequests })`，`toolRequests` 由入口把运行时上下文 current、执行环境授权与绑定对象、catalog 组合成（R2-D36 第 3 点） | 不传时 Tool 动作准入答 `unavailable`（owner `agentToolRequests`），失败关闭 |

## 还是替身的行与原因

| 行 | 原因 |
| --- | --- |
| `agent-host`、`agent-instances`、`session-ad14` | 归 SC4：等 Tool B 段（`toolRequests`、Tool runtime）与 SC2 之后一起换真件并做端到端验收。`agentConditions` 已由 `session-conditions` 行提供（SC1） |
| `session-ad11`、`session-ad15` | 依赖 `toolRuntime`、`executionEnvironment`，归 B3 的 Tool B 段 |

所以「用 `coding` 建会话、跑一轮、模型拿到带 v2 的系统提示词」在发行树里还跑不到：会话能建，模型选择能读回，定义段的读取链（`agentAdoptions` → `agent-context` → `request-context`）和当前条件（`session-conditions`）是真件，但没有 `agent-host` 就没有 Agent 实例去调用 `prepare`。

`session-conditions` 的具名缺件：SC1-GAP-RESIDENTS（生产 create 的常驻集恒为空，`bindings` 恒为 `[]`，R2-D136 波 3 补 `DefinitionMappingEntry` 的常驻字段）；SC1-GAP-ADOPTION-COORDINATOR（`adoptionCoordinator` 读口不存在，`configuration` 直接取 Run 采用，波 4）；SC1-GAP-TOOLS-SOURCE（agent-context 第六组仍是 `firstWaveTools`，`bindings` 非空即 `tools-source-absent`，Tool B 段接工具来源）。设计页在任务 tmp（`tmp/sc1/design.md`）。

## 验证

[serve 用例](../../tests/serve.spec.ts)证明发行树 34 真件、14 替身全部 `ACTIVE`，启动就绪、退出 0。[session-conditions 行用例](../../tests/rows/session-conditions/default-modes.spec.ts)证明租户默认模式只在映射条目仍代表创建所记来源时交出。[coding-agent 用例](../../tests/assembly/coding-agent.spec.ts)证明定义段经真实采用面组装成系统提示词。端到端一轮等 Tool B 段与 SC4。
