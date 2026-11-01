# @omne-harness/agent-context 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状与运行时校验归 `src/` 的公开定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。

本文件写两步：第一步是 `agentAccountOutlet` 出站，第二步是 `agentRequests`、`agentModelContext`、来源集合的登记与材料库。第二步经 K-RQ（`contextHolderSources`）取得会话侧部件，经 K-RC（`runtimeContextReaderEligibility`）取得读取资格。

## 范围与依据

| 项         | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 拥有者     | 本包拥有三个出口的适配行为：Agent 请求准备（AG-12）与可读上下文读取（AG-13）译成 Request Context 与 Runtime Context 的调用，Agent 账目出站（AG-17）译成 Request Context 账目事实。请求准备与读取的端口归 [agent-contract](../../agent/agent-contract/SPEC.md#请求扩展和材料接缝)，K-RQ 归 [request-context-cordis-contract](../request-context-cordis-contract/docs/cordis.md)，K-RC 归 [runtime-context-cordis-contract](../runtime-context-cordis-contract/docs/cordis.md)。出站端口 `AgentAccountOutlet` 归 [agent-contract](../../agent/agent-contract/SPEC.md)，服务键与抽象服务归 [agent-cordis-contract](../../agent/agent-cordis-contract/README.md)，收件口与事实形状归 [request-context-contract](../request-context-contract/SPEC.md)，账目投影归 [request-context](../request-context/SPEC.md) |
| 依据       | 设计候选 GATE-859 r2 的 3.4、3.5、3.7、3.8 与第 11 节，及其决策记录（[#502 评论 6561777147](https://github.com/nemori-ai/omne-harness-lite/issues/502#issuecomment-6561777147)）与 Reduce 修正（[#502 评论 6561809783](https://github.com/nemori-ai/omne-harness-lite/issues/502#issuecomment-6561809783)：R-1 取 (ii)，R-5 取 (A)，X-3 按 (b)）。字段对应见 request-context-contract 的[适配方案](../request-context-contract/docs/context.md#适配方案)。装配页的 `agent-account-outlet` 行：必需 `requestContext`、`contextAccountingInbox`。共同集成规则见 [IC 约定](../../../docs/architecture/cordis-integration-conventions.md)                                                                                                                                                                      |
| 采用范围   | 两个插件、四个工厂、材料库与第一波的缺席读口。压缩路径只在本实例内走得通，见 [COMPACTION-PATH](#已知限制)。账目初始化与账目目标解析延到波 B，Reduce 已确认（[#502 评论 6561732444](https://github.com/nemori-ai/omne-harness-lite/issues/502#issuecomment-6561732444)），见[已知限制](#已知限制)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 不属于本包 | 契约成员与 `AccountingInboxProvider` 不改。`AgentAccountHandoff` 没有作用域字段，加字段属于 agent-contract 的公开类型，不在本包                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## 结果与不变量

### 账目出站

<a id="outlet"></a>`createAgentAccountOutlet({ inbox, sender, resolveTarget })` 返回 `AgentAccountOutlet`。`deliver({ access, handoff })` 按下列次序处理，每一步失败就停，后面的步骤不执行：

| 步骤    | 条件                                      | 结果                                                                    | 之后的调用                 |
| ------- | ----------------------------------------- | ----------------------------------------------------------------------- | -------------------------- |
| 1. 租户 | `handoff.call` 解不出来：格式不合         | `invalid`，`field` 为 `handoff.call`，`reason` 为 `reference-malformed` | 无                         |
| 1. 租户 | `handoff.call` 的租户不是 `access.tenant` | `denied`                                                                | 不调用解析器，不调用收件口 |
| 2. 目标 | 解析器抛出异常                            | `unavailable`，诊断 `scope-resolver-failed`                             | 不调用收件口               |
| 2. 目标 | 解析器答 `null`                           | `unavailable`，诊断 `scope-unresolved`（[ACCT-TARGET](#已知限制)）      | 不调用收件口               |
| 2. 目标 | 解析器给出的目标不属于调用的租户          | `denied`                                                                | 不调用收件口               |
| 3. 投递 | 收件口答复                                | 按名映射，见下                                                          | 恰好一次 `receive`         |
| 3. 投递 | 收件口抛出异常                            | `unknown`。写入可能已经发生，接收方保留账目待办，以同一交接重试         | 无                         |

先核租户，所以别的租户的调用得不到任何关于作用域状态的信息。

<a id="outlet-fact"></a>交给收件口的事实：

| `ReceivedAccountFact` 字段         | 来源                                      |
| ---------------------------------- | ----------------------------------------- |
| `kind`                             | 常量 `account`                            |
| `origin.producer`                  | 常量 `model`                              |
| `origin.sender`                    | 工厂参数 `sender`，插件配置给出的采用身份 |
| `origin.resultVersion`             | `handoff.resultVersion`，原样             |
| `call`                             | 解码 `handoff.call` 得到的租户与调用      |
| `dispatch`、`account`、`committed` | `handoff` 同名字段，原样                  |
| `target`                           | 解析器给出的 `{ tenant, scope }`          |

<a id="outlet-map"></a>收件口结果按名映射：`received`（含 `duplicate`、`superseded`）到 `received`；`denied` 到 `denied`；`conflict` 到 `conflict`；`invalid` 到 `invalid`（`field`、`reason` 原样）；`unknown` 到 `unknown`；`unavailable` 到 `unavailable`（诊断原样）。不新增类别，不把一类改成另一类。

<a id="outlet-nokeep"></a>出站不缓存回执，不吞账目，不重试。重试归接收方（Agent 对 `unknown`、`unavailable` 以同一交接重试）。`received` 不是清理 Journal 条目的依据。

### 账目目标解析器

<a id="target-resolver"></a>解析器是工厂参数，类型是 `AccountTargetResolver`：入参是 `access` 与解码后的调用，出参是目标或 `null`。解析器不从调用或执行的文本猜作用域。`absentAccountTarget` 总是答 `null`。

### 出站插件

<a id="outlet-plugin"></a>`./cordis` 的 `AgentAccountOutletProvider` 继承 `AgentAccountOutletService`，提供 `agentAccountOutlet`。

- 只 `inject` `requestContext` 与 `contextAccountingInbox`。两键由 `request-context` 行在同一 fiber 提供，所以两者同生同灭。任一缺席时插件停在 `PENDING`，不提供键。
- 配置只有 `sender`（采用身份：`owner`、`name`、`revision`、`digest`，都是文本）。不合的配置使加载失败，不回退默认值。
- 本波插件传入 `absentAccountTarget`。真实装配里 `deliver` 总是答 `unavailable('scope-unresolved')`，账目不会被收下（[ACCT-INIT](#已知限制)、[ACCT-TARGET](#已知限制)）。
- 插件的 fiber 结束后，仍被持有的旧引用的 `deliver` 答 `unavailable`，诊断 `outlet-closed`，不调用收件口，不答成功。

### 第二步的共同规则

<a id="shared"></a>`agentRequests` 与 `agentModelContext` 共用下列规则。

1. 先核租户。本包铸造的证据带记录键，键里有租户。操作先比对输入里本包证据的租户与 `access.tenant`，不一致答 `denied`，不调用任何下游。历史依据由会话侧部件 `resolveHistory` 解析，它按本次 `Access` 核资格。它给出的目标不属于 `access.tenant` 时，本包也答 `denied`。
2. 失败只用 Agent `Failure` 已有的类别，不新增类别，不把一类改成另一类。本包自己产生的 `unavailable`，`owner` 为 `agent-context`。
3. 缺必要输入、缺依赖或缺材料时答 `unavailable`，带诊断。不造默认值，不用旧值冒充当前值。

### 证据与记录键

<a id="records"></a>本包交出的每份 `DurableEvidence` 由一个材料库实例铸造：

| 字段       | 内容                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| `owner`    | `agent-context:` 加采用身份（插件配置的 `owner`）的规范文本                                                              |
| `record`   | 规范 JSON 记录键：种类、租户文本、作用域、execution、执行挂接、铸造实例、序号                                            |
| `revision` | `1`                                                                                                                      |
| `digest`   | 记录内容的规范文本的 SHA-256（base64url）。读取来源的摘要取块材料，准备覆盖的摘要取 Request Context 的覆盖（`Coverage`） |

<a id="records-scope"></a>可解析范围（N-8）：

- 记录键自描述。任何实例都能读出它属于哪个租户、哪个 execution 与哪个执行挂接，所以重启后 `read` 仍能判断「已采用的覆盖不属于本 execution」。
- 记录指向的材料只在铸造它的实例里。记录与摘要都对上才算同一份材料，摘要被改的证据找不到材料。
- 只有本包解引用这些证据（`read`、`prepare`、`derive`、`resume`）。Agent 与 Session 只保存、原样传回，不解引用。其他消费者不得解引用。

### 材料库

<a id="materials"></a>`createContextMaterials({ owner, capacity })` 返回一个实例的材料库。一个插件实例有一个材料库，`agentRequests` 与 `agentModelContext` 共用它。材料库只在进程内存里，不耐久。

| 表       | 键                                    | 内容                                                                   |
| -------- | ------------------------------------- | ---------------------------------------------------------------------- |
| 读取记录 | 读取来源证据的记录与摘要              | 一次 `read` 的第三组材料、目标、解析后的历史依据、读取时的压缩转换依据 |
| 最近读取 | （租户，作用域，execution，执行挂接） | 最近一次完整读取的块材料、它的资格、读者、游标与收件模型               |
| 计划     | 计划证据的记录与摘要                  | 进入的压缩计划、Request Context 的计划进度、当前步、进入计划时的各组值 |

- 每张表最多 `capacity` 项，满了先丢最久未用的一项。容量是配置初值，插件默认 256。
- 最近读取的一项离开表时，它的读者结束（`end`）。
- 读取答复作用域已结束（`scope-ended`）时，删除该作用域的最近读取（[MATERIAL-SCOPE-END](#已知限制)）。
- 插件的 fiber 结束时，材料库结束全部读者并清空。

### 可读上下文读取

<a id="model-context"></a>`createAgentModelContext({ materials, parts, eligibility, runtimeContext })` 返回 `ModelContextReader`。`parts` 取 K-RQ 部件的 `resolveHistory` 与 `adopted`，`eligibility` 是 K-RC 的交接，`runtimeContext` 是绑定到模型消费者类的读者面。`read` 按下列次序处理，每一步失败就停：

| 步骤          | 条件                                                           | 结果                                                                                 |
| ------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1. 租户       | `adopted` 或 `transition` 是本包证据，租户不是 `access.tenant` | `denied`，不调用下游                                                                 |
| 2. 已采用覆盖 | `adopted` 不是本包证据                                         | `invalid`，`field` 为 `adopted`，`reason` 为 `foreign-evidence`                      |
| 2. 已采用覆盖 | `adopted` 的记录键属于另一 execution                           | `invalid`，`field` 为 `adopted`，`reason` 为 `other-execution`                       |
| 3. 目标       | `resolveHistory` 没有给出值                                    | `denied`、`invalid` 原样，`unknown`、`unavailable` 为 `unavailable`                  |
| 3. 目标       | 目标不属于 `access.tenant`                                     | `denied`                                                                             |
| 4. 资格       | K-RC 答 `absent`、`refused`、`unknown`、`unavailable`          | 依次为 `unavailable(eligibility-absent)`、`denied`、`unavailable`、`unavailable`     |
| 5. 读者       | 资格与最近读取的资格相同                                       | 沿用那次的读者                                                                       |
| 5. 读者       | 否则 `bind`。被拒，原因是 `unauthorized`                       | 再向 K-RC 取一次。取到另一份资格就再 `bind` 一次，否则答 `denied`                    |
| 5. 读者       | `bind` 以其他原因被拒，或答 `unknown`                          | `unavailable`，诊断为原因                                                            |
| 6. 读取       | 增量条件都成立                                                 | `changes`。游标失效时改做完整读取                                                    |
| 6. 读取       | 否则                                                           | `snapshot`                                                                           |
| 6. 读取       | Runtime Context 拒绝：`unauthorized`、其他原因、缺项、未知     | 依次为 `denied`、`unavailable`、`unavailable(required-block-missing)`、`unavailable` |

<a id="model-context-incremental"></a>增量读取的条件，缺一项就做完整读取：

1. 最近读取表里有同一（租户，作用域，execution，执行挂接）的材料，且本次沿用了它的读者。
2. `recipient` 与那次相同。
3. 本次没有压缩转换依据。
4. `adopted` 不为空，且它的摘要等于窄采用来源（K-RQ 的 `adopted`）当前固定事实的覆盖的摘要。

<a id="model-context-result"></a>读取成功后：

- 完整读取用本次的块材料替换最近读取。增量读取保留原块材料，只更新游标。块材料只取有值的块，`previous` 为 `null`（[BLOCK-PREVIOUS](#已知限制)）。
- 逐请求块只取有值的项。某个逐请求块缺项或未知时，整次读取答 `unavailable`。
- 返回 `{ recipient, content, source, coverage }`。`content` 是 `full` 或 `incremental`，由本包决定。`source` 与 `coverage` 是本包证据。读取记录以 `source` 为键存进材料库。
- 新的执行挂接（`resume` 或接管之后）没有最近读取，所以第一次读取总是完整读取。材料丢失（重启、淘汰、插件重跑）后也是完整读取。

### 请求准备

<a id="requests"></a>`createAgentRequests(options)` 返回 `RequestPreparation` 加 `close()`。参数：材料库、K-RQ 部件、Request Context 的登记面与操作组（`register`、`assembly`）、Model 准备资源（X-3）、转换件结果读口、Model 请求准备、结果容量、第六组读口与步骤结果读口。

<a id="requests-groups"></a>字段对应以 request-context-contract 的[字段对应](../request-context-contract/docs/context.md#字段对应)为准。本包在该表之外的取法：

| 组或字段         | 取法                                                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 组一的候选身份   | `action` 原文                                                                                                                                                                    |
| 组一的消费位置   | `position_` 加 `position` 的规范摘要                                                                                                                                             |
| 组二的历史依据   | `resolveHistory` 的结果                                                                                                                                                          |
| 组二的新输入     | 批身份取 `inputs.id`，条目取 `inputs.ordered` 的原文，`saved` 取 `inputs.watermark`                                                                                              |
| 组三             | `context.source` 指向的读取记录。`prepare` 的转换依据为 `null`                                                                                                                   |
| 组四             | `promptContributions` 为 `null`，由登记面替换。`assembleContext` 的 `scope` 取目标作用域，`definition`、`workspace` 为 `null`，`keys` 为空（[ASSEMBLE-CONTEXT-NULL](#已知限制)） |
| 组五的收件模型   | `route` 取 `selection.recipient.route`，`model` 取所选档案采用身份的规范文本。组三的 `recipient` 用同一文本，所以收件模型变了，Request Context 会判为不一致                      |
| 组五的参数       | 每个参数是档案第一个供应方的显式采用，来源是所选档案。`replay` 为 `on`                                                                                                           |
| 组六             | 第六组读口。本波的 `firstWaveTools`：条件的 `bindings` 为空时没有工具，否则 `unavailable(tools-source-absent)`。没有条件时（`resume`）也是后者                                   |
| 组七的条件       | `evidence` 取 `conditions.source`，`revision` 取 `conditions` 的规范摘要                                                                                                         |
| 组七的上一次准备 | 候选身份取 `previous.id`。`previous` 是 `needs-compaction` 时，进入的计划取它的计划证据指向的计划。计划已丢失时答 `unavailable(compaction-plan-lost)`                            |
| 组七的改写依据   | 每份依据记为触及已有层（`existing-layers`）                                                                                                                                      |

<a id="requests-prepare"></a>`prepare` 的结局：

| Request Context 的结局             | 本包的结果                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 候选成立，还要过扩展位置           | `assembled`：`input` 是候选的组装输入，`coverage` 是覆盖证据，`budget` 是预算报告证据，`recipient` 是 `selection.recipient`    |
| 候选成立，可固定                   | 把候选交 Model 请求准备，得 `ready`：`request` 是 Model 的固定请求，`capacity` 是配置的结果容量。模态依据取候选的历史模态约束  |
| 需要压缩                           | 同一次调用里调用 `planCompaction`。计划成立得 `needs-compaction`：进度是计划证据、计划的步数上界与零步。计划存进材料库         |
| 计划不成立（保留下限超出预算）     | `cannot-fit`，原因 `after-compaction`                                                                                          |
| 装不下：固定部分超限、压缩后仍超限 | `cannot-fit`，原因依次为 `fixed`、`after-compaction`                                                                           |
| 三类失败                           | 按[失败对应](../request-context-contract/docs/context.md#失败对应)映射。未知结局为 `unavailable`，`owner` 为 `request-context` |
| Model 拒绝                         | 确定拒绝为 `invalid`，`field` 为 `request`，`reason` 为 Model 的原因。暂时不可用仍是 `unavailable`，`owner` 为 Model 的依赖名  |

`context.source` 指向的读取记录已丢失时答 `unavailable(context-material-lost)`，不调用 Request Context。

<a id="requests-derive"></a>`derive`：

1. 用 `original.progress.plan` 取材料库里的计划。不是本包证据答 `invalid`，租户不符答 `denied`，已丢失答 `unavailable(compaction-plan-lost)`。
2. 输入进度的计划证据或步数上界与 `original.progress` 不同时，答 `invalid`，`field` 为 `progress`，`reason` 为 `plan-mismatch`。已完成步数与材料库的计划进度不同时，答 `invalid`（`progress.completed`，`progress-mismatch`）。
3. `result` 为 `null` 时交回计划的当前步：步请求经 Model 请求准备得到 `ready`（用途 `compaction`），进度原样。
4. 否则经步骤结果读口读出摘要，再以计划、计划进度、当前步与摘要调用 `deriveStep`。返回的进度必须是同一计划，已完成步数恰好多一。`continue` 时已完成步数还要小于步数上界。不符时答 `invalid`（`progress.plan` 或 `progress.completed`）。
5. `next` 得 `continue`，计划进度与当前步写回材料库。`transition` 得 `transition`。`cannot-fit` 得 `cannot-fit`（`after-compaction`）。

<a id="requests-resume"></a>`resume`：

1. 取计划（同 `derive` 第 1 步），取 `context.source` 的读取记录（同 `prepare`）。
2. 核对提交来源：读取记录必须是带着本次 `transition` 读的，且目标作用域与计划相同。不符时答 `changed`，不调用 Request Context。
3. 各组值取进入计划时的值。历史依据换成读取记录的历史依据，组三换成读取记录与转换依据，组五换成本次选择，组六按没有条件读取。
4. 调用 Request Context 的 `resume`，结局同 `prepare`。再次需要压缩时交回原 `original` 与原进度，不进入第二个计划。

<a id="requests-staging"></a>暂存表与令牌：

- 每次操作在调用 Request Context 之前，把本次的各组值以（租户，候选身份）为键放进暂存表，结束时删除。同一键已有值时答 `unavailable(call-input-busy)`。
- 组读口按调用的租户与候选身份取值。取不到时答 `unavailable(call-input-absent)`。
- 令牌由组名、登记代次与组值的规范摘要组成。同值同令牌，异值异令牌，新的登记代次异令牌。不用常量，不用墙钟。

<a id="requests-registration"></a>来源集合的登记：

- 某个（租户，作用域）的第一次调用在组装之前登记来源集合，句柄存进登记表。来源集合的组读口来自暂存表，`adopted`、`history`、`eligibility` 来自 K-RQ 部件，`conversions` 来自转换件结果读口，`preparation` 来自 X-3。
- 登记的 `owner` 是采用身份。登记用本次调用的 `Access`。
- 登记答 `denied`、`conflict`、`unknown` 时，依次答 `unavailable` 的 `source-registration-denied`、`source-set-conflict`、`source-registration-unknown`。登记不成功时不记下，下一次调用再登记。本包不替换、不撤除别人的登记。
- `close()` 拒绝之后的调用，撤除全部句柄，把各句柄的 `settled` 合成一个结果交回。

<a id="requests-not"></a>本包不选模型，不决定是否压缩，不改装入裁定，不为 Agent 保存计划进度，不提交压缩转换，不运行扩展位置，不发模型调用。

### 上下文插件

<a id="context-plugin"></a>`./cordis` 的 `AgentContextProvider` 继承 `RequestPreparationService`，提供 `agentRequests`。它在同一 fiber 里构造一个 `ModelContextReaderService` 子类，提供 `agentModelContext`。

- `inject`：`requestContext`、`contextHolderSources`（K-RQ）、`runtimeContextReaderEligibility`（K-RC）、`runtimeContext`（对象形式 `{ consumer: 'model' }`）、`modelRequestPreparation`、`modelPreparationResources`（X-3）。任一缺席时插件停在 `PENDING`，两个键都不提供，不登记半套。
- X-3 的 Cordis 定义归 model-cordis-contract，现在还没有。插件按键名 `modelPreparationResources`（导出常量 `MODEL_PREPARATION_RESOURCES`）`inject`，值按 model-contract 的 `ModelPreparationResources` 类型使用（[X3-KEY](#已知限制)）。
- 配置：`owner`（采用身份）、`resultCapacity`（三项十进制文本）、可选的 `materials`（正安全整数，默认 256）。不合的配置使加载失败。
- 构造时在本 fiber 上取一次 K-RQ 租借。交给持有者的结算函数是 `agentRequests` 的 `close()`。租借不可得时两个服务都答 `unavailable`，`owner` 为 `context-holder`，诊断是持有者的原因。
- fiber 结束时，租借结束，持有者拉取结算，本包撤除全部登记。持有者在结算结束之后才关读口。材料库结束全部读者并清空。仍被持有的旧引用答 `unavailable(agent-context-closed)`。
- 本波插件用 `firstWaveTools`、`absentStepResults` 与 request-context 的 `createAbsentConversionResults`。

## 所有权、失败与生命周期

| 对象                     | 拥有者与寿命                                                                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 出站工厂的返回值         | 无状态。不持有账目、回执或重试计划                                                                                                                                                              |
| 收件口、`requestContext` | `request-context` 行。出站只在构造时取得收件口，不拥有它。收件口的提供者换代时，Cordis 重跑出站插件体                                                                                           |
| 账目的耐久事实           | 结果接收方（Model 一侧）的日志。出站失败、`unavailable` 与 `unknown` 都不丢它                                                                                                                   |
| 账目投影的目标淘汰       | `request-context`，见其 [淘汰（CX-11）](../request-context/SPEC.md#cx-11)。淘汰不确认事实，所以淘汰后的 `receive` 为 `uninitialized`，经出站变成 `unavailable('uninitialized')`，接收方保留待办 |
| 材料库、暂存表、登记表   | 上下文插件的实例。随插件 fiber 结束而清空，重启或插件重跑后为空。都不耐久                                                                                                                       |
| K-RQ 部件的读口          | 会话侧持有者（`session-ad04` 行）。本包只租借，交还时交回结算。持有者在结算结束之后才关读口                                                                                                     |
| Runtime Context 的读者   | 本包。绑定后存在最近读取表里，项离开时 `end`                                                                                                                                                    |
| 计划进度                 | Agent 的执行记录。材料库只保存 Request Context 的计划进度与当前步，供同一实例的下一次 `derive` 使用                                                                                             |

失败只用端口已有的类别。依赖缺席是 `PENDING`，不是失败。取消不适用：`deliver` 只有一次收件调用，`prepare`、`derive`、`resume` 与 `read` 不持有可取消的资源。

## 组合与验证

IC-19 分类（「协议给」不论部署都由契约协议兑现，「装配给」靠同一进程成立）：

| 保证                       | 类别   | 现在靠什么兑现                                    |
| -------------------------- | ------ | ------------------------------------------------- |
| 租户不符零下游调用         | 协议给 | `deliver` 的第一步                                |
| 幂等与冲突检测             | 协议给 | 收件口的键（租户、调用、dispatch、修订）（RQ-14） |
| 窗口占用与收账读同一份状态 | 装配给 | 两键由 `request-context` 行在同一 fiber 提供      |

`agentRequests`：

| 保证                            | 类别   | 现在靠什么兑现                                                      |
| ------------------------------- | ------ | ------------------------------------------------------------------- |
| 租户不符零下游调用              | 协议给 | 每个操作开头核对本包证据的租户，`resolveHistory` 按本次访问核资格   |
| 一个目标同时只有一个来源集合    | 协议给 | 登记表的冲突答复（RQ-12）                                           |
| 组读口读到本次调用的输入        | 装配给 | 暂存表在进程内，Request Context 的操作组在同一进程里回调组读口      |
| 令牌不复用                      | 装配给 | 登记代次是进程内计数。重启或插件重跑换代                            |
| 同一 execution 至多一个在途准备 | 装配给 | Agent 的单执行槽在同一宿主进程内（Agent SPEC 的请求接缝逐操作要素） |
| 来源读口在借用方结算之前不关闭  | 装配给 | K-RQ 的租借与交还在同一进程                                         |

`agentModelContext`：

| 保证                              | 类别   | 现在靠什么兑现                                  |
| --------------------------------- | ------ | ----------------------------------------------- |
| 每次读取核当前资格                | 协议给 | Runtime Context 的资格核对（RC-03）             |
| 增量读取不消费过期材料            | 装配给 | 材料库在实例内存里，键含执行挂接                |
| `source`、`coverage` 可解析到材料 | 装配给 | 同一 agent-context 实例。跨重启只保证记录键可读 |

### 已知限制

| 名称                  | 内容                                                                                                                                                                                               | 触发条件（到时重新设计）                                                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ACCT-INIT             | 本波没有成员初始化账目投影。真实装配里出站得不到 `received`，接收方待办累积，恢复时从 `received` 条目重放。这与 IP-CX-11 证据栏「每轮 Model 结果接收时账目出站得 `received`」不同，本波不兑现      | 窗口占用块（CX-12）进入装配，或 Journal 重放进入范围。到时一起回答：谁证明空快照完整，系统恢复授权由谁持有，初始化放在出站插件、`request-context` 行还是作用域创建方                  |
| ACCT-TARGET           | 出站不解析账目目标，答 `scope-unresolved`                                                                                                                                                          | 与 ACCT-INIT 同时。候选：K-RQ 加一个按调用身份解析目标的部件（加性）。备选是给 `AgentAccountHandoff` 加字段，那是改 agent-contract 的公开类型，需契约拥有者裁定                       |
| ACCT-EVICT-ACTIVE     | 仍在使用的目标可能在两次操作之间被淘汰，之后 `usage` 返回 `uninitialized`，直到再次重建。出站不发起重建                                                                                            | 与 ACCT-INIT 同时，设计 `usage` 路径上的重建发起者。见 [request-context 的淘汰后果](../request-context/SPEC.md#cx-11-observable)                                                      |
| ASSEMBLE-CONTEXT-NULL | 组四的定义采用与工作区选择交 `null`，`keys` 为空                                                                                                                                                   | 第一个读这两个键的提示词贡献或策略出现，或工具阶段（B-RUN）需要工作区选择。候选：定义采用取 `conditions.configuration`，需契约拥有者确认字段对应。工作区选择归 Execution 域，届时定键 |
| COMPACTION-PATH       | 压缩路径只在同一实例内走得通。`derive` 要读步骤结果，本波的 `absentStepResults` 总是答不可用。`resume` 的组六答 `tools-source-absent`。计划与计划进度只在材料库里，丢失后答 `compaction-plan-lost` | 压缩进入 M2 范围，与 #859 第 5 项同批。到时定步骤结果的读口（Model 结果读取）、`resume` 的工具来源，以及计划材料是否随 Agent 的 checkpoint 保存                                       |
| STALE-ADVANCE-PORT    | 两个端口不核对 `advance`。旧挂接在被取代之后仍可能做完一次读取、组装与 Model 请求准备，结果记录不下来，浪费一次计算。保护点在 Journal 写入                                                         | 多宿主或分布式部署，或同进程接管频繁到浪费的计算可以测出                                                                                                                              |
| REG-NO-EVICT          | 作用域结束后登记不清理                                                                                                                                                                             | E9 测得登记数随会话数增长到影响内存                                                                                                                                                   |
| MATERIAL-SCOPE-END    | 作用域结束后，材料只在下一次读取答 `scope-ended` 时删除，其余靠容量淘汰                                                                                                                            | 同 REG-NO-EVICT                                                                                                                                                                       |
| BLOCK-PREVIOUS        | 块材料的前值（`previous`）总是 `null`，提醒里不带前值                                                                                                                                              | 第一个带前值的块（描述符 `carriesPrevious`）进入模型请求                                                                                                                              |
| X3-KEY                | 插件按键名 `modelPreparationResources` 注入 Model 准备资源，没有导入 model-cordis-contract 的键常量与抽象服务                                                                                      | L-MODEL 交付 X-3 的键与抽象服务时，改为导入键常量，形状不变                                                                                                                           |
| RESULT-CAPACITY       | `ready` 的结果容量取插件配置。Model 请求准备不返回容量，字段对应表没有写它的来源                                                                                                                   | 结果容量有了拥有者与端口时，改为从该端口取                                                                                                                                            |

### 持续验证

| 场景                                                                                        | 必须检查的结果                                                                                                                                                                                                                           | 位置                           |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 出站符合性套件（`@omne-harness/agent-contract/testing` 的 `agentAccountOutletConformance`） | 每个用例通过。出站接真实的账目投影，目标已由空重放重建                                                                                                                                                                                   | `tests/account-outlet.spec.ts` |
| 缺席解析器                                                                                  | `unavailable('scope-unresolved')`，收件口零调用，两次交付答复相同；把答复改成成功用例变红                                                                                                                                                | 同上                           |
| 租户                                                                                        | 租户不符先答 `denied`，解析器与收件口零调用；缺席解析器下也先答 `denied`；解析器给出别的租户的目标答 `denied`                                                                                                                            | 同上                           |
| 事实字段                                                                                    | 逐项等于上表，解析器收到访问与解码后的调用，恰好问一次                                                                                                                                                                                   | 同上                           |
| 结果映射                                                                                    | 八种收件结果各映射到上表；收件口抛出答 `unknown`；解析器抛出答 `scope-resolver-failed`；不缓存、不重试                                                                                                                                   | 同上                           |
| 组合                                                                                        | 收账之后 `usage` 为 `actual`；目标未重建时答 `uninitialized`                                                                                                                                                                             | 同上                           |
| 真实 Cordis 4.0.4                                                                           | 缺依赖停在 `PENDING`，提供者换代或撤除后回到 `PENDING`，停止后键消失、旧引用答 `outlet-closed`，不合的配置加载失败；真实装配上 `deliver` 答 `scope-unresolved`，不得是 `received`                                                        | `tests/cordis-entry.spec.ts`   |
| 入口                                                                                        | 根入口只导出四个工厂与三个缺席读口，不含 Cordis 值；`./cordis` 导出两个插件类、X-3 键名与材料容量初值                                                                                                                                    | `tests/public-entry.spec.ts`   |
| 读取：完整与增量                                                                            | 首次完整；同一挂接、同一收件模型、已采用覆盖与固定事实一致时增量；收件模型变、挂接变、覆盖不一致、材料被淘汰时完整；旧挂接的完整读取不改新挂接的材料                                                                                     | `tests/model-context.spec.ts`  |
| 读取：证据                                                                                  | 记录丢失时 `prepare` 答 `context-material-lost`；新实例读得出 execution，另一 execution 的覆盖答 `invalid`，本 execution 的覆盖做完整读取；别的拥有者的证据答 `invalid`                                                                  | 同上                           |
| 读取：拒绝                                                                                  | K-RC 缺席答 `eligibility-absent` 且不 `bind`；`unauthorized` 再取一次后答 `denied`；资格换了就绑新资格；别的租户答 `denied` 且 K-RC 与 Runtime Context 零调用                                                                            | 同上                           |
| 准备：结局                                                                                  | `assembled`；经 Model 请求准备替身固定得 `ready`；第二轮带 `lineage.continues`；需要压缩时同一次调用进入计划，零步；固定部分超限得 `cannot-fit(fixed)`                                                                                   | `tests/requests.spec.ts`       |
| 准备：组与令牌                                                                              | 组四为目标作用域与两个 `null`；组六按条件给空数组或 `tools-source-absent`；同值同令牌、异值异令牌；同候选并发答 `call-input-busy`，结束后暂存表清空                                                                                      | 同上                           |
| 准备：登记                                                                                  | 一个目标只登记一次；别人占用答 `source-set-conflict`；授权拒绝答 `source-registration-denied` 且下次再登记；`close` 撤除后目标可被他人登记，之后的调用答 `agent-context-closed`                                                          | 同上                           |
| 准备：失败                                                                                  | 历史解析的拒绝原样映射且不调用 Request Context；Model 确定拒绝为 `invalid(request)`，暂时不可用仍是 `unavailable`；别的租户的读取证据答 `denied` 且不解析历史                                                                            | 同上                           |
| 压缩                                                                                        | `derive(null)` 交第一步；计划身份、步数上界或已完成步数不符答 `invalid`；已完成步数多一才接受，多二或不变答 `invalid`；`resume` 的提交来源不符答 `changed` 且不调用 Request Context                                                      | 同上                           |
| 上下文插件（真实 Cordis 4.0.4）                                                             | 六键齐全时装载并服务；缺任一键停在 `PENDING`、两键都不提供；`inject` 不含选择、Journal 与扩展的键；停止后键消失、旧引用答 `agent-context-closed`、持有者拉取一次结算且登记撤除；在途操作结算之前持有者不关读口；缺结果容量的配置加载失败 | `tests/context-plugin.spec.ts` |

不覆盖：账目投影在真实装配里的初始化与投递（ACCT-INIT、ACCT-TARGET）；真实 Model 一侧的结果接收方；跨进程行为；真实的 K-RQ、K-RC 提供者（C17）与 X-3 的真实提供者（L-MODEL）；带块的 Runtime Context 读取（测试的作用域没有登记块）；两键的提供者以同一 fiber 提供这一事实只由 `request-context-cordis` 的测试证明，本包的测试用它的真实提供者装配，但不能分别证明每个 `inject` 键各自的必要性。
