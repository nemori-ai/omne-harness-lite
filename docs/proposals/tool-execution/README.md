---
kind: proposal
id: P-tool-execution
status: draft
scope: 工具调用的完整生命周期（五维状态机、转移、级联、前台上限、内建人类请求工具）、工具 Schema 维度、内部帧的事实侧、与 Session/Run/HD 的接头及 Cordis 视角；消费 tool-system v1 候选的可用部分，不发新契约直到闭环成形
---

# 工具执行：调用生命周期、Schema 与帧

[提案索引](../README.md) · [tools v1](../../../spec/capabilities/tools/v1/contract.md) · [run-driver v2](../../../spec/capabilities/run-driver/v2/contract.md) · [session v1](../../../spec/capabilities/session/v1/contract.md) · [human-decisions v1](../../../spec/capabilities/human-decisions/v1/contract.md) · [生命周期组合 LC v1](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md) · [工具系统 v1 草案](../tool-system/README.md) · [级联备忘](../tool-system/v1/session-run-cascade-memo.md)

本提案承接 [D-014](../../decisions/D-014-session-run-agent-lifecycles.md)：Session、Run、
实例三台状态机与它们的级联已经接受，工具调用是级联矩阵里唯一还没有自己一台完整
状态机的对象。[tools v1](../../../spec/capabilities/tools/v1/contract.md)（D-008）定义了
调用/attempt、后台、停止、绑定撤回与帧的条款，[run-driver v2](../../../spec/capabilities/run-driver/v2/contract.md)
定义了驱动器怎样看调用的结算视图，但"一次调用从提议到结算的每个转移由谁在哪个
提交里写什么、Run/Session/实例的每个级联触发对调用做什么、前台上限怎样转后台、
Agent 向人提问的答复怎样回到工具"没有一处权威正文。本提案把这些放在一个视角下
设计，接受后各归其位：语义缺口进 tools/session/run-driver 的下一版契约（闭环成形后
一次发版，不单独为工具发版），提供者设计原地修订
[tools](../../../packages/tools/tools/design.md) 与 [local-execution](../../../packages/tools/local-execution/design.md)，
系统视图修订 [核心能力](../../architecture/core-capabilities.md) 的工具段。

## 范围

- 在范围内：调用的五个正交维度（进展、attempt 账本、等待关系、控制、结算交付）的
  状态集合与转移；每个转移的提交面与同批伙伴；LC-04 每个触发对前台/后台/转换中调用
  的级联列；前台上限与自动转后台；内建人类请求工具 `human`（问题、一次性批准、能力
  授权申请）及"答复作为工具返回值"；工具 Schema 的维度总表（多模态、单/多命令范式、
  后台声明与调用级 detach 参数、并发、停止能力、效果与暂行、帧声明、环境）；内部帧的
  事实侧（身份、序号、缺口、记录等级、读面）；与 Run/Session/HD/AU/BG 的接头；Cordis
  视角（插件、服务键、装载效应与撤除、依赖变化政策）；Claude Code / Codex hooks 在
  S5/S7 两个站点的落点；候选性质与形式模型。
- 不在范围内：PF-014.C6 必需 skill 的完整激活/撤回生命周期与 PF-024 之外的装配
  （[definitions.md](../tool-system/v1/definitions.md)、[assembly.md](../tool-system/v1/assembly.md)
  保留候选）；PF-004 派发形态；PF-012 六种环境组合与 Browser/Computer 选型（只作门
  输入）；出站流协议、游标编码与传输（U-36）；帧的保留数值；工具体中途 `interrupt()`
  式的通用可恢复暂停（用户裁决不纳入首版）；JSON Schema 本身（U-35）。

## 文件

- [requirements.md](requirements.md)：需求工作区快照与按要求的覆盖表。
- [invariants.md](invariants.md)：调用（T）、人类请求工具（H）、帧（F）的安全性质与进展
  性质（TP），每条标来源、保护点与证据义务。
- [lifecycle.md](lifecycle.md)：五维状态机、转移表、内建人类请求工具、前台上限、控制
  与级联表、恢复窗口、契约措辞缺口表。
- [schema.md](schema.md)：维度总表（沿用 CD/TL/AU 已定字段，只补无落点的维度）、单/多
  命令投影、多模态引用、前台上限与调用级 `detach`、停止能力、并发、帧声明、结果形状、
  发布时检查清单。
