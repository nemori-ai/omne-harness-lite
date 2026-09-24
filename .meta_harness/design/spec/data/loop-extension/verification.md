# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态：未开始。**`data.loop-extension` v1 是 `candidate`（2026-09-23 起草），未接受、未冻结；尚无提供者设计、无源码、无装配。
> 下表登记的是**已经触发的证据义务**，不是已完成的检查。起草时一条都没有执行过；**整批对齐（2026-09-24）跑过一次 V-1 的本地自检**（见[本节末](#2026-09-24-整批对齐候选未冻结)），其余义务仍未开始。
> **两张合法组合表与 Schema 的逐格对照是人工比对**（[`examples.md` 第 9 节](v1/examples.md#9-两张合法组合表与-schema-逐格对照)），**不是机检**。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 | 实际状态 |
|---|---|---|---|---|
| V-1 | **形状校验**：[`examples.md`](v1/examples.md) 第 1～5、7 节的正反实例逐条过 Schema，「Schema」列逐条比对；第 6 节四个走查里的 JSON 同样过对应的 `$defs` | Draft 2020-12 校验器 ＋ 按节绑定的 `$defs`；**前提：五份同批契约 v1 已定型并在同一棵设计树里** | [S-1](v1/contract.md#s-1-十一个位置)、[S-2](v1/contract.md#s-2-两个维度)、[S-4](v1/contract.md#s-4-干预力三档)～[S-18](v1/contract.md#s-18-terminalfact)、[S-19](v1/contract.md#s-19-结论封闭八种)、[S-22](v1/contract.md#s-22-inject)～[S-28](v1/contract.md#s-28-ask)、[S-30](v1/contract.md#s-30-每件的结论必留)、[S-31](v1/contract.md#s-31-三种记录形状)、[S-36](v1/contract.md#s-36-规范表示与定义项)、[S-39](v1/contract.md#s-39-判别式与枚举闭合) 的**形状那一面** | **本地自检已跑一次**（整批对齐，2026-09-24）：82 行 ＋ 第 6 节 11 个 JSON 块，0 处不符；**只判形状、不判拒绝值是哪一个**，也不是评审或接受 |
| V-2 | **两张合法组合表机检**：对 13 个位置（含维度）× 8 种结论 × 3 档逐一构造 `Conclusion`，比对 Schema 结果与 [S-20](v1/contract.md#s-20-档与结论的合法组合)、[S-21](v1/contract.md#s-21-位置与结论的合法组合) 的 ✓/✗，并比对拒绝值次序（[S-37](v1/contract.md#s-37-表示层拒绝值)） | 生成式校验（312 格）＋ Draft 2020-12 校验器 | S-20、S-21、S-37 | **只做了人工逐格比对**（examples 第 9 节）；机检**未开始**，同样被 V-1 的前提阻断 |
| V-3 | **回放一致**（[PF-012 §6.9](../../../product/PF-012-agent-loop-and-run/design.md#69-拓展件只能靠改日志起作用) 的验收办法）：把一件拓展件上次的结论留在日志里重算，下一步相同；停在 `ask` 的那一件回放到出卡处，**不出第二张卡、不再调模型** | 规范场景演练，**归 runner** | [S-32](v1/contract.md#s-32-结论即走向)、[S-35](v1/contract.md#s-35-跨过一次等待只能带已落日志的东西) | **未开始**；需要 runner 提供者。本契约只登记它已触发 |
| V-4 | **不可用 ≠ 报错 ≠ 否决，三种策略各落其位**：让一件可否决件的依赖不在场，观察记的是 `skipped: unavailable`、瀑布跳过它、**这一关没有被当成否决**；再让它报错，观察在「之前」的位置落 `veto`、在「之后」的位置落 `stop{ terminal: failed }` 且运行落失败、在 `after_terminal` 落 `observed`，`error` 都可见；让一件可改写件报错，观察 `record` 落了一条以它名义的「没跑成」提醒、下一次组装看得到；`ignore` 对 agent 没有任何效果 | 规范场景 ＋ 故障注入 | [S-5](v1/contract.md#s-5-报错处置策略)、[S-9](v1/contract.md#s-9-依赖声明与不可用)、[S-26](v1/contract.md#s-26-stop)、[S-31](v1/contract.md#s-31-三种记录形状)、[S-33](v1/contract.md#s-33-不可用与报错两分) | **未开始**。这条最容易被一个 `catch { return observed }` 抹掉，**必须真跑** |
| V-11 | **落终态之后不复活，回复被否决不走成因**：让一件 `after_terminal` 的件交回 `inject`，观察被拒、队列没有变非空、没有下一次运行；否决一条模型回复，观察回复没落盘、结论在日志里、那次调用照常结束、`after_model_call` 没有触发、没有产出任何成因 | 规范场景 | [S-2](v1/contract.md#s-2-两个维度)、[S-21](v1/contract.md#s-21-位置与结论的合法组合)、[S-22](v1/contract.md#s-22-inject)、[S-25](v1/contract.md#s-25-veto) | **未开始**；需要 runner 提供者 |
| V-5 | **每件必留**：一次经过里挂了 N 件，日志里恰有 N 条最终结论（出过卡的另有一条 `ask`） | 规范场景 ＋ runner 的静态检查 | [S-30](v1/contract.md#s-30-每件的结论必留) | **未开始** |
| V-6 | **不合法的结论按报错处置**：让一件 `rewrite` 档件交回 `veto`、一件件交回冒名的 `inject`、一件 `rewrite` 改了 `callId`，观察三次都记 `skipped: errored`、`error` 恰为拒绝值、**被拒的结论没有生效** | 规范场景 | [S-20](v1/contract.md#s-20-档与结论的合法组合)～[S-23](v1/contract.md#s-23-rewrite)、[S-34](v1/contract.md#s-34-不合法的结论按报错处置)、[S-37](v1/contract.md#s-37-表示层拒绝值) | **未开始**。第三种（改了不可改的成员）Schema 放过，**只有这条演练能抓到** |
| V-7 | **没有放宽**：兼容件的 `allow` 译成 `observed`，放行判断说「问一下」时动作仍等人 | 规范场景，**归兼容层与 runner** | [S-29](v1/contract.md#s-29-没有放宽) | **未开始** |
| V-8 | **`select_model` 与 `retry` 的判定**：不在合法目标集合里的 `select_model` 不生效；撞上事实三类的 `retry` 不生效；两者都记成报错；`route.selectedBy` 记下本件 | 规范场景，**判定归模型请求那一侧的能力** | [S-24](v1/contract.md#s-24-select_model)、[S-27](v1/contract.md#s-27-retry) | **未开始** |
| V-9 | **被拦的内容不进日志**：否决一条带敏感内容的用户消息，检查全部结论记录的 `reason`、`error` 里没有原文 | 规范场景 ＋ 日志内容扫描 | [S-25](v1/contract.md#s-25-veto)、[S-31](v1/contract.md#s-31-三种记录形状) | **未开始** |
| V-10 | **跨进程后的传输故障映射**：远端拓展件回执丢失时记成不可用或报错之一，不折成 `observed` | 规范场景 | [第十节](v1/contract.md#十装配给与协议给)各行 | **未开始，且本版装配下无法演练**——单机同进程没有这条边。跨进程演化启动时必须补做 |

## 结果与反例

**尚无任何执行记录。**首次执行时在此记录工具与版本、环境、输入范围、可复现步骤与原始结果位置；
原始产物归 [`record/evidence/`](../../../record/evidence/README.md)。
**必须分开陈述**：Schema 校验、规范场景演练、真实组合的符合性——三者不能互相冒充（[S-38](v1/contract.md#s-38-表示层拒绝不是判定)）。

**本轮只跑过设计检查器**——它只检查登记、`$id`、`$ref` 解析与 Markdown 链接锚点，**不校验任何实例**，因此不支持上表任何一条义务：

| 运行 | 对象 | 结果 |
|---|---|---|
| `make design-check`，2026-09-23，本分支起草提交之前的工作树 | 真实设计树 | **FAIL，27 个错误，全部指向并行候选的缺席**：1 个是 catalog 依赖 `data.content-blocks` v1 坐标未知（检查器在一条目的第一个未知依赖处停下，其余四个同类依赖被它遮住），26 个是指向 content-blocks、messages、model-profile、call-accounts、tool-definition 五份 Schema 的 `$ref` 解析不到。**没有 Markdown 链接或锚点错误**。make 在第一步失败后中止，**同一目标里的对象清单与实现节点两步没有跑**（本包没有碰它们的输入） |
| 同一检查器（`check_design.py --root`）跑在临时副本上 | 真实设计树的副本 ＋ content-blocks 草稿 `204d078` 的原件 ＋ 其余四份的**桩**（只含本包引用的那几个 `$defs` 名、空定义）＋ 五条 catalog 候选登记 | **PASS**。说明：五份到齐后，本包的 `$id`、全部 `$ref` 指针（含指到 `CapabilityId/properties/name` 的那一个）、catalog 依赖与链接都解析得到。**桩是空定义，它不说明本包的实例能过真实定义**——那是 V-1 |

按主线裁定原地修订之后（2026-09-23，本分支修订提交之前的工作树）又跑了四次：

| 运行 | 对象 | 结果 |
|---|---|---|
| `make design-check` | 本分支工作树 | **FAIL，37 个错误**：1 个 catalog 依赖（`data.content-blocks` 坐标未知）＋ 29 个 `$ref` 解析不到（比首稿多的 3 个是 `RunId`、`AttemptId` 的三处引用，`data.call-accounts` 在本分支整份缺席）＋ 7 个链接断开，**全部指向 D-038**（`record/decisions/message-and-shape-rulings/decision.md`）——那份决定只在 HUB 上、不在本分支的基线里。没有别的错误 |
| `make docs-check` | 本分支工作树 | **FAIL，7 个错误**，恰是上一行那 7 个 D-038 链接 |
| `check_design.py --root`（同一检查器） | HUB `panqiwei/assets-runtimes` 在 `3b99594a` 的 `.meta_harness` 快照 ＋ 本包 ＋ 本包的 catalog 条目与 46 条 covers ＋ **`data.messages` 的桩**（只含本包引用的四个 `$defs` 名、空定义；HUB 上那份还没合入） | **PASS**。说明：content-blocks、call-accounts（含 `RunId`、`AttemptId`）、model-profile、model-response、tool-definition 用的是 HUB 上的真稿，D-038 的两个锚点也解析得到；`data.model-response` 引本包 `FailureCause` 的那一处同样解析得到。**messages 仍是桩**，它不说明本包的实例能过真实定义——那是 V-1 |
| `omne-docs-check --root` | HUB `3b99594a` 的整仓快照 ＋ 本包 ＋ 同上的两份清单 | **PASS**（686 个 Markdown 文件） |

这组报错在本包合入 HUB、`data.messages` 定型之后应当消失；在那之前，本包**不能**被当成已通过检查。

## 形式化工件

**本契约不选用形式化工件，`formal/` 不建。**理由在[契约第十六节](v1/contract.md#十六版本差异与规范工件)：
两张合法组合表是有限结构，Schema 已逐格写死；本契约没有状态转移。
**这不是把义务省掉**——V-2 把两张表的机检登记成义务；回放、先落后算、同一次经过只跑一轮是**行为**性质，形式模型归 `capability.loop-extension-runner`。
本契约**不拥有任何进展性质**。

## 变化的影响

- **同批契约未定型**（2026-09-23 起草时）。本契约引用的下列 `$defs` 都来自并行起草中的候选，**`$ref` 目标以它们 v1 定型后的定义为准**；
  它们任一改名、改结构，本 Schema 的对应 `$ref` 与 examples 里的实例要跟着改，V-1、V-2 要重跑：

  | 契约 | 本契约引的 `$defs` | 本契约据以写出的条款 | 起草时的状态 |
  |---|---|---|---|
  | `data.content-blocks` v1 | `ToolCallBlock`、`ToolResultBlock`、`CallId`、`ExecutionOutcome`、`CapabilityId/properties/name` | S-7、S-14、S-23、S-28、S-30 | 在它自己的分支上已有草稿（按其草稿 `204d078`：S-12 完整的工具调用、S-14 CallId、S-15 工具结果块、S-17 六种收场、S-20 能力标识，**catalog 按这五个条款号登记**，它评审改号时要跟着改）；`CapabilityId.name` 用 JSON 指针引到成员一级，它改结构即失效 |
  | `data.messages` v1 | `Message`、`SystemReminderMessage`、`AssistantMessage`、`CompactionMessage` | S-14、S-15、S-22 | 第二波起草中；`SystemReminderMessage.source` 的 `{ kind: extension, extension }` 形状按其简报账本假定。catalog 暂登 `$defs/<名>` |
  | `data.model-profile` v1 | `ModelProfileRef`、`ModelRequestParameters`、`ProviderName` | S-15、S-24、S-27 | 并行起草中。catalog 暂登 `$defs/<名>` |
  | `data.call-accounts` v1 | `Usage`、`Cost`、`RunId`、`AttemptId` | S-12、S-14 | 主线裁定 2026-09-23 把 `RunId`、`AttemptId`（整数序号）的家定在那里；HUB `3b99594a` 上合入的那一稿已有这两项（它的 S-37）。本分支的基线上那份契约整份缺席，所以本 Schema 的这三处 `$ref`（`ExtensionInput.run`、`ExtensionInput.attempt`、`AttemptStartedSubject.attempt`）在本分支解析不了。catalog 暂登 `$defs/<名>` |
  | `data.tool-definition` v1 | `DependencyName`、`Duration` | S-9、S-27 | 并行起草中；**起草简报的依赖清单没有这一项**，本契约为不另立同义定义而引它。catalog 暂登 `$defs/<名>` |

- **`FailureCause` 的下游**：`data.model-response` v1 照抄本契约 [S-17](v1/contract.md#s-17-failurecause) 的八个 token。
  本契约改任何一个 token 或改它们的含义，那一份要同步；**本契约是定名的一方**。
  「回复在落盘之前被否决」**不产出成因**，它在响应体上记成 `replyDisposition` 为 `vetoed`——那一侧的形状归 `data.model-response`，两份要说同一件事。
- **[G-15](v1/contract.md#十四已知缺口) 被裁决**：可能改变两张合法组合表。未接受之前可直接落在 v1 并在本节记一行；接受之后出 v2，V-1、V-2 按新表重做。
- **主线裁定被产品负责人推翻**：下面那次修订里六条「主线裁定 2026-09-23」任一条被改判，对应条款、Schema 与实例回改，V-1、V-2、V-4、V-11 按新答案重做。

### 2026-09-23 按主线裁定原地修订（候选，未冻结）

起草提交 `f03e72a` 之后，主线裁了本包报回的产品问题，本包**原地**改 v1（候选未冻结，可以原地改）。
依据行一律写「主线裁定 2026-09-23，待产品负责人确认」；形状草案那几条裁决改引 [D-038](../../../record/decisions/message-and-shape-rulings/decision.md)。

| 改了什么 | 条款 | Schema | 实例 |
|---|---|---|---|
| `stop` 加 `terminal ∈ { cancelled, failed }`，缺席即 `cancelled`；循环守卫 L3 用 `failed`；G-10 关闭 | S-26、消费者表、第十三节 | `StopOutput.terminal` | 第 4 节三条 |
| 三种报错处置策略各落什么：`ignore` → `observed`；`record` → 一条以本件名义的「没跑成」提醒（`inject`）；`treat_as_veto` → 「之前」`veto`、「之后」`stop{ terminal: failed }`、`after_terminal` `observed`；G-8、G-9 关闭 | S-5、S-13、S-37 | `ErrorPolicy` 描述；`LoopExtensionDefinition` 的策略约束改成 `observe` 只能 `ignore`；`Conclusion` 新增「报错只落四种」一条 | 第 2 节两条、第 5 节五条、第 8 节三条、EX-3 注 |
| 被用户中断的调用不触发 `after_model_call`；G-11 关闭 | S-2 | `AfterModelCallCompleteReplySubject` 描述 | 第 1 节一条的依据 |
| 回复与系统追加的消息在落盘之前被否决：不落盘、结论落日志、调用照常结束，不走成因、不触发 `after_model_call`；G-12、G-14 关闭；**新增 G-17**（一再被否决时什么让它停下） | S-2、S-17、S-25、S-27、第十二节进展性质 | — | — |
| `after_terminal` 不许 `inject` | S-21、S-22 | `Conclusion` 里 `after_terminal` 那条的 `enum` 改成只有 `observed` | 第 7 节第 8 行加一例、第 9 节行列计数 |
| 运行与执行尝试的标识改引 `data.call-accounts` 的 `RunId`、`AttemptId`，删掉本契约的 `RunRef`、`AttemptRef`；`LogHandle` 按 identity-values S-31 在本契约内定义，不再跨契约 `$ref`；G-3 收窄为只剩 `LogHandle` 的读面（运行标识的产生与唯一范围已由 `data.call-accounts` 给出） | S-12、S-14、S-36（定义项 42 → 40）、G-3 | 删两项、`LogHandle` 自带 pattern | — |
| Q3/Q6/Q8/Q9/Q10/Q19/8c 依据改引 D-038 | 设计依据、S-4、S-10、S-14、S-21、S-23、S-24、P-6、P-7、G-13、G-15 | — | — |
| 新增性质 P-12（落终态之后不复活）、P-13（报错不多出权力）；新增义务 V-11 | 第十二节 | — | — |
| EX-3 的 `ModelProfileRef` 按 HUB 上已合入的 `data.model-profile` 候选改成 `{ origin: custom, scope, routeName }` | — | — | EX-3 |

**对证据的影响**：本包的证据义务一条都没执行过，修订不使任何既有证据失效；V-1、V-2 的实例与格数（位置表 `inject` 一列 13 → 12）随本次修订更新，执行时按修订后的版本。
- **跨进程演化启动**：V-10 从「无法演练」转为必须演练；[第十节](v1/contract.md#十装配给与协议给)写着「须由协议兑现」的各行从待兑现转为须兑现。
  **本版的一切证据只保留其单机范围，不得外推。**

结果不改写规范。发现语义问题回到来源设计（PF-012／PF-013／PF-008／PF-002／PF-014），不在这里改契约。

### 2026-09-24 整批对齐（候选，未冻结）

整批对齐波（简报 S23）原地改 v1。依据行写「主线裁定 2026-09-23，待产品负责人确认」的，出处在主线的裁定清单（账本 S15-b、S15-e、S16-c、S17-c、C-7、C-9、C-R1、RP-33）。

| 改了什么 | 条款 | Schema | 实例 |
|---|---|---|---|
| `implementation` 改为 `builtin{capability}` 与 `command{host, dialect, event, command, matcher?, timeout?}` 二选一，兼容件的载荷有了家；`native`、`compat` 作废；`event` 保留（账本 S15-b 未列，已报主线） | S-8（改名「装配进来的实现与外部命令」）、S-6、消费者表、S-37 第 1 行 | `ExtensionImplementation` | 第 2 节改 14 行、加 6 行；EX-1～EX-4 的声明 |
| 两处末位：放行判断在 `before_action` 末位、模态转换件在 `before_persist_message` 末位；G-13 关闭 | S-10、S-23、第十四节 | — | EX-1 注 |
| `ModelRequest` 恰四个成员，加 `tools`（`CapabilityId[]`，不可改），成员名与 `ModelCallRequest` 逐字相同；G-2 关闭 | S-15、S-23 | `ModelRequest` | 第 5 节一行补 `tools` |
| `after_model_call{failure}` 的主体加 `profile`（`ModelProfileSnapshot`）与 `dispatches`（`ModelCallDispatchedRecord[]`，至少一条） | S-14 | `AfterModelCallFailureSubject` | 第 3 节四行补齐、加两行反例；EX-4 |
| 模型产出的消息落盘之前只开放否决，另许系统模态转换件挂派生表示 | S-23、五件表 | —（Schema 管不到，判定在 runner S-14 ②） | — |
| `before_model_call` 的否决 = 不发且运行落终态「失败」 | S-25 | — | — |
| `retry` 只有 `provider`、`after`；不承诺自定义重试件会停 | S-27 | — | — |
| 答复之后可以再出一轮 `ask`；放行判断四档选项由 tool-admission S-15 定 | S-28、G-6 收窄 | — | — |
| 系统自带五件不可用不照「视作卸载」，指向 runner S-17 | S-33、五件表 | — | — |
| 放行判断整批求值与放行凭据的交出不在本契约形状里（推导，已报主线） | S-14 逐行补充 | — | — |
| G-3、G-17 由 runner S-9、S-30 关闭；G-16 注明 messages S-3 的写入方铸号 | 第十二、十四节 | — | — |
| `FailureCause` 的下游改为 `$ref`（model-response、arrival-events） | S-17、消费者表 | 描述 | — |
| （同日续）**声明里的 `name` 是能力标识 name 的镜像，不是第二个身份**：与资产记录的 `capability.name` 逐码点相等（`data.asset-model/v1#S-10`，同 `data.tool-definition/v1#S-2`）；词法改取 `data.asset-model` 的 `CapabilityName`（禁 `/`、许 `:`），依赖表加 `data.asset-model` 一行。**表示收紧**：含 `/` 的拓展件名从收到拒；现有实例无一受影响，本地自检重跑 82 行 ＋ 11 块仍 0 处不符 | S-6、S-7、依赖表 | `LoopExtensionDefinition.name` | — |

**本地自检**（Draft 2020-12，`jsonschema` 按仓库 `uv.lock`；脚本在任务暂存区、不入库）：以对齐后的整棵设计树的全部 Schema 建 registry，
`examples.md` 第 1～5、7、8 节 82 行（预期通过 25、拒绝 57）逐行按所在节的 `$defs` 求值，**0 处不符**；第 6 节 11 个 JSON 块各自恰过一种 `$defs`（声明 4、输入 1、结论 6）。
**只判 Schema 通过与否**：拒绝值是哪一个、「逐值相同」「来自系统转换件」这类对照输入的判定不在内。V-2（312 格机检）仍未开始。

**对证据的影响**：没有既有证据失效；V-1 的前提（同批契约在同一棵树里）在对齐分支上成立。

## 对齐义务

- **词条链接待合流后补**（2026-09-24 整批对齐）：正文里「干预力、一次经过、合法目标集合、试尽」原标「无词条」，词条批已立为词条，本包已改用正式名、去掉标记；那几条词条在 HUB 上、本分支看不到，**链接待合流后补**（主线）。
