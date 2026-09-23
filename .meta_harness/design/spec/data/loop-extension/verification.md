# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态：未开始。**`data.loop-extension` v1 是 `candidate`（2026-09-23 起草），未接受、未冻结；尚无提供者设计、无源码、无装配。
> 下表登记的是**已经触发的证据义务**，不是已完成的检查。**一条都没有执行过**——
> 本轮连 Schema 形状自检都没有跑：五份被引用的同批契约还不在本分支上，`$ref` 解析不了，正反实例无从求值。
> **两张合法组合表与 Schema 的逐格对照是人工比对**（[`examples.md` 第 9 节](v1/examples.md#9-两张合法组合表与-schema-逐格对照)），**不是机检**。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 | 实际状态 |
|---|---|---|---|---|
| V-1 | **形状校验**：[`examples.md`](v1/examples.md) 第 1～5、7 节的正反实例逐条过 Schema，「Schema」列逐条比对；第 6 节四个走查里的 JSON 同样过对应的 `$defs` | Draft 2020-12 校验器 ＋ 按节绑定的 `$defs`；**前提：五份同批契约 v1 已定型并在同一棵设计树里** | [S-1](v1/contract.md#s-1-十一个位置)、[S-2](v1/contract.md#s-2-两个维度)、[S-4](v1/contract.md#s-4-干预力三档)～[S-18](v1/contract.md#s-18-terminalfact)、[S-19](v1/contract.md#s-19-结论封闭八种)、[S-22](v1/contract.md#s-22-inject)～[S-28](v1/contract.md#s-28-ask)、[S-30](v1/contract.md#s-30-每件的结论必留)、[S-31](v1/contract.md#s-31-三种记录形状)、[S-36](v1/contract.md#s-36-规范表示与定义项)、[S-39](v1/contract.md#s-39-判别式与枚举闭合) 的**形状那一面** | **未开始**，被同批契约的缺席阻断 |
| V-2 | **两张合法组合表机检**：对 13 个位置（含维度）× 8 种结论 × 3 档逐一构造 `Conclusion`，比对 Schema 结果与 [S-20](v1/contract.md#s-20-档与结论的合法组合)、[S-21](v1/contract.md#s-21-位置与结论的合法组合) 的 ✓/✗，并比对拒绝值次序（[S-37](v1/contract.md#s-37-表示层拒绝值)） | 生成式校验（312 格）＋ Draft 2020-12 校验器 | S-20、S-21、S-37 | **只做了人工逐格比对**（examples 第 9 节）；机检**未开始**，同样被 V-1 的前提阻断 |
| V-3 | **回放一致**（[PF-012 §6.9](../../../product/PF-012-agent-loop-and-run/design.md#69-拓展件只能靠改日志起作用) 的验收办法）：把一件拓展件上次的结论留在日志里重算，下一步相同；停在 `ask` 的那一件回放到出卡处，**不出第二张卡、不再调模型** | 规范场景演练，**归 runner** | [S-32](v1/contract.md#s-32-结论即走向)、[S-35](v1/contract.md#s-35-跨过一次等待只能带已落日志的东西) | **未开始**；需要 runner 提供者。本契约只登记它已触发 |
| V-4 | **不可用 ≠ 报错 ≠ 否决**：让一件可否决件的依赖不在场，观察记的是 `skipped: unavailable`、瀑布跳过它、**这一关没有被当成否决**；再让它报错，观察按 `treat_as_veto` 落 `veto` 且 `error` 可见 | 规范场景 ＋ 故障注入 | [S-5](v1/contract.md#s-5-报错处置策略)、[S-9](v1/contract.md#s-9-依赖声明与不可用)、[S-31](v1/contract.md#s-31-三种记录形状)、[S-33](v1/contract.md#s-33-不可用与报错两分) | **未开始**。这条最容易被一个 `catch { return observed }` 抹掉，**必须真跑** |
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

这组报错在五份候选合入同一棵设计树之后应当消失；在那之前，本包**不能**被当成已通过检查。

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
  | `data.call-accounts` v1 | `Usage`、`Cost` | S-14 | 并行起草中。catalog 暂登 `$defs/<名>` |
  | `data.tool-definition` v1 | `DependencyName`、`Duration` | S-9、S-27 | 并行起草中；**起草简报的依赖清单没有这一项**，本契约为不另立同义定义而引它。catalog 暂登 `$defs/<名>` |

- **`FailureCause` 的下游**：`data.model-response` v1 照抄本契约 [S-17](v1/contract.md#s-17-failurecause) 的八个 token。
  本契约改任何一个 token、改它们的含义、或补上 [G-12](v1/contract.md#十四已知缺口) 的答案，那一份要同步；**本契约是定名的一方**。
- **[G-9](v1/contract.md#十四已知缺口)、[G-10](v1/contract.md#十四已知缺口)、[G-11](v1/contract.md#十四已知缺口)、[G-12](v1/contract.md#十四已知缺口)、[G-15](v1/contract.md#十四已知缺口) 被裁决**：
  可能改变结论集合、两张合法组合表或 `FailureCause`。未接受之前可直接落在 v1 并在本节记一行；接受之后出 v2，V-1、V-2 按新表重做。
- **跨进程演化启动**：V-10 从「无法演练」转为必须演练；[第十节](v1/contract.md#十装配给与协议给)写着「须由协议兑现」的各行从待兑现转为须兑现。
  **本版的一切证据只保留其单机范围，不得外推。**

结果不改写规范。发现语义问题回到来源设计（PF-012／PF-013／PF-008／PF-002／PF-014），不在这里改契约。
