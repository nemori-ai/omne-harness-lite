# 工具执行运行时该从哪里起步

## 需要作出的选择

**承载「一次工具执行」的那个运行时，实现从哪里起步。**这个选择决定三件会被长期消费的事：
后续契约以谁的对象模型为参照；产品包里有没有、有多少以 fork 形式自维护的 DSH 代码（[SYS-KERNEL](../../../foundation/cross-system-constraints/requirements.md#sys-kernel)）；
以及哪些性质在第一天就由结构保证，哪些要靠后补的改造去追。

**选错的可观察后果是静默的**：研究已经指出，若把 DSH jobs 只换存储就接进来，agent runtime 每回收一次，会话里的后台构建就被悄悄杀掉，**不报错**
（[R-1][R-1]）；若沿用 local-execution 的恢复，停机后的在途执行会以「状态不明」出现，那是 agent 不认识的第七种收场（[R-10][R-10]）。

### 必须保留的十条性质

这十条都是**已定稿产品正文的要求**，本包不改写，只作比较尺子。编号只在本包内使用。

| # | 性质 | 产品依据（rev） |
|---|---|---|
| **N-1** | **绑会话、有自己的 runtime**：宿主是会话，前台后台都一样；记得下是哪一次 run、哪个 agent runtime 发起，但都不绑生命周期；结果送回会话 | [PF-006 §4 Tool Execution](../../../product/PF-006-tools-and-skills/design.md#tool-execution)、[§5.2](../../../product/PF-006-tools-and-skills/design.md#52-工具这个词指三样东西寿命各不相同)、[§6.5](../../../product/PF-006-tools-and-skills/design.md#65-工具执行有自己的运行时绑定在-session-上)（rev 16）；[UL-tool-execution](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution) |
| **N-2** | **前台/后台 × 等待态，四种组合都成立**：前台执行也是一次可指认、可单独控制的执行；中途转后台有三个触发源（超时、用户手动、插队顺带），**不声明就不能后台**；转后台不换宿主；等待态显式、系统看得见、说得出在等什么形状，上限看占不占资源（`Ask()` 不设上限） | [PF-006 §4 等待态](../../../product/PF-006-tools-and-skills/design.md#等待态)、[§6.6](../../../product/PF-006-tools-and-skills/design.md#66-前台后台-与-等待态是两个维度)（rev 16）；[PF-008 §4 两个维度](../../../product/PF-008-human-in-the-loop/design.md#等待态的两个维度)（rev 5）；[UL-background-execution](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-background-execution--后台执行--background-execution)、[UL-tool-wait-state](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-wait-state--工具等待态--tool-wait-state) |
| **N-3** | **六种收场穷举，全部以正常返回到达**：前台那次调用六种之一；转后台之后那段执行完成、失败、被中断、等不到应答四种之一，以提醒到达；占位说清原因（六种取值）；本层了结不了的上交，不进收场 | [PF-006 §5.5](../../../product/PF-006-tools-and-skills/design.md#55-一次工具执行的收场有六种)、[占位原因](../../../product/PF-006-tools-and-skills/design.md#占位消息一律要说清原因)（rev 16）；[UL-execution-outcome](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-execution-outcome--执行收场--execution-outcome) |
| **N-4** | **中断不是失败**：三个触发源——用户直接叫停（含插队）、这次运行被取消时它还在前台、会话被归档；归档那一刀不可逆；可以**单独**中断或切后台一次执行，不动模型调用、不动 run；`BkgJobs().terminate` 与用户叫停都记中断但分得出是谁 | [PF-006 §6.7](../../../product/PF-006-tools-and-skills/design.md#67-用户可以中断而中断不是失败)、[§6.12](../../../product/PF-006-tools-and-skills/design.md#612-工具执行的运行时可以被单独控制而它停了就不重来)（rev 16）；[PF-012 §6.13](../../../product/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走)（rev 9）；[PF-007 §6.10](../../../product/PF-007-meta-capabilities/design.md#610-bkgjobs通向自己发起的执行)（rev 16）；[PF-014 §5.4](../../../product/PF-014-inbound-intake-and-queueing/design.md#54-插队停在哪就怎么办)（rev 4）；[PF-015 §6.3](../../../product/PF-015-session-lifecycle-and-ownership/design.md#63-归档先停活儿再落状态)、[§6.4](../../../product/PF-015-session-lifecycle-and-ownership/design.md#64-撤销归档只还给你状态)（rev 12） |
| **N-5** | **发帧不阻塞，也不能把工具搞失败**：不预先声明、按收到的解析、读者是人（agent 看不到），汇成那次执行那一条 `ToolInternalMessage` 的到达增量；节流可合并，不许默默丢 | [PF-006 §4 发帧](../../../product/PF-006-tools-and-skills/design.md#发帧)（rev 16）；[PF-009 §5.8](../../../product/PF-009-context-message-types/design.md#执行帧就是这条消息的到达增量)、[§6.16](../../../product/PF-009-context-message-types/design.md#616-砍了要说不许默默丢)、[§6.17](../../../product/PF-009-context-message-types/design.md#617-发帧发不出去不影响这次工具执行)（rev 5）；[UL-frame-emission](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-frame-emission--发帧--frame-emission) |
| **N-6** | **卸载在「执行动作之后」**：卸载判定与执行是 agent-loop 在执行动作之后那个位置上的拓展件；运行时交回的是原样 `ToolResult`，**不截断、不因结果大而判失败**，与前后台、等待态正交 | [PF-006 §6.10](../../../product/PF-006-tools-and-skills/design.md#610-结果太大时卸载而卸载是第三个维度)（rev 16）；[PF-012 §5.10](../../../product/PF-012-agent-loop-and-run/design.md#510-卸载结果落成消息之前的那一关)（rev 9）；[UL-result-offloading](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-result-offloading--结果卸载--result-offloading) |
| **N-7** | **停机不重来**：主语是这次执行自己的 runtime，判据是它失去连续性（进程没了、机器换了）；落**失败**，**没有例外**（哪怕能证明还没动手），并送回会话；会话归档不是停机 | [PF-006 §6.12「停机之后，它不重来」](../../../product/PF-006-tools-and-skills/design.md#停机之后它不重来)（rev 16）；[PF-012 §5.7 三个运行时](../../../product/PF-012-agent-loop-and-run/design.md#三个运行时停机之后各算什么)（rev 9） |
| **N-8** | **agent runtime 被回收不影响任何工具执行**：前台的照样跑、照样等；Run 记着协程在等哪一次，新协程起来接着等 | [PF-006 §6.12 宿主表](../../../product/PF-006-tools-and-skills/design.md#它的宿主是谁决定了什么会带走它)（rev 16）；[PF-012 §5.8 等人是 loop 的原语](../../../product/PF-012-agent-loop-and-run/design.md#等人是-loop-的原语)、[等待必须是一条显式的记录](../../../product/PF-012-agent-loop-and-run/design.md#等待必须是一条显式的记录)、[§6.13](../../../product/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走)（rev 9） |
| **N-9** | **每次执行留一份账，不进上下文**：跑了多久、耗了多少这一类事实，给诊断与计量 | [PF-006 §5.4](../../../product/PF-006-tools-and-skills/design.md#每一次执行都留一份账)（rev 16） |
| **N-10** | **无 in-memory 持久化**：持久事实经 `core/storage`（Kysely + `node:sqlite`，配置切 pg），本地日志类用 JSONL，不提供内存版存储 | [D-026](../../decisions/infrastructure-persistence-choices/decision.md#选择与范围) |

### 附带约束

| # | 约束 | 依据 |
|---|---|---|
| K-1 | 执行身份显式携带租户，跨租户访问默认拒绝 | [SYS-TENANT](../../../foundation/cross-system-constraints/requirements.md#sys-tenant) |
| K-2 | Cordis 用官方 4.0.4；选定复用的 DSH 组件以 fork 自维护，fork 就是自有模块 | [D-025](../../decisions/cordis-adoption-version/README.md)、[SYS-KERNEL](../../../foundation/cross-system-constraints/requirements.md#sys-kernel) |
| K-3 | 执行者不止本机子进程：工具定义可自带实现（进程内的工具函数，要用等待态与发帧两个原语），MCP 对端的动作也是一次工具执行 | [PF-006 §5.2](../../../product/PF-006-tools-and-skills/design.md#52-工具这个词指三样东西寿命各不相同)、[§6.13](../../../product/PF-006-tools-and-skills/design.md#613-mcp-接入点带来的动作)（rev 16） |
| K-4 | 第一版在用户本机单机交付，边界能语义不变地拆分布式 | [D-022](../../decisions/cli-tui-delivery-form/decision.md)、[SYS-DEPLOY](../../../foundation/cross-system-constraints/requirements.md#sys-deploy) |

**可调整的**：实现起点、代码复用的粒度（整包 fork / 函数级借用 / 只借设计）、执行账在 D-026 允许范围内落 SQL 还是 JSONL、包布局与名字（领域名待拍板）。

## 研究基线与 rev 16 的差

研究对照的是 PF-006 rev 14。rev 16 的纠正**没有推翻研究的任何源码事实**，但改变了两处判读，并关掉了研究列出的六条正文张力中的五条：

| 研究列出的张力（[原文][tensions]） | rev 16 之后 | 对本选择的影响 |
|---|---|---|
| 1「不绑 agent runtime」与「前台宿主是 agent runtime」并存 | **已关**：宿主只有会话，前台只说 agent runtime 阻塞在它上面（§6.5、§6.12 宿主表，PF-012 §6.13） | DSH 的前台执行（工具体里的一次 `await`，[R-2][R-2]）**本身就违反 N-1、N-8**，不只是后台那一半 |
| 2「agent runtime 被回收」被列为停机 | **已关**：回收对任何工具执行都不是停机（§6.12） | 同上，加重 DSH「随 owner Agent 撤除而取消」（[R-1][R-1]）的冲突 |
| 3 后台执行的第二次结局落在哪 | **已关**：§5.5 新增一小节，后台段四种收场以提醒到达 | 收场词表的形状已定，候选都要照它补 |
| 4 停在 `Ask()` 的前台执行其宿主被取消 | **已关**：run 被取消 → 前台执行被中断；回收 → 不受影响；插队 → 人拒绝回复 | 等待态必须比 agent runtime 活得长，DSH 的「等人是前台 await」装不下 |
| 5 归档措辞不一 | **已关**：PF-006 §6.5 与 PF-015 §6.3 都写「被中断」 | — |
| 6 停机「不重来」对「尚未动手」有没有例外 | **已关**：§6.12 明写「没有例外」 | local-execution「accepted 未 dispatch 可经恢复许可继续」（[R-10][R-10]）**直接违反 N-7** |

**起草时读到、研究未列的一处措辞张力**（只登记，不裁）：[PF-012 §5.7「先对账，再进方程」](../../../product/PF-012-agent-loop-and-run/design.md#先对账再进方程)那张表第一行写「发出了动作，结果没落盘 → 合成一条『被中断』的结果」；
而 PF-006 §6.12 说工具自己的 runtime 失去连续性应落**失败**、agent runtime 被回收时它照样跑。
两处主语可能不同（前者说的是 agent runtime 那一侧看到的日志尾巴，可能包括「动作还没交给工具运行时」的情形），
但对「据点进程整体停机、前台工具执行随之没了」这一具体情形，一处给「被中断」、一处给「失败」。
它不影响四个候选之间的取舍（每个候选都要按裁定去合成终态），但影响恢复路径的契约条款，**归产品负责人**（见[交接缺口](#交接缺口)）。

## 现有能力如何承载

调查范围：本仓库 HUB 的 `spec/`、`realization/`、`record/decisions/`（2026-09-23）；两份外部源按研究的版本。**范围外**：DSH 的 `dsh-tools` 工具管线与 agent loop、omne-next 的执行实现。

| 要求 | 现有能力与精确位置 | 覆盖依据 | 未覆盖、缺口或未确认前提 |
|---|---|---|---|
| 工具执行运行时的契约 | **无**。`spec/` 只有租户领域五份契约 | — | 契约、Session 与 Run 的契约都不存在；运行时要依赖的「会话」「Run 记着在等哪一次」没有可引用的条款 |
| 持久事实（N-7、N-9、N-10） | [`core/storage`](../../../realization/packages/core/storage/README.md) 协议（`read`／`write`／`lockRow`／`lockSentinel`、四型失败）+ [`infra/storage-sql`](../../../realization/packages/infra/storage-sql/README.md) sqlite 提供者 | 一致性套件在 sqlite 上 18 组全绿（该节点自述，2026-09-22）；首胜结算、墓碑先于派发这类「条件转移」可以写成单事务的锁行 + 条件写 | 两节点都是**候选**、协议接口**未被接受**（D-026「不表示」）；表结构归装配层迁移；跨进程协调未定 |
| 时长、等待上限（N-2、N-9） | [`infra/clock`](../../../realization/packages/infra/clock/README.md) 的 `Clock.now()`，跨重启不后退 | 形状现成 | 它不承诺与真实时间的偏差上界；时长计量用单调钟还是它，未定 |
| 插件层小件与内核语义 | [`core/kernel-basis`](../../../realization/packages/core/kernel-basis/README.md)：`definePlugin`、`Outcome`、`fiberIsActive`、八条 4.0.4 probe | 已在 4.0.4 上跑过 | **没有**一条 probe 核过「承载长活执行的 fiber 在 inject 提供者换代时会被卸载重跑」对在途执行意味着什么（见 [X-6](alternatives.md#仍待区分的实验)） |
| 本机宿主与子进程分组（K-4） | [`apps/cli` 架构](../../../realization/apps/cli/architecture.md#拓扑与进程模型)（候选）：据点进程、工具执行子进程组「前台每个运行一组、后台每次执行一组」 | 给出了宿主进程与进程组的候选形状 | **候选**；分组是在 rev 16 纠正之前写的，与「转后台不换宿主」之间要实验区分（[X-4](alternatives.md#仍待区分的实验)） |
| 后台登记、授权、首胜结算、模型面三件 | DSH `dsh-jobs`／`dsh-jobs-local`／`dsh-tool-jobs`（`c291e796`） | 研究对照表：后台单独中断、killed 与 failed 分开、终态通知等「可承载」 | 挂 owner Agent 实例、内存态、只登记后台、无等待态、无帧、后台默认开（[R-1][R-1]～[R-8][R-8]） |
| 持久账本、墓碑、不重放、执行身份带租户 | minimal-runtime `tools/local-execution`（`d79484d`，**未进 main**，设计依据属已退役旧链） | 研究对照表：身份、停止墓碑、账、租户「可承载」 | 只做两种文件动作；落「状态不明」；自有 JSONL；部署租约需人工清（[R-9][R-9]～[R-13][R-13]） |

## 剩余责任与能力演化

**十条性质里，两源都没有承载的**（[R-17][R-17]，按 rev 16 重读）：

| 剩余问题 | 关系 | 归属理由与消费者影响 |
|---|---|---|
| 以会话为宿主、比 agent runtime 活得长的执行登记（N-1、N-8），前台也登记 | **新增**：两源都没有 | 归工具执行运行时自己；Run 只记「在等哪一次」，不拥有执行 |
| 前台/后台 × 等待态的状态机与中途转后台（N-2） | **新增** | 同上；「能否后台」的声明归工具定义（另一份提案「工具定义基线」的对象），运行时只读它 |
| 六种收场与占位原因、发起者（N-3、N-4） | **扩展**：DSH 有 killed/failed 之分、local-execution 有 interrupted | 收场词表是产品已定的穷举，运行时照抄，不另立 |
| 发帧通道（N-5） | **新增**：DSH 的 `readOutput` 是给模型的单游标拉取，读者相反（[R-8][R-8]）；pi 的 `onUpdate` 只有整份替换、监听者失败会传回工具（[消息与流研究][pi-frames]） | 通道归运行时（不阻塞、不失败、节流报砍）；**消息的形状与到达语法归 PF-009 那一侧的消息模型**，运行时只交出增量 |
| 停机后把在途执行落成失败并送回会话（N-7） | **修复/新增**：local-execution 有持久意图与不重放的前一半，落的终态不对；DSH 两半都没有 | 归运行时的恢复路径；送达（提醒进会话）归 run/入站那一侧，运行时交出终态与身份 |
| 会话归档连带中断、run 取消波及前台（N-4） | **组合**：两源的停止机制都能用，都没有这两个触发点 | 触发归会话与 Run 的拥有者，运行时提供「按会话/按 run 的前台集合」中断；不可逆由运行时的终态首胜保证 |
| 执行者多样（K-3）：子进程、进程内工具函数、MCP 调用 | **新增**：DSH 以 producer 接口承载多种后台长活，是最近的形状；local-execution 只有文件 I/O | 运行时对执行者只定一个接口（启动、取消、结算、两个原语），执行者各自实现 |

**这里不提出新的能力维度**：工具执行本来就是产品正文里一个有独立宿主与生命周期的对象，本包只选实现起点。它与 agent runtime、Run、会话之间的边界由产品正文给定，契约起草时按手册主线走领域读数与机制读数。

## 取舍入口

见 [alternatives.md](alternatives.md)：四条路径逐条对到 N-1～N-10 的矩阵、各自的总负担与反例、推荐 C 的理由、会让 A 或 B 重新上桌的证据、七项仍待区分的实验。**推荐不是接受。**

## 契约、动作链与 Cordis 投影

**本包不写契约，也不写提供者设计。**下面只列推荐路径若被接受，后续契约与提供者设计**必须接住**的几件事——它们是比较中暴露出来的，写在这里是为了不在下游被重新发现一遍：

- **持久事实与活体句柄分开**：执行记录（身份、会话、发起的 run 与 agent runtime、前后台、等待形状、终态、原因、发起者、账）进 `core/storage`；
  子进程句柄、取消回调、等待中的 Promise 只活在进程里，**进程一没就算丢**，恢复时按 N-7 合成失败。这条读法依赖 D-026 的解释（[X-2](alternatives.md#仍待区分的实验)）。
- **终态首胜写在存储上，不写在进程内**：结算、中断、归档、恢复合成失败四路可能竞争同一条执行的终态，首胜必须是**同一行**上的条件写（手册「同一提交」纪律），不能靠进程内锁。
- **承载执行的 fiber 不挂在 agent runtime 的 fiber 下**，而且它的 inject 边要尽量少：Cordis 里一个插件的必需服务换代就会卸载重跑（手册最小内核模型），
  若执行宿主 inject 了会换代的服务，换代一次就等于一次停机、全部在途执行落失败（[X-6](alternatives.md#仍待区分的实验)）。
- **停机的「失去连续性」要连子进程一起失去**：据点进程死了而子进程还活着，记录说「失败」、世界里它还在跑——恢复路径要先回收登记过的进程组再合成失败，并把物理状态记进账（[X-5](alternatives.md#仍待区分的实验)）。
- **强制停止要分开说逻辑停止、实际停止与外部效果未知**（[PF-012 §6.14](../../../product/PF-012-agent-loop-and-run/design.md#614-停止有两级)）；local-execution 的 `physical`／`effect` 两维装的正是这类事实，放进**账**而不是收场词表，收场词表保持六种。
- **卸载不在运行时里**：运行时交出原样 `ToolResult`；DSH tool-jobs 的首尾截断与 local-execution 的超限即失败都不带过来（N-6）。

## 证据义务与受阻消费

| 依赖的性质与前提 | 保护者/环境责任 | 所需证据与当前结果 | 闭合条件、负责产物及受影响选择 |
|---|---|---|---|
| 研究的源码事实在所列版本上成立 | 研究执行者 | 研究逐条回到源码行；**未运行任何测试**（研究准入核对） | 已足以支撑排除 A、B、D 的结构性反例——那些反例是形状层面的，不依赖测试是否通过 |
| rev 16 的纠正已被研究之外的读者核过 | 本包作者 | 已逐节读 PF-006 §4、§5.2、§5.5、§6.5～§6.7、§6.10、§6.12、§6.13 与 PF-012 §5.7、§5.8、§6.13（2026-09-23） | 已核 |
| `core/storage` 协议能表达「同一行上的条件终态写」 | `core/storage` 与 `infra/storage-sql` 节点 | 协议有 `lockRow`，一致性套件在 sqlite 上通过（节点自述） | 契约起草时由提供者设计指出那一行；协议未被接受前，推荐路径的这一半是**有前提地能** |
| 活体句柄不算 D-026 意义上的 in-memory 实现 | 架构负责人对 D-026 的解读 | **未核**（研究 E-10 已标为判断前提） | 影响所有候选；未决前 C 的读法是「持久事实全进存储，句柄丢了按停机处理」 |
| 执行宿主 fiber 在提供者换代时的行为 | `core/kernel-basis` 的 probe | **无 probe** | 提供者设计开工前补一条 probe（X-6）；影响宿主插件的 inject 形状，不影响本选择 |

## 交接缺口

| 缺口 | 影响谁 | 负责产物/拥有者 | 闭合条件 |
|---|---|---|---|
| PF-012 §5.7 对账表第一行「合成被中断」与 PF-006 §6.12「失去连续性落失败」对同一情形给出不同收场 | 运行时恢复路径的契约条款 | 产品负责人（PF-012／PF-006） | 裁定后在其中一处改措辞或写明两者主语不同 |
| D-026「不提供 in-memory」是否涵盖进程内活体句柄 | 全部候选的改动面估计；C 的持久/句柄分界 | 架构负责人（必要时回 D-026 补一句范围） | 一句明确读法，登在 D-026 README 或新决定 |
| 执行账与执行记录落 SQL（`core/storage`）还是 JSONL | 运行时的存储形态、长期待机下的增长与保留 | 契约与提供者设计；保留期限归观测与计量（PF-006 §5.4） | 提供者设计给出选择与理由；本包倾向 SQL（条件转移需要事务），帧随 `ToolInternalMessage` 进会话日志那一类 |
| 「能否后台、多久自动转」的声明形状 | 运行时读取的输入 | 「工具定义基线」提案（`proposals/tool-definition-baseline/`，与本包同日并行起草、尚未入索引，本包不链接其正文；研究见 [tool-definition-shape-sources](../../../../research/tool-definition-shape-sources/research.md#能否后台只有-omne-next-在定义上声明且默认方向与-pf-006-一致)） | 那份提案给出声明的数据形状 |
| `apps/cli` 进程分组与「转后台不换宿主」 | [`apps/cli/architecture.md`](../../../realization/apps/cli/architecture.md#拓扑与进程模型) 工具执行子进程组那一行 | `apps/cli` 节点 | X-4 的实验结果 |

评审处置见 [review.md](review.md)；实际决定与下游入口从 [README](README.md#后续消费) 导航。

[R-1]: ../../../../research/tool-execution-runtime-sources/research.md#dsh-jobs-的后台任务寿命挂在-owner-那个活体-agent-实例上不挂在会话上
[R-2]: ../../../../research/tool-execution-runtime-sources/research.md#dsh-jobs-只登记后台工作前台执行不进登记表也不能中途转后台
[R-8]: ../../../../research/tool-execution-runtime-sources/research.md#dsh-jobs-的流式输出是给模型读的单游标拉取不是给人看的帧
[R-9]: ../../../../research/tool-execution-runtime-sources/research.md#local-execution-只执行预登记文件的有界读与带修订校验的替换写不执行-shell不后台不发帧没有等待态
[R-10]: ../../../../research/tool-execution-runtime-sources/research.md#local-execution-停机恢复从不重放但把在途执行落成状态不明而不是失败
[R-13]: ../../../../research/tool-execution-runtime-sources/research.md#local-execution-的-rename-竞态窗口靠部署独占租约兜底陈旧租约只能人工证明后移除
[R-17]: ../../../../research/tool-execution-runtime-sources/research.md#以下-pf-责任两源都没有承载查过对照表全部-16-行
[tensions]: ../../../../research/tool-execution-runtime-sources/research.md#对照中暴露的产品正文张力只记录不裁
[pi-frames]: ../../../../research/message-model-and-stream-sources/research.md#只有-pi-有工具执行中的输出通道而它是结果快照的瞬态广播不是一条消息的到达增量
