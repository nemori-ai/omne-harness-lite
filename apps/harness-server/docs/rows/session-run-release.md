# L-RUN 行的生产接线：Context 侧与 Session 适配行

本页说明发行树里 B1（R2-D136）接上的八行，以及 SC1、SC4 接上的四行，怎样接到成员工厂，哪些参数在发行里没有生产来源，以及还没接的行为什么没接。
系统责任归[应用装配](../../../../docs/architecture/runtime/application-assembly.md#插件树)。接口事实归各成员：
[session-adapters](../../../../packages/session/session-adapters/docs/cordis.md)、
[request-context-cordis](../../../../packages/context/request-context-cordis/docs/cordis.md)、
[agent-context](../../../../packages/context/agent-context/SPEC.md#context-plugin)。
依据：R2-D117、R2-D124、R2-D136、R2-D145、R2-D162，L-RUN 的事实清单 `C-ADAPTERS-A`、`C-ADAPTERS-B`、`C-TOOLREQ`。

## 各行与配置

配置只放数据；数值由运维者层给，发行层不写（R2-D6）。r9 与 serve 的测试运维层在 `tests/r9/support.ts`。

| 行 | 成员工厂 | 构造时交入的运行时对象 | 配置 |
| --- | --- | --- | --- |
| `request-context` | `RequestContextProvider`，行体以子 fiber 装载 | 账目四个端口（见下节的具名缺件） | `limits`（运维者层）；可选 `selection` |
| `agent-context` | `createAgentContextPlugin(agentContextPluginInput)` | 组六的工具读口 `catalogToolLookup`（`rows/agent-context/tools.ts`）：逐次现取 `toolCatalog` 与发行确认的文本消费者材料，经 `toolCatalog.inspect` 读常驻绑定所指工具的完整定义，读不到时组六失败关闭（G-TOOLS6）。不带测量观察者，C1 采集时交入 | `owner`、`resultCapacity`、可选 `materials`（运维者层） |
| `agent-account-outlet` | `AgentAccountOutletProvider` | 无 | `sender`：出站插件的采用身份（发行数据） |
| `session-ad02` | `createSessionJournalInterpretationPlugin({ coordinator })` | 协调者主体来源 | 无 |
| `session-ad03` | `createSessionContextHolder({ coordinator, translation, … })`，三个子插件来自同一次调用 | 协调者主体来源；`createSessionContextTranslation(adoptedContextDefinitions)` | `scopeIndexEntries`、`pageBytes`（运维者层） |
| `session-ad04` | `createSessionHistorySource({ heads, … })`，源与下界两个子插件 | `heads.sessionOf = historySessionOf` | `scopeIndexEntries`、`pageBytes`（运维者层） |
| `session-ad05` | `createSessionModelLogConsumptionPlugin({ coordinator })` | 协调者主体来源 | 无 |
| `session-handoff` | `createSessionMessageHandoffPlugin({ coordinator, principalIdentity, provider })` | 协调者主体来源；主体身份文本；提供者采用身份 | `combinationVersion`、`manifestDigest`（与 `agent-journal` 行相同） |
| `session-conditions`（SC1，R2-D145） | `createSessionConditionsPlugin({ defaultModes })` | 租户默认模式解析器 `defaultModesOf(definitionMappings)`：映射条目的模式采用须与创建所记来源逐字相等 | 无 |
| `session-ad14`（SC4，R2-D162） | `createSessionAgentDrivePlugin({ coordinator })` | 协调者主体来源：每次调用现取受信的 `sessionWorkPrincipals`，缺席时答 `unavailable`，不调用 Agent 入口 | 无 |
| `agent-host`（SC4，R2-D162） | `createAgentHostRow({ toolRequestsOf?, measure? })` 内的 `createAgentHostLocalPlugin`；发行导出 `agentHostRow` 不带构造输入 | `toolRequestsOf` 的生产组合归 Tool B 段；`measure` 接 E9 归 C1 | `jointCommits`（必须含 `message`，行 schema 装载时核对，R2-D93）与 `coordination` 由发行层写出；工厂数值、`loopGuardPolicy` 与 `instanceIdleMs` 由运维者层给，运维者层整行替换时重抄发行层的两项 |
| `agent-instances`（SC4，R2-D162） | agent-cordis-contract 的 `agentInstancesPlugin` | 无 | 无 |

协调者主体来源是 `src/rows/session-adapters/coordinator.ts`：行 inject 受信的 `sessionWorkPrincipals`，以 `forSession({ actor: 'coordinator', tenant, session })` 作答。它是运行时对象，不进配置。

## 具名缺件（发行里没有生产来源，答不可用，不默认放行）

| 缺件 | 位置 | 后果 |
| --- | --- | --- |
| B1-GAP-ACCOUNTING-SOURCE-AUTHORITY、B1-GAP-ACCOUNTING-READ-ELIGIBILITY、B1-GAP-ACCOUNTING-RECOVERY-AUTHORITY | `src/rows/request-context/accounting.ts` | 账目收件口拒收、窗口占用不可用；系统提示词与候选组装不受影响 |
| B1-GAP-ADOPTED-REQUEST-SOURCE | 同上，以及 `session-ad04` 的 `adopted` 缺席 | 协调者固定请求事实（CX-08）读不到，窄采用来源答不可用 |
| B1-GAP-REPLAY-FACTS-LINK | `src/entry/runtime-context-trust.ts` 仍用 `absentReplayFacts` | RC-09 恢复会话取不到持有者事实；把事实子插件的 `replayFacts` 接给信任对象是入口模块的改动 |
| B1-GAP-TOOL-REQUESTS（Tool B 段） | `agent-host` 行已有构造输入 `toolRequestsOf`（SC4）；发行导出 `agentHostRow` 还没有交入它。生产组合由入口把运行时上下文 current、执行环境授权与绑定对象、catalog 组合成（R2-D36 第 3 点） | 不传时 Tool 动作准入答 `unavailable`（owner `agentToolRequests`），失败关闭 |

## 还是替身的行与原因

| 行 | 原因 |
| --- | --- |
| `session-ad11`、`session-ad15` | 依赖 `toolRuntime`、`executionEnvironment`，归 B3 的 Tool B 段 |

`agent-host`、`agent-instances`、`session-ad14` 已由 SC4 换真件（R2-D162）。`agent-host-local` 还没有有序停止，计划停止时宿主答 `incomplete`，由 AH-STOP 补上。「用 `coding` 建会话、跑一轮、Files 与 Shell 各调用一次」还要等 Tool B 段：`toolRequests` 的生产组合、Tool runtime 与执行环境各行，以及发行工具的首装（R2-D169）。

`session-conditions` 的具名缺件：SC1-GAP-RESIDENTS 已由 G-RESIDENTS 关闭（R2-D159）：create 按映射条目的 `residentCapabilities` 提交常驻工具，见[采用来源](adoption-sources.md#create-的常驻工具)，首装限制见同页；SC1-GAP-ADOPTION-COORDINATOR（`adoptionCoordinator` 读口不存在，`configuration` 直接取 Run 采用，波 4）；SC1-GAP-TOOLS-SOURCE 已由 G-TOOLS6 关闭（R2-D165）：第六组按 `bindings` 经 `toolCatalog.inspect` 取完整定义。设计页在任务 tmp（`tmp/sc1/design.md`）。

## 验证

[serve 用例](../../tests/serve.spec.ts)证明发行树 37 真件、11 替身全部 `ACTIVE`，启动就绪、退出 0；退出 0 依赖 `agent-host` 的有序停止（AH-STOP）。[session-ad14 行用例](../../tests/rows/session-ad14/index.spec.ts)与 [agent-host 行用例](../../tests/rows/agent-host/index.spec.ts)证明三行在 `agentConditions` 缺席时停在 `PENDING`，以及 `jointCommits` 漏写 `message` 时装载失败。[session-conditions 行用例](../../tests/rows/session-conditions/default-modes.spec.ts)证明租户默认模式只在映射条目仍代表创建所记来源时交出。[coding-agent 用例](../../tests/assembly/coding-agent.spec.ts)证明定义段经真实采用面组装成系统提示词。端到端一轮等 Tool B 段。
