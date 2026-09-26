# capability.modality-projection v2

> 规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.modality-projection, 2)`——
  `family = capabilities`、`topic = modality-projection`、规范路径 `spec/capabilities/modality-projection/v2/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：已由 [D-061](../../../../record/decisions/assets-runtimes-contract-acceptance/decision.md) 接受；精确资源冻结与采用状态由版本外入口及 registry 维护。
- **设计依据**：见[下一节](#设计依据)。产品依据以 **PF-013 rev 12** 为准，另引 **PF-012 rev 14**、**PF-006 rev 19**、**PF-015 rev 11**、**PF-009 rev 8**；每次改 rev 之前逐版读 changelog 核过受影响的条款，结论记在[验证入口「变化的影响」](../verification.md#变化的影响)。
  主线裁定的原文在 [D-060](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md)（产品负责人尚未逐条追认；第一轮评审处置的裁定在它的[第五节](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)）
- **精确语义依赖**（五项；消费 clauses 见 [S-4](#s-4-依赖方向与被消费的面)；前四项与本契约同为 candidate、未冻结）：
  - `omne-harness-lite-design-2026-09-15 · data.content-blocks · v2`
  - `omne-harness-lite-design-2026-09-15 · data.messages · v2`
  - `omne-harness-lite-design-2026-09-15 · data.model-profile · v2`
  - `omne-harness-lite-design-2026-09-15 · data.loop-extension · v2`
  - `omne-harness-lite-design-2026-09-15 · data.identity-values · v1`（已接受、已冻结）
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如 `capability.modality-projection/v2#S-16`。
  缺口 `G-n` 同此范围。本文引另一份契约的条款一律带坐标，**裸号只指本契约**

## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| 模态投影：历史里出现过哪几种「只有原件、没有 transcript」的模态；**只算标着给模型看的块**；从日志得来、重算同一答案；只增不减；合法目标的输入，不是档案的属性 | [PF-013 §4 模态投影](../../../../product/PF-013-model-profiles-and-invocation/design.md#模态投影) | S-5、S-6、S-20 ① |
| 模态恰四种；块的模态由媒体类型定；四种之外的文件块不进投影 | [PF-013 §4 模态](../../../../product/PF-013-model-profiles-and-invocation/design.md#模态) · [§6.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#610-模态兼容挡在算合法目标那一刻不挡在出门那一刻) | S-5、S-7 |
| 有 transcript 的块不再挡任何模型；挡在算合法目标那一刻 | [PF-013 §5.11](../../../../product/PF-013-model-profiles-and-invocation/design.md#511-有-transcript-的块不再把任何模型挡在外面) · [挡在这一刻](../../../../product/PF-013-model-profiles-and-invocation/design.md#挡在这一刻而不是出门那一刻) · [由此掉出的三条](../../../../product/PF-013-model-profiles-and-invocation/design.md#由此掉出的三条) | S-5、S-6、S-7、S-16 |
| 合法目标 = 在册 ∩ 范围允许 ∩ 兼容这个会话的模态投影 | [PF-013 §5.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事) | S-16（本契约只拥有第三项） |
| 投影要答得快、增量维护；仍是投影，从日志重算必得同一答案 | [PF-013 §6.18](../../../../product/PF-013-model-profiles-and-invocation/design.md#618-模态投影要答得快而且是增量维护出来的) | S-6、S-15 |
| 工具产出的块算不算进投影 | [PF-013 §9.1](../../../../product/PF-013-model-profiles-and-invocation/design.md#91-一处需要上游回补工具能产出哪些块) | S-5 |
| 转换件：按键（模态或文件媒体类型）登记、同键一件、可替换；**一个文件块两键都命中时媒体类型那个键上的那一件来转、只出一份派生表示**；输入一个非文本模态的块或文件块；输出别的模态的块（不能是文件块）外加 transcript，**只交 transcript 不合契约**；**本版不调模型**；原块不动；落盘前写好之后不变；转换失败即不落盘；没登记不是失败，**登记了此刻却用不了当转换失败**；不判断要不要转；不承诺无损，模型读的是哪一份由交付面在那条消息上说出来；本版不是资产，替换只在系统装配那一层 | [PF-013 §4 转换件](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件) | S-3、S-8～S-11、S-17、S-18、S-20、S-21、S-24 |
| 位置在「消息落盘之前」；转不成走那个位置的否决；**没登记照原样落盘，登记了却不可用当转换失败**；系统自带件不可用时各有定法 | [PF-012 §5.8 模态转换为什么必须落在这里](../../../../product/PF-012-agent-loop-and-run/design.md#模态转换为什么必须落在这里) · [系统自带的几件](../../../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件各站在哪) · [系统自带的几件，不可用时各有定法](../../../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件不可用时各有定法) | S-9、S-12、S-20、S-21、S-23 |
| 会话日志里没有 `SystemMessage`，它每次组装现算 | [PF-009 §4 消息](../../../../product/PF-009-context-message-types/design.md#消息)（rev 8） | S-5、S-21 |
| 工具结果那一端，转换件可以当提供者 | [PF-006 §6.11 两端的差别在候选提供者](../../../../product/PF-006-tools-and-skills/design.md#两端的差别在候选提供者不在规则) | S-19（本契约只给判定，工具两端归别处） |
| 模态投影是会话要维护的一项状态，不是 runtime context；「从日志算投影」须是一套协议 | [PF-015 §5.5](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#55-哪些算-meta-runtime-context) · [第一件：会话睡一觉醒来](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#第一件会话睡一觉醒来还得是原来那个) | S-6、[G-8](#十一已知缺口) |
| 规格形式；部署边界；租户隔离 | [SYS-SPEC](../../../../foundation/cross-system-constraints/requirements.md#sys-spec) · [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) · [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) | S-13、S-26、S-18 ① |
| 统一语言正式名 | [模态](../../../../ubiquitous_language/terms/record-and-context.md#ul-modality--模态--modality) · [模态投影](../../../../ubiquitous_language/terms/record-and-context.md#ul-modality-projection--模态投影--modality-projection) · [模态转换件](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-modality-converter--模态转换件--modality-converter) · [派生表示](../../../../ubiquitous_language/terms/record-and-context.md#ul-derived-rendering--派生表示--derived-rendering) · [transcript](../../../../ubiquitous_language/terms/record-and-context.md#ul-transcript--transcript--transcript) · [模型档案](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-profile--模型档案--model-profile) · [附件](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-attachment--附件--attachment) · [会话日志](../../../../ubiquitous_language/terms/record-and-context.md#ul-session-log--会话日志--session-log) · [会话日志投影](../../../../ubiquitous_language/terms/record-and-context.md#ul-session-log-projection--会话日志投影--session-log-projection) | 全部正式名 |

> **起草时由主线先裁、产品正文后来补上的四条**，现在都以产品正文为依据（主线的推理留在 D-060）：
>
> | 条款 | 产品正文 | 主线的推理 |
> |---|---|---|
> | [S-5](#s-5-模态投影是对会话日志的一次折叠) 与 [S-20](#s-20-一条消息在落盘之前的转换全有或全无) ① 的「只计、只转给模型看的块」 | [PF-013 §4 模态投影](../../../../product/PF-013-model-profiles-and-invocation/design.md#模态投影)「它只算标着给模型看的块……转换件因此也不转它」 | [D-060 §S17 S17-e](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s17modality-projection报回的) |
> | [S-10](#s-10-一个块落在哪个键上) 的「两键都命中取媒体类型键，只出一份」、[S-11](#s-11-一次合法的转换产出) 的「只交 transcript 不交派生块非法」 | [PF-013 §4 转换件](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件)契约表第一、三行 | [D-060 §S1 S1-g](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s1content-blocks报回的) |
> | [S-9](#s-9-登记表同键一件登记是系统装配层的声明)、[S-12](#s-12-缺席时的默认答案)、[S-21](#s-21-转换件不可用即转换失败) 的「登记了却不可用 = 转换失败 = 否决」 | PF-013 §4 转换件「登记了、此刻却用不了……当转换失败」；[PF-012 §5.8](../../../../product/PF-012-agent-loop-and-run/design.md#模态转换为什么必须落在这里) 区分没登记与登记了却不可用 | [D-060 §S17 S17-d](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s17modality-projection报回的) |
> | [S-24](#s-24-转换件不发起模型调用) 的「转换件不发起模型调用」 | PF-013 §4 转换件契约表「本版不调模型」 | [D-060 §块 C 对账 C-R2](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#块-c-对账d-reconciliation-c需主线看八项) |
>
> **只有主线裁定、产品正文不必写的**（见 [D-060 §S17](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s17modality-projection报回的)）：[S-18](#s-18-转换一个块-convert) ① 的 `tenant`（S17-a；它由系统那一件从统一输入的执行环境句柄取，[S-20](#s-20-一条消息在落盘之前的转换全有或全无) ②，见 [D-060 §八 M38](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）；[S-19](#s-19-查登记-lookupconverter) 的服务面名与三支结果（S17-b）；[S-20](#s-20-一条消息在落盘之前的转换全有或全无) ⑤ 对模型回复挂派生表示不是改写（S17-c）；[S-21](#s-21-转换件不可用即转换失败)、[S-23](#s-23-同一位置上转换之后不再动块) 系统转换件钉末位（S17-d）与转换上界即拓展件时限（S17-g）；契约身份沿用、拥有两件事（S17-h，[S-1](#s-1-本契约拥有什么)）。
> **[S-17](#s-17-声明转换件-declareconverters) 的整份声明操作**（原子替换、`keyTaken` 在一份之内判）是主线裁定，见 [D-060 §五 K41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)。
>
> 另有若干条是**规格层推导**，各自在条款正文里写明理由：[S-8](#s-8-转换件的键) 的键取值域、[S-10](#s-10-一个块落在哪个键上) 的「媒体类型键只管文件块」、[S-11](#s-11-一次合法的转换产出) ③、[S-17](#s-17-声明转换件-declareconverters) 的「一份声明里同键两次即 `keyTaken`」（PF-013 §4「同一个键上只有一件生效」落到装配那一刻的检查）、[S-18](#s-18-转换一个块-convert) ① 的 `tenant`、[S-20](#s-20-一条消息在落盘之前的转换全有或全无) 的全有或全无、[S-22](#s-22-没有转换件输入的消息不依赖转换这一侧)、[S-23](#s-23-同一位置上转换之后不再动块)。

---

## 一、含义与使用范围

**适用范围**：一个部署之内、一个会话的日志上。本版完整交付是单机，但每一条的领域语义在跨进程之后必须原样成立；
哪些由装配给、哪些须由协议重新兑现，列在[第八节](#八装配给的保证-vs-协议须给的保证)。

### S-1 本契约拥有什么

**契约身份沿用 `modality-projection`，实际拥有两件事**（主线裁定，见 [D-060 §S17 S17-h](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s17modality-projection报回的)：改名收益不够）：一件是**判定**（投影与兼容），一件是**转换**（转换件的键、登记与一次转换）。
两件共用同一个事实——**一个块有没有 [transcript](../../../../ubiquitous_language/terms/record-and-context.md#ul-transcript--transcript--transcript)**：转换那一半在落盘之前决定它，判定那一半在落盘之后读它。

| # | 拥有 | 正文 |
|---|---|---|
| 1 | **[模态投影](../../../../ubiquitous_language/terms/record-and-context.md#ul-modality-projection--模态投影--modality-projection)的定义**：会话日志 → 一个模态集合的折叠式，与它的单调、可分解、重算同一答案三条性质 | [S-5](#s-5-模态投影是对会话日志的一次折叠)、[S-6](#s-6-只增不减可以逐条并进去重算必得同一答案)、[S-15](#s-15-读投影-project) |
| 2 | **模态兼容判定**：一份[模型档案](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-profile--模型档案--model-profile)收不收得下一个投影，收不下时是哪几种 | [S-7](#s-7-模态兼容)、[S-16](#s-16-兼容判定-compatible) |
| 3 | **转换件的键与登记表**：什么是一个合法的键、一个键上此刻有没有登记、「没登记」到底指什么 | [S-8](#s-8-转换件的键)、[S-9](#s-9-登记表同键一件登记是系统装配层的声明)、[S-17](#s-17-声明转换件-declareconverters)、[S-19](#s-19-查登记-lookupconverter) |
| 4 | **转换一个块**：一个块落在哪个键上、一次合法的转换交出什么、交不出时是哪个失败值 | [S-10](#s-10-一个块落在哪个键上)、[S-11](#s-11-一次合法的转换产出)、[S-18](#s-18-转换一个块-convert) |
| 5 | **系统自带的模态转换那一件**在「消息落盘之前」对一条消息做什么：哪几块要转、全有或全无、转不成时它交回什么结论 | [S-20](#s-20-一条消息在落盘之前的转换全有或全无)～[S-24](#s-24-转换件不发起模型调用) |

### S-2 本契约不拥有什么

| 不拥有 | 归谁 |
|---|---|
| 块的形状、块的模态判定式、派生表示与 transcript 的形状 | `data.content-blocks` v2（本契约**引用**它的判定式，[S-4](#s-4-依赖方向与被消费的面)） |
| 消息有哪几种、压缩名单、「此刻模型可读」的计算 | `data.messages` v2 |
| 档案的形状、两组模态 | `data.model-profile` v2 |
| 拓展点的位置、结论的形状、报错处置策略 | `data.loop-extension` v2 |
| **否决之后按消息是谁产生的走哪一路**（输入被拒、模型回复另起新调用、工具结果让运行失败）；系统自带件的挂载与「不可用」处置表 | `capability.loop-extension-runner` v2（candidate；数据半边见 [`data.loop-extension/v2#S-25`](../../../data/loop-extension/v2/contract.md#s-25-veto)） |
| **合法目标集合的组装**（在册 ∩ 范围允许 ∩ 兼容）、选中模型与有效模型、**投影的持久缓存、读路径与「答得快」** | `capability.model-request-runtime` v2（candidate） |
| **工具两端模态、换模型之后哪些工具还在**（[PF-006 §6.11](../../../../product/PF-006-tools-and-skills/design.md#611-工具两端各要什么模态)） | 工具定义的声明（`data.tool-definition` v2）＋ 资产注册表的可用性重算（`capability.asset-registry` v2，candidate）。**本契约只给两个判定供它们调**：[S-16](#s-16-兼容判定-compatible) 与 [S-19](#s-19-查登记-lookupconverter)，走法见[第十二节](#十二消费者核对) |
| 转换件本身的实现 | 提供者；本版由系统装配层（无词条）装配——**本版不是资产**，组织与租户换不了哪个键上的转换件（[PF-013 §4 转换件](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件)） |
| 组装时取原件、取哪一份派生表示、还是取 transcript | PF-010（无契约） |
| 附件存储本身、引用能否解引用、解引用时的租户判定 | `data.content-blocks` v2 的 [G-1](../../../data/content-blocks/v2/contract.md#八已知缺口)（存储未定义） |

### S-3 本契约明确不承诺什么

- **不承诺转换无损。**一张图转成的文字一定比原图少（[PF-013 §4 转换件](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件)）；
  「用户看得出这次模型读到的是哪一份」落在交付面对那条消息的呈现上（[PF-016 §6.21](../../../../product/PF-016-cli-tui-delivery-surface/design.md#621-被转换过的消息呈现上说得出模型读的是哪一份)），本契约只保证派生表示上带着 `producedBy`（[`data.content-blocks/v2#S-20`](../../../data/content-blocks/v2/contract.md#s-20-派生表示的产出者与能力标识)）。
- **不判断这次要不要转，也不知道当前用哪个模型。**转换的输入里没有任何关于模型的东西（[S-18](#s-18-转换一个块-convert) ①）。
- **不回头补已落盘的块。**一个块落盘时没有 transcript，它就永远没有（[`data.content-blocks/v2#S-22`](../../../data/content-blocks/v2/contract.md#s-22-落盘之后整块不变)）；事后登记一件转换件**不改变任何已有的投影**（[S-30](#s-30-没登记就挡登记了就不挡事后登记不回头)）。
- **不维护投影的缓存，也不承诺读投影的代价。**本契约定义投影是什么、并给出使它可以逐条维护的那条定律（[S-6](#s-6-只增不减可以逐条并进去重算必得同一答案)）；谁存、怎么存、答得多快归读它的那一方。
- **不单独承诺一次转换的时间上界**：它就是拓展件时限，本版没有值（[S-21](#s-21-转换件不可用即转换失败)；`capability.loop-extension-runner` v2 的 G-7）。
- **不承诺转换件可用。**承诺的是它不可用时的收场：**不以「没有 transcript」落盘**（[S-21](#s-21-转换件不可用即转换失败)）。
- **不附 Schema。**本契约的操作输入与返回用散文写含义，值类型取 `data.content-blocks`、`data.model-profile`、`data.identity-values` 的定义；
  线上形状归将来把这些操作送过进程边界的那份组合契约（[规格容器的准入门槛](../../../README.md#准入门槛与停止条件)）。
- **不拥有「从日志算一个投影」的通用协议**（[G-8](#十一已知缺口)）；本契约只定这一个投影的折叠式。

### S-4 依赖方向与被消费的面

**依赖方向是单向的：本契约 → 五份数据契约。本契约不依赖任何能力契约**，也不被它们反向依赖以外的方式牵连——
模型请求运行时、拓展件执行器、资产注册表都是**本契约的消费者**（[第十二节](#十二消费者核对)），它们换代不牵动本契约的任何判定。

**下表每个 `#S-n` 的完整坐标是 `omne-harness-lite-design-2026-09-15 · <contract_id> · v1 · S-n`**；表内省去前缀只为可读。**catalog 的 `clauses` 以本表为准。**

#### `data.content-blocks` v2（14 条）

| 被消费的条款 | 用在哪 |
|---|---|
| [`#S-2`](../../../data/content-blocks/v2/contract.md#s-2-块底座) 只有语音、图、文件三类块可带派生属性，只有转换件写它们 | [S-18](#s-18-转换一个块-convert) ① 的「转换件的输入」、「已带派生属性的块不是输入」 |
| [`#S-3`](../../../data/content-blocks/v2/contract.md#s-3-blockid) 块标识在消息内唯一，含派生表示里的块 | [S-20](#s-20-一条消息在落盘之前的转换全有或全无) ④ 挂上去之后派生块的标识 |
| [`#S-4`](../../../data/content-blocks/v2/contract.md#s-4-两个标注) 两个标注 | [S-5](#s-5-模态投影是对会话日志的一次折叠) 的 `toModel` |
| [`#S-5`](../../../data/content-blocks/v2/contract.md#s-5-嵌套的块按合取取用) 嵌套的块按合取取用 | [S-5](#s-5-模态投影是对会话日志的一次折叠) 的 `counted(b)` |
| [`#S-6`](../../../data/content-blocks/v2/contract.md#s-6-模态由媒体类型判定) 模态由媒体类型判定 | [S-5](#s-5-模态投影是对会话日志的一次折叠) 的 `modality(b)`、[S-10](#s-10-一个块落在哪个键上) 的模态键、[S-11](#s-11-一次合法的转换产出) ③。**判定式引用不复制** |
| [`#S-7`](../../../data/content-blocks/v2/contract.md#s-7-媒体类型的规范形式) 媒体类型的规范形式 | [S-8](#s-8-转换件的键) 的媒体类型键、[S-10](#s-10-一个块落在哪个键上) 的比对 |
| [`#S-10`](../../../data/content-blocks/v2/contract.md#s-10-语音块与图块) 语音块与图块的媒体类型 | [S-10](#s-10-一个块落在哪个键上)：语音、图各落在哪个模态键 |
| [`#S-11`](../../../data/content-blocks/v2/contract.md#s-11-文件块) 文件块的模态看 `attachment.mediaType`；转换件按模态或媒体类型登记 | [S-10](#s-10-一个块落在哪个键上) 文件块的两个候选键 |
| [`#S-15`](../../../data/content-blocks/v2/contract.md#s-15-工具结果块) 工具结果块的 `blocks` 是一串块、可嵌套 | [S-5](#s-5-模态投影是对会话日志的一次折叠) 的 `tree(m)`、[S-20](#s-20-一条消息在落盘之前的转换全有或全无) ① |
| [`#S-19`](../../../data/content-blocks/v2/contract.md#s-19-派生表示与-transcript) 派生表示与 transcript 的形状 | [S-11](#s-11-一次合法的转换产出) 的合法产出、[S-5](#s-5-模态投影是对会话日志的一次折叠) 的「派生表示里的块不计」 |
| [`#S-20`](../../../data/content-blocks/v2/contract.md#s-20-派生表示的产出者与能力标识) 本版 `producedBy` 都是 `system` | [S-11](#s-11-一次合法的转换产出) ① |
| [`#S-22`](../../../data/content-blocks/v2/contract.md#s-22-落盘之后整块不变) 落盘之后整块不变 | [S-6](#s-6-只增不减可以逐条并进去重算必得同一答案) 的单调性、[S-20](#s-20-一条消息在落盘之前的转换全有或全无) 的「落盘之前写好」 |
| [`#S-23`](../../../data/content-blocks/v2/contract.md#s-23-块不携带租户身份) 块不携带租户身份；持有引用不等于可以读 | [S-18](#s-18-转换一个块-convert) ① 的 `tenant` |
| [`#S-26`](../../../data/content-blocks/v2/contract.md#s-26-表示层拒绝值) 块层表示层拒绝值 | [S-13](#s-13-输入不合形状收成-invalidinput)：块不合形状时 `invalidInput` 带上的那个原名 |

#### `data.messages` v2（5 条）

| 被消费的条款 | 用在哪 |
|---|---|
| [`#S-1`](../../../data/messages/v2/contract.md#s-1-七种消息) 七种消息 | [S-5](#s-5-模态投影是对会话日志的一次折叠) 的 `msgs(L)`：落进了日志的都算（`SystemMessage` 不落日志，PF-009 §4） |
| [`#S-2`](../../../data/messages/v2/contract.md#s-2-消息底座) 消息的 `blocks` | [S-5](#s-5-模态投影是对会话日志的一次折叠) 的 `tree(m)` |
| [`#S-5`](../../../data/messages/v2/contract.md#s-5-给谁看在块上) 给谁看在块上，不从消息类型推 | [S-5](#s-5-模态投影是对会话日志的一次折叠)：只读块上的标注 |
| [`#S-13`](../../../data/messages/v2/contract.md#s-13-toolinternalmessage) 工具说过程的块 `toModel` 恒为 `false` | [S-5](#s-5-模态投影是对会话日志的一次折叠) 与 [S-32](#s-32-只给人看的块不改变合法目标)：工具过程截图不进投影 |
| [`#S-27`](../../../data/messages/v2/contract.md#s-27-compactionmessage-与它的名单) 压缩名单不改块上的标注 | [S-6](#s-6-只增不减可以逐条并进去重算必得同一答案)：压缩不让投影变小 |

#### `data.model-profile` v2（2 条）

| 被消费的条款 | 用在哪 |
|---|---|
| [`#S-7`](../../../data/model-profile/v2/contract.md#s-7-modality-与两组模态) 两组模态；`inputModalities` 必含 `text` | [S-7](#s-7-模态兼容)、[S-16](#s-16-兼容判定-compatible)：只读 `inputModalities`；文本从不被挡 |
| [`#S-25`](../../../data/model-profile/v2/contract.md#s-25-拒绝值闭合一次恰一个) 档案的表示层拒绝值 | [S-13](#s-13-输入不合形状收成-invalidinput)：档案不合形状时 `invalidInput` 带上的那个原名 |

#### `data.loop-extension` v2（8 条）

| 被消费的条款 | 用在哪 |
|---|---|
| [`#S-1`](../../../data/loop-extension/v2/contract.md#s-1-十一个位置) `before_persist_message` | [S-20](#s-20-一条消息在落盘之前的转换全有或全无)：系统自带的模态转换站在这里 |
| [`#S-11`](../../../data/loop-extension/v2/contract.md#s-11-输入的成员) 输入的成员（`environment` 十一个位置都带）、[`#S-41`](../../../data/loop-extension/v2/contract.md#s-41-执行环境句柄) 执行环境句柄：经它取得调用方租户身份、不交出会话标识 | [S-20](#s-20-一条消息在落盘之前的转换全有或全无) ②、[S-18](#s-18-转换一个块-convert) ①：`tenant` 的来路（[D-060 §八 M38](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）；句柄怎样解析、解析不出时归哪一类，读面在 `capability.loop-extension-runner` v2 S-50（**指路**：它消费本契约，反向登记会成环） |
| [`#S-5`](../../../data/loop-extension/v2/contract.md#s-5-报错处置策略) `treat_as_veto` 在「之前」的位置落 `veto` | [S-21](#s-21-转换件不可用即转换失败)：转换件这一类报错即否决 |
| [`#S-10`](../../../data/loop-extension/v2/contract.md#s-10-本版没有-order) 模态转换件排在 `before_persist_message` 末位 | [S-23](#s-23-同一位置上转换之后不再动块)：转换之后不再动块的前提 |
| [`#S-23`](../../../data/loop-extension/v2/contract.md#s-23-rewrite) `before_persist_message` 上的 `rewrite` 改的是 `message`；模型产出的消息只许系统模态转换件挂派生表示 | [S-20](#s-20-一条消息在落盘之前的转换全有或全无) ⑤：转成了就交回挂好派生属性的那条消息，模型回复同样走得通 |
| [`#S-33`](../../../data/loop-extension/v2/contract.md#s-33-不可用与报错两分) 系统自带件不按租户件的声明、由装配预先声明的指定挂件顶上；模态转换那一件的效果是当转换失败 | [S-21](#s-21-转换件不可用即转换失败)：转换那一件不可用时按否决处置 |
| [`#S-25`](../../../data/loop-extension/v2/contract.md#s-25-veto) `before_persist_message` 上的 `veto`：这条不落盘；`reason` 不转述被拦的内容 | [S-20](#s-20-一条消息在落盘之前的转换全有或全无) ⑥：转不成就交回否决 |

#### `data.identity-values` v1（6 条）

| 被消费的条款 | 用在哪 |
|---|---|
| [`#S-5`](../../../data/identity-values/v1/contract.md#s-5-tenantid-的构成与相等) TenantId | [S-18](#s-18-转换一个块-convert) ① 的 `tenant` |
| [`#S-17`](../../../data/identity-values/v1/contract.md#s-17-身份参数没有默认值) 身份参数没有默认值 | [S-12](#s-12-缺席时的默认答案)、[S-18](#s-18-转换一个块-convert) ⑧ |
| [`#S-18`](../../../data/identity-values/v1/contract.md#s-18-缺席即拒绝) 缺席即拒绝 | 同上 |
| [`#S-19`](../../../data/identity-values/v1/contract.md#s-19-不可用即明确失败) 不可用即明确失败 | [S-12](#s-12-缺席时的默认答案)：读不到引用所指的字节，不当作「没有内容」 |
| [`#S-30`](../../../data/identity-values/v1/contract.md#s-30-跨边界须重新验证) 跨边界须重新验证 | [S-26](#s-26-装配给的保证-vs-协议须给的保证) 的「协议给」列 |
| [`#S-33`](../../../data/identity-values/v1/contract.md#s-33-表示层校验与判定分开) 表示层校验与判定分开 | [S-13](#s-13-输入不合形状收成-invalidinput) |

> **提到但不消费的，逐条点名**（按[登记口径](../../../README.md#当前状态)，否定式提及与对照不登）：
> [`data.messages/v2#S-28`](../../../data/messages/v2/contract.md#s-28-此刻模型可读是算出来的)（投影**不是**「此刻模型可读」，[S-5](#s-5-模态投影是对会话日志的一次折叠) 拿它作对照）；
> [`data.messages/v2#S-6`](../../../data/messages/v2/contract.md#s-6-每种消息能装哪几类块)（只在已闭合的 G-7 里出现过）；
> [`data.model-profile/v2#S-9`](../../../data/model-profile/v2/contract.md#s-9-inputconstraints)（兼容判定**不看**送进去之前的限制）；
> `capability.loop-extension-runner` v2（关门表、结论合法性判定、否决之后分三路、拓展件时限——**它消费本契约**，本契约只指路，不反向登记，依赖图无环）；
> `capability.asset-registry` v2（[S-19](#s-19-查登记-lookupconverter) 的消费者，本契约不读它）；
> `data.tool-definition` v2（工具两端归别处，本契约只在[消费者核对](#十二消费者核对)里指路）；
> `data.offer-expiry` v1（本契约没有时间点值，**不依赖**）。

---

## 二、概念、身份与必要状态

**本契约没有耐久状态。**投影是一个折叠式，兼容是一个纯判定；唯一的一份运行中的状态是**登记表**，
而它的权威是系统装配层（无词条）的声明（[S-9](#s-9-登记表同键一件登记是系统装配层的声明)），**不在本契约里另存一份**。

### S-5 模态投影是对会话日志的一次折叠

**[模态投影](../../../../ubiquitous_language/terms/record-and-context.md#ul-modality-projection--模态投影--modality-projection)是会话日志的一个前缀 `L` 的函数，定义如下：**

```text
msgs(L)      ≝ L 里的全部消息（落进了日志的那几种；日志里别的条目不是消息，不参与）
tree(m)      ≝ m 的顶层块，加上每个工具结果块 blocks 里任意层的块；
               不含任何块的派生表示（renderings）里的块
path(b)      ≝ b 自己，加上从它往外、直到消息顶层的每一个容器块
counted(b)   ≝ path(b) 里每一块的 visibility.toModel 都为 true

project(L)   ≝ { modality(b) | m ∈ msgs(L), b ∈ tree(m), counted(b),
                               modality(b) 有定义, b 不带 transcript }
```

`modality(b)` 取 [`data.content-blocks/v2#S-6`](../../../data/content-blocks/v2/contract.md#s-6-模态由媒体类型判定) 的判定式，**引用不复制**。

**`ModalityProjection` 就是这个集合**：`Modality` 取值的集合（`data.content-blocks` v2 的 `$defs/Modality`），至多四个元素，无重复、**次序没有含义**。
它没有成员名，只是一个集合。

定义域的每一处取舍都是有意的：

| 取舍 | 依据 |
|---|---|
| **只计给模型看的块**（`counted`：路径上每一位 `toModel` 都为真） | [PF-013 §4 模态投影](../../../../product/PF-013-model-profiles-and-invocation/design.md#模态投影)「它只算标着给模型看的块」。只给人看的块模型从来读不到——[工具说过程的块 `toModel` 恒为 `false`](../../../data/messages/v2/contract.md#s-13-toolinternalmessage)——计入它，一张没有转换件可转的过程截图就会**永久**把纯文本模型挤出合法目标，而那个模型从没见过它 |
| **看块上那一位，不看压缩名单**——投影**不是** [`data.messages/v2#S-28`](../../../data/messages/v2/contract.md#s-28-此刻模型可读是算出来的) 的「此刻模型可读」 | [PF-013 §4 模态投影](../../../../product/PF-013-model-profiles-and-invocation/design.md#模态投影)：「**压缩也不会让它消失**」。改看名单，投影就会随压缩变小，不再单调 |
| **嵌在工具结果里的块算** | [PF-013 §9.1](../../../../product/PF-013-model-profiles-and-invocation/design.md#91-一处需要上游回补工具能产出哪些块) 第二问（工具产出的图算不算）在这里按「算」落定——**只要它给模型看**；那一问剩下的「工具到底能产出哪些块」是上游事实，不挡本条 |
| **派生表示里的块不计** | [PF-013 §4 转换件](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件)：转换件交出来的块「**不进消息的块序列，也不另立对象**：它们挂在原块上」；[§4 模态投影](../../../../product/PF-013-model-profiles-and-invocation/design.md#模态投影)：配上了 transcript 的块「**不再进这份投影**」。派生块是原块的另一种样子，原块带着 transcript，**它们不是另外的原件**——PF-013 原话支持，不另起说法 |
| **四种模态都算，文本也算** | 定义里「只有原件、没有 transcript」对文本块字面成立（文本、思考、工具调用块都不能带 transcript，[`data.content-blocks/v2#S-2`](../../../data/content-blocks/v2/contract.md#s-2-块底座)）。**它从不挡任何档案**：每份档案都收得下文本（[`data.model-profile/v2#S-7`](../../../data/model-profile/v2/contract.md#s-7-modality-与两组模态)）。不为它开特例，定义就少一处分支 |
| **没有模态的文件块不算** | [PF-013 §4 模态](../../../../product/PF-013-model-profiles-and-invocation/design.md#模态)：媒体类型落在四种之外的文件块只是一个引用，**任何模型都读得了**；判定式对它给出「无模态」，不是第五个取值 |
| **只有落进日志的消息算** | 投影从日志得来。**`SystemMessage` 不落日志、每次组装现算**（[PF-009 §4 消息](../../../../product/PF-009-context-message-types/design.md#消息)），所以不在里面；本版系统提示词也只有文本（PF-010；[D-060 §S17 S17-f](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s17modality-projection报回的)），这里没有要进投影的块 |

### S-6 只增不减，可以逐条并进去，重算必得同一答案

**三条代数性质，都由 [S-5](#s-5-模态投影是对会话日志的一次折叠) 的定义直接推出，不另需机制：**

| 性质 | 陈述 | 为什么成立 |
|---|---|---|
| **单调** | `L` 是 `L'` 的前缀 ⇒ `project(L) ⊆ project(L')` | 日志只增不改（[PF-012 §5.2](../../../../product/PF-012-agent-loop-and-run/design.md#52-会话日志是唯一的真相来源)）；块落盘之后整块不变（[`data.content-blocks/v2#S-22`](../../../data/content-blocks/v2/contract.md#s-22-落盘之后整块不变)）；压缩名单不改块上的标注（[`data.messages/v2#S-27`](../../../data/messages/v2/contract.md#s-27-compactionmessage-与它的名单)）。**没有任何动作能让一个已计入的块不再被计入** |
| **可分解** | `project(L · e) = project(L) ∪ project(⟨e⟩)`，`e` 是追加的一条日志条目；不是消息的条目贡献空集 | 一条消息的贡献只取决于它自己的块，与它前后的日志无关 |
| **重算同一答案** | 任何一处给出的「日志到位置 p 为止的投影」，都必须等于 `project(L_p)` | 投影不是第二份权威（[UL-session-log-projection](../../../../ubiquitous_language/terms/record-and-context.md#ul-session-log-projection--会话日志投影--session-log-projection)）。对不上时**以日志重算为准** |

**可分解律是 [PF-013 §6.18](../../../../product/PF-013-model-profiles-and-invocation/design.md#618-模态投影要答得快而且是增量维护出来的)「答得快、增量维护」的前提，不是它的实现。**
有了它，读投影的一方可以只把新追加的条目并进一个已有的答案，代价与已经过去的历史长度无关；
**怎么存、存在哪、多久追一次，归读投影的那一方**（本版是 `capability.model-request-runtime`）。本契约对那一方只有两条要求：

1. 它给出的每一个答案都满足上表第三行；
2. **用来判合法目标的那个答案，必须覆盖到判定那一刻的日志尾**——否则一张刚落盘、没有转换件可转的图，会让一个纯文本模型在它进来之后仍被当作合法目标（[PF-013 §6.9](../../../../product/PF-013-model-profiles-and-invocation/design.md#69-合法目标算不出来时不替用户改选) 那条路因此提前发生在出门那一刻，正是 [§5.11](../../../../product/PF-013-model-profiles-and-invocation/design.md#挡在这一刻而不是出门那一刻) 要防的）。

**由单调性掉出一条产品后果，写在这里以免被当成缺陷修掉**（[PF-013 由此掉出的三条](../../../../product/PF-013-model-profiles-and-invocation/design.md#由此掉出的三条)）：
一个会话里只要落过一个**给模型看、有模态、没有 transcript** 的非文本块，它的合法目标集合就永久变小；想回到全集只能开新会话。

### S-7 模态兼容

**一份档案 `P` 兼容一个投影 `S`，当且仅当 `S ⊆ P.inputModalities`。不兼容时，挡住它的是 `S \ P.inputModalities`。**

- **只读 `inputModalities`**（[`data.model-profile/v2#S-7`](../../../data/model-profile/v2/contract.md#s-7-modality-与两组模态)）：
  投影说的是历史里有什么要**读**，[PF-013 §6.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#610-模态兼容挡在算合法目标那一刻不挡在出门那一刻) 的判据是「收得下的模态必须覆盖投影」。
- **不看** `outputModalities`（那是工具调用端的事，归工具两端，[S-2](#s-2-本契约不拥有什么)）、**不看**送进去之前的限制——
  「一张图超过档案声明的大小上限不归这一条」（PF-013 §6.10 末段），那是组装的事；**不看**在册状态与范围允许——那是合法目标另外两项。
- **文本从不在「挡住它的」里**：每份档案都收得下文本（`data.model-profile/v2#S-7`）。
- **判定是全函数、纯计算**：同一份档案、同一个投影，在任何进程、任何时刻给出同一个答案。

### S-8 转换件的键

**`ConverterKey` 恰两支，按 `kind` 判别，集合闭合：**

| `kind` | 另一个成员 | 合法取值 |
|---|---|---|
| `modality` | `modality` | `image`、`audio`、`video` 三者之一——**不收 `text`** |
| `media_type` | `mediaType` | 一个 [`data.content-blocks/v2#S-7`](../../../data/content-blocks/v2/contract.md#s-7-媒体类型的规范形式) 规范形式的媒体类型，**只有 `type/subtype`、不带参数** |

- **两个键相等**，当且仅当 `kind` 相同且另一个成员逐码点相等。
- **模态键不收 `text`（规格层推导）**：模态键说的是「这一种模态上没人读得懂时，谁来转」，而文本从不挡任何档案（[S-7](#s-7-模态兼容)）；
  转换件的输入本就是「非文本模态的块，或者文件块」（[PF-013 §4](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件)），一份 `text/*` 的文件要转，按它的媒体类型登记。
- **媒体类型键不带参数（规格层推导）**：参数原样携带、不影响模态（[`data.content-blocks/v2#S-6`](../../../data/content-blocks/v2/contract.md#s-6-模态由媒体类型判定)、`#S-7`）；
  让它影响选哪一件，同一份 PDF 带不带一个版本参数就会落到两件不同的转换件上，**同一个块在两个部署里一个有 transcript、一个没有**。
- **`Converter`** 是一件转换件实现的**不透明引用**：它指向哪一份实现、怎么被调起来，归提供者与系统装配层；本契约不比较两个引用，也不解析它。

### S-9 登记表：同键一件，登记是系统装配层的声明

**登记表是键到转换件的一个偏函数：每个键上至多一件生效。**它是**部署范围**的——不按租户、组织或会话分份：
转换件本版不是资产，**替换只发生在系统装配那一层**（[PF-013 §4 转换件](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件)）。

**登记表的内容恰是现行的那一份声明**：系统装配层经 [S-17](#s-17-声明转换件-declareconverters) 交来一整份「键 → 转换件」，这一份整份生效；再交来一份，整份替换。

**「没登记」只有一个含义：现行的那一份声明里没有这个键。**由此三条：

1. **登记不随转换件实例在不在而增减。**一件登记了的转换件此刻起不来、它依赖的东西挂了——**键上仍然有登记**，这一次转换的收场是 `converterFailed`，**不是** `noConverter`（[S-21](#s-21-转换件不可用即转换失败)；[PF-013 §4 转换件](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件)「登记了、此刻却用不了……当转换失败」）。
2. **还没有任何一份声明生效时，登记表答不出任何一个键**——答不出不是「没登记」（[S-12](#s-12-缺席时的默认答案)）。
   进程刚起来、系统装配层还没交来那一份声明时就是这样；否则那一段里落盘的块会以「没有 transcript」进日志、**永久**进投影。登记表本身不可用时同样答不出。
3. **一个键离开登记表只有一条路：新的一份声明里不再有它。**那是一次有意的装配动作，后果要被看见：此后落在这个键上的块照原样落盘、进投影（[S-6](#s-6-只增不减可以逐条并进去重算必得同一答案)）。
   **替换同理**：换一件就是交来一份在这个键上写着新那一件的声明。**整份原子替换**：旧的一份一直生效到新的一份生效的那一刻，**中间没有任何一刻对哪个键答「没登记」**——这一半在任何部署形态下成立。**单机时还多一半**：一个两份声明里都有的键，任何时刻都答得出「有」；这一半由装配给（[S-26](#s-26-装配给的保证-vs-协议须给的保证)），跨进程之后声明换代可以让节点一度答不出（那时按 [S-12](#s-12-缺席时的默认答案) 以转换失败收场），**只承诺不答「没登记」**（主线裁定，见 [D-060 §七 M19](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）。

> **与产品正文一致**：[PF-012 §5.8](../../../../product/PF-012-agent-loop-and-run/design.md#模态转换为什么必须落在这里) 区分**没登记**（照原样落盘）与**登记了却不可用**（当转换失败）；
> 系统自带件不走租户件「缺席即视作卸载」那一条，由装配预先声明的指定挂件顶上、模态转换那一件的效果是当转换失败（[`data.loop-extension/v2#S-33`](../../../data/loop-extension/v2/contract.md#s-33-不可用与报错两分)；产品裁定见 [D-059 U-5](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#凭据档案工具拓展件卡片-pf-013-rev-10pf-002-rev-1819pf-006-rev-19pf-012-rev-12pf-007-rev-17pf-008-rev-7pf-016-rev-8)）。
> **理由是后果不对称**：「视作没装」让一次瞬时故障变成永久的产品后果（那个块原样落盘、永久进投影、可选模型永久变少），
> 而「否决」只让这一次请求失败、可以重发。

### S-10 一个块落在哪个键上

**一个块的候选键按下表依次排出；它落在第一个此刻有登记的候选键上，都没有登记就是「没登记」：**

```text
keys(b) ≝
  voice                          → ⟨ {modality: audio} ⟩
  image                          → ⟨ {modality: image} ⟩
  file，t = attachment.mediaType 去掉参数后的 type/subtype，m = modality(b)：
                                 → ⟨ {media_type: t}, {modality: m} ⟩
                                   （m 为 text 或无模态时，只有前一个）
  text · thinking · tool_call · tool_result
                                 → 不是转换件的输入
```

- **一个文件块同时命中两个键时，媒体类型键优先，只有那一件被调用、只出一份派生表示**（[PF-013 §4 转换件](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件)契约表第一行）。
  特定压过一般，是唯一不会给同一个块产出两份 transcript 的读法。
- **媒体类型键只管文件块（规格层推导）**：[PF-013](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件) 的原话是「一种**文件的**媒体类型」；
  语音块与图块只落在模态键上。一件登记在 `{media_type: image/png}` 上的转换件**不接**一个 `image/png` 的图块，只接装着 `image/png` 的文件块。
- **比对按逐码点精确相等**：媒体类型在块上已是规范形式（`data.content-blocks/v2#S-7`），去掉参数之后与键逐字比较，不折叠、不嗅探、不按扩展名改判。
- **解析只看这个块与此刻的登记表**：不看它在哪条消息里、谁产生的、会话用什么模型。

### S-11 一次合法的转换产出

**一次转换交回 `{ renderings, transcript }`，它合法当且仅当下面六条全部成立：**

| # | 条件 | 依据 |
|---|---|---|
| ① | `renderings` **恰好一份** [`DerivedRendering`](../../../data/content-blocks/v2/contract.md#s-19-派生表示与-transcript)，`producedBy` 为 `system` | PF-013 §4 转换件「只出一份派生表示」；[`data.content-blocks/v2#S-20`](../../../data/content-blocks/v2/contract.md#s-20-派生表示的产出者与能力标识)：本版转换件由系统装配层登记 |
| ② | 那一份的 `blocks` **非空**，每一块只能是文本块、图块或语音块，**不能是文件块**，也不能是思考、工具调用、工具结果块；它们**自己不带**派生属性 | [PF-013 §4 转换件](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件)「不能是文件块」；[`data.content-blocks/v2#S-19`](../../../data/content-blocks/v2/contract.md#s-19-派生表示与-transcript) |
| ③ | 每一块的模态**不同于**输入块的模态；输入块没有模态时（四种之外的文件）不受此限 | PF-013 §4「**别的**模态的内容块」（规格层推导：把原话落成可判的一条） |
| ④ | `transcript` 是**非空**的纯文本 | PF-013 §4「transcript 是最后的兜底，**每一次都必须有**」；`data.content-blocks/v2#S-19`「transcript 非空」 |
| ⑤ | 每一块满足 `data.content-blocks` v2 对块的全部形状约束（两个标注必填、媒体类型规范、模态与块类对得上……） | [`data.content-blocks/v2#S-26`](../../../data/content-blocks/v2/contract.md#s-26-表示层拒绝值) |
| ⑥ | **只交 transcript、不交派生块是非法的**——①② 已经排除它，单列是为了不被当成「省事的合法形态」 | PF-013 §4 转换件「只交 transcript、一个派生块都不交，同样不合契约」 |

- **违反 ④ 是 `transcriptMissing`；违反 ①②③⑤⑥ 中任何一条是 `converterFailed`**——PF-013 把「交不出合乎契约的东西」与「挂了」列在同一种失败下；
  `transcriptMissing` 单独具名，是因为 transcript 是「这个块还挡不挡模型」的唯一依据（[`data.content-blocks/v2#S-19`](../../../data/content-blocks/v2/contract.md#s-19-派生表示与-transcript)），排查时要一眼分得出来。
- **原块一步不动**：产出挂在原块上（[S-20](#s-20-一条消息在落盘之前的转换全有或全无) ④），原块的任何成员都不因转换而改变。
- **派生块的标注由转换件写，本契约不规定取值**，只要求两位都在（⑤）；派生块进哪一侧按它与原块的合取（[`data.content-blocks/v2#S-5`](../../../data/content-blocks/v2/contract.md#s-5-嵌套的块按合取取用)）。

---

## 三、贯穿全部操作的规矩

### S-12 缺席时的默认答案

**一律拒绝或明确失败，不放行、不空集、不回退。「判不出来」与「判为没有」永远是两个值：**

| 情形 | 答 | **不能**答成 | 为什么不能合并 |
|---|---|---|---|
| 键上**确实没登记**（登记表答得出，答的是「没有」） | `noConverter`——**合法，不是失败**，块照原样落盘 | `converterFailed` | 没人读得懂时宁可挡住模型，也不能让这条消息发不出去（PF-013 §4「没有登记转换件，不是失败」） |
| 登记表**答不出**（还没有任何一份声明生效、登记表本身不可用） | `converterFailed` | `noConverter` | 当成没登记，这一块就以「没有 transcript」**永久**进投影（[S-9](#s-9-登记表同键一件登记是系统装配层的声明) 第 2 条） |
| 键上有登记，那一件**此刻不可用** | `converterFailed` | `noConverter` | PF-013 §4 转换件「登记了、此刻却用不了……当转换失败」（[S-21](#s-21-转换件不可用即转换失败)） |
| 转换要读引用所指的字节，**读不到** | `converterFailed` | 「当作没有内容」「当作空块」 | 不可用即明确失败（[`data.identity-values/v1#S-19`](../../../data/identity-values/v1/contract.md#s-19-不可用即明确失败)） |
| **会话日志读不到** | 没有投影——读投影的那一方明确失败 | 空集 `∅` | 空集是一个成立的答案（「什么都不挡」），它会让每一个模型都成为合法目标 |
| **投影不知道**（没算出来） | 不调 [S-16](#s-16-兼容判定-compatible) | 拿 `∅` 去调，得到 `ok` | 同上 |
| `tenant`、档案、块、键**缺席** | `invalidInput` | 用进程上下文、运行时的环境配置或「当前会话」补（统一输入里的执行环境句柄是 `tenant` 的**明确来路**，[S-20](#s-20-一条消息在落盘之前的转换全有或全无) ②，不在此列） | 身份参数没有默认值（[`data.identity-values/v1#S-17`](../../../data/identity-values/v1/contract.md#s-17-身份参数没有默认值)、[`#S-18`](../../../data/identity-values/v1/contract.md#s-18-缺席即拒绝)） |

**本契约没有带默认值的参数。**五个操作的每一个输入都必填。

### S-13 输入不合形状收成 `invalidInput`

**一个输入根本不合形状，是表示层校验，在进入任何判定之前发生，一律收成 `invalidInput`，它进本契约每一个操作的失败集合。**
口径取 [`data.identity-values/v1#S-33`](../../../data/identity-values/v1/contract.md#s-33-表示层校验与判定分开)：它**不表示**「这个键没登记」「这个块转不成」「这份档案不兼容」，**也不得被记成一次判定结果**。

- **`invalidInput` 带一个原因，原因不另起同义值**：块不合形状时就是 [`data.content-blocks/v2#S-26`](../../../data/content-blocks/v2/contract.md#s-26-表示层拒绝值) 的那个拒绝值原名，
  档案不合形状时就是 [`data.model-profile/v2#S-25`](../../../data/model-profile/v2/contract.md#s-25-拒绝值闭合一次恰一个) 的那个原名；
  违反本契约自己的形状规则（[S-8](#s-8-转换件的键) 的键、[S-17](#s-17-声明转换件-declareconverters) ① 的声明、[S-18](#s-18-转换一个块-convert) ① 的输入范围）时，原因指到那一条。
- **不修补**：不把 `Image/PNG` 的键改成小写再登记、不把带参数的媒体类型键截掉参数、不把一个文本块当成「没登记」放过。
- **它与 `noConverter` 必须分开**：把一个文本块交给转换收成 `noConverter`，就等于说「这个键上没人登记」——而文本块根本没有键，**错在那次调用本身**。

### S-14 每个操作写全九件事

| # | 写什么 |
|---|---|
| ① | **输入** |
| ② | **前置与授权** |
| ③ | **结构性禁止**（不适用写「无」） |
| ④ | **提交点与原子性** |
| ⑤ | **成功返回** |
| ⑥ | **失败集合**（枚举封闭，**没有「其他」**） |
| ⑦ | **幂等与重复** |
| ⑧ | **缺席时的默认答案**（[S-12](#s-12-缺席时的默认答案)） |
| ⑨ | **事件**（[S-25](#s-25-本契约不发事件)） |

**本节共五个操作**：两个纯判定（[S-15](#s-15-读投影-project)、[S-16](#s-16-兼容判定-compatible)）、一个装配动作（[S-17](#s-17-声明转换件-declareconverters)）、一次转换（[S-18](#s-18-转换一个块-convert)）、一个登记读面（[S-19](#s-19-查登记-lookupconverter)）。
**没有一个操作有耐久提交**：投影与兼容是纯函数，登记表的权威在系统装配层的声明（整份原子替换的是进程里的一份，不是存储），转换的产出随那条消息一起落盘（[S-20](#s-20-一条消息在落盘之前的转换全有或全无)）。

---

## 四、操作

### S-15 读投影 `project`

| # | 内容 |
|---|---|
| ① | **一份会话日志的前缀 `L`**。消费者可以写作 `project(session)`：会话在这里只用来指认它的那本日志；**全系统尚无会话标识的数据定义**，本契约因此以日志本身为输入，不另造一个标识 |
| ② | 无授权前置。**读日志本身的授权归日志的持有者**，按那本日志所属会话的租户身份判；本操作只对调用方已经合法读到的前缀求值 |
| ③ | 无 |
| ④ | 纯函数，无提交 |
| ⑤ | `ModalityProjection` = `project(L)`（[S-5](#s-5-模态投影是对会话日志的一次折叠)） |
| ⑥ | `invalidInput`（`L` 里一条消息或一个块不合形状，原因取 [S-13](#s-13-输入不合形状收成-invalidinput) 的原名） |
| ⑦ | 纯函数：同一个 `L`，任何时刻、任何进程得到同一个集合 |
| ⑧ | 拿不到 `L` ⇒ **没有投影**，调用方明确失败，**不得以 `∅` 顶上**（[S-12](#s-12-缺席时的默认答案)） |
| ⑨ | 不发 |

**这条操作定义的是「投影是什么」，不是「怎么读得快」。**读它的一方维护一个逐条并进来的答案是允许的，而且是 [PF-013 §6.18](../../../../product/PF-013-model-profiles-and-invocation/design.md#618-模态投影要答得快而且是增量维护出来的) 要的；
那个答案对本操作的义务写在 [S-6](#s-6-只增不减可以逐条并进去重算必得同一答案) 末两条。

### S-16 兼容判定 `compatible`

| # | 内容 |
|---|---|
| ① | `profile`：一份模型档案（`data.model-profile` v2 的 `ModelProfile`）；`projection`：一个 `ModalityProjection` |
| ② | 无 |
| ③ | 无 |
| ④ | 纯函数，无提交 |
| ⑤ | `{ ok }`——`projection ⊆ profile.inputModalities`；或 `{ blocked: Modality[] }`——`blocked = projection \ profile.inputModalities`，**非空**、无重复、次序无含义、**从不含 `text`**（[S-7](#s-7-模态兼容)） |
| ⑥ | `invalidInput`（档案不合 `data.model-profile` v2 的形状，或投影里有不是 `Modality` 的值） |
| ⑦ | 纯函数，天然可重复 |
| ⑧ | 任一输入缺席 ⇒ `invalidInput`。**投影不知道时不得拿 `∅` 来调**（[S-12](#s-12-缺席时的默认答案)） |
| ⑨ | 不发 |

**它只回答合法目标三项里的第三项**（[PF-013 §5.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事)）；在册、范围允许与三者求交归模型请求运行时。
**在兼容判定这一支里**，`blocked` 那几种模态就是展示列表上「**模态对不上**」那一行要说给用户的内容，也是选中模型因此不合法时那一次请求上交的成因
`modality_mismatch`（`data.loop-extension` v2 的 `FailureCause`）背后的具体模态——**成因归那边，本判定只交出事实**。
同一个成因还有另一个来路：投影里有本据点传输承载不了的模态（`capability.model-request-runtime` v2 出门前检查第 3 行）——那时本判定答的是 `{ ok }`，**没有 `blocked`**，那几种模态不由本契约交出。

### S-17 声明转换件 `declareConverters`

**系统装配层把它的一整份转换件声明交进来，整份原子地成为登记表**（主线裁定，见 [D-060 §五 K41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)）。

| # | 内容 |
|---|---|
| ① | `declaration`：一组 `{ key: ConverterKey（[S-8](#s-8-转换件的键)）, converter: Converter（不透明引用） }`，**可以是空的一组**——那是一份「不为任何键声明转换件」的合法声明，生效后每个键都答「没登记」，**与「还没有任何一份声明」（答不出）是两回事** |
| ② | **只有系统装配层调用**。组织、租户、会话、拓展件都够不着它——转换件本版不是资产，替换只在系统装配那一层（[PF-013 §4](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件)）。本版这条前置由装配兑现，见 [S-26](#s-26-装配给的保证-vs-协议须给的保证) |
| ③ | **有：同一份声明里，一个键至多出现一次**（按 [S-8](#s-8-转换件的键) 的键相等），**不论两处是不是同一件** |
| ④ | **整份原子替换，在本次返回时生效**：此后登记表的内容恰是这一份，此前生效的那一份（若有）整份被取代。一次转换解析键时看到的**要么整份是旧的、要么整份是新的**，没有一半旧一半新；**也没有任何一刻处在「两份之间、谁都不算」**——任何时刻都不对一个两份里都有的键答「没登记」；单机时它任何时刻都答得出「有」，那一半由装配给（[S-9](#s-9-登记表同键一件登记是系统装配层的声明) 第 3 条、[S-26](#s-26-装配给的保证-vs-协议须给的保证)）。**被拒时什么都不变**：旧的一份照旧生效；还没有任何一份时照旧答不出 |
| ⑤ | 成功（无返回值） |
| ⑥ | `invalidInput`（`declaration` 缺席或不是一组；某一项的键不合 [S-8](#s-8-转换件的键)：未知的 `kind`、模态键给了 `text` 或别的值、媒体类型键不规范或带参数；某一项缺 `converter`）· **`keyTaken`**（③：同一份里同一个键出现两次）。**这个排列就是判定次序**：一份声明里既有不合形状的键、又有重复的键 ⇒ `invalidInput`——先判整份每一项的形状，都合形状才比键相不相等（形状不合的键谈不上与谁相等） |
| ⑦ | **可重复**：同一份声明交两次，登记表与交一次相同（第二次是一次内容相同的整份替换）。本契约不比较两个 `Converter` 引用，所以「内容相同」只对键集合与各键上交来的引用逐项成立时才说得上 |
| ⑧ | `declaration` 缺席 ⇒ `invalidInput`，**不当作空的一份**；某一项缺 `converter` ⇒ `invalidInput`，不补默认 |
| ⑨ | 不发 |

**为什么 `keyTaken` 不是「后者覆盖前者」（规格层推导）。**两件同键的声明出现在同一份里，只能是装配写错了；
让后一件静默覆盖前一件，**生效的是哪一件取决于列举的先后**，而那个先后没有任何人声明过。
「同一个键上只有一件生效」（[PF-013 §4](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件)）由此在装配那一刻被检查，而不是在运行中碰巧成立；**整份被拒、旧的一份照旧**——错误尽早暴露，也不留一份半生效的登记表。

**为什么是整份声明，不是逐键登记**：逐键登记要另有「开始一份新声明」「宣告登记完」两个动作，登记表才分得清「这个键还没登记到」与「这一份里没有它」；
缺了它们，实现就会自己发明状态转移，最容易做成「先删后加」——那一瞬间一个已声明的键答「没登记」，一块原样落盘、**永久**进投影。整份原子替换让这两件事都不需要。

### S-18 转换一个块 `convert`

| # | 内容 |
|---|---|
| ① | `block`：一个内容块（`data.content-blocks` v2 的 `ContentBlock`），**必须是转换件的输入**——语音块、图块或文件块，且**还没带** `renderings` 或 `transcript`（[`data.content-blocks/v2#S-2`](../../../data/content-blocks/v2/contract.md#s-2-块底座)：只有转换件写它们）；`tenant`：**那条消息所属会话的 `TenantId`**（[`data.identity-values/v1#S-5`](../../../data/identity-values/v1/contract.md#s-5-tenantid-的构成与相等)）——调用它的系统那一件从自己这一次统一输入的执行环境句柄取得（[S-20](#s-20-一条消息在落盘之前的转换全有或全无) ②）。**没有目标模态，也没有任何关于模型的东西** |
| ② | **只有系统自带的模态转换那一件调用**（[S-20](#s-20-一条消息在落盘之前的转换全有或全无)）；本版由装配兑现（[S-26](#s-26-装配给的保证-vs-协议须给的保证)）。登记表答不出时不是前置不满足，而是这一次的收场 `converterFailed`（⑧） |
| ③ | 无 |
| ④ | **本操作不提交任何东西。**它交回的产出挂到原块上、随那条消息**在同一次落盘里**写下（[S-20](#s-20-一条消息在落盘之前的转换全有或全无)）；那条消息没落盘，产出就不存在于日志里 |
| ⑤ | `ConversionResult`，两支：**转成了** `{ renderings, transcript }`，合乎 [S-11](#s-11-一次合法的转换产出)；或 **`noConverter`**——这个块的每一个候选键上都确实没登记（[S-10](#s-10-一个块落在哪个键上)），**不是失败**，块照原样落盘 |
| ⑥ | `invalidInput` · `converterFailed` · `transcriptMissing`——各自含义见下 |
| ⑦ | **每次调用各自独立，不去重**：同一个块转两次可能得到两份不同的产出（转换件可以不确定）。一条被否决的消息再来一次时，它的块是新的块，转换也是新的一次 |
| ⑧ | `block` 或 `tenant` 缺席 ⇒ `invalidInput`；登记表答不出、转换件不可用、引用所指读不到 ⇒ `converterFailed`，**从不收成 `noConverter`**（[S-12](#s-12-缺席时的默认答案)） |
| ⑨ | 不发 |

**失败值与它们的判定次序**（同一次调用只落一个值，按下面的次序取第一个成立的）：

| 次序 | 情形 | 值 |
|---|---|---|
| 1 | 输入不合形状，或不是转换件的输入（文本、思考、工具调用、工具结果块；已带派生属性的块；`tenant` 不合形状） | `invalidInput` |
| 2 | 登记表答不出 | `converterFailed` |
| 3 | 每一个候选键都确实没登记 | `noConverter`（成功的一支，见 ⑤） |
| 4 | 落到的那一件此刻不可用、调起来挂了、没有交回东西、要读的字节读不到 | `converterFailed` |
| 5 | 交回了东西，但 `transcript` 缺席或为空串 | `transcriptMissing` |
| 6 | 交回了东西、有 transcript，但违反 [S-11](#s-11-一次合法的转换产出) ①②③⑤⑥ 中任一条 | `converterFailed` |

**失败集合就是这三个值，没有「其他」**（主线收窄：`noConverter` 只指没登记，`converterFailed` 含不可用）。

**`tenant` 为什么是必填输入（规格层推导，主线采纳：D-060 §S17 S17-a）。**
一个引用形状的语音块、图块，或任何一个文件块，转换件要读到它所指的那份字节才转得了；派生块若以引用形状交回，还要写进存储。
[块上没有租户身份，持有一个引用也不等于可以读它](../../../data/content-blocks/v2/contract.md#s-23-块不携带租户身份)——
**读与写都要以这条消息所属会话的租户身份进行**（[SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant)：跨边界操作显式携带租户身份）。
不带它，转换件要么读不到（每一个引用都转不成），要么不经判定就读（一个被复制进别的会话的引用就能读到另一个租户的字节）。
**存储与解引用时的判定本身尚未定义**（[G-6](#十一已知缺口)）。

### S-19 查登记 `lookupConverter`

**`lookupConverter(key) → { registered } | { unregistered } | { unavailable }`**（主线裁定，见 [D-060 §S17 S17-b](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s17modality-projection报回的)）——
**给一个键，答此刻登记表在这个键上有没有一件。**有一个消费者没有它走不通：资产注册表算工具**结果那一端**的可用性（[第十二节](#十二消费者核对)资产注册表那一行）。

| # | 内容 |
|---|---|
| ① | `key`：一个 `ConverterKey` |
| ② | 无授权前置；本版只有进程内的消费者（[S-26](#s-26-装配给的保证-vs-协议须给的保证)） |
| ③ | 无 |
| ④ | 只读，无提交 |
| ⑤ | 三支，闭合：`{ registered }`——这个键上登记了一件；`{ unregistered }`——含义与 [S-9](#s-9-登记表同键一件登记是系统装配层的声明) 的「没登记」相同，只指现行的那一份声明里没有这个键；`{ unavailable }`——**答不出**（还没有任何一份声明生效，或登记表本身不可用）。**只答有没有登记，不答那一件此刻可不可用**——可用性在转换那一刻才见分晓，它不可用的收场由 [S-21](#s-21-转换件不可用即转换失败) 管 |
| ⑥ | `invalidInput` |
| ⑦ | 只读，天然可重复 |
| ⑧ | 键缺席 ⇒ `invalidInput`；登记表答不出 ⇒ `{ unavailable }`，**不得收成 `{ unregistered }`**——消费者对它按「这一项不满足」处置，不当满足（[S-12](#s-12-缺席时的默认答案)） |
| ⑨ | 不发 |

**它只接受键，不接受块。**一个工具声明的是「结果里会有哪几种模态」（`data.tool-definition` v2 的 `needs.outputModalities`），不是某个具体的块；
能替一整种模态兜底的只有模态键——**只在某几个媒体类型上登记了转换件，不等于这一种模态有兜底**。

---

## 五、落盘之前：系统自带的模态转换那一件

### S-20 一条消息在落盘之前的转换：全有或全无

**系统自带的模态转换那一件站在 `before_persist_message`**（[`data.loop-extension/v2#S-1`](../../../data/loop-extension/v2/contract.md#s-1-十一个位置)），**每一条要落进日志的消息都经过它**——不论是谁产生的（[PF-012 §5.8](../../../../product/PF-012-agent-loop-and-run/design.md#模态转换为什么必须落在这里)）。它对一条消息 `m` 做的事恰为：

| 步 | 内容 |
|---|---|
| ① | **挑出要转的块**：`tree(m)`（[S-5](#s-5-模态投影是对会话日志的一次折叠)）里每一个**给模型看的**（`counted(b)`，嵌套按合取，含嵌在工具结果里任意层的）、**还没带派生属性的**语音块、图块、文件块——下文称**要转的块**。**只给人看的块（`toModel = false`）不转**，与它不进投影同一理由：没有模型会读它，它不需要 transcript（[PF-013 §4 模态投影](../../../../product/PF-013-model-profiles-and-invocation/design.md#模态投影)「转换件因此也不转它」）。**已带派生属性的块不转**：它已经有 transcript，不进投影；它本来就不是 [S-18](#s-18-转换一个块-convert) 的输入。它从哪来、带着的派生属性可不可信，不由本契约判（[`data.content-blocks/v2#S-2`](../../../data/content-blocks/v2/contract.md#s-2-块底座)：只有转换件写它们） |
| ② | 对每一块要转的块调 [S-18](#s-18-转换一个块-convert)，`tenant` 取 `m` 所属会话的租户身份——**从这一件这一次统一输入的执行环境句柄解析得到**（`environment`，[`data.loop-extension/v2#S-41`](../../../data/loop-extension/v2/contract.md#s-41-执行环境句柄)；读面在 `capability.loop-extension-runner` v2 S-50；主线裁定，见 [D-060 §八 M38](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)），不经别的通道。**只在 ① 挑出了要转的块时才解析**（没有要转的块就不需要租户身份，[S-22](#s-22-没有转换件输入的消息不依赖转换这一侧)）。**句柄解析不出租户身份，这一件报错**：不以「没有租户」、也不以别的租户身份去调 S-18；报错按它的策略 `treat_as_veto` 否决这条消息（[S-21](#s-21-转换件不可用即转换失败) 末行），与 `converterFailed` 同一结局 |
| ③ | **每一块都是「转成了」或 `noConverter`** ⇒ 进 ④；**任何一块以 S-18 的三个失败值之一收场**（`invalidInput`、`converterFailed`、`transcriptMissing`）⇒ 进 ⑥ |
| ④ | 把每个「转成了」的产出挂到原块上：`renderings` 与 `transcript` 成为那个块的两个成员；派生块在挂上时补齐标识，**挂上之后整条消息满足 [`data.content-blocks/v2#S-3`](../../../data/content-blocks/v2/contract.md#s-3-blockid)**。`noConverter` 的块原样不动 |
| ⑤ | 交回 `rewrite`，`message` 是挂好之后的那一条（[`data.loop-extension/v2#S-23`](../../../data/loop-extension/v2/contract.md#s-23-rewrite)：`before_persist_message` 上对模型产出的消息，`rewrite` 只许挂派生表示、只认系统模态转换件交回的）。**除了给转成了的块添上这两个成员，这条消息的任何成员、任何一块都不变**；一块都没转成时交回 `observed` |
| ⑥ | 交回 `veto`（[`data.loop-extension/v2#S-25`](../../../data/loop-extension/v2/contract.md#s-25-veto)），`reason` **指到至少一个转不成的块与它的失败值**：块标识、失败值（`invalidInput{reason}`、`converterFailed` 或 `transcriptMissing`），**解析到了键时再带那个键**——登记表答不出、或块本身不合形状时没有键可带；**不转述块的内容**——被拦下的东西不进日志，`reason` 却进 |

**全有或全无（规格层推导）**：一条消息要么每一块该转的都转成了、随它一起落盘，要么整条不落盘。
**没有「转成的几块留下、转不成的那块原样落盘」这条路**——那正是 [PF-013 §4](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件)「**没有第四路，尤其没有『照原样落盘、只是没有 transcript』**」要堵的；
也没有「删掉转不成的那块、其余落盘」——一条少了一块的消息说的已经不是产生者说的话（[`data.messages/v2#S-2`](../../../data/messages/v2/contract.md#s-2-消息底座) 同一条理由）。

- **在第一块失败之后不要求接着转其余的块**：结论已定是否决，其余的转换只花钱不改结果。所以 `reason` 只保证点到**至少一个**失败块。
- **否决之后怎么走不归本契约。**输入被拒并告知发送方、模型回复不落盘且下一次迭代另起一次新调用、工具结果让这次运行失败、系统追加的那些只落结论——
  **归 `capability.loop-extension-runner` v2**（候选；按消息是谁产生的分三路，[PF-012](../../../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前的否决按消息是谁产生的分三路)）。
- **对模型回复做这件事，不是 D-5「落盘前对模型回复只许否决、不许改写」要防的改写**：挂派生属性不改块序列、不改原块的任何成员（[S-11](#s-11-一次合法的转换产出)）。
  `data.loop-extension` v2 已为它留出口——模型产出的消息在落盘之前只许否决，**另许系统模态转换件挂派生表示**（[`#S-23`](../../../data/loop-extension/v2/contract.md#s-23-rewrite)；主线裁定，见 [D-060 §S17 S17-c](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s17modality-projection报回的)；产品行 [PF-012 §5.8](../../../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前每条消息都经过它不只是输入)「转换件挂派生表示不算改写」）；
  「交回的是不是只多了派生表示、是不是系统那一件」由 runner 判（`capability.loop-extension-runner` v2 S-14 ②）。

### S-21 转换件不可用即转换失败

**登记了的转换件不可用，等于转换失败，等于否决**（[PF-013 §4 转换件](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件)「登记了、此刻却用不了……当转换失败」；[PF-012 系统自带的几件，不可用时各有定法](../../../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件不可用时各有定法)）。落到本契约的几处：

| 哪一层不可用 | 收场 | 落在哪 |
|---|---|---|
| 某个键上那一件转换件起不来、依赖挂了 | `converterFailed` ⇒ 整条消息 `veto` | [S-18](#s-18-转换一个块-convert) ⑧、[S-20](#s-20-一条消息在落盘之前的转换全有或全无) ⑥ |
| 登记表答不出 | 同上 | [S-9](#s-9-登记表同键一件登记是系统装配层的声明) 第 2 条 |
| **系统自带的模态转换那一件整个不可用** | 对**含要转的块**（[S-20](#s-20-一条消息在落盘之前的转换全有或全无) ①：给模型看、还没带派生属性的语音块、图块、文件块）的消息，按否决处置；对不含的消息见 [S-22](#s-22-没有转换件输入的消息不依赖转换这一侧) | 这一格由 `capability.loop-extension-runner` v2 S-17 的指定挂件表兑现；系统自带件**不走**租户件「缺席即视作卸载」，由指定挂件顶上（[`data.loop-extension/v2#S-33`](../../../data/loop-extension/v2/contract.md#s-33-不可用与报错两分)；D-059 U-5） |
| **一次转换跑过了拓展件时限** | 这一件报错，按 `treat_as_veto` 否决——与 `converterFailed` 同一结局 | 时限就是拓展件时限，**不单独立一个转换上界**（D-060 §S17 S17-g）；那个时限本版没有值，在 `capability.loop-extension-runner` v2 的 G-7 |
| **执行环境句柄解析不出租户身份**（有要转的块时） | 这一件报错，按 `treat_as_veto` 否决——与 `converterFailed` 同一结局；**没有要转的块的消息不受牵连**（[S-22](#s-22-没有转换件输入的消息不依赖转换这一侧)） | [S-20](#s-20-一条消息在落盘之前的转换全有或全无) ②；分界照 `capability.loop-extension-runner` v2 S-50 第 4 条：这一件已开始（已挑出要转的块）才取租户身份，取不到是报错（[D-060 §八 M38](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)） |

**合起来是本契约的核心安全性质**：

> **一个要转的块（给模型看的转换件输入类块），只要它的键此刻有登记，就只有两种结局：带着 transcript 落盘，或它所在的那条消息不落盘。**
> 一个给模型看、有模态、却没有 transcript 的非文本块出现在日志里，**只剩一种来路：它的每一个候选键上都确实没登记**（[PF-013 §5.11](../../../../product/PF-013-model-profiles-and-invocation/design.md#511-有-transcript-的块不再把任何模型挡在外面)「只剩一种来路」）。
> **只给人看的块不在这条性质里**：它不转、也不进投影（[S-20](#s-20-一条消息在落盘之前的转换全有或全无) ①），有没有 transcript 与哪个模型能不能用无关。

**这条性质有前提，前提失效时它不成立**：每一条消息都经过这一件（执行器兑现，[S-20](#s-20-一条消息在落盘之前的转换全有或全无)）；它在同一位置上是最后一个动块的（[S-23](#s-23-同一位置上转换之后不再动块)）；
对模型回复它能交回挂派生表示的 `rewrite`（`data.loop-extension/v2#S-23`）；`SystemMessage` 不落日志、本版系统提示词只有文本（PF-009 §4、PF-010）。

### S-22 没有转换件输入的消息不依赖转换这一侧

**一条消息里没有要转的块（[S-20](#s-20-一条消息在落盘之前的转换全有或全无) ①：给模型看、还没带派生属性的语音块、图块、文件块）时，它的转换是空的：交回 `observed`，与登记表、与任何一件转换件在不在都无关。**

这一条划出了「不可用即否决」的波及面：**判断一条消息里有没有要转的块，只看那条消息本身，不需要登记表**，
所以转换这一侧整个不可用时也判得出来。**纯文本的消息、只含只给人看的图的消息，都不得因为转换这一侧不可用而被否决**——
否则一件看图用的转换件挂掉，整个系统连一句话都落不了盘，那不是 fail-closed，是把一个局部故障放大成全局停摆。

### S-23 同一位置上，转换之后不再动块

**[S-21](#s-21-转换件不可用即转换失败) 的安全性质要求：在 `before_persist_message` 上，系统自带的模态转换是最后一个改动块的。**
排在它之后的任何一件，**不得新增、替换或删除转换件输入类的块，也不得去掉已挂上的派生属性**——
否则一个新塞进来的图块、或被剥掉 transcript 的图块，会绕过转换直接落盘。

**本契约只写这条性质，不写它怎么兑现**：同一位置多件的先后只来自装配清单；**模态转换件排在 `before_persist_message` 的末位**已写进 [`data.loop-extension/v2#S-10`](../../../data/loop-extension/v2/contract.md#s-10-本版没有-order)（装配清单的排序义务；D-060 §S17 S17-d），
与「系统放行判断钉在 `before_action` 瀑布最后」是同一类约束，由 `capability.loop-extension-runner` 照装配清单兑现。
排在它之前的件（例如脱敏）改块不受限：它们的产出正是转换的输入。

### S-24 转换件不发起模型调用

**本版的转换件不发起模型调用；一次转换是本地计算——纯计算，或本地的识别库**（[PF-013 §4 转换件](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件)「本版不调模型」；推理见 D-060 §块 C 对账 C-R2）。

**理由是宿主**：一次模型调用的宿主是 agent runtime、它的钱算在一个运行或一个会话头上（[PF-012 挂件自己花的钱](../../../../product/PF-012-agent-loop-and-run/design.md#挂件自己花的钱算它插手的那个-run)）；
而「消息落盘之前」那一刻**看不到有没有运行在跑**（`data.loop-extension` v2 在这个位置不带运行与执行尝试），输入消息落盘时可以根本没有 agent runtime——
**转换件在这里发起的模型调用，找不到宿主，也找不到记账的地方**。

- **代价要写出来**：本版的 transcript 只能出自本地的识别手段；「让一个看得了图的模型替纯文本模型描述这张图」这条路**本版没有**。
- **违反的收场**：一件转换件发起了模型调用，是它的实现违约，按 `converterFailed` 处置；本契约**不承诺能在调用发生之前拦住它**——
  拦截归提供者与装配（它们决定一件转换件够不够得着模型请求运行时）。
- 这一条对**其余拓展件**不成立：它们仍按 PF-012 可以调模型。它只收窄转换件这一类。

---

## 六、事件

### S-25 本契约不发事件

**投影变了、登记表变了、一次转换成败，都不发事件。**

- **投影的变化从日志读，不从通知读**：读投影的一方要保证答案覆盖到日志尾（[S-6](#s-6-只增不减可以逐条并进去重算必得同一答案)），而[内核不提供可靠投递](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)——
  靠一个「投影变了」的通知去推进答案，漏一次就让一个不该合法的模型被当成合法目标。
- **一次转换的成败已经在日志里**：转成了，产出就在那条消息上；转不成，那条否决结论由执行器落进日志（`data.loop-extension` v2 的结论记录）。不需要第二个出处。

---

## 七、性质与前提

性质的来源一律引 PF 小节或裁定；**编号只在本表内作行标，不是可外部引用的条款号**。

### 不变量

| 性质 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|
| **投影等于对日志的折叠，重算必得同一答案** | [S-5](#s-5-模态投影是对会话日志的一次折叠)、[S-6](#s-6-只增不减可以逐条并进去重算必得同一答案) 的定义；任何存着答案的一方（模型请求运行时）对它的义务 | 日志只增不改 | [PF-013 §4 模态投影](../../../../product/PF-013-model-profiles-and-invocation/design.md#模态投影)、[§6.18](../../../../product/PF-013-model-profiles-and-invocation/design.md#618-模态投影要答得快而且是增量维护出来的) |
| **投影只增不减** | [S-6](#s-6-只增不减可以逐条并进去重算必得同一答案) | 块落盘不变（`data.content-blocks/v2#S-22`）；压缩不改标注（`data.messages/v2#S-27`） | [PF-013 §4 模态投影](../../../../product/PF-013-model-profiles-and-invocation/design.md#模态投影) |
| **每个键上至多一件生效** | [S-17](#s-17-声明转换件-declareconverters) ③⑥ 的 `keyTaken` | 登记只经 [S-17](#s-17-声明转换件-declareconverters)（装配给） | [PF-013 §4 转换件](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件)「同一个键上只有一件生效」；一份声明内同键即拒：D-060 §五 K41 |
| **一个块至多一份派生表示；有派生表示则有 transcript，反之亦然** | [S-10](#s-10-一个块落在哪个键上)（只一件被调用）、[S-11](#s-11-一次合法的转换产出) ①④ | 块层形状（`data.content-blocks/v2#S-19`） | [PF-013 §4 转换件](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件)「只出一份派生表示」「transcript……每一次都必须有」；[D-060 §S1 S1-g](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s1content-blocks报回的) |
| **文本从不挡任何档案** | [S-7](#s-7-模态兼容) | 每份档案收得下文本（`data.model-profile/v2#S-7`） | [PF-013 §4 模态](../../../../product/PF-013-model-profiles-and-invocation/design.md#模态)；档案一侧的条款在 `data.model-profile` v2 |

### 安全性质（绝不能发生）

| 绝不能发生 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|
| **一个要转的块（给模型看、还没带派生属性），键上有登记，却以没有 transcript 落盘**（只给人看的块不转，不在这条性质里） | [S-20](#s-20-一条消息在落盘之前的转换全有或全无)、[S-21](#s-21-转换件不可用即转换失败)、[S-12](#s-12-缺席时的默认答案) | 每条消息都经过这一件（执行器）；它是同一位置最后一个动块的（[S-23](#s-23-同一位置上转换之后不再动块)）；对模型回复能挂派生表示（`data.loop-extension/v2#S-23`） | [PF-013 §4 转换件](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件)、[§5.11](../../../../product/PF-013-model-profiles-and-invocation/design.md#511-有-transcript-的块不再把任何模型挡在外面)；「登记了却用不了当转换失败」同在 §4 |
| **「答不出有没有登记」被当成「没登记」** | [S-9](#s-9-登记表同键一件登记是系统装配层的声明) 第 2 条、[S-12](#s-12-缺席时的默认答案)、[S-19](#s-19-查登记-lookupconverter) ⑥ | 系统装配层的第一份声明到位之前不接受转换 | [PF-013 §4 转换件](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件)「登记了、此刻却用不了……当转换失败」；「答不出」归这一支为规格层推导 |
| **从一份声明换到另一份的中间，某个两份里都有的键被答成没登记** | [S-9](#s-9-登记表同键一件登记是系统装配层的声明) 第 3 条 | 同上 | 规格层推导；「任何时刻答得出『有』」只在单机成立，见 [S-26](#s-26-装配给的保证-vs-协议须给的保证) |
| **一条消息部分转换之后落盘** | [S-20](#s-20-一条消息在落盘之前的转换全有或全无) ③ | 改写与落盘在同一次提交（执行器） | [PF-013 §4](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件)「没有第四路」 |
| **转换改动了原块** | [S-11](#s-11-一次合法的转换产出)、[S-20](#s-20-一条消息在落盘之前的转换全有或全无) ⑤ | — | PF-013 §4「原件一步没动」 |
| **转换件据当前模型决定转不转** | [S-18](#s-18-转换一个块-convert) ①：输入里没有模型 | — | PF-013 §4「三件事它不做」 |
| **只给人看的块把模型挤出合法目标** | [S-5](#s-5-模态投影是对会话日志的一次折叠) 的 `counted` | — | [PF-013 §4 模态投影](../../../../product/PF-013-model-profiles-and-invocation/design.md#模态投影)「它只算标着给模型看的块」；[D-060 §S17 S17-e](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s17modality-projection报回的) |
| **兼容判定在投影未知时答 `ok`** | [S-12](#s-12-缺席时的默认答案)、[S-16](#s-16-兼容判定-compatible) ⑧ | 调用方不以 `∅` 顶替 | fail-closed |
| **转换读到另一个租户的字节** | [S-18](#s-18-转换一个块-convert) ① 的 `tenant` | 存储按调用方租户身份现判（[G-6](#十一已知缺口)） | [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant)、`data.content-blocks/v2#S-23` |
| **纯文本消息因转换这一侧不可用而被否决** | [S-22](#s-22-没有转换件输入的消息不依赖转换这一侧) | 执行器的「不可用」处置表照此区分 | 规格层推导（「不可用即否决」的波及面） |
| **转换件发起模型调用** | [S-24](#s-24-转换件不发起模型调用) | 提供者与装配让转换件够不着模型请求运行时 | [PF-013 §4 转换件](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件)「本版不调模型」；[D-060 §块 C 对账 C-R2](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#块-c-对账d-reconciliation-c需主线看八项) |

### 进展性质（全部有界）

| 性质 | 上界 | 前提 | 来源 |
|---|---|---|---|
| 一条消息落盘之后，**下一次**合法目标判定就已计入它 | 下一次判定 | 读投影的一方覆盖到日志尾（[S-6](#s-6-只增不减可以逐条并进去重算必得同一答案) 第 2 条） | [PF-013 §6.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#610-模态兼容挡在算合法目标那一刻不挡在出门那一刻) |
| 读一次投影的代价**与日志长度无关** | 常数（对日志长度） | 读投影的一方按可分解律维护答案 | [PF-013 §6.18](../../../../product/PF-013-model-profiles-and-invocation/design.md#618-模态投影要答得快而且是增量维护出来的) |
| 系统装配层的一份声明交进来并返回之后，**下一次**转换就按新登记表解析 | 下一次转换 | 装配给 | PF-013 §4「同键可替换」 |

**「下一次」这类措辞是有意的**：它们写得出会失败的断言（[规格入口](../../../README.md#按需展开形式化工件)）。
**「一次转换在有界时间内交回」不列在这里**：它的上界就是拓展件时限（[S-21](#s-21-转换件不可用即转换失败)），本版没有值，写不出会失败的断言——缺口在 `capability.loop-extension-runner` v2 的 G-7，那里有值之后才成为本表一行。

---

## 八、装配给的保证 vs 协议须给的保证

### S-26 装配给的保证 vs 协议须给的保证

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) 要求领域语义在分布式演化中不变，因此右两列不是「以后再说」，而是本契约已经记下的待兑现项。

| 保证 | 本版（单机）由谁给 | 跨进程之后谁重新兑现 | 做不到会怎样 |
|---|---|---|---|
| **登记表只由系统装配层写**（[S-17](#s-17-声明转换件-declareconverters) ②） | 只有装配那一段够得着它 | 在接收边界鉴别调用方，只认系统装配层 | 任何够得着的一方都能把一个键指到自己的实现上，替全部租户决定模型读到什么 |
| **登记表答「没登记」当且仅当现行系统装配未声明**（[S-9](#s-9-登记表同键一件登记是系统装配层的声明)） | 同一进程里的一份登记表，整份原子替换；第一份声明到位之前答不出 | 每个做转换的节点看到**同一份**现行声明；声明换代要让所有节点都进入「答不出」再一起进入新声明 | 某个节点落后一代，把一个已声明的键答成「没登记」：那一块原样落盘、**永久**进投影 |
| **声明换代时，一个两份声明里都有的键任何时刻都答得出「有」**（[S-9](#s-9-登记表同键一件登记是系统装配层的声明) 第 3 条、[S-17](#s-17-声明转换件-declareconverters) ④） | 同一进程里整份原子替换：旧的一份生效到新的一份生效那一刻 | **不再承诺**：换代时节点可以一度答不出（按 [S-12](#s-12-缺席时的默认答案) 以转换失败收场、这一次请求被否决、可以重发）；**只承诺不答「没登记」**（[D-060 §七 M19](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)） | 做成跨进程也「答得出『有』」要一次分布式的原子切换；照 S-9／S-17 旧字面实现会与上一行的「一起进入答不出」相抵 |
| **只有系统自带的模态转换那一件调转换**（[S-18](#s-18-转换一个块-convert) ②） | 进程内调用链 | 同上，鉴别调用方 | 绕过全有或全无，一条消息的部分块被转 |
| **转换的产出与原消息同一次落盘**（[S-20](#s-20-一条消息在落盘之前的转换全有或全无) ④） | 同一次日志追加 | 远端做完的转换**先交回、再落盘**；不允许「先落原样、之后补挂」 | 事后补挂违反只增不改；不补则那块永久没有 transcript |
| **读引用所指的字节以 `tenant` 进行**（[S-18](#s-18-转换一个块-convert) ①） | 本机存储 | `tenant` 随请求到达存储，**在接收边界重新验证**（[`data.identity-values/v1#S-30`](../../../data/identity-values/v1/contract.md#s-30-跨边界须重新验证)） | 拿着复制来的引用读到别的租户的字节 |
| **`tenant` 就是这条消息所属会话的租户**（[S-20](#s-20-一条消息在落盘之前的转换全有或全无) ②） | 执行器按这一次经过所在的会话造执行环境句柄，转换件经它解析（`capability.loop-extension-runner` v2 S-50） | 句柄的解析携带会话与租户身份、**在接收边界重新验证**；句柄的串不承载会话标识 | 转换件以别的会话、别的租户的身份读写附件字节 |
| **用来判合法目标的投影覆盖到日志尾**（[S-6](#s-6-只增不减可以逐条并进去重算必得同一答案)） | 答案与日志同处，读时追到尾 | 读投影的节点能读到那本日志的权威尾部，并写明一致性级别 | 一个刚进了没人转的图的会话，仍把纯文本模型当合法目标，**失败推迟到出门那一刻** |

**不在表里的条款在任何部署形态下一律成立**：投影的定义式、兼容判定、键的解析、合法产出——它们都是纯计算，不依赖进程边界。

---

## 九、交接、缺席与恢复

### S-27 依赖不可用，本能力重启

- **五份依赖都是数据契约**，没有「提供者不可用」这回事；它们的定义是本契约判定的输入，**换代即语义变更**，按规格演进走新版本。
- **运行时实际会不可用的**是：会话日志（读投影时）、存储（读写引用所指的字节时）、某一件转换件的实现、登记表本身。
  前一项的收场是「没有投影」（[S-15](#s-15-读投影-project) ⑧），后三项一律 `converterFailed`（[S-12](#s-12-缺席时的默认答案)）——**没有一项被当成「没有」**。
- **本能力重启**：登记表的权威在系统装配层的声明，不在本契约的任何存储里；重启之后由系统装配层重新交一份声明（[S-17](#s-17-声明转换件-declareconverters)），**那份声明到位之前答不出**（[S-9](#s-9-登记表同键一件登记是系统装配层的声明) 第 2 条），
  这段时间里含要转的块的消息被否决、纯文本消息照常（[S-22](#s-22-没有转换件输入的消息不依赖转换这一侧)）。**投影不受重启影响**——它是日志的函数。
- **本契约没有跨提交的在途状态**，唯一的在途工作是正在进行的转换（[S-28](#s-28-替换与撤除时在途的转换)）。

### S-28 替换与撤除时在途的转换

**一次转换开始之后，它落到的那一件被撤下（新的系统装配换了这个键上的实现、或那一件的实例没了）：**

- 这次转换要么**用原来那一件交回一份合法产出**（`producedBy` 照样是 `system`，合法），要么以 `converterFailed` 收场。**两种都可以，其余都不行**：
  不得一半用旧的、一半用新的拼出一份产出；**不得收成 `noConverter`**。
- **外部效果不回滚**：转换件已写进存储的派生块字节，在那条消息被否决之后仍在存储里——它们不被任何日志条目引用，**留存多久归存储**（[G-6](#十一已知缺口)）。
  本契约不定义补偿，也不承诺清理。
- **撤除不发停止信号给执行器**：那条消息的收场由这次转换的结果决定（[S-20](#s-20-一条消息在落盘之前的转换全有或全无)），不由撤除本身决定。

---

## 十、规范表达与验证义务

### S-29 本版选用哪些形式工件

| 性质 | 表达 | 理由 |
|---|---|---|
| [S-5](#s-5-模态投影是对会话日志的一次折叠)／[S-6](#s-6-只增不减可以逐条并进去重算必得同一答案) 的折叠式与三条代数性质 | **规范场景 ＋ 性质测试**（[S-37](#s-37-投影逐条并入与整份重算相同)） | 它们是一个纯函数的代数定律：单调、可分解、重算同一。**在任意生成的日志上比较两种算法的结果**，比在有限状态里穷举更直接；它们没有交错可被反驳 |
| [S-7](#s-7-模态兼容)、[S-10](#s-10-一个块落在哪个键上)、[S-11](#s-11-一次合法的转换产出) | **规范场景**（[examples](examples.md)） | 纯判定，逐条给正例与反例 |
| [S-9](#s-9-登记表同键一件登记是系统装配层的声明)、[S-17](#s-17-声明转换件-declareconverters) 的「不经过没登记」 | **规范场景**（[S-36](#s-36-替换不经过没登记)），须真跑并发 | 它是「替换与一次落盘同时发生」的交错。**一个整份原子替换的登记表按构造满足它**，建模只会复述这句定义；真正的风险是实现做成「先删后加」，那只有对实现真跑才看得见 |
| [S-20](#s-20-一条消息在落盘之前的转换全有或全无)、[S-21](#s-21-转换件不可用即转换失败)、[S-22](#s-22-没有转换件输入的消息不依赖转换这一侧) | **规范场景，含故障注入**（[S-33](#s-33-转换件不可用时不落原样)、[S-34](#s-34-一块转不成整条不落盘)） | 「在什么情况下不落盘」只有真跑才看得见 |

**本版不建 `formal/`，不建 Schema。**没有自定义并发协议、没有跨 owner 的同提交、没有状态机；
值的形状全部归三份数据契约，**在这里再建一份就是第二份权威**。证据义务与状态在[验证入口](../verification.md)，**不写进本版本目录**。

### 规范场景

**场景是本契约触发的证据形式**；每条的实例在 [`examples.md`](examples.md)，执行状态在[验证入口](../verification.md)。

#### S-30 没登记就挡、登记了就不挡、事后登记不回头

两个会话，各收一条带一个语音块（`toModel` 为真）的用户消息；一个部署在 `{modality: audio}` 上**没有**登记，另一个**有**。
**必须观察到**：前者那一块原样落盘，投影含 `audio`，一份只收文本的档案 `compatible` 得 `{ blocked: [audio] }`；
后者那一块带着 transcript 落盘，投影不含 `audio`，同一份档案得 `{ ok }`。
**再在前一个部署补登 `{modality: audio}`，对前一个会话重读投影**：仍含 `audio`，仍被挡——**事后登记不回头**（`data.content-blocks/v2#S-22`、[S-6](#s-6-只增不减可以逐条并进去重算必得同一答案)）。
**三步必须在同一次演练里做**：只跑前两步，一个「登记之后重扫历史补 transcript」的实现也会全过。

#### S-31 文件块两键命中取媒体类型键

同时登记 `{modality: video}` 与 `{media_type: video/mp4}`，转换一个装着 `video/mp4` 的文件块。
**必须观察到**：只有媒体类型键那一件被调用；那个块 `renderings` 恰一份。再转一个装着 `video/webm` 的文件块：落在模态键那一件上。
**反例**：一个 `image/png` 的**图块**遇上只有 `{media_type: image/png}` 的登记表 ⇒ `noConverter`（媒体类型键只管文件块）。

#### S-32 只给人看的块不改变合法目标

一个工具说过程的消息里有一张图（`toModel` 恒为 `false`），部署里没有图的转换件。
**必须观察到**：投影不含 `image`；纯文本档案仍 `ok`。**对照**：同一张图作为工具结果块里的一块（`toModel` 为真）落盘 ⇒ 投影含 `image`，纯文本档案被挡。
**两支必须同跑**：只跑前一支，一个把工具过程消息整个跳过、却也跳过了工具结果的实现看起来一样。

#### S-33 转换件不可用时不落原样

在 `{modality: image}` 上登记一件，**让它不可用**（故障注入），然后分别送进：一条带图的用户消息、一条纯文本的用户消息。
**必须观察到**：带图那条被否决、**日志里没有它**、投影没有变；纯文本那条照常落盘。
**绝不能观察到**：那张图以「没有 transcript」落盘（那是「视作没装」的读法，[S-21](#s-21-转换件不可用即转换失败) 禁止）；纯文本那条被否决。
**再让登记表整个答不出（本能力重启、系统装配的声明尚未到位）重跑一遍**，结论相同。
**再让转换件照常可用、而这一次统一输入的执行环境句柄解析不出租户身份（会话持有的租户读不到）重跑一遍**（[S-20](#s-20-一条消息在落盘之前的转换全有或全无) ②）：结论相同，并且**没有一次 `convert` 以缺席的或别的租户身份被调起**；纯文本那条照常落盘、**它那一次根本没有解析句柄**。

#### S-34 一块转不成，整条不落盘

一条消息带两张图，同一个键上登记的那一件对第一张交回合法产出、对第二张交回没有 transcript 的产出。
**必须观察到**：整条消息被否决，结论记录的 `reason` 点到第二张图与 `transcriptMissing`；**日志里既没有这条消息，也没有第一张图的派生表示**。

#### S-35 转换件违约的五种样子

同一个键上的一件依次交回：① 只有 transcript、没有派生表示；② 派生表示里有一个文件块；③ 图块转出一个图块；④ 两份派生表示；⑤ 派生表示合法、transcript 为空串。
**必须观察到**：①～④ 都是 `converterFailed`，⑤ 是 `transcriptMissing`；五次都导致那条消息被否决，**没有一次被「修好」之后落盘**（不删掉那个文件块留下其余、不补一个 transcript、不只留第一份派生表示）。

#### S-36 替换不经过「没登记」

`{modality: image}` 上登记着甲。**一边不断送进带图的消息，一边交进一份新声明，其中同一个键上是乙**（[S-17](#s-17-声明转换件-declareconverters)）。
**必须观察到**：每一条带图的消息要么带着甲或乙产出的派生表示落盘，要么被否决（登记表答不出时）；**没有一条的图以「没有 transcript」落盘**。
**这条必须真跑并发**：顺序地「先换再送」不会经过要保护的那个窗口。同一次演练里**交一份同一个键出现两次的声明** ⇒ `keyTaken`，整份被拒，登记表仍是含乙的那一份。

#### S-37 投影逐条并入与整份重算相同

对任意生成的会话日志（含七种消息、嵌套工具结果、带与不带 transcript 的四种模态块、压缩记录、只给人看的块、非消息条目）：
**必须观察到**：对每一个前缀 `L`，逐条并入得到的集合 = 整份重算 `project(L)`；且 `L` 越长，集合只增不减。
**这是性质测试，不是一个样例**：一个固定样例证明不了「对任何日志都相同」。

---

## 十一、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决，实现不得据一个看起来合理的猜测推进。

| # | 缺口 | owner | 闭合条件 |
|---|---|---|---|
| **G-1** | **已闭合**：只给人看的块不转、不进投影（[PF-013 §4 模态投影](../../../../product/PF-013-model-profiles-and-invocation/design.md#模态投影)；D-060 §S17 S17-e），[S-20](#s-20-一条消息在落盘之前的转换全有或全无) ① 已定稿 | — | — |
| **G-2** | **已闭合**：三处都已在别的契约里有条款——① 模型产出的消息只许系统模态转换件挂派生表示（`data.loop-extension/v2#S-23`；D-060 §S17 S17-c）；② 系统自带件不走「视作卸载」、由指定挂件顶上（`data.loop-extension/v2#S-33` 与 `capability.loop-extension-runner` v2 S-17；D-059 U-5）；③ 模态转换件排在 `before_persist_message` 末位（`data.loop-extension/v2#S-10`；D-060 §S17 S17-d） | — | — |
| **G-3** | **已闭合**：起草时写「主线裁定，待产品负责人确认」的各条，已各有产品行或 D-060 条目（设计依据表）；整份声明 `declareConverters`（[S-9](#s-9-登记表同键一件登记是系统装配层的声明)、[S-17](#s-17-声明转换件-declareconverters)）见 D-060 §五 K41 | — | — |
| **G-4** | **已闭合**：一次转换的时间上界就是拓展件时限，不单独立（D-060 §S17 S17-g）；那个时限本版没有值，缺口归 `capability.loop-extension-runner` v2 的 G-7 | — | — |
| **G-5** | **已闭合**：服务面名 `lookupConverter`、三支结果 `{ registered } \| { unregistered } \| { unavailable }`（D-060 §S17 S17-b），见 [S-19](#s-19-查登记-lookupconverter)；工具结果端的判定由资产注册表调它 | — | — |
| **G-6** | **存储未定义**（`data.content-blocks` v2 的 [G-1](../../../data/content-blocks/v2/contract.md#八已知缺口)）：转换件以 `tenant` 读引用所指的字节、写派生块的字节，由谁在哪里判定能不能读写；被否决消息的派生块字节留存多久 | PF-006 的 owner（同 content-blocks G-1） | content-blocks G-1 闭合；本契约 [S-18](#s-18-转换一个块-convert) ① 与 [S-28](#s-28-替换与撤除时在途的转换) 引用它的答案 |
| **G-7** | **已闭合**：`SystemMessage` 不落日志、本版系统提示词只有文本（PF-009 §4、PF-010；D-060 §S17 S17-f），不落日志的系统提示词里没有非文本块 | — | — |
| **G-8** | **「从日志算一个投影」的通用协议**：[PF-015](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#第一件会话睡一觉醒来还得是原来那个) 要求它从第一天起是一套协议、加第二个投影时第一个不用改；本契约只定这一个投影的折叠式与可分解律 | PF-015 的 owner 与架构 | 有契约拥有那套协议；本契约的 [S-5](#s-5-模态投影是对会话日志的一次折叠)／[S-6](#s-6-只增不减可以逐条并进去重算必得同一答案) 作为它的一个实例被引用，定义不变 |
| **G-9** | **已闭合**：起草前形状草稿里的 `ModalityProjection { present, withTranscript }` 作废，投影就是一个集合（[S-5](#s-5-模态投影是对会话日志的一次折叠)）；`capability.model-request-runtime` v2 按集合引用 | — | — |

---

## 十二、消费者核对

本节不新增承诺，只走一遍具名消费者的路径，核对本契约给的面是否够用。**发现不够用时回到本契约补条款，不在消费者那边自己算一份。**

| 消费者 | 它要什么 | 本契约给什么 | 够不够 |
|---|---|---|---|
| **模型请求运行时算合法目标**（[PF-013 §5.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事)） | 这个会话此刻挡哪几种模态；一份档案过不过这一关 | [S-15](#s-15-读投影-project) 的定义 ＋ [S-6](#s-6-只增不减可以逐条并进去重算必得同一答案) 的可分解律（让它能增量维护）＋ [S-16](#s-16-兼容判定-compatible) | **够。**缓存、水位与「答得快」是它自己的；对它的两条义务在 [S-6](#s-6-只增不减可以逐条并进去重算必得同一答案) |
| **模型请求运行时出门前核有效模型**（[PF-013 §6.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#610-模态兼容挡在算合法目标那一刻不挡在出门那一刻) 两条剩下的路） | 选中／拓展件改出来的那个此刻还兼不兼容 | 同上；`blocked` 非空时成因是 `modality_mismatch`（成因归它） | **够** |
| **展示列表**（「模态对不上」那一行） | 这个模型读不了这个会话里的哪几种 | [S-16](#s-16-兼容判定-compatible) 的 `blocked` | **够** |
| **系统自带的模态转换那一件**（经执行器调度） | 一条消息该转哪几块、每块转成什么、转不成交回什么结论；以谁的租户身份读写附件字节 | [S-18](#s-18-转换一个块-convert)、[S-20](#s-20-一条消息在落盘之前的转换全有或全无)～[S-24](#s-24-转换件不发起模型调用)；`tenant` 经统一输入的执行环境句柄取（S-20 ②） | **够**；执行器与数据契约那三处已对齐（原 G-2 闭合）。否决之后按产生者分三路**不在本契约**；句柄解析出的租户身份来自会话持有租户的窄口接口契约 `capability.session-tenancy/v2#S-8`（经 `capability.loop-extension-runner/v2#S-50` 第 1 条；接口已定、真承接者未到，那份 runner 的 G-20）。**产品装配里那一写还没有写入方**（`capability.session-tenancy` 的 G-2），含要转的块的消息因此一律「句柄解析不出租户」、按 S-20 ② 否决 |
| **执行器的系统自带件「不可用」处置表** | 转换这一侧不可用时，哪些消息该否决 | [S-21](#s-21-转换件不可用即转换失败) 的表 ＋ [S-22](#s-22-没有转换件输入的消息不依赖转换这一侧)：只否决含要转的块的 | **够** |
| **资产注册表的可用性重算**——工具**结果那一端**（[PF-006 §6.11](../../../../product/PF-006-tools-and-skills/design.md#两端的差别在候选提供者不在规则)） | 工具声明的每一种结果模态 `m`，有效模型收不收得下，或者有没有转换件兜底 | 对每个 `m`：`m ∈ inputModalities`（档案数据），否则 `lookupConverter({modality: m})`（[S-19](#s-19-查登记-lookupconverter)）——`{ registered }` 即满足，`{ unregistered }` 或 `{ unavailable }` 即这一项不满足（只有且只有必需，**答不出不当满足**） | **够**（服务面名已定，原 G-5 闭合；注册表那一侧的对应条款见 `capability.asset-registry` v2）。**只用 [S-16](#s-16-兼容判定-compatible) 不够**：它不知道转换件 |
| **资产注册表的可用性重算**——工具**调用那一端** | 有效模型给不给得出参数里的模态 | **本契约不给**：只有有效模型自己满足得了（PF-006 §6.11），`outputModalities ⊇ needs.inputModalities` 是两份数据之间的包含，注册表自己比 | **不需要本契约** |
| **换模型之后哪些工具还在**（[PF-006 §6.11](../../../../product/PF-006-tools-and-skills/design.md#它同时决定了换模型之后哪些工具还在)） | 上面两端对新的有效模型重算一遍 | 同上两行 | **够**；重算的时机与替换件归注册表 |
| **PF-010 组装** | 一个块取原件、取哪份派生表示、还是取 transcript | **本契约不是它的输入**：它读块上的派生属性（`data.content-blocks` v2）。本契约给它的是一条**保证**——有效模型是合法目标时，它读不了的每一块都带着 transcript（[S-21](#s-21-转换件不可用即转换失败)），所以不会遇到「收不下又没有兜底」 | **够**。**把「组装（PF-010 读投影）」列为投影消费者的读法，与 [PF-013 §4](../../../../product/PF-013-model-profiles-and-invocation/design.md#模态投影)「它只为一件事服务：算合法目标」、[PF-015 §5.5](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#55-哪些算-meta-runtime-context)「会话内的三个角色都不消费它」不符**，本契约按产品正文写 |
| **系统装配层** | 把它的一整份转换件声明交进来 | [S-17](#s-17-声明转换件-declareconverters)、[S-9](#s-9-登记表同键一件登记是系统装配层的声明) | **够**；一份声明整份原子替换，没有单独的「登记完」一步（[S-17](#s-17-声明转换件-declareconverters) ④） |
| **一件转换件的实现（提供者）** | 它交回什么才算合法 | [S-11](#s-11-一次合法的转换产出)、[S-24](#s-24-转换件不发起模型调用) | **够** |
| **会话恢复**（[PF-015「会话睡一觉醒来」](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#第一件会话睡一觉醒来还得是原来那个)） | 醒来之后投影仍是原来那个 | [S-6](#s-6-只增不减可以逐条并进去重算必得同一答案)：它是日志的函数，从日志重算即得 | **够** |

---

## 十三、版本差异与规范工件

**本版是首版**，没有被采用的旧版本，因此没有语义或表示差异可记，也没有消费者迁移；`registry/lineage.json` 不因本契约增加条目。

**起草当日按主线两次更正修订**（2026-09-23，未冻结，原地改）：转换件站位改为 `before_persist_message`；投影照 PF-013 §4 原话定义、只计给模型看的块、是纯函数；
`convert` 不带目标模态；工具两端移出；登记表同键重复登记 `keyTaken`；失败值收窄；转换件不得发起模型调用。
**第一轮独立评审处置**（2026-09-24，未冻结，原地改）：逐键登记改为整份声明 [`declareConverters`](#s-17-声明转换件-declareconverters)（没有单独的「登记完」）；「要转的块」统一为「给模型看、还没带派生属性的」；依据改链到产品正文与 D-060。影响都记在[验证入口](../verification.md#变化的影响)。

**本版的规范工件**：本文件与 [`examples.md`](examples.md)。接受状态、冻结记录与执行结果都在本版本目录之外维护，本文件不填进度、通过状态或哈希。

**发布后**：本目录下的规范正文与实例不可原地覆盖；修改发布新版本。[已知缺口](#十一已知缺口)任一项被裁决后，凡改变本契约语义的（例如 G-6 存储的答案改变了读写引用字节的前置），都出 **v2**，
**推荐版本不自动升级消费者**。
