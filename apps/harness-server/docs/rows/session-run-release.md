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
| `request-context` | `RequestContextProvider`，行体以子 fiber 装载 | 账目四个端口：来源核验与读取资格见下节「账目端口」，另两个是具名缺件 | `limits`（运维者层）；可选 `selection` |
| `agent-context` | `createAgentContextPlugin()` | 无（不带测量观察者；C1 采集时交入） | `owner`、`resultCapacity`、可选 `materials`（运维者层） |
| `agent-account-outlet` | `AgentAccountOutletProvider` | 无 | `sender`：出站插件的采用身份（发行数据） |
| `session-ad02` | `createSessionJournalInterpretationPlugin({ coordinator })` | 协调者主体来源 | 无 |
| `session-ad03` | `createSessionContextHolder({ coordinator, translation, … })`，三个子插件来自同一次调用 | 协调者主体来源；`createSessionContextTranslation(adoptedContextDefinitions)` | `scopeIndexEntries`、`pageBytes`（运维者层） |
| `session-ad04` | `createSessionHistorySource({ heads, … })`，源与下界两个子插件 | `heads.sessionOf = historySessionOf` | `scopeIndexEntries`、`pageBytes`（运维者层） |
| `session-ad05` | `createSessionModelLogConsumptionPlugin({ coordinator })` | 协调者主体来源 | 无 |
| `session-handoff` | `createSessionMessageHandoffPlugin({ coordinator, principalIdentity, provider })` | 协调者主体来源；主体身份文本；提供者采用身份 | `combinationVersion`、`manifestDigest`（与 `agent-journal` 行相同） |

协调者主体来源是 `src/rows/session-adapters/coordinator.ts`：行 inject 受信的 `sessionWorkPrincipals`，以 `forSession({ actor: 'coordinator', tenant, session })` 作答。它是运行时对象，不进配置。

## 账目端口与持有者事实（SC2 已接）

端口都在 `src/rows/request-context/accounting.ts`。它们是受信装配代码里的运行时对象，不进配置。

