# capability.model-request-runtime v1

> 候选规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.model-request-runtime, 1)`——
  `family = capabilities`、`topic = model-request-runtime`、规范路径 `spec/capabilities/model-request-runtime/v1/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：`candidate`（2026-09-23 起草；2026-09-24 经第一轮独立评审并按处置修订，处置见[验证入口](../verification.md#独立评审)；修复波 1b 补模型侧到达装配前提的承诺与追补体参数三项的来源；2026-09-25 修复波 2 按第二轮独立复评补撤除走放弃、「已开口」写不进那一支、被拒事件的日志事件、按（会话，目标）路由与允许集合来源的缺口，见[验证入口「变化的影响」](../verification.md#变化的影响)）——未接受、未冻结
- **设计依据**：见[下一节](#设计依据)。产品依据以 **PF-013 rev 12** 为准（rev 11 只动转换件呈现的落点，不影响本契约条款；rev 12 的同名按层覆盖、设置记路由名已落进本契约），另引 PF-012 rev 14、PF-009 rev 8、PF-004 rev 12、PF-001 rev 17、PF-015 rev 11（逐 rev 复核结论在[验证入口「变化的影响」](../verification.md#变化的影响)）
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
  - `omne-harness-lite-design-2026-09-15 · data.arrival-events · v1`（candidate）——到达事件的目标、砍、收尾与第一个内容步骤（[S-16](#s-16-首-token-判据)、[S-51](#s-51-模型侧到达装配前提的承诺) 据以写出承诺；2026-09-25 修复波 2 登记，第二轮评审 R2-MRR-2；它不依赖本契约，无环）
  - 以上三份（流装配、模态投影、求值）在 2026-09-24 整批对齐登记进 catalog（原 G-14）。`capability.loop-extension-runner` v1 只是指路（被拒的 `retry` 怎样记下、系统自带重试件不可用怎样关门归它），本契约不据以写出任何承诺，不登依赖——**runner 反过来消费本契约的合法目标与再发守卫**，登这一条会成环
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
| 官方与自建在同一份列表里，每一条标着来源（官方 / 自建，自建的再带建在哪一层）；**设置记路由名，同名的几行在运行时按层覆盖，租户 > 组织 > 官方**；**一个名字能选的只有一行**，被盖住的照列、只作标注；「已下架」说的是名字（产品负责人 2026-09-24 裁定：「允许并存，它就像资产一样，路由名就是能力，从下往上（租户 -> 组织 -> official）在运行时覆盖」；PF-013 rev 12 §4「档案的身份」、§5.10、§6.3、§6.4） | [PF-013 §6.3](../../../../product/PF-013-model-profiles-and-invocation/design.md#63-官方与自建在同一份列表里) · [§5.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事) · [§4 档案的身份](../../../../product/PF-013-model-profiles-and-invocation/design.md#档案的身份所在范围加路由名) | S-9、S-10、S-11、S-12、S-24～S-28 |
| 已撤回的可以恢复在册；指着它的会话不用换就接得上 | [PF-013 §6.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#64-撤回不删行会话指向被撤回的档案时说已下架) · [flows §1.4](../../../../product/PF-013-model-profiles-and-invocation/flows.md#14-走一遍选中的模型被下架了) 第 6′ 步 | S-9、S-12 |
| 上交带八个成因与原样状态码 | [PF-013 §5.7](../../../../product/PF-013-model-profiles-and-invocation/design.md#57-上交带什么原样带着状态码不翻译它) · [§6.11](../../../../product/PF-013-model-profiles-and-invocation/design.md#611-成因在这个边界上分类不丢进外层按异常形态分) · [§6.14](../../../../product/PF-013-model-profiles-and-invocation/design.md#614-上交带的成因是封闭枚举外加一个诚实的兜底状态码另外原样带着) | S-18 |
| 换模型：一条事实、一个生效点、零个新分支 | [PF-013 §5.9](../../../../product/PF-013-model-profiles-and-invocation/design.md#59-换模型一条事实一个生效点零个新分支) · [§6.5](../../../../product/PF-013-model-profiles-and-invocation/design.md#65-切换是用户的直接命令合法目标不得拒绝)～[§6.8](../../../../product/PF-013-model-profiles-and-invocation/design.md#68-不为切换新增分支) · [flows §3.3](../../../../product/PF-013-model-profiles-and-invocation/flows.md#33-一个会话的选中模型) | S-9、S-27 |
| 选中模型（一个路由名）与有效模型（它这一次落到的那一行） | [PF-013 §4](../../../../product/PF-013-model-profiles-and-invocation/design.md#选中模型-与-有效模型) · [PF-004 §6.6](../../../../product/PF-004-agent-definition-and-assembly/design.md#66-模型在每次请求时确定) | S-9、S-10、S-26、S-27 |
| 合法目标集合与展示列表是两件事；算不出来不替用户改选；模态挡在这一刻 | [PF-013 §5.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事) · [§5.11](../../../../product/PF-013-model-profiles-and-invocation/design.md#511-有-transcript-的块不再把任何模型挡在外面) · [§6.9](../../../../product/PF-013-model-profiles-and-invocation/design.md#69-合法目标算不出来时不替用户改选) · [§6.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#610-模态兼容挡在算合法目标那一刻不挡在出门那一刻) | S-11、S-12、S-24、S-25 |
| 重试站在已有的位置上；默认件；它改不动的三件事 | [PF-013 §5.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#512-重试站在一个已经存在的位置上) · [§6.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#612-事实判断归本-topic策略归拓展件) · [§6.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#613-试尽由拓展件判定档案的两项声明是它的输入) · [什么时候算试尽](../../../../product/PF-013-model-profiles-and-invocation/design.md#什么时候算试尽) | S-30、S-35 |
| 单独控制；停机看首 token；只有一个宿主 | [PF-013 §5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token) · [停机之后](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token) · [它只有一个宿主](../../../../product/PF-013-model-profiles-and-invocation/design.md#它只有一个宿主所以只有一种结局) | S-15、S-31、S-33、S-36 |
| 脱敏 | [PF-013 §6.16](../../../../product/PF-013-model-profiles-and-invocation/design.md#616-错误信息外泄之前要脱敏) | S-20 |
| 本 topic 不出现任何时限数值；超时是运行时设置项、退避是重试件的配置 | [PF-013 §6.17](../../../../product/PF-013-model-profiles-and-invocation/design.md#617-本-topic-不出现任何时限数值) | S-21、S-35 |
| 模态投影要答得快、增量维护 | [PF-013 §6.18](../../../../product/PF-013-model-profiles-and-invocation/design.md#618-模态投影要答得快而且是增量维护出来的) · [flows §3.4](../../../../product/PF-013-model-profiles-and-invocation/flows.md#34-一个会话的模态投影) | S-13 |
| 「等模型」是 loop 的等待；先对账再进方程（出门了没开口就没了 → 照常再发；开口了没说完就没了 → 绝不再发、追补中断提醒） | [PF-012 等人是 loop 的原语](../../../../product/PF-012-agent-loop-and-run/design.md#等人是-loop-的原语) · [先对账，再进方程](../../../../product/PF-012-agent-loop-and-run/design.md#先对账再进方程) | S-15、S-33 |
| 每一次模型调用都适用：挂件、压缩闭包、不属于任何 Run 的旁路提问；宿主恒为 agent runtime；不属于任何 Run 的花费归会话 | [PF-013 它只有一个宿主](../../../../product/PF-013-model-profiles-and-invocation/design.md#它只有一个宿主所以只有一种结局) · [PF-012 agent runtime](../../../../product/PF-012-agent-loop-and-run/design.md#agent-runtime) | S-5、S-33 |
| 已发起的账迟到了照样落、归这个 Run、标明迟到 | [PF-012 §6.17 I-11](../../../../product/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式) | S-17 |
| 回复在落盘之前被否决不是调用失败：那次调用照常结束、记下被谁否决，不交给重试挂件 | [PF-012 否决按产生者分三路](../../../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前的否决按消息是谁产生的分三路) | S-6、S-29、S-49 |
| 取消跟着宿主走；取消先落日志再发信号 | [PF-012 §6.13](../../../../product/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走) · [§6.15](../../../../product/PF-012-agent-loop-and-run/design.md#615-取消先落日志再发信号) | S-31、S-36 |
| 成本两层；挂件自己花的钱 | [PF-012 成本两层](../../../../product/PF-012-agent-loop-and-run/design.md#成本两层缺哪一层都会算错) · [挂件自己花的钱](../../../../product/PF-012-agent-loop-and-run/design.md#挂件自己花的钱算它插手的那个-run) | S-5、S-17 |
| 流断在半路；用户看见了的日志里必须有 | [PF-009 §5.6](../../../../product/PF-009-context-message-types/design.md#56-流断在半路) · [§6.9](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有) | S-15、S-29 |
| 会话持有创建那一刻的租户身份；成本算到发起它的租户 | [PF-015 §6.12](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#612-会话持有创建那一刻的租户身份) · [PF-001 §6.4](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) | S-7、S-19 |
| 所有模型请求经 OpenRouter；单机交付可拆 | [SYS-LLM](../../../../foundation/cross-system-constraints/requirements.md#sys-llm) · [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) | S-38 |
| 接受／拒绝要有可定位、可解释的日志依据 | [SYS-OBSERVABILITY](../../../../foundation/observability-and-logging/requirements.md#sys-observability全链路可观测与日志完备) C3 | S-51 第 4 条 |
| 传输选 pi-ai 定向 fork | [D-019](../../../../record/decisions/model-provider-pi-ai-fork/decision.md) | S-38 |
| 统一语言 | [一次模型调用](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call) · [模型档案](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-profile--模型档案--model-profile) · [模型凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential) · [选中模型](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-selected-model--选中模型--selected-model) · [有效模型](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-effective-model--有效模型--effective-model) · [模态](../../../../ubiquitous_language/terms/record-and-context.md#ul-modality--模态--modality) · [模态投影](../../../../ubiquitous_language/terms/record-and-context.md#ul-modality-projection--模态投影--modality-projection) · [非常态](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-off-nominal--非常态--off-nominal) · [上交](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-escalation--上交--escalation) · [调用账目](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-call-account--调用账目--call-account) · [附件](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-attachment--附件--attachment) · [模型请求参数](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-request-parameters--模型请求参数--model-request-parameters) · [agent runtime](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-agent-runtime--agent-runtime--agent-runtime) · [会话日志](../../../../ubiquitous_language/terms/record-and-context.md#ul-session-log--会话日志--session-log) · [会话据点](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-session-base--会话据点--session-base) · [模型响应体](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-response--模型响应体--model-response) · [一次发出](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-upstream-send--一次发出--upstream-send) · [首 token](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-first-token--首-token--first-token) · [模型切换](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-switch--模型切换--model-switch) · [合法目标集合](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-legal-target-set--合法目标集合--legal-target-set) · [模型展示列表](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-model-display-list--模型展示列表--model-display-list) · [模型调用上交成因](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call-escalation-cause--模型调用上交成因--model-call-escalation-cause) | 全部正式名 |

**（无词条）**：「已出门」「已开口」「中断意图」「调用终结」四种记录（形状归 `data.messages/v1#S-49`、`#S-50`）；「出门前检查」「发出守卫」「保管方」「本据点传输能承载的模态」。它们只在本契约与所引 data 契约里有定义，报给主线。

> **不在上表的依据**——主线裁定链到 [D-040](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md)（产品负责人尚未逐条追认，依据仍是 D-040），产品行已写上的改引产品正文：
>
> | 条款 | 依据 |
> |---|---|
> | 本契约住在据点侧、与中心侧档案目录拆成两份 | 主线裁定，见 [D-040 §块 C 拆分提案（推荐 A/A/A：运行时选择与调用同在·据点）](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#块-c-拆分提案报回的推荐-aaa目录独立插件中心运行时选择与调用同在据点模态转换独立登记表据点) |
> | [S-33](#s-33-reconcile) 对账表的两行（出门没开口 → 续接；开口没说完 → 被中断、不再发） | 产品行：[PF-012 先对账，再进方程](../../../../product/PF-012-agent-loop-and-run/design.md#先对账再进方程)、[PF-013 停机之后](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token)；首 token 之后停机收成 `interrupted{runtime_lost}` 是主线裁定，见 [D-040 §S16 S16-g](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的) |
> | [S-8](#s-8-调用在会话日志里留下的六种记录)、[S-15](#s-15-两个锚点先写后行) 两个锚点及其次序 | **规格层推导**：对账表那两行要判得出，停机之后就得有「已出门」「已开口」两条耐久记录，且各自先于它要保护的那件事写下（反例在 S-15）；记录的家是主线裁定，见 [D-040 §S16 S16-d](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的) |
> | [S-5](#s-5-一次调用一次发出) 调用跨尝试延续、发出序号跨尝试连续、尝试号属于每次发出 | 主线裁定，见 [D-040 §块 C 对账 C-R7](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#块-c-对账d-reconciliation-c需主线看八项) |
> | [S-11](#s-11-合法目标集合) 本据点传输能承载的模态 | 主线裁定，见 [D-040 §块 C 对账 C-R5](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#块-c-对账d-reconciliation-c需主线看八项)；它是**可发出的另一条前置，不是合法目标集合的第四项**（主线裁定，见 [D-040 §五 K40](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)） |
> | [S-9](#s-9-选中模型) 初值来自设置求值、[S-10](#s-10-有效模型四步每步来源可查) 四步 | 产品行：[PF-013 §4 选中模型与有效模型](../../../../product/PF-013-model-profiles-and-invocation/design.md#选中模型-与-有效模型)（设置在会话那一格、上层锁死、四步求值外加「调模型之前」的改写） |
> | [S-21](#s-21-两个时限是运行时设置项) 时限是运行时设置项 | 产品行：[PF-013 §6.17](../../../../product/PF-013-model-profiles-and-invocation/design.md#617-本-topic-不出现任何时限数值) |
> | [S-17](#s-17-结算一处按序幂等先到者赢) 结算写入不受尝试栅栏拒收 | 产品行：[PF-012 §6.17 I-11](../../../../product/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式)；标记见 `data.call-accounts/v1#S-39` |
> | [S-5](#s-5-一次调用一次发出) 挂件、压缩闭包、旁路提问里的调用同样适用 | 产品行：[PF-013 它只有一个宿主](../../../../product/PF-013-model-profiles-and-invocation/design.md#它只有一个宿主所以只有一种结局) 末段 |
> | [S-28](#s-28-opencall) 出门前检查核有效模型，失败即上交 | 产品行：[PF-013 §6.9](../../../../product/PF-013-model-profiles-and-invocation/design.md#69-合法目标算不出来时不替用户改选) |
> | [S-31](#s-31-interrupt) `initiator` 三值 | 主线裁定，见 [D-040 §S16 S16-g、S16-i](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的) |
> | [S-8](#s-8-调用在会话日志里留下的六种记录) `ResponseId` 在「已出门」时铸、[S-30](#s-30-dispatchagain) 已终结只用 `alreadyEnded`、[S-32](#s-32-releasecall) 放手、[S-35](#s-35-默认重试件可替换) 默认件的次序与同家至多一次 | 主线裁定，见 [D-040 §S16 S16-a、S16-b、S16-g](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的) |
> | [S-28](#s-28-opencall) 调用请求的成员名与 `ModelRequest` 逐字相同 | 主线裁定，见 [D-040 §S16 S16-c](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的) |
> | 工具清单是模型面名字（[S-28](#s-28-opencall) ①）、`session` 进指认调用的操作（[S-5](#s-5-一次调用一次发出)）、绑定落在「已出门」（[S-7](#s-7-一次调用绑定了什么)）、再发时取不到凭据写 `released{cause}`（[S-29](#s-29-dispatch) ⑧）、只读守卫（[S-50](#s-50-candispatchagain)）、回复被否决或被系统使用的响应体由本能力写（[S-17](#s-17-结算一处按序幂等先到者赢)、[S-49](#s-49-settlereply)）、传输承载是另一条前置（[S-11](#s-11-合法目标集合)）、允许集合元素是路由名 | 主线裁定，见 [D-040 §五 K10、K19、K20、K21、K22、K36、K40、K42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) |
> | `settleReply` 这个服务面名、`openCall` 的 `basis` 成员、`reply_pending` 状态、会话重新承载时的对账时机、`canDispatchAgain` 收 `plan` | 规格层推导（理由写在各条正文），主线接受，见 [D-040 §六 N-9](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)（原 G-13 闭合） |
> | 「已出门」带传输适配定下的改值与丢项、追补体的参数三项从它读（[S-7](#s-7-一次调用绑定了什么)、[S-29](#s-29-dispatch) ④、[S-33](#s-33-reconcile) ④）；本能力逐条承诺到达装配的宿主前提、传输适配不做逆转写（[S-51](#s-51-模型侧到达装配前提的承诺)） | 主线裁定，见 [D-040 §六 L4、L6](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)（原 G-18 闭合；`capability.stream-assembly` 的 G-2 随之闭合）；不做逆转写同 [§五 K10](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) |
> | 撤除与系统发起的运行取消时在途的流一律放弃、收场仍是 `interrupted{run_cancelled}`（[S-36](#s-36-宿主停止与撤除)、[S-51](#s-51-模型侧到达装配前提的承诺) 第 6 条）；「已开口」写不进交 `finish{lost, error{cause: unrecognized}}`、块不进 `delivered`（S-51 第 6、7 条）；被拒的事件记一条结构化日志事件、按（会话，目标）路由、只推给本会话的观察者（S-51 第 1、4、9 条）；`trims` 一次也没砍时缺席（S-51 第 7 条）；允许集合的来源立缺口、G-4 只留取值域（[G-19](#十二已知缺口)） | 主线裁定，见 [D-040 §七 M12、M15、M16、M17、M24](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加) |

---

## 一、含义与使用范围

### S-1 本契约拥有什么

**会话据点上，一个会话怎样选模型、每一次[模型调用](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call)怎样发出、怎样收场、停机之后怎样对账。**

> **名字的说明**：统一语言里「模型请求运行时」指**执行某一次调用的那一段**，与那次调用同生同灭（UL-model-call 注意 ②）。
> 本契约的 topic 沿用这个词，**拥有的是承载全部调用的那一项能力**；正文里「一次调用」一律指 UL-model-call，不用「运行时」指单次调用。

| # | 拥有的事实或判定 | 正文 |
|---|---|---|
| 1 | **会话的[选中模型](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-selected-model--选中模型--selected-model)**：[模型切换](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-switch--模型切换--model-switch)落下的那条记录条目怎样写、选中模型怎样从日志读出 | [S-9](#s-9-选中模型)、[S-27](#s-27-selectmodel) |
| 2 | **[有效模型](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-effective-model--有效模型--effective-model)的求值**：四步、每步来源可查 | [S-10](#s-10-有效模型四步每步来源可查)、[S-26](#s-26-effectivemodel) |
| 3 | **合法目标集合与展示列表**的求值 | [S-11](#s-11-合法目标集合)、[S-12](#s-12-展示列表)、[S-24](#s-24-legaltargets)、[S-25](#s-25-displaylist) |
| 4 | **会话模态投影的读**：权威在日志，读到的必须追到日志尾 | [S-13](#s-13-模态投影读到的必须追到日志尾) |
| 5 | **一次调用的状态、每一次发出、每一次发出的收场**，以及调用在会话日志里留下的那几种记录 | [S-5](#s-5-一次调用一次发出)～[S-8](#s-8-调用在会话日志里留下的六种记录)、[S-28](#s-28-opencall)～[S-32](#s-32-releasecall) |
| 6 | **三类事实的兑现**：发不出去、重试没用、已经开口——由发出守卫兑现，任何拓展件推翻不了；守卫另有只读的判定面 | [S-18](#s-18-成因按来源分类三类事实由守卫兑现)、[S-30](#s-30-dispatchagain)、[S-50](#s-50-candispatchagain) |
| 7 | **首 token 判据与两个锚点的次序** | [S-15](#s-15-两个锚点先写后行)、[S-16](#s-16-首-token-判据) |
| 8 | **中断**：只作用于一次调用，先落意图再中止 | [S-31](#s-31-interrupt) |
| 9 | **停机之后的对账**：按锚点与响应体决定追补什么、能不能再发 | [S-33](#s-33-reconcile) |
| 10 | **成因分类、凭据现取、脱敏** | [S-18](#s-18-成因按来源分类三类事实由守卫兑现)～[S-20](#s-20-写入之前脱敏) |
| 11 | **系统自带的默认重试件**的行为（可替换） | [S-35](#s-35-默认重试件可替换) |
| 12 | **模型侧的[到达装配](../../../../ubiquitous_language/terms/record-and-context.md#ul-arrival-assembly--到达装配--arrival-assembly)宿主**：持有每一次发出的那份装配状态，逐条兑现 `capability.stream-assembly` 要宿主兑现的前提 | [S-51](#s-51-模型侧到达装配前提的承诺) |

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
| **回复消息**的写入：回复落盘成了消息的那条响应体（`replyDisposition = persisted`）与它的消息由调用方在同一提交里写下 | loop ＋ 会话日志追加口（[S-17](#s-17-结算一处按序幂等先到者赢)、[S-38](#s-38-装配给的保证-vs-协议须给的保证)） |
| **交回未写的回复在调用方自己结束之前收口**：落盘成消息，或经 [S-49](#s-49-settlereply) 交回「被否决／被系统使用」 | loop（[G-11](#十二已知缺口)）；没收口时本能力的兜底见 [S-17](#s-17-结算一处按序幂等先到者赢) |
| **组装**：这一次请求里装了什么、用了哪份派生表示 | PF-010 组装 |
| **会话日志**：追加口、尝试栅栏、全序 | 会话日志的拥有者 |
| **「一步之内至多一次模型调用」的判定**；挂件与压缩闭包里的调用算不算「这一步的那一次」 | loop |
| **自定义重试件的终止性**：它是否终将判「不再试」 | 不承诺（[S-35](#s-35-默认重试件可替换) 只对默认件承诺试尽） |
| **插队时中断哪些调用** | loop／PF-014（本契约的 `interrupt` 只作用于一个 `callId`） |
| **连续被否决的调用上限**：回复在落盘之前被否决之后，再试是 loop 另起的新调用 | loop |

### S-4 依赖方向与被消费的面

**依赖方向是单向的：本契约 → 档案目录、档案形状、响应体、拓展件、账、块、消息、工具定义、身份值、时间点、到达事件，以及流装配、模态投影、求值。**
`capability.model-profile-directory` 不消费本契约。

**下表每个 `#S-n` 前缀省去了坐标 `omne-harness-lite-design-2026-09-15 · <contract_id> · v1`；catalog 的 `clauses` 以它为准。**

| 被消费的条款 | 用在哪 |
|---|---|
| `capability.model-profile-directory` `#S-6` 范围链 | [S-11](#s-11-合法目标集合) |
| `capability.model-profile-directory` `#S-16` readProfile（含已撤回行，三收场不折叠） | [S-10](#s-10-有效模型四步每步来源可查)、[S-12](#s-12-展示列表)、[S-28](#s-28-opencall) |
| `capability.model-profile-directory` `#S-17` listProfiles（每项带引用，同一个路由名可出现几次）；末段从路由名到一行的规则 `胜出行(T, r, A)`／`落点(T, r, A)`，允许集合 `A` 是显式参数 | [S-10](#s-10-有效模型四步每步来源可查)、[S-11](#s-11-合法目标集合)、[S-12](#s-12-展示列表) |
| `capability.model-profile-directory` `#S-20` resolveCredential：以发起租户与档案来源取用、两种问法 | [S-12](#s-12-展示列表)、[S-19](#s-19-凭据每次发出现取取值只交给传输适配)、[S-28](#s-28-opencall) 出门前检查第 4 行 |
| `data.model-profile` `#S-2` 路由名 `RouteName` | [S-9](#s-9-选中模型)、[S-24](#s-24-legaltargets) ⑤、[S-27](#s-27-selectmodel) ①、[S-28](#s-28-opencall) ① |
| `data.model-profile` `#S-5`、`#S-6` 允许的供应商及次序、允不允许回退 | [S-30](#s-30-dispatchagain)、[S-35](#s-35-默认重试件可替换) |
| `data.model-profile` `#S-7` 两组模态 | [S-11](#s-11-合法目标集合) |
| `data.model-profile` `#S-8` 两个上限 | [S-7](#s-7-一次调用绑定了什么) |
| `data.model-profile` `#S-4` 来源（官方 / 自建） | [S-12](#s-12-展示列表)（来源标注）、[S-19](#s-19-凭据每次发出现取取值只交给传输适配)（取用按来源） |
| `data.model-profile` `#S-10` 在册状态（两条转移：撤回、恢复在册） | [S-9](#s-9-选中模型)、[S-11](#s-11-合法目标集合)、[S-28](#s-28-opencall) |
| `data.model-profile` `#S-13`、`#S-14` 引用与精确解析 | 全部操作 |
| `data.model-profile` `#S-15`～`#S-18`、`#S-21` 请求参数词表、取值域、缺席即不带、输出上限、不静默丢也不静默改 | [S-7](#s-7-一次调用绑定了什么) |
| `data.model-profile` `#S-24`、`#S-25` 表示层校验、拒绝值闭合 | [S-14](#s-14-缺席时的默认答案与失败集合)、[S-28](#s-28-opencall) 出门前检查第 5 行 |
| `data.model-response` `#S-3` 谁写哪一条：`persisted` 那条由调用方写，其余（含 `vetoed`、`consumed`）由本能力写 | [S-17](#s-17-结算一处按序幂等先到者赢)、[S-49](#s-49-settlereply) |
| `data.model-response` `#S-4` 一次调用、一次发出、一条响应体 | [S-5](#s-5-一次调用一次发出) |
| `data.model-response` `#S-6` `ResponseId` 由本能力在写「已出门」时铸、各结算方沿用 | [S-8](#s-8-调用在会话日志里留下的六种记录)、[S-17](#s-17-结算一处按序幂等先到者赢) |
| `data.model-response` `#S-7`～`#S-11` 所属调用、第几次发出、路由留痕、有效模型怎么来的、实际发出的参数与改过的值与没发出去的项 | [S-7](#s-7-一次调用绑定了什么)、[S-8](#s-8-调用在会话日志里留下的六种记录)、[S-10](#s-10-有效模型四步每步来源可查)、[S-29](#s-29-dispatch) |
| `data.model-response` `#S-35` 晚到的那一条（`late`） | [S-17](#s-17-结算一处按序幂等先到者赢) |
| `data.model-response` `#S-12`～`#S-16` 收场、条件关系、回复与已交付部分、成因与状态码、发出了的才有响应体 | [S-6](#s-6-调用的状态)、[S-18](#s-18-成因按来源分类三类事实由守卫兑现)、[S-29](#s-29-dispatch) |
| `data.model-response` `#S-17`、`#S-18` 首 token 与时序、缺席是断言 | [S-16](#s-16-首-token-判据)、[S-33](#s-33-reconcile) |
| `data.model-response` `#S-19`～`#S-22` 用量与费用、原始响应留存、写入之前脱敏、写下即不变 | [S-17](#s-17-结算一处按序幂等先到者赢)、[S-20](#s-20-写入之前脱敏) |
| `data.model-response` `#S-23`、`#S-24` 同一次调用的响应体序列、一条响应体对应上游一次请求 | [S-22](#s-22-同一次调用的发出序列)、[S-38](#s-38-装配给的保证-vs-协议须给的保证) |
| `data.loop-extension` `#S-1` 位置（`before_model_call`、`after_model_call`） | [S-10](#s-10-有效模型四步每步来源可查)、[S-35](#s-35-默认重试件可替换) |
| `data.loop-extension` `#S-14` 「调模型之后」失败那一维的主体（重试件只凭它下结论） | [S-29](#s-29-dispatch) ⑤ |
| `data.loop-extension` `#S-15` `ModelRequest` 四个成员（`target` 恒在；`tools` 是模型面名字） | [S-28](#s-28-opencall) |
| `data.loop-extension` `#S-17` FailureCause 八值与各属哪一类 | [S-18](#s-18-成因按来源分类三类事实由守卫兑现) |
| `data.loop-extension` `#S-24` select_model 的义务 | [S-10](#s-10-有效模型四步每步来源可查)、[S-28](#s-28-opencall) |
| `data.loop-extension` `#S-27` retry 的计划与义务 | [S-30](#s-30-dispatchagain)、[S-35](#s-35-默认重试件可替换) |
| `data.call-accounts` `#S-19`、`#S-20` 两次发出两份账、缺账记未知 | [S-17](#s-17-结算一处按序幂等先到者赢)、[S-33](#s-33-reconcile) |
| `data.call-accounts` `#S-37` RunId、AttemptId、ModelCallId 的表示；ModelCallId 由本能力产生、**会话内唯一** | [S-5](#s-5-一次调用一次发出)、[S-28](#s-28-opencall) |
| `data.call-accounts` `#S-25` 一笔账归哪次尝试、哪个运行、哪个租户、谁发起，权威是承载它的条目壳 | [S-17](#s-17-结算一处按序幂等先到者赢)、[S-19](#s-19-凭据每次发出现取取值只交给传输适配) |
| `data.content-blocks` `#S-6` 模态由媒体类型判定 | [S-13](#s-13-模态投影读到的必须追到日志尾) |
| `data.content-blocks` `#S-13` 半截的工具调用 | [S-29](#s-29-dispatch) |
| `data.content-blocks` `#S-21` AttachmentRef | [S-20](#s-20-写入之前脱敏) |
| `data.messages` `#S-9`、`#S-10` AssistantMessage 与它的三种收尾 | [S-29](#s-29-dispatch) |
| `data.messages` `#S-35`、`#S-36` 我们自己那两种在发出前译掉、ToolInternalMessage 不进请求 | [S-38](#s-38-装配给的保证-vs-协议须给的保证) |
| `data.tool-definition` `#S-6` 模型面只有一个条目；模型面名字 `ModelToolName`，逆转写只在工具执行那一侧 | [S-28](#s-28-opencall) ① 的 `tools`；[S-51](#s-51-模型侧到达装配前提的承诺) 末条、[S-38](#s-38-装配给的保证-vs-协议须给的保证) 传输适配第 11 条：不做逆转写 |
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
| `data.messages` `#S-49`、`#S-50` 本能力写的五种记录的形状（`ModelInvocationRecord`；「已出门」带着这次调用的绑定，与传输适配为这一次定下的 `parameterAdjustments`、`droppedParameters`）与调用终结的三支（`released` 可带 `cause`） | [S-7](#s-7-一次调用绑定了什么)、[S-8](#s-8-调用在会话日志里留下的六种记录)、[S-28](#s-28-opencall)、[S-29](#s-29-dispatch)、[S-33](#s-33-reconcile) |
| `data.content-blocks` `#S-20` `CapabilityId`（`targetChangedBy`） | [S-28](#s-28-opencall) |
| `capability.stream-assembly` `#S-16` 首个内容的位置 | [S-16](#s-16-首-token-判据) |
| `capability.stream-assembly` `#S-28` 宿主要兑现的前提（第 1、2、4、6、7、8、9 条）；`#S-18` `start`、`#S-19` `accept`、`#S-20` `snapshot`、`#S-21` `closeOut`、`#S-22` `abandon`——承诺里用到的五个操作（宿主被撤下时在途的流走 `abandon`）；`#S-26` 收尾之后被拒的记在宿主自己的观测里；`#S-14` 先截短后拒收只计一次；`#S-13` 账——模型侧 `trims` 一次也没砍时响应体那边缺席；`#S-23` 本能力自己的失败值——`accept` 交回的被拒的值（含 `event_after_finish`） | [S-51](#s-51-模型侧到达装配前提的承诺)；[S-52](#s-52-模型侧的装配宿主被拒的增量报一次收场之后的事件不进) 的期望 |
| `data.arrival-events` `#S-5` 信封与目标：`model_call` 目标 `{ callId, dispatch }`，目标不带会话 | [S-51](#s-51-模型侧到达装配前提的承诺) 第 1 条按（会话，目标）路由 |
| `data.arrival-events` `#S-14` 砍：`trim` 的形状与 `reason`（`rejected`、`frame_too_long`） | [S-51](#s-51-模型侧到达装配前提的承诺) 第 4 条、[S-52](#s-52-模型侧的装配宿主被拒的增量报一次收场之后的事件不进) |
| `data.arrival-events` `#S-16` 收尾：`FinishReason` 四值、`error` 只随 `model_call` 的 `lost`、宿主放弃在途的流一律 `lost` 且不带 `error` | [S-51](#s-51-模型侧到达装配前提的承诺) 第 6 条 |
| `data.arrival-events` `#S-21` 第一个内容步骤：零次填充就封口、封口块非空也算开口 | [S-16](#s-16-首-token-判据) |
| `data.model-response` `#S-5` 到达事件流的映射与它的例外（宿主放弃在途的流：流结局 `lost`、收场 `interrupted{run_cancelled}`） | [S-36](#s-36-宿主停止与撤除)、[S-51](#s-51-模型侧到达装配前提的承诺) 第 6 条 |
| `capability.modality-projection` `#S-6` 可分解律与对读方的两条义务（存着的答案等于重算、判合法目标用的答案覆盖到日志尾）、`#S-15` 读投影、`#S-16` 兼容判定 | [S-11](#s-11-合法目标集合)、[S-13](#s-13-模态投影读到的必须追到日志尾) |
| `capability.asset-evaluation` `#S-8` 求值结果、`#S-22` 设置、`#S-23` 权限 | [S-9](#s-9-选中模型)、[S-10](#s-10-有效模型四步每步来源可查)、[S-11](#s-11-合法目标集合) |

---

## 二、概念、身份与必要状态

### S-5 一次调用、一次发出

**一次调用有 0 到多次发出；每一次发出只走一家，恰留一条响应体**（`data.model-response/v1#S-4`）。

- **`callId`**（`ModelCallId`）**由本能力在打开一次新调用时产生**（`data.call-accounts/v1#S-37`），**会话内唯一**、不回收不复用，交换表示按 `data.identity-values/v1#S-31`。
  **一次调用的身份是（会话, `callId`）**：本能力同时承载多个会话，两个会话里可以有相同的 `callId`；所以每个指认一次调用的操作都**同时收 `session`**，先判这个 `callId` 是不是这个会话的，不是即 `callNotFound`（主线裁定，见 [D-040 §五 K19](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)）。
- **调用跨尝试延续**：执行尝试换了（停机之后新的一次尝试接着推），**同一次调用的身份不变**；首 token 之前失联的那次调用在新尝试里**以同一个 `callId` 接着发**（[S-33](#s-33-reconcile) 第一行），不是另起一次新调用。
- **发出序号属于调用、跨尝试连续**：同一次调用的第 n 次发出，不论落在哪次尝试，都是第 n 次；从 1 起、逐次加一、不重不跳（`data.model-response/v1#S-8`）。
- **尝试号属于每一次发出，不属于调用**：每一次发出记下它**落在哪一次尝试里**。一次调用的几次发出可以落在不同尝试里。
  `attemptId` 在响应体的每一次发出上，不在 `call` 里（`data.model-response/v1#S-7`、`#S-8`；原 G-1 在整批对齐闭合）。
- **不属于任何 Run 的调用**（如旁路提问：由会话本身发起的调用，[PF-013 它只有一个宿主](../../../../product/PF-013-model-profiles-and-invocation/design.md#它只有一个宿主所以只有一种结局) 末段）：它属于会话，花的钱归会话那一级；本契约对它一视同仁，只是它不带 Run 与尝试（[S-28](#s-28-opencall) ①），停机之后由会话重新承载时的对账收口（[S-33](#s-33-reconcile) ②）。
  **挂件、压缩闭包、旁路提问里发起的调用一律适用本契约，宿主恒为 [agent runtime](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-agent-runtime--agent-runtime--agent-runtime)**；挂件为 Run 发起的那几次花的钱算它插手的那个 Run（[PF-012](../../../../product/PF-012-agent-loop-and-run/design.md#挂件自己花的钱算它插手的那个-run)）。
- **一笔账归哪次尝试、哪个运行、哪个租户、谁发起，权威是承载它的条目壳**（`data.call-accounts/v1#S-25`）：响应体上的 `attemptId` 只是「这次发出落在哪次尝试」的事实，不作归属；响应体上的 `initiator` 只指中断发起方（`data.model-response/v1#S-12`）。

### S-6 调用的状态

**一次调用恰处在下列一个状态；三个终态吸收，终态之间不互转。**

| 状态 | 含义 | 怎样进来 |
|---|---|---|
| `open` | 已打开、过了出门前检查、还没发出过 | [S-28](#s-28-opencall) |
| `in_flight` | 一次发出已出门（「已出门」已写下），还没开口 | [S-29](#s-29-dispatch)、[S-30](#s-30-dispatchagain) |
| `speaking` | 这次发出已开口（「已开口」已写下） | [S-16](#s-16-首-token-判据) |
| `reply_pending` | 这次发出已收场并**带着回复交回调用方**，响应体还没写下；**收场对调用方的操作而言已定**，等调用方收口（[S-17](#s-17-结算一处按序幂等先到者赢)）——**两处兜底例外**：调用方没收口时，宿主停止的撤除（[S-36](#s-36-宿主停止与撤除)）写成没有回复的 `interrupted{run_cancelled}`，停机之后的对账（[S-33](#s-33-reconcile)）按「已开口、无响应体」那一行收。这一状态只在本能力手里——日志里这时仍是「已开口」 | [S-29](#s-29-dispatch) ⑤ |
| `awaiting_decision` | 最近一次发出以故障收场，响应体已写下；**等 loop 决定再发还是放手** | [S-29](#s-29-dispatch)、[S-33](#s-33-reconcile) |
| `resumable` | 最近一次发出在首 token 之前失去连续性，已追补结算；**可以在同一次调用下再发** | [S-33](#s-33-reconcile) 第三行 |
| **`complete`**（终态：完整一份） | 最后一次发出以 `complete` 或 `truncated` 收场、响应体已写下——**含回复在落盘之前被否决、被系统使用**（`data.model-response/v1#S-12`、`#S-14`） | 从 `reply_pending`：调用方写下（`persisted`）或 [S-49](#s-49-settlereply) |
| **`handed_up`**（终态：上交） | 出门前检查不过（`undispatched{cause}`）；loop 在一次故障之后或从 `resumable` 放手（`released`）；续接或再发时取不到凭据（`released{cause}`） | [S-28](#s-28-opencall)、[S-32](#s-32-releasecall)、[S-29](#s-29-dispatch) ⑧、[S-30](#s-30-dispatchagain) ⑧ |
| **`interrupted`**（终态：被中断） | 用户中断、宿主取消，或首 token 之后失去连续性（`initiator = runtime_lost`）；带着回复被中断的那一次同样经 `reply_pending` 收口 | [S-31](#s-31-interrupt)、[S-33](#s-33-reconcile)、[S-36](#s-36-宿主停止与撤除) |

- **终态恰三个**，与 [UL-model-call](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call) 一致；`undispatched{cause}` 是上交的子形，`interrupted{runtime_lost}` 是被中断的子形，**不是第四、第五终态**。
- **没有「说话中 → 在途」这条转移**：开口之后这次调用不会再有下一次发出（[S-22](#s-22-同一次调用的发出序列)）。
- **状态不另存为权威**：终态与「已开口」由会话日志里的记录判出（[S-8](#s-8-调用在会话日志里留下的六种记录)）；本能力手里的在途状态只活到进程还在为止，停机之后以日志为准（[S-33](#s-33-reconcile)）。

### S-7 一次调用绑定了什么

**打开一次调用时绑定下列各项，此后这次调用的每一次发出都用同一份：**

| 绑定 | 从哪来 | 为什么要绑 |
|---|---|---|
| **有效模型**（一个 `ModelProfileRef`）及它怎么来的 | [S-10](#s-10-有效模型四步每步来源可查) | 选中模型之后切换不作用于在途调用（[PF-013 §6.7](../../../../product/PF-013-model-profiles-and-invocation/design.md#67-生效点收到那条事实之后下一次模型请求之前)） |
| **档案快照**：那条档案在打开这一刻的、发出与重试要用到的属性（允许的供应商及次序、允不允许回退、两个上限、两组模态、`parameters`、`updatedAt`） | `capability.model-profile-directory/v1#S-16` 的一次读 | 一次调用内各次发出**按同一份档案准备、按同一份发出**；档案后来被改或被撤回，不改在途调用 |
| **合并后的请求参数**（「要求的那一组」）：档案 `parameters` 逐项被本次覆盖替换，**合并之后**再按档案的输出上限校验（`data.model-profile/v1#S-18`） | 档案快照 ＋ `parameters` | 交给传输适配的就是它；响应体 `route.parameters` 记的是它经传输适配之后**实际发出**的那一组，改过值的项记进 `parameterAdjustments`、没发出的项记进 `droppedParameters`（`data.model-response/v1#S-11`） |
| **有效模型怎么来的**（`selectedBy`） | [S-10](#s-10-有效模型四步每步来源可查)；[S-28](#s-28-opencall) ① 的 `basis` 与 `targetChangedBy` | 响应体 `route.selectedBy`（`data.model-response/v1#S-10`） |
| **发起租户**（`TenantId`）：会话在创建那一刻持有的租户身份 | 会话（[PF-015 §6.12](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#612-会话持有创建那一刻的租户身份)、`data.identity-values/v1#S-28`） | 凭据取哪一把、账算到谁头上（[S-19](#s-19-凭据每次发出现取取值只交给传输适配)） |
| **宿主**（这次调用挂在哪一个 agent runtime 上）与**会话日志的追加入口** | 调用方 | 调用随宿主停（[S-36](#s-36-宿主停止与撤除)）；六种记录写到哪（[S-8](#s-8-调用在会话日志里留下的六种记录)） |

- **档案快照落在响应体上**：`data.model-response/v1#S-9` 的 `route.profileSnapshot`（形状是 `data.model-profile/v1#S-27` 的 `ModelProfileSnapshot`；档案不另有修订身份），本契约把绑定的那一份写进去。
- **传输适配改值与丢项的规矩归 `data.model-response/v1#S-11`**：改了值再发出的项，**发出的值必须在统一词表里表示得出**，否则那一项要么改成表示得出的值、要么不发并记进 `droppedParameters`；`extra` 项以它的键为名。
  **上游把输出上限降到档案参数之下时档案不改**（`data.model-profile/v1#S-18`）：合并之后的 `maxOutputTokens` 照档案走，传输适配发出时改成上游收得下的值，并记进 `parameterAdjustments`——**不静默改、也不因此拒发**。
- **档案快照照原样复制那一刻的档案**（`data.model-profile/v1#S-27`），不挑、不改写成员。
- **绑定的耐久来源是每一次发出的「已出门」记录**（`data.messages/v1#S-49`；主线裁定，见 [D-040 §五 K20](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)）：它带着有效模型引用、档案快照、**合并之后、交给传输适配之前**的请求参数、`selectedBy` 与这一次的 `credentialScope`；
  **另带传输适配为这一次定下的 `parameterAdjustments` 与 `droppedParameters`**（形状取 `data.model-response/v1#S-11`；主线裁定，见 [D-040 §六 L4](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)）——它们在出门之前就定下了（[S-29](#s-29-dispatch) ④），于是实际发出的那一组由这条记录还原得出：合并之后的那一组，把 `parameterAdjustments` 列的项换成 `sent`、去掉 `droppedParameters` 列的项（`data.model-response/v1#S-11` 第 4 条的逆运算）。停机之后追补的那一条响应体，参数三项就从这里读（[S-33](#s-33-reconcile) ④；原 G-18 闭合）。
  **停机之后续接、对账追补响应体，都从那条记录读绑定，不从内存、也不重读档案**——重读档案会让在途调用受档案后来的改动影响。一次还没出门的调用没有这条记录，停机之后也就没有要恢复的绑定（[S-28](#s-28-opencall) ④）。
- **凭据不绑**：每一次发出现取（[S-19](#s-19-凭据每次发出现取取值只交给传输适配)）；这一次用的是哪一格，随「已出门」记下。

### S-8 调用在会话日志里留下的六种记录

**本能力经宿主给出的追加入口，往会话日志里写下列记录；每一种都在它要保护的那件事发生之前写下。**
响应体之外的五种记录，**形状归 `data.messages/v1` 的 [S-49](../../../data/messages/v1/contract.md#s-49-模型请求运行时写的五种记录不是消息)、[S-50](../../../data/messages/v1/contract.md#s-50-调用终结的三支)**（`ModelInvocationRecord`：不是消息，只供对账读；主线裁定，见 [D-040 §S16 S16-d](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)）；本条定义它们**各自必须能回答什么、何时写、谁写**。
**会话、Run、尝试、租户都在承载记录的条目壳上**，不在记录里（`data.messages/v1#S-49`、`data.call-accounts/v1#S-25`）；下表「落在哪次尝试」「谁」都从条目读。

| 记录 | 必须能回答 | 何时写 | 谁写 |
|---|---|---|---|
| **已出门** | 哪次调用的第几次发出、落在哪次尝试、发给哪一家、这次发出的 `ResponseId`；**这次调用的绑定**：有效模型引用、档案快照、合并之后的请求参数、`selectedBy`、这一次的 `credentialScope`（[S-7](#s-7-一次调用绑定了什么)）；**传输适配为这一次定下的改值与丢项**（`parameterAdjustments`、`droppedParameters`，缺席即没改、没丢） | 这一次请求**离开本进程之前**（[S-15](#s-15-两个锚点先写后行)） | 本能力 |
| **已开口** | 哪次调用的第几次发出、观察到首 token 的时刻 | 首个内容**交给任何观察者之前**（[S-15](#s-15-两个锚点先写后行)） | 本能力 |
| **中断意图** | 哪次调用、谁发起（`user` ／ `run_cancelled`） | 发出中止信号**之前**（[S-31](#s-31-interrupt)） | 本能力 |
| **[模型响应体](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-response--模型响应体--model-response)**（`data.model-response`） | 见那份契约 | 一次发出收场时 | **回复落盘成了消息的那一条（`persisted`）由调用方与回复消息同一提交写；其余——含回复被否决、被系统使用的那一条——由本能力写**（[S-17](#s-17-结算一处按序幂等先到者赢)、[S-49](#s-49-settlereply)；`data.model-response/v1#S-3`） |
| **调用终结** | 哪次调用、以哪个终态结束；`undispatched` 时的成因；`released` 在续接或再发时因取不到凭据而上交时的成因；`interrupted` 时的发起方 | 调用不经响应体进入终态时：出门前检查不过、续接或再发时取不到凭据、在两次发出之间被中断、loop 放手 | 本能力 |
| **[模型切换](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-switch--模型切换--model-switch)落下的那条记录条目**，即 `data.messages/v1#S-49` 的 `model_selection_changed` | 哪个会话、切到哪个路由名、谁、何时（`data.offer-expiry/v1#S-22` 的时间点） | 切换**生效之前**（[S-27](#s-27-selectmodel)） | 本能力 |

- **`ResponseId` 由本能力在写「已出门」那一刻铸下**（`data.model-response/v1#S-6`），此后这次发出的任何结算——本能力、调用方、停机之后的对账——都沿用它（[S-17](#s-17-结算一处按序幂等先到者赢)），这使「同一次发出至多一条响应体」可以按标识判重。
- **两个锚点不是响应体**：它们不带收场、不带账；响应体写下之后它们仍在，**供对账读，不供任何视图呈现**。

### S-9 选中模型

**选中模型是一个路由名：这个会话日志里最后一条模型切换的记录（`model_selection_changed`，[S-8](#s-8-调用在会话日志里留下的六种记录)）记的那个名字；一条都没有时，= 「用哪个模型」这项设置在会话格上的层级求值结果**（[PF-013 §4 选中模型与有效模型](../../../../product/PF-013-model-profiles-and-invocation/design.md#选中模型-与-有效模型)「会话从没切换过时……取这项设置沿层级求值出来的那一条」；那项求值归 `capability.asset-evaluation` v1 的 [S-22](../../asset-evaluation/v1/contract.md#s-22-第四步设置)）。
**记的是名字，不是某一行**（PF-013 rev 12 [§4 档案的身份](../../../../product/PF-013-model-profiles-and-invocation/design.md#档案的身份所在范围加路由名)；`data.model-profile/v1#S-14`）；这个名字这一次落到哪一行，是 [S-10](#s-10-有效模型四步每步来源可查) 第 2′ 步的事。

- **只因[模型切换](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-switch--模型切换--model-switch)而变**（[PF-013 flows §3.3](../../../../product/PF-013-model-profiles-and-invocation/flows.md#33-一个会话的选中模型)）：拓展件的 `select_model` 只改那一次的有效模型，**不写模型切换的记录**（`data.loop-extension/v1#S-24`）；agent 自己换不了。
- **名字不变，落点会变**：最具体那一行被撤回、链上另有在册且这个范围允许的同名行，这一次就落到那一行、调用照发——**这不是替用户改选**，他选的是这个名字（[§6.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#64-撤回不删行会话指向被撤回的档案时说已下架)）。
  **链上同名的都撤回了**，落点是已撤回的那一行，据此说「已下架」（[S-12](#s-12-展示列表)）；**不替用户改选**（[§6.9](../../../../product/PF-013-model-profiles-and-invocation/design.md#69-合法目标算不出来时不替用户改选)）。
  撤回的那一行后来恢复在册，它又是最具体的，名字落回它——**下一次请求照常发出，用户什么都不用做**，本能力也没有什么要改回来（[flows §1.4](../../../../product/PF-013-model-profiles-and-invocation/flows.md#14-走一遍选中的模型被下架了) 第 6′ 步）。
- **读不到会话日志 ⇒ 选中模型判不出来**，依赖它的操作以 `unavailable` 失败，**不回退到设置求值的那个初值**——那会把「读不到」说成「从没切换过」。

### S-10 有效模型：四步，每步来源可查

**这一次调用的有效模型按下面四步定下；每一步的结论与来源都在日志或响应体上查得到。**

| 步 | 做什么 | 结果从哪来 | 留在哪 |
|---|---|---|---|
| 1 | 取**选中模型**（一个路由名） | [S-9](#s-9-选中模型) | 模型切换的记录（或设置求值） |
| 2 | **层级求值**「用哪个模型」这项设置：会话格之上若有一格带[不可覆盖标记](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-immutable-marker--不可覆盖标记--immutable-marker)，**取那一格的名字，压过选中模型** | `capability.asset-evaluation` v1 的设置求值（[PF-013 §4 选中模型与有效模型](../../../../product/PF-013-model-profiles-and-invocation/design.md#选中模型-与-有效模型)「上层锁死」） | 响应体 `selectedBy = layer_lock`；否则 `session` |
| 2′ | **把路由名解析为一行**：以前一步的名字为[能力标识](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier)，取它在会话范围链上的**落点**——**先滤掉已撤回的、再滤掉这个范围不允许的，然后取最具体一格**（租户层 > 组织层 > 出厂默认层）。**锁锁的也是名字**：供应商、参数、凭据取落到的那一行（主线裁定，见 [D-040 §二 S-U24-5a～c](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#二2026-09-24-用户在场期间主线随用户裁决所作的自定账本-二-原文标主线自定的行)）。第 3 步拓展件给出的目标同样取它的路由名、经这一步 | `capability.model-profile-directory/v1#S-17` 末段的 `落点(T, r, A)`：`T` 是会话持有的租户，`A` 是 [S-11](#s-11-合法目标集合) 输入表里的允许集合 | **`selectedBy` 不变**；`effectiveModel` 的 `profile` 是落到的那一行，响应体 `route.profile` 是它 |
| 3 | **「调模型之前」的拓展件**可能给出 `select_model`，只改这一次 | `capability.loop-extension-runner`（它先按 [S-24](#s-24-legaltargets) 核合法，`data.loop-extension/v1#S-24`） | 拓展件的结论条目；响应体 `selectedBy = { extension: <name> }` |
| 4 | **出门前检查**：对落到的那一行核在册、范围允许、模态兼容、凭据有无 | [S-28](#s-28-opencall) | 不过 ⇒ 调用终结记录 `undispatched{cause}`；过 ⇒ 响应体 `route.profile` |

- **第 1、2、2′ 步由 [`effectiveModel`](#s-26-effectivemodel) 给出**；第 3 步在 loop 里发生，它给出的目标在打开调用时经 2′；第 4 步在打开调用时发生。
- **只滤已撤回与范围不允许**（主线裁定，见 D-040 §二 S-U24-5a）：胜出行模态对不上或缺凭据，**它照样是胜出行**，第 4 步以相应成因挡下，**不落到更一般一格的同名行**——这两样是这一次运行时的事实，不是那一行能不能被这个范围用。缺凭据尤其不滤——缺凭据的名字仍是合法目标，出门前才挡（[S-11](#s-11-合法目标集合)）。
- **没有胜出行时，落点那一行由第 4 步挡下**（`capability.model-profile-directory/v1#S-17` 末段的三种收场）：链上同名的都撤回了 ⇒ `withdrawn`（「已下架」）；有在册的、却都这个范围不允许 ⇒ `scope_disallowed`；**链上没有这个名字的任何一行** ⇒ `profileNotFound`（[S-28](#s-28-opencall) ⑧）。
- **这条裁决的代价，写明**：
  - **组织层建了一条与官方同名的自建档案，成员没配自己那一把之前，这个名字对他用不上**——名字落到组织层那一行，以 `credential_unavailable` 挡下；部署给出厂格配的那一把救不了它（出厂格那一把只供官方档案，`capability.model-profile-directory/v1#S-20`）。成员配上自己那一把就好。
  - **组织锁得住名字，锁不住这个名字落到哪一行**：成员在自己那层建一条同名的，供应商与参数就是他的了（PF-013 §4 代价第二条）。
  - 反过来，**租户建了同名自建档案又撤回，同名的组织层或官方那一行照常接住**，不会被一行已撤回的一直堵着（行不删）；更具体一格那一行这个范围不允许时同样不参与。
- **落点跟着链上的行变，选中模型不变**：更具体一格里后来建出（或恢复在册）同名的一行，下一次求有效模型就落到它；它被撤回或这个范围不再允许，下一次就落回链上另一行——每次都现读链上档案；**在途调用不受影响**（[S-7](#s-7-一次调用绑定了什么)）。
- **锁压过选中模型，请求照常发出**（[PF-013 §6.9](../../../../product/PF-013-model-profiles-and-invocation/design.md#69-合法目标算不出来时不替用户改选)「上层锁死了另一条……照常用它发出，不算失败」）；选中模型不变，展示列表照样显示用户选的那个名字。
- **有效模型算不出来**（任何一步的输入读不到）是明确失败（`unavailable`），**不猜一个、不回退到上一次用过的**。

### S-11 合法目标集合

**[合法目标集合](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-legal-target-set--合法目标集合--legal-target-set)恰三项：胜出行在册 ∩ 这个范围允许 ∩ 兼容模态投影**（[PF-013 §5.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事)）：

```text
LegalTargetSet(会话)  ≝  { r |  r 是链上档案里出现的一个路由名
                              ∧ 胜出行(T, r, A) 存在
                              ∧ compatible(胜出行(T, r, A), 投影(会话)) }
```

**元素是路由名**：一个名字能选的只有一行——它在这条链上的胜出行。
`T` 是会话持有的租户，`A` 是这个会话格上的允许集合（下表）；`胜出行` 按 `capability.model-profile-directory/v1#S-17` 末段——**胜出行存在，就在册且这个范围允许**（两道滤已经滤过）。

| 输入 | 从哪来 |
|---|---|
| **链上档案** | `capability.model-profile-directory/v1#S-17`，以会话持有的 `TenantId` 为锚 |
| **允许集合 `A`** | `capability.asset-evaluation` v1 求值结果（[S-8](../../asset-evaluation/v1/contract.md#s-8-求值结果-effectiveassembly)）里「用哪个模型」那一项在**这个会话格**上的允许集合（主线裁定，见 [D-040 §S16 S16-i](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)）。**取值域是路由名**：一个名字在集合里即这个范围允许它（主线裁定，见 [D-040 §五 K42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)：与「设置记路由名」一致；原 G-4 闭合）。**这一项由哪份正文契约的推出规则产出、是设置还是权限、锁与 `A` 什么关系，还没有答案**——[G-19](#十二已知缺口)；闭合之前求值结果里没有这一项，按下面第一条即 `unavailable`，不当空集、不当全集。**它是胜出行的第二道滤**（[S-10](#s-10-有效模型四步每步来源可查) 第 2′ 步）；同一租户的两个会话格可以有不同的 `A`，所以按 `(T, r)` 缓存胜出行是错的 |
| **投影** | [S-13](#s-13-模态投影读到的必须追到日志尾) |
| **`compatible`** | `capability.modality-projection` v1 的 [S-16](../../modality-projection/v1/contract.md#s-16-兼容判定-compatible)：投影 ⊆ 档案的输入模态（`data.model-profile/v1#S-7`） |

- **任何一个输入读不到 ⇒ `unavailable`**，**不返回空集**——空集会被读成「现在没有任何模型能用」，据此替用户改选或弹错（[§6.9](../../../../product/PF-013-model-profiles-and-invocation/design.md#69-合法目标算不出来时不替用户改选)）。允许集合读不到，不当成空集（全拒），也不当成全集（全放）。
- **凭据有无不在这里**：缺凭据的名字仍是合法目标，出门前检查才以 `credential_unavailable` 挡下；展示列表把它标出来（[S-12](#s-12-展示列表)）。
- **模态按胜出行判**（主线裁定，见 D-040 §二 S-U24-5a～c）：选一个名字，这一次用的是胜出行，所以兼容与否按它算——否则一个判为合法的名字会在出门前检查被挡下。**被盖住的同名行不是候选**，只在展示列表上作标注（[S-12](#s-12-展示列表)）。

**可发出的另一条前置——不是合法目标集合的一项**：**投影(会话) ⊆ 本据点传输能承载的模态**（「本据点传输能承载的模态」无词条：本据点的装配事实，传输适配能送出哪几种模态；主线裁定，见 [D-040 §块 C 对账 C-R5](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#块-c-对账d-reconciliation-c需主线看八项)；与合法目标分开写是主线裁定，见 [D-040 §五 K40](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)）。

- **它与哪个名字无关**：投影里有本据点传输送不出的模态时，这个会话在本据点上**任何一个名字都发不出去**；所以它不进合法目标集合、不改变切换（切到合法目标不得拒绝，[§6.5](../../../../product/PF-013-model-profiles-and-invocation/design.md#65-切换是用户的直接命令合法目标不得拒绝)），
  而在出门前检查里挡下（[S-28](#s-28-opencall) 出门前检查第 3 行，成因 `modality_mismatch`），**成因有处可归**。
- **档案登记时不校验它**：它是据点的事实，不是档案的事实；同一条档案在另一个据点上可能发得出去。

### S-12 展示列表

```text
DisplayList(会话)  ≝  { r ∈ LegalTargetSet(会话) ∪ { 选中模型 } } 每个名字一条
```

**每条是一个路由名**，带三样（[PF-013 §5.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事)、[§6.3](../../../../product/PF-013-model-profiles-and-invocation/design.md#63-官方与自建在同一份列表里)）：

1. **主标：落点那一行的来源**——那一行的 `ref`：`ref.origin` 是 `official`（官方）或 `custom`（自建），自建的 `ref.scope` 的判别式指出建在哪一层。它告诉用户**这个名字此刻用的是谁建的那一行**；有胜出行时是胜出行，选中模型没有胜出行时是落点那一行（`capability.model-profile-directory/v1#S-17` 末段）。**来源标注取自引用里这两个分量，不另立一个成员**。
2. **注记**：这个名字现在能不能用（下表）。**名字上的注记判的对象**：这个名字有胜出行时判胜出行——`legal` 或 `modality_mismatch`，外加 `credential_missing`；**没有胜出行时只判落点那一行在两道滤里卡在哪一道**——`withdrawn` 或 `scope_disallowed` 恰一个，**不对它判模态与凭据**：它此刻本来就选不了，模态与凭据的答案对它没有意义，判了只会给出一个用户据以行动却无效的原因。
3. **被盖住的同名行**：这个名字有胜出行时，链上同名的其余每一行**列在这一条之下**，各带自己的 `ref`（来源）与注记 `overridden_by{scope}`；它自己已撤回的再带 `withdrawn`，这个范围不允许的再带 `scope_disallowed`。**只作标注，选不了**——选这个名字，用的就是胜出行（主线裁定，见 D-040 §二 S-U24-5c）。**怎么呈现（排在下面、折起来还是别的）归交付面**（PF-016）。
4. **是不是选中模型**：条目上的 `selected` 为真即这一条是会话此刻的选中模型（[S-25](#s-25-displaylist) ⑤）。

**来源是每一条上的标注，不是把列表分块的依据**（§6.3）。

| 注记 | 挂在哪 | 含义 | 判据 |
|---|---|---|---|
| `legal` | 名字 | 是合法目标 | [S-11](#s-11-合法目标集合) |
| `withdrawn` | 名字；被盖住的行 | 名字上：选中的这个名字，**链上同名的都撤回了**——「已下架」；行上：这一行自己已撤回 | 名字上：落点那一行 `registration = withdrawn`（没有在册的同名行）；行上：这一行 `registration = withdrawn` |
| `scope_disallowed` | 名字；被盖住的行 | 名字上：这个名字链上在册的同名行，这个范围一条都不允许；行上：这一行这个范围不允许 | 名字上：没有胜出行而有在册的同名行；行上：范围允许对这一行不成立 |
| `modality_mismatch` | 名字 | 和会话里的模态对不上 | 胜出行的兼容那一项不成立。**本据点传输送不出不在这里**——它与名字无关，是可发出的另一条前置（[S-11](#s-11-合法目标集合) 末段） |
| `credential_missing` | 名字 | **调它时没有凭据可用**（**附加注记**，可与 `legal` 并存）：胜出行是自建档案——这个租户没配自己那一把；是官方档案——这个租户没配、部署也没给出厂格配一把 | 以会话持有的租户与**胜出行的来源**问 `capability.model-profile-directory/v1#S-20` 的有没有，答 `{ present: false }` |
| `overridden_by{scope}` | 被盖住的行 | **被 `scope` 那一格的同名档案覆盖**：这个名字此刻用的是那一格的那一行；`scope` 是胜出行所在的一格——出厂默认层为 `factory`，否则胜出行 `ref` 里的 `scope`（主线裁定，见 D-040 §二 S-U24-5c） | 这一行不是胜出行，而这个名字有胜出行 |

- **选中模型不在合法目标里时，它仍在列表上**，并带上它不合法的那一条原因——**不呈现「未知模型」**，也不从列表里消失。
- **`credential_missing` 按胜出行的来源问**：同一个租户没配自己那一把时，胜出行是官方档案的名字（部署配了出厂格那一把）可用，胜出行是自建档案的名字标明缺凭据——一个名字不能按别的名字的答案代答。
- **按上面的判据，名字上不合法的原因至多一条**（`withdrawn`、`scope_disallowed`、`modality_mismatch` 三者互斥）；`credential_missing` 是附加注记，与 `legal` 或 `modality_mismatch` 并存时一并列出。
- **选中模型这个名字在链上没有任何一行**（它曾被选中，如今链上查无此名——行不删，这意味着存储丢了行）：列表**以 `profileNotFound` 失败**（与 [S-26](#s-26-effectivemodel)、[S-28](#s-28-opencall) 同一个值），不自造一个注记把它说成「已下架」。这是一个确定的判定、不是「判不出来」，调用方不该重试。

### S-13 模态投影：读到的必须追到日志尾

**本能力读会话模态投影时，读到的必须等于「对读那一刻的整份会话日志求一遍投影」的结果。**
投影的定义（哪些块算、嵌在工具结果里的算不算、派生表示与 transcript 怎样处理）归 `capability.modality-projection` v1；块的模态由媒体类型判定（`data.content-blocks/v1#S-6`）。
**本条兑现的是 `capability.modality-projection/v1#S-6` 对读方的两条义务**（存着的答案等于重算；判合法目标用的答案覆盖到日志尾），并借它的可分解律增量维护。

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
| `notLegalTarget{because}` | 切换目标不在合法目标集合里；`because` 恰一项，取自 `{ withdrawn, scope_disallowed, modality_mismatch }`——按 [S-12](#s-12-展示列表) 名字上的判据，三者互斥 |
| `callNotFound` | 这个会话里没有这个 `callId`——含 `callId` 属于别的会话（[S-5](#s-5-一次调用一次发出)） |
| `alreadyEnded` | 两个分句，各有适用的操作：① **调用已在终态**——六个指认调用的操作都适用（`dispatch`、`dispatchAgain`、`canDispatchAgain`、`interrupt`、`releaseCall`、`settleReply`）；② **收场已定（`reply_pending`）而这个操作要改它的收场**——只对 `dispatch`、`dispatchAgain`、`canDispatchAgain`、`interrupt`、`releaseCall`。**`settleReply` 在 `reply_pending` 上不得 `alreadyEnded`**：那正是它的前置（[S-49](#s-49-settlereply) ②）；它只在调用已以别的处置写下时得这个值（S-49 ⑦） |
| `runtimeStopped` | 宿主已在停止中，不开新调用、不再发出 |
| `retryRefused{why}` | 这次再发被守卫拒绝；`why` 恰一个，取自 [S-30](#s-30-dispatchagain) 的闭合表 |
| `wrongPhase{phase}` | 调用不在这个操作要求的状态；`phase` 是它当前的状态（[S-6](#s-6-调用的状态)） |

> **`profileWithdrawn` 与 `credentialUnavailable` 不是本契约的操作失败值**：选中一条已下架的档案是 `notLegalTarget{because: [withdrawn]}`；
> 出门前才发现的已下架、没凭据，是**调用的收场**（`undispatched{withdrawn}`、`undispatched{credential_unavailable}`、`released{cause: credential_unavailable}`），不是操作失败——操作本身成功地判出了这件事。
> **`wrongPhase` 是规格层推导**：状态机需要一个「此刻不能做」的值，而 `retryRefused` 专指再发守卫。

各操作的⑥从中取子集；**判定次序按⑥从左到右**。**要读才判得出的值，在它要读的输入读不到时一个也不成立**：判到那一个值时输入读不到，即以 `unavailable` 收场，**不跳过它去判后面的值**——例如会话日志读不到时，不能先判出 `callNotFound` 或 `wrongPhase`。

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
- **一个开了口、零次填充就封口的块，也算开口**，只要封口块内容非空（`data.arrival-events/v1#S-21`）——记录里已经有一个完整的块（装配器侧的判据是 `capability.stream-assembly` v1 的 [S-16](../../stream-assembly/v1/contract.md#s-16-首个内容的位置)，本条与它一致）；
- **响应头到了不算；整交的块开了口还没交出来也不算**。

**观察到首 token 就写「已开口」**（[S-15](#s-15-两个锚点先写后行)），响应体的 `timing.firstTokenAt` 与它一致（`data.model-response/v1#S-17`：它与「已开口」记录上的时刻相同）。
**这次发出算不算开口，以「已开口」写下为准。**「已开口」写不进时，按 [S-15](#s-15-两个锚点先写后行) 末条：内容**没有交给任何观察者**、这次发出被中止——**没写下的开口不算开口**：对外没有任何一方见过它，停机之后也没有任何记录判得出它。
所以那一条响应体**不带 `firstTokenAt`**、以首 token 之前的故障收场、成因 `unrecognized` 并留痕本地错误——`firstTokenAt` 缺席在这里是如实的断言（`data.model-response/v1#S-18`：「已开口」没有写下），不是「判不出」时的填补。

### S-17 结算：一处、按序、幂等、先到者赢

**一次发出的收场由「写下它的那条响应体」定下。**可能写它的有四方：正常收尾（交回调用方）、中断、宿主停止时的撤除、停机之后的对账。

- **按 `ResponseId` 判重**：`ResponseId` 在「已出门」时定下（[S-8](#s-8-调用在会话日志里留下的六种记录)），任何一方写之前先看这个标识是否已有响应体——**已有即什么都不写**。**先写下的那一方赢**，其余各方是空操作，不报错。
- **撤除时的结算在一处做完，次序固定**：中止这次发出 → 按首 token 规则定收场 → 写下响应体（或交回调用方）→ 释放这次发出占的资源。**不把这几步分散到几处由各自的清理去做**——那几处之间没有次序保证，账可能在连接关掉之后才被想起来。
- **带回复的那一次，本能力把响应体交回、不自己写**（`complete`、`truncated`，以及有内容的中断）：调用进入 `reply_pending`（[S-6](#s-6-调用的状态)），收场已定。**收口只有两条路**（`data.model-response/v1#S-3`）：
  - 回复过了「消息落盘之前」、**落盘成了消息**（`replyDisposition = persisted`）⇒ **调用方**把这条响应体与回复消息**同一提交**写下（`data.messages/v1#S-9`：一次回复只有一份权威内容；[S-38](#s-38-装配给的保证-vs-协议须给的保证) 第一行）；
  - 回复**被否决**或**本来就被系统拿去用**（`vetoed`、`consumed`）⇒ 调用方经 [S-49](#s-49-settlereply) 把处置交回，**本能力**以那个 `replyDisposition` 写下这条响应体（主线裁定，见 [D-040 §五 K36](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)）。
  **其余各条**（故障、没有回复的中断）由本能力在返回之前写下。
- **交回之后调用方没有收口**（它在收口之前就结束了）：本能力**不替它写成 `persisted`**——那要一条消息，而消息归调用方。兜底只有两个：宿主停止时的撤除（[S-36](#s-36-宿主停止与撤除)：写成没有回复的 `interrupted{run_cancelled}`，已交付的块进 `delivered`）、进程丢失之后下一次对账（[S-33](#s-33-reconcile)「已开口、无响应体」那一行）。
  **上界**：调用方收口、宿主停止、下一次对账，先到的那一个；loop 在结束这一步之前收口是它的义务（[G-11](#十二已知缺口)）。
- **结算写入不受尝试栅栏拒收**：一次尝试已经被栅栏关掉之后，属于它的那次发出的响应体与账**照样写下**，标为晚到（响应体上 `late: true`，`data.model-response/v1#S-35`，只在属于某个运行的调用上；账上同一标记，`data.call-accounts/v1#S-39`）——栅栏挡的是「旧尝试继续推 loop」，**不是「旧尝试花掉的钱」**（[PF-012 §6.17 I-11](../../../../product/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式)）。
- **账**：每条响应体恰一份账；拿不到记 `unknown`，不记零（`data.call-accounts/v1#S-19`、`#S-20`）。**停机之后追补的那一条，账是全未知的那一份**。这笔账**归哪次尝试、哪个运行、哪个租户、谁发起，由承载它的条目壳给**（`data.call-accounts/v1#S-25`），本能力写条目时照实给出。

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
- **账上分记两件事**：这一次用的是**哪个范围**的凭据（响应体 `route.credentialScope`，`data.model-response/v1#S-9`；也随「已出门」记下）、**发起者**是谁——**由承载这条响应体的条目壳上的租户身份给出**，不在响应体上另记（`data.call-accounts/v1#S-25`、`#S-38`；响应体上的 `initiator` 只指中断发起方，`data.model-response/v1#S-12`）。**用量记在凭据所在的范围头上，成本算到发起它的租户头上**——两件事都要，缺一个都会算错；两者只在走出厂格那一把时分叉（用租户自己那一把时那一格就是发起租户），出厂格那一把是唯一分叉点（`data.call-accounts/v1#S-38`）。
- **取不到**：没有可用的凭据、或保管方判解不出 ⇒ 这一次不发，首次发出写 `undispatched{credential_unavailable}`，续接或再发写 `released{cause: credential_unavailable}`（[S-29](#s-29-dispatch) ⑧）；租户那一格或保管方够不着 ⇒ `unavailable`，**不改用出厂格那一把或别的范围的凭据**。

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

- **它们是运行时设置项**，挂在 Agent 定义上、按设置那一套求值（[PF-013 §6.17](../../../../product/PF-013-model-profiles-and-invocation/design.md#617-本-topic-不出现任何时限数值)）；**不是档案属性，也不在重试件的配置里**。时长的表示取 `data.tool-definition/v1#S-14`。
- **两个项名是规格层给的名字**：PF-002 的设置项清单里还没有它们；它们在那一类资产的推出规则里怎样声明、默认值由谁给，在 [G-9](#十二已知缺口)。
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

> **与 `data.model-response/v1#S-23` 第 2 条一致**：那一条允许「故障、策略类、没开口」与「首 token 之前失联、被追补为 `interrupted{runtime_lost}`」两种之后再发（续接同一次调用是主线裁定，见 [D-040 §S16 S16-g](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)）。

### S-51 模型侧到达装配前提的承诺

**本能力是模型一侧的到达装配宿主**：[`capability.stream-assembly/v1#S-28`](../../stream-assembly/v1/contract.md#s-28-宿主要兑现的前提) 要宿主兑现的前提，本能力逐条承诺如下（编号与那边相同；第 3 条只对工具侧，第 5 条已不是宿主前提；主线裁定，见 [D-040 §六 L6](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)）。**生产者是传输适配**：它交来的到达事件是「增量」。

1. **路由**：一次发出恰一份装配状态，目标 `{ kind: model_call, callId, dispatch }`（`data.arrival-events/v1#S-5`），在这次发出出网时以 [`start`](../../stream-assembly/v1/contract.md#s-18-start开一份状态) 开；传输适配交来的事件按它所属的那次发出交给那一份。**路由键是（会话，目标）**：本能力同时承载多个会话，`callId` 只在会话内唯一（[S-5](#s-5-一次调用一次发出)）、目标本身不带会话，只按目标路由会让两个会话里相同的 `callId` 撞到一份状态上（主线裁定，见 [D-040 §七 M16](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）。**这次发出收场之后不再开新状态**：此后到达的事件丢弃，**不交给同一次调用的下一次发出**——续接、再发各是新的一次发出、新的一份状态（[S-22](#s-22-同一次调用的发出序列)）。
2. **串行**：同一份状态按传输适配交出事件的次序逐个 [`accept`](../../stream-assembly/v1/contract.md#s-19-accept接一个事件)，每次用上一次交出的新状态，**一份状态不分叉**。
4. **砍了要说**：传输适配若合并、截短或限额，每一次都以 `trim` 交给同一份状态，截短的那个 `trim` 紧挨在被截短的那个增量之前交；**`accept` 拒掉的每个增量，本能力紧接着（交下一个事件之前）以一个 `reason: rejected` 的 `trim` 说出来，只说一次**；本能力自己发的 `trim`、`finish` 被拒不补 `rejected`（那是本能力的缺陷）；这两种与收场之后到达的事件（第 1 条）都不进状态；**每一件，本能力记一条结构化日志事件**（`capability.stream-assembly/v1#S-26` 末条要宿主让它看得见；[SYS-OBSERVABILITY](../../../../foundation/observability-and-logging/requirements.md#sys-observability全链路可观测与日志完备).C3 要拒绝有可定位的记录）：**不进会话日志**、不成为六种记录之一；**必带**会话、`callId`、目标（含 `dispatch`）、**被拒的值**——`accept` 交回的那个失败值（`capability.stream-assembly/v1#S-23`），收场之后到达、不再交给任何状态的事件记 `event_after_finish`（同一条的第一行：状态已收尾又来一个事件；不再交给 `accept` 而记这个值是**本契约推导**）。主线裁定，见 [D-040 §七 M16](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)（载体是 JSONL 的运行日志；事件取什么名字归提供者设计，本契约不命名）。响应体写下即不变，不往上补。传输适配节不节流、阈值多少是部署政策，本契约不定。
6. **结束一条流**：
   - 上游正常收尾、写到上限 ⇒ 交 `finish`（`end`／`max_tokens`）；
   - **用户**叫停——直接叫停、插队顺带、用户取消这次运行时宿主先调的那次 `interrupt`（[S-31](#s-31-interrupt)）——⇒ 交 `finish { reason: interrupted }`；
   - 上游出错、断流、超时（[S-18](#s-18-成因按来源分类三类事实由守卫兑现)、[S-21](#s-21-两个时限是运行时设置项)）⇒ 交 `finish { reason: lost, error }`；
   - **「已开口」写不进**（[S-15](#s-15-两个锚点先写后行) 末条）⇒ 这次发出就此中止，交 `finish { reason: lost, error: { cause: unrecognized } }`（主线裁定，见 [D-040 §七 M15](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）——收场是首 token 之前的故障、成因 `unrecognized`、留痕本地错误（[S-16](#s-16-首-token-判据)），不是 `interrupted`；
   - 传输适配失去连续性而没给 `finish` ⇒ 调 [`abandon`](../../stream-assembly/v1/contract.md#s-22-abandon放弃)（说得出成因就带上）；
   - **宿主停止**（系统发起的运行取消：会话归档、宿主停止，[S-36](#s-36-宿主停止与撤除)）与**本能力自身被撤除或替换**时还在途的流 ⇒ **一律调 `abandon`、不带缘由**，流结局 `lost`；这次发出的收场仍是 `interrupted{run_cancelled}`，不是故障、没有回复（`data.model-response/v1#S-5` 第三处例外；主线裁定，见 [D-040 §七 M12](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）——撤下不是有意停下，**不交 `finish{ interrupted }`**。

   **不让一份状态永远不收尾**；进程没了时状态随之没了，不经本能力，由下一次对账追补（[S-33](#s-33-reconcile)）。
7. **包消息与记账**：收场时对那份状态 [`closeOut`](../../stream-assembly/v1/contract.md#s-21-closeout收尾结算)（放弃的那几支由 `abandon` 交出同一个形状的结果），交出的块按 `data.messages/v1#S-10` 包成一条 `AssistantMessage`（交回调用方，[S-17](#s-17-结算一处按序幂等先到者赢)），或不成消息、已交付的块进响应体的 `delivered`（`data.model-response/v1#S-13`）。**「已开口」写不进那一支例外**：交出的块没交给过任何观察者，**不进 `delivered`**，响应体也不带 `firstTokenAt`（[S-16](#s-16-首-token-判据)；D-040 §七 M15）。
   交出的账进这次发出的那一条响应体，**恰一次**——响应体按 `ResponseId` 判重（[S-17](#s-17-结算一处按序幂等先到者赢)）：`usage`、`cost` 原样；**`trims` 换写**——一次也没砍（汇总各项都是 `0`）时响应体的 `trims` **缺席**，否则原样写进（`capability.stream-assembly/v1#S-13`：两种写法指同一件事；照抄一份全零的汇总在响应体那边不合形状；主线裁定，见 [D-040 §七 M24](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）。
8. **首个内容的时刻**：在 `accept` 交出的状态里第一次看到 `firstContentAt` 时，**先写「已开口」、再把那个内容推给任何观察者**（[S-15](#s-15-两个锚点先写后行)、[S-16](#s-16-首-token-判据)）；「已开口」写不进，内容不交出（[S-15](#s-15-两个锚点先写后行) 末条）。
9. **快照与增量衔接**：给观察者（交付面、会话出站流）的快照取自 [`snapshot`](../../stream-assembly/v1/contract.md#s-20-snapshot读快照)、带位置；此后推给它的只有被接受的事件，与快照数的是同一串；**被拒的事件不推给观察者**；**只推给这次调用所在会话的观察者**（D-040 §七 M16）。**「已开口」写下之前交出的快照不含内容**——第 8 条约束「推给」，快照是观察者来拉，同一个锚点同样约束它（[S-15](#s-15-两个锚点先写后行)）。

**不做逆转写**：`ModelRequest.tools` 与传输适配交来的工具调用块里的 `tool`，都是**模型面名字**（`data.tool-definition/v1#S-6` 的 `ModelToolName`，`:` 转写成 `__`）；本能力与传输适配**原样进、原样出**，不把它转回工具定义的名字——逆转写只在工具执行运行时起执行者之前做（主线裁定，见 [D-040 §五 K10](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)、§六 L6）。传输适配须兑现的那一半在 [S-38](#s-38-装配给的保证-vs-协议须给的保证) 第 11 条。

- **做不到会怎样**写在那边（`capability.stream-assembly/v1#S-29`）：状态分叉，一支的片段静默丢失；被拒的增量不说，「砍了要说」落空、同一个增量被计两次；一次发出的迟到片段拼进下一次发出的回复；内容先被看见、「已开口」后写，停机之后重发出两份回复。
- 证据：规范场景 [S-52](#s-52-模型侧的装配宿主被拒的增量报一次收场之后的事件不进)。

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

**十三个操作**：读三个（`legalTargets`、`displayList`、`effectiveModel`）、切换一个（`selectModel`）、调用七个（`openCall`、`dispatch`、`dispatchAgain`、`interrupt`、`releaseCall`、`settleReply`、`reconcile`）、读两个（`readAttempts`、`canDispatchAgain`）。
`releaseCall` 是主线裁定的名字（见 [D-040 §S16 S16-a](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)）；`canDispatchAgain` 是主线裁定的名字（见 [D-040 §五 K22](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)）；`settleReply` 由规格层给出、主线接受（见 [D-040 §六 N-9](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)）。
**指认一次调用的操作一律同时收 `session`**（[S-5](#s-5-一次调用一次发出)）：身份参数，没有默认值；⑥ 里 `callNotFound` 先于其余判定值判——这个 `callId` 不是这个会话的，就不再往下判它处在什么状态。

### S-24 legalTargets

| # | 内容 |
|---|---|
| ① | `session` |
| ② | 无额外授权（见 [S-23](#s-23-这一节每个操作写全九件事) 共同口径） |
| ③ | 无 |
| ④ | 只读，无提交；**每次现算**，每个输入现读 |
| ⑤ | `LegalTargetSet`：一组 `RouteName`（`data.model-profile/v1#S-2`），按 [S-11](#s-11-合法目标集合) 的式子；**次序没有含义** |
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
| ⑤ | 一组条目，**每个名字一条** `{ routeName, ref, 注记集合, covered, selected }`，按 [S-12](#s-12-展示列表)：`ref` 是落点那一行（主标来源：`origin`，自建的再带 `scope`）；`covered` 是被盖住的同名行，每项 `{ ref, 注记集合 }`，只作标注；`selected` 为真恰在选中模型那一条上（其余为假，不缺席） |
| ⑥ | `invalidInput` · `unavailable` · `profileNotFound` |
| ⑦ | 只读，天然可重复 |
| ⑧ | 任一输入读不到 ⇒ `unavailable`；选中模型这个名字在链上没有任何一行 ⇒ `profileNotFound`；**不省掉选中模型那一条来凑出一份列表** |
| ⑨ | 不发 |

### S-26 effectiveModel

**给出 [S-10](#s-10-有效模型四步每步来源可查) 第 1、2、2′ 步的结果**——loop 据它填 `ModelRequest.target`（`data.loop-extension/v1#S-15`），交给「调模型之前」的拓展件。

| # | 内容 |
|---|---|
| ① | `session` |
| ② | 无额外授权 |
| ③ | 无 |
| ④ | 只读，无提交；每次现算 |
| ⑤ | `{ routeName: RouteName, profile: ModelProfileRef, selectedBy: session | layer_lock, selected: RouteName }`——`selected` 是第 1 步的选中模型（名字），`routeName` 是第 2 步之后的名字，`profile` 是它在第 2′ 步落到的那一行。**`selectedBy = layer_lock` 当且仅当第 2 步有一格上锁**，不论锁定的名字与 `selected` 相同与否（`data.model-response/v1#S-10`）；`routeName` 与 `selected` 不同只可能因为锁。**不判合法**：落点可能已下架或这个范围不允许，出门前检查才挡（[S-10](#s-10-有效模型四步每步来源可查) 第 4 步）。loop 把 `routeName` 填进 `ModelRequest.target`，并把整份 ⑤ 原样带给 [S-28](#s-28-opencall) ① 的 `basis` |
| ⑥ | `invalidInput` · `profileNotFound` · `unavailable` |
| ⑦ | 只读，天然可重复 |
| ⑧ | 会话日志、层级求值、链上档案读不到 ⇒ `unavailable`；**不回退到设置初值或上一次用过的**。第 2 步之后的名字在链上没有任何一行 ⇒ `profileNotFound`，不自造一个落点 |
| ⑨ | 不发 |

### S-27 selectModel

**用户的切换命令：把会话的选中模型换成一个合法目标——一个路由名。**

| # | 内容 |
|---|---|
| ① | `session`；`routeName: RouteName`（切到的名字，`data.model-profile/v1#S-2`；不是某一行的引用） |
| ② | **只由交付面的切换命令调用**——agent 与拓展件没有这条路（`data.loop-extension/v1#S-24`）。发命令的就是会话持有的那个租户：入口层已核身份、会话打开时已核归属（[S-23](#s-23-这一节每个操作写全九件事) 共同口径）；**「谁切的」从承载那条记录的条目壳读**（`data.messages/v1#S-49`），本操作不另收一个租户身份 |
| ③ | 无 |
| ④ | **单次提交**：判 `routeName` ∈ 合法目标 → 写下模型切换的记录（`model_selection_changed`，记这个名字，`data.messages/v1#S-49`）。**判定与写入不在同一提交**：其间目标变得不合法（被撤回、会话里新进来一张没人转的图），由[§6.9](../../../../product/PF-013-model-profiles-and-invocation/design.md#69-合法目标算不出来时不替用户改选)兜住——下一次请求发不出去、上交、不替用户改选。**这是有意接受的窗口** |
| ⑤ | `{ selected: routeName }`。**生效点是下一次 `effectiveModel`**，在途调用不受影响（[S-7](#s-7-一次调用绑定了什么)） |
| ⑥ | `invalidInput` · `unavailable` · `profileNotFound` · `notLegalTarget{because}` |
| ⑦ | **先判合法，再判重复**：`routeName` 是合法目标、且等于当前选中模型（逐码点）⇒ 不写新记录，返回同一个 ⑤。**不合法的当前选中不因「与当前相同」而成功**——重选一个已下架的当前选中得 `notLegalTarget{because: [withdrawn]}`（[S-44](#s-44-已下架的档案)） |
| ⑧ | 合法目标算不出来 ⇒ `unavailable`，**不写记录**；那条记录写不进 ⇒ `unavailable`，**选中模型不变**——不「先生效再补写」 |
| ⑨ | 不发（那条记录在日志里，读日志的人看得到） |

**合法目标不得拒绝**（[§6.5](../../../../product/PF-013-model-profiles-and-invocation/design.md#65-切换是用户的直接命令合法目标不得拒绝)）：`routeName` 在合法目标里，本操作**只可能**因 `unavailable` 失败。
**不合法的不以「被拒」出现在交付面**：交付面只把合法目标做成可选项；本失败值是接口层的，不是给用户看的一次「切换被拒」。

### S-28 openCall

**打开一次调用：绑定有效模型、档案快照与参数，过出门前检查。**

| # | 内容 |
|---|---|
| ① | **`ModelCallRequest`**：`callId?`（缺席 = 打开一次**新**调用，由本能力产生；给出 = **续接**一次处于 `resumable` 的调用）、`run`、`attempt`、`session`、`messages`（组装出来、这一次要发的消息）、`target`（**恒在**：过完「调模型之前」瀑布的那个路由名，`data.model-profile` 的 `RouteName`，`data.loop-extension/v1#S-15`）、`targetChangedBy?`（有拓展件经 `select_model` 改过 `target` 才给：改它的那件拓展件的能力标识，`data.content-blocks` 的 `CapabilityId`）、`basis`（loop 填 `ModelRequest.target` 时用的那份 [`effectiveModel`](#s-26-effectivemodel) ⑤，原样带来）、`parameters?`（这一次对档案 `parameters` 的逐项覆盖；缺席 = 不覆盖）、`tools`（这一次带给模型的工具条目，每项是那个条目的**模型面名字**——`data.tool-definition` v1 的 `ModelToolName`（[S-6](../../../data/tool-definition/v1/contract.md#s-6-模型面只有一个条目)），可以是空数组、不重复）；外加**宿主**与**会话日志的追加入口**。**`target`、`parameters`、`messages`、`tools` 与 `data.loop-extension/v1#S-15` 的 `ModelRequest` 同名成员逐字相同**（主线裁定，见 [D-040 §S16 S16-c](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)；`tools` 取模型面名字是主线裁定，见 [D-040 §五 K10](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)）。**`run` 与 `attempt` 同时出现或同时缺席**：同时缺席是调用方的显式陈述「这次调用不属于任何 Run」（[S-5](#s-5-一次调用一次发出)），不是默认值 |
| ② | 宿主不在停止中；`session` 存在；续接时 `callId` 属于这个 `session` 且处于 `resumable` |
| ③ | **有**：`target` 不能由本操作以外的路径改——`parameters` 里出现目标、`messages` 之外塞进换模型的指示，一律 `invalidInput`（`data.loop-extension/v1#S-15`：`target` 只经 `select_model`）；**没有 `targetChangedBy` 时 `target` 必须等于 `basis.routeName`**，否则 `invalidInput`——目标变了却说不出是谁改的 |
| ④ | **新调用**：**用交来的 `target`，不重算选中模型**——拓展件看到、并据以改写参数的就是这个名字；`basis` 求出之后才落下的模型切换，从下一次 `effectiveModel` 起生效（[S-27](#s-27-selectmodel) ⑤）。把 `target` 经 [S-10](#s-10-有效模型四步每步来源可查) 第 2′ 步**此刻**解析为一行 → 读档案 → 合并参数 → **出门前检查**（下表）→ 绑定（[S-7](#s-7-一次调用绑定了什么)；`selectedBy` = 有 `targetChangedBy` 时 `{ extension: targetChangedBy }`，否则 `basis.selectedBy`）。**检查不过**：写一条调用终结记录 `undispatched{cause}`，这次调用即在终态 `handed_up`。**检查通过**：不写任何记录——一次还没出门的调用，停机之后不留痕迹、也没有要追补的东西。**续接**：重新绑定宿主与追加入口，**绑定从最近一次发出的「已出门」记录读**（[S-7](#s-7-一次调用绑定了什么)），不重读档案、不重做出门前检查（这次调用已经被准入过）；交来的 `target`、`parameters`、`basis` 在续接时不用 |
| ⑤ | `{ callId, state: open | resumable }`，或 `{ callId, state: handed_up, undispatched: cause }` |
| ⑥ | `invalidInput` · `callNotFound` · `runtimeStopped` · `wrongPhase` · `unavailable` · `profileNotFound` |
| ⑦ | **新调用不幂等**：同一份请求打开两次是两次调用、两个 `callId`——**防重归调用方**（loop 在同一步只打开一次）。**续接可重复**：已在 `resumable` 且已重新绑定到同一宿主 ⇒ 返回同样的 ⑤ |
| ⑧ | 目录、会话日志、层级求值、允许集合、投影、保管方任一读不到 ⇒ `unavailable`，**不写任何记录**、不打开调用——「判不出来」不记成 `undispatched`。`target` 那个名字在链上没有任何一行 ⇒ `profileNotFound`（接口错误：调用方交来一个这条链上从未有过的名字） |
| ⑨ | 不发 |

**出门前检查**（核的是**有效模型**——名字这一次落到的那一行，[PF-013 §6.9](../../../../product/PF-013-model-profiles-and-invocation/design.md#69-合法目标算不出来时不替用户改选)「出门之前核的是有效模型」；依次核，第一个不过的即成因。前两行只在没有胜出行时不过，那时落点就是已撤回或这个范围不允许的那一行，[S-10](#s-10-有效模型四步每步来源可查)）：

| 次序 | 检查 | 不过即 |
|---|---|---|
| 1 | 档案在册 | `withdrawn` |
| 2 | 这个范围允许它 | `scope_disallowed` |
| 3 | `compatible(档案, 投影)`；**另核可发出的前置**：投影 ⊆ 本据点传输能承载的模态（[S-11](#s-11-合法目标集合) 末段） | `modality_mismatch`（两样不过都归它：都是「会话里的模态这一次送不到这个模型」） |
| 4 | 凭据：以发起租户与有效模型的来源问「有没有」 | `credential_unavailable` |
| 5 | 合并后的参数过 `data.model-profile/v1#S-24`（含输出上限） | **不是成因**：`invalidInput{reason}`——覆盖不合法是调用方交来的输入错，不是一次上交 |

- **检查的是这一刻**：拓展件改过的 `target` 若在它核完之后变得不合法，这里照样挡下。
- **`undispatched` 的调用没有响应体**（`data.model-response/v1#S-16`）；上交条目由 loop 写（[S-3](#s-3-本契约明确不承诺什么)）。

### S-29 dispatch

**发出一次：首次发出，或续接之后的再发。**

| # | 内容 |
|---|---|
| ① | `session`；`callId`；这次发出落在哪一次尝试（调用属于某个 Run 时必给） |
| ② | 调用处于 `open` 或 `resumable`；宿主不在停止中 |
| ③ | **有**：调用里任何一次发出开过口 ⇒ 不发（`retryRefused{already_spoke}`）——跨尝试同样成立 |
| ④ | **提交点是「已出门」**：取凭据 → 传输适配为这一次定下改值与丢项 → 写「已出门」（带 `ResponseId`、那一家、这次调用的绑定与那两项，[S-8](#s-8-调用在会话日志里留下的六种记录)）→ 请求出网，**发出的就是「已出门」还原得出的那一组**（[S-7](#s-7-一次调用绑定了什么)），出网之后不再改。首次发出取档案快照里的第一家；续接取失联那次的那一家。**开口时**写「已开口」再交出内容（[S-15](#s-15-两个锚点先写后行)）。**收场时**按 [S-17](#s-17-结算一处按序幂等先到者赢) 结算 |
| ⑤ | **等到这次发出收场才返回**，返回这次发出的[模型响应体](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-response--模型响应体--model-response)（`data.model-response` 形状），并说明它**由谁写**：<br>• `outcome ∈ { complete, truncated }`，或 `interrupted` 且有回复 ⇒ **交回，未写**：调用进入 `reply_pending`，由调用方收口（[S-17](#s-17-结算一处按序幂等先到者赢)）；`reply` 是一条 `AssistantMessage`，`ending` 与收场一一对应（`data.messages/v1#S-10`）<br>• `failed`，或 `interrupted` 且没有内容 ⇒ **已写**：本能力在返回之前写下。`failed` 时调用进入 `awaiting_decision`，返回里带「调模型之后」失败那一维的主体所需的事实（`data.loop-extension/v1#S-14`：档案快照、这次调用已有的「已出门」、成因、原样状态码）——**重试件只凭那份主体下结论**，不读响应体序列（`data.model-response/v1#S-23` 是那份主体背后的事实） |
| ⑥ | `invalidInput` · `callNotFound` · `alreadyEnded` · `retryRefused{already_spoke}` · `wrongPhase` · `runtimeStopped` · `unavailable` |
| ⑦ | **不幂等**：每一次成功调用都是一次新的发出。重复调用由状态挡住：第一次调用让调用离开 `open`／`resumable`，第二次得 `wrongPhase` |
| ⑧ | 凭据取不到（按 [S-19](#s-19-凭据每次发出现取取值只交给传输适配) 没有可用的那一把）⇒ **首次发出**：不写「已出门」，写调用终结 `undispatched{credential_unavailable}`（这次调用一次也没发出），返回 `{ undispatched }`；**续接的再发**：同样不出门，写调用终结 **`released{cause: credential_unavailable}`**——这次调用此前已有发出，不是 `undispatched`（`data.messages/v1#S-50`；主线裁定，见 [D-040 §五 K21](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)），调用进入 `handed_up`、上交照常。保管方、追加口够不着 ⇒ `unavailable`，**不出门**、调用停在原状态。取不到时限设置 ⇒ `unavailable`（[S-21](#s-21-两个时限是运行时设置项)） |
| ⑨ | 不发 |

- **首 token 之后出了故障**：`failed{interrupted_mid_reply}`，已交付的块进 `delivered`（没长完的工具调用照 `data.content-blocks/v1#S-13`），**不成为消息**；调用进入 `awaiting_decision`，但它**不会再有发出**（[S-30](#s-30-dispatchagain) 守卫），loop 只能放手。
- **传输层不得在一次发出之内隐藏重试**（`data.model-response/v1#S-24`）：重试只能是下一次 `dispatchAgain`。

### S-30 dispatchAgain

**loop 读到一条 `retry { plan }` 之后，照计划在同一次调用下再发一次。**

| # | 内容 |
|---|---|
| ① | `session`；`callId`；`plan: { provider, after? }`（`data.loop-extension/v1#S-27`）；这次发出落在哪一次尝试 |
| ② | 调用处于 `awaiting_decision`；宿主不在停止中 |
| ③ | **有——终态检查、两个守卫加一条计划约束，任何拓展件都推翻不了**（终态 ⇒ `alreadyEnded`；其余见下表）。**同一张表另有只读的判定面** [S-50](#s-50-candispatchagain)，两处判定逐条相同 |
| ④ | 守卫全过之后同 [S-29](#s-29-dispatch) ④，那一家取 `plan.provider`；`after` 给出时**由 loop 在退避到期之后才调用本操作**——本能力不替它计时 |
| ⑤ | 同 [S-29](#s-29-dispatch) ⑤ |
| ⑥ | `invalidInput` · `callNotFound` · `alreadyEnded` · `retryRefused{already_spoke}` · `wrongPhase` · `retryRefused{fact_class \| provider_not_allowed}` · `runtimeStopped` · `unavailable` |
| ⑦ | 不幂等：两次调用即两次再发的尝试；第一次成功后调用离开 `awaiting_decision`，第二次得 `wrongPhase` |
| ⑧ | 同 [S-29](#s-29-dispatch) ⑧（再发时取不到凭据 ⇒ `released{cause: credential_unavailable}`） |
| ⑨ | 不发 |

**`retryRefused` 的 `why`，闭合、按表中次序判；守卫 2、3 只在调用处于 `awaiting_decision` 时求值**（不在那个状态的调用先得 `wrongPhase`，⑥）：

| 次序 | `why` | 条件 | 依据 |
|---|---|---|---|
| 1 | `already_spoke` | 这次调用任何一次发出开过口——**跨尝试** | [「一个逻辑回复只发一次」](../../../../product/PF-013-model-profiles-and-invocation/design.md#有三件事它改不动) |
| 2 | `fact_class` | 最近一次发出的成因属于「发不出去」或「重试没用」（`credential_unavailable`、`request_rejected`） | [PF-013 §5.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#54-三类事实归本层定死其余照状态码) |
| 3 | `provider_not_allowed` | `plan.provider` 不在档案快照「允许的供应商」里；或快照说不允许回退而 `plan.provider` 不是第一家 | `data.loop-extension/v1#S-27`；[S-22](#s-22-同一次调用的发出序列) 第 5 条 |

- **`plan` 里出现 `provider`、`after` 之外的成员**（比如一个目标）⇒ `invalidInput`：**换模型不是 `retry` 能做的**，那是用户的切换命令（`data.loop-extension/v1#S-27`）。
- **被拒的 `retry` 怎样记下**，归 `capability.loop-extension-runner`（按它对可改写件的报错处置）；本操作只如实返回 `why`。
- **已终结的调用只有一个值**：调用已在终态 ⇒ `alreadyEnded`，排在 `retryRefused` 之前判（主线裁定，见 [D-040 §S16 S16-b](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)）。
- **`already_spoke` 与状态检查的次序**：`already_spoke` 排在 `wrongPhase` 之前判——一次开过口、尚未终结的调用，无论此刻处在什么状态，调用方拿到的都是「开过口」这个事实。

### S-31 interrupt

**单独中断这一次调用，不动别的。**

| # | 内容 |
|---|---|
| ① | `session`；`callId`；`initiator ∈ { user, run_cancelled }`。**经本操作的 `run_cancelled` 只出自用户取消这次运行**——那样收尾的回复落成 `interrupted_by_user`（`data.messages/v1#S-10`）；**系统发起的运行取消**（会话归档、宿主停止）不经本操作，走 [S-36](#s-36-宿主停止与撤除) 的撤除：在途的流被放弃、没有回复（[D-040 §七 M12](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)；只出自用户这一读法是**本契约推导**：本操作分不出运行是谁取消的，而系统发起的若落成回复就是冒称用户） |
| ② | 调用不在终态、也不在 `reply_pending`（收场已定，[S-6](#s-6-调用的状态)）。**`runtime_lost` 不是本操作的取值**——它只由对账写下（[S-33](#s-33-reconcile)） |
| ③ | **只作用于这一个 `callId`**：不动同一会话里别的调用、不动正在跑的工具执行、不终结 Run（[§5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#单独控制中断这一次调用不动别的)） |
| ④ | **提交点是「中断意图」**：先写中断意图 → 再发中止信号 → 结算（[S-17](#s-17-结算一处按序幂等先到者赢)）。**本操作在中断意图写下之后即返回**，不等结算完成 |
| ⑤ | **中断落在哪个阶段**：`before_dispatch`（`open`、`awaiting_decision`、`resumable`：没有在途发出，写调用终结 `interrupted{initiator}`，没有响应体）· `in_flight`（没开口：这次发出以 `interrupted`、无回复收场，本能力写响应体）· `speaking`（开了口：以 `interrupted`、带已交付内容作回复收场，交回 `dispatch` 的调用方，调用进入 `reply_pending`、照 [S-17](#s-17-结算一处按序幂等先到者赢) 收口） |
| ⑥ | `invalidInput` · `callNotFound` · `alreadyEnded` · `unavailable` |
| ⑦ | **幂等**：已有中断意图、尚未结算 ⇒ 不写第二条，返回同一个 ⑤。**先到者赢**：这次发出在中止信号到达之前已经收场（完成或失败），那个收场成立——调用已在终态或 `reply_pending` 时本操作得 `alreadyEnded`；已在 `awaiting_decision` 时按 `before_dispatch` 结束调用 |
| ⑧ | 中断意图写不进 ⇒ `unavailable`，**不发中止信号**——不写意图就中止，停机之后对账会把这次调用当成「失联」而再发一次，用户叫停的东西又跑了起来 |
| ⑨ | 不发 |

- **被中断不是故障**：不带成因、不经「调模型之后」失败那一维、不是上交（[还有一种没走完](../../../../product/PF-013-model-profiles-and-invocation/design.md#还有一种没走完它不在这张表里)）。响应体上 `interrupted` 带 `initiator`（`data.model-response/v1#S-12`）。
- **中断提醒由 loop 补**（`data.messages/v1#S-21`）；本契约不写它。

### S-32 releaseCall

**loop 决定不再试：让一次处于 `awaiting_decision` 或 `resumable` 的调用以上交收场。**

| # | 内容 |
|---|---|
| ① | `session`；`callId` |
| ② | 调用处于 `awaiting_decision` 或 `resumable` |
| ③ | 无 |
| ④ | **单次提交**：写调用终结 `released`（`data.messages/v1#S-50`），**不带 `cause`**——从 `awaiting_decision` 放手时最近一次发出的成因由它的响应体给出，不另记；从 `resumable` 放手时最近一次是失联补写的 `interrupted{runtime_lost}`，**不是故障、没有成因可带**（上交条目带什么归 loop，[G-17](#十二已知缺口)）。`cause` 只在续接或再发时取不到凭据那一支出现（[S-29](#s-29-dispatch) ⑧） |
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
| ① | `session`；`attempt?`：新的这一次尝试——由会话重新承载触发时缺席（见 ②） |
| ② | **两个调用时机，都由调用方保证**：① 这个会话的**新尝试开始之后、loop 推进之前**（带 `attempt`）；② 会话在据点上**重新承载之后**（停机重启、迁到别的宿主）、**会话级的任何调用打开之前**（不带 `attempt`）——**不属于任何 Run 的调用**没有「新的一次尝试」来触发对账，由这一时机收口（**规格层推导**；谁在什么时候调它归会话生命周期那一侧，[G-11](#十二已知缺口)；[PF-015 会话睡一觉醒来](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#第一件会话睡一觉醒来还得是原来那个)）。两个时机对账的是同一张表、同一批调用，先到的那一次做完，后到的按 ⑦ 是空操作。同一会话同一时刻只有一副协程在推它（PF-012） |
| ③ | **有**：对账**从不发出**——它只追补结算、给出状态；再发由 loop 调 `dispatch` |
| ④ | 对每一次没收场的调用，按它**最后一次发出**在日志里的样子（下表）追补；**每一行各自一次提交**，按 `ResponseId` 幂等（[S-17](#s-17-结算一处按序幂等先到者赢)）。**追补的响应体的路由留痕取自那次发出的「已出门」记录**（有效模型引用、档案快照、`selectedBy`、`credentialScope`，[S-7](#s-7-一次调用绑定了什么)）——不重读档案、不自造；**参数三项同样从它读**（主线裁定，见 [D-040 §六 L4](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)；原 G-18 闭合）：`parameterAdjustments`、`droppedParameters` 原样取那条记录上的（缺席照缺席，缺席即断言没改、没丢，`data.model-response/v1#S-11` 第 3 条），`route.parameters` 取那条记录还原得出的实际发出的那一组（[S-7](#s-7-一次调用绑定了什么)）——**不拿合并之后的那一组冒充实际发出的**；那次发出属于某个运行、所在的尝试已被栅栏关掉的，带 `late: true`（`data.model-response/v1#S-35`：**只写在带 `runId` 的调用上**，不属于任何运行的调用的那一条不带） |
| ⑤ | 每一次被对账的调用一条 `{ callId, state }`，`state ∈ { resumable, awaiting_decision, interrupted, complete, handed_up }` |
| ⑥ | `invalidInput` · `unavailable` |
| ⑦ | **幂等**：再对一次，已追补的不再追补，返回同样的结果 |
| ⑧ | 会话日志读不到、追补写不进 ⇒ `unavailable`，**不返回部分结果**——loop 不得在对账没完成时推进 |
| ⑨ | 不发 |

**对账表**（按行从上到下，第一行命中即是）：

| 日志里这次调用 | 追补 | 调用随之 |
|---|---|---|
| 有**中断意图**，最后一次发出已出门、无响应体 | 响应体：`interrupted`，`initiator` 取意图上的那个；首 token 有无取「已开口」有无；账全未知；**没有回复**（在途内容不在日志里） | `interrupted`（终态） |
| 有**中断意图**，没有在途发出（含一次都还没发出、只打开过的调用） | 调用终结 `interrupted`，`initiator` 取意图上的那个 | `interrupted`（终态） |
| 已出门，**无**已开口，无响应体 | 响应体：`interrupted{runtime_lost}`，**没有首 token**，账全未知 | **`resumable`**：loop 在新尝试里以同一个 `callId` 续接、发给同一家 |
| 已开口，无响应体 | 响应体：`interrupted{runtime_lost}`，首 token 取自「已开口」，账全未知；**已交付内容可以缺席**（在途组装不进日志） | `interrupted`（终态）；**不重发**；中断提醒由 loop 补 |
| 最后一次发出有响应体，`failed`，没有调用终结 | 无 | `awaiting_decision`：loop 重新走「调模型之后」失败那一维 |
| 最后一次发出有响应体，`interrupted{runtime_lost}`、没有首 token，没有调用终结 | 无（上一次对账已追补，续接之前又停了） | `resumable` |
| 其余（已在终态） | 无 | 原终态 |

- **「首 token 之后停机」收成被中断（`interrupted{runtime_lost}`），与 [PF-013 §5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token)「记下的原因是运行时失联」、PF-012 先对账那一行「算说到一半断了、绝不再发」说的是同一件事**（主线裁定，见 [D-040 §S16 S16-g](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)）。**都不重发**。
- **已开口的那半句可能不在日志里**：在途组装不进日志，停机时它就没了——这时[「用户看见了的，日志里必须有」](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有)不成立，以中断提醒兜底（[PF-012 先对账](../../../../product/PF-012-agent-loop-and-run/design.md#先对账再进方程)那一行「追补中断提醒」）。**这是已知的、写明的例外**，不是本契约静默放弃。
- **一次还没出门、也没有中断意图的调用不在对账范围内**：它没留下任何记录（[S-28](#s-28-opencall) ④）；新尝试从方程重新算，会不会再打开一次新调用归 loop。**有中断意图的，哪怕一次都没发出，也按第二行写调用终结**——意图是一条耐久记录，用户叫停过的调用要有终态。
- **交回之后调用方还没收口就停了的那一次**（`reply_pending`，[S-17](#s-17-结算一处按序幂等先到者赢)）：日志里是「已开口、无响应体」，落在第四行——回复本身随进程没了，按失联追补。

### S-34 readAttempts

| # | 内容 |
|---|---|
| ① | `session`；`callId` |
| ② | 无额外授权 |
| ③ | 无 |
| ④ | 只读，无提交 |
| ⑤ | 这次调用的状态，与它的每一次发出：序号、所在尝试、那一家、两个锚点有无、响应体（已写下的）。**刚打开、还没发出的调用**（`open`）在日志里没有任何记录：本能力手里有它 ⇒ `{ state: open, dispatches: [] }`——它此刻只存在于本能力手里，这是唯一一处以在途状态作答，停机之后它就不在了（[S-28](#s-28-opencall) ④）；手里也没有 ⇒ `callNotFound` |
| ⑥ | `invalidInput` · `callNotFound` · `unavailable` |
| ⑦ | 只读，天然可重复 |
| ⑧ | 日志读不到 ⇒ `unavailable`；**日志里有记录的调用不以本能力手里的在途状态代答**——那份状态停机即失 |
| ⑨ | 不发 |

### S-49 settleReply

**调用方交回一份回复的处置：它被否决了，或本来就被系统拿去用了——本能力以这个处置写下那条响应体。**（服务面名由规格层给出、主线接受，见 [D-040 §六 N-9](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)；「被否决、被系统使用的那一条由本能力写」是主线裁定，见 [D-040 §五 K36](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)。）

| # | 内容 |
|---|---|
| ① | `session`；`callId`；`disposition`：`{ vetoed: { by, reason? } }` 或 `{ consumed: { by } }`——`data.model-response/v1#S-14` 的 `replyDisposition` 里除 `persisted` 之外的两支，成员与取值照那一条 |
| ② | 调用处于 `reply_pending`（[S-6](#s-6-调用的状态)）；调用方是收到那份交回的一方（本版由装配给，[S-38](#s-38-装配给的保证-vs-协议须给的保证)） |
| ③ | **有**：`disposition` 是 `persisted` 或缺席 ⇒ `invalidInput`——落盘成了消息的那一条只能由调用方与消息同一提交写（[S-17](#s-17-结算一处按序幂等先到者赢)），本能力写不出那条消息 |
| ④ | **单次提交**：把交回的那份响应体加上 `replyDisposition = disposition` 写下，按 `ResponseId` 幂等（[S-17](#s-17-结算一处按序幂等先到者赢)）；调用进入交回时已定的终态（`complete`，或带回复被中断的 `interrupted`）。**不改收场、不改 `reply`**：否决不改写收场（`data.model-response/v1#S-14`） |
| ⑤ | `{ callId, state }` |
| ⑥ | `invalidInput` · `callNotFound` · `alreadyEnded` · `wrongPhase` · `unavailable` |
| ⑦ | **幂等**：那条响应体已以同一个处置写下 ⇒ 返回同一个 ⑤；已以别的处置写下（含调用方已写成 `persisted`）⇒ `alreadyEnded` |
| ⑧ | 写不进 ⇒ `unavailable`，调用停在 `reply_pending`，**不改写成别的收场**；调用方可以再调一次 |
| ⑨ | 不发 |

- **被否决不是调用失败**：这次调用照常结束、记下被谁否决；不交给重试挂件，要再试是 loop 另起一次新的模型调用（[PF-012 否决按产生者分三路](../../../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前的否决按消息是谁产生的分三路)、`data.model-response/v1#S-23` 第 4 条）。
- **账照记**：被否决、被系统使用的那一份回复花的钱与落盘成消息的一样记在这条响应体上。

### S-50 canDispatchAgain

**只读地判一条 `retry { plan }` 此刻能不能照做**——拓展件执行器在把一条 `retry` 结论落日志之前用它判合法（`capability.loop-extension-runner` v1 S-14），**不必先发出再判，也不自己复刻一份守卫表**。（主线裁定，见 [D-040 §五 K22](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)；收 `plan` 是规格层推导：守卫 3 要看它。）

| # | 内容 |
|---|---|
| ① | `session`；`callId`；`plan: { provider, after? }`（`data.loop-extension/v1#S-27`）——守卫 3 要看 `plan.provider`，所以计划是输入的一部分 |
| ② | 无额外授权（[S-23](#s-23-这一节每个操作写全九件事) 共同口径） |
| ③ | 无 |
| ④ | 只读，无提交。**判定与 [S-30](#s-30-dispatchagain) ③ 的终态检查、守卫表逐条相同、次序相同**——两处是同一张表，不是两份 |
| ⑤ | `{ allowed }` 或 `{ refused: { why } }`，`why` 取 [S-30](#s-30-dispatchagain) 的闭合表（`already_spoke` · `fact_class` · `provider_not_allowed`） |
| ⑥ | `invalidInput` · `callNotFound` · `alreadyEnded` · `wrongPhase` · `unavailable`；判定次序与 [S-30](#s-30-dispatchagain) ⑥ 相同：`already_spoke` 先于 `wrongPhase` 答成 `{ refused }`，守卫 2、3 只在 `awaiting_decision` 时求值 |
| ⑦ | 只读，天然可重复；**答案只对那一刻成立**：`{ allowed }` 不保证随后那次 `dispatchAgain` 成功——状态、宿主停止、依赖可用在那一刻另判 |
| ⑧ | 日志或档案快照读不到 ⇒ `unavailable`，**不答 `{ allowed }`** |
| ⑨ | 不发 |

---

## 五、默认重试件

### S-35 默认重试件（可替换）

**系统自带一件挂在「调模型之后」失败那一维上的重试拓展件**（[开箱就有重试](../../../../product/PF-013-model-profiles-and-invocation/design.md#系统自带一件默认的所以开箱就有重试)），**租户可以把它替换掉**。
它是一件拓展件，走同一套位置、同一套干预力，不享受特权；**它的结论照样过 [S-30](#s-30-dispatchagain) 的守卫**。

**它的行为（它的全部规格）：**

1. **只对策略那一类出手**：最近一次发出的成因是 `upstream_unavailable` 或 `unrecognized` 时才考虑再试；其余一律不给 `retry`（给了也会被守卫拒——它不去试）。
2. **逐家一遍**：按档案快照「允许的供应商」的次序，**下一家**是最近一次发出那一家之后的那一家；**每一家至多一次**。
3. **不允许回退时同家至多再试一次**：档案快照说不允许回退 ⇒ 给一次 `retry { provider: 第一家 }`，此后不再给（主线裁定，见 [D-040 §S16 S16-g](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)：保住「开箱就有重试」）。
4. **退避**：`after` 取具名参数 **`default_retry_backoff`**——它是这件重试件的配置（[PF-013 §6.17](../../../../product/PF-013-model-profiles-and-invocation/design.md#617-本-topic-不出现任何时限数值)「退避等多久」一行），本契约不填值（[G-8](#十二已知缺口)）。
5. **没有下一家 ⇒ 不再试**（试尽），交回，loop 上交。

- **试尽的判定**：默认件在有限步内必判「不再试」——允许回退时每家至多一次、家数有限；不允许回退时同家至多一次再试。**自定义件不承诺这一点**（[S-3](#s-3-本契约明确不承诺什么)）。
- **续接不经过它**：首 token 之前失联之后的续接是 [S-33](#s-33-reconcile) 与 [S-29](#s-29-dispatch) 的事，不是一次重试，不占「每家至多一次」的名额。
- **它挂了**：按 `capability.loop-extension-runner` 的系统自带件不可用处置——由装配预先声明的指定挂件顶上，效果是一律不重试、这一层试尽上交（[S-17](../../loop-extension-runner/v1/contract.md#s-17-系统自带件不可用时一律关门)；[PF-012 系统自带的几件，不可用时各有定法](../../../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件不可用时各有定法)）；本契约只写：**它不在时，调用不会被自动再发**。

> **不允许回退的档案也有一次重试**：[PF-013 §5.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#系统自带一件默认的所以开箱就有重试) 担心的「一次网络抖动就打断一轮对话」在这类档案上由同家那一次再试兜住；退避取值仍在 [G-8](#十二已知缺口)。

---

## 六、宿主停止与撤除

### S-36 宿主停止与撤除

**一次调用跟着它的宿主停**（[PF-012 §6.13](../../../../product/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走)）：宿主（agent runtime）停下时，挂在它上面的每一次没收场的调用都被结算。

- **宿主进入停止之后**，`openCall`、`dispatch`、`dispatchAgain` 一律 `runtimeStopped`；`interrupt`、`releaseCall`、`settleReply`、`readAttempts`、`canDispatchAgain` 照常。
- **结算**：对每一次在途发出，按 [S-17](#s-17-结算一处按序幂等先到者赢) 在一处做完——中止 → **对它的装配状态 [`abandon`](../../stream-assembly/v1/contract.md#s-22-abandon放弃)、不带缘由**（流结局 `lost`，[S-51](#s-51-模型侧到达装配前提的承诺) 第 6 条）→ 收场 `interrupted`、`initiator = run_cancelled`、**不是故障、没有回复**，已交付的块进 `delivered`（`data.model-response/v1#S-5` 第三处例外、`#S-13`「开了口、没有回复」那一行）→ 写下响应体 → 释放。**宿主停止是系统发起的运行取消，不是有意停下**：不交 `finish{interrupted}`、不产出回复，那半截回复不成为消息（`data.messages/v1#S-10`；主线裁定，见 [D-040 §七 M12](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）。没有在途发出的调用写调用终结 `interrupted{initiator: run_cancelled}`（`data.messages/v1#S-50` 那一支必带发起方）。
- **有内容的那一次**：**用户取消这次运行时**，宿主**先**对它调 `interrupt(run_cancelled)`、让 `dispatch` 的调用方把回复收口（[S-31](#s-31-interrupt)、[S-17](#s-17-结算一处按序幂等先到者赢)；回复落成 `interrupted_by_user`），**再**停止——这是用户发起那一路，**这条次序是宿主的义务**（[G-11](#十二已知缺口)）。系统发起的停止、宿主没这样做就停了、或交回的回复还在 `reply_pending`、调用方没来得及收口——本能力的撤除只写一条**没有回复**的 `interrupted{run_cancelled}`，已交付的块进 `delivered`；在途的流按上一条放弃，已在 `reply_pending` 的那一次流已收尾、不再放弃。
- **进程崩溃时撤除一个都不跑**：上面这些只是加速；**权威的收口是下一次尝试的对账**（[S-33](#s-33-reconcile)）。
- **本能力自身被撤除或替换**：对它手里每一次在途调用做同样的结算——**先对在途的流 `abandon`**（流结局 `lost`），调用账仍是 `interrupted{run_cancelled}`（[D-040 §七 M12](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)；与桥换代同类）——再释放连接。**它拥有的全部耐久事实都在会话日志里**（六种记录）；手里的在途状态停机即失，**没有一条正确性依赖它**。

---

## 七、事件

### S-37 本契约不发事件

**本契约没有通知事件，也没有控制事件。**

- 中断、再发、放手全是直接调用的同步前置；**没有任何一次放行靠一个监听者的返回值**。
- 模型切换的记录、锚点、响应体都在会话日志里，读日志的人看得到，**不另发一份**。
- 本能力**可以消费**会话日志的追加通知来提前推进投影的中间结果——那是性能，**正确性靠读时追到日志尾**（[S-13](#s-13-模态投影读到的必须追到日志尾)）。

---

## 八、性质与前提

**编号只在本节作行标，不是可外部引用的条款号。**

### 不变量

| 性质 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|
| **每一次发出至多一条响应体** | [S-17](#s-17-结算一处按序幂等先到者赢)：按 `ResponseId` 判重、先到者赢 | 追加口按 `ResponseId` 幂等（装配给） | `data.model-response/v1#S-4` |
| **只有出了门的发出才有响应体** | [S-8](#s-8-调用在会话日志里留下的六种记录)：`ResponseId` 在「已出门」时定下 | —— | `data.model-response/v1#S-16` |
| **每一次出网的发出都有「已出门」** | [S-15](#s-15-两个锚点先写后行) | 追加口确认即落盘 | 规格层推导（对账表那两行判得出的前提）；[PF-012 先对账](../../../../product/PF-012-agent-loop-and-run/design.md#先对账再进方程) |
| **每一次被看见的内容都有「已开口」** | [S-15](#s-15-两个锚点先写后行) | 同上；跨进程时转发链不越过锚点 | 同上 |
| **续接与对账用的绑定就是那次调用打开时的绑定** | [S-7](#s-7-一次调用绑定了什么)、[S-33](#s-33-reconcile) ④：从「已出门」记录读 | 「已出门」带着绑定（`data.messages/v1#S-49`） | [PF-013 §6.7](../../../../product/PF-013-model-profiles-and-invocation/design.md#67-生效点收到那条事实之后下一次模型请求之前)：切换与档案改动不作用于在途调用 |
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
| **一条响应体对应上游多次请求** | [S-29](#s-29-dispatch) 末条；[S-38](#s-38-装配给的保证-vs-协议须给的保证) 传输适配义务 | 传输适配关掉了所用传输库的隐藏重试与回退（依赖研究假设，[G-10](#十二已知缺口)） | `data.model-response/v1#S-24` |
| **已有发出的调用被记成「一次也没发出」** | [S-29](#s-29-dispatch) ⑧：续接或再发时取不到凭据写 `released{cause}` | —— | `data.messages/v1#S-50`：`undispatched` 只指一次也没发出 |
| **指认一次调用时串到别的会话** | [S-5](#s-5-一次调用一次发出)：指认调用的操作都收 `session`，先判归属 | `callId` 会话内唯一（`data.call-accounts/v1#S-37`） | [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) |
| **一次发出的迟到片段拼进同一调用下一次发出的回复**；**被拒的增量不说、或说两次** | [S-51](#s-51-模型侧到达装配前提的承诺) 第 1、4 条 | —— | `capability.stream-assembly/v1#S-28` 第 1、4 条 |
| **追补的响应体拿合并之后的参数冒充实际发出的** | [S-33](#s-33-reconcile) ④：参数三项从「已出门」读 | 传输适配在出网之前定下改值与丢项（[S-38](#s-38-装配给的保证-vs-协议须给的保证) 传输适配第 10 条） | `data.model-response/v1#S-11` |

### 进展性质（全部有界）

| 性质 | 上界 | 前提 | 来源 |
|---|---|---|---|
| **每一次出了门的发出终将有一条响应体** | 收场（交回的那一次：调用方收口）、宿主停止时的撤除、停机之后的对账，先到的那一个 | 首 token 等待上限与停滞上限有值（[S-21](#s-21-两个时限是运行时设置项)）；交回之后调用方在结束这一步之前收口（[G-11](#十二已知缺口)）；停机之后终有下一次尝试或会话的重新承载（[S-33](#s-33-reconcile) ②） | [PF-012 先对账](../../../../product/PF-012-agent-loop-and-run/design.md#先对账再进方程)（失联的发出被追补） |
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
| **在册状态变化之后按新状态准入**（撤回、恢复在册） | 打开调用时现读中心目录的同一存储 | 中心 → 据点目录读的**新鲜度上界**（[G-12](#十二已知缺口)），并按写入先后单调读 | 撤回之后一段时间内仍被选中、仍被发出；或恢复之后时而发得出、时而「已下架」 |
| **凭据值只在发出时出现；来源如实** | 进程内交给传输适配；来源取自绑定的有效模型 | 秘密怎样送到据点、是否在据点落地、轮换怎样传播（[G-12](#十二已知缺口)）；取值请求带的来源随那次调用的有效模型引用一起到达、不由调用方另填（与 `capability.model-profile-directory/v1#S-22` 同一行） | 值留在不该留的地方、或轮换之后仍用旧值；或借一个假的「官方」来源让自建档案用上部署那一把 |
| **一次调用内各次发出用同一份档案快照** | 打开调用时绑定；每一次「已出门」带着它 | 续接跨进程时，绑定从日志里那条「已出门」恢复，不来自任何一方的内存 | 按旧能力准备、按新属性发出 |
| **投影 = 从日志重算** | 中间结果与日志同处，读时追补 | 中间结果必须读得到它所追的那份日志的尾 | 投影与日志对不上，合法目标算错 |
| **同一次调用只有一个写入者、发号唯一** | 一个进程、一个在途表 | 续接者须先确认原写入者已不在（尝试栅栏） | 同号两条、两副协程各发一次 |
| **调用方身份已核实**（会话；`settleReply` 的调用方是收到交回的那一方） | **装配给**：入口层核身份、会话打开时核归属 | 在接收边界重新验证（`data.identity-values/v1#S-30`） | 任何够得着接口的一方都能以别人的会话发调用、花别人的钱 |
| **结算写入不被尝试栅栏拒收** | 追加口对结算类记录不设栅栏 | 同 | 被关掉的尝试花掉的钱从明细里消失 |

**传输适配须兑现的十一条**（传输的选型见 D-019，实现归提供者设计；下面只写性质；第 10、11 条是修复波 1b 按 [D-040 §六 L4、L6](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加) 补的）。它们**单机也不是自动成立的**——每一条都要适配层主动做到：

| # | 义务 | 做不到会怎样 |
|---|---|---|
| 1 | **每一次发出只指定一家，并禁止上游回退**；一次发出之内不自行重试 | 一次发出之内换了家，留痕丢失，**两笔钱只记一笔** |
| 2 | **状态码从实际的 HTTP 响应取**，原样交回 | 成因分类与重试件看不到状态码 |
| 3 | **不在中途解析工具参数**；唯一的解析点在流装配 | 同一份参数两处解析出两个结果 |
| 4 | **首 token 按 [S-16](#s-16-首-token-判据) 的判据映射**；库的「开始」事件不算 | 把没开口判成开口（关掉可以重发的窗口）或反之（重发） |
| 5 | **只用本能力交来的那一把凭据**；不回落到进程环境或任何缺省配置里的凭据 | 用错范围的凭据，账记到错的头上 |
| 6 | **不向上游送本系统的会话标识** | 内部标识外泄 |
| 7 | **不把收不下的模态静默换成占位文本**：按档案的模态声明送，或绕过那一步 | 模型「看了」一张它其实没收到的图 |
| 8 | **交回实际执行方、实际费用与费用来源** | 费用记不准；实际执行方与指定的不一致时查不出（`data.model-response` G-8） |
| 9 | **固定 base URL，拒绝重定向** | 请求连同凭据被引到别处 |
| 10 | **改值与丢项在出网之前定下**：交给本能力写进「已出门」（[S-29](#s-29-dispatch) ④），出网时照「已出门」还原得出的那一组发，出网之后不再改 | 停机之后追补的那一条响应体写不出如实的参数三项；或记下的与实际发出的对不上 |
| 11 | **不做逆转写**：请求里带的工具条目名、交回的工具调用块里的 `tool`，都是模型面名字，原样进出（[S-51](#s-51-模型侧到达装配前提的承诺) 末段） | 调用块里的名字与 `ModelRequest.tools` 对不上，放行判断逐码点比较失败；或逆转写在两处各做一次、结果不同 |

另外两条来自 `data.messages`：**我们自己那两种消息在发出前译掉、不落空不丢**（`data.messages/v1#S-35`）；**`ToolInternalMessage` 不进请求**（`data.messages/v1#S-36`）。翻译的位置在传输适配之内还是之前，归提供者设计。

---

## 十、交接、缺席与恢复

### S-39 依赖不可用、撤除与重启

- **目录、会话日志、作用域求值、投影、保管方不可用时，依赖它们的操作明确失败**（`unavailable`），不静默降级：不跳过出门前检查、不把「读不到」当「没配」「没开口」「空集」。
- **本能力拥有的全部耐久事实都在会话日志里**：六种记录（[S-8](#s-8-调用在会话日志里留下的六种记录)）。手里的在途状态只是它们的一份工作副本，**停机即失，没有一条正确性依赖它**。
- **重启之后**：没有自动行为——对账由 loop 在新尝试开始时、或会话重新承载时调用（[S-33](#s-33-reconcile) ②）；在那之前，任何一次调用都不会被发出。
- **在途的那一次发出是外部效应，不可回滚**：它可能已经计费。撤除与停机都**不假装它没发生**——它的账被追补为全未知，而不是被抹掉（[S-17](#s-17-结算一处按序幂等先到者赢)）。

---

## 十一、规范表达与验证义务

### S-40 本版选用哪些形式工件

| 性质 | 表达 | 为什么 |
|---|---|---|
| 一次调用 × 多次发出 × 停机 × 中断 × 宿主撤除的交错：锚点次序、守卫、结算幂等、对账 | **TLA+** [`formal/Invocation.tla`](formal/Invocation.tla) ＋ [`Invocation.cfg`](formal/Invocation.cfg)，映射与前提见 [formal 入口](formal/README.md) | 这是跨提交、跨尝试、有停机的状态机：**锚点写在前还是后、意图先落还是中止先发、结算判不判重**，只有在交错里才分得出对错。**有六条性质各有一份把对应开关拧反的配置、预期出反例**——只有这六条可以说「断言能失败」；其余不变量要么被建模方式吸收（按构造成立，不作证据，证据在场景），要么只在正向配置里检查过、未证明能失败，逐条分类在 formal 入口 |
| 合法目标、展示列表（每个名字一条、主标取胜出行来源、被盖住的行作标注、按胜出行的来源取凭据）、有效模型四步（含把路由名解析为一行） | **规范场景**（[S-43](#s-43-切换先落事实后生效)～[S-45](#s-45-模态不兼容挡在算合法目标那一刻)、[S-48](#s-48-同路由名按层覆盖一个名字一条落到胜出行)）＋ [examples](examples.md) | 纯计算，没有交错 |
| 成因按来源分类、脱敏 | **规范场景**（[S-46](#s-46-成因按来源分类与脱敏)） | 分类表逐行演练；脱敏只能对真实输出核对 |
| 投影追到日志尾 | **性质测试**：任意日志前缀上，追补之后的读 = 对全日志重算；**伸缩测量**：读的代价与历史长度无关 | 「等于重算」是一条可随机化的等式 |
| 形状 | **不建 Schema**：值形状归 data 契约；本契约写的几种记录（[S-8](#s-8-调用在会话日志里留下的六种记录)）形状归 `data.messages/v1#S-49`、`#S-50`；线上形状归组合契约 | [规格入口](../../../README.md#准入门槛与停止条件) |
| 模型侧到达装配前提的承诺（[S-51](#s-51-模型侧到达装配前提的承诺)）、传输适配第 10、11 条 | **规范场景**（[S-52](#s-52-模型侧的装配宿主被拒的增量报一次收场之后的事件不进)、[S-42](#s-42-开口之后断流不重发) 参数一支） | 到达装配的交错已在 `capability.stream-assembly` 的模型里；这里要核的是本能力按次序交事件、记账、推给观察者，是对真实宿主的集成断言 |

**模型吸收了什么，不写成「已由模型覆盖」**：模型里「写下一条响应体」是一个原子动作、追加口不会部分成功、上游只以四种方式收场（完成、策略类故障、事实类故障、开口后故障）——
**追加口的原子性与幂等、成因分类表的内容、脱敏、凭据取值**都不在模型里，它们的证据在场景与测试。模型也**不含拓展件与 loop**：`dispatchAgain` 的调用被建成一个非确定的选择，守卫是唯一的约束。
**同样被吸收、不写成已由模型覆盖的**：交回之后由调用方收口（模型里「完成」一步就写下响应体，`reply_pending` 与 [S-49](#s-49-settlereply) 不在模型里）；绑定落在「已出门」上（模型不含档案、参数与凭据）；再发时取不到凭据写 `released{cause}`（模型里就是一次 `Release`，成因不在模型里）；`session` 参数与调用的归属（模型只有一次调用）；会话重新承载时的对账（模型里「对账」一步不区分它由新尝试还是重新承载触发）。

### 规范场景

#### S-41 两家发出：第一家 429 未开口，第二家完成

档案快照：允许的供应商 `[A, B]`、允许回退。第一次发出给 A，A 回 429、没开口。默认件给 `retry { provider: B }`。

**必须观察到**：第 1 次发出一条响应体 `failed{upstream_unavailable}`、状态码 429、没有首 token、`provider = A`；调用在 `awaiting_decision`；`dispatchAgain(plan: B)` 成功；
第 2 次发出 `provider = B`，以 `complete` 收场，带回复，由调用方与消息同一提交写下；**两条响应体、两份账**。
**绝不能观察到**：只有一条响应体（传输在一次发出之内换了家）；第 2 次发出的序号不是 2。
**凭据一支**：第 1 次发出之后、`dispatchAgain` 之前，租户解除了自己那一把（档案是自建的）⇒ `dispatchAgain` 不出门，调用终结 **`released{cause: credential_unavailable}`**、调用 `handed_up`；**绝不能观察到** `undispatched`——这次调用已经发出过一次。
**否决一支**：第 2 次发出带回复交回之后，「消息落盘之前」那一关否决了它 ⇒ 调用方调 `settleReply(vetoed)`，本能力写下那条响应体（`replyDisposition = { vetoed }`、收场仍是 `complete`、不带 `failure`）；调用终结于 `complete`，**不再发出**；日志里没有那条回复消息。

#### S-42 开口之后断流，不重发

一次发出开口之后连接断了。

**必须观察到**：「已开口」在第一片内容交给观察者之前写下；响应体 `failed{interrupted_mid_reply}`、有首 token、已交付的块在 `delivered`、没有回复；
随后任何 `dispatchAgain` 得 `retryRefused{already_spoke}`，**哪怕 `plan` 是一家从没试过的**。
**停机一支**：在「已开口」写下之后、响应体写下之前杀掉进程；新尝试的对账追补 `interrupted{runtime_lost}`、有首 token，调用终结，**不再发出**；`dispatch` 得 `alreadyEnded`——调用已在终态，按 [S-29](#s-29-dispatch) ⑥ 的次序先于 `retryRefused{already_spoke}` 判。
**另一支（首 token 之前停机）**：在「已出门」之后、首 token 之前杀掉进程；对账追补 `interrupted{runtime_lost}`、没有首 token、账全未知；调用 `resumable`；续接之后第 2 次发出给**同一家**、序号 2、所在尝试是新的那一次。
**两个停机支都要核路由留痕**：停机与对账之间把那条档案改掉（换供应商次序、改参数）——追补的响应体上 `route.profile`、`route.profileSnapshot`、`route.selectedBy`、`route.credentialScope` **与「已出门」记录上的一致**，不是改过之后的档案；续接的第 2 次发出同样用原绑定（参数取「已出门」上合并之后的那一组）。**参数一支**：让传输适配在第 1 次发出时把一项的值改掉、丢掉另一项——追补体上的 `parameterAdjustments`、`droppedParameters` 与「已出门」上的逐字相同，`route.parameters` 等于出门那一刻实际发出的那一组（[S-33](#s-33-reconcile) ④）；**绝不能观察到**追补体拿合并之后的那一组当 `route.parameters`、又不带那两项。

#### S-43 切换先落事实后生效

会话选中模型 M1；一次调用 C1 正在 M1 上发出。用户切到 M2（合法目标）。

**必须观察到**：模型切换的记录（`model_selection_changed`）先写下，然后 `selectModel` 返回；C1 照样在 M1 上收场（它的档案快照与有效模型已绑定）；**下一次** `effectiveModel` 给出 M2。
**另一支**：那条记录写不进 ⇒ `unavailable`，选中模型仍是 M1。
**交接一支**：loop 以 `basis = effectiveModel(…)`（给出 M1）填好 `target = M1`、拓展件据此改写了参数，**随后**用户切到 M2，再 `openCall(target: M1, basis)` ⇒ 这次调用用 M1 打开（不重算选中模型）；再下一次 `effectiveModel` 给出 M2。

#### S-44 已下架的档案

会话选中模型 M1（链上没有别的同名行）；管理员撤回 M1。

**必须观察到**：`displayList` 上 M1 仍在、注记 `withdrawn`；`legalTargets` 不含 M1；下一次 `openCall` 以 `undispatched{withdrawn}` 结束、没有响应体；**选中模型仍是 M1**——不替用户改选。
`selectModel(M1)` 得 `notLegalTarget{because: [withdrawn]}`——M1 虽是当前选中，**先判合法、再判重复**（[S-27](#s-27-selectmodel) ⑦）。
**恢复一支**：随后 M1 恢复在册，用户什么都没做——`legalTargets` 又含 M1、`displayList` 上 M1 注记 `legal`；**下一次 `openCall` 照常打开**、有效模型仍是 M1（[S-9](#s-9-选中模型)）；日志里没有任何一条模型切换的记录。

#### S-45 模态不兼容挡在算合法目标那一刻

会话里进来一张图，没有 transcript。M1 只收文本；M2 收文本与图。

**必须观察到**：`legalTargets` 不含 M1、含 M2；投影读到的含 `image`，与对整份日志重算的一致；
M1 若是选中模型，`displayList` 上它带 `modality_mismatch`。
**传输一支**：本据点传输能承载的模态不含 `image` ⇒ **M2 仍在合法目标里**（合法目标只有三项，[S-11](#s-11-合法目标集合)），切到它不被拒；但 `openCall` 以 `undispatched{modality_mismatch}` 上交——可发出的另一条前置不成立，成因有处可归。
**对照一支**：另一个会话里同样一张图、**落盘之前**被转换件配上了 transcript ⇒ 投影不含 `image`，M1 是合法目标（[§5.11](../../../../product/PF-013-model-profiles-and-invocation/design.md#511-有-transcript-的块不再把任何模型挡在外面)）。**事后补不上**：已落盘的那张图不会再得到 transcript，第一个会话里 M1 一直被挡（`capability.modality-projection/v1#S-6`）。

#### S-46 成因按来源分类与脱敏

用一段已知的凭据原文 V，对下列各源各造一次失败：本地适配层抛错；连不上；上游 401；上游 400；上游 503；上游在首 token 之后回 500；上游返回一个表里没有的状态码。

**必须观察到**：依次是 `unrecognized`（带本地错误留痕）、`upstream_unavailable`、`credential_unavailable`、`request_rejected`、`upstream_unavailable`、`interrupted_mid_reply`（状态码 500 原样）、`unrecognized`（状态码原样）——**状态码到成因的具体映射按 `status_cause_table` 取值，本场景只核分类来源与优先级**；
全部响应体、原始响应留存与本地错误留痕里**找不到 V**，也找不到 V 的任何不短于 `credential_fragment_min_length` 的片段。

#### S-47 用户叫停之后停机，不再发出

一次发出在途、没开口；用户 `interrupt(user)`；中断意图写下之后、中止生效之前杀掉进程。

**必须观察到**：对账按意图行追补 `interrupted`（`initiator = user`）、没有首 token；调用终结；**不是 `resumable`，不再发出**。
**绝不能观察到**：追补成 `runtime_lost` 然后续接——那是把用户叫停的东西又跑了起来。

#### S-48 同路由名按层覆盖：一个名字一条，落到胜出行

（依据：产品负责人裁定「路由名就是能力，从下往上在运行时覆盖」，[PF-013 决定](../../../../product/PF-013-model-profiles-and-invocation/decisions.md#2026-09-24--同路由名的档案并存按层从下往上覆盖)；PF-013 rev 12「设置记路由名」。）会话属于租户 T，T 没配自己那一把；部署给出厂格配了一把。有一条官方档案与 T 所在组织的组织层建的一条自建档案，**路由名同为 r**；会话选中的是 r。

**必须观察到**：
- `displayList` 里 r **只有一条**：主标是组织层那一行（胜出行），注记 `{ legal, credential_missing }`（按胜出行的来源问）；官方那一行列在它之下，带 `overridden_by{organization(O)}`，**选不了**（[S-12](#s-12-展示列表)）。`legalTargets` 里 r 一个元素。
- `effectiveModel` 给出 `routeName = r`、`profile` = 组织层那一行、`selected = r`、`selectedBy = session`；`openCall` 以 `undispatched{credential_unavailable}` 结束——**不落到官方那一行去用出厂格那一把**：缺凭据不滤（[S-10](#s-10-有效模型四步每步来源可查) 第 2′ 步；主线裁定，见 D-040 §二 S-U24-5a），这是裁决写明的代价。
- **T 配上自己那一把之后**：r 不再带 `credential_missing`；发出时 `route.profile` 是组织层那一行、`route.credentialScope` 是 T 的租户层。
- **T 在自己那层再建一条 r**：下一次 `route.profile` 是 T 租户层那一行；列表上 r 的主标换成它，组织层与官方两行列在下面、都带 `overridden_by{tenant(T)}`。
- **另跑一支（组织锁）**：组织把「用哪个模型」锁成 r——`selectedBy = layer_lock`，`profile` 仍是胜出行（锁的是名字；主线裁定，见 D-040 §二 S-U24-5b）。
- **T 把自己那层那一行撤回**：已撤回的不参与，下一次 r 落回组织层那一行；它在列表上列在 r 之下，带 `withdrawn` 与 `overridden_by{organization(O)}`。

**绝不能观察到**：r 在列表上作为两个可选项出现；被盖住的官方那一行经出厂格那一把发出；任何一条自建档案的发出用上出厂格那一把；解析改写了选中模型或写了模型切换的记录。

#### S-52 模型侧的装配宿主：被拒的增量报一次，收场之后的事件不进

（[S-51](#s-51-模型侧到达装配前提的承诺)；与 `capability.tool-execution-runtime` v1 在工具侧的那一条同形。）五支同跑；「日志里有这条事件」指本能力的结构化日志里恰有一条带齐 S-51 第 4 条四样的事件，会话日志里**没有**它（[D-040 §七 M16](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）。

- **一次发出**：传输适配交来一个文本块的开块与两段填，第二段先被截短（交来一个 `frame_too_long` 的 `trim`，紧接着截短后的那一段），那一段随即被 `accept` 拒掉；随后一个工具调用块开块、封口（`tool` 是一个模型面名字），正常收尾。一个观察者在第一段之后刷新页面。
  **必须观察到**：被拒的那一段之后、下一个事件之前，本能力恰交了一个 `rejected` 的 `trim`，那条响应体的 `trims` 里它**只按拒收计一次**（`capability.stream-assembly/v1#S-14`）；第一段内容交给观察者之前「已开口」已写下；刷新之后观察者拿到的快照带位置，此后收到的事件与快照数的是同一串，**被拒的那一段没有推给它**；**日志里有这条事件**：会话、`callId`、目标 `{ model_call, callId, dispatch: 1 }`、被拒的值是 `accept` 交回的那个失败值；回复里那个调用块的 `tool` 与 `ModelRequest.tools` 里的那一项逐码点相同（没有逆转写）；账恰记一次。**再跑一次、一段都不砍**：那条响应体**没有** `trims` 成员（不是全零的一份，`capability.stream-assembly/v1#S-13`）。
- **两次发出**：第 1 次发出在首 token 之前以策略类故障收场（`upstream_unavailable`），`dispatchAgain` 发出第 2 次；第 1 次发出迟到的一个开块这时才到。
  **必须观察到**：那个迟到的开块**没有**进第 2 次发出的状态、也没有进它的回复；**日志里有这条事件**：目标 `{ model_call, callId, dispatch: 1 }`、被拒的值 `event_after_finish`；两次发出各一份状态、各一条响应体、各一份账。
- **两个会话同一个 `callId`**：会话 `s1`、`s2` 里各有一次 `callId` 相同的调用同时在途，两边的传输适配各交来一段文本。
  **必须观察到**：两段各进自己会话那一份状态；`s1` 的观察者只收到 `s1` 那一段，`s2` 的只收到 `s2` 的（[S-51](#s-51-模型侧到达装配前提的承诺) 第 1、9 条）。
- **「已开口」写不进**：一次发出，`accept` 交出的状态第一次带 `firstContentAt` 时，让「已开口」的追加失败。
  **必须观察到**：那个内容**没有**推给任何观察者，此前交出的快照也不含它；本能力对那份状态交了 `finish { reason: lost, error: { cause: unrecognized } }`；那条响应体收场是首 token 之前的故障、成因 `unrecognized`、带本地错误留痕，**不带 `firstTokenAt`、没有 `delivered`**；调用进 `awaiting_decision`；没有 `AssistantMessage`（[S-15](#s-15-两个锚点先写后行)、[S-16](#s-16-首-token-判据)；[D-040 §七 M15](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）。
- **宿主停止时在途**：一次发出已开口、交付过一段；宿主（agent runtime）停止，没有先调 `interrupt`。
  **必须观察到**：本能力对那份状态调了 `abandon`、不带缘由，**没有**交 `finish { reason: interrupted }`；那条响应体收场 `interrupted`、`initiator = run_cancelled`、不带成因、没有 `reply`，`delivered` 是交付过的那一段；没有 `AssistantMessage`。换成本能力自身被撤除，观察到的相同（[S-36](#s-36-宿主停止与撤除)；[D-040 §七 M12](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）。

**绝不能观察到**：同一个增量在 `trims` 里既算截短又算拒收；一份状态接了另一次发出的事件，或另一个会话的事件；第 2 次发出的回复里出现第 1 次的片段；一条被拒的事件只在会话日志里、或哪里都没有；「已开口」没写下而内容已被看见；宿主停止时在途的回复落成一条 `interrupted_by_user` 的消息。

---

## 十二、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决，实现不得据一个看起来合理的猜测推进。

| # | 缺口 | owner | 闭合条件 |
|---|---|---|---|
| G-1 | **已闭合**：`data.model-response` 已有 `interrupted.initiator` 三值与那几行、`attemptId` 在每一次发出上、`route.profileSnapshot` 与 `route.credentialScope`、`late`；本契约各处引用那里的条款号 | — | — |
| G-2 | **已闭合**：五种记录的形状归 `data.messages/v1#S-49`、`#S-50`（D-040 §S16 S16-d） | — | — |
| G-3 | **已闭合**：`ModelCallRequest` 定形（D-040 §S16 S16-c）；第一轮评审处置改为 `target` 恒在、加 `basis`、`tools` 是模型面名字（[S-28](#s-28-opencall) ①） | — | — |
| G-4 | **已闭合（主线裁定，见 [D-040 §五 K42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)）**：「用哪个模型」那项设置的允许集合**取值域是路由名**，与「设置记路由名」一致；它作为显式参数进 `capability.model-profile-directory/v1#S-17` 末段的规则（[S-11](#s-11-合法目标集合)）。**本行只闭合取值域**；这一项从哪来、是设置还是权限、锁与 `A` 的关系另立 [G-19](#十二已知缺口)（[D-040 §七 M17](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)） | — | — |
| G-5 | **`status_cause_table` 的内容**：OpenRouter 各状态码（含 402 余额不足、403 内容审核）归哪个成因 | 提供者设计（据 OpenRouter 文档取证）；有产品含义的几条报主线 | 表定下并随传输钉版本一起取证 |
| G-6 | **脱敏三个具名参数的取值**：`credential_fragment_min_length`、`credential_header_names`、`credential_patterns` | 提供者设计 ＋ 安全评审 | 取值定下，并以哨兵串场景（S-46）验证 |
| G-7 | **已闭合**：首 token 之后停机 = `interrupted{runtime_lost}`（D-040 §S16 S16-g） | — | — |
| G-8 | **默认重试件的退避值**：`default_retry_backoff` 是这件重试件的配置（PF-013 §6.17），取多少、默认值由谁给未定（同家要不要再试已裁：不允许回退时同家至多一次，D-040 §S16 S16-g） | 产品负责人（PF-013 §5.12、§6.17）；那一类资产（拓展件）的正文契约 | 默认件的配置项立起来、默认值定下 |
| G-9 | **两个时限设置项的声明与默认值**：项名 `first_token_wait_limit`、`post_first_token_stall_limit` 是规格层给的名字，它们在哪类资产的推出规则里声明、默认值由谁给未定 | PF-002 owner；那一类资产的正文契约 | 设置项在 PF-002 清单里立起来、所在正文契约的推出规则产出它们 |
| G-10 | **传输适配十一条中依赖研究假设的几条**（1、2、4、5、7）：所选传输库（D-019）的缺省行为只有研究里的假设，未升 basis | 提供者设计 | basis 条目带 probe 立起来 |
| G-11 | **本契约对 loop 与会话生命周期的三项义务尚无对方条款**：① **用户取消运行时**，宿主先 `interrupt(run_cancelled)`、让调用方收口，再停（没做到时本能力写的那一条没有回复；系统发起的停止本来就不产出回复，[S-36](#s-36-宿主停止与撤除)）；② 交回的回复在调用方结束这一步之前收口——落盘成消息或调 [S-49](#s-49-settlereply)（[S-17](#s-17-结算一处按序幂等先到者赢)）；③ 会话重新承载之后、会话级的调用打开之前调 [S-33](#s-33-reconcile)（不属于任何 Run 的调用由它收口） | loop 那一程与会话生命周期（主线） | loop 契约与会话生命周期契约写明这三项 |
| G-12 | **中心 ↔ 据点的线上形状与协议义务**：[S-38](#s-38-装配给的保证-vs-协议须给的保证) 右两列里跨中心与据点的几行 | 架构（组合契约起草） | 那份组合契约成立并逐行兑现 |
| G-13 | **已闭合（修复波 1b）**：`settleReply`（[S-49](#s-49-settlereply)）、`openCall` 的 `basis`（[S-28](#s-28-opencall) ①）、`reply_pending`、会话重新承载时的对账时机、`canDispatchAgain` 收 `plan`，主线接受，见 [D-040 §六 N-9](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加) | — | — |
| G-14 | **已闭合**：`capability.stream-assembly`、`capability.modality-projection`、`capability.asset-evaluation` 登进 catalog，S-4 表补齐；`capability.loop-extension-runner` 只是指路、不登（它消费本契约，反向登记会成环）。`data.arrival-events` 起初也只指路，2026-09-25 修复波 2 起据以写出 S-16、S-51 的承诺，登依赖（第二轮评审 R2-MRR-2） | — | — |
| G-15 | **已闭合（主线裁定，见 D-040 §二 S-U24-5a～b）**：同标识覆盖挑胜者时**先滤掉已撤回的行、再滤掉这个范围不允许的行，然后取最具体一格**（类推 PF-002 §5.6 三小步「禁用滤 → 谁可以使用它滤 → 取最具体」）；模态不兼容与缺凭据不滤、胜者站住，出门前才挡。落为 [S-10](#s-10-有效模型四步每步来源可查) 第 2′ 步与代价一段、[S-11](#s-11-合法目标集合) 的胜出行、[S-9](#s-9-选中模型) 名字不变落点会变一条（PF-013 rev 12 起设置记路由名，「覆盖」改称「把路由名解析为一行」）；`capability.model-profile-directory` v1 S-17 末段同改 | — | — |
| G-16 | **已闭合（主线裁定，见 D-040 §二 S-U24-5c）**：被盖住的同名行照列、每行带自己的来源，并带注记 `overridden_by{scope}`（被那一格的同名档案覆盖）；PF-013 rev 12 起列表每个名字一条，被盖住的行列在那一条之下；怎样呈现归 PF-016。落为 [S-12](#s-12-展示列表) | — | — |
| G-17 | **从 `resumable` 放手时上交带什么**：最近一次发出是失联补写的 `interrupted{runtime_lost}`，不是故障、没有成因；本契约只写 `released`、不带 `cause`（[S-32](#s-32-releasecall) ④）。上交条目在这种情形下带什么成因（或不带），产品正文与上交条目的形状都没有说 | loop 那一程（上交条目的形状归 PF-011）；产品语义有疑问报 PF-013 owner | 上交条目的规则写明这种情形；若要一个成因，`data.messages/v1#S-50` 与本契约随之改 |
| G-18 | **已闭合（修复波 1b，主线裁定，见 [D-040 §六 L4](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)）**：「已出门」（`data.messages/v1#S-49`）另带传输适配在出网之前定下的 `parameterAdjustments` 与 `droppedParameters`，`data.model-response` 不放宽；追补体的参数三项从它读（[S-7](#s-7-一次调用绑定了什么)、[S-29](#s-29-dispatch) ④、[S-33](#s-33-reconcile) ④、[S-38](#s-38-装配给的保证-vs-协议须给的保证) 传输适配第 10 条） | — | — |
| G-19 | **「用哪个模型」这项的来源**：[S-11](#s-11-合法目标集合) 的允许集合 `A` 要从求值结果里「用哪个模型」那一项在会话格上取，但**没有任何一份正文契约的推出规则产出这一项**——它挂在哪类资产上、是设置（`capability.asset-evaluation/v1#S-22`）还是权限（`#S-23`）、[S-10](#s-10-有效模型四步每步来源可查) 第 2 步的锁与 `A` 是什么关系，都没有写。**闭合之前**：求值结果里没有这一项，`A` 读不到，`legalTargets`、`displayList`、`effectiveModel`、`openCall` 按 S-11 第一条一律 `unavailable`——**不当空集、不当全集、不以链上全部路由名代替**（[D-040 §七 M17](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)；同一事项已列入主线待产品负责人裁的清单） | PF-002／PF-004 owner ＋ `capability.asset-evaluation` | 某份正文契约的推出规则产出这一项，并写明它的类别（设置或权限）以及锁与 `A` 的关系；本契约 S-9、S-10、S-11 改指那一条 |

---

## 十三、消费者核对

本节不新增承诺，只走一遍具名消费者的路径。**发现不够用时回到本契约补条款，不在消费者那边自己算一份。**

| 消费者 | 它要什么 | 本契约给什么 | 够不够 |
|---|---|---|---|
| **agent loop：「等模型」** | 打开、发出、等收场、拿回复、失败交拓展件、再发或放手、交回的回复怎样收口 | [S-28](#s-28-opencall)～[S-32](#s-32-releasecall)、[S-49](#s-49-settlereply) | **够**；loop 那一侧的三项义务在 [G-11](#十二已知缺口) |
| **agent loop 与会话生命周期：先对账** | 每次没收场的调用该怎么接，含不属于任何 Run 的 | [S-33](#s-33-reconcile) | **够** |
| **「调模型之前」的 `select_model`** | 合法目标集合 | [S-24](#s-24-legaltargets) | **够**；它改的目标在 [S-28](#s-28-opencall) 出门前检查里再核一遍 |
| **拓展件执行器：判一条 `retry` 结论合不合法** | 在结论落日志之前、不发出就判出守卫的答案 | [S-50](#s-50-candispatchagain) | **够**；与 [S-30](#s-30-dispatchagain) 同一张表 |
| **「调模型之后」失败那一维的重试件** | 状态码、成因、档案两项声明、已试过哪些 | [S-29](#s-29-dispatch) ⑤ 的失败返回（`data.loop-extension/v1#S-14` 的主体）＋ [S-34](#s-34-readattempts) | **够** |
| **交付面：切换命令、模型列表** | 展示列表（每条带来源、标出选中那一条）、切换 | [S-25](#s-25-displaylist)、[S-27](#s-27-selectmodel) | **够** |
| **交付面：停止按钮** | 中断这一次 | [S-31](#s-31-interrupt) | **够** |
| **成本明细与排查** | 每次发出一条响应体、真实费用、原始响应；账归谁 | [S-17](#s-17-结算一处按序幂等先到者赢)、[S-19](#s-19-凭据每次发出现取取值只交给传输适配)、[S-20](#s-20-写入之前脱敏) | **够**；归属由条目壳给（`data.call-accounts/v1#S-25`） |
| **应用装配（据点）** | 传输能承载的模态、传输适配 | [S-11](#s-11-合法目标集合)、[S-38](#s-38-装配给的保证-vs-协议须给的保证) | **够**，前提 G-10 |
| **到达装配**（`capability.stream-assembly`）：模型侧的宿主 | 它 S-28 的第 1、2、4、6、7、8、9 条由宿主兑现 | [S-51](#s-51-模型侧到达装配前提的承诺) 逐条 | **够**（那份契约的 G-2 随之闭合） |

---

## 十四、版本差异与规范工件

**本版是首版**，没有被采用的旧版本，因此没有语义或表示差异可记，也没有消费者迁移；`registry/lineage.json` 不因本契约增加条目。

**来历**：起草之初档案登记、撤回、凭据绑定与调用放在一份契约里，操作是 `invoke`（内部循环重试）；主线后来把它拆成中心侧 `capability.model-profile-directory` v1 与据点侧本契约（[D-040 §块 C 拆分提案](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#块-c-拆分提案报回的推荐-aaa目录独立插件中心运行时选择与调用同在据点模态转换独立登记表据点)），
并把调用拆成 `openCall`／`dispatch`／`dispatchAgain`／`interrupt`／`reconcile`（重试不在调用内部循环，经拓展件与发出守卫）。拆分前的草稿从未成稿，不构成前身。
**第一轮独立评审处置**（2026-09-24，未冻结，原地改）：指认调用的操作加 `session`；绑定落在「已出门」；加 `reply_pending` 状态与 [`settleReply`](#s-49-settlereply)、只读守卫 [`canDispatchAgain`](#s-50-candispatchagain)；再发时取不到凭据写 `released{cause}`；合法目标回到三项、传输承载是可发出的另一条前置；`openCall` 的 `target` 恒在、加 `basis`。**修复波 1b**（同样原地改）：「已出门」带传输适配的改值与丢项、追补体参数三项从它读；新增 [S-51](#s-51-模型侧到达装配前提的承诺) 与场景 [S-52](#s-52-模型侧的装配宿主被拒的增量报一次收场之后的事件不进)；传输适配由九条增为十一条。影响记在[验证入口](../verification.md#变化的影响)。

**本版的规范工件**：本文件、[`examples.md`](examples.md)、[`formal/Invocation.tla`](formal/Invocation.tla) 与它的配置、[formal 入口](formal/README.md)。执行结果在[验证入口](../verification.md)，不写进本版本目录。

**发布后**：本目录下的规范正文、实例与模型不可原地覆盖；修改发布新版本。[已知缺口](#十二已知缺口)里改变语义或表示的项在冻结之后闭合，**出新版本**；冻结之前在本候选里原地改，每次改在[验证入口「变化的影响」](../verification.md#变化的影响)记一笔。