- [frames.md](frames.md)：帧身份与顺序、三记录等级、缺口词表、媒体帧、读面、与出站流的
  依赖方向、崩溃恢复。
- [cordis.md](cordis.md)：消费方式、插件与服务依赖图、装载效应与撤除、四类接口对接与
  时序、依赖变化政策、hooks 兼容层在 S5/S7 的落点、提供者设计归属。
- [scenarios.md](scenarios.md)：TS-01～TS-17 验收路径，各标模型动作/性质与模型外验收。
- [evidence/](evidence/README.md)：调用生命周期 TLA+ 模型（五维、`human` 调用、owner 崩溃、
  归档级联）、安全/进展两配置与一个否定变体、重放脚本与结果；条款覆盖记在
  [tools 验证范围](../../../spec/capabilities/tools/verification.md)。
- [review.md](review.md)：2026-09-14 独立评审的发现、处置与转给用户的决定点。

## 裁决记录（2026-09-14，用户）

| 编号 | 裁决 |
|---|---|
| U-38 | 工具设计范围追加：工具执行生命周期/状态机；tool schema 含多模态能力、传统与多命令范式、是否后台、前台超时未完成转后台；级联备忘条目；工具内部帧（依赖流式帧公共契约，事实侧先定） |
| U-39 | 决定点 a～n（临时准备稿的内容已归档为下表）按作者建议拍板 |
| U-40 | 要像 DeepSeek Harness 那样兼容 Claude Code / Codex 的命令式 hooks 体系；需求落为 [PF-025](../../requirements/product/agent/PF-025-external-hooks-compatibility.md)；决定点 o～v 按作者建议拍板 |
| U-41 | Agent 发起 HITL 等用户答复时，答复不是普通用户输入，而是该工具的结果，回到工具调用作为返回值；先查 DSH，有则二次开发。据此采纳决定点 w（内建 `human` 工具纳入本轮）与 x（D2 机制；通用工具体中途 interrupt 不纳入首版）；契约措辞缺口随闭环一次发版 |
| U-42 | 工具帧是耐久的：有持久化与回放机制，与同一 Session 的日志一起 append-only 追加写；帧的数据结构（含让 UI 知道怎么渲染的标识）以 omne-next / omne_harness 的工具帧设计为起点，保证重要特性不丢不漏。据此决定 d 的三等级改为 critical / durable（缺省）/ transient（[frames.md](frames.md#记录等级)） |
| U-43（2026-09-15） | Run 的生命周期与工具的生命周期可以错位：工具状态耐久化，新 Run 恢复后接上（与 Run – live-agent 的关系同型）。据此 Run 不可恢复失败时只取消未准入的调用，已准入调用与未答问题保留，结算按 SE-14 C 列触发新 Run（[级联表](lifecycle.md#控制与级联表)、模型 `RunFail` 与 `FailKeepsHuman`） |
| U-44（2026-09-15） | Agent 发起的批准本质是上下文提示词，不是系统机制；系统发起的 HITL 才是系统机制。Agent 的 HITL 工具只有 `ask_user` 与 `request_approval` 两个（omne-next `omne_harness` 已有定义），没有第三个；问题与批准的答复本质是用户提示词，以工具调用结果呈现。据此去掉 `request_consent` 与批准目标绑定（[命令表](lifecycle.md#内建人类请求工具)） |
| U-45（2026-09-15） | Run 状态机与工具执行状态机解耦、可以错位；一次 Run 可有多个并行工具，有的按声明执行一段时间后自动转后台，有的不会；不存在 Run 级执行预算作为刹车（[前台上限](lifecycle.md#前台上限与自动转后台)）；omne-next 的耐久等待与离场执行设计作补充参考 |
| U-46（2026-09-15） | 调用级 `detach` 不能否决工具声明的自动离场（取值只剩 `on_start \| auto`）；迟到结果以 `system_reminder` 内容块进入到达的 Step、按模型族投影为 user / developer message（确认） |
| U-47（2026-09-15） | PF-005.C10 中"由系统权威记录对精确请求及批准结果的引用"现在干脆不要：从需求撤下，未来需要时作为新的能力另行设计；需求页已改（[PF-005 变更记录](../../requirements/product/agent/PF-005-agent-initiated-human-input-and-approval.md#变更记录)），可追溯改由耐久历史顺序与授权门记录给出 |
| U-59（2026-09-15） | Run 应有明确的等待状态，需要 Run 等它的对象自己在 Run 上登记（用户提议，作者采纳为[等待登记簿](lifecycle.md#等待登记簿)）。同时确立工作风格：待裁决事项先筛过度设计、再由作者从顶层建模视角（可联合架构评审）自行决定，只把剩余的产品取舍交用户（[作者裁决表](#作者裁决2026-09-15按用户工作风格)） |

## 作者裁决（用户按建议拍板）

| # | 问题 | 采纳的选择 |
|---|---|---|
| a | 首版执行 owner 集合 | local-execution 加同进程 shell；browser/sandbox 留候选，PF-012 只作门输入 |
| b | 后台 owner 进程模型 | 同进程 worker，接受"进程死亡则前台工具 unknown"的边界；独立进程留边界不实现 |
| c | 定义面是否同轮 | Schema 维度同轮；PF-014.C6 激活/撤回与依赖图另开 |
| d | 帧记录等级 | critical / durable（缺省）/ transient 三等级作声明词表（U-42 后 replayable 改为 durable：Session 域内 append-only），数值留实现；不做跨调用历史合并 |
| e | 派发工具关系 | 只固定"派发是一次调用、结果走 call_settlement、终止传播沿 PF-013.C4"；形态归 PF-004 |
| f | 归档/删除后的后台调用 | 政策 b：归档不动工作；结算到达 archived Session 按 SE-14 D2 列关闭；删除同样关闭并按数据治理处理结果 |
| g | 是否发 tools v2 | 不单独发；缺口进 [缺口表](lifecycle.md#契约措辞缺口表)，闭环成形后一次发版 |
| h | 调用状态机 TLA+ | 建一个，单配置 ≤ 1 分钟，含 admit / dispatch / settle / stop / background / Inbound 交接 / 归档级联 / `human` 调用 |
| i | 单操作工具的投影 | 去掉 `command` 层：顶层 Schema 即该命令输入；多命令才 `{command, params}`（可选 `oneOf`） |
| j | 调用级 `detach: never \| on_start \| auto` | 开放给模型，受定义 `startModes` 子集约束（U-46 后修订：去掉 `never`，调用不能否决工具声明的自动离场） |
| k | 并发声明 `concurrency: serial \| parallel_safe` | 纳入声明词表；驱动器首版可仍串行执行 |
| l | 多模态 | 工具输入/输出媒体一律用内容引用（CT），模型投影按 MC-11 交集选择；不建第二个图片库 |
| m | 前台上限 `onLimit` 缺省 | keep_waiting；工具可声明 stop 或 detach（U-45 后修订：没有 Run 级预算刹车，有效阈值 = min(声明, 系统上限)，keep_waiting 等到自然结束或用户 stop） |
| n | 计时与转换决定归属 | 调用运行时（tools 包）；驱动器不持计时器，执行 owner 只兑现 detach |
| w | 内建人类请求工具 | 纳入：多命令工具 `human`，恰好两条命令 `ask_user` / `request_approval`（U-44 后去掉 `request_consent`），HD 为执行 owner |
| x | 答复回到工具的机制 | D2：调用停在 `waiting_human` 视图不阻止收束与 Yield，答复由 HD 在同一提交结算调用，结算作接续开 Step；通用工具体中途 interrupt 不纳入首版 |

hooks 兼容层的决定点 o～v 记在 [hooks 兼容提案](../hooks-compat/README.md#裁决记录)；本提案
只在 S5/S7 的落点消费它们。

## 评审后的决定点（用户裁决，2026-09-15）

来源见 [review.md](review.md)；作者建议与用户裁决对照：

| # | 问题 | 作者建议 | 用户裁决 |
|---|---|---|---|
| y | Run 不可恢复失败时未答的 `human` 请求 | 关闭请求 | 否决：Run 与工具生命周期错位，工具状态耐久，新 Run 接上（U-43） |
| z | `request_approval` 决定与后续动作的绑定 | 结构化目标绑定，门消费 | 否决：Agent 的批准是提示词不是系统机制；只有 `ask_user` / `request_approval` 两个工具（U-44） |
| aa | Run 执行时长预算的拥有者 | run v1 增加执行截止 | 否决：Run 与工具状态机解耦，没有 Run 级预算刹车（U-45） |
| ab | 调用级 `detach` 能否否决自动离场 | 不能 | 不能（U-46） |
| ac | 迟到结果以 `system_reminder` 进入 | 用户提出 | 确认（U-46） |

## 作者裁决（2026-09-15，按用户工作风格）

来源：两份只读核对报告（主检出 `tmp/next-design-prep/followup-interrupt.md`、`followup-artifacts.md`）
指出的缺口与用户的两条产品补充。作者先把每项过一遍"是否过度设计、是否在真实需求前引入
复杂度"，再从顶层建模视角自行决定（[U-59](#裁决记录2026-09-14用户) 的登记簿是用户示范的
思路），正文按裁决写（[等待登记簿](lifecycle.md#等待登记簿)、[interrupt 动作链](lifecycle.md#interrupt-与-interrupt_then_run-的动作链)、
[制品与呈现去重](schema.md#制品与呈现去重)、[缺口表](lifecycle.md#契约措辞缺口表)），交架构评审复核；
没有一项需要用户再拍板。表里"作者建议"即裁决，"另一边"是被排除的形状及原因。

| # | 问题（人话） | 作者建议 | 为什么 | 另一边 |
|---|---|---|---|---|
| 0 | Run 在等谁，用什么对象表达 | 等待登记簿：需要 Run 等它的对象（本 Run 准入的调用、它发的请求、它进的门）自己登记、办完注销；Run 等待 = 登记簿非空；入站裁决查表；控制级联 = 保留或整簿注销；调用上的前后台关系只是投影 | 用户提议（U-59）。三条推导规则合成一个对象，成员、路由、唤醒、级联全部变成同一件事的操作；模型里的关系字段本来就是它的按调用投影，行为等价 | 维持三处推导：每个消费者各算一遍，容易算出相反的路由 |
| 1 | Run 的"等待位置集合"里到底有什么。它决定中断后一个调用的结果是"等用户恢复后再喂给模型"还是"下次开 Step 时顺带看到" | 写进契约：前台与转换中的调用、待答的问题、正在等的门；后台调用不算；中断保留，被新输入越过就整体释放 | 现在只有模型注释在定义它，两个实现可能写出相反的路由；这条定义已在模型里通过检查 | 留给提供者各自定义，跨实现不一致，SE-14 的分列没有依据 |
| 2 | 中断时执行方说"停没停我不确定"（unknown）怎么办 | 普通中断：unknown 也算一种结局，Run 照常进入 interrupted，未知状态留在那个调用上长期可见，界面提供"强停"作升级；带新输入的中断：保持现有规定，未知期间新 Run 不开，界面提示强停；两边都不设系统级超时，执行方自己的有界等待到期就报 unknown | 给中断加一个"收口中"的中间状态要重新处理占位与归档；系统超时只会把执行方已经给出的 unknown 再包一层 | 加中间态：状态机多一个值、LC-02 占位规则与归档前提都要改 |
| 3 | 用新输入打断后，旧 Run 上还没消费的接续、还在后台跑的调用、还没答的问题去哪 | 被越过就是终态：旧 Run 进新终态 `superseded`，同一提交整簿注销登记；接续改成"下次开 Step 顺带看到"，之后到的结果和答复按登记簿查表进当时活动的 Run（没有活动 Run 就触发新 Run）；问题仍可答；不可 resume；归档不需要特殊规则 | 从顶层看，一个登记全注销、没有残留接续、输入又被自己的新输入取代的 Run，"恢复"只会空转，把它留在 interrupted 是虚构的可恢复性；契约本来就允许 resume 返回 superseded；与 U-43（工作与 Run 解耦）同向 | 维持"保留 + 可恢复 + 归档时自动取消"：三条特殊规则换一个从不发生的恢复；维持契约原文"保留"：问题永远待办、会话归不了档 |
| 4 | 新 Run 开场时，模型要不要知道上一轮被打断、还有什么在后台 | 要：复合意图带一份"被保留的工作清单"，新 Run 首个 Step 以一条系统提醒交代；结果真到了再按迟到结果进入 | 不交代，模型会重做已经在后台跑的事 | 只在结果到达时呈现：省一条提醒，代价是重复劳动 |
| 5 | 执行方回报"停止进展"用什么词 | 封闭三轴：物理上 `quiescent / isolated / unknown`，清理 `done / retained`，外部效果 `none / possible / confirmed` | 契约只说"分开返回"，提案与 local-execution 设计各写一套 | 留给提供者：读面与界面各猜一套 |
| 6 | 工具的"制品"（生图这类需要系统保存、用户可看、agent 以后还能读的产物）现在怎么放 | 首版：产物以结果内容块里的引用进历史（CT 保存字节并记录是哪次调用产的），过程中流出的走帧，客户端按媒体 id 去重、以结果块为准；PF-015 要求的制品对象（身份、版本、跨会话检索、读取工具）作为独立能力设计另开，不并进工具线 | DSH fork 没有第二通道，LangChain 的切分只解决"分两份返回"；现在只有生图一个用例，先做最小正确模型 | 现在就做制品对象：新契约、新内建工具、CD / tools / CT 三处联动改版，T-12 的边界要重裁 |
| 7 | Run 在等工具或等人的时候，用户又发了一条普通消息，要不要马上喂给模型 | 要（用户已把"不能干等"登记为需求，机制归作者）：`queue` 的含义改为"当前 Run 的下一个空闲点消费"——Step 一收束、Run 进入等待，队首的普通文本就作为同一 Run 的下一步切点进模型，附带"哪些调用还没回来"的占位；命令和 trigger 仍等 Run 结束；不加第三种到达行为（[机制](lifecycle.md#等待期间的排队用户输入作者裁决-7)） | 用户 2026-09-15 的产品期望：不能干等；一个 Run 等工具几分钟时用户的话应该被听到；开新 Step 而不是注入在途调用，PF-013.C5 的边界保持 | 保持现状（等到 Run 结束才处理队列）；或加第三种到达行为 `steer` 让用户自己选：多一个选项、默认值之争回到产品层 |

## 未决项

- PF-004 三种派发关系与子 Session 提问的作答者规则（DSH 拒绝被委派子 agent 提问；我们沿
  HD-01 作答者固定为 Session.owner，子 Session 的 owner 由 PF-004 设计决定）。
- 多命令的 batch 模式与 shell 词法不纳入；若将来需要，另立需求。
- 帧的条数/字节/保留期数值、后台调用上限与配额：实现阶段。
- 出站流侧的帧词表全集与游标编码（U-36）：本提案只给 `tools.frame.<kind>` 前缀。
- 契约措辞缺口（SE-13 问答答复的来源、RD-09 `waiting_human` 视图与迟到结果形态、RD-10 占位
  首次呈现开 Step、SE-04/13 hooks 词汇、TL-07 预算被拒的措辞与 `unavailable`、TL-10 去掉
  Run 预算项、RN-02 失败不关闭已准入调用、HD 作为执行 owner、run-driver v3、CD 与 MC 的
  `system_reminder`、TL-12 帧耐久与 `frames(S)`）：见 [缺口表](lifecycle.md#契约措辞缺口表)，
  随闭环一次发版。
- 取回工具与转储信封（omne-next `read_tool_result_or_file` 与"结果已转储"占位）：首版不设，
  大结果与中间帧的读面先归 UI；模型主动取回作为候选另开。
- 制品对象（[PF-015](../../requirements/product/agent/PF-015-artifact-management-and-isolated-working-copies.md)：
  身份、版本、租户归属、访问资格、跨会话检索）与 agent 的读取入口：作者裁决 6 另开
  能力设计；工具线只保证引用进结果、CT 记录来源（[schema.md 制品](schema.md#制品与呈现去重)）。
- 回流策略的 `silent`（后台结果不通知模型）与 `compensate`（失败时唤醒补偿）：首版只有
  "同 Run 内下一 Step 呈现"与"新 Run 唤醒"两种，由 SE-14 路由自动给出。
- 执行 owner 跨协调域（决定 b 留的边界）时，"fence 与 cancelled 结算同提交"不再成立，
  TL-08 的 owner 账本排序成为 T-3 的唯一保护；届时须补跨域义务（[证据说明](evidence/README.md#抽象与边界)）。

## 接受记录

尚未接受。波 1（本页、requirements、invariants、lifecycle）、波 2（schema、frames、cordis）
与波 3 的模型、场景 2026-09-14 完成；形式任务 `tool-execution-call-safety` /
`tool-execution-call-progress` 已登记。独立评审 2026-09-14 完成，2 项阻断与 11 项应修已
按 [review.md](review.md) 处置；评审引出的决定点由用户 2026-09-15 裁决（U-43～U-46），正文
已按裁决改写。接受后提供者设计修订（[归属表](cordis.md#提供者设计归属与实施入口)）与契约
缺口一次发版。
