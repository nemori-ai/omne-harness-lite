# capability.loop-extension-runner v1

> 候选规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.loop-extension-runner, 1)`——
  `family = capabilities`、`topic = loop-extension-runner`、规范路径 `spec/capabilities/loop-extension-runner/v1/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：`candidate`（2026-09-23 起草）——**未经独立评审、未接受、未冻结**，不得据此发布或声称消费者已采用
- **设计依据**：见[下一节](#设计依据)。产品依据以 **PF-012 rev 10**、**PF-008 rev 5**、**PF-002 rev 16**、**PF-013 rev 8**、**PF-005 rev 5**、**PF-014 rev 5**、**PF-004 rev 10**、**PF-000 rev 1** 为准
- **精确语义依赖**（消费 clauses 见 [S-4](#s-4-依赖方向与被消费的面)；全部在 catalog 登记的都是**候选**，定型后复核）：

  | 坐标 | 取它的什么 | 状态 |
  |---|---|---|
  | `omne-harness-lite-design-2026-09-15 · data.loop-extension · v1` | **本契约交换与记下的一切形状**：位置、维度、干预力、报错策略、声明、输入、结论、结论记录、卡片草稿、表示层拒绝值 | 候选 |
  | `omne-harness-lite-design-2026-09-15 · data.messages · v1` | runner 追加的提醒（`SystemReminderMessage`、`source.kind = extension`）、`MessageId`、等待答复回来的那条提醒 | 候选 |
  | `omne-harness-lite-design-2026-09-15 · data.content-blocks · v1` | `CallId`（一次经过的锚）、完整的工具调用（生效参数） | 候选 |
  | `omne-harness-lite-design-2026-09-15 · data.call-accounts · v1` | `RunId`、`AttemptId`（运行与执行尝试的标识） | 候选 |
  | `omne-harness-lite-design-2026-09-15 · data.model-response · v1` | 回复在落盘之前被否决时响应体上的处置、有效模型怎么来的留痕——**本契约把效果交给它记** | 候选 |
  | `omne-harness-lite-design-2026-09-15 · data.identity-values · v1` | 身份参数无默认值、缺席即拒绝、不可用即明确失败、跨边界重新验证、表示层校验与判定分开 | 已接受、已冻结 |

  **另有四项依赖本版尚未登进 catalog**：`capability.tool-admission` v1（放行判断件的身份）、`capability.model-request-runtime` v1（`select_model` 与 `retry` 的两道判定）、`capability.asset-evaluation` v1（链上各件求得的值）、`capability.modality-projection` v1（模态转换件的位置、产出与「消息里有没有转换件输入类的块」）——
  它们与本契约并行起草，**不在本分支的基线里**，检查器拒绝未知坐标；消费面写在 [S-4](#s-4-依赖方向与被消费的面) 末表，**合流对齐时补登**（[G-12](#十三已知缺口)）
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如 `capability.loop-extension-runner/v1#S-15`。
  缺口 `G-n`、性质 `P-n` 同此。**编号在本版本内只追加、不重排**

## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| 十一个位置；同一位置挂多件、按位置命名 | [PF-012 §5.8 十一个位置](../../../../product/PF-012-agent-loop-and-run/design.md#十一个位置是推出来的不是挑出来的) · [按位置命名](../../../../product/PF-012-agent-loop-and-run/design.md#按位置命名不按功能命名) | [S-5](#s-5-一次经过)、[S-6](#s-6-拓展件链从装配清单来) |
| 瀑布式：按声明顺序依次过，前一件的输出是后一件的输入；策略判成否决即到此为止；搬进来之后仍是瀑布 | [PF-012 三种形态](../../../../product/PF-012-agent-loop-and-run/design.md#三种形态两种装得进一种拆两半) | [S-10](#s-10-逐件顺序求值先落后算)、[S-15](#s-15-效果怎么合成) |
| 可插拔服务：不可用即卸载、报错按策略、「此刻不在」必须看得见；自带的不享受特权 | [PF-012 可插拔的服务](../../../../product/PF-012-agent-loop-and-run/design.md#拓展件是可插拔的服务不可用即卸载报错按策略) · [系统自带的几件](../../../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件各站在哪) | [S-7](#s-7-系统自带件怎样挂上)、[S-12](#s-12-不可用与报错runner-怎么分)、[S-13](#s-13-报错处置策略的执行)、[S-17](#s-17-系统自带件不可用时一律关门) |
| 干预力三档与报错默认；否决按位置的含义 | [PF-012 干预力三档](../../../../product/PF-012-agent-loop-and-run/design.md#干预力三档直接用-pf-000-的) · [PF-000 §5.3](../../../../product/PF-000-occurrences-and-record-entries/design.md#53-干预力只长在瞬态这一半上) | [S-13](#s-13-报错处置策略的执行)、[S-23](#s-23-效果之后的事由谁做) |
| 消息落盘之前的否决分三路 | [PF-012 否决分三路](../../../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前的否决按消息是谁产生的分三路) | [S-23](#s-23-效果之后的事由谁做) |
| 没有「放宽」 | [PF-012 没有放宽](../../../../product/PF-012-agent-loop-and-run/design.md#没有放宽这一档) | [S-15](#s-15-效果怎么合成) |
| 改参数先落一条生效参数；放行判断判的、人签的、执行的是同一份参数 | [PF-012 改参数](../../../../product/PF-012-agent-loop-and-run/design.md#改参数先落一条生效参数) | [S-6](#s-6-拓展件链从装配清单来)、[S-24](#s-24-before_action-上的改写与生效参数) |
| 改了日志就重新组装，同一位置同一次经过只跑一轮 | [PF-012 只跑一轮](../../../../product/PF-012-agent-loop-and-run/design.md#改了日志就重新组装同一位置同一次经过只跑一轮) | [S-18](#s-18-同一位置同一次经过只跑一轮)、[S-25](#s-25-before_model_call-上的换模型与重新组装) |
| 等人是 loop 的原语（协程不在了靠日志；作者须知；一批先判完；回收时；两处等不了） | [PF-012 等人是 loop 的原语](../../../../product/PF-012-agent-loop-and-run/design.md#等人是-loop-的原语) · [协程不在了](../../../../product/PF-012-agent-loop-and-run/design.md#协程不在了靠日志不靠记忆) · [一批动作先全部判完](../../../../product/PF-012-agent-loop-and-run/design.md#一批动作先全部判完再执行任何一个) · [agent runtime 被回收时](../../../../product/PF-012-agent-loop-and-run/design.md#agent-runtime-被回收时) | [S-27](#s-27-ask交出卡片并停在这一位置)、[S-28](#s-28-回放)、[S-29](#s-29-一批动作每个动作一次经过) |
| 新的一次尝试里已有结论的件不重跑 | [PF-012 第二条是硬的](../../../../product/PF-012-agent-loop-and-run/design.md#第二条是硬的因为它护着-f-的纯性) | [S-28](#s-28-回放) |
| 循环守卫四级；阶梯从日志数出 | [PF-012 §5.9](../../../../product/PF-012-agent-loop-and-run/design.md#59-循环守卫四级阶梯) · [§6.7](../../../../product/PF-012-agent-loop-and-run/design.md#67-检测状态从日志派生不另存) | [S-30](#s-30-连续被否决的回复) |
| 拓展件只能靠改日志起作用；能干预的必须留下结论 | [PF-012 §6.9](../../../../product/PF-012-agent-loop-and-run/design.md#69-拓展件只能靠改日志起作用) · [§6.10](../../../../product/PF-012-agent-loop-and-run/design.md#610-能干预的拓展件必须留下结论) | [S-11](#s-11-每件恰一条最终结论落进会话日志)、[S-28](#s-28-回放) |
| 取消跟着宿主走；取消先落日志再发信号 | [PF-012 §6.13](../../../../product/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走) · [§6.15](../../../../product/PF-012-agent-loop-and-run/design.md#615-取消先落日志再发信号) | [S-23](#s-23-效果之后的事由谁做)、[S-34](#s-34-撤下回收与取消时在途的经过) |
| 同一个 Run 同一时刻只有一副协程在推它：尝试序号当栅栏 | [PF-012 §5.7](../../../../product/PF-012-agent-loop-and-run/design.md#同一个-run-同一时刻只有一副协程在推它) | [S-21](#s-21-dispatch一次经过) ⑥ |
| 挂件自己花的钱，算它插手的那个 Run | [PF-012 §5.8](../../../../product/PF-012-agent-loop-and-run/design.md#挂件自己花的钱算它插手的那个-run) | [G-9](#十三已知缺口) |
| 放行判断：系统自带件、选项定死；一批卡片答完才解除；三种来源的卡片同形、记录分得出是哪一件 | [PF-008 §5.2](../../../../product/PF-008-human-in-the-loop/design.md#52-那个判断函数) · [§5.3](../../../../product/PF-008-human-in-the-loop/design.md#53-一批卡片与答完是什么意思) · [§6.8](../../../../product/PF-008-human-in-the-loop/design.md#68-三种来源的卡片同一个形状选项与记录不同) | [S-6](#s-6-拓展件链从装配清单来)、[S-27](#s-27-ask交出卡片并停在这一位置)、[S-29](#s-29-一批动作每个动作一次经过) |
| 拓展件是第八类资产；干预力是权限、各层只能收窄；工作区带来的只观察 | [PF-002 §4 Loop Extension](../../../../product/PF-002-assets-settings-and-permissions/design.md#loop-extension) · [§5.7](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算) | [S-6](#s-6-拓展件链从装配清单来) |
| 装配清单：一次装配求值出来的构成，只可追加 | [PF-004 §4 装配清单](../../../../product/PF-004-agent-definition-and-assembly/design.md#装配清单) · [§6.7](../../../../product/PF-004-agent-definition-and-assembly/design.md#67-装配清单的生与失效) | [S-6](#s-6-拓展件链从装配清单来)、[S-28](#s-28-回放) |
| 重试站在已有的位置上；转换件 | [PF-013 §5.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#512-重试站在一个已经存在的位置上) · [转换件](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件) | [S-17](#s-17-系统自带件不可用时一律关门)、[S-26](#s-26-retry-与它被拒) |
| 同一位置只按装配顺序；运行时只认统一入出；结论封闭加 `select_model` | [D-038](../../../../record/decisions/message-and-shape-rulings/decision.md#十九处分岔) Q8 · Q10 · Q19 · [8c](../../../../record/decisions/message-and-shape-rulings/decision.md#追加要求三条) | [S-6](#s-6-拓展件链从装配清单来)、[S-10](#s-10-逐件顺序求值先落后算) |
| 兼容层起点：runner 不继承「执行器拒绝 → 非阻断结果、永不抛」的放行方向 | [D-033](../../../../record/decisions/hooks-compat-baseline/decision.md) | [S-12](#s-12-不可用与报错runner-怎么分) |
| **主线裁定 2026-09-23**（待产品负责人确认）：系统自带放行判断钉在 `before_action` 链末 | hooks 兼容层交接缺口 G5 的裁定 | [S-6](#s-6-拓展件链从装配清单来) |
| **主线裁定 2026-09-23**：系统自带件「不可用」一律关门（转换件 = 否决；重试件 = 直接上交；放行判断 = 全拒，**待裁**；循环探测、卸载判定 = 只记可见） | 读数报回 C-7、C-8；账本 U-5（放行判断那一行待产品负责人裁） | [S-17](#s-17-系统自带件不可用时一律关门) |
| **主线裁定 2026-09-23**：`before_model_call` 的否决 ≡ 这次不发、运行落「失败」、原因是否决理由 | 读数报回 C-9 | [S-23](#s-23-效果之后的事由谁做) |
| **主线裁定 2026-09-23**：`before_persist_message` 对模型产出的消息只开放否决、不开放改写 | 读数报回 D-5 | [S-14](#s-14-结论合不合法两类判断) |
| **主线裁定 2026-09-23**：连续被否决的回复按循环守卫阶梯收住；否决时 runner 追加一条提醒 | 数据半边 G-17 的裁定 | [S-30](#s-30-连续被否决的回复) |
| **主线裁定 2026-09-23**：派发器自己按清单顺序逐件等待，不借内核的任何派发；兼容层导入与方言映射移出本契约 | 块 B 机制读数之后的修订 | [S-10](#s-10-逐件顺序求值先落后算)、[S-2](#s-2-本契约不拥有什么) |
| **主线裁定 2026-09-23**：结论作为可见事实落进会话日志；`retry` 被运行时拒绝时落日志、按上交继续；同一位置两件都给 `retry` 取第一个；系统自带件的挂载写清 | 块 C 对账结论 | [S-11](#s-11-每件恰一条最终结论落进会话日志)、[S-26](#s-26-retry-与它被拒)、[S-15](#s-15-效果怎么合成)、[S-7](#s-7-系统自带件怎样挂上) |
| **主线裁定 2026-09-23**：系统自带的模态转换件钉在 `before_persist_message` 链上最后一个动块的位置；它的产出是给原块**挂派生表示**，不改块序列、不改产生者说的话，**不算 D-5 要防的改写**——对模型产出的消息，合法的只有否决、无意见、挂派生表示（仅系统转换件） | `capability.modality-projection` v1 的 S-20、S-22、S-23 与其 G-2（并行起草，已合回任务 HUB，**不在本分支基线里**，按坐标引、不链接） | [S-6](#s-6-拓展件链从装配清单来)、[S-14](#s-14-结论合不合法两类判断)、[S-17](#s-17-系统自带件不可用时一律关门) |
| **主线转来的六条对齐 2026-09-23**：放行判断钉末位；拒绝投影成 `veto` 时原因 token 原样；它失败或不可用即同批全拒；答复以四个选项 id 或 `declined` 交回重判、自由作答先落授权表达再不带答复重判；同批有等人的项时扣住已放行项的凭据；兼容件的四档卡答复不带授权、不交给放行判断 | `capability.tool-admission` v1 的 S-12、S-14、S-21、S-23、S-28、S-29、S-31（并行起草，已合回任务 HUB，**不在本分支基线里**，按坐标引、不链接） | [S-6](#s-6-拓展件链从装配清单来)、[S-28](#s-28-回放)、[S-29](#s-29-一批动作每个动作一次经过) |
| 统一语言 | [UL-loop-extension](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension) · [UL-loop-extension-point](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-loop-extension-point--loop-拓展点--loop-extension-point) · [UL-wait-primitive](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-wait-primitive--等待原语--wait-primitive) · [UL-replay](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-replay--回放--replay) · [UL-decision-card](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-decision-card--决策卡片--decision-card) · [UL-assembly-manifest](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-assembly-manifest--装配清单--assembly-manifest) · [UL-run-attempt](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt) · [UL-admission-decision](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-admission-decision--放行判断--admission-decision) · [UL-run](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run--运行--run) · [UL-session-log](../../../../ubiquitous_language/terms/record-and-context.md#ul-session-log--会话日志--session-log) · [UL-modality-converter](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-modality-converter--模态转换件--modality-converter)；只引：[UL-record-entry](../../../../ubiquitous_language/terms/record-and-context.md#ul-record-entry--记录条目--record-entry) · [UL-agent-runtime](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-agent-runtime--agent-runtime--agent-runtime) · [UL-pending-message-queue](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-pending-message-queue--待处理消息队列--pending-message-queue) | 全部正式名 |

> **「主线裁定 2026-09-23」那几行此刻没有可链接的长期落点**：它们在任务区的账本与读数里，**不在 `record/`**。
> 本契约照写并标明「待产品负责人确认」；长期落点由主线落进 `record/decisions/`（[G-13](#十三已知缺口)）。

**正文用到、词表里没有的概念（无词条）**——本契约**不给它们下正式定义**，只说清它在本契约里指什么：
**一次经过**（沿用数据半边的描述性说法，[S-5](#s-5-一次经过)）、**拓展件链**（一个位置上按次序排好的那几件，[S-6](#s-6-拓展件链从装配清单来)）、
**生效参数**（[PF-012](../../../../product/PF-012-agent-loop-and-run/design.md#改参数先落一条生效参数)）、**循环守卫**（[PF-012 §5.9](../../../../product/PF-012-agent-loop-and-run/design.md#59-循环守卫四级阶梯)）、
**兼容件**（D-033 的描述性说法，归 [`capability.hooks-import` v1](../../hooks-import/v1/contract.md)）、
**放行凭据**（`capability.tool-admission` v1 的 `AdmissionToken`，那份契约同样标为无词条）。
[派生表示](../../../../ubiquitous_language/terms/record-and-context.md#ul-derived-rendering--派生表示--derived-rendering)与 [transcript](../../../../ubiquitous_language/terms/record-and-context.md#ul-transcript--transcript--transcript) 有词条，照用。

---

## 一、含义与使用范围

### S-1 本契约拥有什么

**拓展点协议的操作那一半**：在一个位置上把挂在那儿的拓展件**按次序逐件求值**，把每一件的结论落进会话日志，并由这些结论合成出这一次经过的**效果**。具体为八件事：

| # | 拥有的事 | 正文 |
|---|---|---|
| 1 | **一次经过**是什么、由什么指认；一个位置上**链是哪几件、按什么次序** | [S-5](#s-5-一次经过)、[S-6](#s-6-拓展件链从装配清单来)、[S-7](#s-7-系统自带件怎样挂上) |
| 2 | **逐件顺序求值、先落后算**；每件恰一条最终结论，落进会话日志 | [S-10](#s-10-逐件顺序求值先落后算)、[S-11](#s-11-每件恰一条最终结论落进会话日志) |
| 3 | **不可用与报错两分**，以及报错处置策略的**执行** | [S-12](#s-12-不可用与报错runner-怎么分)、[S-13](#s-13-报错处置策略的执行) |
| 4 | 一条结论**合不合法**的两类判断，以及**效果怎么合成** | [S-14](#s-14-结论合不合法两类判断)、[S-15](#s-15-效果怎么合成) |
| 5 | 系统自带件**不可用时一律关门**的那张表 | [S-17](#s-17-系统自带件不可用时一律关门) |
| 6 | **同一位置同一次经过只跑一轮**；注入的提醒**恰一次追加、有界** | [S-18](#s-18-同一位置同一次经过只跑一轮)、[S-19](#s-19-注入的提醒怎样追加) |
| 7 | 两个操作：`dispatch`（一次经过）与 `replay`（从日志重建一次经过已落的结论）；**回放**的全部规则 | [S-21](#s-21-dispatch一次经过)、[S-22](#s-22-replay从日志重建一次经过)、[S-28](#s-28-回放) |
| 8 | 各种效果**交给谁去做**；`ask` 交出卡片并停在这一位置；连续被否决的回复怎么收住 | [S-23](#s-23-效果之后的事由谁做)～[S-27](#s-27-ask交出卡片并停在这一位置)、[S-30](#s-30-连续被否决的回复) |

它同时关闭数据半边留给它的三个缺口：`data.loop-extension/v1` 的 G-3（日志只读句柄的读面，[S-9](#s-9-日志只读句柄的读面)）、G-13（放行之后参数不许再变由谁守，[S-6](#s-6-拓展件链从装配清单来)）、G-17（连续被否决的回复什么让它停下，[S-30](#s-30-连续被否决的回复)）。

### S-2 本契约不拥有什么

| 不拥有 | 归谁 |
|---|---|
| 位置、维度、干预力、策略、声明、输入、结论、结论记录、卡片草稿的**形状与合法组合** | `data.loop-extension` v1（**全部形状以它为准，本契约不复述**） |
| 消息、块的形状；`RunId`、`AttemptId` 的产生与唯一范围 | `data.messages` v1、`data.content-blocks` v1、`data.call-accounts` v1 |
| **Claude Code / Codex hooks 的导入、方言映射、兼容件怎样跑宿主 hook** | [`capability.hooks-import` v1](../../hooks-import/v1/contract.md)。**兼容件对本契约与任何一件原生件没有区别** |
| 卡片落进池子、陈列、谁能答、答复的形状、「这一批答完」 | PF-008 的卡片契约（未起草）；等待原语本身归 loop |
| 放行判断的**策略**（四步怎么判、选项定死的那四档是什么） | `capability.tool-admission` v1（并行起草） |
| 转换件怎么转、转换件登记、一次合法的转换产出是什么 | `capability.modality-projection` v1（并行起草） |
| `select_model` 是否在合法目标集合里、`retry` 撞没撞事实三类——**两道判定** | `capability.model-request-runtime` v1（并行起草），本契约只消费结果（[S-14](#s-14-结论合不合法两类判断)） |
| 各件在这一次**求得的**位置、维度、干预力、报错策略 | 资产求值（`capability.asset-evaluation` v1，并行起草）；本契约从装配清单读结果（[S-6](#s-6-拓展件链从装配清单来)） |
| 装配清单本身：什么时候装配、谁写、怎么失效 | PF-004 的契约（未起草） |
| 落终态、落取消请求、发起模型调用与再发一次、执行工具、重新组装 | agent loop（未起草）、`capability.model-request-runtime`、`capability.tool-execution-runtime`（并行起草）、上下文组装（PF-010） |
| 拓展件作为资产的持有、配值、禁用 | 资产领域（PF-002） |

### S-3 本契约明确不承诺什么

- **不承诺任何一件拓展件会返回。**一件跑着不返回、又不是停在等人的拓展件，本版没有时间上界（[G-7](#十三已知缺口)）；它挡住的是这一次经过，取消这个运行会把它停下（[S-34](#s-34-撤下回收与取消时在途的经过)）。
- **不承诺「等人」有上界。**卡片悬多久都行（[PF-008 §6.1](../../../../product/PF-008-human-in-the-loop/design.md#61-永远等着系统不替人作答)）。
- **不替任何一件拓展件编结论**：没跑的记成没跑，跑坏的记成跑坏；「判不出来」从不被收成「无意见」或「否决」。
- **不承诺任何外部效果可逆。**一件拓展件自己对外做了什么（例如兼容件起的子进程写了文件），本契约既不知道也不撤销。
- **不定义界面**：卡片长什么样、「这一件此刻不在」怎样呈现给人，归呈现那一侧。
- **不发任何事件**（[S-31](#s-31-本契约不开事件)）。
- **不承诺对外交换格式。**本版不附 Schema：交换的全部形状属 `data.loop-extension` v1；操作被送过进程边界时，线上形状归那份组合契约（[规格容器](../../../README.md#准入门槛与停止条件)）。

### S-4 依赖方向与被消费的面

**依赖方向单向：runner → 数据半边、消息、块、账的归属标识、响应体、身份值。**它们都不得反向依赖本契约。
agent loop、系统自带五件、兼容件、`apps/runtime-host` 依赖本契约；**本契约不依赖任何一件拓展件的实现**——实现缺席即那一件不可用（[S-12](#s-12-不可用与报错runner-怎么分)），不是 runner 不可用。

#### 数据半边（`data.loop-extension` v1）

**下表每个 `#S-n` 的完整坐标是 `omne-harness-lite-design-2026-09-15 · data.loop-extension · v1 · S-n`**；catalog 的 `clauses` 以它为准。

| 被消费的条款 | 用在哪 |
|---|---|
| `#S-1` 十一个位置、`#S-2` 两个维度 | [S-5](#s-5-一次经过) 一次经过的指认、[S-21](#s-21-dispatch一次经过) ① 的配对校验 |
| `#S-4` 干预力三档、`#S-5` 报错处置策略 | [S-13](#s-13-报错处置策略的执行)：runner 按求得的干预力与策略执行，各档各位置落什么照 `#S-5` |
| `#S-6` 声明、`#S-7` name 是身份、`#S-8` 原生件与兼容件、`#S-9` 依赖声明与不可用、`#S-10` 没有 order | [S-6](#s-6-拓展件链从装配清单来)、[S-7](#s-7-系统自带件怎样挂上)、[S-12](#s-12-不可用与报错runner-怎么分) |
| `#S-11` 输入的成员、`#S-12` 三个引用、`#S-13` 瀑布里的 subject 与 earlier、`#S-14` 按位置的 subject | [S-10](#s-10-逐件顺序求值先落后算)：runner 为每件造输入的方式；[S-9](#s-9-日志只读句柄的读面) 关闭 `#S-12` 留下的读面 |
| `#S-19` 结论封闭八种、`#S-20` 档 × 结论、`#S-21` 位置 × 结论、`#S-22` inject、`#S-23` rewrite、`#S-24` select_model、`#S-25` veto、`#S-26` stop、`#S-27` retry、`#S-28` ask、`#S-29` 没有放宽 | [S-14](#s-14-结论合不合法两类判断)、[S-15](#s-15-效果怎么合成)、[S-23](#s-23-效果之后的事由谁做)～[S-27](#s-27-ask交出卡片并停在这一位置) |
| `#S-30` 每件的结论必留、`#S-31` 三种记录形状、`#S-32` 结论即走向 | [S-11](#s-11-每件恰一条最终结论落进会话日志)、[S-28](#s-28-回放) |
| `#S-33` 不可用与报错两分、`#S-34` 不合法的结论按报错处置 | [S-12](#s-12-不可用与报错runner-怎么分)、[S-14](#s-14-结论合不合法两类判断) |
| `#S-35` 跨过一次等待只能带已落日志的东西 | [S-28](#s-28-回放) 的前提：回放一致靠作者守它 |
| `#S-37` 表示层拒绝值、`#S-38` 表示层拒绝不是判定 | [S-14](#s-14-结论合不合法两类判断)、[S-21](#s-21-dispatch一次经过) ⑥ 的 `positionUnknown` 与 `invalidInput` |

#### 其余已登记的依赖

| 坐标（`omne-harness-lite-design-2026-09-15 · … · v1`） | 被消费的条款 | 用在哪 |
|---|---|---|
| `data.messages` | `#S-3` MessageId、`#S-15` SystemReminderMessage、`#S-18` 来源闭合拓展件走兜底、`#S-22` 系统发起的等待答复回来、`#S-26` 拓展件追加的提醒、`#S-32` 会话日志里的配对与唯一 | [S-5](#s-5-一次经过) 的锚；[S-13](#s-13-报错处置策略的执行)、[S-30](#s-30-连续被否决的回复) runner 追加的提醒；[S-19](#s-19-注入的提醒怎样追加) 按 `MessageId` 恰一次追加；[S-28](#s-28-回放) 回放读答复 |
| `data.content-blocks` | `#S-12` 完整的工具调用、`#S-14` CallId、`#S-19` 派生表示与 transcript、`#S-20` 派生表示的产出者与能力标识 | [S-5](#s-5-一次经过) 动作两个位置的锚；[S-24](#s-24-before_action-上的改写与生效参数) 生效参数；[S-14](#s-14-结论合不合法两类判断) ② 挂派生表示的判定 |
| `data.call-accounts` | `#S-37` 三个归属标识的家 | [S-21](#s-21-dispatch一次经过) ① 的 `run`、`attempt` |
| `data.model-response` | `#S-10` 有效模型怎么来的、`#S-14` 回复与已交付部分 | [S-23](#s-23-效果之后的事由谁做)、[S-25](#s-25-before_model_call-上的换模型与重新组装)：效果交给它记（`replyDisposition` 的 `vetoed`、`route.selectedBy`） |
| `data.identity-values` | `#S-17` 身份参数没有默认值、`#S-18` 缺席即拒绝、`#S-19` 不可用即明确失败、`#S-30` 跨边界须重新验证、`#S-33` 表示层校验与判定分开 | [S-16](#s-16-缺席时的默认答案)、[S-32](#s-32-装配给的保证-vs-协议须给的保证) |

#### 本版未登 catalog 的依赖（并行起草，合流对齐时补登）

| 坐标 | 消费面 | 用在哪 |
|---|---|---|
| `capability.tool-admission` v1 | **放行判断件的能力标识**；它是一件可否决的系统自带件；`#S-12` 答复（四个选项 id 或 `declined`，自由作答不是答复）、`#S-14` 拒绝原因 token、`#S-21`／`#S-23` 整批一次与一轮的含义、`#S-28` 四档选项只在它出的卡上带授权、`#S-29` 结论投影与失败即全拒、`#S-31` 一批里还有一条在等谁都不执行 | [S-6](#s-6-拓展件链从装配清单来) 钉末位、[S-17](#s-17-系统自带件不可用时一律关门) 不可用即全拒、[S-28](#s-28-回放)、[S-29](#s-29-一批动作每个动作一次经过) 第 5～9 条 |
| `capability.model-request-runtime` v1 | `select_model` 的合法目标判定；`retry` 的三道守卫（已终结、已开口、事实类）与拒绝值 `retryRefused` | [S-14](#s-14-结论合不合法两类判断)、[S-26](#s-26-retry-与它被拒) |
| `capability.asset-evaluation` v1 | 各件求得的位置、维度、干预力、报错策略（经装配清单） | [S-6](#s-6-拓展件链从装配清单来) |
| `capability.modality-projection` v1 | `#S-20` 转换件对一条消息的产出（挂派生表示或否决）、`#S-22` 没有转换件输入的消息不依赖转换这一侧、`#S-23` 转换之后不再动块 | [S-6](#s-6-拓展件链从装配清单来) 转换件的位置、[S-14](#s-14-结论合不合法两类判断) 挂派生表示的出口、[S-17](#s-17-系统自带件不可用时一律关门) 转换件那一行 |

> **`data.model-profile` 与 `data.offer-expiry` 不在上面，是有意的。**`select_model` 的档案引用与 `retry` 的供应商经 `data.loop-extension` 的形状到达，
> 判定归模型请求运行时；结论记录的时刻表示也由数据半边引过。本契约没有一处据它们两份的条款写出承诺、判定或映射——按
> [登记口径](../../../README.md#当前状态)，提到不是消费。

---

## 二、概念、身份与必要状态

### S-5 一次经过

**一次经过**（无词条）：**运行时在一个位置的一次到达上，把拓展件链逐件求值一遍。**
它由 **(会话, 位置, 维度, 锚)** 指认；会话由装配清单给出（[S-6](#s-6-拓展件链从装配清单来)），锚按位置定：

| 位置（维度） | 锚：这一次经过为谁而来 | 锚从哪来 |
|---|---|---|
| `attempt_started` | 那次执行尝试 (run, attempt) | 输入 |
| `before_persist_message` | 待落盘那条消息的 `MessageId` | `subject.message` |
| `after_persist_message` | 刚落盘那条消息的 `MessageId` | `subject.message` |
| `before_compaction` | 这一运行里**这一趟**压缩：自上一趟压缩发生、或上一次在这个位置以否决或停止收场之后的第一次到达 | 由日志推出 |
| `after_compaction` | 那条 `CompactionMessage` 的 `MessageId` | `subject.compaction` |
| `before_model_call` | 这一运行里**下一次**模型调用：自上一次模型调用发生之后的第一次到达 | 由日志推出 |
| `after_model_call`（`complete_reply`） | 那条回复的 `MessageId` | `subject.reply` |
| `after_model_call`（`failure`） | 这一运行里最近一次以失败收场的那次模型调用 | 由日志推出 |
| `before_action` | 那个动作的 `CallId` | `subject.call` |
| `after_action`（`each`） | 那个动作的 `CallId` | `subject.callId` |
| `after_action`（`batch`） | 那一批：产出这批调用的那条回复 | 由 `subject.outcomes` 与日志推出 |
| `before_terminal` | 这一运行里**这一次**收束：自上一次在这个位置以否决收场之后的第一次到达 | 由日志推出 |
| `after_terminal` | 那次运行 | 输入 |

- **同一个锚上的同一位置（维度），恰有一次经过。**这是「同一位置同一次经过只跑一轮」（[S-18](#s-18-同一位置同一次经过只跑一轮)）与回放（[S-28](#s-28-回放)）的共同依据。
- **一次经过可以跨执行尝试存续**：尝试 1 在它中途停机，尝试 2 接着的是**同一次**经过，不是新的一次。
- **锚只由日志与输入推出**，不读运行实例里的任何东西——否则 [I-14](../../../../product/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式) 当场不成立。
- **「由日志推出」的那几行现在只写到含义为止**：结论记录（`data.loop-extension/v1#S-30`）只带 `callId` 这一种锚，
  其余位置要靠日志次序与「状态点在日志里以哪种事实出现」推出；这两样都不在本契约手上，
  **而入站那一侧的 `before_persist_message` 经过会与 loop 的经过在同一本日志里交错**。锚在记录上怎么落是 [G-1](#十三已知缺口)，**它挡回放的实现定稿**。

### S-6 拓展件链：从装配清单来

**一次经过的链 = 这个会话当前的[装配清单](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-assembly-manifest--装配清单--assembly-manifest)里、求得的位置与维度等于这一次经过的那些拓展件，按清单里的顺序排。**

1. **次序只来自装配清单**（[D-038](../../../../record/decisions/message-and-shape-rulings/decision.md#十九处分岔) Q8；`data.loop-extension/v1#S-10`）。系统自带件与外来件一并按此排；声明里没有次序成员。
2. **两处例外，都是把一件系统自带件钉在链末**（主线裁定 2026-09-23，待产品负责人确认）。不论清单把它排在哪，runner 都把它移到这一位置链上最后求值：

   | 位置 | 钉在末位的件 | 为什么必须在末位 |
   |---|---|---|
   | `before_action` | **放行判断** | [放行判断判的、人签的、实际执行的必须是同一份参数](../../../../product/PF-012-agent-loop-and-run/design.md#改参数先落一条生效参数)：它排在任何一件改写之后，才判得到最后那一份（[S-24](#s-24-before_action-上的改写与生效参数)）。**本条关闭 `data.loop-extension/v1` 的 G-13** |
   | `before_persist_message` | **模态转换** | 它必须是这一位置上**最后一个动块的**：排在它之后的一件若新塞进一个图块、或剥掉已挂上的 transcript，那个块就绕过转换直接落盘（`capability.modality-projection/v1#S-23`） |

   - **装配清单的义务**：清单应当把这两件排在各自位置的末位。**runner 不依赖清单做到这一点**——它在求值时强制，清单排在别处也按末位求值；两件的认法只凭能力标识（[S-7](#s-7-系统自带件怎样挂上)）。
   - **模态转换取的是整条链的末位，不只是「最后一个动块的」**：runner 按求得的干预力并不知道一件会不会动块，而末位同时满足「它之后没有件」这一条更强的性质；代价只是排在它之后的只观察件改为排在它之前、看到的是转换前的那一条。**这是本契约取的最简兑现，已报主线**。
   - **清单里没有这一件**（没装、或装了但求得的位置不在那一位置）**不等于这一关不存在**：runner 在链末照样认它为一件、按[不可用](#s-17-系统自带件不可用时一律关门)处置——放行判断全拒；模态转换对含转换件输入类块的消息否决。
   - 这是本契约里系统自带件仅有的**次序**特权；它与 PF-012「自带的不享受特权」字面相左，**已报产品负责人确认**（[G-11](#十三已知缺口)）。
3. **链上每一件带着它这一次求得的四样值**：位置、维度、干预力、报错策略。**求得的值记在装配清单里**，runner 只读、不求值、不收窄；
   干预力不高于声明的值、工作区带来的一律只观察（[PF-002 §5.7](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算)）由资产求值兑现。
   清单里这四样值**怎么表示**，本版没有答案（[G-2](#十三已知缺口)）。
4. **链在一次经过开始时读定。**经过进行中装配清单被追加，**这一次经过不变**；变化从下一次经过起作用。
   跨尝试接着的那一次经过，按新的一次尝试读到的清单**重新核对**（[S-28](#s-28-回放) 的 `replayInconsistent`）。

### S-7 系统自带件怎样挂上

**系统自带的五件（循环探测、放行判断、卸载判定、模态转换、重试）是拓展件，挂法与外来件完全相同：**

| 问 | 答 | 由谁给 |
|---|---|---|
| 什么时候挂上 | **装配时**：它们作为装配清单里的条目出现，站在各自的位置上（[PF-012 系统自带的几件](../../../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件各站在哪)） | 装配（PF-004） |
| 同一位置和别的件谁先谁后 | 装配清单的顺序；**放行判断钉在 `before_action` 链末、模态转换钉在 `before_persist_message` 链末**（[S-6](#s-6-拓展件链从装配清单来)） | 装配给；两处末位由本契约强制 |
| 它的实现怎样在场 | 由装配使之在场；runner 不装载、不启动任何实现，只在求值那一刻问「此刻在不在」 | 装配给（[S-32](#s-32-装配给的保证-vs-协议须给的保证)） |
| runner 怎样认出它 | **只凭能力标识**（`data.loop-extension/v1#S-7`）；标识由各自 owner 定——放行判断 `capability.tool-admission`、模态转换 `capability.modality-projection`、重试 `capability.model-request-runtime`、卸载判定 `capability.tool-execution-runtime`、循环探测 agent loop | 各 owner（[G-3](#十三已知缺口)） |
| 认出来之后多了什么 | **三样**：[S-17](#s-17-系统自带件不可用时一律关门) 的关门表（只在它此刻不可用时起作用）；放行判断与模态转换的末位（[S-6](#s-6-拓展件链从装配清单来)）；**模态转换独有的「挂派生表示」出口**（[S-14](#s-14-结论合不合法两类判断) ②） | 本契约 |

**除这三样之外它们没有任何特权**：同一套输入、同一套结论、同一套合法组合、同一套报错策略、同一套回放。
模态转换件本版不是资产（[UL-modality-converter](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-modality-converter--模态转换件--modality-converter)），但它**照样以一件拓展件的身份出现在链上**。

### S-8 本契约不持有运行实例里的状态

**runner 拥有的事实全部是会话日志里的记录**，恰两类：

| 记录 | 形状 | 何时写 |
|---|---|---|
| **结论记录** | `data.loop-extension/v1#S-30`、`#S-31` 的 `Conclusion`，作为一条[记录条目](../../../../ubiquitous_language/terms/record-and-context.md#ul-record-entry--记录条目--record-entry)进会话日志；条目壳怎样挂运行、尝试与租户身份归 PF-000 与 loop 的契约 | 每件得出最终结论时（[S-11](#s-11-每件恰一条最终结论落进会话日志)） |
| **runner 追加的提醒** | `data.messages/v1#S-15` 的 `SystemReminderMessage`，`source.kind = extension`（`data.messages/v1#S-26`） | 这一次经过走完时（[S-19](#s-19-注入的提醒怎样追加)） |

- **没有一条正确性事实只活在运行实例里**：链读自装配清单、锚读自日志与输入、「这一件已经有结论」读自日志、连续被否决的次数数自日志（[S-30](#s-30-连续被否决的回复)）。
  **重启、换一副协程、换一个 runner 实例，都不改变任何一次经过的结果。**
- **这不是运气，是一条可被推翻的承诺**：任何让某件事只记在运行实例里的修改都使它失效，那时必须回到 [S-34](#s-34-撤下回收与取消时在途的经过) 重写交接责任。

### S-9 日志只读句柄的读面

**交给拓展件的 `log`（`data.loop-extension/v1#S-12` 的 `LogHandle`）读得到什么，由本条定。本条关闭 `data.loop-extension/v1` 的 G-3。**

1. **只读，只及本会话。**经它读不到别的会话、别的租户的任何条目；它不是一把访问别处的钥匙。
2. **只在这一次调用里有效。**句柄绑定在「这一件、这一次经过、这一次调用」上；那一次调用返回之后再读，**读取失败**，不返回旧内容——
   这让 [S-35 作者须知](../../../data/loop-extension/v1/contract.md#s-35-跨过一次等待只能带已落日志的东西) 在形状之外多一道结构上的保证：跨过等待，旧句柄带不过去。
3. **下界**：它至少读得到
   - 这一次经过**开始时**会话日志里已提交的全部条目；
   - 这一次经过里**排在前面的各件已落的结论**（与 `earlier` 同一批，[S-10](#s-10-逐件顺序求值先落后算)）；
   - **回放中的那一件**：它这一次经过的那条 `ask` 结论、那张卡片落盘的记录与答复（`data.messages/v1#S-22`）。
4. **读不到即失败，不返回空**：存储此刻读不到，那一次读取失败；那一件把它当成一次报错交回，按 [S-13](#s-13-报错处置策略的执行) 处置。**「读不到」不得被读成「日志里没有」。**
5. 读的接口（按什么查、一次读多少）**不在本契约**；跨进程之后这条下界由协议兑现（[S-32](#s-32-装配给的保证-vs-协议须给的保证)）。

---

## 三、贯穿全部操作的规矩

### S-10 逐件顺序求值，先落后算

> **注：产品正文叫它「瀑布」。本契约写「逐件顺序求值」**——它与某些运行时框架里同名的「waterfall」派发（环绕式、件拿到「继续往下走」的能力）**同名不同义**，
> 那一种正是 [PF-012 拆掉的环绕式](../../../../product/PF-012-agent-loop-and-run/design.md#三种形态两种装得进一种拆两半)。本契约任何一处都不指它。

一次经过里，链上各件**一件接一件**地求值：

1. **第 k 件的输入**按 `data.loop-extension/v1#S-11`～`#S-14` 造：`subject` 是前 k−1 件合成之后的那一份（[S-15](#s-15-效果怎么合成)），`earlier` 是前 k−1 件已落的最终结论记录、按链的次序，`log` 是一只新句柄（[S-9](#s-9-日志只读句柄的读面)）。
   `run` 与 `attempt` 在 `before_persist_message` 上**不交给拓展件**（`data.loop-extension/v1#S-11`），哪怕 runner 自己知道。
2. **等第 k 件交回、并把它的最终结论落进日志之后，才开始第 k+1 件。**结论没落成记录，就不存在；后一件看不见它，效果里也没有它（`data.loop-extension/v1#S-32`）。
3. **遇到终止的那一条就停**：`veto`、`stop`、`ask`、`retry`（[S-15](#s-15-效果怎么合成)）。后面的件**这一次不被求值**，也不留结论记录——它们没有被轮到，不是「不可用」。
4. **件与件之间不并行。**并行只发生在一批动作的各自经过之间（[S-29](#s-29-一批动作每个动作一次经过)）。
5. **runner 自己等每一件交回**；它不把求值交给任何「发出即不等待」或「首个非空即胜」的派发——那两种派发下，一个异步的判定会被静默放过。

### S-11 每件恰一条最终结论，落进会话日志

**一次经过里被轮到的每一件，恰有一条最终结论记录落进会话日志**——跑出了结论的、不可用的、报错的，一个不漏（`data.loop-extension/v1#S-30`、`#S-31`）。
出过卡的那一件，**它出的每一张卡另有一条** `ask` 记录在前（它们不是最终结论；答复之后可以再出一轮，[S-28](#s-28-回放) 第 4 条）。

- **落的是可见的事实，不是运行时内存里的一笔。**结论记录是会话日志里的一条记录条目：排查的人、审计、状态转移表、回放都读它（[PF-012 §6.10](../../../../product/PF-012-agent-loop-and-run/design.md#610-能干预的拓展件必须留下结论)）。
- **「恰一条」对同一次经过成立**，跨多少次尝试都一样：已有最终结论的件不再求值（[S-28](#s-28-回放)）。
- **记录里的 `power` 是这一次求得的值**，`position`、`dimension` 是这一次经过的；`callId` 在动作两个位置必带、等于锚。
- **`output` 是已经生效的那一个**：被判定为不合法的结论不以原样出现在那里（[S-14](#s-14-结论合不合法两类判断)）。
- **`error` 与 `reason` 不得带凭据，不得转述任何没有落盘的内容**（`data.loop-extension/v1#S-31`、`#S-25`）；runner 写的那几句（[S-13](#s-13-报错处置策略的执行)、[S-17](#s-17-系统自带件不可用时一律关门)）同样守这一条。

### S-12 不可用与报错：runner 怎么分

**一件拓展件轮到它时，恰是三种结果之一**（`data.loop-extension/v1#S-33`）：

| 结果 | 什么情形 | 谁判 | 记成什么 |
|---|---|---|---|
| **不可用** | ① 声明的依赖（`needs`）有一项此刻不在场；② 它的实现此刻不在场；③ 实现在场，但报告**起不来**（在产出任何结论之前就无法开始） | ①② runner；③ 实现自己说 | `skipped: unavailable`，**不带 `output`**；这一次这个位置**没有它**。系统自带件另按 [S-17](#s-17-系统自带件不可用时一律关门) |
| **可用却报错** | 实现开始了，然后出了错；或交回的东西不合法（[S-14](#s-14-结论合不合法两类判断)）；或经句柄读日志失败 | runner | `skipped: errored` ＋ `error` ＋ 处置策略落下的 `output`（[S-13](#s-13-报错处置策略的执行)） |
| **跑出了结论** | 交回一条合法结论 | runner | 那条结论 |

- **「起不来」只能由实现在开始之前说**；一旦开始了，之后的任何失败都是报错。**这条分界不许倒过来用**：把跑到一半出的错报成「起不来」，就是把一道该关门的关静默拆掉。
- **兼容件的哪些情形算「起不来」**（脚本路径不存在、执行环境落不了位）**、哪些算报错**（非零非 2 退出、超时、输出不合形状），由 [`capability.hooks-import` v1](../../hooks-import/v1/contract.md) 定；本条只要求它把每一种情形归进上表的恰一行。
- **runner 不继承「实现被拒 → 当作无意见」**：一件实现起不来，记不可用；它开始后失败，记报错。**两者都不是 `observed`**（D-033）。
- **不可用不是否决**，报错也不是：前者这一次没有它，后者按策略处置（`data.loop-extension/v1#S-33`）。

### S-13 报错处置策略的执行

**一件「可用却报错」的拓展件，这一次按它的有效策略处置。有效策略这样定：**

1. 链上带着这一件**求得的**报错策略（[S-6](#s-6-拓展件链从装配清单来)）；缺席即按求得的干预力取默认：`observe` → `ignore`，`rewrite` → `record`，`veto` → `treat_as_veto`（`data.loop-extension/v1#S-5`）。
2. **求得的策略高于求得的干预力允许的那一档**（`observe` 只许 `ignore`，`rewrite` 至多 `record`）时，**这一次按求得的干预力的默认处置**——拦不住东西的件，报错时同样拦不住。

**处置落下的结论**（写进这条报错记录的 `output`；`veto`、`stop` 的 `reason` 由 runner 写，只说「本件报错，按 treat_as_veto 处置」，**不转述报错详情**）：

| 有效策略 | 五个「之前」的位置 | `attempt_started` 与四个 `after_*`（不含 `after_terminal`） | `after_terminal` |
|---|---|---|---|
| `ignore` | `observed` | `observed` | `observed` |
| `record` | `inject`：一条以本件名义的「本件这一次没跑成」提醒 | 同左 | `observed` |
| `treat_as_veto` | `veto` | `stop { terminal: failed }` | `observed` |

- **`record` 那条提醒由 runner 写**：`SystemReminderMessage`，`source.kind = extension`、`source.extension` = 本件的 name，`nature = event`；正文只说本件这一次没跑成。它像任何注入一样在经过走完时追加（[S-19](#s-19-注入的提醒怎样追加)）。
- **`before_persist_message` 上的 `treat_as_veto` 就是那一路的否决**，之后按 `producer` 分三路（[S-23](#s-23-效果之后的事由谁做)）；模态转换件报错即走这一条——转不成就不落盘。
- **越档的结论也在这里收**：一件 `observe` 档件交回 `veto`，这条结论不合法（[S-14](#s-14-结论合不合法两类判断)），这一次按 `ignore` 处置——落 `observed`，`error` 恰为 `output_not_allowed_for_power`，**看得见**。
- **处置是这一次的事**：下一次经过它照样被轮到，照样按那一次的情形判。

### S-14 结论合不合法：两类判断

**一件交回的结论，runner 按次序过两类判断；任一不过，这一次按「可用却报错」处置（`data.loop-extension/v1#S-34`）：**

| 次序 | 判断 | 依据 | 不过时 `error` 记什么 |
|---|---|---|---|
| ① | **表示层校验**：形状、两张合法组合表（按记录里求得的 `power` 与这一次经过的位置）、改写没动不可改的成员、注入没冒名 | `data.loop-extension/v1#S-37` 的十个拒绝值，自上而下取第一个命中的 | **恰为那个拒绝值** |
| ② | **本契约与能力的判定**：见下表 | 下表各行 | 一段说明（不是拒绝值 token） |

**第 ② 类恰五条**：

| 结论 | 判定 | 由谁判 |
|---|---|---|
| `before_persist_message` 上**动了派生表示**的 `rewrite`（给块挂上、换掉或去掉派生表示与 transcript） | **只有系统模态转换件交回的才生效**；别的件交回即不生效（[`data.content-blocks/v1#S-20`](../../../data/content-blocks/v1/contract.md#s-20-派生表示的产出者与能力标识)：本版派生表示由系统装配层登记的转换件产出） | 本契约 |
| `rewrite` 落在 `before_persist_message` 上、而 `subject.producer = model` | **只有「挂派生表示」这一种生效**：交回的消息与输入相比，差别只能是一些原本没有派生表示的块挂上了派生表示与 transcript（[`data.content-blocks/v1#S-19`](../../../data/content-blocks/v1/contract.md#s-19-派生表示与-transcript)），块的序列、每一块的其余成员、消息的其余成员逐值不变——由上一行，它只能来自模态转换件。**其余任何改写不生效**：模型产出的消息在落盘之前只开放否决、不开放改写——用户已经在流式里看过原文（主线裁定 2026-09-23，读数报回 D-5）。所以在这里合法的只有三种：`veto`、`observed`、模态转换件的「挂派生表示」 | 本契约 |
| `select_model` | `profile` 在这一次的合法目标集合里 | `capability.model-request-runtime`（并行起草） |
| `retry` | 三道守卫都过：这次调用未终结、未开口、成因不属事实三类；`plan.provider` 是有效模型的档案允许的供应商 | 同上；拒绝值 `retryRefused` 归它（[S-26](#s-26-retry-与它被拒)） |
| `inject` 落在注入链第二层及以下 | **不生效**：注入链只许一层（[S-19](#s-19-注入的提醒怎样追加)） | 本契约 |

- **两类判断都在这件的结论落日志之前做完**：落下的只会是生效的那一个，或按策略处置的那一个（`data.loop-extension/v1#S-32`）。
- **判定此刻做不出来**（合法目标集合算不出来、模型请求运行时读不到）**不是「不合法」**：这一次经过在这一件停下，`dispatch` 以 `unavailable` 失败、这件不留记录，按当时状态重试（[S-16](#s-16-缺席时的默认答案)）。
- **不修补、不降级**：不把一条不合法的 `veto` 降成 `observed` 当作它的结论，不把一个不在集合里的模型就近换成一个在的（`data.loop-extension/v1#S-38`）。按策略落下的 `observed` 是**处置**，记录里 `skipped: errored` 与 `error` 同时在，分得出。

### S-15 效果怎么合成

**一次经过的效果**（施工账本的 `Effect`）**由这一次经过已落的结论按链的次序合成**，恰五种：

| 效果 | 何时 | 带什么 |
|---|---|---|
| `vetoed { by }` | 链上**第一条**终止的结论是 `veto`（含报错按 `treat_as_veto` 落下的那一条）；或 [S-17](#s-17-系统自带件不可用时一律关门) 的关门 | 那一件的 name |
| `stopped { by }` | 第一条终止的结论是 `stop`（含 `treat_as_veto` 在「之后」落下的）；或 [S-30](#s-30-连续被否决的回复) 的收住 | 那一件的 name；终态与原因在那条结论里 |
| `asked { card, by }` | 第一条终止的结论是 `ask` | 那条 `ask` 里的卡片草稿、那一件的 name |
| `retry { plan }` | 第一条终止的结论是 `retry`（只在 `after_model_call{failure}`） | 那一条的 `plan` |
| `proceed { subject }` | 链走完，没有终止的结论 | 合成后的 `subject`：**依次叠上每一条 `rewrite` 交回的那一份、每一条 `select_model` 换上的 `request.target`**，后写的盖前写的 |

- **终止的结论只看第一条**：`veto`、`stop`、`ask`、`retry` 任一出现，链到此为止（[S-10](#s-10-逐件顺序求值先落后算) 第 3 条），后面的件不被求值。
  **同一位置两件都会给 `retry` 时，取链上的第一件；后一件这一次不被求值**（主线裁定 2026-09-23）。
- **`inject` 不进效果**：它们各自是一条要追加的提醒，按 [S-19](#s-19-注入的提醒怎样追加) 在经过走完时追加，**不论效果是哪一种**。
- **没有放宽**：没有任何一种合成能把一次「问一下」变成放行（`data.loop-extension/v1#S-29`）。放行判断交回 `ask`，效果就是 `asked`；前面的件都交回 `observed` 也不改这一点。
- **`observed` 与不可用、报错按 `ignore` 处置的那一条，对效果的贡献相同——什么都不改**；它们在记录里分得开（[S-12](#s-12-不可用与报错runner-怎么分)）。
- **账本另列了一种 `selectModel { profile }`，本契约不单列**：同一次 `before_model_call` 经过里换模型与改参数可以同时发生，单独一种效果装不下两者；换上的目标因此写进 `proceed.subject.request.target`，谁换的由结论记录给出（[S-25](#s-25-before_model_call-上的换模型与重新组装)）。**这是对账本的一处偏离，已报主线。**
- **效果是结论的函数**：同一串结论合成出同一个效果，与在哪次尝试里合成无关——**这就是重算得到同一个下一步的来由**。

### S-16 缺席时的默认答案

**一律拒绝或明确失败，不放行、不空集、不回退。**四类要分开：

| 情形 | 结果 | 为什么不能合并 |
|---|---|---|
| **判定得出「不放」** | 一条具名的结论或效果（`veto`、`vetoed`……） | 成立的结论，重试不会变 |
| **判不出来**：存储、装配清单或判定来源此刻读不到 | `unavailable` 失败，**不产出效果** | 没有结论；按当时状态重试可能不同 |
| **找不到这个会话的装配清单** | `manifestMissing` 失败 | **找不到清单 ≠ 链是空的**。把它当成空链，`before_action` 上的放行判断就被跳过了——那是一次静默放行 |
| **输入不合形状** | `invalidInput`（位置不在十一个里是更具体的 `positionUnknown`） | 表示层校验不是判定（`data.identity-values/v1#S-33`），重试一万次也不会过 |

- **身份参数没有默认值**：`manifest`、`run`、`attempt` 缺席即拒绝，不从运行实例、上下文或「当前会话」补（`data.identity-values/v1#S-17`、`#S-18`）。
  `run` 与 `attempt` **该带时不带、不该带时带了**，同样是 `invalidInput`（[S-21](#s-21-dispatch一次经过) ①）。
- **链上一件的实现缺席**不是本条的「判不出来」：那是这一件不可用（[S-12](#s-12-不可用与报错runner-怎么分)），经过照常往下走——**系统自带件除外**（[S-17](#s-17-系统自带件不可用时一律关门)）。
- **本契约没有带默认值的非身份参数。**报错策略缺席取干预力的默认，是数据半边给的规则，不是本契约填的初值。

### S-17 系统自带件不可用时一律关门

**五件系统自带件「不可用」时，不照「视作卸载」那一条办，照下表（主线裁定 2026-09-23，待产品负责人确认）：**

| 件 | 位置（维度） | 不可用时这一次经过的效果 | 为什么 |
|---|---|---|---|
| **模态转换** | `before_persist_message` 末位 | **这条消息里（含嵌在工具结果里任意层的）有非文本模态的块（语音块、图块）或文件块** ⇒ **`vetoed { by: 转换件 }`**：这条不落盘，之后按 `producer` 分三路。**没有这三类块** ⇒ 与「这一件不在」相同：只记一笔可见，效果不变（`capability.modality-projection/v1#S-22`） | 转换件在却不可用，照「没装」办会让一个说不清读不读得了的块混进日志、可选模型永久变少——**不可用 = 转换失败 = 否决**（读数报回 C-7）。**只及含那三类块的消息**：一件看图用的转换件挂掉不得让纯文本连一句都落不了盘。判断「有没有」只看这条消息本身，转换这一侧整个不可用时也判得出。**「某个键上根本没有登记转换件」是另一回事**，那是转换件自己的判定，照 [PF-013](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件) 原样落盘 |
| **重试** | `after_model_call`（`failure`） | **与「这一件不在」相同**：没有 `retry`，这一层试尽、上交（读数报回 C-8） | 不重试是安全的那一边 |
| **放行判断** | `before_action` 末位 | **`vetoed { by: 放行判断 }`**：**全拒**——这一批里经过它的每个动作都不做 | 「任何层的明确禁止，任何模式都翻不了案」；按字面「不在就跳过」是 fail-open。**这一行待产品负责人裁**（账本 U-5），本契约按「全拒」起草 |
| **循环探测** | `after_model_call`（`complete_reply`） | 与「这一件不在」相同：只记一笔可见 | 它不在，最坏是这一次没看出打转；阶梯从日志数，下一次照样数得到 |
| **卸载判定** | `after_action`（`each`） | 与「这一件不在」相同：只记一笔可见 | 结果原样落成消息；多占上下文，不越权 |

- **记录照 `data.loop-extension/v1#S-31` 写**：那一件记 `skipped: unavailable`、**不带 `output`**——runner 不替它编一个 `veto`。
  **关门的是效果**：「转换件或放行判断不可用 ⇒ 这一次经过的效果是 `vetoed`」是本条的规则，读日志的人与状态转移表都照它从那条不可用记录算出同一个效果。
- **关门之后链到此为止**，与一条 `veto` 同样终止。放行判断在末位，它关门时前面的件都已求值完。
- **「报错」仍按 [S-13](#s-13-报错处置策略的执行)**：本表只管「不可用」。两者对放行判断的结果相同（它是可否决档，报错默认 `treat_as_veto`），但记录不同，分得出。
- **放行判断件的干预力被各层收窄到 `veto` 以下时怎么办，本版没有答案**（[G-4](#十三已知缺口)）：照数据半边它就拦不住任何东西——这是一条 fail-open 的路，已报主线。

### S-18 同一位置同一次经过只跑一轮

1. **对同一次经过再调一次 `dispatch`，不重新求值任何已有最终结论的件**；链已走完或已终止的，**原样重建上一次的结果**（[S-28](#s-28-回放)）。
   `dispatch` 因此对同一次经过是幂等的：调几次都得到同一个效果，日志里不多出第二条结论。
2. **一次经过改了日志，不会让同一个锚上的同一位置再来一次**：`before_model_call` 上有件注入了提醒，请求要重新组装，**但不回到这个位置**（[PF-012 只跑一轮](../../../../product/PF-012-agent-loop-and-run/design.md#改了日志就重新组装同一位置同一次经过只跑一轮)、[S-25](#s-25-before_model_call-上的换模型与重新组装)）。
3. **本条不管别的位置**：注入的提醒自己落盘，要经过 `before_persist_message` 的一次**新**经过（锚是那条提醒）；它是否还能再注入，由 [S-19](#s-19-注入的提醒怎样追加) 管。

### S-19 注入的提醒怎样追加

**一次经过里要追加的提醒**——各件交回的 `inject`、`record` 策略落下的「没跑成」、[S-30](#s-30-连续被否决的回复) 的否决提醒——**按下面四条追加：**

1. **经过走完时、按链的次序追加**，不论效果是哪一种；**在效果交给调用方之前**追加完。
   直接后果：在 `before_persist_message` 上，这些提醒**排在那条消息之前**（那条消息由调用方在拿到 `proceed` 之后才落）；在 `before_model_call`、`before_action`、`before_terminal` 上，它们排在那个状态点发生之前；在「之后」的位置上排在它之后。
2. **恰一次**：每条提醒以结论记录里记下的那一份为准、以它的 `MessageId` 为键；日志里已有同一 `MessageId` 的消息就不再追加（`data.messages/v1#S-32`）。
   经过走完、提醒还没追加完就停机，下一次尝试重建这一次经过时**补上缺的那几条**（[S-28](#s-28-回放)）。
   **提醒的 `id` 与 `createdAt` 由谁给、拓展件给的 `id` 撞了怎么办，本版没有答案**（`data.loop-extension/v1` 的 G-16，[G-5](#十三已知缺口)）。
3. **它们是要落盘的消息**：每一条都经过 `before_persist_message` 的一次新经过（`producer = system`），那里挂的件照样对它起作用——包括否决它。
4. **注入链只许一层**：一条由 runner 追加的提醒，在**它自己**落盘之前的那一次经过里，**任何件交回的 `inject` 都不生效**（[S-14](#s-14-结论合不合法两类判断) ②），`record` 策略在那里也只落 `observed`、不再追加。
   不这样，一件每次都注入的件会让注入无限触发，loop 永远到不了下一个状态点。**一层是本契约取的最小上界**，理由与推导见 [S-40](#s-40-注入链只有一层)；要放宽到更深，是本契约的新版本。

- **提醒与效果 `stopped` 同时出现**：提醒照样在终态之前追加。**它们会不会让待处理消息队列非空、从而起下一次运行**，本契约不定——与「系统追补的中断提醒不计为让队列非空的输入」（读数报回 D-6a）是同一类问题，[G-6](#十三已知缺口)。

---

## 四、操作

### S-20 这一节每个操作写全九件事

| # | 写什么 |
|---|---|
| ① | **输入** |
| ② | **前置与授权** |
| ③ | **结构性禁止**（不适用写「无」） |
| ④ | **提交点与原子性** |
| ⑤ | **成功返回** |
| ⑥ | **失败集合**（枚举封闭，**没有「其他」**） |
| ⑦ | **幂等与重复** |
| ⑧ | **缺席时的默认答案**（[S-16](#s-16-缺席时的默认答案)） |
| ⑨ | **事件**（[S-31](#s-31-本契约不开事件)） |

**本节共两个操作。**失败值是具名的封闭枚举；**每个操作的⑥都含 `invalidInput`**。

> **失败值有两个不在施工账本里**：`unavailable`（与已接受的组织治理契约同名同义：判不出来，按当时状态重试）与 `attemptSuperseded`（尝试栅栏拒收）。
> 两者都是这两个操作必须能表达、账本没有给名字的收场；**本契约取这两个候选名，待主线确认**，确认之前不得被别的契约当作已定型的名字引用。

### S-21 dispatch：一次经过

`dispatch(position, dimension?, subject, manifest, run?, attempt?) → DispatchResult`

| # | 内容 |
|---|---|
| ① | `position`、`dimension`（按 `data.loop-extension/v1#S-2` 配对）；`subject`（按 `#S-14` 与位置对应）；`manifest`：**这个会话当前的装配清单的指认**——它同时指认会话，从而指认这一次经过读写的那本会话日志；`run`、`attempt`：**除 `before_persist_message` 外必带**；在 `before_persist_message` 上，**仅当 `subject.producer ∈ { model, tool }` 时必带**（那条消息属于一个运行，[S-23](#s-23-效果之后的事由谁做) 与 [S-30](#s-30-连续被否决的回复) 要它），其余不带。**runner 带着它们，但不把它们交给这个位置上的拓展件**（`data.loop-extension/v1#S-11`） |
| ② | 调用方是这个会话的 agent loop（或入站那一侧落一条外面进来的消息时的受理方）；**本契约不核实调用方身份**，这一条由装配给（[S-32](#s-32-装配给的保证-vs-协议须给的保证)）。`attempt` 必须是这个运行此刻序号最大的那次尝试——**由尝试栅栏兑现**：本操作的每一次写入都受栅栏约束，被拒即 ⑥ 的 `attemptSuperseded` |
| ③ | 无 |
| ④ | **不是一次原子提交**：每件的最终结论各自是一次提交，按链的次序、一件落完才开始下一件（[S-10](#s-10-逐件顺序求值先落后算)）；经过走完之后追加提醒（[S-19](#s-19-注入的提醒怎样追加)）。**任何一点停下，已提交的留在日志里、未提交的不存在**；下一次对同一次经过的 `dispatch` 从那里接着走（[S-28](#s-28-回放)）。**效果本身不是一条记录**，它是已落结论的函数（[S-15](#s-15-效果怎么合成)） |
| ⑤ | `DispatchResult = { conclusions, effect }`：`conclusions` 是这一次经过**已落的全部结论记录**，按链的次序（含不可用与报错的；停在 `ask` 时含那条 `ask`）；`effect` 是 [S-15](#s-15-效果怎么合成) 的五种之一 |
| ⑥ | `invalidInput` · `positionUnknown` · `manifestMissing` · `replayInconsistent` · `unavailable` · `attemptSuperseded` |
| ⑦ | **对同一次经过幂等**（[S-18](#s-18-同一位置同一次经过只跑一轮)）：已有最终结论的件不再求值；链已走完或终止的，原样重建同一个结果；缺的提醒补上、有的不重复 |
| ⑧ | 装配清单、日志、判定来源读不到 ⇒ `unavailable`，**不当成空链、不当成无意见、不跳过**；找不到清单 ⇒ `manifestMissing`；不合形状 ⇒ `invalidInput` |
| ⑨ | 不发 |

**⑥ 各值的含义：**

| 失败值 | 什么时候 | 这一次经过怎样 |
|---|---|---|
| `invalidInput` | 输入不合形状：`subject` 与位置对不上、维度配对不对（`data.loop-extension/v1#S-37` 的 `dimension_missing`、`dimension_not_allowed`、`malformed` 落在输入上时）、`run`/`attempt` 该带不带或不该带带了、`manifest` 不是一个合法的指认 | 没开始 |
| `positionUnknown` | `position` 不在十一个里（`data.loop-extension/v1#S-37` 的 `position_unknown`） | 没开始 |
| `manifestMissing` | 指认的装配清单不存在，或它不属于这一次经过所在的会话 | 没开始 |
| `replayInconsistent` | 这一次经过**已有**结论，而它们与此刻的链对不上；或回放中的那一件偏离了它记下的等（[S-28](#s-28-回放) 第 1、4 条） | 停在原处，**不补、不改、不重排**；已落的都在 |
| `unavailable` | 存储、装配清单、或 [S-14](#s-14-结论合不合法两类判断) ② 的判定来源此刻读不到或写不进 | 停在出事的那一件之前；它没有记录 |
| `attemptSuperseded` | 一次写入被尝试栅栏拒收：这个运行已经有序号更大的尝试 | 这一副协程不再推这个运行；已落的都在，新的那次尝试会接着这一次经过 |

**返回 `asked` 时 loop 该做什么**见 [S-27](#s-27-ask交出卡片并停在这一位置)；其余效果见 [S-23](#s-23-效果之后的事由谁做)。

### S-22 replay：从日志重建一次经过

`replay(position, dimension?, subject, manifest, run?) → Conclusion[]`

| # | 内容 |
|---|---|
| ① | 与 `dispatch` 同一套寻址：`position`、`dimension`、`subject`（用来推出锚，[S-5](#s-5-一次经过)）、`manifest`、`run`（带不带的规则同 [S-21](#s-21-dispatch一次经过) ①）。**不带 `attempt`**：一次经过跨尝试存续，读它不需要知道此刻是第几次 |
| ② | 同 `dispatch`；**它只读，不受尝试栅栏约束** |
| ③ | 无 |
| ④ | 只读，无提交 |
| ⑤ | 这一次经过**已落的全部结论记录**，按链的次序；停在 `ask` 时最后一条是那条 `ask`；一次都没开始时是**空列表**——**「没有结论」与「读不到」是两回事**，后者是 `unavailable` |
| ⑥ | `invalidInput` · `positionUnknown` · `manifestMissing` · `replayInconsistent` · `unavailable` |
| ⑦ | 只读，天然可重复 |
| ⑧ | 日志或清单读不到 ⇒ `unavailable`，**不返回空列表** |
| ⑨ | 不发 |

- **施工账本把它写成 `replay(attempt, position)`**。执行尝试的身份是 (运行, 第几次)，本操作只需要运行——一次经过跨尝试存续（[S-5](#s-5-一次经过)）；
  而锚要从主体推出，所以带 `subject`。**这是对账本签名的一处偏离，已报主线。**
- **它是状态转移表的读面**：「这一次经过走完了没、停在谁那里、效果是什么」都从它返回的结论按 [S-15](#s-15-效果怎么合成) 算出——**不必再调一次 `dispatch` 去问**。
- **`replayInconsistent` 在这里同样报**：读出来的结论与此刻的链对不上时，不返回一份拼凑的列表。

---

## 五、各种效果之后

### S-23 效果之后的事由谁做

**runner 只落结论、合成效果、追加提醒；效果之后的状态变化由拿到它的一方去做。**下表是交接：

| 效果 | 位置 | 意味着什么 | 谁去做 |
|---|---|---|---|
| `proceed` | 任一 | 那个状态点照常发生，用的是合成后的 `subject` | 调用方 |
| `vetoed` | `before_persist_message` | **这条不落盘**，之后按 `subject.producer` 分三路（下表） | 见下表 |
| `vetoed` | `before_compaction` | 这一趟不许压：装得下照常走，装不下按「压完还超」上交、运行落失败 | agent loop |
| `vetoed` | `before_model_call` | **这次请求不发，运行落终态「失败」，原因是那条否决的理由**（主线裁定 2026-09-23，读数报回 C-9） | agent loop |
| `vetoed` | `before_action` | 这个动作不做；agent 拿到的是「不许做」及其来由（哪一件、依据），**不是执行失败**（[PF-008 §6.9](../../../../product/PF-008-human-in-the-loop/design.md#69-人拒绝之后agent-分得出那是拒绝)） | agent loop |
| `vetoed` | `before_terminal` | **这次不许收束——接着转**；否决的理由要到 agent 眼前（下文） | agent loop |
| `stopped` | 除 `before_persist_message`、`after_terminal` 外 | 那条 `stop` 的 `terminal`：`cancelled` ⇒ **先落一条取消请求（发起方写那一件），再落终态「被取消」**；`failed` ⇒ 直接落终态「失败」，原因指向那一件（`data.loop-extension/v1#S-26`） | agent loop（[取消先落日志](../../../../product/PF-012-agent-loop-and-run/design.md#615-取消先落日志再发信号)） |
| `stopped` | `before_persist_message`（仅 [S-30](#s-30-连续被否决的回复)） | 运行落终态「失败」，原因：回复连续被否决 | agent loop |
| `asked` | 除两处等不了的位置外 | 交出卡片并停在这一位置 | [S-27](#s-27-ask交出卡片并停在这一位置) |
| `retry` | `after_model_call`（`failure`） | 照 `plan` 再发一次 | 模型请求运行时（[S-26](#s-26-retry-与它被拒)） |

**`before_persist_message` 的否决分三路**（[PF-012](../../../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前的否决按消息是谁产生的分三路)，没有第四路，尤其没有「落一条替身」）：

| `producer` | 之后 | 谁去做 |
|---|---|---|
| `user`（及外部来源捎来的） | 拒绝这次请求，发送方被告知 | 入站受理方 |
| `model` | **不落盘，那次调用照常结束**；响应体记 `replyDisposition = { vetoed: { by, reason? } }`（`data.model-response/v1#S-14`）；**不触发 `after_model_call`，不产出成因**；再来一次是 loop 下一次迭代的新调用；runner 追加否决提醒并计数（[S-30](#s-30-连续被否决的回复)） | 模型请求运行时、agent loop；提醒与计数归本契约 |
| `tool` | 这次运行落失败，原因指向那件拓展件 | agent loop |
| `system` | 不落盘；此外没有别的收场 | —— |

- **`before_terminal` 的否决理由要到 agent 眼前**：runner 不另写提醒；否决记录在日志里，agent 下一次组装读得到它是上下文组装的义务（PF-010）。
  **不这样，尾巴没变、重算还是「该收尾」**——这条交接在上下文组装的契约起草之前是一处悬空（[G-8](#十三已知缺口)）。
- **`stopped` 的 `cancelled` 会带出一条中断提醒**（`data.messages/v1` 的中断之后必补一条）；那条提醒不让队列非空，是 loop 那一侧的规则（读数报回 D-6a）。
- **runner 不写任何终态、取消请求或上交条目。**它写的只有结论与提醒（[S-8](#s-8-本契约不持有运行实例里的状态)）。

### S-24 before_action 上的改写与生效参数

1. **生效参数 = 这一次经过合成后的 `subject.call` 的参数**：链上最后一条 `rewrite` 交回的那一份；没有 `rewrite` 就是模型那条回复里的原参数（`data.content-blocks/v1#S-12`）。
2. **它不另立一种记录**：最后那条 `rewrite` 结论就是日志里那一条「生效参数」，它在执行之前落下（[PF-012 改参数先落一条生效参数](../../../../product/PF-012-agent-loop-and-run/design.md#改参数先落一条生效参数)）；模型那条回复里的原参数一个字不动。
3. **放行判断判的就是这一份**：它钉在链末（[S-6](#s-6-拓展件链从装配清单来)），拿到的 `subject` 已叠上前面每一件的改写；它之后链上没有任何一件，**放行之后参数不再变**。
4. **人签的也是这一份**：放行判断据它写卡片；卡片答完之后回放，放行判断拿到的仍是同一份 `subject`（[S-28](#s-28-回放)），**不重新叠改写**。
5. **执行的也是这一份**：效果 `proceed { subject }` 交给 agent loop，它照这一份提交执行。放行凭据怎样把「这一份参数」绑住，归 `capability.tool-admission` 与 `capability.tool-execution-runtime`。

### S-25 before_model_call 上的换模型与重新组装

1. **`select_model` 换的是这一次请求的有效模型**：生效的那条把 `subject.request.target` 换成它的 `profile`，后一件拿到的就是换过的（`data.loop-extension/v1#S-13`）；后写的盖前写的。
2. **谁换的**：链上最后一条生效的 `select_model` 的那一件——模型请求运行时据此在响应体上记 `route.selectedBy = { extension }`（`data.model-response/v1#S-10`）。本契约只保证它从 `conclusions` 读得出。
3. **这一次经过里有注入**（任何件的 `inject`，或 `record` 落下的提醒）：提醒在经过走完时追加（[S-19](#s-19-注入的提醒怎样追加)），然后 **agent loop 重新组装一次请求，不再回到这个位置**。
   发出去的请求 = **重新组装得到的 `messages`** ＋ **合成后 `subject` 的 `parameters` 与 `target`**。
   **这一次经过里对 `request.messages` 的改写因此不进这次请求**——它们的结论照样在日志里，看得见；这是数据半边「注入就要重新组装」与「可以改 messages」同时成立时的合成规则，**已报主线确认**（[G-10](#十三已知缺口)）。
4. **没有注入**：发出去的就是合成后的 `subject.request`。

### S-26 retry 与它被拒

1. **`retry` 只在 `after_model_call{failure}`**；链上第一条生效的 `retry` 终止这一次经过，后面的件不被求值（[S-15](#s-15-效果怎么合成)）。
2. **它在落日志之前先过模型请求运行时的判定**（[S-14](#s-14-结论合不合法两类判断) ②）：这次调用已终结、已开口、成因属事实三类、`plan.provider` 不被档案允许——**任一成立即 `retryRefused`**。
3. **被拒的记法**：那一件这一次按「可用却报错」处置——记录 `skipped: errored`，`error` 写明「运行时拒绝重试」及那一条守卫，`output` 是它的有效策略落下的结论（`rewrite` 档的重试件即 `record`：一条「本件这一次没跑成」的提醒）。
   **拒绝落进日志、看得见**；这一次经过**不以它终止**，接着求下一件；**链走完没有别的 `retry`，就是上交**（主线裁定 2026-09-23）。
4. **判定之后、真正再发之前状态变了**（例如这次调用在两者之间被终结），模型请求运行时在再发时仍会拒绝；**那一笔由它记**，agent loop 按上交继续。本契约不改已经落下的那条结论。
5. **不再试就交回 `observed`**：这一层试尽，上交。**重试件不可用**时同样上交（[S-17](#s-17-系统自带件不可用时一律关门)）。

### S-27 ask：交出卡片并停在这一位置

1. **`ask` 是唯一一种不终结这一次经过的结论。**runner 落下那条 `ask` 记录，这一次经过**停在这一件**；效果 `asked { card, by }` 交给 agent loop。
2. **卡片由 agent loop 经[等待原语](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-wait-primitive--等待原语--wait-primitive)落进池子**；卡片的内容**全部取自那条 `ask` 记录里的草稿**，来源标出是哪一件（`by`）。
   所以卡片落盘可以**只从日志重建**：`ask` 记录落下之后、卡片落盘之前停机，下一次尝试照那条记录把卡片补上，**不重新求值那一件、不出第二张**。卡片按 (这一次经过, 那一件) 恰一张，这条唯一性由卡片与等待那一侧兑现。
3. **两处等不了**：`before_persist_message` 与 `after_terminal` 上的 `ask` 是表示层拒绝（`ask_at_forbidden_position`），按 [S-13](#s-13-报错处置策略的执行) 处置。
4. **没有超时，不替人作答**：卡片悬多久，这一次经过就停多久；「不回答」是合法答复，那一件据它下结论（[PF-008 §6.5](../../../../product/PF-008-human-in-the-loop/design.md#65-不回答是合法答复)）。
5. **一批**：一批动作各自的经过里出的卡同一批落（[S-29](#s-29-一批动作每个动作一次经过)）；**答完这一批**才回放（[S-28](#s-28-回放)）。答完之后后面的件还可能再出卡——**人可能看到同一批动作的第二轮卡片**，这是逐件顺序求值的直接后果。
6. **运行被取消**，悬着的卡片作废，这一次经过不再继续；**agent runtime 被回收**，卡片与记录都留着，下一次尝试接着等（[S-34](#s-34-撤下回收与取消时在途的经过)）。

### S-28 回放

**对一次已有结论的经过再调 `dispatch`，runner 照下面走**（[UL-replay](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-replay--回放--replay)）：

1. **读出这一次经过已落的结论**（同 `replay`），并**核对它们与此刻的链**：已落结论的那几件，按次序必须恰是此刻的链的前缀——同样的 name、同样的次序。
   **对不上即 `replayInconsistent`**：这一次经过停在原处，**runner 不补、不改、不重排任何结论**，也不产出效果。常见的来由是两次尝试之间装配清单变了、一件已经下过结论的件被移走或挪了位置。
   **之后这个运行怎么收，本契约不定**——不能继续这一次经过、也不能假装它没发生，归 agent loop（[G-8](#十三已知缺口)）。
2. **已有最终结论的件不再求值**，读它的结论（[PF-012 第二条是硬的](../../../../product/PF-012-agent-loop-and-run/design.md#第二条是硬的因为它护着-f-的纯性)）。
3. **最后一条是终止的结论**（`veto`、`stop`、`retry`）或链已走完：**原样重建结果**，补上缺的提醒（[S-19](#s-19-注入的提醒怎样追加)），不求值任何一件。
4. **最后一条是 `ask`**：
   - **卡片还没答完**：原样返回 `asked`，**不出第二张卡**；卡片还没落盘就照 [S-27](#s-27-ask交出卡片并停在这一位置) 第 2 条补上。
   - **这一批答完了**：**以回放的方式重新求值那一件**——输入与上一次同形同值（同一个 `subject`、同一串 `earlier`），`log` 是一只新句柄，读得到它的 `ask` 记录与答复（[S-9](#s-9-日志只读句柄的读面)）。
     它途中的每一次等都**按日志交回**：不花第二遍钱、不再问第二遍模型（`data.loop-extension/v1#S-35`）。它交回最终结论就另落一条，然后接着求下一件。
   - **它拿到的「答复」只是它自己那张卡的答复**：这一次经过里、这一件自己的 `ask` 记录所出的那张卡上的答复。同一个动作上别的件出的卡——**包括兼容件替宿主 hook 写的、选项与放行判断四档同名的卡**——它们的答复**不是它的答复，不带任何授权**（`capability.tool-admission/v1#S-28`）。放行判断的答复另见 [S-29](#s-29-一批动作每个动作一次经过) 第 8 条。
   - **它拿到答复之后又交回一条 `ask`**：那是**新的一轮等人**——落一条新的 `ask` 记录、出一张新卡；**不是把答过的那张再出一次**（每条 `ask` 记录恰一张卡，[S-27](#s-27-ask交出卡片并停在这一位置) 第 2 条）。放行判断在人自由作答之后「算不出就再问一轮」走的就是这一条。
   - **回放偏离**：等待原语报告它这一次途中的等与日志里记下的对不上（[UL-replay](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-replay--回放--replay) 注意 ①）——它没守住作者须知。**停住并可见**：`dispatch` 以 `replayInconsistent` 失败，这一次经过停在那一件之前，**它不留新记录、不出卡**；之后的收场同第 1 条归 agent loop（[G-8](#十三已知缺口)）。
5. **没有结论、正在求值中途停机的那一件**：它没有记录，下一次重新求值——**它不是回放**，它的第一次求值没有留下任何东西。这正是作者须知要求它只经日志带东西的理由。
6. **回放不改变任何已落的事实**：它只读、只补缺的、只接着往下走。

---

## 六、一批动作

### S-29 一批动作：每个动作一次经过

1. **一批动作里每个动作各有一次 `before_action` 经过**，锚是各自的 `CallId`（[S-5](#s-5-一次经过)）；各自的 `earlier` 只含自己这一次经过的结论，`subject.batch` 让每一件看得到这一批有谁（`data.loop-extension/v1#S-13`）。
2. **不同动作的经过可以并行**，互不读对方未落的结论；runner 保证它们各自的次序与记录互不串（[S-10](#s-10-逐件顺序求值先落后算) 第 4 条）。
3. **每个动作都有了效果或停在等人，这一批才算判完；判完之前一个都不执行**——**这一条由 agent loop 兑现**（[PF-012 一批动作先全部判完](../../../../product/PF-012-agent-loop-and-run/design.md#一批动作先全部判完再执行任何一个)）；runner 给它每个动作的效果，不替它等。
4. 这一批里停在等人的那几张卡**同一批落**（[PF-008 §5.3](../../../../product/PF-008-human-in-the-loop/design.md#53-一批卡片与答完是什么意思)）；答完回放之后，这几次经过**各自**接着走。

**放行判断在一批里的样子**（`capability.tool-admission` v1 并行起草、已合回任务 HUB，**不在本分支基线里**；下面按主线转来的六条对齐，坐标引、不链接）：

5. **放行判断那一格按轮汇合**：同一批里、**同一轮**走到链末的那些动作，放行判断对它们**整批一次**给出结论、用同一份依据（`capability.tool-admission/v1#S-21`、`#S-23`）。所以 runner 在放行判断那一格之前等这一轮的每个动作：要么已走到放行判断之前，要么已在更前面收场（否决、停止）或停在更前面的件出的卡上——**后两种不在这一轮里**，它们答完回放、走到末位时组成下一轮。
   各项的结论各自落进各自那一次经过的记录。**放行判断件怎样一次拿到整批的输入**，`data.loop-extension` 的统一输入（一次一个主体）装不下（[G-16](#十三已知缺口)）。
6. **结论投影与原因原样**：放行判断的放行记 `observed`，拒绝记 `veto` 且 **`reason` 原样带着它的拒绝原因 token**（`capability.tool-admission/v1#S-14`）——runner 不改写、不截断、不翻译；出卡记 `ask`。
   **runner 自己写的 `reason`**（报错按 `treat_as_veto` 落下的那一条）**不借用那几个 token**，只写「放行判断没有给出结论」与它的失败值（[S-13](#s-13-报错处置策略的执行)）。
7. **没给出结论即这一轮全拒**：放行判断这一次整批失败（它的四个失败值任一，含它自己的 `unavailable`），这一轮**每一项**都按报错处置、各落一条 `veto`（`treat_as_veto`）；它**不可用**（依赖不在、没装、清单里没有），这一轮**每一项**的效果都是 `vetoed { by: 放行判断 }`，记录照 `data.loop-extension/v1#S-31` 不带 `output`（[S-17](#s-17-系统自带件不可用时一律关门)）。
   **两者都不是「视作卸载」**。
8. **答复怎样交回放行判断**：放行判断出的卡答完之后，runner 回放它（[S-28](#s-28-回放)），它的**答复**只取自它自己在这一动作这一次经过里那条 `ask` 所出的卡，并且**只在是四个选项 id 之一或 `declined`（人明确不答）时**作为答复交回重判（`capability.tool-admission/v1#S-12`）：
   - **自由作答不作为答复交回**：那句话须**先**落成一笔授权表达（写入者归 `capability.tool-admission` 的 G-2），那一项**再不带答复**重判；它算不出就再问一轮（[S-28](#s-28-回放) 第 4 条的新一轮）。runner 不替人把一句话收成四档之一，**也不在那一笔落成之前重判那一项**。
   - **卡片作废不是答复**：运行被取消、会话被归档时卡片作废，那一轮不再判，**不得把作废读成 `declined`**（[S-34](#s-34-撤下回收与取消时在途的经过)）。
   - **别的件出的卡的答复一律不交给放行判断**，哪怕选项同名（[S-28](#s-28-回放) 第 4 条）。
9. **一批判完之前不交出任何放行凭据**：这一批只要还有一个动作停在等人（放行判断的卡，或排在它之前的件的卡），**已放行的那几项的放行凭据（无词条）一概扣住、不交给执行运行时**；每个动作都有了终局效果之后才交出（`capability.tool-admission/v1#S-31`）。
   这使第 3 条「判完之前一个都不执行」在执行一侧有了对应物——没有凭据，执行运行时不执行。**凭据经本契约的哪一格交出**，本版没有表示：`observed` 不带载荷，账本的 `proceed` 只有 `subject`（[G-16](#十三已知缺口)）。
10. **放行判断不可用时这一批全拒**（[S-17](#s-17-系统自带件不可用时一律关门)）：每一轮都在末位关门。

---

## 七、连续被否决的回复

### S-30 连续被否决的回复

**关闭 `data.loop-extension/v1` 的 G-17**（主线裁定 2026-09-23，待产品负责人确认）。一件每次都否决模型回复的件（例如回回转不成的模态转换件）会让 loop 一直发新调用——这一路不走成因、不经 `retry`、不触发 `after_model_call`，「试尽」与循环探测都够不着它。本条把它收住：

1. **否决时追加一条提醒**：`producer = model` 的 `before_persist_message` 经过以 `vetoed { by }` 收场时，runner 追加一条 `SystemReminderMessage`：`source.kind = extension`、`source.extension = by`、`nature = event`，正文是那条 `veto` 的 `reason`；效果来自[关门](#s-17-系统自带件不可用时一律关门)、没有 `reason` 时，正文是 runner 写的一句「这一件此刻不可用，回复未落盘」——**供下一次调用看到为什么上一份回复没进日志**。
   它守 `data.loop-extension/v1#S-25`：`reason` 本来就不转述被拦下的内容，提醒因此也不。
2. **计数从日志数出**，不另存（[PF-012 §6.7](../../../../product/PF-012-agent-loop-and-run/design.md#67-检测状态从日志派生不另存)）：
   **连续被否决的回复数** = 这一运行里、自最近一条落了盘的模型回复之后，`producer = model` 的 `before_persist_message` 经过以 `vetoed` 收场的次数（含这一次）。
3. **到了循环守卫 L2 的那个阈值就收住**：这一次经过的效果改为 `stopped { by }`（`by` 仍是否决的那一件），agent loop 落终态「失败」，原因「回复连续被否决」、指向那一件——**这就是 [PF-012 §5.9](../../../../product/PF-012-agent-loop-and-run/design.md#59-循环守卫四级阶梯) 阶梯的 L3，复用它的阈值**；
   阈值的名字与取值归循环守卫，本契约不定。**这一次不再追加第 1 条的提醒**：运行就此收束。
4. **崩溃洗不掉**：计数从日志数，下一次尝试数出同一个数。
5. **Stop 类「别停」的续跑不在这里**：`before_terminal` 上反复的否决只靠循环守卫本身（hooks 兼容层交接缺口 G8 的主线裁定：不设单独上限）。

---

## 八、事件

### S-31 本契约不开事件

**runner 不发任何事件，也不从任何事件里取判定。**

- **控制不走事件**：一次经过里的每一件都是被直接调用、被逐个等待的；**任何参与放行判定的扩展点，要么是同步前置，要么是逐个等待其结论的顺序求值——不得是「发出即不等待」**（与 `capability.organization-governance/v1` 为控制类扩展点立的那一条同一口径）。
- **需要知道「某件下了什么结论」的，读日志**：结论是日志里的事实，不是一条通知。
- 将来若要开「某次经过走完了」一类的通知，它**只能是通知**：发出方不等、不读返回值，没有任何性质靠它成立。

---

## 九、性质与前提

性质的来源一律引 PF 小节或数据半边；**编号 `P-n` 只在本契约本版本内有效**。

### 不变量

| # | 性质 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|---|
| P-1 | **同一次经过里，被轮到的每一件恰有一条最终结论落在日志里**（出过卡的另有每张卡一条 `ask`） | [S-11](#s-11-每件恰一条最终结论落进会话日志)、[S-18](#s-18-同一位置同一次经过只跑一轮) 的幂等、[S-28](#s-28-回放) 的「已有结论的不再求值」 | 一次经过的锚可从日志推出（[G-1](#十三已知缺口)）；尝试栅栏兑现 | [PF-012 §6.10](../../../../product/PF-012-agent-loop-and-run/design.md#610-能干预的拓展件必须留下结论) |
| P-2 | **一次经过的效果只是已落结论的函数** | [S-15](#s-15-效果怎么合成) | 链读自日志与装配清单 | [PF-012 §6.9](../../../../product/PF-012-agent-loop-and-run/design.md#69-拓展件只能靠改日志起作用) |
| P-3 | **链的次序 = 装配清单的次序；`before_action` 上放行判断、`before_persist_message` 上模态转换恒在末位** | [S-6](#s-6-拓展件链从装配清单来) | —— | D-038 Q8；主线裁定 2026-09-23 |
| P-4 | **放行判断判的、人签的、执行的是同一份参数** | [S-6](#s-6-拓展件链从装配清单来) 末位 ＋ [S-24](#s-24-before_action-上的改写与生效参数) | agent loop 照 `proceed.subject` 执行；放行凭据绑住这一份（tool-admission） | [PF-012 改参数](../../../../product/PF-012-agent-loop-and-run/design.md#改参数先落一条生效参数) |
| P-5 | **每条要追加的提醒恰追加一次** | [S-19](#s-19-注入的提醒怎样追加) 按 `MessageId` 为键 | 提醒的 `MessageId` 在会话内唯一（[G-5](#十三已知缺口)） | `data.messages/v1#S-32` |

### 安全性质（绝不能发生）

| # | 绝不能发生 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|---|
| P-6 | **一件没跑的件被记成一个结论**（不可用记成 `observed` 或 `veto`） | [S-12](#s-12-不可用与报错runner-怎么分)、[S-17](#s-17-系统自带件不可用时一律关门) 关门的是效果不是记录 | —— | [PF-012 可插拔的服务](../../../../product/PF-012-agent-loop-and-run/design.md#拓展件是可插拔的服务不可用即卸载报错按策略) |
| P-7 | **找不到清单、读不到日志或判定时，那一关被静默跳过** | [S-16](#s-16-缺席时的默认答案)：`manifestMissing`、`unavailable` 都不产出效果 | 调用方据失败值停下、不自行放行（**各 owner 的责任**） | [PF-012 可插拔的服务](../../../../product/PF-012-agent-loop-and-run/design.md#拓展件是可插拔的服务不可用即卸载报错按策略) |
| P-8 | **放行判断不可用时动作照做** | [S-17](#s-17-系统自带件不可用时一律关门)、[S-6](#s-6-拓展件链从装配清单来) 清单里没有它也照认 | 放行判断的干预力没被收窄到 `veto` 以下（[G-4](#十三已知缺口)） | 主线裁定 2026-09-23（账本 U-5 待裁） |
| P-9 | **一条越档、越位或不合法的结论生效了** | [S-14](#s-14-结论合不合法两类判断) 两类判断都在落日志之前 | 记录里的 `power` 是求得的值（资产求值兑现） | `data.loop-extension/v1#S-34` |
| P-10 | **一次「问一下」被合成成了放行** | [S-15](#s-15-效果怎么合成) 没有放宽 | —— | [PF-012 没有放宽](../../../../product/PF-012-agent-loop-and-run/design.md#没有放宽这一档) |
| P-11 | **一条 `ask` 记录落出第二张卡；回放时问了第二遍模型** | [S-27](#s-27-ask交出卡片并停在这一位置) 第 2 条：卡片从 `ask` 记录重建、每条恰一张；[S-28](#s-28-回放) 第 4 条：偏离即停 | 拓展件守作者须知（`data.loop-extension/v1#S-35`）；它的等待经日志交回（等待原语） | [PF-012 §6.9](../../../../product/PF-012-agent-loop-and-run/design.md#69-拓展件只能靠改日志起作用) |
| P-12 | **模型产出的消息在落盘之前被改写**（挂派生表示除外，它不改块序列、不改任何一块已有的成员） | [S-14](#s-14-结论合不合法两类判断) ② 前两行 | —— | 主线裁定 2026-09-23（D-5 及其挂派生表示出口） |
| P-13 | **一副过期的协程往一次经过里写进结论** | [S-21](#s-21-dispatch一次经过) ②：每次写入都受尝试栅栏约束 | 栅栏由 loop 那一程的契约定义并由日志写入兑现（[G-8](#十三已知缺口)） | [PF-012 §5.7](../../../../product/PF-012-agent-loop-and-run/design.md#同一个-run-同一时刻只有一副协程在推它) |
| P-14 | **一件拓展件以别人的名义说话** | `data.loop-extension/v1#S-22` 的 `inject_source_mismatch`；runner 写的提醒一律以那一件的 name | —— | [PF-008 §6.8](../../../../product/PF-008-human-in-the-loop/design.md#68-三种来源的卡片同一个形状选项与记录不同) |

### 进展性质（全部有界）

| # | 性质 | 上界 | 前提 | 来源 |
|---|---|---|---|---|
| P-15 | 一次经过**在链上每一件都交回之后**走完、或停在第一条终止的结论 | 链长 × 每件一次求值 | **每一件的实现都交回**（本版无上界，[G-7](#十三已知缺口)）；存储可用 | [PF-012 三种形态](../../../../product/PF-012-agent-loop-and-run/design.md#三种形态两种装得进一种拆两半) |
| P-16 | 一个状态点的一次到达，引出的注入**至多一层** | 链长 × 1 | [S-19](#s-19-注入的提醒怎样追加) 第 4 条 | [PF-012 只跑一轮](../../../../product/PF-012-agent-loop-and-run/design.md#改了日志就重新组装同一位置同一次经过只跑一轮) |
| P-17 | 一个运行里连续被否决的回复**不超过循环守卫 L2 的阈值**，到了即落「失败」 | 那个阈值 | 阈值已配 | [S-30](#s-30-连续被否决的回复) |
| P-18 | 一批卡片答完之后，**下一次尝试**里那一件交回它的最终结论（或按回放偏离处置） | 下一次尝试 | 那一件交回；日志可读 | [PF-012 协程不在了](../../../../product/PF-012-agent-loop-and-run/design.md#协程不在了靠日志不靠记忆) |

**「等人」本版没有进展性质**：卡片悬多久都行。

---

## 十、装配给与协议给

### S-32 装配给的保证 vs 协议须给的保证

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：第一版是单机，但语义不变地可扩展。**右列不是「以后再说」，是本契约已经记下的待兑现项。**

| 保证 | 单机由谁给（装配给） | 跨进程之后协议须兑现什么 | 做不到会怎样 |
|---|---|---|---|
| **先落后算**（[S-10](#s-10-逐件顺序求值先落后算)） | runner 与会话日志在同一进程、同一存储：一件的结论提交之后才调下一件 | 拓展件在远端时，**它的输出先在日志那一侧提交成结论记录，才算交回**；回执丢失时这一次按不可用或报错之一记下，不得折成 `observed` | 后一件看不见前一件的改写；远端交回的东西没落成记录就被用了，重算得到另一个下一步 |
| **实现在场**（[S-7](#s-7-系统自带件怎样挂上)、[S-12](#s-12-不可用与报错runner-怎么分)） | 装配使之在场；runner 在求值那一刻问一次「在不在」 | 「在不在」要有协议上的判据（租约或心跳）；**连不上、超时、反序列化失败一律映射到不可用或报错之一，并且看得见** | 传输故障被读成否决（替没跑的东西编结论），或被读成无意见（把关的那一关静默没了） |
| **尝试栅栏**（[S-21](#s-21-dispatch一次经过) ②） | 同一存储里按尝试序号拒收过期写入 | 栅栏必须在**日志的写入边界**上判，不能在 runner 一侧判 | 两副协程往同一次经过里各写一条结论，P-1 破 |
| **调用方身份**（[S-21](#s-21-dispatch一次经过) ②） | 本契约的面是能力间内部面；只有这个会话的 agent loop 与受理方够得着 | 调用须携带会话与租户身份，**在接收边界重新验证**（`data.identity-values/v1#S-30`） | 谁拿到一个装配清单的指认，就能以那个会话的名义往它的日志里写结论 |
| **句柄只及本会话、只在这一次调用里有效**（[S-9](#s-9-日志只读句柄的读面)） | 进程内的只读视图，随调用返回失效 | 读面协议要说清下界（[S-9](#s-9-日志只读句柄的读面) 第 3 条）、会话边界与失效；**失效后读取失败，不返回缓存** | 拓展件据一份陈旧的日志下结论，回放时读到的与第一次不同；或读到别的会话 |
| **判定来源在场**（[S-14](#s-14-结论合不合法两类判断) ②） | 模型请求运行时与 runner 同进程 | 判定调用失败时**一律 `unavailable`**，不当成「合法」 | 一条不在合法目标里的 `select_model` 被放过 |
| **卡片先于等待可见**（[S-27](#s-27-ask交出卡片并停在这一位置)） | 同一存储：`ask` 记录与卡片一起可见 | 卡片提交必须先于「运行在等人」对外可见；卡片可从 `ask` 记录重建 | 运行在等，却没有一张可答的卡片——永远等下去 |
| **链的次序与两处末位**（[S-6](#s-6-拓展件链从装配清单来)） | 从本地装配清单读 | 次序随装配清单一起传；**末位由 runner 所在一侧强制**，不信远端给的次序 | 一件改写排到放行判断之后，P-4 破；一件动块的件排到转换之后，没有 transcript 的图块绕过转换落盘 |
| **name 相等、效果合成** | 纯值计算 | **不变** | —— |

---

## 十一、交接、缺席与恢复

### S-33 依赖的提供者不可用

| 不可用的是什么 | 收场 | 不得怎样 |
|---|---|---|
| 会话日志（读或写） | `unavailable`；停在出事的那一件之前 | 不得在内存里先算下去、事后补写 |
| 装配清单 | `unavailable`（读不到）或 `manifestMissing`（找到了、没有） | 不得当空链 |
| 判定来源（模型请求运行时） | `unavailable`；那一件不留记录 | 不得当「合法」放过，也不得当「不合法」按报错处置——**判不出来 ≠ 判为拒绝** |
| 一件拓展件的实现或依赖 | 那一件不可用（[S-12](#s-12-不可用与报错runner-怎么分)）；系统自带件照 [S-17](#s-17-系统自带件不可用时一律关门) | 不得让 runner 本身失败 |

**runner 自己被撤下、换代或重启**：它拥有的一切都在日志里（[S-8](#s-8-本契约不持有运行实例里的状态)）；在途的那一次经过由下一次对它的 `dispatch` 接着走（[S-28](#s-28-回放)），**没有需要交接的活状态**。

### S-34 撤下、回收与取消时在途的经过

**拓展件那一段执行的宿主是 agent runtime**（[PF-012 §6.13](../../../../product/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走)），所以：

| 发生了什么 | 在途的那一件 | 已落的结论与卡片 | 之后 |
|---|---|---|---|
| **agent runtime 被回收**（停在等人时交还协程） | 正在求值的那一件（若有）没了、不留记录 | **都留着** | 下一次尝试 `dispatch` 同一次经过：回放（[S-28](#s-28-回放)） |
| **停机、崩溃** | 同上 | 已提交的都留着 | 同上；**未提交的结论不存在**，那一件重新求值 |
| **这个运行被取消** | 停 | 已落的留着；**悬着的卡片作废** | 这一次经过不再继续，不产出效果；取消的记法归 loop |
| **一件拓展件的实现在它求值中途被撤下** | 那一次求值失败 | —— | **记成报错**（它已开始），按策略处置；**不是不可用**。下一次经过它若仍不在，记不可用 |
| **装配清单在两次尝试之间变了** | —— | 已落的留着 | 下一次 `dispatch` 核对前缀，对不上即 `replayInconsistent`（[S-28](#s-28-回放)） |

**「撤下实现」这一行是本契约的推导**：实现被撤下时在途的派发怎么收场，产品正文未述；「已开始就算报错」是唯一不让一道把关静默消失的读法——**已报主线**。

---

## 十二、规范表达与验证义务

### S-35 本版不选用形式工件

| 性质 | 表达 | 理由 |
|---|---|---|
| [S-15](#s-15-效果怎么合成) 效果合成、[S-13](#s-13-报错处置策略的执行) 处置表、[S-17](#s-17-系统自带件不可用时一律关门) 关门表 | **本文的表**，由规范场景逐格演练 | 效果是已落结论的**确定性折叠**，条款把每一种情形穷举成表；再写一份模型只会重述同一张表 |
| [S-28](#s-28-回放) 回放、[S-18](#s-18-同一位置同一次经过只跑一轮) 只跑一轮、[S-19](#s-19-注入的提醒怎样追加) 恰一次 | **规范场景 ＋ 故障注入**（[S-37](#s-37-回放不出第二张卡不再问第二遍模型)、[S-38](#s-38-停机不产生第二条结论)、[S-39](#s-39-装配清单变了回放报不一致)） | 施工简报裁定本契约不触发形式工件 |

**这一处与两份输入有张力，照实写在这里，不自行改判**：
`data.loop-extension/v1` 的第十六节把「回放一致」「先落后算」「同一次经过只跑一轮」的行为模型**交给了本契约**；
而回放是一套**自定义恢复协议**——停机可以落在「结论已提交、提醒未追加」「`ask` 已落、卡片未落」这些点上——
按手册「组合性质」的门槛，**自定义恢复协议需要相应的行为模型**。施工简报裁定不触发；本契约照简报不建 `formal/`，
**把这一张力登记为 [G-14](#十三已知缺口)，交主线改判**。在那之前，上面三条性质**只有场景证据形式，没有行为模型**，验证入口如实登记。

**本版不附 JSON Schema**：本契约交换与记下的形状全部属 `data.loop-extension` v1 与 `data.messages` v1；`DispatchResult` 与五种效果是本操作的返回，线上形状归将来投影它的那份组合契约。

条款到证据的映射、执行状态在[验证入口](../verification.md)，**不写进本版本目录**。

### 规范场景

**每一条都要真跑**：它们断言的是行为，只读本文证明不了。

#### S-36 逐件顺序与改写叠加，放行判断看到最后那一份

`before_action` 链：租户的改写件（清单第二）→ 系统放行判断（清单第一）。**必须观察到**：放行判断被移到末位；它的输入 `subject.call.arguments` 是改写之后的那一份；
`earlier` 里恰有改写件的那条 `rewrite`；效果 `asked` 时卡片写的是改写后的参数；答完回放，放行判断拿到的 `subject` **与第一次逐值相同**。

#### S-37 回放不出第二张卡、不再问第二遍模型

一件可否决件在出卡前自己调一次模型、再交回 `ask` → 回收协程 → 人答完 → 新的一次尝试。**必须观察到**：那一件被重新求值一次；它的那次模型调用**从日志交回、没有第二笔账**；
**没有第二张卡**；它的最终结论另落一条；日志里这一件在这一次经过恰一条 `ask`、一条最终结论。**再跑两支**：① 让它拿到答复之后又交回一条 `ask`——必须观察到**第二条 `ask` 记录与恰一张新卡**，答过的那张没有再出；② 让它回放时发起一次与日志里记下的不同的模型调用——必须观察到 `replayInconsistent`、**这一件没有新记录、没有新卡**。

#### S-38 停机不产生第二条结论

在链的第 k 件结论提交之后、第 k+1 件开始之前停机；以及在经过走完、提醒追加之前停机。**必须观察到**：下一次 `dispatch` 同一次经过，前 k 件**一件都不再求值**，日志里各自仍只有一条；
缺的提醒补上、已有的不重复（按 `MessageId`）。**必须在同一次演练里对比两个停机点。**

#### S-39 装配清单变了，回放报不一致

一件改写件已在 `before_action` 下了结论，停在后一件的 `ask` 上 → 把改写件从清单里移走 → 答完卡片、新的一次尝试。**必须观察到** `replayInconsistent`，**日志里没有任何新结论**，已有的一条不少。

#### S-40 注入链只有一层

一件 `before_persist_message` 上的件对每条消息都交回 `inject`。用户发一条消息。**必须观察到**：用户那条消息的经过追加了一条提醒；那条提醒自己的经过里这一件的 `inject` **不生效**（报错记录，`output` 为处置策略落下的那一个，**没有第二条提醒**）；
loop 走到了下一个状态点。**为什么是一层**：零层会让「注入」在 `before_persist_message` 上根本不能用；两层以上都要一个具名上界而产品正文没有给——一层是唯一不引入新政策参数、又能保证有界的取值。

#### S-41 不可用、报错、否决三者分得开

一件可否决件：① 让它的依赖不在场；② 让它开始之后抛错；③ 让它交回 `veto`。在一个「之前」的位置与一个「之后」的位置各跑一遍。**必须观察到**：① `skipped: unavailable`、没有 `output`、链继续、**这一关不被当成否决**；
② 「之前」落 `veto`、「之后」落 `stop{failed}`，`error` 可见；③ 效果 `vetoed`。**再跑一件可改写件报错**：观察到一条以它名义的「没跑成」提醒追加了一次。**这条最容易被一个「出错就当无意见」抹掉，必须真跑。**

#### S-42 系统自带件不可用时关门

分别让模态转换件、放行判断、重试件、循环探测、卸载判定不可用。**必须观察到**：转换件 ⇒ 带图块的那条消息不落盘、效果 `vetoed{by: 转换件}`，**纯文本的消息照常落盘**；放行判断 ⇒ 这一批动作一个都不做；重试件 ⇒ 没有 `retry`、上交；
另两件 ⇒ 只有一条不可用记录、效果不变。**五件的记录都是 `skipped: unavailable` 且不带 `output`。**再跑一支：**装配清单里根本没有放行判断**——观察到同样全拒。

#### S-43 找不到清单不是空链

对一个没有装配清单的会话在 `before_action` 上 `dispatch`。**必须观察到** `manifestMissing`，**动作没有被执行**；再让清单读不到——观察到 `unavailable`，同样没有执行。

#### S-44 连续被否决的回复被收住

一件在 `before_persist_message` 上对模型回复一律 `veto`。**必须观察到**：每次否决都追加了一条以它名义、正文是否决理由的提醒；响应体记 `vetoed`；
第 N 次（N = 循环守卫 L2 的阈值）的效果是 `stopped`、运行落「失败」、原因指向那一件；**在第 N−1 次之后停机重启，计数不清零**。

#### S-45 模型的回复落盘之前改不了

一件在 `before_persist_message` 上对 `producer = model` 的消息交回 `rewrite`。**必须观察到**：改写不生效，报错记录可见，落盘的是原文（或按那件的策略被否决）；同一件对 `producer = user` 的消息改写照常生效。
**再跑两支**：模型回复里带一个图块，模态转换件给它挂上派生表示——观察到挂派生表示**生效**、落盘的那条除派生表示外与原文逐值相同；一件非转换件的外来件交回同样形状的「挂派生表示」——观察到**不生效**。

#### S-46 retry 被拒，按上交继续

让重试件对 `interrupted_mid_reply` 的失败交回 `retry`。**必须观察到**：没有再发；那一件记 `skipped: errored`、`error` 写运行时拒绝；追加了一条「没跑成」提醒；链走完、效果 `proceed`（上交）。
**再跑一支**：两件重试件先后都会给 `retry`——观察到只有第一件被求值。

#### S-47 过期的协程写不进

同一个运行起两副协程（模拟半死不活的旧尝试），都对同一次经过 `dispatch`。**必须观察到**：旧的那一副在第一次写入时得到 `attemptSuperseded`，日志里每件仍只有一条结论。

#### S-48 放行判断一轮汇合、凭据扣住、答复只认自己的卡

一批三个动作：`c1` 在放行判断之前被一件兼容件出了四档同名的卡；`c2`、`c3` 走到链末。**必须观察到**：放行判断对 `c2`、`c3` **一次**给出结论；`c2` 放行、`c3` 出卡时，`c2` 的放行凭据**没有交给执行运行时**，`c2` 没有执行。
人在兼容件的卡上点「将来本租户所有会话，这类情况全允许」、在 `c3` 的卡上自由作答一句话：**必须观察到**兼容件那张的答复**没有**作为答复交给放行判断、也没有落成任何授权；`c1` 走到末位时放行判断照常判（组成下一轮）；
`c3` 在那句话落成授权表达**之后**才被不带答复重判，算不出就出第二轮卡。最后一项有了终局效果，三项的凭据才交出。**再跑一支**：让放行判断对这一轮整批失败——必须观察到这一轮每一项各一条 `veto` 记录，`reason` 不是它的五个拒绝原因之一。

---

## 十三、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决，实现不得据一个看起来合理的猜测推进。

| # | 缺口 | 阻断谁 | owner | 闭合条件 |
|---|---|---|---|---|
| **G-1** | **一次经过的锚在日志里怎么落**（[S-5](#s-5-一次经过)）：结论记录只带 `callId`；其余位置靠日志次序与「状态点以哪种事实出现」推出，而入站那一侧的 `before_persist_message` 经过会与 loop 的经过交错 | 回放与「只跑一轮」的实现定稿；P-1 | `data.loop-extension` 下一版（结论记录带锚）或 PF-000／loop 契约（记录条目壳带锚） | 锚有一个只读日志就能唯一求出的表示 |
| **G-2** | **装配清单里各件求得的四样值怎么表示**（[S-6](#s-6-拓展件链从装配清单来)） | runner 读链 | PF-004 的契约 ＋ `capability.asset-evaluation` | 清单形状定稿 |
| **G-3** | **系统自带五件的能力标识**（[S-7](#s-7-系统自带件怎样挂上)） | [S-17](#s-17-系统自带件不可用时一律关门) 关门表、[S-6](#s-6-拓展件链从装配清单来) 放行末位 | 各件 owner：tool-admission、model-request-runtime、tool-execution-runtime、agent loop | 五个标识各在其契约里定型 |
| **G-4** | **放行判断的干预力被各层收窄到 `veto` 以下时**：照数据半边它拦不住任何东西，是一条 fail-open 的路 | P-8 | PF-002 ／ PF-008 owner | 产品裁定「系统自带放行判断的干预力可否收窄」 |
| **G-5** | **runner 追加的提醒与 `inject` 交回的提醒，`id`、`createdAt` 由谁给**（`data.loop-extension/v1` 的 G-16） | P-5 的前提 | 主线（与 `data.messages` 对齐） | 给出唯一性由谁保证 |
| **G-6** | **效果 `stopped` 与同一次经过的提醒同时出现时，那些提醒会不会让待处理消息队列非空、起下一次运行**（[S-19](#s-19-注入的提醒怎样追加)） | agent loop 的队列判定 | PF-012 ／ PF-014 owner（与 D-6a 同一类） | 产品正文补一句 |
| **G-7** | **一件跑着不返回、又没停在等人的拓展件，本版没有时间上界**（[S-3](#s-3-本契约明确不承诺什么)） | P-15 | PF-012 owner | 给出上界（作为设置项）或明写「不设」 |
| **G-8** | **loop 那一程的契约未起草**：尝试栅栏的定义、`replayInconsistent` 之后运行怎么收、`before_terminal` 否决理由到 agent 眼前的组装义务、终态与取消请求的写入 | P-13；[S-23](#s-23-效果之后的事由谁做)、[S-28](#s-28-回放) 的交接 | 主线 → agent loop 契约 | 那份契约接住这四件 |
| **G-9** | **拓展件自己花的钱与兼容件子进程的资源记在哪**：算进它插手的那个运行（PF-012），但 `data.call-accounts` 没有拓展件这一种条目 | 账 | PF-012 ／ `data.call-accounts` 下一版 | 账上有拓展件条目 |
| **G-10** | **`before_model_call` 上注入与改 `messages` 同时出现时的合成**（[S-25](#s-25-before_model_call-上的换模型与重新组装)）：本契约取「重新组装的 `messages` 为准」 | 在该位置同时挂注入件与改写件的部署 | 主线 ＋ `data.loop-extension` owner | 确认或改判 |
| **G-11** | **放行判断、模态转换钉末位与「自带的不享受特权」字面相左**（[S-6](#s-6-拓展件链从装配清单来)） | —— | 产品负责人确认主线裁定 | 确认 |
| **G-12** | **三项并行依赖未登 catalog**（抬头与 [S-4](#s-4-依赖方向与被消费的面) 末表） | registry 的完整性 | 整批对齐 | 三份契约进同一棵树后补登坐标与 clauses |
| **G-13** | **「主线裁定 2026-09-23」各行没有长期落点**（设计依据表） | 依据可追溯 | 主线 | 落进 `record/decisions/` 并回链 |
| **G-14** | **回放是否触发行为模型**（[S-35](#s-35-本版不选用形式工件)）：数据半边把回放、先落后算、只跑一轮的行为模型交给本契约，手册门槛认为自定义恢复协议要模型，施工简报裁定不触发 | 回放的证据强度 | 主线 | 改判：建模型（`Pass.tla` 之类）并登 formal task；或维持并写明理由 |
| **G-15** | **`data.loop-extension` v1 有四处要与本契约对齐**：① `#S-23` 的可改成员表没有「挂派生表示」这一种改动，也没按 `producer` 收窄（[S-14](#s-14-结论合不合法两类判断) ② 前两行）；② `#S-33`「不可用即视作卸载」没给系统自带件留例外（[S-17](#s-17-系统自带件不可用时一律关门)）；③ `#S-10`「次序只来自装配清单」没写两处末位（[S-6](#s-6-拓展件链从装配清单来)）；④ `#S-28`「拿到记下的答复、不再出卡，然后交回最终结论」读起来排除了答复之后的新一轮 `ask`，而放行判断在自由作答之后要再问一轮（[S-28](#s-28-回放) 第 4 条） | 数据半边与本契约读起来互相矛盾 | 主线（对齐波）→ `data.loop-extension` | 四处在数据半边各有一句，或改为指向本契约 |
| **G-16** | **放行判断的两样东西在拓展点协议里没有表示**（[S-29](#s-29-一批动作每个动作一次经过) 第 5、9 条）：① 放行判断整批一次求值，而拓展件的统一输入一次只带一个主体；② 放行的那一项带着一张放行凭据，而 `observed` 不带载荷、账本的 `proceed` 只有 `subject`——凭据经哪一格交到执行运行时、扣住时怎样表达「还没判完」 | 放行判断件的实现；执行运行时拿凭据 | 主线（对齐波）→ `data.loop-extension`、`capability.tool-admission`、本契约 | 三份给出同一个表示：整批输入的来路，与凭据随效果交出的那一格 |

---

## 十四、消费者核对

本节不新增承诺，只走一遍具名消费者的路径。**发现不够用时回到本契约补条款，不在消费者那边自己算一份。**

| 消费者 | 它要什么 | 本契约给什么 | 够不够 |
|---|---|---|---|
| **agent loop**（每个位置） | 调一次经过、拿到一个说得清下一步的效果；停机后接着同一次经过 | [S-21](#s-21-dispatch一次经过) ＋ [S-15](#s-15-效果怎么合成) ＋ [S-23](#s-23-效果之后的事由谁做) ＋ [S-28](#s-28-回放) | **够，有两处悬空**：锚的表示（G-1）；`replayInconsistent` 之后运行怎么收（G-8） |
| **状态转移表** | 只读日志就知道一次经过走到哪、效果是什么 | [S-22](#s-22-replay从日志重建一次经过) ＋ [S-15](#s-15-效果怎么合成) | 够（同 G-1） |
| **放行判断**（系统自带） | 看到最后那一份参数；不可用时这一关不消失 | [S-6](#s-6-拓展件链从装配清单来) 末位、[S-17](#s-17-系统自带件不可用时一律关门) 全拒、[S-24](#s-24-before_action-上的改写与生效参数) | 够；干预力被收窄那一条是 G-4 |
| **模态转换件**（`capability.modality-projection`） | 排在同一位置所有动块的件之后；对模型回复也能挂派生表示；转不成、不可用都不落盘，纯文本不受牵连 | [S-6](#s-6-拓展件链从装配清单来) 末位、[S-14](#s-14-结论合不合法两类判断) ② 挂派生表示的出口、[S-13](#s-13-报错处置策略的执行) `treat_as_veto`、[S-17](#s-17-系统自带件不可用时一律关门) | 够；`data.loop-extension` 的可改成员表还没收「挂派生表示」（[G-15](#十三已知缺口)） |
| **重试件** | 自己的 `retry` 被拒时有记法、不卡住 | [S-26](#s-26-retry-与它被拒) | 够 |
| **循环探测** | 阶梯从日志数；「回复一再被否决」有人管 | [S-30](#s-30-连续被否决的回复)（runner 复用 L2 阈值） | 够；阈值的名字归它 |
| **卸载判定** | 在 `after_action{each}` 上把大结果换成占位 | 通用的逐件求值与 [S-14](#s-14-结论合不合法两类判断) | 够 |
| **兼容件**（`capability.hooks-import`） | 被当成一件普通拓展件；它的「起不来」与报错被分开记；回放时不重跑宿主 hook | [S-12](#s-12-不可用与报错runner-怎么分)、[S-9](#s-9-日志只读句柄的读面)、[S-28](#s-28-回放) | 够：回放时它读得到自己的 `ask` 与答复，据此不再起子进程 |
| **模型请求运行时** | 知道回复被否决（记 `replyDisposition`）、谁换的模型（记 `selectedBy`）、要不要再发 | [S-23](#s-23-效果之后的事由谁做)、[S-25](#s-25-before_model_call-上的换模型与重新组装)、[S-26](#s-26-retry-与它被拒) | 够 |
| **`apps/runtime-host`**（装配） | 知道要给 runner 什么：存储、装配清单、实现在场、判定来源、尝试栅栏 | [S-32](#s-32-装配给的保证-vs-协议须给的保证) 左列 | 够；它就是左列的承接者 |

---

## 十五、版本差异与规范工件

**本版是首版**，没有被采用的旧版本，没有语义或表示差异可记，也没有消费者迁移。

**本版的规范工件**：本文件与 [`examples.md`](examples.md)。**不附 Schema、不建 `formal/`**，理由在 [S-35](#s-35-本版不选用形式工件)。

**发布后**：本目录下的规范正文与实例不可原地覆盖；修改发布新版本。[已知缺口](#十三已知缺口)里任一项被裁决后改变本契约语义的，出 **v2**；推荐版本不自动升级消费者。
**接受之前**，候选可以原地修订，每次修订记在[验证入口「变化的影响」](../verification.md#变化的影响)。