| 端口 | 发行做法 | 答复 |
| --- | --- | --- |
| 来源核验 `sourceAuthority` | 发行固定的窄放行。先经 `principalVerifier` 服务核验主体（按调用现取，不 `inject`）：只接受代租户行事主体，且主体的租户等于访问的租户。系统主体答 `denied`，因为系统作用域不代表任何租户（[IC-18](../../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。再核访问、目标与调用三个租户相同，最后核 `producer` 是 `model`，且 `sender` 的四个字段与 `ACCOUNT_OUTLET_SENDER` 全等。`ACCOUNT_OUTLET_SENDER` 等于发行配置里 `agent-account-outlet` 行的 `sender`，用例核对两者相等 | 全部满足时 `allowed`。其余一律 `denied`，原因写入行日志的 warn 级（契约的 `denied` 不带文字）。核验器不在场、不可用或抛出时答 `unavailable`，不改写成 `denied` |
| 读取资格 `readEligibility` | 每次调用现取已登记的 `contextHolderSources`（`session-ad04` 行提供），短租借后转问它的 `eligibility` 部件，返回前结束租借。不 `inject`，所以行清单不变 | 只放行 `accounts` 操作，其他操作答 `denied`，原因写 debug 级日志。持有者的答复原样返回，`denied` 另写 warn 级日志。没有持有者、租借被拒或抛出时答 `unavailable`，吞掉的异常写 debug 级日志 |
| 持有者事实 `replayFacts` | 入口对象 `runtimeContextTrust` 每次调用在自己的上下文上现取 `sessionReplayFacts`（`session-ad03` 行的事实子插件提供），不缓存旧引用 | 服务不在场、已停、读取或应答抛出时答 `unavailable`，吞掉的异常写 debug 级日志，不带异常消息。RC-09 结束恢复时，持有者事实列出的块没有被材料覆盖，答 `invalid`（`replay-incomplete`） |

已知限制：

- 来源核验不核「原账目、调用、发出与提交证据属于同一已提交的日志事实」，也不核调用方就是出站插件本身。出站插件转交的是 Agent 的访问身份，发行里没有这两项事实的来源。这是 B1-GAP-ACCOUNTING-SOURCE-AUTHORITY 收窄后的余项。现在出站插件没有目标解析器，每次交付在到达收件口之前答 `scope-unresolved`，所以这条放行在发行里还走不到。
- 来源核验只比较 `target.tenant` 字段，不解析作用域 `target.scope` 的真实归属。账目只写进调用方租户自己的命名空间：账目投影按 `tenant\0scope` 作键，所以写错作用域的账目不会污染别的租户。
- 读取资格借用的是持有者对目标所属会话的历史读取资格，不区分 `operation`。`session-ad04` 还没有解析到该作用域时答 `unavailable`。
- 入口的作用域绑定仍答 `unavailable`（`src/entry/execution-wiring.ts` 的 `readOwnership` 缺席），所以在发行树里结束恢复的核对先停在绑定，读不到持有者事实。把 `readOwnership` 接到 `sessionScopeLookup` 不在 SC2 范围内，它会改变 Runtime Context 读者与 Execution 绑定的授权结果。
- `sessionReplayFacts` 在 session-cordis-contract 里写为受信名，但应用装配页的受信子树没有列它，发行受信表也没有。所以入口从根上解出它，根上别的插件也能按名取得。受信表列入以后，入口改为经 `env.readTrusted` 读取（`readReplayFactsService`）。

## 具名缺件（发行里没有生产来源，答不可用，不默认放行）

| 缺件 | 位置 | 后果 |
| --- | --- | --- |
| B1-GAP-ADOPTED-REQUEST-SOURCE | `src/rows/request-context/accounting.ts`，以及 `session-ad04` 的 `adopted` 缺席 | 协调者固定请求事实（CX-08）读不到，窄采用来源答不可用；窗口占用 `usage` 在读取资格放行之后答不可用。Runtime Context 每轮整读，不做增量。SC2 不做：会话日志里没有固定请求的条目，补它要新设计 |
| B1-GAP-ACCOUNTING-RECOVERY-AUTHORITY | `src/rows/request-context/accounting.ts` | 账目投影不能授权重建，收件口对每个目标答 `unavailable`（`uninitialized`）。SC2 不做，随波 3 的重启恢复 |
| B1-GAP-TOOL-REQUESTS（Tool B 段） | `src/rows/agent-host/index.ts:42` 的行体用 `agentHostPlugin.apply`；改为 `createAgentHostLocalPlugin({ toolRequests })`，`toolRequests` 由入口把运行时上下文 current、执行环境授权与绑定对象、catalog 组合成（R2-D36 第 3 点） | 不传时 Tool 动作准入答 `unavailable`（owner `agentToolRequests`），失败关闭 |

## 还是替身的行与原因

| 行 | 原因 |
| --- | --- |
| `agent-host`、`agent-instances`、`session-ad14` | `agent-host` 必需 inject `agentConditions`，它由 `session-conditions` 行提供，该行归波 4，发行里是替身；真件装上会停在 `PENDING`，`serve` 以退出码 4 结束。`agent-instances` 与 `session-ad14` 依赖 `agent-host` 提供的键，同理 |
| `session-conditions` | 波 4；不以默认允许或空条件的插件冒充就绪 |
| `session-ad11`、`session-ad15` | 依赖 `toolRuntime`、`executionEnvironment`，归 B3 的 Tool B 段 |

所以「用 `coding` 建会话、跑一轮、模型拿到带 v2 的系统提示词」在发行树里还跑不到：会话能建，模型选择能读回，定义段的读取链（`agentAdoptions` → `agent-context` → `request-context`）是真件，但没有 `agent-host` 就没有 Agent 实例去调用 `prepare`。

## 验证

[serve 用例](../../tests/serve.spec.ts)证明发行树 33 真件、15 替身全部 `ACTIVE`，启动就绪、退出 0。[coding-agent 用例](../../tests/assembly/coding-agent.spec.ts)证明定义段经真实采用面组装成系统提示词。端到端一轮等 `session-conditions` 与 Tool B 段。

[账目端口用例](../../tests/rows/request-context/accounting.spec.ts)与[行用例](../../tests/rows/request-context/index.spec.ts)证明来源核验与读取资格的放行、拒绝与不可用；[持有者事实用例](../../tests/entry/runtime-context-replay-facts.spec.ts)证明入口按调用读取 `sessionReplayFacts`，缺席时答不可用。
