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
| `request-context` | `RequestContextProvider`，行体以子 fiber 装载 | 账目四个端口：来源核验与读取资格见下节「账目端口」，另两个是具名缺件 | `limits`（运维者层）；可选 `selection` |
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

## 账目端口与持有者事实（SC2 已接）

端口都在 `src/rows/request-context/accounting.ts`。它们是受信装配代码里的运行时对象，不进配置。

| 端口 | 发行做法 | 答复 |
| --- | --- | --- |
| 来源核验 `sourceAuthority` | 发行固定的窄放行。先经 `principalVerifier` 服务核验主体（按调用现取，不 `inject`）：只接受代租户行事主体，且主体的租户等于访问的租户。系统主体答 `denied`，因为系统作用域不代表任何租户（[IC-18](../../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。再核访问、目标与调用三个租户相同，最后核 `producer` 是 `model`，且 `sender` 的四个字段与 `ACCOUNT_OUTLET_SENDER` 全等。`ACCOUNT_OUTLET_SENDER` 等于发行配置里 `agent-account-outlet` 行的 `sender`，用例核对两者相等 | 全部满足时 `allowed`。其余一律 `denied`，原因写入行日志的 warn 级（契约的 `denied` 不带文字）。核验器不在场、不可用或抛出时答 `unavailable`，不改写成 `denied` |
| 读取资格 `readEligibility` | 每次调用现取已登记的 `contextHolderSources`（`session-ad04` 行提供），短租借后转问它的 `eligibility` 部件，返回前结束租借。不 `inject`，所以行清单不变 | 只放行 `accounts` 操作，其他操作答 `denied`，原因写 debug 级日志。持有者的答复原样返回，`denied` 另写 warn 级日志。没有持有者、租借被拒或抛出时答 `unavailable`，吞掉的异常写 debug 级日志 |
| 持有者事实 `replayFacts` | 入口对象 `runtimeContextTrust` 每次调用经 `env.readTrusted` 在受信作用域「会话回放事实」里现取 `sessionReplayFacts`（`session-ad03` 行的事实子插件提供），不缓存旧引用；根上的同名提供者读不到（R2-D168） | 服务不在场、已停、读取或应答抛出时答 `unavailable`，吞掉的异常写 debug 级日志，不带异常消息。RC-09 结束恢复时，持有者事实列出的块没有被材料覆盖，答 `invalid`（`replay-incomplete`） |

已知限制：

- 来源核验不核「原账目、调用、发出与提交证据属于同一已提交的日志事实」，也不核调用方就是出站插件本身。出站插件转交的是 Agent 的访问身份，发行里没有这两项事实的来源。这是 B1-GAP-ACCOUNTING-SOURCE-AUTHORITY 收窄后的余项。现在出站插件没有目标解析器，每次交付在到达收件口之前答 `scope-unresolved`，所以这条放行在发行里还走不到。
- 来源核验只比较 `target.tenant` 字段，不解析作用域 `target.scope` 的真实归属。账目只写进调用方租户自己的命名空间：账目投影按 `tenant\0scope` 作键，所以写错作用域的账目不会污染别的租户。
- 读取资格借用的是持有者对目标所属会话的历史读取资格，不区分 `operation`。`session-ad04` 还没有解析到该作用域时答 `unavailable`。
- 入口的作用域绑定仍答 `unavailable`（`src/entry/execution-wiring.ts` 的 `readOwnership` 缺席），所以在发行树里结束恢复的核对先停在绑定，读不到持有者事实。把 `readOwnership` 接到 `sessionScopeLookup` 不在 SC2 范围内，它会改变 Runtime Context 读者与 Execution 绑定的授权结果。
- `sessionScopeLookup` 已和 `sessionReplayFacts` 一起列进受信作用域（R2-D168），但入口还没有读它；接 `readOwnership`（KL-148，波 3）时经 `env.readTrusted` 读取。

## 具名缺件（发行里没有生产来源，答不可用，不默认放行）

| 缺件 | 位置 | 后果 |
| --- | --- | --- |
| B1-GAP-ADOPTED-REQUEST-SOURCE | `src/rows/request-context/accounting.ts`，以及 `session-ad04` 的 `adopted` 缺席 | 协调者固定请求事实（CX-08）读不到，窄采用来源答不可用；窗口占用 `usage` 在读取资格放行之后答不可用。Runtime Context 每轮整读，不做增量。SC2 不做：会话日志里没有固定请求的条目，补它要新设计 |
| B1-GAP-ACCOUNTING-RECOVERY-AUTHORITY | `src/rows/request-context/accounting.ts` | 账目投影不能授权重建，收件口对每个目标答 `unavailable`（`uninitialized`）。SC2 不做，随波 3 的重启恢复 |
| B1-GAP-TOOL-REQUESTS（Tool B 段） | `agent-host` 行已有构造输入 `toolRequestsOf`（SC4）；发行导出 `agentHostRow` 还没有交入它。生产组合由入口把运行时上下文 current、执行环境授权与绑定对象、catalog 组合成（R2-D36 第 3 点） | 不传时 Tool 动作准入答 `unavailable`（owner `agentToolRequests`），失败关闭 |

## 还是替身的行与原因

| 行 | 原因 |
| --- | --- |
| `session-ad11`、`session-ad15` | 依赖 `toolRuntime`、`executionEnvironment`，归 B3 的 Tool B 段 |

`agent-host`、`agent-instances`、`session-ad14` 已由 SC4 换真件（R2-D162）。`agent-host-local` 还没有有序停止，计划停止时宿主答 `incomplete`，由 AH-STOP 补上。「用 `coding` 建会话、跑一轮、Files 与 Shell 各调用一次」还要等 Tool B 段：`toolRequests` 的生产组合、Tool runtime 与执行环境各行，以及发行工具的首装（R2-D169）。

`session-conditions` 的具名缺件：SC1-GAP-RESIDENTS 已由 G-RESIDENTS 关闭（R2-D159）：create 按映射条目的 `residentCapabilities` 提交常驻工具，见[采用来源](adoption-sources.md#create-的常驻工具)，首装限制见同页；SC1-GAP-ADOPTION-COORDINATOR（`adoptionCoordinator` 读口不存在，`configuration` 直接取 Run 采用，波 4）；SC1-GAP-TOOLS-SOURCE 已由 G-TOOLS6 关闭（R2-D165）：第六组按 `bindings` 经 `toolCatalog.inspect` 取完整定义。设计页在任务 tmp（`tmp/sc1/design.md`）。

## 验证

[serve 用例](../../tests/serve.spec.ts)证明发行树 37 真件、11 替身全部 `ACTIVE`，启动就绪、退出 0；退出 0 依赖 `agent-host` 的有序停止（AH-STOP）。[session-ad14 行用例](../../tests/rows/session-ad14/index.spec.ts)与 [agent-host 行用例](../../tests/rows/agent-host/index.spec.ts)证明三行在 `agentConditions` 缺席时停在 `PENDING`，以及 `jointCommits` 漏写 `message` 时装载失败。[session-conditions 行用例](../../tests/rows/session-conditions/default-modes.spec.ts)证明租户默认模式只在映射条目仍代表创建所记来源时交出。[coding-agent 用例](../../tests/assembly/coding-agent.spec.ts)证明定义段经真实采用面组装成系统提示词。端到端一轮等 Tool B 段。

[账目端口用例](../../tests/rows/request-context/accounting.spec.ts)与[行用例](../../tests/rows/request-context/index.spec.ts)证明来源核验与读取资格的放行、拒绝与不可用；[持有者事实用例](../../tests/entry/runtime-context-replay-facts.spec.ts)证明入口按调用在受信作用域读取 `sessionReplayFacts`，缺席时答不可用，根上的同名提供者伪造不了 `known`。
