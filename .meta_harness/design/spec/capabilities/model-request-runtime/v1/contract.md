# capability.model-request-runtime v1

> 候选规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.model-request-runtime, 1)`——
  `family = capabilities`、`topic = model-request-runtime`、规范路径 `spec/capabilities/model-request-runtime/v1/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：`candidate`（2026-09-23 起草）——未经独立评审、未接受、未冻结
- **设计依据**：见[下一节](#设计依据)。产品依据以 **PF-013 rev 11** 为准（rev 5–11 全文待产品负责人确认；rev 11 只动转换件呈现的落点——P40，落在 PF-016 §6.21——不影响本契约条款），另引 PF-012 rev 10、PF-009 rev 7、PF-004 rev 10、PF-001 rev 16、PF-015 rev 11
- **精确语义依赖**（消费 clauses 见 [S-4](#s-4-依赖方向与被消费的面)，catalog 按它登记）：
  - `omne-harness-lite-design-2026-09-15 · capability.model-profile-directory · v1`（candidate）
  - `omne-harness-lite-design-2026-09-15 · data.model-profile · v1`（candidate）
  - `omne-harness-lite-design-2026-09-15 · data.model-response · v1`（candidate）
  - `omne-harness-lite-design-2026-09-15 · data.loop-extension · v1`（candidate）
  - `omne-harness-lite-design-2026-09-15 · data.call-accounts · v1`（candidate）
  - `omne-harness-lite-design-2026-09-15 · data.content-blocks · v1`（candidate）
  - `omne-harness-lite-design-2026-09-15 · data.messages · v1`（candidate）
  - `omne-harness-lite-design-2026-09-15 · data.tool-definition · v1`（candidate）
  - `omne-harness-lite-design-2026-09-15 · data.identity-values · v1`（accepted）
  - `omne-harness-lite-design-2026-09-15 · data.offer-expiry · v1`（accepted，只取时间点 `Instant`）
  - `omne-harness-lite-design-2026-09-15 · capability.stream-assembly · v1`（candidate）
  - `omne-harness-lite-design-2026-09-15 · capability.modality-projection · v1`（candidate）
  - `omne-harness-lite-design-2026-09-15 · capability.asset-evaluation · v1`（candidate）——「用哪个模型」这项设置与「这个范围允许哪几条档案」的求值
  - 以上三份在 2026-09-24 整批对齐登记进 catalog（原 G-14）。`data.arrival-events` v1 与 `capability.loop-extension-runner` v1 只是指路（到达事件的语法归前者；被拒的 `retry` 怎样记下、系统自带重试件不可用怎样关门归后者），本契约不据以写出任何承诺，不登依赖——**runner 反过来消费本契约的合法目标与再发守卫**，登这一条会成环
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如
  `capability.model-request-runtime/v1#S-30`；缺口 `G-n` 同理。编号在本版本内只追加、不重排

## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| 一次模型调用：三个终态、生灭 | [UL-model-call](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call) · [PF-013 flows §3.2](../../../../product/PF-013-model-profiles-and-invocation/flows.md#32-一次模型调用) | S-5、S-6 |
| 三类事实归本层定死，其余照状态码；「已经开口」优先 | [PF-013 §5.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#54-三类事实归本层定死其余照状态码) · [已经开口说话了优先于其余各类](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类) | S-16、S-18、S-30 |
| 用户中断不是故障 | [还有一种没走完](../../../../product/PF-013-model-profiles-and-invocation/design.md#还有一种没走完它不在这张表里) | S-31 |
| 每一次发出只走一家；试过又失败的留痕 | [PF-013 §5.5](../../../../product/PF-013-model-profiles-and-invocation/design.md#55-上交交给谁看模型说没说出话) · [试过又失败的那几次](../../../../product/PF-013-model-profiles-and-invocation/design.md#试过又失败的那几次留痕不进方程) | S-22、S-38 |
| 凭据只在租户层：这个租户发起的调用都用他那一把，不管档案建在哪一层；出厂格那一把只供官方档案 | [PF-013 §5.6](../../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上) · [§6.2](../../../../product/PF-013-model-profiles-and-invocation/design.md#62-凭据挂在范围上档案自己不存) · [decisions P33、P34](../../../../product/PF-013-model-profiles-and-invocation/decisions.md#rev-10-随裁决-3338-推出的2026-09-24) | S-12、S-19、S-28 |
| 官方与自建在同一份列表里，每一条标着来源（官方 / 自建，自建的再带建在哪一层）；同一个路由名可以出现不止一次；**同名的几条在运行时按层覆盖，租户 > 组织 > 官方**（产品负责人 2026-09-24 裁定：「允许并存，它就像资产一样，路由名就是能力，从下往上（租户 -> 组织 -> official）在运行时覆盖」；PF-013 rev 12 将补进 §4「档案的身份」，锚点不变） | [PF-013 §6.3](../../../../product/PF-013-model-profiles-and-invocation/design.md#63-官方与自建在同一份列表里) · [§5.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事) · [§4 档案的身份](../../../../product/PF-013-model-profiles-and-invocation/design.md#档案的身份所在范围加路由名) | S-10、S-11、S-12、S-25、S-26、S-28 |
| 已撤回的可以恢复在册；指着它的会话不用换就接得上 | [PF-013 §6.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#64-撤回不删行会话指向被撤回的档案时说已下架) · [flows §1.4](../../../../product/PF-013-model-profiles-and-invocation/flows.md#14-走一遍选中的模型被下架了) 第 6′ 步 | S-9、S-12 |
| 上交带八个成因与原样状态码 | [PF-013 §5.7](../../../../product/PF-013-model-profiles-and-invocation/design.md#57-上交带什么原样带着状态码不翻译它) · [§6.11](../../../../product/PF-013-model-profiles-and-invocation/design.md#611-成因在这个边界上分类不丢进外层按异常形态分) · [§6.14](../../../../product/PF-013-model-profiles-and-invocation/design.md#614-上交带的成因是封闭枚举外加一个诚实的兜底状态码另外原样带着) | S-18 |
| 换模型：一条事实、一个生效点、零个新分支 | [PF-013 §5.9](../../../../product/PF-013-model-profiles-and-invocation/design.md#59-换模型一条事实一个生效点零个新分支) · [§6.5](../../../../product/PF-013-model-profiles-and-invocation/design.md#65-切换是用户的直接命令合法目标不得拒绝)～[§6.8](../../../../product/PF-013-model-profiles-and-invocation/design.md#68-不为切换新增分支) · [flows §3.3](../../../../product/PF-013-model-profiles-and-invocation/flows.md#33-一个会话的选中模型) | S-9、S-27 |
| 选中模型与有效模型 | [PF-013 §4](../../../../product/PF-013-model-profiles-and-invocation/design.md#选中模型-与-有效模型) · [PF-004 §6.6](../../../../product/PF-004-agent-definition-and-assembly/design.md#66-模型在每次请求时确定) | S-9、S-10、S-26 |
| 合法目标集合与展示列表是两件事；算不出来不替用户改选；模态挡在这一刻 | [PF-013 §5.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事) · [§5.11](../../../../product/PF-013-model-profiles-and-invocation/design.md#511-有-transcript-的块不再把任何模型挡在外面) · [§6.9](../../../../product/PF-013-model-profiles-and-invocation/design.md#69-合法目标算不出来时不替用户改选) · [§6.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#610-模态兼容挡在算合法目标那一刻不挡在出门那一刻) | S-11、S-12、S-24、S-25 |
| 重试站在已有的位置上；默认件；它改不动的三件事 | [PF-013 §5.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#512-重试站在一个已经存在的位置上) · [§6.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#612-事实判断归本-topic策略归拓展件) · [§6.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#613-试尽由拓展件判定档案的两项声明是它的输入) · [什么时候算试尽](../../../../product/PF-013-model-profiles-and-invocation/design.md#什么时候算试尽) | S-30、S-35 |
| 单独控制；停机看首 token；只有一个宿主 | [PF-013 §5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token) · [停机之后](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token) · [它只有一个宿主](../../../../product/PF-013-model-profiles-and-invocation/design.md#它只有一个宿主所以只有一种结局) | S-15、S-31、S-33、S-36 |
| 脱敏 | [PF-013 §6.16](../../../../product/PF-013-model-profiles-and-invocation/design.md#616-错误信息外泄之前要脱敏) | S-20 |
| 本 topic 不出现任何时限数值 | [PF-013 §6.17](../../../../product/PF-013-model-profiles-and-invocation/design.md#617-本-topic-不出现任何时限数值) | S-21 |
| 模态投影要答得快、增量维护 | [PF-013 §6.18](../../../../product/PF-013-model-profiles-and-invocation/design.md#618-模态投影要答得快而且是增量维护出来的) · [flows §3.4](../../../../product/PF-013-model-profiles-and-invocation/flows.md#34-一个会话的模态投影) | S-13 |
| 「等模型」是 loop 的等待；先对账再进方程 | [PF-012 等人是 loop 的原语](../../../../product/PF-012-agent-loop-and-run/design.md#等人是-loop-的原语) · [先对账，再进方程](../../../../product/PF-012-agent-loop-and-run/design.md#先对账再进方程) | S-15、S-33 |
| 取消跟着宿主走；取消先落日志再发信号 | [PF-012 §6.13](../../../../product/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走) · [§6.15](../../../../product/PF-012-agent-loop-and-run/design.md#615-取消先落日志再发信号) | S-31、S-36 |
| 成本两层；挂件自己花的钱 | [PF-012 成本两层](../../../../product/PF-012-agent-loop-and-run/design.md#成本两层缺哪一层都会算错) · [挂件自己花的钱](../../../../product/PF-012-agent-loop-and-run/design.md#挂件自己花的钱算它插手的那个-run) | S-5、S-17 |
| 流断在半路；用户看见了的日志里必须有 | [PF-009 §5.6](../../../../product/PF-009-context-message-types/design.md#56-流断在半路) · [§6.9](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有) | S-15、S-29 |
| 会话持有创建那一刻的租户身份；成本算到发起它的租户 | [PF-015 §6.12](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#612-会话持有创建那一刻的租户身份) · [PF-001 §6.4](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) | S-7、S-19 |
| 所有模型请求经 OpenRouter；单机交付可拆 | [SYS-LLM](../../../../foundation/cross-system-constraints/requirements.md#sys-llm) · [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) | S-38 |
| 传输选 pi-ai 定向 fork | [D-019](../../../../record/decisions/model-provider-pi-ai-fork/decision.md) | S-38 |
| 统一语言 | [一次模型调用](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call) · [模型档案](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-profile--模型档案--model-profile) · [模型凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential) · [选中模型](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-selected-model--选中模型--selected-model) · [有效模型](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-effective-model--有效模型--effective-model) · [模态](../../../../ubiquitous_language/terms/record-and-context.md#ul-modality--模态--modality) · [模态投影](../../../../ubiquitous_language/terms/record-and-context.md#ul-modality-projection--模态投影--modality-projection) · [非常态](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-off-nominal--非常态--off-nominal) · [上交](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-escalation--上交--escalation) · [调用账目](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-call-account--调用账目--call-account) · [附件](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-attachment--附件--attachment) · [模型请求参数](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-request-parameters--模型请求参数--model-request-parameters) · [agent runtime](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-agent-runtime--agent-runtime--agent-runtime) · [会话日志](../../../../ubiquitous_language/terms/record-and-context.md#ul-session-log--会话日志--session-log) · [会话据点](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-session-base--会话据点--session-base) | 全部正式名 |

> **这张表里没有产品行的条款**（来源是施工简报与对账产物转述的主线裁定，决定记录尚未落进设计链——[G-13](#十二已知缺口)）：
>
> | 条款 | 依据 |
> |---|---|
> | 本契约住在据点侧、与中心侧档案目录拆成两份；一次调用是宿主上的一段受管工作而不是独立的生命单元 | 主线 2026-09-23 按块 C 机制读数修订施工简报；对账 D 结论 |
> | [S-8](#s-8-调用在会话日志里留下的六种记录) 两个锚点及其次序、[S-33](#s-33-reconcile) 三行对账表 | 主线裁定 C-2；对账 D SAF-03、LIV-05、LIV-06 |
> | [S-5](#s-5-一次调用一次发出) 调用跨尝试延续、发出序号跨尝试连续、尝试号属于每次发出 | 主线裁定 U-11 与 2026-09-23 补充 |
> | [S-11](#s-11-合法目标集合) 合法目标多一个输入「本据点传输能承载的模态」 | 主线 2026-09-23 补充（RP-12） |
> | [S-19](#s-19-凭据每次发出现取取值只交给传输适配) 账上分记凭据所在那一格与发起者 | 主线裁定 C-12（取哪一把已有产品行：PF-013 rev 10 §5.6 与 decisions P33、P34；原 C-12 的「否则组织层」随裁决 33 删去） |
> | [S-10](#s-10-有效模型四步每步来源可查) 四步；[S-9](#s-9-选中模型) 初值来自设置求值 | 主线裁定 C-10、C-11 |
> | [S-21](#s-21-两个时限是运行时设置项) 时限是运行时设置项 | RP-5 |
> | [S-17](#s-17-结算一处按序幂等先到者赢) 结算写入不受尝试栅栏拒收 | RP-9 |
> | [S-5](#s-5-一次调用一次发出) 挂件、压缩闭包、旁路提问里的调用同样适用；宿主恒为 agent runtime；不属于任何 Run 的归会话 | 主线裁定 C-14 |
> | [S-28](#s-28-opencall) 出门前检查核有效模型，失败记 `undispatched{cause}` | RP-25 |
> | [S-31](#s-31-interrupt) `initiator` 三值 | RP-24 |

---

## 一、含义与使用范围

### S-1 本契约拥有什么

**会话据点上，一个会话怎样选模型、每一次[模型调用](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call)怎样发出、怎样收场、停机之后怎样对账。**

> **名字的说明**：统一语言里「模型请求运行时」指**执行某一次调用的那一段**，与那次调用同生同灭（UL-model-call 注意 ②）。
> 本契约的 topic 沿用这个词，**拥有的是承载全部调用的那一项能力**；正文里「一次调用」一律指 UL-model-call，不用「运行时」指单次调用。

| # | 拥有的事实或判定 | 正文 |
|---|---|---|
| 1 | **会话的[选中模型](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-selected-model--选中模型--selected-model)**：切换事实怎样写、选中模型怎样从日志读出 | [S-9](#s-9-选中模型)、[S-27](#s-27-selectmodel) |
| 2 | **[有效模型](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-effective-model--有效模型--effective-model)的求值**：四步、每步来源可查 | [S-10](#s-10-有效模型四步每步来源可查)、[S-26](#s-26-effectivemodel) |
| 3 | **合法目标集合与展示列表**的求值 | [S-11](#s-11-合法目标集合)、[S-12](#s-12-展示列表)、[S-24](#s-24-legaltargets)、[S-25](#s-25-displaylist) |
| 4 | **会话模态投影的读**：权威在日志，读到的必须追到日志尾 | [S-13](#s-13-模态投影读到的必须追到日志尾) |
| 5 | **一次调用的状态、每一次发出、每一次发出的收场**，以及调用在会话日志里留下的那几种记录 | [S-5](#s-5-一次调用一次发出)～[S-8](#s-8-调用在会话日志里留下的六种记录)、[S-28](#s-28-opencall)～[S-32](#s-32-releasecall) |
| 6 | **三类事实的兑现**：发不出去、重试没用、已经开口——由发出守卫兑现，任何拓展件推翻不了 | [S-18](#s-18-成因按来源分类三类事实由守卫兑现)、[S-30](#s-30-dispatchagain) |
| 7 | **首 token 判据与两个锚点的次序** | [S-15](#s-15-两个锚点先写后行)、[S-16](#s-16-首-token-判据) |
| 8 | **中断**：只作用于一次调用，先落意图再中止 | [S-31](#s-31-interrupt) |
| 9 | **停机之后的对账**：按锚点与响应体决定追补什么、能不能再发 | [S-33](#s-33-reconcile) |
| 10 | **成因分类、凭据现取、脱敏** | [S-18](#s-18-成因按来源分类三类事实由守卫兑现)～[S-20](#s-20-写入之前脱敏) |
| 11 | **系统自带的默认重试件**的行为（可替换） | [S-35](#s-35-默认重试件可替换) |

### S-2 本契约不拥有什么

| 不拥有 | 归谁 |
|---|---|
| 档案的登记、撤回、读面；凭据的绑定与取用规则 | `capability.model-profile-directory` v1（中心侧，本契约消费） |
| 响应体的形状、收场与其余成员的条件关系、同一次调用的响应体序列 | `data.model-response` v1（本契约是它的写入者之一） |
| 成因的名字与定义（`FailureCause`）、`select_model`／`retry` 结论的形状与义务 | `data.loop-extension` v1 |
| 账的形状、三个归属标识的表示 | `data.call-accounts` v1 |
| 到达事件的语法、流装配、首个内容何时算「交出」的装配器侧判据 | `data.arrival-events` v1、`capability.stream-assembly` v1（并行） |
| 模态投影的判定函数、模态兼容判定、转换件 | `capability.modality-projection` v1（本契约调它的 `project` 与 `compatible`） |
| 拓展件的执行、结论落日志、报错处置 | `capability.loop-extension-runner` v1 |
| 「用哪个模型」这项设置的层级求值、「这个范围允许哪几条档案」 | `capability.asset-evaluation` v1 |
| 上下文组装、请求里装了什么 | PF-010 组装 |
| 会话日志本身、追加口的栅栏与多条目原子追加 | 会话日志的拥有者（loop 那一程） |
| 传输实现（pi-ai 定向 fork 与适配） | 提供者设计；本契约只在 [S-38](#s-38-装配给的保证-vs-协议须给的保证) 写它须兑现的义务 |
| 线上形状（中心 ↔ 据点） | 把目录读面送过进程边界的组合契约（尚未立） |

### S-3 本契约明确不承诺什么

| 不承诺 | 由谁兑现 |
|---|---|
| **上交条目**的写入与形状 | loop（形状归 PF-011） |
| **中断提醒**的写入（`data.messages/v1#S-21`） | loop |
| **回复消息**的写入：带回复的那条响应体与它的消息由调用方在同一提交里写下 | loop ＋ 会话日志追加口（[S-17](#s-17-结算一处按序幂等先到者赢)、[S-38](#s-38-装配给的保证-vs-协议须给的保证)） |
| **组装**：这一次请求里装了什么、用了哪份派生表示 | PF-010 组装 |
| **会话日志**：追加口、尝试栅栏、全序 | 会话日志的拥有者 |
| **「一步之内至多一次模型调用」的判定**；挂件与压缩闭包里的调用算不算「这一步的那一次」 | loop |
| **自定义重试件的终止性**：它是否终将判「不再试」 | 不承诺（[S-35](#s-35-默认重试件可替换) 只对默认件承诺试尽） |
| **插队时中断哪些调用** | loop／PF-014（本契约的 `interrupt` 只作用于一个 `callId`） |
| **连续被否决的调用上限**：回复在落盘之前被否决之后，再试是 loop 另起的新调用 | loop |

### S-4 依赖方向与被消费的面

**依赖方向是单向的：本契约 → 档案目录、档案形状、响应体、拓展件、账、块、消息、工具定义、身份值、时间点。**
`capability.model-profile-directory` 不消费本契约。

**下表每个 `#S-n` 前缀省去了坐标 `omne-harness-lite-design-2026-09-15 · <contract_id> · v1`；catalog 的 `clauses` 以它为准。**

| 被消费的条款 | 用在哪 |
|---|---|
| `capability.model-profile-directory` `#S-6` 范围链 | [S-11](#s-11-合法目标集合) |
| `capability.model-profile-directory` `#S-16` readProfile（含已撤回行，三收场不折叠） | [S-10](#s-10-有效模型四步每步来源可查)、[S-12](#s-12-展示列表)、[S-28](#s-28-opencall) |
| `capability.model-profile-directory` `#S-17` listProfiles（每项带引用，同一个路由名可出现几次） | [S-11](#s-11-合法目标集合)、[S-12](#s-12-展示列表) |
| `capability.model-profile-directory` `#S-20` resolveCredential：以发起租户与档案来源取用、两种问法 | [S-12](#s-12-展示列表)、[S-19](#s-19-凭据每次发出现取取值只交给传输适配)、[S-28](#s-28-opencall) 出门前检查第 4 行 |
| `data.model-profile` `#S-5`、`#S-6` 允许的供应商及次序、允不允许回退 | [S-30](#s-30-dispatchagain)、[S-35](#s-35-默认重试件可替换) |
| `data.model-profile` `#S-7` 两组模态 | [S-11](#s-11-合法目标集合) |
| `data.model-profile` `#S-8` 两个上限 | [S-7](#s-7-一次调用绑定了什么) |
| `data.model-profile` `#S-4` 来源（官方 / 自建） | [S-12](#s-12-展示列表)（来源标注）、[S-19](#s-19-凭据每次发出现取取值只交给传输适配)（取用按来源） |
| `data.model-profile` `#S-10` 在册状态（两条转移：撤回、恢复在册） | [S-9](#s-9-选中模型)、[S-11](#s-11-合法目标集合)、[S-28](#s-28-opencall) |
| `data.model-profile` `#S-13`、`#S-14` 引用与精确解析 | 全部操作 |
| `data.model-profile` `#S-15`～`#S-18`、`#S-21` 请求参数词表、取值域、缺席即不带、输出上限、不静默丢也不静默改 | [S-7](#s-7-一次调用绑定了什么) |
| `data.model-profile` `#S-24`、`#S-25` 表示层校验、拒绝值闭合 | [S-14](#s-14-缺席时的默认答案与失败集合)、[S-28](#s-28-opencall) 出门前检查第 5 行 |
| `data.model-response` `#S-4` 一次调用、一次发出、一条响应体 | [S-5](#s-5-一次调用一次发出) |
| `data.model-response` `#S-6`～`#S-11` 标识、所属调用、第几次发出、路由留痕、有效模型怎么来的、参数与丢弃项 | [S-7](#s-7-一次调用绑定了什么)、[S-10](#s-10-有效模型四步每步来源可查)、[S-29](#s-29-dispatch) |
| `data.model-response` `#S-12`～`#S-16` 收场、条件关系、回复与已交付部分、成因与状态码、发出了的才有响应体 | [S-6](#s-6-调用的状态)、[S-18](#s-18-成因按来源分类三类事实由守卫兑现)、[S-29](#s-29-dispatch) |
| `data.model-response` `#S-17`、`#S-18` 首 token 与时序、缺席是断言 | [S-16](#s-16-首-token-判据)、[S-33](#s-33-reconcile) |
| `data.model-response` `#S-19`～`#S-22` 用量与费用、原始响应留存、写入之前脱敏、写下即不变 | [S-17](#s-17-结算一处按序幂等先到者赢)、[S-20](#s-20-写入之前脱敏) |
| `data.model-response` `#S-23`、`#S-24` 同一次调用的响应体序列、一条响应体对应上游一次请求 | [S-22](#s-22-同一次调用的发出序列)、[S-38](#s-38-装配给的保证-vs-协议须给的保证) |
| `data.loop-extension` `#S-1` 位置（`before_model_call`、`after_model_call`） | [S-10](#s-10-有效模型四步每步来源可查)、[S-35](#s-35-默认重试件可替换) |
| `data.loop-extension` `#S-15` ModelRequest 三个成员 | [S-28](#s-28-opencall) |
| `data.loop-extension` `#S-17` FailureCause 八值与各属哪一类 | [S-18](#s-18-成因按来源分类三类事实由守卫兑现) |
| `data.loop-extension` `#S-24` select_model 的义务 | [S-10](#s-10-有效模型四步每步来源可查)、[S-28](#s-28-opencall) |
| `data.loop-extension` `#S-27` retry 的计划与义务 | [S-30](#s-30-dispatchagain)、[S-35](#s-35-默认重试件可替换) |
| `data.call-accounts` `#S-19`、`#S-20` 两次发出两份账、缺账记未知 | [S-17](#s-17-结算一处按序幂等先到者赢)、[S-33](#s-33-reconcile) |
| `data.call-accounts` `#S-37` RunId、AttemptId、ModelCallId 的表示；ModelCallId 由本能力产生 | [S-5](#s-5-一次调用一次发出)、[S-28](#s-28-opencall) |
| `data.content-blocks` `#S-6` 模态由媒体类型判定 | [S-13](#s-13-模态投影读到的必须追到日志尾) |
| `data.content-blocks` `#S-13` 半截的工具调用 | [S-29](#s-29-dispatch) |
| `data.content-blocks` `#S-21` AttachmentRef | [S-20](#s-20-写入之前脱敏) |
| `data.messages` `#S-9`、`#S-10` AssistantMessage 与它的三种收尾 | [S-29](#s-29-dispatch) |
| `data.messages` `#S-35`、`#S-36` 我们自己那两种在发出前译掉、ToolInternalMessage 不进请求 | [S-38](#s-38-装配给的保证-vs-协议须给的保证) |
| `data.tool-definition` `#S-6` 模型面只有一个条目 | [S-28](#s-28-opencall) |
| `data.tool-definition` `#S-14` 时长的表示 | [S-21](#s-21-两个时限是运行时设置项)、[S-30](#s-30-dispatchagain) |
| `data.identity-values` `#S-5` TenantId | [S-7](#s-7-一次调用绑定了什么)、[S-19](#s-19-凭据每次发出现取取值只交给传输适配) |
| `data.identity-values` `#S-17`～`#S-19` 身份参数没有默认值、缺席即拒绝、不可用即明确失败 | [S-14](#s-14-缺席时的默认答案与失败集合) |
| `data.identity-values` `#S-28` 当前租户身份在创建那一刻捕获 | [S-7](#s-7-一次调用绑定了什么) |
| `data.identity-values` `#S-30` 跨边界须重新验证 | [S-38](#s-38-装配给的保证-vs-协议须给的保证) |
| `data.identity-values` `#S-31` 不透明标识的交换表示 | [S-5](#s-5-一次调用一次发出) |
| `data.identity-values` `#S-32`、`#S-33` 判别式闭合、表示层校验与判定分开 | [S-14](#s-14-缺席时的默认答案与失败集合) |
| `data.offer-expiry` `#S-22` 时间点 | [S-8](#s-8-调用在会话日志里留下的六种记录) |
| `data.model-response` `#S-9` 路由留痕（`profileSnapshot`、`credentialScope`）、`#S-12`、`#S-13` 收场三方发起者与条件表 | [S-7](#s-7-一次调用绑定了什么)、[S-19](#s-19-凭据每次发出现取取值只交给传输适配)、[S-31](#s-31-interrupt)、[S-33](#s-33-reconcile) |
| `data.model-profile` `#S-27` 档案快照 `ModelProfileSnapshot` | [S-7](#s-7-一次调用绑定了什么) |
| `data.call-accounts` `#S-38` 两种归属（用量归凭据那一格、成本归发起者）、`#S-39` 晚到的账 | [S-17](#s-17-结算一处按序幂等先到者赢)、[S-19](#s-19-凭据每次发出现取取值只交给传输适配) |
| `data.messages` `#S-49`、`#S-50` 本能力写的五种记录的形状（`ModelInvocationRecord`）与调用终结的三支 | [S-8](#s-8-调用在会话日志里留下的六种记录) |
| `data.content-blocks` `#S-20` `CapabilityId`（`ModelCallRequest.tools` 与 `targetChangedBy`） | [S-28](#s-28-opencall) |
| `capability.stream-assembly` `#S-16` 首个内容的位置 | [S-16](#s-16-首-token-判据) |
| `capability.modality-projection` `#S-15` 读投影、`#S-16` 兼容判定 | [S-11](#s-11-合法目标集合)、[S-13](#s-13-模态投影读到的必须追到日志尾) |
| `capability.asset-evaluation` `#S-8` 求值结果、`#S-22` 设置、`#S-23` 权限 | [S-9](#s-9-选中模型)、[S-10](#s-10-有效模型四步每步来源可查)、[S-11](#s-11-合法目标集合) |

---

## 二、概念、身份与必要状态

### S-5 一次调用、一次发出

**一次调用有 0 到多次发出；每一次发出只走一家，恰留一条响应体**（`data.model-response/v1#S-4`）。

- **`callId`**（`ModelCallId`）**由本能力在打开一次新调用时产生**（`data.call-accounts/v1#S-37`），运行内唯一、不回收不复用，交换表示按 `data.identity-values/v1#S-31`。
- **调用跨尝试延续**：执行尝试换了（停机之后新的一次尝试接着推），**同一次调用的身份不变**；首 token 之前失联的那次调用在新尝试里**以同一个 `callId` 接着发**（[S-33](#s-33-reconcile) 第一行），不是另起一次新调用。
- **发出序号属于调用、跨尝试连续**：同一次调用的第 n 次发出，不论落在哪次尝试，都是第 n 次；从 1 起、逐次加一、不重不跳（`data.model-response/v1#S-8`）。
- **尝试号属于每一次发出，不属于调用**：每一次发出记下它**落在哪一次尝试里**。一次调用的几次发出可以落在不同尝试里。
  `attemptId` 在响应体的每一次发出上，不在 `call` 里（`data.model-response/v1#S-7`、`#S-8`；原 G-1 在整批对齐闭合）。
- **不属于任何 Run 的调用**（挂件、压缩闭包、旁路提问之外，由会话本身发起的调用，主线裁定 C-14）：它属于会话；本契约对它一视同仁，只是它不带 Run 与尝试（[S-28](#s-28-opencall) ①）。
  **挂件、压缩闭包、旁路提问里发起的调用一律适用本契约，宿主恒为 [agent runtime](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-agent-runtime--agent-runtime--agent-runtime)**；它们花的钱算它插手的那个 Run（[PF-012](../../../../product/PF-012-agent-loop-and-run/design.md#挂件自己花的钱算它插手的那个-run)）。

### S-6 调用的状态

**一次调用恰处在下列一个状态；三个终态吸收，终态之间不互转。**

| 状态 | 含义 | 怎样进来 |
|---|---|---|
| `open` | 已打开、过了出门前检查、还没发出过 | [S-28](#s-28-opencall) |
| `in_flight` | 一次发出已出门（「已出门」已写下），还没开口 | [S-29](#s-29-dispatch)、[S-30](#s-30-dispatchagain) |
| `speaking` | 这次发出已开口（「已开口」已写下） | [S-16](#s-16-首-token-判据) |
| `awaiting_decision` | 最近一次发出以故障收场，响应体已写下；**等 loop 决定再发还是放手** | [S-29](#s-29-dispatch)、[S-33](#s-33-reconcile) |
| `resumable` | 最近一次发出在首 token 之前失去连续性，已追补结算；**可以在同一次调用下再发** | [S-33](#s-33-reconcile) 第一行 |
| **`complete`**（终态：完整一份） | 最后一次发出以 `complete` 或 `truncated` 收场——**含回复在落盘之前被否决**（`data.model-response/v1#S-12`） | [S-29](#s-29-dispatch) |
| **`handed_up`**（终态：上交） | 出门前检查不过（`undispatched{cause}`），或 loop 在一次故障之后放手 | [S-28](#s-28-opencall)、[S-32](#s-32-releasecall) |
| **`interrupted`**（终态：被中断） | 用户中断、宿主取消，或首 token 之后失去连续性（`initiator = runtime_lost`） | [S-31](#s-31-interrupt)、[S-33](#s-33-reconcile)、[S-36](#s-36-宿主停止与撤除) |

- **终态恰三个**，与 [UL-model-call](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call) 一致；`undispatched{cause}` 是上交的子形，`interrupted{runtime_lost}` 是被中断的子形，**不是第四、第五终态**。
- **没有「说话中 → 在途」这条转移**：开口之后这次调用不会再有下一次发出（[S-22](#s-22-同一次调用的发出序列)）。
- **状态不另存为权威**：终态与「已开口」由会话日志里的记录判出（[S-8](#s-8-调用在会话日志里留下的六种记录)）；本能力手里的在途状态只活到进程还在为止，停机之后以日志为准（[S-33](#s-33-reconcile)）。

### S-7 一次调用绑定了什么

**打开一次调用时绑定下列各项，此后这次调用的每一次发出都用同一份：**

| 绑定 | 从哪来 | 为什么要绑 |
|---|---|---|
| **有效模型**（一个 `ModelProfileRef`）及它怎么来的 | [S-10](#s-10-有效模型四步每步来源可查) | 选中模型之后切换不作用于在途调用（[PF-013 §6.7](../../../../product/PF-013-model-profiles-and-invocation/design.md#67-生效点收到那条事实之后下一次模型请求之前)） |
| **档案快照**：那条档案在打开这一刻的、发出与重试要用到的属性（允许的供应商及次序、允不允许回退、两个上限、两组模态、`parameters`、`updatedAt`） | `capability.model-profile-directory/v1#S-16` 的一次读 | 一次调用内各次发出**按同一份档案准备、按同一份发出**；档案后来被改或被撤回，不改在途调用 |
| **合并后的请求参数**：档案 `parameters` 逐项被本次覆盖替换，**合并之后**再按档案的输出上限校验（`data.model-profile/v1#S-18`） | 档案快照 ＋ `parameters` | 响应体 `route.parameters` 记的就是它（`data.model-response/v1#S-11`） |
| **发起租户**（`TenantId`）：会话在创建那一刻持有的租户身份 | 会话（[PF-015 §6.12](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#612-会话持有创建那一刻的租户身份)、`data.identity-values/v1#S-28`） | 凭据取哪一把、账算到谁头上（[S-19](#s-19-凭据每次发出现取取值只交给传输适配)） |
| **宿主**（这次调用挂在哪一个 agent runtime 上）与**会话日志的追加入口** | 调用方 | 调用随宿主停（[S-36](#s-36-宿主停止与撤除)）；六种记录写到哪（[S-8](#s-8-调用在会话日志里留下的六种记录)） |

- **档案快照落在响应体上**：`data.model-response/v1#S-9` 的 `route.profileSnapshot`（形状是 `data.model-profile/v1#S-27` 的 `ModelProfileSnapshot`；档案不另有修订身份），本契约把绑定的那一份写进去。
- **凭据不绑**：每一次发出现取（[S-19](#s-19-凭据每次发出现取取值只交给传输适配)）。

### S-8 调用在会话日志里留下的六种记录

**本能力经宿主给出的追加入口，往会话日志里写下列记录；每一种都在它要保护的那件事发生之前写下。**
响应体之外的五种记录，**形状归 `data.messages/v1` 的 [S-49](../../../data/messages/v1/contract.md#s-49-模型请求运行时写的五种记录不是消息)、[S-50](../../../data/messages/v1/contract.md#s-50-调用终结的三支)**（`ModelInvocationRecord`：不是消息，只供对账读；主线裁定 2026-09-23，待产品负责人确认，账本 S16-d；原 G-2）；本条定义它们**各自必须能回答什么、何时写、谁写**。「已出门」「已开口」「中断意图」「调用终结」无词条；「切换事实」的词条由词条批立（链接待合流后补）。

| 记录 | 必须能回答 | 何时写 | 谁写 |
|---|---|---|---|
| **已出门** | 哪次调用的第几次发出、落在哪次尝试、发给哪一家、这次发出的 `ResponseId` | 这一次请求**离开本进程之前**（[S-15](#s-15-两个锚点先写后行)） | 本能力 |
| **已开口** | 哪次调用的第几次发出、观察到首 token 的时刻 | 首个内容**交给任何观察者之前**（[S-15](#s-15-两个锚点先写后行)） | 本能力 |
| **中断意图** | 哪次调用、谁发起（`user` ／ `run_cancelled`） | 发出中止信号**之前**（[S-31](#s-31-interrupt)） | 本能力 |
| **响应体**（`data.model-response`） | 见那份契约 | 一次发出收场时 | **带回复的由调用方与回复消息同一提交写；其余由本能力写**（[S-17](#s-17-结算一处按序幂等先到者赢)） |
| **调用终结** | 哪次调用、以哪个终态结束、`undispatched` 时的成因 | 调用不经响应体进入终态时：出门前检查不过、在两次发出之间被中断、loop 放手 | 本能力 |
| **切换事实**（`SelectionFact`） | 哪个会话、切到哪条档案、谁、何时（`data.offer-expiry/v1#S-22` 的时间点） | 切换**生效之前**（[S-27](#s-27-selectmodel)） | 本能力 |

- **`ResponseId` 在「已出门」那一刻就定下**，此后这次发出的任何结算都用它（[S-17](#s-17-结算一处按序幂等先到者赢)）——这使「同一次发出至多一条响应体」可以按标识判重。
- **两个锚点不是响应体**：它们不带收场、不带账；响应体写下之后它们仍在，**供对账读，不供任何视图呈现**。

### S-9 选中模型

**选中模型 = 这个会话日志里最后一条切换事实指的那条档案；一条切换事实都没有时，= 「用哪个模型」这项设置在会话格上的层级求值结果**（主线裁定 C-11；那项求值归 `capability.asset-evaluation` v1 的 [S-22](../../asset-evaluation/v1/contract.md#s-22-第四步设置)）。

- **只因切换而变**（[PF-013 flows §3.3](../../../../product/PF-013-model-profiles-and-invocation/flows.md#33-一个会话的选中模型)）：拓展件的 `select_model` 只改那一次的有效模型，**不写切换事实**（`data.loop-extension/v1#S-24`）；agent 自己换不了。
- **它指向的档案可能已被撤回**：选中模型照旧是它，读档案时读得到 `withdrawn`，据此说「已下架」（[S-12](#s-12-展示列表)）。**不替用户改选**（[§6.9](../../../../product/PF-013-model-profiles-and-invocation/design.md#69-合法目标算不出来时不替用户改选)）。
  **那条档案后来恢复在册**：选中模型一直是它、引用解析到的仍是同一条（`data.model-profile/v1#S-10`、`#S-14`），它又在册了，只要这个范围允许、模态兼容就又是合法目标——**下一次请求照常用它发出，用户什么都不用做**，本能力也没有什么要改回来（[flows §1.4](../../../../product/PF-013-model-profiles-and-invocation/flows.md#14-走一遍选中的模型被下架了) 第 6′ 步）。
- **读不到会话日志 ⇒ 选中模型判不出来**，依赖它的操作以 `unavailable` 失败，**不回退到设置求值的那个初值**——那会把「读不到」说成「从没切换过」。

### S-10 有效模型：四步，每步来源可查

**这一次调用的有效模型按下面四步定下；每一步的结论与来源都在日志或响应体上查得到。**

| 步 | 做什么 | 结果从哪来 | 留在哪 |
|---|---|---|---|
| 1 | 取**选中模型** | [S-9](#s-9-选中模型) | 切换事实（或设置求值） |
| 2 | **层级求值**「用哪个模型」这项设置：会话格之上若有一格带[不可覆盖标记](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-immutable-marker--不可覆盖标记--immutable-marker)，**取那一格，压过选中模型** | `capability.asset-evaluation` v1 的设置求值（主线裁定 C-10） | 响应体 `selectedBy = layer_lock`；否则 `session` |
| 2′ | **[同标识覆盖](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-composition-semantics--作用域合成语义--scope-composition-semantics)**：以前一步结果的**路由名为[能力标识](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier)**，在会话的范围链上取**最具体一格**的那条同名档案——租户层 > 组织层 > 出厂默认层（产品负责人 2026-09-24 裁定：「路由名就是能力，从下往上在运行时覆盖」）。第 3 步拓展件给出的目标同样先经这一步 | `capability.model-profile-directory/v1#S-17` 末段的先后，链上档案同 [S-11](#s-11-合法目标集合) | **`selectedBy` 不变**（`session`、`layer_lock` 或拓展件照旧）；被覆盖时 `effectiveModel` 的 `profile` 与前一步路由名相同、引用不同，响应体 `route.profile` 是覆盖之后那条 |
| 3 | **「调模型之前」的拓展件**可能给出 `select_model`，只改这一次 | `capability.loop-extension-runner`（它先按 [S-24](#s-24-legaltargets) 核合法，`data.loop-extension/v1#S-24`） | 拓展件的结论条目；响应体 `selectedBy = { extension: <name> }` |
| 4 | **出门前检查**：对前三步的结果核在册、范围允许、模态兼容、凭据有无 | [S-28](#s-28-opencall) | 不过 ⇒ 调用终结记录 `undispatched{cause}`；过 ⇒ 响应体 `route.profile` |

- **第 1、2、2′ 步由 [`effectiveModel`](#s-26-effectivemodel) 给出**；第 3 步在 loop 里发生，它给出的目标在打开调用时经 2′；第 4 步在打开调用时发生。
- **同标识覆盖按行存在取，不看能不能用**：最具体那一格里有这个路由名的行（在册或已撤回）就是它；它已撤回、这个范围不允许、模态对不上或缺凭据，**第 4 步照样以相应成因挡下，不落到更一般一格的同名档案**——落下去就是回退（[S-14](#s-14-缺席时的默认答案与失败集合)）。最具体那条用不了时要不要让位，是产品缺口 [G-15](#十二已知缺口)。
- **覆盖不改选中模型、不写切换事实**：选中模型仍是用户选的那个引用（[S-9](#s-9-选中模型)）；覆盖只决定这一次用哪一条。更具体一格里后来才建出同名的一条，下一次求有效模型就是它——每次都现读链上档案；在途调用不受影响（[S-7](#s-7-一次调用绑定了什么)）。
- **锁压过选中模型，请求照常发出**（主线裁定 C-10）；选中模型不变，展示列表照样显示用户选的那条。
- **有效模型算不出来**（任何一步的输入读不到）是明确失败（`unavailable`），**不猜一个、不回退到上一次用过的**。

### S-11 合法目标集合

```text
覆盖(p)               ≝  链上档案里与 p 同路由名、所在那一格最具体的那一条      （S-10 第 2′ 步）

LegalTargetSet(会话)  ≝  { p ∈ 链上档案 |  覆盖(p) 在册
                                        ∧ 范围允许(覆盖(p))
                                        ∧ compatible(覆盖(p), 投影(会话))
                                        ∧ 投影(会话) ⊆ 本据点传输能承载的模态 }
```

同名没有更具体一条时 `覆盖(p) = p`，式子与覆盖之前一样。

| 输入 | 从哪来 |
|---|---|
| **链上档案** | `capability.model-profile-directory/v1#S-17`，以会话持有的 `TenantId` 为锚 |
| **范围允许** | `capability.asset-evaluation` v1 求值结果（[S-8](../../asset-evaluation/v1/contract.md#s-8-求值结果-effectiveassembly)）里「用哪个模型」那一项在这个会话格上的**允许集合**：档案在集合里即允许（主线裁定 2026-09-23，待产品负责人确认；账本 S16-i）。那一项在 PF-002 里挂在哪类资产上、取值域是什么，产品正文尚未定义（[G-4](#十二已知缺口)） |
| **投影** | [S-13](#s-13-模态投影读到的必须追到日志尾) |
| **`compatible`** | `capability.modality-projection` v1 的 [S-16](../../modality-projection/v1/contract.md#s-16-兼容判定-compatible)：投影 ⊆ 档案的输入模态（`data.model-profile/v1#S-7`） |
| **本据点传输能承载的模态** | 本据点的装配事实（主线裁定 RP-12）：传输适配能送出哪几种模态。**档案登记时不校验它** |

- **最后一个合取项的作用**：一条声明了语音输入的档案，在一个传输送不出语音的据点上，**只要会话里真有语音就不进合法目标**——否则它会进合法目标、出门才送不出，成因无处归。
- **任何一个输入读不到 ⇒ `unavailable`**，**不返回空集**——空集会被读成「现在没有任何模型能用」，据此替用户改选或弹错（[§6.9](../../../../product/PF-013-model-profiles-and-invocation/design.md#69-合法目标算不出来时不替用户改选)）。
- **凭据有无不在这里**：缺凭据的档案仍是合法目标，出门前检查才以 `credential_unavailable` 挡下；展示列表把它标出来（[S-12](#s-12-展示列表)）。
- **同一个路由名可以有几条在集合里**（官方与自建、组织层与租户层，`data.model-profile/v1#S-3`）：集合的元素是引用，不是路由名，**按引用各算、各是一个元素**。
- **判的是覆盖之后那条**：选一个被覆盖的引用，这一次用的是覆盖它的那条（[S-10](#s-10-有效模型四步每步来源可查) 第 2′ 步），所以它合不合法按那条算——否则一个判为合法的引用会在出门前检查被挡下。**同名几条的判定因此相同**：它们都落到同一条上。
  被覆盖的那几条在列表上怎样说明「实际用的是哪一条」，是产品缺口 [G-16](#十二已知缺口)。

### S-12 展示列表

```text
DisplayList(会话)  ≝  LegalTargetSet(会话)  ∪  { 选中模型 }
```

**每一条标着来源**（[PF-013 §6.3](../../../../product/PF-013-model-profiles-and-invocation/design.md#63-官方与自建在同一份列表里)；裁决 36）：条目的 `ref` 就是来源——
`ref.origin` 是 `official`（官方）或 `custom`（自建），自建的 `ref.scope` 的判别式指出建在哪一层（组织层 ／ 租户层）。
**来源标注取自引用里这两个分量，不另立一个成员**——另存一份就会与引用对不上。同一个路由名在列表里出现不止一次时，用户靠它分得开；
**来源是每一条上的标注，不是把列表分块的依据**（§6.3）。

**逐条说明它现在能不能用**（[PF-013 §5.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事)）：

| 注记 | 含义 | 判据 |
|---|---|---|
| `legal` | 是合法目标 | [S-11](#s-11-合法目标集合) |
| `withdrawn` | 选中的档案已被撤回——**「已下架」** | 读到覆盖之后那条（[S-11](#s-11-合法目标集合) 的 `覆盖(p)`）`registration = withdrawn` |
| `scope_disallowed` | 这个范围不再允许 | 范围允许不成立 |
| `modality_mismatch` | 和会话里的模态对不上（含本据点传输送不出） | 兼容或传输那一项不成立 |
| `credential_missing` | **调它时没有凭据可用**（**附加注记**，可与 `legal` 并存）：自建档案——这个租户没配自己那一把；官方档案——这个租户没配、部署也没给出厂格配一把 | 以会话持有的租户与**这一条覆盖之后那条的来源**问 `capability.model-profile-directory/v1#S-20` 的有没有，答 `{ present: false }` |

- **选中模型不在合法目标里时，它仍在列表上**，并带上它不合法的那一条原因——**不呈现「未知模型」**，也不从列表里消失。
- **`credential_missing` 按每一条覆盖之后那条的来源各问一次**：同一个租户没配自己那一把时，没被覆盖的官方档案（部署配了出厂格那一把）可用、自建档案标明缺凭据——一条都不能按别的条目的答案代答。**被同名自建档案覆盖的官方档案按那条自建档案问**：选它，这一次用的是那条自建档案（[S-10](#s-10-有效模型四步每步来源可查) 第 2′ 步）。
- **同名几条各是一条，每条标着自己的来源**（`ref` 就是那一条的引用，不换成覆盖之后那条的）；注记按覆盖之后那条算（[S-11](#s-11-合法目标集合)），所以同名几条的注记相同。被覆盖的那几条怎样说明「实际用的是哪一条」是 [G-16](#十二已知缺口)。
- 同时不合法的几条原因，**全列**，不只取一条。
- **选中模型的档案读成「查无此条」**（`profileNotFound`：它曾被引用，如今存储里没有这一行）：列表**以 `unavailable` 失败**，不自造一个注记把它说成「已下架」。

### S-13 模态投影：读到的必须追到日志尾

**本能力读会话模态投影时，读到的必须等于「对读那一刻的整份会话日志求一遍投影」的结果。**
投影的定义（哪些块算、嵌在工具结果里的算不算、派生表示与 transcript 怎样处理）归 `capability.modality-projection` v1；块的模态由媒体类型判定（`data.content-blocks/v1#S-6`）。

- **权威是日志，不是任何缓存。**本能力可以为每个会话维护一份增量的中间结果，但**每一次读都须把它追到日志尾**——没追到的读，等于拿一份旧投影去算合法目标，一张刚进来、没人转的图会被漏过。
- **追不到日志尾**（读不到日志）⇒ `unavailable`；**不以中间结果代答**。
- **只增不减**：投影随日志增长而单调（[flows §3.4](../../../../product/PF-013-model-profiles-and-invocation/flows.md#34-一个会话的模态投影)）；读到一个比上次小的投影，说明中间结果坏了——那是故障，不是事实。
- **代价与历史长度无关**是本条的伸缩义务（[§6.18](../../../../product/PF-013-model-profiles-and-invocation/design.md#618-模态投影要答得快而且是增量维护出来的)），证据形式在[验证入口](../verification.md)。

---

## 三、贯穿全部操作的规矩

### S-14 缺席时的默认答案与失败集合

**一律拒绝或明确失败，不放行、不空集、不回退。**三类分开：

| 情形 | 收场 |
|---|---|
| **判定得出「不该这样做」** | 一个具名的拒绝值 |
| **判定做不出来**：目录、会话日志、作用域求值、投影、保管方读不到 | **`unavailable`** |
| **输入不合形状** | **`invalidInput{reason}`**：档案引用与请求参数取 `data.model-profile/v1#S-25` 的拒绝值；身份值与判别式取 `data.identity-values/v1#S-33` 的口径；本契约自己的输入不合形状取 `malformed` |

- **身份参数没有默认值**：会话、`callId`、`TenantId`、宿主缺席即 `invalidInput`，**不得**由「当前会话」「当前在跑的那次调用」补齐（`data.identity-values/v1#S-17`、`#S-18`）。
- **判别式闭合**：`initiator`、`RetryPlan` 的成员、集合外的取值一律 `invalidInput`（`data.identity-values/v1#S-32`）。

**本契约的失败值恰九个，没有「其他」**：

| 失败值 | 意思 |
|---|---|
| `invalidInput{reason}` | 输入不合形状 |
| `unavailable` | 判定做不出来 |
| `profileNotFound` | 引用解析到零行（从未存在，或存储丢了那一行） |
| `notLegalTarget{because}` | 切换目标不在合法目标集合里；`because` ⊆ `{ withdrawn, scope_disallowed, modality_mismatch }`，全列 |
| `callNotFound` | 这个会话里没有这个 `callId` |
| `alreadyEnded` | 调用已在终态（`dispatch`、`dispatchAgain`、`interrupt`、`releaseCall`） |
| `runtimeStopped` | 宿主已在停止中，不开新调用、不再发出 |
| `retryRefused{why}` | 这次再发被守卫拒绝；`why` 恰一个，取自 [S-30](#s-30-dispatchagain) 的闭合表 |
| `wrongPhase{phase}` | 调用不在这个操作要求的状态；`phase` 是它当前的状态（[S-6](#s-6-调用的状态)） |

> **`profileWithdrawn` 与 `credentialUnavailable` 不是本契约的操作失败值**（账本列了它们）：选中一条已下架的档案是 `notLegalTarget{because: [withdrawn]}`；
> 出门前才发现的已下架、没凭据，是**调用的收场**（`undispatched{withdrawn}`、`undispatched{credential_unavailable}`），不是操作失败——操作本身成功地判出了这件事。已报给主线。
> **`wrongPhase` 不在账本里**，是规格层推导（状态机需要一个「此刻不能做」的值，而 `retryRefused` 专指再发守卫）；已报给主线。

各操作的⑥从中取子集；**判定次序按⑥从左到右**。

### S-15 两个锚点：先写后行

**两条耐久记录，各自先于它要保护的那件事写下：**

| 锚点 | 先于什么 | 保护什么 | 反例 |
|---|---|---|---|
| **已出门** | 这一次请求**离开本进程** | 停机之后找得到「发出去却没回来」的那一次：追补它的账、决定能不能再发 | 请求先出网、锚点后写，其间停机：上游可能已经在计费，而日志里没有这次发出——**那笔钱从明细里消失**，下一次尝试也不知道有过它 |
| **已开口** | 首个内容**交给任何观察者**（交付面、流装配的订阅方） | 停机之后判得出「这次已经开口」，**不重发** | 内容先被看见、锚点后写，其间停机：对账读到「已出门、没开口」，按第一行再发一次——**记录里两份回复，用户只看见过一份半**（[停机之后](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token)） |

- **「写下」指追加口确认落盘**，不是交给了一个缓冲区。
- **跨进程之后**：观察者在另一个进程时，转发链上任何一跳都**不得越过锚点先把内容送出**（[S-38](#s-38-装配给的保证-vs-协议须给的保证)）。
- **锚点写不进**（追加口失败）：已出门写不进 ⇒ **这一次不发**，按 `unavailable` 回给调用方，调用停在原状态；已开口写不进 ⇒ **内容不交给观察者**，中止这次发出，按首 token 之前的故障结算、成因 `unrecognized` 并留痕（[S-18](#s-18-成因按来源分类三类事实由守卫兑现)）。**不「先交出去再补写」**。

### S-16 首 token 判据

**首 token = 这次回复交出的第一样内容，不论模态**（[已经开口说话了](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类)）：

- 能一点点长的块（文本、思考、工具调用的参数、语音）：**第一片到了**；
- 整个交出的块（图、文件）：**整块交出来了**；
- **一个开了口、零次填充就封口的块，也算开口**，只要封口块内容非空（`data.arrival-events/v1#S-21`）——记录里已经有一个完整的块（主线裁定 RP-26；装配器侧的判据是 `capability.stream-assembly` v1 的 [S-16](../../stream-assembly/v1/contract.md#s-16-首个内容的位置)）；
- **响应头到了不算；整交的块开了口还没交出来也不算**。

**观察到首 token 就写「已开口」**（[S-15](#s-15-两个锚点先写后行)），响应体的 `timing.firstTokenAt` 与它一致（`data.model-response/v1#S-17`）。
**`firstTokenAt` 缺席是断言「确知没开口」**（`data.model-response/v1#S-18`）：本能力判不出时——例如「已开口」写不进——**不写成缺席**，按 [S-15](#s-15-两个锚点先写后行) 末条处理。

### S-17 结算：一处、按序、幂等、先到者赢

**一次发出的收场由「写下它的那条响应体」定下。**可能写它的有四方：正常收尾（交回调用方）、中断、宿主停止时的撤除、停机之后的对账。

- **按 `ResponseId` 判重**：`ResponseId` 在「已出门」时定下（[S-8](#s-8-调用在会话日志里留下的六种记录)），任何一方写之前先看这个标识是否已有响应体——**已有即什么都不写**。**先写下的那一方赢**，其余各方是空操作，不报错。
- **撤除时的结算在一处做完，次序固定**：中止这次发出 → 按首 token 规则定收场 → 写下响应体（或交回调用方）→ 释放这次发出占的资源。**不把这几步分散到几处由各自的清理去做**——那几处之间没有次序保证，账可能在连接关掉之后才被想起来。
- **带回复的那条响应体由调用方写**：`complete`、`truncated`，以及有内容的用户中断——它们与回复消息**同一提交**写下（`data.messages/v1#S-9`：一次回复只有一份权威内容；[S-38](#s-38-装配给的保证-vs-协议须给的保证) 第一行）。本能力把它**交回**，不自己写；**其余的由本能力在返回之前写下**。
- **结算写入不受尝试栅栏拒收**：一次尝试已经被栅栏关掉之后，属于它的那次发出的响应体与账**照样写下**，标为晚到（`data.call-accounts/v1#S-39` 的 `late`）——栅栏挡的是「旧尝试继续推 loop」，**不是「旧尝试花掉的钱」**。
- **账**：每条响应体恰一份账；拿不到记 `unknown`，不记零（`data.call-accounts/v1#S-19`、`#S-20`）。**停机之后追补的那一条，账是全未知的那一份**。

### S-18 成因按来源分类；三类事实由守卫兑现

**一次发出失败时，成因按失败的来源分类**（[§6.11](../../../../product/PF-013-model-profiles-and-invocation/design.md#611-成因在这个边界上分类不丢进外层按异常形态分)）。八个成因的名字与所属类归 `data.loop-extension/v1#S-17`。

| 来源 | 成因 | 进不进响应体 |
|---|---|---|
| **出门前检查**（[S-28](#s-28-opencall)、[S-29](#s-29-dispatch)） | `withdrawn` · `scope_disallowed` · `modality_mismatch` · `credential_unavailable`（没配，或保管方判解不出值） | **不进**：没有发出（`data.model-response/v1#S-16`）；记调用终结 `undispatched{cause}` |
| **传输本地**：请求还没到上游，本进程这一侧就失败了（适配层自身错误、请求序列化失败、本地资源耗尽） | **`unrecognized`**，并把本地错误留痕 | 进（这次发出已出门） |
| **连不上、超时、上游在首 token 之前断流** | `upstream_unavailable` | 进 |
| **上游返回的状态码** | 按具名参数 **`status_cause_table`**：一张状态码 → 成因的表，只映射到 `credential_unavailable`（配了而上游拒绝）、`request_rejected`、`upstream_unavailable` 三者之一；**表里没有的状态码 ⇒ `unrecognized`** | 进；状态码原样带着 |
| **首 token 之后的任何故障**（断流、超时、上游最后回了错误状态） | **`interrupted_mid_reply`**，优先于上面各行 | 进；状态码仍原样带着 |
| **上游正常收尾、却一样内容都没有** | `upstream_unavailable`（空回复归策略那一类，[判据例一](../../../../product/PF-013-model-profiles-and-invocation/design.md#判据怎么用三个例子)） | 进 |

- **本地故障不报成「上游给不出」**：传输本地那一行归 `unrecognized`——报成 `upstream_unavailable`，重试件会拿一个本地 bug 去换家、退避，一遍遍试尽。
- **`unrecognized` 必带留痕**：状态码、上游错误原文或本地错误三者至少其一（`data.model-response/v1#S-15`）。
- **`status_cause_table` 的具体内容不在本契约**（[G-5](#十二已知缺口)）；本契约只约束它：每个状态码至多映射一个成因、只映射到上面三者、不得映射到出门前那四个。

**三类事实由发出守卫兑现，不由重试件的策略兑现**（[S-30](#s-30-dispatchagain)）：成因属于「发不出去」「重试没用」「已经开口」的，任何 `retry` 结论都不生效。**默认重试件怎样写都改不了这一条**，换成自定义件也一样。

### S-19 凭据每次发出现取，取值只交给传输适配

- **每一次发出之前，以发起租户与有效模型的来源现取凭据**（`capability.model-profile-directory/v1#S-20` 取值问法）：**发起租户有自己那一把就用它**，不论档案是官方的、组织层建的还是他自己建的；
  **否则只有官方档案取出厂格那一把**（部署装配配了时）；**自建档案不落到出厂格那一把**，没有就是没有可用的凭据
  （[PF-013 §5.6](../../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上)、[§6.2](../../../../product/PF-013-model-profiles-and-invocation/design.md#62-凭据挂在范围上档案自己不存)；decisions P33、P34）。**组织那一层不持有凭据**，取用里没有它。
  **不缓存到下一次发出**：凭据轮换零通知，下一次发出就用新值。
- **来源取自这次调用绑定的有效模型引用的 `origin`**（[S-7](#s-7-一次调用绑定了什么)），**不另填、不替它换**：带错了，自建档案就会用上部署那一把、钱记到部署头上。
- **取值只交给传输适配**，由它放进这一次请求；**不进任何记录、任何结论、任何事件、任何失败说明**，也不进档案快照。
- **账上分记两件事**：这一次用的是**哪个范围**的凭据（响应体 `route.credentialScope`，`data.model-response/v1#S-9`）、**发起者**是谁（明细的 `initiator`，`data.call-accounts/v1#S-38`）。**用量记在凭据所在的范围头上，成本算到发起它的租户头上**——两件事都要，缺一个都会算错；两者只在走出厂格那一把时分叉（用租户自己那一把时那一格就是发起租户），出厂格那一把是唯一分叉点（`data.call-accounts/v1#S-38`）。
- **取不到**：没有可用的凭据、或保管方判解不出 ⇒ 这一次不发，`undispatched{credential_unavailable}`（首次发出）或按 [S-29](#s-29-dispatch) ⑧（再发时）；租户那一格或保管方够不着 ⇒ `unavailable`，**不改用出厂格那一把或别的范围的凭据**。

### S-20 写入之前脱敏

**本能力写下的任何记录都不含凭据**（`data.model-response/v1#S-21` 把规则交给本契约）：

1. **已知值替换**：这一次发出用过的凭据值，在上游错误原文、上游响应头、原始响应留存与本地错误留痕里**任何一处出现都替换掉**；它的片段按具名参数 **`credential_fragment_min_length`** 定：不短于这个长度的任何子串同样替换。
2. **凭据类头剥除**：上游响应头里名字属于具名参数 **`credential_header_names`** 的头，整条剥除。
3. **形态识别**：具名参数 **`credential_patterns`** 列出的凭据形态，在上面几处出现同样替换。
4. **内部标识**：本系统的会话标识不送往上游（[S-38](#s-38-装配给的保证-vs-协议须给的保证) 传输适配义务），也就不会从上游原文回流。

- **脱敏在写入之前**：响应体写下即不变（`data.model-response/v1#S-22`），事后清理做不到。原始响应体存进附件存储之前同样过一遍（`data.content-blocks/v1#S-21` 的 `AttachmentRef` 指向的是脱敏之后的那一份）。
- **脱敏之后仍叫「原样」**：除去凭据之外不翻译、不摘要。
- 三个具名参数的取值不在本契约（[G-6](#十二已知缺口)）。

### S-21 两个时限是运行时设置项

| 具名参数 | 含义 | 超了算什么 |
|---|---|---|
| **`first_token_wait_limit`** | 一次发出出门之后，等首 token 的上限 | 首 token 之前的故障，`upstream_unavailable` |
| **`post_first_token_stall_limit`** | 首 token 之后，两次内容之间最长的停滞 | `interrupted_mid_reply` |

- **它们是运行时设置项**，按设置那一套求值（取值落在 agent definition 的设置上；主线裁定 RP-5）；**不是档案属性，也不在重试件的配置里**。时长的表示取 `data.tool-definition/v1#S-14`。
- **两个项名就是上表的名字**（主线裁定 2026-09-23，待产品负责人确认；由产品修订批登进 PF-002 的设置项清单）；它们在那一类资产的推出规则里怎样声明、默认值由谁给，仍在 [G-9](#十二已知缺口)。
- **本契约不给数值**（[§6.17](../../../../product/PF-013-model-profiles-and-invocation/design.md#617-本-topic-不出现任何时限数值)）。**取不到设置值 ⇒ 这一次不发，`unavailable`**——不以「不设上限」代替：没有上限的一次发出可能永远不收场。

### S-22 同一次调用的发出序列

**同一次调用的发出 D₁ … Dₙ 满足：**

1. **序号 1 … n，跨尝试连续**（[S-5](#s-5-一次调用一次发出)）。
2. **D₁ 发给档案快照里「允许的供应商」的第一家**。
3. **Dₖ₊₁ 存在，当且仅当 Dₖ 以下两种之一收场**：
   - **故障、没开口、成因属于策略那一类**（`upstream_unavailable`、`unrecognized`），且 loop 读到一条合法的 `retry`（[S-30](#s-30-dispatchagain)）；
   - **首 token 之前失去连续性**，停机之后被追补为 `interrupted{runtime_lost}`、没有首 token（[S-33](#s-33-reconcile) 第一行）——这时 Dₖ₊₁ **发给 Dₖ 那一家**。
4. **任何一次发出开了口之后，这次调用不再有发出**——**跨尝试同样成立**。
5. **每一次发出的那一家都在档案快照「允许的供应商」里；快照说不允许回退时，每一次都是第一家。**

> **与 `data.model-response/v1#S-23` 第 2 条一致**：那一条允许「故障、策略类、没开口」与「首 token 之前失联、被追补为 `interrupted{runtime_lost}`」两种之后再发（主线裁定 U-11、S16-g；原 G-1 在整批对齐闭合）。

---

## 四、操作

### S-23 这一节每个操作写全九件事

| # | 写什么 |
|---|---|
| ① | 输入 |
| ② | 前置与授权 |
| ③ | 结构性禁止（不适用写「无」） |
| ④ | 提交点与原子性 |
| ⑤ | 成功返回 |
| ⑥ | 失败集合（取自 [S-14](#s-14-缺席时的默认答案与失败集合) 的九个，闭合；从左到右即判定次序） |
| ⑦ | 幂等与重复 |
| ⑧ | 缺席时的默认答案 |
| ⑨ | 事件 |

**授权的共同口径**：本契约的操作是**能力间的内部面**，调用方是同一据点上的宿主（agent runtime）、loop 与交付面的命令入口；
**调用方身份由装配给出**：入口层已把登录状态换成当前租户身份、会话打开时已核过这个租户能用这个会话（[S-38](#s-38-装配给的保证-vs-协议须给的保证)）。
本契约**不重做会话层的授权**，只保证每个操作都**以会话持有的租户身份**为锚取档案与凭据。

**十一个操作**：读三个（`legalTargets`、`displayList`、`effectiveModel`）、切换一个（`selectModel`）、调用六个（`openCall`、`dispatch`、`dispatchAgain`、`interrupt`、`releaseCall`、`reconcile`）、读留痕一个（`readAttempts`）。
**服务面候选名取施工简报与主线补充的账本**；`releaseCall` 账本没有，已报给主线。

### S-24 legalTargets

| # | 内容 |
|---|---|
| ① | `session` |
| ② | 无额外授权（见 [S-23](#s-23-这一节每个操作写全九件事) 共同口径） |
| ③ | 无 |
| ④ | 只读，无提交；**每次现算**，每个输入现读 |
| ⑤ | `LegalTargetSet`：一组 `ModelProfileRef`，按 [S-11](#s-11-合法目标集合) 的式子；**次序没有含义** |
| ⑥ | `invalidInput` · `unavailable` |
| ⑦ | 只读，天然可重复 |
| ⑧ | 任一输入读不到 ⇒ `unavailable`，**不返回空集、不返回部分集合** |
| ⑨ | 不发 |

### S-25 displayList

| # | 内容 |
|---|---|
| ① | `session` |
| ② | 无额外授权 |
| ③ | 无 |
| ④ | 只读，无提交；每次现算 |
| ⑤ | 一组条目，每条 `{ ref, 注记集合 }`，按 [S-12](#s-12-展示列表)；**`ref` 即这一条的来源**（`origin`，自建的再带 `scope`）；选中模型那条另标「选中」 |
| ⑥ | `invalidInput` · `unavailable` |
| ⑦ | 只读，天然可重复 |
| ⑧ | 任一输入读不到、选中模型的档案查无此条 ⇒ `unavailable`；**不省掉选中模型那一条来凑出一份列表** |
| ⑨ | 不发 |

### S-26 effectiveModel

**给出 [S-10](#s-10-有效模型四步每步来源可查) 第 1、2、2′ 步的结果**——loop 据它填 `ModelRequest.target`（`data.loop-extension/v1#S-15`），交给「调模型之前」的拓展件。

| # | 内容 |
|---|---|
| ① | `session` |
| ② | 无额外授权 |
| ③ | 无 |
| ④ | 只读，无提交；每次现算 |
| ⑤ | `{ profile: ModelProfileRef, selectedBy: session | layer_lock, selected: ModelProfileRef }`——`selected` 是第 1 步的选中模型，`profile` 是第 2、2′ 步之后的结果；两者不同，是被锁压过（`selectedBy = layer_lock`）、被同名更具体一格的那条覆盖（路由名相同、引用不同，`selectedBy` 不变），或两者都有。**不判合法**：结果可能已下架，出门前检查才挡（[S-10](#s-10-有效模型四步每步来源可查) 第 4 步） |
| ⑥ | `invalidInput` · `unavailable` |
| ⑦ | 只读，天然可重复 |
| ⑧ | 会话日志、层级求值读不到 ⇒ `unavailable`；**不回退到设置初值或上一次用过的** |
| ⑨ | 不发 |

### S-27 selectModel

**用户的切换命令：把会话的选中模型换成一条合法目标。**

| # | 内容 |
|---|---|
| ① | `session`；`profile: ModelProfileRef`；`initiator: TenantId`（发出命令的那个租户身份，必须等于会话持有的租户身份） |
| ② | `initiator` = 会话持有的租户身份，否则 `invalidInput`（身份不符不是一个可以放行的判定）；**只由交付面的切换命令调用**——agent 与拓展件没有这条路（`data.loop-extension/v1#S-24`） |
| ③ | 无 |
| ④ | **单次提交**：判 `profile` ∈ 合法目标 → 写下切换事实。**判定与写入不在同一提交**：其间目标变得不合法（被撤回、会话里新进来一张没人转的图），由[§6.9](../../../../product/PF-013-model-profiles-and-invocation/design.md#69-合法目标算不出来时不替用户改选)兜住——下一次请求发不出去、上交、不替用户改选。**这是有意接受的窗口** |
| ⑤ | `{ selected: profile }`。**生效点是下一次 `effectiveModel`**，在途调用不受影响（[S-7](#s-7-一次调用绑定了什么)） |
| ⑥ | `invalidInput` · `unavailable` · `profileNotFound` · `notLegalTarget{because}` |
| ⑦ | `profile` 等于当前选中模型 ⇒ 不写新事实，返回同一个 ⑤ |
| ⑧ | 合法目标算不出来 ⇒ `unavailable`，**不写事实**；切换事实写不进 ⇒ `unavailable`，**选中模型不变**——不「先生效再补写」 |
| ⑨ | 不发（切换事实在日志里，读日志的人看得到） |

**合法目标不得拒绝**（[§6.5](../../../../product/PF-013-model-profiles-and-invocation/design.md#65-切换是用户的直接命令合法目标不得拒绝)）：`profile` 在合法目标里，本操作**只可能**因 `unavailable` 失败。
**不合法的不以「被拒」出现在交付面**：交付面只把合法目标做成可选项；本失败值是接口层的，不是给用户看的一次「切换被拒」。

### S-28 openCall

**打开一次调用：绑定有效模型、档案快照与参数，过出门前检查。**

| # | 内容 |
|---|---|
| ① | **`ModelCallRequest`**：`callId?`（缺席 = 打开一次**新**调用，由本能力产生；给出 = **续接**一次处于 `resumable` 的调用）、`run`、`attempt`、`session`、`messages`（组装出来、这一次要发的消息）、`target?`（「调模型之前」的拓展件改过的有效模型）、`targetChangedBy?`（改它的那件拓展件的能力标识，`data.content-blocks` 的 `CapabilityId`；**与 `target` 同在同缺**，写进 `selectedBy`）、`parameters?`（这一次对档案 `parameters` 的逐项覆盖；缺席 = 不覆盖）、`tools`（这一次带给模型的工具条目，`CapabilityId[]`，可以是空数组；每项在 `data.tool-definition/v1#S-6` 的模型面上恰一个条目）；外加**宿主**与**会话日志的追加入口**。**`target`、`parameters`、`messages`、`tools` 与 `data.loop-extension/v1#S-15` 的 `ModelRequest` 同名成员逐字相同**（主线裁定 2026-09-23，待产品负责人确认；账本 S16-c，`parametersOverride` 与 `ToolDefinitionRef` 作废；原 G-3）。**`run` 与 `attempt` 同时出现或同时缺席**：同时缺席是调用方的显式陈述「这次调用不属于任何 Run」（C-14），不是默认值 |
| ② | 宿主不在停止中；`session` 存在；续接时 `callId` 属于这个 `session` 且处于 `resumable` |
| ③ | **有**：`target` 不能由本操作以外的路径改——`parameters` 里出现目标、`messages` 之外塞进换模型的指示、`target` 与 `targetChangedBy` 只给一个，一律 `invalidInput`（`data.loop-extension/v1#S-15`：`target` 只经 `select_model`） |
| ④ | **新调用**：求有效模型（`target` 给出则取它、再经 [S-10](#s-10-有效模型四步每步来源可查) 第 2′ 步的同标识覆盖，否则 [S-26](#s-26-effectivemodel)，已含覆盖）→ 读档案 → 合并参数 → **出门前检查**（下表）→ 绑定（[S-7](#s-7-一次调用绑定了什么)）。**检查不过**：写一条调用终结记录 `undispatched{cause}`，这次调用即在终态 `handed_up`。**检查通过**：不写任何记录——一次还没出门的调用，停机之后不留痕迹、也没有要追补的东西。**续接**：重新绑定宿主与追加入口，**档案快照与参数沿用原绑定**，不重做出门前检查（这次调用已经被准入过） |
| ⑤ | `{ callId, state: open | resumable }`，或 `{ callId, state: handed_up, undispatched: cause }` |
| ⑥ | `invalidInput` · `runtimeStopped` · `callNotFound` · `wrongPhase` · `unavailable` · `profileNotFound` |
| ⑦ | **新调用不幂等**：同一份请求打开两次是两次调用、两个 `callId`——**防重归调用方**（loop 在同一步只打开一次）。**续接可重复**：已在 `resumable` 且已重新绑定到同一宿主 ⇒ 返回同样的 ⑤ |
| ⑧ | 目录、会话日志、层级求值、投影、保管方任一读不到 ⇒ `unavailable`，**不写任何记录**、不打开调用——「判不出来」不记成 `undispatched`。有效模型的引用解析到零行 ⇒ `profileNotFound`（接口错误：调用方交来一个从未存在的引用） |
| ⑨ | 不发 |

**出门前检查**（核的是**有效模型**，主线裁定 C-10；依次核，第一个不过的即成因）：

| 次序 | 检查 | 不过即 |
|---|---|---|
| 1 | 档案在册 | `withdrawn` |
| 2 | 这个范围允许它 | `scope_disallowed` |
| 3 | `compatible(档案, 投影)` 且投影 ⊆ 本据点传输能承载的模态 | `modality_mismatch` |
| 4 | 凭据：以发起租户与有效模型的来源问「有没有」 | `credential_unavailable` |
| 5 | 合并后的参数过 `data.model-profile/v1#S-24`（含输出上限） | **不是成因**：`invalidInput{reason}`——覆盖不合法是调用方交来的输入错，不是一次上交 |

- **检查的是这一刻**：拓展件改过的 `target` 若在它核完之后变得不合法，这里照样挡下。
- **`undispatched` 的调用没有响应体**（`data.model-response/v1#S-16`）；上交条目由 loop 写（[S-3](#s-3-本契约明确不承诺什么)）。

### S-29 dispatch

**发出一次：首次发出，或续接之后的再发。**

| # | 内容 |
|---|---|
| ① | `callId`；这次发出落在哪一次尝试（调用属于某个 Run 时必给） |
| ② | 调用处于 `open` 或 `resumable`；宿主不在停止中 |
| ③ | **有**：调用里任何一次发出开过口 ⇒ 不发（`retryRefused{already_spoke}`）——跨尝试同样成立 |
| ④ | **提交点是「已出门」**：取凭据 → 写「已出门」（带 `ResponseId`、所在尝试、那一家）→ 请求出网。首次发出取档案快照里的第一家；续接取失联那次的那一家。**开口时**写「已开口」再交出内容（[S-15](#s-15-两个锚点先写后行)）。**收场时**按 [S-17](#s-17-结算一处按序幂等先到者赢) 结算 |
| ⑤ | **等到这次发出收场才返回**，返回这次发出的响应体（`data.model-response` 形状），并说明它**由谁写**：<br>• `outcome ∈ { complete, truncated }`，或 `interrupted` 且有回复 ⇒ **交回，未写**：调用方与回复消息同一提交写下它；`reply` 是一条 `AssistantMessage`，`ending` 与收场一一对应（`data.messages/v1#S-10`）。调用进入对应终态<br>• `failed`，或 `interrupted` 且没有内容 ⇒ **已写**：本能力在返回之前写下。`failed` 时调用进入 `awaiting_decision`，返回里带成因、原样状态码与这次调用已有的全部发出，供「调模型之后」失败那一维使用 |
| ⑥ | `invalidInput` · `callNotFound` · `alreadyEnded` · `retryRefused{already_spoke}` · `wrongPhase` · `runtimeStopped` · `unavailable` |
| ⑦ | **不幂等**：每一次成功调用都是一次新的发出。重复调用由状态挡住：第一次调用让调用离开 `open`／`resumable`，第二次得 `wrongPhase` |
| ⑧ | 凭据取不到（按 [S-19](#s-19-凭据每次发出现取取值只交给传输适配) 没有可用的那一把）⇒ **首次发出**：不写「已出门」，写调用终结 `undispatched{credential_unavailable}`，返回 `{ undispatched }`；**续接的再发**：同样不出门，写调用终结 `undispatched{credential_unavailable}`（这次调用此前已有响应体，上交照常）。保管方、追加口够不着 ⇒ `unavailable`，**不出门**、调用停在原状态。取不到时限设置 ⇒ `unavailable`（[S-21](#s-21-两个时限是运行时设置项)） |
| ⑨ | 不发 |

- **首 token 之后出了故障**：`failed{interrupted_mid_reply}`，已交付的块进 `delivered`（没长完的工具调用照 `data.content-blocks/v1#S-13`），**不成为消息**；调用进入 `awaiting_decision`，但它**不会再有发出**（[S-30](#s-30-dispatchagain) 守卫），loop 只能放手。
- **传输层不得在一次发出之内隐藏重试**（`data.model-response/v1#S-24`）：重试只能是下一次 `dispatchAgain`。

### S-30 dispatchAgain

**loop 读到一条 `retry { plan }` 之后，照计划在同一次调用下再发一次。**

| # | 内容 |
|---|---|
| ① | `callId`；`plan: { provider, after? }`（`data.loop-extension/v1#S-27`）；这次发出落在哪一次尝试 |
| ② | 调用处于 `awaiting_decision`；宿主不在停止中 |
| ③ | **有——终态检查、两个守卫加一条计划约束，任何拓展件都推翻不了**（终态 ⇒ `alreadyEnded`；其余见下表） |
| ④ | 守卫全过之后同 [S-29](#s-29-dispatch) ④，那一家取 `plan.provider`；`after` 给出时**由 loop 在退避到期之后才调用本操作**——本能力不替它计时 |
| ⑤ | 同 [S-29](#s-29-dispatch) ⑤ |
| ⑥ | `invalidInput` · `callNotFound` · `alreadyEnded` · `retryRefused{why}` · `wrongPhase` · `runtimeStopped` · `unavailable` |
| ⑦ | 不幂等：两次调用即两次再发的尝试；第一次成功后调用离开 `awaiting_decision`，第二次得 `wrongPhase` |
| ⑧ | 同 [S-29](#s-29-dispatch) ⑧ |
| ⑨ | 不发 |

**`retryRefused` 的 `why`，闭合、按表中次序判：**

| 次序 | `why` | 条件 | 依据 |
|---|---|---|---|
| 1 | `already_spoke` | 这次调用任何一次发出开过口——**跨尝试** | [「一个逻辑回复只发一次」](../../../../product/PF-013-model-profiles-and-invocation/design.md#有三件事它改不动) |
| 2 | `fact_class` | 最近一次发出的成因属于「发不出去」或「重试没用」（`credential_unavailable`、`request_rejected`） | [PF-013 §5.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#54-三类事实归本层定死其余照状态码) |
| 3 | `provider_not_allowed` | `plan.provider` 不在档案快照「允许的供应商」里；或快照说不允许回退而 `plan.provider` 不是第一家 | `data.loop-extension/v1#S-27`；[S-22](#s-22-同一次调用的发出序列) 第 5 条 |

- **`plan` 里出现 `provider`、`after` 之外的成员**（比如一个目标）⇒ `invalidInput`：**换模型不是 `retry` 能做的**，那是用户的切换命令（`data.loop-extension/v1#S-27`）。
- **被拒的 `retry` 怎样记下**，归 `capability.loop-extension-runner`（按它对可改写件的报错处置）；本操作只如实返回 `why`。
- **已终结的调用只有一个值**：调用已在终态 ⇒ `alreadyEnded`，排在 `retryRefused` 之前判（主线裁定 2026-09-23，待产品负责人确认；账本 S16-b，原 `retryRefused{call_ended}` 作废）。
- **`already_spoke` 与状态检查的次序**：`already_spoke` 排在 `wrongPhase` 之前判——一次开过口、尚未终结的调用，无论此刻处在什么状态，调用方拿到的都是「开过口」这个事实。

### S-31 interrupt

**单独中断这一次调用，不动别的。**

| # | 内容 |
|---|---|
| ① | `callId`；`initiator ∈ { user, run_cancelled }` |
| ② | 调用不在终态。**`runtime_lost` 不是本操作的取值**——它只由对账写下（[S-33](#s-33-reconcile)） |
| ③ | **只作用于这一个 `callId`**：不动同一会话里别的调用、不动正在跑的工具执行、不终结 Run（[§5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#单独控制中断这一次调用不动别的)） |
| ④ | **提交点是「中断意图」**：先写中断意图 → 再发中止信号 → 结算（[S-17](#s-17-结算一处按序幂等先到者赢)）。**本操作在中断意图写下之后即返回**，不等结算完成 |
| ⑤ | **中断落在哪个阶段**：`before_dispatch`（`open`、`awaiting_decision`、`resumable`：没有在途发出，写调用终结 `interrupted`，没有响应体）· `in_flight`（没开口：这次发出以 `interrupted`、无回复收场，本能力写响应体）· `speaking`（开了口：以 `interrupted`、带已交付内容作回复收场，交回 `dispatch` 的调用方与消息同一提交写下） |
| ⑥ | `invalidInput` · `callNotFound` · `alreadyEnded` · `unavailable` |
| ⑦ | **幂等**：已有中断意图、尚未结算 ⇒ 不写第二条，返回同一个 ⑤。**先到者赢**：这次发出在中止信号到达之前已经收场（完成或失败），那个收场成立——调用已在终态时本操作得 `alreadyEnded`；已在 `awaiting_decision` 时按 `before_dispatch` 结束调用 |
| ⑧ | 中断意图写不进 ⇒ `unavailable`，**不发中止信号**——不写意图就中止，停机之后对账会把这次调用当成「失联」而再发一次，用户叫停的东西又跑了起来 |
| ⑨ | 不发 |

- **被中断不是故障**：不带成因、不经「调模型之后」失败那一维、不是上交（[还有一种没走完](../../../../product/PF-013-model-profiles-and-invocation/design.md#还有一种没走完它不在这张表里)）。响应体上 `interrupted` 带 `initiator`（`data.model-response/v1#S-12`）。
- **中断提醒由 loop 补**（`data.messages/v1#S-21`）；本契约不写它。

### S-32 releaseCall

**loop 决定不再试：让一次处于 `awaiting_decision` 或 `resumable` 的调用以上交收场。**服务面候选名：**账本未给**（已报给主线）。

| # | 内容 |
|---|---|
| ① | `callId` |
| ② | 调用处于 `awaiting_decision` 或 `resumable` |
| ③ | 无 |
| ④ | **单次提交**：写调用终结 `handed_up`（最近一次发出的成因由它的响应体给出，不另记） |
| ⑤ | `{ callId, state: handed_up }` |
| ⑥ | `invalidInput` · `callNotFound` · `alreadyEnded` · `wrongPhase` · `unavailable` |
| ⑦ | 已是 `handed_up` ⇒ `alreadyEnded`（终态吸收，不区分「是我放的手」） |
| ⑧ | 调用终结写不进 ⇒ `unavailable`，调用停在原状态 |
| ⑨ | 不发 |

- **`resumable` 也可以放手**：新的一次尝试里 loop 可能判定这次调用不必再续（比如这一步已经不需要它）。
- **上交条目由 loop 写**；本操作只结束调用。

### S-33 reconcile

**新的一次尝试开始、进方程之前，对这个会话里没收场的调用逐个对账**（[PF-012 先对账，再进方程](../../../../product/PF-012-agent-loop-and-run/design.md#先对账再进方程)）。

| # | 内容 |
|---|---|
| ① | `session`；新的这一次尝试 |
| ② | **在这个会话的新尝试开始之后、loop 推进之前调用**；同一会话同一时刻只有一副协程在推它（PF-012），由调用方保证 |
| ③ | **有**：对账**从不发出**——它只追补结算、给出状态；再发由 loop 调 `dispatch` |
| ④ | 对每一次没收场的调用，按它**最后一次发出**在日志里的样子（下表）追补；**每一行各自一次提交**，按 `ResponseId` 幂等（[S-17](#s-17-结算一处按序幂等先到者赢)） |
| ⑤ | 每一次被对账的调用一条 `{ callId, state }`，`state ∈ { resumable, awaiting_decision, interrupted, complete, handed_up }` |
| ⑥ | `invalidInput` · `unavailable` |
| ⑦ | **幂等**：再对一次，已追补的不再追补，返回同样的结果 |
| ⑧ | 会话日志读不到、追补写不进 ⇒ `unavailable`，**不返回部分结果**——loop 不得在对账没完成时推进 |
| ⑨ | 不发 |

**对账表**（按行从上到下，第一行命中即是）：

| 日志里这次调用 | 追补 | 调用随之 |
|---|---|---|
| 有**中断意图**，最后一次发出已出门、无响应体 | 响应体：`interrupted`，`initiator` 取意图上的那个；首 token 有无取「已开口」有无；账全未知；**没有回复**（在途内容不在日志里） | `interrupted`（终态） |
| 有**中断意图**，没有在途发出 | 调用终结 `interrupted` | `interrupted`（终态） |
| 已出门，**无**已开口，无响应体 | 响应体：`interrupted{runtime_lost}`，**没有首 token**，账全未知 | **`resumable`**：loop 在新尝试里以同一个 `callId` 续接、发给同一家 |
| 已开口，无响应体 | 响应体：`interrupted{runtime_lost}`，首 token 取自「已开口」，账全未知；**已交付内容可以缺席**（在途组装不进日志） | `interrupted`（终态）；**不重发**；中断提醒由 loop 补 |
| 最后一次发出有响应体，`failed`，没有调用终结 | 无 | `awaiting_decision`：loop 重新走「调模型之后」失败那一维 |
| 最后一次发出有响应体，`interrupted{runtime_lost}`、没有首 token，没有调用终结 | 无（上一次对账已追补，续接之前又停了） | `resumable` |
| 其余（已在终态） | 无 | 原终态 |

- **「首 token 之后停机」收成被中断，不是「说到一半断了」这个故障**：主线裁定 RP-24。[PF-013 §5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token) 的原话是「算说到一半断了」——主线裁定两者说的是同一件事（主线裁定 2026-09-23，待产品负责人确认；账本 S16-g），产品修订批把原话改成与本条一致；原 G-7 闭合。**都不重发**。
- **已开口的那半句可能不在日志里**：在途组装不进日志，停机时它就没了——这时[「用户看见了的，日志里必须有」](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有)不成立，以中断提醒兜底（块 D 已裁 D-4）。**这是已知的、写明的例外**，不是本契约静默放弃。
- **一次还没出门的调用不在对账范围内**：它没留下任何记录（[S-28](#s-28-opencall) ④）；新尝试从方程重新算，会不会再打开一次新调用归 loop。

### S-34 readAttempts

| # | 内容 |
|---|---|
| ① | `callId` |
| ② | 无额外授权 |
| ③ | 无 |
| ④ | 只读，无提交 |
| ⑤ | 这次调用的状态，与它的每一次发出：序号、所在尝试、那一家、两个锚点有无、响应体（已写下的） |
| ⑥ | `invalidInput` · `callNotFound` · `unavailable` |
| ⑦ | 只读，天然可重复 |
| ⑧ | 日志读不到 ⇒ `unavailable`；**不以本能力手里的在途状态代答**——那份状态停机即失 |
| ⑨ | 不发 |

---

## 五、默认重试件

### S-35 默认重试件（可替换）

**系统自带一件挂在「调模型之后」失败那一维上的重试拓展件**（[开箱就有重试](../../../../product/PF-013-model-profiles-and-invocation/design.md#系统自带一件默认的所以开箱就有重试)），**租户可以把它替换掉**。
它是一件拓展件，走同一套位置、同一套干预力，不享受特权；**它的结论照样过 [S-30](#s-30-dispatchagain) 的守卫**。

**它的行为（它的全部规格）：**

1. **只对策略那一类出手**：最近一次发出的成因是 `upstream_unavailable` 或 `unrecognized` 时才考虑再试；其余一律不给 `retry`（给了也会被守卫拒——它不去试）。
2. **逐家一遍**：按档案快照「允许的供应商」的次序，**下一家**是最近一次发出那一家之后的那一家；**每一家至多一次**。
3. **不允许回退时同家至多再试一次**：档案快照说不允许回退 ⇒ 给一次 `retry { provider: 第一家 }`，此后不再给（主线裁定 2026-09-23，待产品负责人确认；账本 S16-g：保住「开箱就有重试」）。
4. **退避**：`after` 取具名参数 **`default_retry_backoff`**（不填值，[G-8](#十二已知缺口)）。
5. **没有下一家 ⇒ 不再试**（试尽），交回，loop 上交。

- **试尽的判定**：默认件在有限步内必判「不再试」——允许回退时每家至多一次、家数有限；不允许回退时同家至多一次再试。**自定义件不承诺这一点**（[S-3](#s-3-本契约明确不承诺什么)）。
- **续接不经过它**：首 token 之前失联之后的续接是 [S-33](#s-33-reconcile) 与 [S-29](#s-29-dispatch) 的事，不是一次重试，不占「每家至多一次」的名额。
- **它挂了**：按 `capability.loop-extension-runner` 的系统自带件不可用处置（[S-17](../../loop-extension-runner/v1/contract.md#s-17-系统自带件不可用时一律关门) 的关门表：重试件不可用 = 直接上交）；本契约只写：**它不在时，调用不会被自动再发**。

> **不允许回退的档案也有一次重试**：[PF-013 §5.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#系统自带一件默认的所以开箱就有重试) 担心的「一次网络抖动就打断一轮对话」在这类档案上由同家那一次再试兜住；退避取值仍在 [G-8](#十二已知缺口)。

---

## 六、宿主停止与撤除

### S-36 宿主停止与撤除

**一次调用跟着它的宿主停**（[PF-012 §6.13](../../../../product/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走)）：宿主（agent runtime）停下时，挂在它上面的每一次没收场的调用都被结算。

- **宿主进入停止之后**，`openCall`、`dispatch`、`dispatchAgain` 一律 `runtimeStopped`；`interrupt`、`releaseCall`、`readAttempts` 照常。
- **结算**：对每一次在途发出，按 [S-17](#s-17-结算一处按序幂等先到者赢) 在一处做完——中止 → 按首 token 规则定收场（`interrupted`，`initiator = run_cancelled`）→ 写下响应体 → 释放。没有在途发出的调用写调用终结 `interrupted`。
- **有内容的那一次**：正常路径是宿主**先**对它调 `interrupt(run_cancelled)`、让 `dispatch` 的调用方把回复与消息一起写下，**再**停止。宿主没这样做就停了，本能力的撤除只能写一条**没有回复**的响应体，已交付的块进 `delivered`——这要求 `data.model-response` 让 `interrupted` 容纳「有首 token、无回复、有已交付」这一行（[G-1](#十二已知缺口)）。**这条次序是宿主的义务**，已报给主线（loop 那一程）。
- **进程崩溃时撤除一个都不跑**：上面这些只是加速；**权威的收口是下一次尝试的对账**（[S-33](#s-33-reconcile)）。
- **本能力自身被撤除或替换**：对它手里每一次在途调用做同样的结算，再释放连接。**它拥有的全部耐久事实都在会话日志里**（六种记录）；手里的在途状态停机即失，**没有一条正确性依赖它**。

---

## 七、事件

### S-37 本契约不发事件

**本契约没有通知事件，也没有控制事件。**

- 中断、再发、放手全是直接调用的同步前置；**没有任何一次放行靠一个监听者的返回值**。
- 切换事实、锚点、响应体都在会话日志里，读日志的人看得到，**不另发一份**。
- 本能力**可以消费**会话日志的追加通知来提前推进投影的中间结果——那是性能，**正确性靠读时追到日志尾**（[S-13](#s-13-模态投影读到的必须追到日志尾)）。

---

## 八、性质与前提

**编号只在本节作行标，不是可外部引用的条款号。**

### 不变量

| 性质 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|
| **每一次发出至多一条响应体** | [S-17](#s-17-结算一处按序幂等先到者赢)：按 `ResponseId` 判重、先到者赢 | 追加口按 `ResponseId` 幂等（装配给） | `data.model-response/v1#S-4` |
| **只有出了门的发出才有响应体** | [S-8](#s-8-调用在会话日志里留下的六种记录)：`ResponseId` 在「已出门」时定下 | —— | `data.model-response/v1#S-16` |
| **每一次出网的发出都有「已出门」** | [S-15](#s-15-两个锚点先写后行) | 追加口确认即落盘 | 主线裁定 C-2；[PF-012 等模型](../../../../product/PF-012-agent-loop-and-run/design.md#等人是-loop-的原语) |
| **每一次被看见的内容都有「已开口」** | [S-15](#s-15-两个锚点先写后行) | 同上；跨进程时转发链不越过锚点 | 主线裁定 C-2 |
| **`interrupted_mid_reply` ⇔ 有首 token 的故障** | [S-18](#s-18-成因按来源分类三类事实由守卫兑现) | —— | [PF-013 §5.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类) |
| **发出序号跨尝试连续、不重不跳** | [S-5](#s-5-一次调用一次发出)、[S-22](#s-22-同一次调用的发出序列) | 同一次调用只有一个写入者（装配给） | `data.model-response/v1#S-8` |
| **每一家都在快照允许的供应商里；首次发出是第一家；续接发给同一家** | [S-22](#s-22-同一次调用的发出序列)、[S-30](#s-30-dispatchagain) 守卫 3 | —— | [PF-013 §5.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#512-重试站在一个已经存在的位置上) |
| **一次调用至多一个终态** | [S-6](#s-6-调用的状态)；[S-17](#s-17-结算一处按序幂等先到者赢) | —— | [flows §3.2](../../../../product/PF-013-model-profiles-and-invocation/flows.md#32-一次模型调用) |
| **读到的投影 = 对整份日志重算的投影** | [S-13](#s-13-模态投影读到的必须追到日志尾) | —— | [§6.18](../../../../product/PF-013-model-profiles-and-invocation/design.md#618-模态投影要答得快而且是增量维护出来的) |

### 安全性质（绝不能发生）

| 绝不能发生 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|
| **开口之后同一次调用再发——跨尝试** | [S-30](#s-30-dispatchagain) 守卫 1、[S-29](#s-29-dispatch) ③、[S-33](#s-33-reconcile) 第四行 | 「已开口」先于观察者（[S-15](#s-15-两个锚点先写后行)） | [一个逻辑回复只发一次](../../../../product/PF-013-model-profiles-and-invocation/design.md#有三件事它改不动) |
| **事实类失败之后再发** | [S-30](#s-30-dispatchagain) 守卫 2 | —— | [PF-013 §5.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#54-三类事实归本层定死其余照状态码) |
| **终态之后再发** | [S-30](#s-30-dispatchagain) ③ 的终态检查（`alreadyEnded`） | —— | [flows §3.2](../../../../product/PF-013-model-profiles-and-invocation/flows.md#32-一次模型调用) |
| **用户叫停之后又发出** | [S-31](#s-31-interrupt) ④⑧：意图先落；[S-33](#s-33-reconcile) 前两行 | 中断意图写下即返回 | [PF-012 §6.15](../../../../product/PF-012-agent-loop-and-run/design.md#615-取消先落日志再发信号) |
| **用户中断被记成故障或失联** | [S-31](#s-31-interrupt)；[S-33](#s-33-reconcile) 意图行先于失联行 | —— | [还有一种没走完](../../../../product/PF-013-model-profiles-and-invocation/design.md#还有一种没走完它不在这张表里) |
| **本地故障被报成「上游给不出」** | [S-18](#s-18-成因按来源分类三类事实由守卫兑现) 传输本地那一行 | —— | [§6.11](../../../../product/PF-013-model-profiles-and-invocation/design.md#611-成因在这个边界上分类不丢进外层按异常形态分) |
| **凭据出现在任何记录里** | [S-19](#s-19-凭据每次发出现取取值只交给传输适配)、[S-20](#s-20-写入之前脱敏) | 三个具名参数有值（[G-6](#十二已知缺口)） | [§6.16](../../../../product/PF-013-model-profiles-and-invocation/design.md#616-错误信息外泄之前要脱敏) |
| **改用别的租户、组织层的凭据** | [S-19](#s-19-凭据每次发出现取取值只交给传输适配)；目录只以发起租户取用 | 发起租户是会话持有的那一个 | [PF-013 §5.6](../../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上)；[SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) |
| **自建档案用上出厂格那一把** | [S-19](#s-19-凭据每次发出现取取值只交给传输适配)：来源取自绑定的有效模型引用，不另填 | —— | [PF-013 decisions P33](../../../../product/PF-013-model-profiles-and-invocation/decisions.md#rev-10-随裁决-3338-推出的2026-09-24) |
| **拓展件或 agent 换掉选中模型** | [S-27](#s-27-selectmodel) ②；[S-30](#s-30-dispatchagain) 计划约束 | —— | [§6.5](../../../../product/PF-013-model-profiles-and-invocation/design.md#65-切换是用户的直接命令合法目标不得拒绝) |
| **切换打断在途调用** | [S-7](#s-7-一次调用绑定了什么) 绑定 | —— | [§6.7](../../../../product/PF-013-model-profiles-and-invocation/design.md#67-生效点收到那条事实之后下一次模型请求之前) |
| **「读不到」被当成空集、没切换过、没开口、未知模型** | [S-11](#s-11-合法目标集合)、[S-9](#s-9-选中模型)、[S-16](#s-16-首-token-判据)、[S-12](#s-12-展示列表) | —— | [§6.9](../../../../product/PF-013-model-profiles-and-invocation/design.md#69-合法目标算不出来时不替用户改选) |
| **一条响应体对应上游多次请求** | [S-29](#s-29-dispatch) 末条；[S-38](#s-38-装配给的保证-vs-协议须给的保证) 传输适配义务 | 【假·研】pi-ai 缺省无隐藏重试与回退（RP-35） | `data.model-response/v1#S-24` |

### 进展性质（全部有界）

| 性质 | 上界 | 前提 | 来源 |
|---|---|---|---|
| **每一次出了门的发出终将有一条响应体** | 收场、撤除或下一次尝试的对账，三者先到的那一个 | 首 token 等待上限与停滞上限有值（[S-21](#s-21-两个时限是运行时设置项)）；停机之后终有下一次尝试（PF-012） | 主线裁定（「失联发出被追补」） |
| **首 token 之前失联的调用在下一次尝试里可以续接** | 下一次尝试的对账 | Run 未终结、恢复起新尝试 | [停机之后](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token) |
| **切换之后的下一次请求用新选中模型** | 下一次 `effectiveModel` | 之后确有下一次请求；目标仍合法且没被锁 | [§6.7](../../../../product/PF-013-model-profiles-and-invocation/design.md#67-生效点收到那条事实之后下一次模型请求之前) |
| **默认件在有限步内试尽** | 快照里允许的供应商家数 | 默认件在位 | [什么时候算试尽](../../../../product/PF-013-model-profiles-and-invocation/design.md#什么时候算试尽) |
| **凭据轮换之后下一次发出用新值** | 下一次发出 | 据点取得到租户那一把的当前值（秘密送达与轮换传播，[G-12](#十二已知缺口)） | [PF-013 §5.6](../../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上) |
| **档案恢复在册之后，指着它的会话下一次请求照常发出** | 下一次 `openCall` | 这个范围允许、模态兼容；单机现读，跨进程在新鲜度上界之内 | [PF-013 §6.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#64-撤回不删行会话指向被撤回的档案时说已下架)、[flows §1.4](../../../../product/PF-013-model-profiles-and-invocation/flows.md#14-走一遍选中的模型被下架了) 6′ |
| **中断之后这次发出停下** | 中止信号到达传输之后 | 传输响应中止（适配义务） | [§5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#单独控制中断这一次调用不动别的) |

---

## 九、装配给的保证 vs 协议须给的保证

### S-38 装配给的保证 vs 协议须给的保证

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：第一版单机，语义不变地可拆。**左列单机时由装配顺带给出，跨进程之后不会自动成立。**

| 保证 | 单机由谁给（装配给） | 跨进程之后谁重新兑现（协议给） | 做不到会怎样 |
|---|---|---|---|
| **回复消息与它的响应体同一提交** | 会话日志追加口支持多条目原子追加 | 追加协议把两条作为一个单元接收 | 有消息无响应体：对账把已收场的调用当成失联；有响应体无消息：用户看过的回复不在日志里 |
| **追加按 `ResponseId` 幂等** | 同一份日志、确定性的标识 | 追加协议按标识判重；至少一次投递不得落两遍 | 同一次发出两条响应体、**两笔钱** |
| **「已开口」先于内容被看见** | 同进程里先写锚点再转发 | 观察者在另一进程时，**转发链任何一跳都不越过锚点先送内容** | 停机后重发，**记录里两份回复** |
| **「已出门」先于出网** | 同进程里先写锚点再发请求 | 传输若在另一进程，出网那一方须在出网前确认锚点已落 | 发出去却没回来的那笔账消失 |
| **在册状态变化之后按新状态准入**（撤回、恢复在册） | 打开调用时现读中心目录的同一存储 | 中心 → 据点目录读的**新鲜度上界**（RP-36），并按写入先后单调读 | 撤回之后一段时间内仍被选中、仍被发出；或恢复之后时而发得出、时而「已下架」 |
| **凭据值只在发出时出现；来源如实** | 进程内交给传输适配；来源取自绑定的有效模型 | 秘密怎样送到据点、是否在据点落地、轮换怎样传播（[G-12](#十二已知缺口)）；取值请求带的来源随那次调用的有效模型引用一起到达、不由调用方另填（与 `capability.model-profile-directory/v1#S-22` 同一行） | 值留在不该留的地方、或轮换之后仍用旧值；或借一个假的「官方」来源让自建档案用上部署那一把 |
| **一次调用内各次发出用同一份档案快照** | 打开调用时绑定 | 续接跨进程时，快照随调用一起恢复（来自日志，不来自内存） | 按旧能力准备、按新属性发出 |
| **投影 = 从日志重算** | 中间结果与日志同处，读时追补 | 中间结果必须读得到它所追的那份日志的尾 | 投影与日志对不上，合法目标算错 |
| **同一次调用只有一个写入者、发号唯一** | 一个进程、一个在途表 | 续接者须先确认原写入者已不在（尝试栅栏） | 同号两条、两副协程各发一次 |
| **调用方身份已核实**（会话、`initiator`） | **装配给**：入口层核身份、会话打开时核归属 | 在接收边界重新验证（`data.identity-values/v1#S-30`） | 任何够得着接口的一方都能以别人的会话发调用、花别人的钱 |
| **结算写入不被尝试栅栏拒收** | 追加口对结算类记录不设栅栏 | 同 | 被关掉的尝试花掉的钱从明细里消失 |

**传输适配须兑现的九条**（传输是 pi-ai 定向 fork 加一层适配，归提供者设计；D-019）。它们**单机也不是自动成立的**——每一条都要适配层主动做到：

| # | 义务 | 做不到会怎样 |
|---|---|---|
| 1 | **每一次发出只指定一家，并禁止上游回退**；不开库自带的重试 | 一次发出之内换了家，留痕丢失，**两笔钱只记一笔** |
| 2 | **状态码从实际的 HTTP 响应取**，原样交回 | 成因分类与重试件看不到状态码 |
| 3 | **不在中途解析工具参数**；唯一的解析点在流装配 | 同一份参数两处解析出两个结果 |
| 4 | **首 token 按 [S-16](#s-16-首-token-判据) 的判据映射**；库的「开始」事件不算 | 把没开口判成开口（关掉可以重发的窗口）或反之（重发） |
| 5 | **不回落到环境变量里的凭据**；只用本能力交来的那一把 | 用错范围的凭据，账记到错的头上 |
| 6 | **不向上游送本系统的会话标识** | 内部标识外泄 |
| 7 | **不把收不下的模态静默换成占位文本**：按档案的模态声明送，或绕过那一步 | 模型「看了」一张它其实没收到的图 |
| 8 | **交回实际执行方、实际费用与费用来源** | 费用记不准；实际执行方与指定的不一致时查不出（`data.model-response` G-8） |
| 9 | **固定 base URL，拒绝重定向** | 请求连同凭据被引到别处 |

另外两条来自 `data.messages`：**我们自己那两种消息在发出前译掉、不落空不丢**（`data.messages/v1#S-35`）；**`ToolInternalMessage` 不进请求**（`data.messages/v1#S-36`）。翻译的位置在传输适配之内还是之前，归提供者设计。

---

## 十、交接、缺席与恢复

### S-39 依赖不可用、撤除与重启

- **目录、会话日志、作用域求值、投影、保管方不可用时，依赖它们的操作明确失败**（`unavailable`），不静默降级：不跳过出门前检查、不把「读不到」当「没配」「没开口」「空集」。
- **本能力拥有的全部耐久事实都在会话日志里**：六种记录（[S-8](#s-8-调用在会话日志里留下的六种记录)）。手里的在途状态只是它们的一份工作副本，**停机即失，没有一条正确性依赖它**。
- **重启之后**：没有自动行为——对账由 loop 在新尝试开始时调用（[S-33](#s-33-reconcile)）；在那之前，任何一次调用都不会被发出。
- **在途的那一次发出是外部效应，不可回滚**：它可能已经计费。撤除与停机都**不假装它没发生**——它的账被追补为全未知，而不是被抹掉（[S-17](#s-17-结算一处按序幂等先到者赢)）。

---

## 十一、规范表达与验证义务

### S-40 本版选用哪些形式工件

| 性质 | 表达 | 为什么 |
|---|---|---|
| 一次调用 × 多次发出 × 停机 × 中断 × 宿主撤除的交错：锚点次序、守卫、结算幂等、对账 | **TLA+** [`formal/Invocation.tla`](formal/Invocation.tla) ＋ [`Invocation.cfg`](formal/Invocation.cfg)，映射与前提见 [formal 入口](formal/README.md) | 这是跨提交、跨尝试、有停机的状态机：**锚点写在前还是后、意图先落还是中止先发、结算判不判重**，只有在交错里才分得出对错。每条被检查的性质都有一份把对应开关拧反的配置，**预期出反例**——证明断言能失败 |
| 合法目标、展示列表（含来源标注、按覆盖之后那条的来源取凭据）、有效模型四步（含同标识覆盖） | **规范场景**（[S-43](#s-43-切换先落事实后生效)～[S-45](#s-45-模态不兼容挡在算合法目标那一刻)、[S-48](#s-48-同路由名按层覆盖选哪条都用最具体那条)）＋ [examples](examples.md) | 纯计算，没有交错 |
| 成因按来源分类、脱敏 | **规范场景**（[S-46](#s-46-成因按来源分类与脱敏)） | 分类表逐行演练；脱敏只能对真实输出核对 |
| 投影追到日志尾 | **性质测试**：任意日志前缀上，追补之后的读 = 对全日志重算；**伸缩测量**：读的代价与历史长度无关 | 「等于重算」是一条可随机化的等式 |
| 形状 | **不建 Schema**：值形状归 data 契约；本契约写的几种记录（[S-8](#s-8-调用在会话日志里留下的六种记录)）形状归 `data.messages/v1#S-49`、`#S-50`；线上形状归组合契约 | [规格入口](../../../README.md#准入门槛与停止条件) |

**模型吸收了什么，不写成「已由模型覆盖」**：模型里「写下一条响应体」是一个原子动作、追加口不会部分成功、上游只以四种方式收场（完成、策略类故障、事实类故障、开口后故障）——
**追加口的原子性与幂等、成因分类表的内容、脱敏、凭据取值**都不在模型里，它们的证据在场景与测试。模型也**不含拓展件与 loop**：`dispatchAgain` 的调用被建成一个非确定的选择，守卫是唯一的约束。

### 规范场景

#### S-41 两家发出：第一家 429 未开口，第二家完成

档案快照：允许的供应商 `[A, B]`、允许回退。第一次发出给 A，A 回 429、没开口。默认件给 `retry { provider: B }`。

**必须观察到**：第 1 次发出一条响应体 `failed{upstream_unavailable}`、状态码 429、没有首 token、`provider = A`；调用在 `awaiting_decision`；`dispatchAgain(plan: B)` 成功；
第 2 次发出 `provider = B`，以 `complete` 收场，带回复，由调用方与消息同一提交写下；**两条响应体、两份账**。
**绝不能观察到**：只有一条响应体（传输在一次发出之内换了家）；第 2 次发出的序号不是 2。

#### S-42 开口之后断流，不重发

一次发出开口之后连接断了。

**必须观察到**：「已开口」在第一片内容交给观察者之前写下；响应体 `failed{interrupted_mid_reply}`、有首 token、已交付的块在 `delivered`、没有回复；
随后任何 `dispatchAgain` 得 `retryRefused{already_spoke}`，**哪怕 `plan` 是一家从没试过的**。
**停机一支**：在「已开口」写下之后、响应体写下之前杀掉进程；新尝试的对账追补 `interrupted{runtime_lost}`、有首 token，调用终结，**不再发出**；`dispatch` 得 `alreadyEnded`——调用已在终态，按 [S-29](#s-29-dispatch) ⑥ 的次序先于 `retryRefused{already_spoke}` 判。
**另一支（首 token 之前停机）**：在「已出门」之后、首 token 之前杀掉进程；对账追补 `interrupted{runtime_lost}`、没有首 token、账全未知；调用 `resumable`；续接之后第 2 次发出给**同一家**、序号 2、所在尝试是新的那一次。

#### S-43 切换先落事实后生效

会话选中模型 M1；一次调用 C1 正在 M1 上发出。用户切到 M2（合法目标）。

**必须观察到**：切换事实先写下，然后 `selectModel` 返回；C1 照样在 M1 上收场（它的档案快照与有效模型已绑定）；**下一次** `effectiveModel` 给出 M2。
**另一支**：切换事实写不进 ⇒ `unavailable`，选中模型仍是 M1。

#### S-44 已下架的档案

会话选中模型 M1；管理员撤回 M1。

**必须观察到**：`displayList` 上 M1 仍在、注记 `withdrawn`；`legalTargets` 不含 M1；下一次 `openCall` 以 `undispatched{withdrawn}` 结束、没有响应体；**选中模型仍是 M1**——不替用户改选。
`selectModel(M1)` 得 `notLegalTarget{because: [withdrawn]}`。
**恢复一支**：随后 M1 恢复在册，用户什么都没做——`legalTargets` 又含 M1、`displayList` 上 M1 注记 `legal`；**下一次 `openCall` 照常打开**、有效模型仍是 M1（[S-9](#s-9-选中模型)）；日志里没有任何一条切换事实。

#### S-45 模态不兼容挡在算合法目标那一刻

会话里进来一张图，没有 transcript。M1 只收文本；M2 收文本与图，但本据点的传输送不出图（改用第三支验证）。

**必须观察到**：`legalTargets` 不含 M1；投影读到的含 `image`，与对整份日志重算的一致；
M1 若是选中模型，`displayList` 上它带 `modality_mismatch`；**第三支**：本据点传输能承载的模态不含 `image` ⇒ M2 也不在合法目标里，哪怕它的档案声明收图。
**再加一步**：给那张图补上 transcript（转换件产出）⇒ 投影不再挡 M1（[§5.11](../../../../product/PF-013-model-profiles-and-invocation/design.md#511-有-transcript-的块不再把任何模型挡在外面)）。

#### S-46 成因按来源分类与脱敏

用一段已知的凭据原文 V，对下列各源各造一次失败：本地适配层抛错；连不上；上游 401；上游 400；上游 503；上游在首 token 之后回 500；上游返回一个表里没有的状态码。

**必须观察到**：依次是 `unrecognized`（带本地错误留痕）、`upstream_unavailable`、`credential_unavailable`、`request_rejected`、`upstream_unavailable`、`interrupted_mid_reply`（状态码 500 原样）、`unrecognized`（状态码原样）——**状态码到成因的具体映射按 `status_cause_table` 取值，本场景只核分类来源与优先级**；
全部响应体、原始响应留存与本地错误留痕里**找不到 V**，也找不到 V 的任何不短于 `credential_fragment_min_length` 的片段。

#### S-47 用户叫停之后停机，不再发出

一次发出在途、没开口；用户 `interrupt(user)`；中断意图写下之后、中止生效之前杀掉进程。

**必须观察到**：对账按意图行追补 `interrupted`（`initiator = user`）、没有首 token；调用终结；**不是 `resumable`，不再发出**。
**绝不能观察到**：追补成 `runtime_lost` 然后续接——那是把用户叫停的东西又跑了起来。

#### S-48 同路由名按层覆盖：选哪条都用最具体那条

（2026-09-24 规格修订批追加；同日按产品负责人裁定「路由名就是能力，从下往上在运行时覆盖」改写。）会话属于租户 T，T 没配自己那一把；部署给出厂格配了一把。有一条官方档案与 T 所在组织的组织层建的一条自建档案，**路由名相同**。

**必须观察到**：
- `displayList` 里两条都在，`ref` 不同——一条 `origin = official`，一条 `origin = custom`、`scope` 是那个组织层；**两条都带 `credential_missing`**：官方那条被组织层那条覆盖，按那条的来源问（[S-12](#s-12-展示列表)）。
- 选中官方那条时，`effectiveModel` 给出 `profile` = 组织层那条、`selected` = 官方那条、`selectedBy = session`；`openCall` 以 `undispatched{credential_unavailable}` 结束——**不落到官方那条去用出厂格那一把**（[G-15](#十二已知缺口)）。
- **T 配上自己那一把之后**：两条都不带 `credential_missing`；选哪条，发出时 `route.profile` 都是组织层那条、`route.credentialScope` 都是 T 的租户层。
- **T 在自己那层再建一条同名的**：选三条里任何一条，`route.profile` 都是 T 租户层那条。
- **另跑一支（组织锁）**：组织把「用哪个模型」锁成官方那条——`selectedBy = layer_lock`，`profile` 仍是覆盖之后那条（路由名相同）。

**绝不能观察到**：被覆盖的官方那条经出厂格那一把发出；任何一条自建档案的发出用上出厂格那一把；同名几条在列表里无法区分；覆盖改写了选中模型或写了切换事实。

---

## 十二、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决，实现不得据一个看起来合理的猜测推进。

| # | 缺口 | owner | 闭合条件 |
|---|---|---|---|
| G-1 | **已闭合（2026-09-24 整批对齐）**：`data.model-response` 已有 `interrupted.initiator` 三值与那两行、`attemptId` 在每一次发出上、`route.profileSnapshot` 与 `route.credentialScope`；`data.call-accounts` 已有 `late` 与明细的 `initiator`（S-38、S-39）；本契约各处改为引用那里的条款号 | — | — |
| G-2 | **已闭合（2026-09-24 整批对齐）**：五种记录的形状归 `data.messages/v1#S-49`、`#S-50`（账本 S16-d） | — | — |
| G-3 | **已闭合（2026-09-24 整批对齐）**：`ModelCallRequest` 按账本 S16-c 定形——`callId?`、`parameters`、`tools: CapabilityId[]`、`targetChangedBy?` | — | — |
| G-4 | **「用哪个模型」那一项在 PF-002 里怎样声明**：输入已定为 `capability.asset-evaluation` 求值结果里那一项在会话格上的允许集合（账本 S16-i）；它挂在哪类资产上、取值域（档案引用的集合？）与「配成不允许」怎样配，产品正文尚未定义 | PF-002 owner（产品修订批） | 那一项立起来；本契约 [S-11](#s-11-合法目标集合) 改为引用它的项名 |
| G-5 | **`status_cause_table` 的内容**：OpenRouter 各状态码（含 402 余额不足、403 内容审核）归哪个成因 | 提供者设计（据 OpenRouter 文档取证）；有产品含义的几条报主线 | 表定下并随传输钉版本一起取证 |
| G-6 | **脱敏三个具名参数的取值**：`credential_fragment_min_length`、`credential_header_names`、`credential_patterns` | 提供者设计 ＋ 安全评审 | 取值定下，并以哨兵串场景（S-46）验证 |
| G-7 | **已闭合（2026-09-24 整批对齐）**：首 token 之后停机 = `interrupted{runtime_lost}`，与 PF-013 §5.13「说到一半断了」是同一件事的措辞（账本 S16-g，产品修订批改原话） | — | — |
| G-8 | **默认重试件的退避值**：`default_retry_backoff` 不填值（同家要不要再试已裁：不允许回退时同家至多一次，账本 S16-g） | 产品负责人（PF-013 §5.12）；项名由产品修订批登进 PF-002 | 产品定下退避取值归设置还是常量、取多少 |
| G-9 | **两个时限设置项的声明与默认值**：项名 `first_token_wait_limit`、`post_first_token_stall_limit` 已定为正式名（主线裁定），它们在哪类资产的推出规则里声明、默认值由谁给未定 | PF-002 owner（产品修订批）；那一类资产的正文契约 | 设置项在 PF-002 清单里立起来、所在正文契约的推出规则产出它们 |
| G-10 | **传输适配九条中依赖研究假设的几条**（1、2、4、5、7）：pi-ai 缺省行为是【假·研】，未升 basis | 提供者设计（RP-35） | basis 条目带 probe 立起来 |
| G-11 | **宿主停止时有内容的那一次调用**：宿主先 `interrupt(run_cancelled)` 再停，是 loop 一程的义务；没做到时本能力写的那一条没有回复 | loop 那一程（主线） | loop 契约写明宿主停止的次序 |
| G-12 | **中心 ↔ 据点的线上形状与协议义务**：[S-38](#s-38-装配给的保证-vs-协议须给的保证) 右两列里跨中心与据点的几行 | 架构（组合契约起草） | 那份组合契约成立并逐行兑现 |
| G-13 | **设计依据里的主线裁定无处可链**：C-2、C-10～C-14、RP-5、RP-9、RP-12、RP-24、RP-25、U-11 与拆分都在任务区 | 主线 | 落决定记录，[设计依据](#设计依据)改为链接 |
| G-14 | **已闭合（2026-09-24 整批对齐）**：`capability.stream-assembly`、`capability.modality-projection`、`capability.asset-evaluation` 登进 catalog，S-4 表补齐；`data.arrival-events` 与 `capability.loop-extension-runner` 只是指路、不登（后者消费本契约，反向登记会成环） | — | — |
| G-15 | **同标识覆盖选中的最具体那条用不了时要不要让位**：它已撤回、这个范围不允许、模态对不上或缺凭据时，是照本版写的**不落下去、以相应成因挡下**（[S-10](#s-10-有效模型四步每步来源可查) 第 2′ 步，缺席默认取拒绝），还是像资产那样「用不了的退出、落到下一层同名的」。本版的后果：租户建过同名自建档案又撤回，同名官方档案对这个租户就一直挡着（行不删），直到他恢复在册；组织层建了同名自建档案，成员没配自己那一把之前同名官方档案也用不上 | 产品负责人（PF-013 rev 12 补「同名按层覆盖」时一并答） | 裁定落进 PF-013，本契约 S-10、S-11、S-12 与 `capability.model-profile-directory` v1 S-17 末段同改 |
| G-16 | **被覆盖的同名条目在展示列表上怎样说明「实际用的是哪一条」**：本版每条标自己的来源、注记按覆盖之后那条算（[S-12](#s-12-展示列表)），但不说选它实际落到哪一条 | 产品负责人（PF-013 §6.3）与交付面（PF-016） | 产品定下呈现（标明被哪一条覆盖、或不列被覆盖的），本契约 S-12、S-25 ⑤ 随之补 |

---

## 十三、消费者核对

本节不新增承诺，只走一遍具名消费者的路径。**发现不够用时回到本契约补条款，不在消费者那边自己算一份。**

| 消费者 | 它要什么 | 本契约给什么 | 够不够 |
|---|---|---|---|
| **agent loop：「等模型」** | 打开、发出、等收场、拿回复、失败交拓展件、再发或放手 | [S-28](#s-28-opencall)～[S-32](#s-32-releasecall) | **够** |
| **agent loop：先对账** | 每次没收场的调用该怎么接 | [S-33](#s-33-reconcile) | **够** |
| **「调模型之前」的 `select_model`** | 合法目标集合 | [S-24](#s-24-legaltargets) | **够**；它改的目标在 [S-28](#s-28-opencall) 出门前检查里再核一遍 |
| **「调模型之后」失败那一维的重试件** | 状态码、成因、档案两项声明、已试过哪些 | [S-29](#s-29-dispatch) ⑤ 的失败返回 ＋ [S-34](#s-34-readattempts) | **够** |
| **交付面：切换命令、模型列表** | 展示列表（每条带来源）、切换 | [S-25](#s-25-displaylist)、[S-27](#s-27-selectmodel) | **够**，前提 G-4 |
| **交付面：停止按钮** | 中断这一次 | [S-31](#s-31-interrupt) | **够** |
| **账本与排查** | 每次发出一条响应体、真实费用、原始响应 | [S-17](#s-17-结算一处按序幂等先到者赢)、[S-20](#s-20-写入之前脱敏) | **够** |
| **应用装配（据点）** | 传输能承载的模态、传输适配 | [S-11](#s-11-合法目标集合)、[S-38](#s-38-装配给的保证-vs-协议须给的保证) | **够**，前提 G-10 |

---

## 十四、版本差异与规范工件

**本版是首版**，没有被采用的旧版本，因此没有语义或表示差异可记，也没有消费者迁移；`registry/lineage.json` 不因本契约增加条目。

**来历**：施工简报 S16 原把档案登记、撤回、凭据绑定与调用放在一份契约里，操作是 `invoke`（内部循环重试）；块 C 机制读数之后主线把它拆成中心侧 `capability.model-profile-directory` v1 与据点侧本契约，
并把调用拆成 `openCall`／`dispatch`／`dispatchAgain`／`interrupt`／`reconcile`（重试不在调用内部循环，经拓展件与发出守卫）。拆分前的草稿从未成稿，不构成前身。

**本版的规范工件**：本文件、[`examples.md`](examples.md)、[`formal/Invocation.tla`](formal/Invocation.tla) 与它的配置、[formal 入口](formal/README.md)。执行结果在[验证入口](../verification.md)，不写进本版本目录。

**发布后**：本目录下的规范正文、实例与模型不可原地覆盖；修改发布新版本。[已知缺口](#十二已知缺口)里改变语义或表示的项在冻结之后闭合，**出新版本**；冻结之前在本候选里原地改，每次改在[验证入口「变化的影响」](../verification.md#变化的影响)记一笔。
