# capability.model-request-runtime v9

> **candidate，未接受、未冻结。**从 D-101 已接受 RT8 演进，仅采用 MR8 的恢复时序表示：已确认耐久锚点的 interrupted 责任在实际发送时刻不可用时写 sentAt:null，不臆造时间、不增加恢复 HTTP、不改变首 token 与重发规则。RT8 的 token 计量、显式余量、十三操作及其他精确依赖保持。

> 规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.model-request-runtime, 9)`——
  `family = capabilities`、`topic = model-request-runtime`、规范路径 `spec/capabilities/model-request-runtime/v9/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：candidate；继承 D-101 已接受且冻结的 RT8，本版未接受、未冻结。只改变 MR8 实际发送时刻不可用的表示与结算投影；此前来源与证据保持其原范围。
- **设计依据**：RT5 的未变化承诺沿 D-090；输入限制增量依据 PF-013 rev15 用户裁定；原输入 cap 来源沿 [D-096](../../../../record/decisions/model-profile-input-limits-product-adoption/decision.md)。继承 S-74 最终固定计划门、S-75 未处分响应交接及 S-76 重试历史；本候选完整继承 S-74 的 token 计量保证，只补恢复时序投影；原 SL3 结算、头事实、凭据、取消与精确适配保证完整保留。
- **精确适用需求来源**：PF-013 rev15、PF-012 rev15、PF-009 rev8；PF-004 **rev13 §6.6**、PF-001 **rev23 §6.4**、PF-015 **rev13 §6.12 及「第一件：会话睡一觉醒来，还得是原来那个」**。后三份按本契约实际消费义务核对当前正文，核对范围见下表；未消费的工作区增量由其所属契约承接，不沿用旧 rev 作为本版依据，也不改写 RT5 冻结来源。
- **精确语义依赖**（消费 clauses 见 [S-4](#s-4-依赖方向与被消费的面)，catalog 按它登记；接受状态以 [registry](../../../../registry/README.md) 为准）：
  - `omne-harness-lite-design-2026-09-15 · capability.model-profile-directory · v5`（accepted，D-100）
  - `omne-harness-lite-design-2026-09-15 · data.model-profile · v6`（accepted，D-101）
  - `omne-harness-lite-design-2026-09-15 · data.model-response · v8`（candidate，G-32）
  - `omne-harness-lite-design-2026-09-15 · data.loop-extension · v6`（accepted，D-100）
  - `omne-harness-lite-design-2026-09-15 · data.call-accounts · v2`（accepted）
  - `omne-harness-lite-design-2026-09-15 · data.content-blocks · v3`（accepted）
  - `omne-harness-lite-design-2026-09-15 · data.messages · v6`（accepted，D-100）
  - `omne-harness-lite-design-2026-09-15 · data.tool-definition · v3`（accepted）
  - `omne-harness-lite-design-2026-09-15 · data.identity-values · v1`（accepted）
  - `omne-harness-lite-design-2026-09-15 · data.offer-expiry · v1`（accepted，只取时间点 `Instant`）
  - `omne-harness-lite-design-2026-09-15 · capability.stream-assembly · v3`（accepted）
  - `omne-harness-lite-design-2026-09-15 · capability.modality-projection · v2`（accepted）
  - `omne-harness-lite-design-2026-09-15 · capability.asset-evaluation · v4`（accepted）——「用哪个模型」这项设置的求值（「这个范围允许哪几条档案」本版不收窄、不由它求，[D-063 R-4](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)）
  - `omne-harness-lite-design-2026-09-15 · capability.session-tenancy · v2`（accepted）——S-8 holdingTenant；S-66 每次取得当前求值输入前以真实会话租户为锚
  - `omne-harness-lite-design-2026-09-15 · data.arrival-events · v2`（accepted）——到达事件的目标、砍、收尾与第一个内容步骤（[S-16](#s-16-首-token-判据)、[S-51](#s-51-模型侧到达装配前提的承诺) 据以写出承诺；2026-09-25 修复波 2 登记，第二轮评审 R2-MRR-2；它不依赖本契约，无环）
  - `omne-harness-lite-design-2026-09-15 · capability.session-log · v3`（accepted，窄口接口契约）——追加、往后读、条目壳、判重键与尝试栅栏（[S-8](#s-8-调用在会话日志里留下的六种记录)、[S-38](#s-38-装配给的保证-vs-协议须给的保证)；2026-09-25 修订波登记，它不以坐标依赖本契约，无环）
  - `omne-harness-lite-design-2026-09-15 · capability.asset-registry · v3`（accepted）——`openCall` 按模型面名字取工具条目（`lookup`，[S-28](#s-28-opencall) ①；2026-09-25 N7 评审之后登记，它不以坐标依赖本契约，无环）
  - 以上三份（流装配、模态投影、求值）在 2026-09-24 整批对齐登记进 catalog（原 G-14）。`capability.loop-extension-runner` v3（accepted，D-076） 只是指路（被拒的 `retry` 怎样记下、系统自带重试件不可用怎样关门归它），本契约不据以写出任何承诺，不登依赖——**runner 反过来消费本契约的合法目标与再发守卫**，登这一条会成环
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如
  `capability.model-request-runtime/v9#S-30`；缺口 `G-n` 同理。编号在本版本内只追加、不重排；本候选现有 S-1～S-76；S-74～S-76 补输入限制、未处分交接及重试历史消费，仍无新增服务操作

## 本版运行格式边界

本版运行面只消费本版及其**精确依赖链**规定的当前格式。不为被替代的旧接口、旧格式或旧实现提供兼容入口、双轨执行、降级、回填、旧格式只读、认回或结算路径；历史规格与证据保留不构成这些运行承诺。不原地改写、清空或补造用户已有数据；遇到不兼容值沿本契约既有表示拒绝或操作失败边界明确失败，不静默转成当前值，也不新增失败枚举。

**当前代际已经受理的任务与产生的历史事实仍受原保证约束**：同一调用的不可变快照、已有提交与未知结果、恢复、认回、释放和结算责任不因本次演进而消失。这里删除的是旧格式过渡路径，不能据此遗弃当前在途责任、换身份重发、改写原记录或用当前目录覆盖原快照。仍被本版精确引用的 IV、CB、日志、资产及 hooks 等契约按各自版本消费，版本号较小本身不表示兼容过渡。


## 设计依据

**当前来源的限域核对**：本表限定新候选引用当前修订的范围；不是整包产品重设计或对其他消费者的自动升级。

| 当前精确来源 | 本版消费并核对仍成立的义务 | 本次未消费的后续变化 |
|---|---|---|
| PF-004 rev13 §6.6 | 模型每次请求确定；换模型不重新装配；生成内容保留实际模型。对应 S-7/S-9/S-10/S-26/S-27 的绑定、生效与留痕 | rev13 的工作区文件变化/已受理装配变更、显式 reload 与候选校验由装配 owner 承担；RT7 不产出工作区装配或改写其生命周期 |
| PF-001 rev23 §6.4 | 显式租户身份、无所有权/成员依据拒绝跨租户、范围不可用/失权明确失败、成本按发起租户归属。对应 S-7/S-14/S-19/S-66 | rev20～23 的共享工作区、外部仓库无治理者、组织参与范围和实例来源规则不由 RT7 裁决；S-66 消费已有当前输入端口及授权结果，不从物理路径建立资格 |
| PF-015 rev13 §6.12、会话恢复段 | 创建时捕获租户身份、不随账号切换；日志只增不改、可恢复部分恢复、投影重算一致。对应 S-7/S-19/S-33；G-11 的恢复调用方义务仍开放 | rev13 的工作区附着/共享实例、多 worktree、异步感知及 AGENTS.md 上下文由会话/工作区/上下文 owner 承担；本版未定义这些源的产生规则 |

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
| 选中模型（一个路由名）与有效模型（它这一次落到的那一行） | [PF-013 §4](../../../../product/PF-013-model-profiles-and-invocation/design.md#选中模型-与-有效模型) · [PF-004 rev13 §6.6](../../../../product/PF-004-agent-definition-and-assembly/design.md#66-模型在每次请求时确定) | S-9、S-10、S-26、S-27 |
| 合法目标集合与展示列表是两件事；算不出来不替用户改选；模态挡在这一刻 | [PF-013 §5.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事) · [§5.11](../../../../product/PF-013-model-profiles-and-invocation/design.md#511-有-transcript-的块不再把任何模型挡在外面) · [§6.9](../../../../product/PF-013-model-profiles-and-invocation/design.md#69-合法目标算不出来时不替用户改选) · [§6.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#610-模态兼容挡在算合法目标那一刻不挡在出门那一刻) | S-11、S-12、S-24、S-25 |
| 重试站在已有的位置上；默认件；它改不动的三件事 | [PF-013 §5.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#512-重试站在一个已经存在的位置上) · [§6.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#612-事实判断归本-topic策略归拓展件) · [§6.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#613-试尽由拓展件判定档案的两项声明是它的输入) · [什么时候算试尽](../../../../product/PF-013-model-profiles-and-invocation/design.md#什么时候算试尽) | S-30、S-35 |
| 单独控制；停机看首 token；只有一个宿主 | [PF-013 §5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token) · [停机之后](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token) · [它只有一个宿主](../../../../product/PF-013-model-profiles-and-invocation/design.md#它只有一个宿主所以只有一种结局) | S-15、S-31、S-33、S-36 |
| 脱敏 | [PF-013 §6.16](../../../../product/PF-013-model-profiles-and-invocation/design.md#616-错误信息外泄之前要脱敏) | S-20 |
| 本 topic 不出现任何时限数值；超时是运行时设置项、退避是重试件的配置 | [PF-013 §6.17](../../../../product/PF-013-model-profiles-and-invocation/design.md#617-本-topic-不出现任何时限数值) | S-21、S-35 |
| **本版「范围允许」不收窄**：范围允许 = 这个范围里登记的全部档案，凭据可用即可用；将来要收窄作为设置走资产求值 | [D-063 R-4](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)（产品负责人，2026-09-25） | S-11 允许集合那一行、S-10、S-12 |
| **重试是可配置策略，不写死**：次数、退避种类、基数、倍率、上限、抖动；默认值只是配置初值 | [D-063 R-6](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)；落法 [D-060 §八 N-36](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) | S-35 第 4 条 |
| 模态投影要答得快、增量维护 | [PF-013 §6.18](../../../../product/PF-013-model-profiles-and-invocation/design.md#618-模态投影要答得快而且是增量维护出来的) · [flows §3.4](../../../../product/PF-013-model-profiles-and-invocation/flows.md#34-一个会话的模态投影) | S-13 |
| 「等模型」是 loop 的等待；先对账再进方程（出门了没开口就没了 → 照常再发；开口了没说完就没了 → 绝不再发、追补中断提醒） | [PF-012 等人是 loop 的原语](../../../../product/PF-012-agent-loop-and-run/design.md#等人是-loop-的原语) · [先对账，再进方程](../../../../product/PF-012-agent-loop-and-run/design.md#先对账再进方程) | S-15、S-33 |
| 每一次模型调用都适用：挂件、压缩闭包、不属于任何 Run 的旁路提问；宿主恒为 agent runtime；不属于任何 Run 的花费归会话 | [PF-013 它只有一个宿主](../../../../product/PF-013-model-profiles-and-invocation/design.md#它只有一个宿主所以只有一种结局) · [PF-012 agent runtime](../../../../product/PF-012-agent-loop-and-run/design.md#agent-runtime) | S-5、S-33 |
| 已发起的账迟到了照样落、归这个 Run、标明迟到 | [PF-012 §6.17 I-11](../../../../product/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式) | S-17 |
| 回复在落盘之前被否决不是调用失败：那次调用照常结束、记下被谁否决，不交给重试挂件 | [PF-012 否决按产生者分三路](../../../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前的否决按消息是谁产生的分三路) | S-6、S-29、S-49 |
| 取消跟着宿主走；取消先落日志再发信号 | [PF-012 §6.13](../../../../product/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走) · [§6.15](../../../../product/PF-012-agent-loop-and-run/design.md#615-取消先落日志再发信号) | S-31、S-36 |
| 成本两层；挂件自己花的钱 | [PF-012 成本两层](../../../../product/PF-012-agent-loop-and-run/design.md#成本两层缺哪一层都会算错) · [挂件自己花的钱](../../../../product/PF-012-agent-loop-and-run/design.md#挂件自己花的钱算它插手的那个-run) | S-5、S-17 |
| 流断在半路；用户看见了的日志里必须有 | [PF-009 §5.6](../../../../product/PF-009-context-message-types/design.md#56-流断在半路) · [§6.9](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有) | S-15、S-29 |
| 会话持有创建那一刻的租户身份；成本算到发起它的租户 | [PF-015 rev13 §6.12](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#612-会话持有创建那一刻的租户身份) · [PF-001 rev23 §6.4](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) | S-7、S-19 |
| 所有模型请求经 OpenRouter；单机交付可拆 | [SYS-LLM](../../../../foundation/cross-system-constraints/requirements.md#sys-llm) · [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) | S-38 |
| 接受／拒绝要有可定位、可解释的日志依据 | [SYS-OBSERVABILITY](../../../../foundation/observability-and-logging/requirements.md#sys-observability全链路可观测与日志完备) C3 | S-51 第 4 条 |
| 传输选 pi-ai 定向 fork | [D-019](../../../../record/decisions/model-provider-pi-ai-fork/decision.md) | S-38 |
| 统一语言 | [一次模型调用](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call) · [模型档案](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-profile--模型档案--model-profile) · [模型凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential) · [选中模型](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-selected-model--选中模型--selected-model) · [有效模型](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-effective-model--有效模型--effective-model) · [模态](../../../../ubiquitous_language/terms/record-and-context.md#ul-modality--模态--modality) · [模态投影](../../../../ubiquitous_language/terms/record-and-context.md#ul-modality-projection--模态投影--modality-projection) · [非常态](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-off-nominal--非常态--off-nominal) · [上交](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-escalation--上交--escalation) · [调用账目](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-call-account--调用账目--call-account) · [附件](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-attachment--附件--attachment) · [模型请求参数](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-request-parameters--模型请求参数--model-request-parameters) · [agent runtime](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-agent-runtime--agent-runtime--agent-runtime) · [会话日志](../../../../ubiquitous_language/terms/record-and-context.md#ul-session-log--会话日志--session-log) · [会话据点](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-session-base--会话据点--session-base) · [模型响应体](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-response--模型响应体--model-response) · [一次发出](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-upstream-send--一次发出--upstream-send) · [首 token](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-first-token--首-token--first-token) · [模型切换](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-switch--模型切换--model-switch) · [合法目标集合](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-legal-target-set--合法目标集合--legal-target-set) · [模型展示列表](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-model-display-list--模型展示列表--model-display-list) · [模型调用上交成因](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call-escalation-cause--模型调用上交成因--model-call-escalation-cause) | 全部正式名 |

**（无词条）**：「已出门」「已开口」「中断意图」「调用终结」四种记录（形状归 `data.messages/v6#S-49`、`#S-50`）；「出门前检查」「发出守卫」「保管方」「本据点传输能承载的模态」。它们只在本契约与所引 data 契约里有定义，报给主线。

> **不在上表的依据**——主线裁定链到 [D-060](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md)（产品负责人尚未逐条追认，依据仍是 D-060），产品行已写上的改引产品正文：
>
> | 条款 | 依据 |
> |---|---|
> | 本契约住在据点侧、与中心侧档案目录拆成两份 | 主线裁定，见 [D-060 §块 C 拆分提案（推荐 A/A/A：运行时选择与调用同在·据点）](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#块-c-拆分提案报回的推荐-aaa目录独立插件中心运行时选择与调用同在据点模态转换独立登记表据点) |
> | [S-33](#s-33-reconcile) 对账表的两行（出门没开口 → 续接；开口没说完 → 被中断、不再发） | 产品行：[PF-012 先对账，再进方程](../../../../product/PF-012-agent-loop-and-run/design.md#先对账再进方程)、[PF-013 停机之后](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token)；首 token 之后停机收成 `interrupted{runtime_lost}` 是主线裁定，见 [D-060 §S16 S16-g](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的) |
> | [S-8](#s-8-调用在会话日志里留下的六种记录)、[S-15](#s-15-两个锚点先写后行) 两个锚点及其次序 | **规格层推导**：对账表那两行要判得出，停机之后就得有「已出门」「已开口」两条耐久记录，且各自先于它要保护的那件事写下（反例在 S-15）；记录的家是主线裁定，见 [D-060 §S16 S16-d](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的) |
> | [S-5](#s-5-一次调用一次发出) 调用跨尝试延续、发出序号跨尝试连续、尝试号属于每次发出 | 主线裁定，见 [D-060 §块 C 对账 C-R7](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#块-c-对账d-reconciliation-c需主线看八项) |
> | [S-11](#s-11-合法目标集合) 本据点传输能承载的模态 | 主线裁定，见 [D-060 §块 C 对账 C-R5](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#块-c-对账d-reconciliation-c需主线看八项)；它是**可发出的另一条前置，不是合法目标集合的第四项**（主线裁定，见 [D-060 §五 K40](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)） |
> | [S-9](#s-9-选中模型) 初值来自设置求值、[S-10](#s-10-有效模型四步每步来源可查) 四步 | 产品行：[PF-013 §4 选中模型与有效模型](../../../../product/PF-013-model-profiles-and-invocation/design.md#选中模型-与-有效模型)（设置在会话那一格、上层锁死、四步求值外加「调模型之前」的改写） |
> | [S-21](#s-21-两个时限是运行时设置项) 时限是运行时设置项 | 产品行：[PF-013 §6.17](../../../../product/PF-013-model-profiles-and-invocation/design.md#617-本-topic-不出现任何时限数值) |
> | [S-17](#s-17-结算一处按序幂等先到者赢) 结算写入不受尝试栅栏拒收 | 产品行：[PF-012 §6.17 I-11](../../../../product/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式)；标记见 `data.call-accounts/v2#S-39` |
> | [S-5](#s-5-一次调用一次发出) 挂件、压缩闭包、旁路提问里的调用同样适用 | 产品行：[PF-013 它只有一个宿主](../../../../product/PF-013-model-profiles-and-invocation/design.md#它只有一个宿主所以只有一种结局) 末段 |
> | [S-28](#s-28-opencall) 出门前检查核有效模型，失败即上交 | 产品行：[PF-013 §6.9](../../../../product/PF-013-model-profiles-and-invocation/design.md#69-合法目标算不出来时不替用户改选) |
> | [S-31](#s-31-interrupt) `initiator` 三值 | 主线裁定，见 [D-060 §S16 S16-g、S16-i](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的) |
> | [S-8](#s-8-调用在会话日志里留下的六种记录) `ResponseId` 在「已出门」时铸、[S-30](#s-30-dispatchagain) 已终结只用 `alreadyEnded`、[S-32](#s-32-releasecall) 放手、[S-35](#s-35-默认重试件可替换) 默认件的次序与同家至多一次 | 主线裁定，见 [D-060 §S16 S16-a、S16-b、S16-g](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的) |
> | [S-28](#s-28-opencall) 调用请求的成员名与 `ModelRequest` 逐字相同 | 主线裁定，见 [D-060 §S16 S16-c](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的) |
> | 工具清单是模型面名字（[S-28](#s-28-opencall) ①）、`session` 进指认调用的操作（[S-5](#s-5-一次调用一次发出)）、绑定落在「已出门」（[S-7](#s-7-一次调用绑定了什么)）、再发时取不到凭据写 `released{cause}`（[S-29](#s-29-dispatch) ⑧）、只读守卫（[S-50](#s-50-candispatchagain)）、回复被否决或被系统使用的响应体由本能力写（[S-17](#s-17-结算一处按序幂等先到者赢)、[S-49](#s-49-settlereply)）、传输承载是另一条前置（[S-11](#s-11-合法目标集合)）、允许集合元素是路由名 | 主线裁定，见 [D-060 §五 K10、K19、K20、K21、K22、K36、K40、K42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) |
> | `settleReply` 这个服务面名、`openCall` 的 `basis` 成员、`reply_pending` 状态、会话重新承载时的对账时机、`canDispatchAgain` 收 `plan` | 规格层推导（理由写在各条正文），主线接受，见 [D-060 §六 N-9](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)（原 G-13 闭合） |
> | 「已出门」带传输适配定下的改值与丢项、追补体的参数三项从它读（[S-7](#s-7-一次调用绑定了什么)、[S-29](#s-29-dispatch) ④、[S-33](#s-33-reconcile) ④）；本能力逐条承诺到达装配的宿主前提、传输适配不做逆转写（[S-51](#s-51-模型侧到达装配前提的承诺)） | 主线裁定，见 [D-060 §六 L4、L6](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)（原 G-18 闭合；`capability.stream-assembly` 的 G-2 随之闭合）；不做逆转写同 [§五 K10](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) |
> | 撤除与系统发起的运行取消时在途的流一律放弃、收场仍是 `interrupted{run_cancelled}`（[S-36](#s-36-宿主停止与撤除)、[S-51](#s-51-模型侧到达装配前提的承诺) 第 6 条）；「已开口」确知未提交时交 `finish{lost, error{cause: unrecognized}}`、块不进 `delivered`（S-51 第 6、7 条）；被拒的事件记一条结构化日志事件、按（会话，目标）路由、只推给本会话的观察者（S-51 第 1、4、9 条）；`trims` 一次也没砍时缺席（S-51 第 7 条）；允许集合的来源立缺口、G-4 只留取值域（[G-19](#十二已知缺口)） | 主线裁定，见 [D-060 §七 M12、M15、M16、M17、M24](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加) |

---

## 一、含义与使用范围

### S-1 本契约拥有什么

**会话据点上，一个会话怎样选模型、每一次[模型调用](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call)怎样发出、怎样收场、停机之后怎样对账。**

本版另以 S-66 约束当前输入端口及 runtime 读取/求值的时点；端口的真实 IO 与完整输入一致性归输入提供者。

本版另拥有 S-54～S-60 的独立函数行为：函数仅执行单次发出或纯判定，服务面才拥有会话、持久化、授权与恢复保证。二者共享内容与收场值，不把服务面身份塞进函数返回。

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
| 档案的登记、撤回、读面；凭据的绑定与取用规则 | `capability.model-profile-directory` v5（中心侧，本契约消费） |
| 响应体的形状、收场与其余成员的条件关系、同一次调用的响应体序列 | `data.model-response` v7（candidate；本契约是它的写入者之一） |
| 成因的名字与定义（`FailureCause`）、`select_model`／`retry` 结论的形状与义务 | `data.loop-extension` v6 |
| 账的形状、三个归属标识的表示 | `data.call-accounts` v2 |
| 到达事件的语法、流装配、首个内容何时算「交出」的装配器侧判据 | `data.arrival-events` v2、`capability.stream-assembly` v3（并行） |
| 模态投影的判定函数、模态兼容判定、转换件 | `capability.modality-projection` v2（本契约调它的 `project` 与 `compatible`） |
| 拓展件的执行、结论落日志、报错处置 | `capability.loop-extension-runner` v3（accepted，D-076） |
| 「用哪个模型」这项设置的层级求值；「这个范围允许哪几条档案」（**本版不收窄**，[D-063 R-4](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)；将来收窄时同归它） | `capability.asset-evaluation` v4 |
| 上下文组装、请求里装了什么 | PF-010 组装 |
| 会话日志本身、追加口的栅栏与多条目原子追加 | **窄口接口契约 `capability.session-log` v3**：追加 `append`（[S-17](../../session-log/v3/contract.md#s-17-append追加一批条目)：一批一次提交、判重键与栅栏在同一个提交点上判）、从某个位置往后读 `readSince`（[S-19](../../session-log/v3/contract.md#s-19-readsince从某个位置往后读)）、条目壳（[S-6](../../session-log/v3/contract.md#s-6-条目与它的壳)）；整本会话日志与壳的其余字段：loop 与会话那一程（真承接者未到，接口已定；2026-09-25 修订波） |
| 传输实现（pi-ai 定向 fork 与适配） | 提供者设计；本契约只在 [S-38](#s-38-装配给的保证-vs-协议须给的保证) 写它须兑现的义务 |
| 线上形状（中心 ↔ 据点） | 把目录读面送过进程边界的组合契约（尚未立） |

### S-3 本契约明确不承诺什么

| 不承诺 | 由谁兑现 |
|---|---|
| **上交条目**的写入与形状 | loop（形状归 PF-011） |
| **中断提醒**的写入（`data.messages/v6#S-21`） | loop |
| **回复消息**的写入：回复落盘成了消息的那条响应体（`replyDisposition = persisted`）与它的消息由调用方在同一提交里写下 | loop ＋ 会话日志追加口（[S-17](#s-17-结算一处按序幂等先到者赢)、[S-38](#s-38-装配给的保证-vs-协议须给的保证)；多条目一次提交与以 `ResponseId` 拼出的判重键见 `capability.session-log/v3#S-17` 末条、`#S-8`） |
| **交回未写的回复在调用方自己结束之前收口**：落盘成消息，或经 [S-49](#s-49-settlereply) 交回「被否决／被系统使用」 | loop（[G-11](#十二已知缺口)）；没收口时本能力的兜底见 [S-17](#s-17-结算一处按序幂等先到者赢) |
| **组装**：这一次请求里装了什么、用了哪份派生表示 | PF-010 组装 |
| **会话日志**：追加口、尝试栅栏、全序 | `capability.session-log` v3（[S-10](../../session-log/v3/contract.md#s-10-尝试栅栏)、[S-14](../../session-log/v3/contract.md#s-14-同一会话的追加一条接一条判定与写入是同一步)、[S-17](../../session-log/v3/contract.md#s-17-append追加一批条目)）；整本日志的真承接者是 loop 与会话那一程 |
| **「一步之内至多一次模型调用」的判定**；挂件与压缩闭包里的调用算不算「这一步的那一次」 | loop |
| **自定义重试件的终止性**：它是否终将判「不再试」 | 不承诺（[S-35](#s-35-默认重试件可替换) 只对默认件承诺试尽） |
| **插队时中断哪些调用** | loop／PF-014（本契约的 `interrupt` 只作用于一个 `callId`） |
| **连续被否决的调用上限**：回复在落盘之前被否决之后，再试是 loop 另起的新调用 | loop |

### S-4 依赖方向与被消费的面

**依赖方向是单向的：本契约 → 档案目录、档案形状、响应体、拓展件、账、块、消息、工具定义、身份值、时间点、到达事件，以及流装配、模态投影、求值。**
`capability.model-profile-directory` 不消费本契约。

**下表每个 `#S-n` 前缀省去了页首同名契约的精确坐标；不能把不同依赖一律读成 v1。候选数据依赖在接受之前不成为正式实现依据。catalog 的 `clauses` 以本表为准。**

| 被消费的条款 | 用在哪 |
|---|---|
| `capability.asset-registry` `#S-25` `lookup`（`tool` 类、按名字、`within`）；`#S-11` 可用性报告所依的快照 | [S-28](#s-28-opencall) ① 名字到条目、④ 续接重取 |
| `capability.session-log`（窄口接口契约，2026-09-25 修订波登记）`#S-6` 条目壳、`#S-8` 判重键、`#S-9` 读取键不由判重键自动提供、`#S-10` 尝试栅栏（第 3 条：结算类不带）、`#S-13` 提交与持久（返回即已持久）、`#S-14` 同一会话的追加全序、`#S-17` `append`（一批一次提交）、`#S-19` `readSince`、`#S-22` 回执未知、`#S-23` 提供者撤除时在途追加；`#S-32` 显式 condition、`#S-33` 同提交判定次序与 THIS 零写、`#S-34` 完整前缀、`#S-35` 业务批认回与有限进展、`#S-36` 规范场景、`#S-37` 显式版本传播 | [S-8](#s-8-调用在会话日志里留下的六种记录) 首段、[S-15](#s-15-两个锚点先写后行)、[S-17](#s-17-结算一处按序幂等先到者赢)、[S-33](#s-33-reconcile)、[S-38](#s-38-装配给的保证-vs-协议须给的保证) 及 S-68～S-73 |
| `capability.model-profile-directory` `#S-6` 范围链 | [S-11](#s-11-合法目标集合) |
| `capability.model-profile-directory` `#S-16` readProfile（含已撤回行，三收场不折叠） | [S-10](#s-10-有效模型四步每步来源可查)、[S-12](#s-12-展示列表)、[S-28](#s-28-opencall) |
| `capability.model-profile-directory` `#S-17` listProfiles（每项带引用，同一个路由名可出现几次）；末段从路由名到一行的规则 `胜出行(T, r, A)`／`落点(T, r, A)`，允许集合 `A` 是显式参数——**本版 `A` 取自同一次列表读**（那一段，[D-063 R-4](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)） | [S-10](#s-10-有效模型四步每步来源可查)、[S-11](#s-11-合法目标集合)、[S-12](#s-12-展示列表) |
| `capability.model-profile-directory` `#S-20` resolveCredential：以发起租户与档案来源取用、两种问法 | [S-12](#s-12-展示列表)、[S-19](#s-19-凭据每次发出现取取值只交给传输适配)、[S-28](#s-28-opencall) 出门前检查第 4 行 |
| `capability.model-profile-directory` `#S-34` 适配绑定的读写、`#S-35` 发布/采用/撤旧的分步责任 | S-7、S-53、S-64：新调用用目录明确采用的绑定，不自行跟随所谓最新版 |
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
| `data.model-response` `#S-36` 完整适配绑定、`#S-37` 实际供应商、`#S-38` 请求前缀缓存事实 | S-53、S-54、S-59、S-63：绑定双处相等，实际执行方不能由请求值代填，缓存只消费唯一 usage 字段 |
| `data.model-response` `#S-23`、`#S-24` 同一次调用的响应体序列、一条响应体对应已锚定责任及至多一次上游请求 | [S-22](#s-22-同一次调用的发出序列)、[S-38](#s-38-装配给的保证-vs-协议须给的保证) |
| `data.loop-extension` `#S-1` 位置（`before_model_call`、`after_model_call`） | [S-10](#s-10-有效模型四步每步来源可查)、[S-35](#s-35-默认重试件可替换) |
| `data.loop-extension` `#S-2` 维度、`#S-4` 干预力、`#S-5` 报错策略、`#S-6` 声明、`#S-7` 能力标识、`#S-20` 档与结论的合法组合 | S-67：默认重试件身份与定位；沿用既有声明和权限规则，不将 retry/record 当作 Power |
| `data.loop-extension` `#S-14` 「调模型之后」失败那一维的主体（重试件只凭它下结论） | [S-29](#s-29-dispatch) ⑤ |
| `data.loop-extension` `#S-15` `ModelRequest` 四个成员（`target` 恒在；`tools` 是模型面名字） | [S-28](#s-28-opencall) |
| `data.loop-extension` `#S-17` FailureCause 八值与各属哪一类 | [S-18](#s-18-成因按来源分类三类事实由守卫兑现) |
| `data.loop-extension` `#S-24` select_model 的义务 | [S-10](#s-10-有效模型四步每步来源可查)、[S-28](#s-28-opencall) |
| `data.loop-extension` `#S-27` retry 的计划与义务 | [S-30](#s-30-dispatchagain)、[S-35](#s-35-默认重试件可替换) |
| `data.call-accounts` `#S-19`、`#S-20` 两次发出两份账、缺账记未知 | [S-17](#s-17-结算一处按序幂等先到者赢)、[S-33](#s-33-reconcile) |
| `data.call-accounts` `#S-6` Usage、`#S-8` Cost、`#S-15` TrimSummary | S-54 未结算结果直接沿用值形状；未知与零、来源及砍过的事实不重定义 |
| `data.call-accounts` `#S-37` RunId、AttemptId、ModelCallId 的表示；ModelCallId 由本能力产生、**会话内唯一** | [S-5](#s-5-一次调用一次发出)、[S-28](#s-28-opencall) |
| `data.call-accounts` `#S-25` 一笔账归哪次尝试、哪个运行、哪个租户、谁发起，权威是承载它的条目壳 | [S-17](#s-17-结算一处按序幂等先到者赢)、[S-19](#s-19-凭据每次发出现取取值只交给传输适配) |
| `data.content-blocks` `#S-6` 模态由媒体类型判定 | [S-13](#s-13-模态投影读到的必须追到日志尾) |
| `data.content-blocks` `#S-1` ContentBlock | S-54 的 blocks 直接使用权威内容块值，不重造另一套回复块 |
| `data.content-blocks` `#S-13` 半截的工具调用 | [S-29](#s-29-dispatch) |
| `data.content-blocks` `#S-21` AttachmentRef | [S-20](#s-20-写入之前脱敏) |
| `data.messages` `#S-9`、`#S-10` AssistantMessage 与它的三种收尾 | [S-29](#s-29-dispatch) |
| `data.messages` `#S-35`、`#S-36` 我们自己那两种在发出前译掉、ToolInternalMessage 不进请求；`#S-32` 一问一答（2026-09-25 修订波） | [S-38](#s-38-装配给的保证-vs-协议须给的保证)、[S-28](#s-28-opencall) 出门前检查第 6 行 |
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
| `data.model-profile` `#S-29` 模型适配绑定、`#S-30` 配置值与修订、`#S-31` 定义与路由对齐 | S-7、S-28、S-29、S-33、S-53～S-60：精确引用、规划、结果与恢复 |
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
| `capability.asset-evaluation` `#S-6` EvaluationInput、`#S-7` 一致性、`#S-8` 求值结果、`#S-12` 缺席与不可读分开、`#S-15` evaluate、`#S-22` 设置、`#S-29` 前提保证、`#S-45` 根声明、`#S-46` 根设置与层锁场景 | S-10/S-21/S-66：显式当前输入、纯求值及源真实性；新会话初值仍不自动产生，本版不为允许集合读它 |
| `capability.session-tenancy` `#S-8` holdingTenant | S-66：从真实会话映射固定 tenant；缺会话/读不到均 unavailable，不采用调用方猜值 |

| `data.model-profile` `#S-9`、`#S-32`、`#S-33` 输入 cap、上游事实与跨字段一致 | S-7/S-28/S-53/S-74：使用完整固定快照，实际发送须满足所有适用限制 |
| `data.content-blocks` `#S-10`、`#S-23` 内联编码与引用说明界限 | S-74：严格解码字节；AttachmentRef.bytes 不作已核实输入 |
| `data.model-response` `#S-39` PendingModelResponse、`#S-40` 输入限制快照与历史版本边界 | S-17/S-29/S-49/S-75：共享形状唯一拥有者，运行时不另发 Schema |
| `data.loop-extension` `#S-30`、`#S-32` 生效结论、`#S-42` 失败结论关联、`#S-43` 完整重试结论 | S-29/S-34/S-35/S-60/S-76：可重放来源，不推断隐藏计数 |

---

## 二、概念、身份与必要状态

### S-5 一次调用、一次发出

**一次调用有 0 到多次发出；每一次发出只走一家，恰留一条响应体**（`data.model-response/v8#S-4`）。

- **`callId`**（`ModelCallId`）**由本能力在打开一次新调用时产生**（`data.call-accounts/v2#S-37`），**会话内唯一**、不回收不复用，交换表示按 `data.identity-values/v1#S-31`。
  **一次调用的身份是（会话, `callId`）**：本能力同时承载多个会话，两个会话里可以有相同的 `callId`；所以每个指认一次调用的操作都**同时收 `session`**，先判这个 `callId` 是不是这个会话的，不是即 `callNotFound`（主线裁定，见 [D-060 §五 K19](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)）。
- **调用跨尝试延续**：执行尝试换了（停机之后新的一次尝试接着推），**同一次调用的身份不变**；首 token 之前失联的那次调用在新尝试里**以同一个 `callId` 接着发**（[S-33](#s-33-reconcile) 第一行），不是另起一次新调用。
- **发出序号属于调用、跨尝试连续**：同一次调用的第 n 次发出，不论落在哪次尝试，都是第 n 次；从 1 起、逐次加一、不重不跳（`data.model-response/v8#S-8`）。
- **尝试号属于每一次发出，不属于调用**：每一次发出记下它**落在哪一次尝试里**。一次调用的几次发出可以落在不同尝试里。
  `attemptId` 在响应体的每一次发出上，不在 `call` 里（`data.model-response/v8#S-7`、`#S-8`；原 G-1 在整批对齐闭合）。
- **不属于任何 Run 的调用**（如旁路提问：由会话本身发起的调用，[PF-013 它只有一个宿主](../../../../product/PF-013-model-profiles-and-invocation/design.md#它只有一个宿主所以只有一种结局) 末段）：它属于会话，花的钱归会话那一级；本契约对它一视同仁，只是它不带 Run 与尝试（[S-28](#s-28-opencall) ①），停机之后由会话重新承载时的对账收口（[S-33](#s-33-reconcile) ②）。
  **挂件、压缩闭包、旁路提问里发起的调用一律适用本契约，宿主恒为 [agent runtime](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-agent-runtime--agent-runtime--agent-runtime)**；挂件为 Run 发起的那几次花的钱算它插手的那个 Run（[PF-012](../../../../product/PF-012-agent-loop-and-run/design.md#挂件自己花的钱算它插手的那个-run)）。
- **一笔账归哪次尝试、哪个运行、哪个租户、谁发起，权威是承载它的条目壳**（`data.call-accounts/v2#S-25`）：响应体上的 `attemptId` 只是「这次发出落在哪次尝试」的事实，不作归属；响应体上的 `initiator` 只指中断发起方（`data.model-response/v8#S-12`）。

### S-6 调用的状态

**一次调用恰处在下列一个状态；三个终态吸收，终态之间不互转。**

| 状态 | 含义 | 怎样进来 |
|---|---|---|
| `open` | 已打开、过了出门前检查、还没发出过 | [S-28](#s-28-opencall) |
| `in_flight` | 一次发出已出门（「已出门」已写下），还没开口 | [S-29](#s-29-dispatch)、[S-30](#s-30-dispatchagain) |
| `speaking` | 这次发出已开口（「已开口」已写下） | [S-16](#s-16-首-token-判据) |
| `reply_pending` | 这次发出已收场并**带着回复交回调用方**，正常进入时响应体尚未写下；**收场对调用方的操作而言已定**，等调用方收口（[S-17](#s-17-结算一处按序幂等先到者赢)）。后续处置追加回执未知时，本实例仍保留待确认处理责任，不能据此断言日志尚无响应；已提交原批必须认回。**两处兜底例外**仅针对尚无合法完整响应的调用：宿主停止的撤除（S-36）写没有回复的 interrupted{run_cancelled}；停机之后对账（S-33）在权威读回有已开口而无响应时按对应行收。这一待确认处理状态只在本能力手里，不覆盖耐久事实 | [S-29](#s-29-dispatch) ⑤ |
| `awaiting_decision` | 最近一次发出以故障收场，响应体已写下；**等 loop 决定再发还是放手** | [S-29](#s-29-dispatch)、[S-33](#s-33-reconcile) |
| `resumable` | 最近一次发出在首 token 之前失去连续性，已追补结算；**可以在同一次调用下再发** | [S-33](#s-33-reconcile) 第三行 |
| **`complete`**（终态：完整一份） | 最后一次发出以 `complete` 或 `truncated` 收场、响应体已写下——**含回复在落盘之前被否决、被系统使用**（`data.model-response/v8#S-12`、`#S-14`） | 从 `reply_pending`：调用方写下（`persisted`）或 [S-49](#s-49-settlereply) |
| **`handed_up`**（终态：上交） | 出门前检查不过（`undispatched{cause}`）；loop 在一次故障之后或从 `resumable` 放手（`released`）；续接或再发时取不到凭据（`released{cause}`） | [S-28](#s-28-opencall)、[S-32](#s-32-releasecall)、[S-29](#s-29-dispatch) ⑧、[S-30](#s-30-dispatchagain) ⑧ |
| **`interrupted`**（终态：被中断） | 用户中断、宿主取消，或首 token 之后失去连续性（`initiator = runtime_lost`）；带着回复被中断的那一次同样经 `reply_pending` 收口 | [S-31](#s-31-interrupt)、[S-33](#s-33-reconcile)、[S-36](#s-36-宿主停止与撤除) |

- **终态恰三个**，与 [UL-model-call](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call) 一致；`undispatched{cause}` 是上交的子形，`interrupted{runtime_lost}` 是被中断的子形，**不是第四、第五终态**。
- **没有「说话中 → 在途」这条转移**：开口之后这次调用不会再有下一次发出（[S-22](#s-22-同一次调用的发出序列)）。
- **状态不另存为权威**：终态与「已开口」由会话日志里的记录判出（[S-8](#s-8-调用在会话日志里留下的六种记录)）；本能力手里的在途状态只活到进程还在为止，停机之后以日志为准（[S-33](#s-33-reconcile)）。
- **未确认不等于未提交**：写入回执未知时，操作所说保留原阶段或 `reply_pending` 是本实例的未确认处理责任，不能否认可能已耐久的响应/调用终结，也不保证其他写方未改变权威状态。依据尚不可判的事实放行时仍沿 S-14 `unavailable`，不从本地旧阶段推出可再发；认回后遵守真实终态及原操作重复规则。

### S-7 一次调用绑定了什么

**打开一次调用时绑定下列各项，此后这次调用的每一次发出都用同一份：**

| 绑定 | 从哪来 | 为什么要绑 |
|---|---|---|
| **有效模型**（一个 `ModelProfileRef`）及它怎么来的 | [S-10](#s-10-有效模型四步每步来源可查) | 选中模型之后切换不作用于在途调用（[PF-013 §6.7](../../../../product/PF-013-model-profiles-and-invocation/design.md#67-生效点收到那条事实之后下一次模型请求之前)） |
| **档案快照**：那条档案在打开这一刻的、发出与重试要用到的属性（允许的供应商及次序、允不允许回退、两个上限、两组模态、`inputConstraints`、`upstreamInputLimits`、`parameters`、`updatedAt`、`adaptation`） | 档案读面的同一次读；新档案版本接入见 G-25 | 一次调用内各次发出**按同一份档案准备、按同一份发出**；档案后来被改或被撤回，不改在途调用 |
| **模型适配绑定**：快照的 `adaptation` 原值与它所指精确实现、定义的可用引用 | `data.model-profile/v6#S-29`～`#S-31`；[S-53](#s-53-模型适配绑定的取得与保留) | 同一调用各次发出与恢复不得重选策略；配置修订只在所属档案身份内解释 |
| **合并后的请求参数**（「要求的那一组」）：档案 `parameters` 逐项被本次覆盖替换，**合并之后**再按档案的输出上限校验（`data.model-profile/v6#S-18`） | 档案快照 ＋ `parameters` | 交给传输适配的就是它；响应体 `route.parameters` 记的是它经传输适配之后**实际发出**的那一组，改过值的项记进 `parameterAdjustments`、没发出的项记进 `droppedParameters`（`data.model-response/v8#S-11`） |
| **有效模型怎么来的**（`selectedBy`） | [S-10](#s-10-有效模型四步每步来源可查)；[S-28](#s-28-opencall) ① 的 `basis` 与 `targetChangedBy` | 响应体 `route.selectedBy`（`data.model-response/v8#S-10`） |
| **发起租户**（`TenantId`）：会话在创建那一刻持有的租户身份 | 会话（[PF-015 rev13 §6.12](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#612-会话持有创建那一刻的租户身份)、`data.identity-values/v1#S-28`） | 凭据取哪一把、账算到谁头上（[S-19](#s-19-凭据每次发出现取取值只交给传输适配)） |
| **宿主**（这次调用挂在哪一个 agent runtime 上）与**会话日志的追加入口**（`capability.session-log/v3#S-17` 的 `append`） | 调用方 | 调用随宿主停（[S-36](#s-36-宿主停止与撤除)）；六种记录写到哪（[S-8](#s-8-调用在会话日志里留下的六种记录)） |

- **档案快照落在响应体上**：`data.model-response/v8#S-9` 的 `route.profileSnapshot`（形状是 `data.model-profile/v6#S-27` 的 `ModelProfileSnapshot`；档案不另有修订身份），本契约把绑定的那一份写进去。
- **传输适配改值与丢项的规矩归 `data.model-response/v8#S-11`**：改了值再发出的项，**发出的值必须在统一词表里表示得出**，否则那一项要么改成表示得出的值、要么不发并记进 `droppedParameters`；`extra` 项以它的键为名。
  **上游把输出上限降到档案参数之下时档案不改**（`data.model-profile/v6#S-18`）：合并之后的 `maxOutputTokens` 照档案走，传输适配发出时改成上游收得下的值，并记进 `parameterAdjustments`——**不静默改、也不因此拒发**。
- **档案快照照原样复制那一刻的档案**（`data.model-profile/v6#S-27`），不挑、不改写成员。
- **绑定的耐久来源是每一次发出的「已出门」记录**（`data.messages/v6#S-49`；主线裁定，见 [D-060 §五 K20](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)）：它带着有效模型引用、档案快照、**合并之后、交给传输适配之前**的请求参数、`selectedBy` 与这一次的 `credentialScope`；
  **另带传输适配为这一次定下的 `parameterAdjustments` 与 `droppedParameters`**（形状取 `data.model-response/v8#S-11`；主线裁定，见 [D-060 §六 L4](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)）——它们在出门之前就定下了（[S-29](#s-29-dispatch) ④），于是实际发出的那一组由这条记录还原得出：合并之后的那一组，把 `parameterAdjustments` 列的项换成 `sent`、去掉 `droppedParameters` 列的项（`data.model-response/v8#S-11` 第 4 条的逆运算）。停机之后追补的那一条响应体，参数三项就从这里读（[S-33](#s-33-reconcile) ④；原 G-18 闭合）。
  **停机之后续接、对账追补响应体，都从那条记录读绑定，不从内存、也不重读档案**——重读档案会让在途调用受档案后来的改动影响。一次还没出门的调用没有这条记录，停机之后也就没有要恢复的绑定（[S-28](#s-28-opencall) ④）。
- **凭据不绑**：每一次发出现取（[S-19](#s-19-凭据每次发出现取取值只交给传输适配)）；这一次用的是哪一格，随「已出门」记下。

### S-8 调用在会话日志里留下的六种记录

每次追加必填 condition；各记录的精确选择和原义依据见 S-68。

**本能力经宿主给出的追加入口，往会话日志里写下列记录；每一种都在它要保护的那件事发生之前写下。**
追加入口就是窄口接口契约 `capability.session-log` v3 的 `append`（[S-17](../../session-log/v3/contract.md#s-17-append追加一批条目)）：「写下」即它成功返回（[S-13](../../session-log/v3/contract.md#s-13-提交与持久)：返回即已持久）；**属于 Run 的两个锚点、中断意图与调用终结带栅栏 `fenced{run, attempt}`，结算类（响应体、账）不带**（[S-10](../../session-log/v3/contract.md#s-10-尝试栅栏) 第 3 条；这一分法起草时是本契约的推导，**主线已接受**，2026-09-25）；响应体以 `ResponseId` 拼出判重键（[S-8](../../session-log/v3/contract.md#s-8-判重键)）；对账与读发出记录经 `readSince`（[S-19](../../session-log/v3/contract.md#s-19-readsince从某个位置往后读)）。
响应体之外的五种记录，**形状归 `data.messages/v6` 的 [S-49](../../../data/messages/v6/contract.md#s-49-模型请求运行时写的五种记录不是消息)、[S-50](../../../data/messages/v6/contract.md#s-50-调用终结的三支)**（`ModelInvocationRecord`：不是消息，只供对账读；主线裁定，见 [D-060 §S16 S16-d](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)）；本条定义它们**各自必须能回答什么、何时写、谁写**。
**会话、Run、尝试、租户都在承载记录的条目壳上**，不在记录里（`data.messages/v6#S-49`、`data.call-accounts/v2#S-25`）；下表「落在哪次尝试」「谁」都从条目读。

| 记录 | 必须能回答 | 何时写 | 谁写 |
|---|---|---|---|
| **已出门** | 哪次调用的第几次发出、落在哪次尝试、发给哪一家、这次发出的 `ResponseId`；**这次调用的绑定**：有效模型引用、档案快照、合并之后的请求参数、`selectedBy`、这一次的 `credentialScope`（[S-7](#s-7-一次调用绑定了什么)）；**传输适配为这一次定下的改值与丢项**（`parameterAdjustments`、`droppedParameters`，缺席即没改、没丢） | 这一次请求**离开本进程之前**（[S-15](#s-15-两个锚点先写后行)） | 本能力 |
| **已开口** | 哪次调用的第几次发出、观察到首 token 的时刻 | 首个内容**交给任何观察者之前**（[S-15](#s-15-两个锚点先写后行)） | 本能力 |
| **中断意图** | 哪次调用、谁发起（`user` ／ `run_cancelled`） | 发出中止信号**之前**（[S-31](#s-31-interrupt)） | 本能力 |
| **[模型响应体](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-response--模型响应体--model-response)**（`data.model-response`） | 见那份契约 | 一次发出收场时 | **回复落盘成了消息的那一条（`persisted`）由调用方与回复消息同一提交写；其余——含回复被否决、被系统使用的那一条——由本能力写**（[S-17](#s-17-结算一处按序幂等先到者赢)、[S-49](#s-49-settlereply)；`data.model-response/v8#S-3`） |
| **调用终结** | 哪次调用、以哪个终态结束；`undispatched` 时的成因；`released` 在续接或再发时因取不到凭据而上交时的成因；`interrupted` 时的发起方 | 调用不经响应体进入终态时：出门前检查不过、续接或再发时取不到凭据、在两次发出之间被中断、loop 放手 | 本能力 |
| **[模型切换](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-switch--模型切换--model-switch)落下的那条记录条目**，即 `data.messages/v6#S-49` 的 `model_selection_changed` | 哪个会话、切到哪个路由名、谁、何时（`data.offer-expiry/v1#S-22` 的时间点） | 切换**生效之前**（[S-27](#s-27-selectmodel)） | 本能力 |

- **`ResponseId` 由本能力在写「已出门」那一刻铸下**（`data.model-response/v8#S-6`），此后这次发出的任何结算——本能力、调用方、停机之后的对账——都沿用它（[S-17](#s-17-结算一处按序幂等先到者赢)），这使「同一次发出至多一条响应体」可以按标识判重。
- **两个锚点不是响应体**：它们不带收场、不带账；响应体写下之后它们仍在，**供对账读，不供任何视图呈现**。

### S-9 选中模型

**选中模型是一个路由名：这个会话日志里最后一条模型切换的记录（`model_selection_changed`，[S-8](#s-8-调用在会话日志里留下的六种记录)）记的那个名字。** 本批候选的独立装配必须先显式调用 `selectModel` 写真实记录；新会话尚无记录时选中模型判不出，依赖它的操作以 `unavailable` 失败，不从目录第一行、根属性或实现默认值自动选一个。`capability.asset-evaluation/v4` 候选允许已声明的根属性 `model` 进入求值结果，供 S-10 判锁；这不等于已经定义新会话初值的产品推出规则。原产品所述“从未切换时由设置求初值”的生产者仍在 [G-20](#十二已知缺口) 保留，不能因候选新增字段而假称关闭。
**记的是名字，不是某一行**（PF-013 rev 12 [§4 档案的身份](../../../../product/PF-013-model-profiles-and-invocation/design.md#档案的身份所在范围加路由名)；`data.model-profile/v6#S-14`）；这个名字这一次落到哪一行，是 [S-10](#s-10-有效模型四步每步来源可查) 第 2′ 步的事。

- **只因[模型切换](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-switch--模型切换--model-switch)而变**（[PF-013 flows §3.3](../../../../product/PF-013-model-profiles-and-invocation/flows.md#33-一个会话的选中模型)）：拓展件的 `select_model` 只改那一次的有效模型，**不写模型切换的记录**（`data.loop-extension/v6#S-24`）；agent 自己换不了。
- **名字不变，落点会变**：最具体那一行被撤回、链上另有在册且这个范围允许的同名行，这一次就落到那一行、调用照发——**这不是替用户改选**，他选的是这个名字（[§6.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#64-撤回不删行会话指向被撤回的档案时说已下架)）。
  **链上同名的都撤回了**，落点是已撤回的那一行，据此说「已下架」（[S-12](#s-12-展示列表)）；**不替用户改选**（[§6.9](../../../../product/PF-013-model-profiles-and-invocation/design.md#69-合法目标算不出来时不替用户改选)）。
  撤回的那一行后来恢复在册，它又是最具体的，名字落回它——**下一次请求照常发出，用户什么都不用做**，本能力也没有什么要改回来（[flows §1.4](../../../../product/PF-013-model-profiles-and-invocation/flows.md#14-走一遍选中的模型被下架了) 第 6′ 步）。
- **读不到会话日志 ⇒ 选中模型判不出来**，依赖它的操作以 `unavailable` 失败，**不回退到设置求值的那个初值**——那会把「读不到」说成「从没切换过」。

### S-10 有效模型：四步，每步来源可查

**v3 当前输入边界**：每次 `effectiveModel` 通过 [S-66](#s-66-currentevaluationinputsread当前求值输入端口) 取得当前完整 EvaluationInput，再调用 `capability.asset-evaluation/v4#S-15` 的纯 evaluate；根声明及值域沿该契约 S-45/S-46。可选 `model` 仍指既有“用哪个模型”，有效求值中缺该项即没有锁；输入源缺失或不可判不等于无锁。新 `openCall` 的 basis 使用本次 `effectiveModel` 所给结果；保留 S-28 已接受的选择竞争窗口，openCall 不再次重算 basis、不新造 stale 拒绝值。已打开调用保持 S-7 绑定，再发只按 S-21 现求时限，不重新选模型。

**历史参考不提供当前值**：`capability.assembly-manifest/v3#S-32/#S-33` 的 readEvaluation 固定当前头上界，按同会话提交序号取最近 given/mint，只回答已提交历史；最新 given/mint 也不是当前全部配值的证明。它不能替代 S-66，runtime 不规范消费这份历史读面、不据旧 EffectiveAssembly 反推新输入。该契约只作导航，不登记本包依赖。当前读取责任沿[读取链候选裁定](../../../../record/proposals/model-request-adaptation/read-projection.md)，仍待独立评审接受与真实生产者验收。

**这一次调用的有效模型按下面四步定下；每一步的结论与来源都在日志或响应体上查得到。**

| 步 | 做什么 | 结果从哪来 | 留在哪 |
|---|---|---|---|
| 1 | 取**选中模型**（一个路由名） | [S-9](#s-9-选中模型) | 模型切换的真实记录；没有记录不假造初值 |
| 2 | **层级求值**「用哪个模型」这项设置：会话格之上若有一格带[不可覆盖标记](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-immutable-marker--不可覆盖标记--immutable-marker)，**取那一格的名字，压过选中模型**。**「读不到」与「没有这一项」分开**：求值读不到（求值失败）⇒ `unavailable`；求值成功而 `values` 里没有这一项（`capability.asset-evaluation/v4#S-12`：未声明的设置项不进 `values`）⇒ **没有锁**，取第 1 步的名字——不存在的项上不可能有锁，这是事实，不是默认值（主线裁定 [D-060 §八 N-39](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)） | `capability.asset-evaluation` v4 的设置求值（[PF-013 §4 选中模型与有效模型](../../../../product/PF-013-model-profiles-and-invocation/design.md#选中模型-与-有效模型)「上层锁死」；根属性 `model` 的候选声明与当前输入读面见本节首段，初值生产者仍见 [G-20](#十二已知缺口)） | 响应体 `selectedBy = layer_lock`；否则 `session` |
| 2′ | **把路由名解析为一行**：以前一步的名字为[能力标识](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier)，取它在会话范围链上的**落点**——**先滤掉已撤回的、再滤掉这个范围不允许的，然后取最具体一格**（租户层 > 组织层 > 出厂默认层）。**锁锁的也是名字**：供应商、参数、凭据取落到的那一行（主线裁定，见 [D-060 §二 S-U24-5a～c](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#二2026-09-24-用户在场期间主线随用户裁决所作的自定账本-二-原文标主线自定的行)）。第 3 步拓展件给出的目标同样取它的路由名、经这一步 | `capability.model-profile-directory/v5#S-17` 末段的 `落点(T, r, A)`：`T` 是会话持有的租户，`A` 是 [S-11](#s-11-合法目标集合) 输入表里的允许集合 | **`selectedBy` 不变**；`effectiveModel` 的 `profile` 是落到的那一行，响应体 `route.profile` 是它 |
| 3 | **「调模型之前」的拓展件**可能给出 `select_model`，只改这一次 | `capability.loop-extension-runner`（它先按 [S-24](#s-24-legaltargets) 核合法，`data.loop-extension/v6#S-24`） | 拓展件的结论条目；响应体 `selectedBy = { extension: <name> }` |
| 4 | **出门前检查**：对落到的那一行核在册、范围允许、模态兼容、凭据有无 | [S-28](#s-28-opencall) | 不过 ⇒ 调用终结记录 `undispatched{cause}`；过 ⇒ 响应体 `route.profile` |

- **第 1、2、2′ 步由 [`effectiveModel`](#s-26-effectivemodel) 给出**；第 3 步在 loop 里发生，它给出的目标在打开调用时经 2′；第 4 步在打开调用时发生。
- **只滤已撤回与范围不允许**（主线裁定，见 D-060 §二 S-U24-5a）：胜出行模态对不上或缺凭据，**它照样是胜出行**，第 4 步以相应成因挡下，**不落到更一般一格的同名行**——这两样是这一次运行时的事实，不是那一行能不能被这个范围用。缺凭据尤其不滤——缺凭据的名字仍是合法目标，出门前才挡（[S-11](#s-11-合法目标集合)）。
- **没有胜出行时，落点那一行由第 4 步挡下**（`capability.model-profile-directory/v5#S-17` 末段的三种收场）：链上同名的都撤回了 ⇒ `withdrawn`（「已下架」）；有在册的、却都这个范围不允许 ⇒ `scope_disallowed`（**本版不出现**：`A` 恒含链上全部名字，[D-063 R-4](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)）；**链上没有这个名字的任何一行** ⇒ `profileNotFound`（[S-28](#s-28-opencall) ⑧）。
- **这条裁决的代价，写明**：
  - **组织层建了一条与官方同名的自建档案，成员没配自己那一把之前，这个名字对他用不上**——名字落到组织层那一行，以 `credential_unavailable` 挡下；部署给出厂格配的那一把救不了它（出厂格那一把只供官方档案，`capability.model-profile-directory/v5#S-20`）。成员配上自己那一把就好。
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
`T` 是会话持有的租户，`A` 是这个会话格上的允许集合（下表）；`胜出行` 按 `capability.model-profile-directory/v5#S-17` 末段——**胜出行存在，就在册且这个范围允许**（两道滤已经滤过）。

| 输入 | 从哪来 |
|---|---|
| **链上档案** | `capability.model-profile-directory/v5#S-17`，以会话持有的 `TenantId` 为锚 |
| **允许集合 `A`** | **本版就是上一行「链上档案」里出现的全部路由名，由目录读面直接给**——与链上档案出自同一次 `listProfiles` 读（`capability.model-profile-directory/v5#S-17` 末段；[D-063 R-4](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)：本版不收窄，范围允许 = 这个范围里登记的全部档案，凭据可用即可用；原 G-19 闭合）。**取值域是路由名**（主线裁定，见 [D-060 §五 K42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)；原 G-4 闭合）。**它是胜出行的第二道滤**（[S-10](#s-10-有效模型四步每步来源可查) 第 2′ 步），本版恒过；式子仍以它为显式参数——将来要收窄，作为设置走资产求值（PF-002），那时本行改指那一项、出新版本，同一租户的两个会话格也才会有不同的 `A`（按 `(T, r)` 缓存胜出行那时就是错的） |
| **投影** | [S-13](#s-13-模态投影读到的必须追到日志尾) |
| **`compatible`** | `capability.modality-projection` v2 的 [S-16](../../modality-projection/v2/contract.md#s-16-兼容判定-compatible)：投影 ⊆ 档案的输入模态（`data.model-profile/v6#S-7`） |

- **任何一个输入读不到 ⇒ `unavailable`**，**不返回空集**——空集会被读成「现在没有任何模型能用」，据此替用户改选或弹错（[§6.9](../../../../product/PF-013-model-profiles-and-invocation/design.md#69-合法目标算不出来时不替用户改选)）。允许集合读不到（本版即链上档案读不到），不当成空集（全拒），也不当成全集（全放）。
- **凭据有无不在这里**：缺凭据的名字仍是合法目标，出门前检查才以 `credential_unavailable` 挡下；展示列表把它标出来（[S-12](#s-12-展示列表)）。
- **模态按胜出行判**（主线裁定，见 D-060 §二 S-U24-5a～c）：选一个名字，这一次用的是胜出行，所以兼容与否按它算——否则一个判为合法的名字会在出门前检查被挡下。**被盖住的同名行不是候选**，只在展示列表上作标注（[S-12](#s-12-展示列表)）。

**可发出的另一条前置——不是合法目标集合的一项**：**投影(会话) ⊆ 本据点传输能承载的模态**（「本据点传输能承载的模态」无词条：本据点的装配事实，传输适配能送出哪几种模态；主线裁定，见 [D-060 §块 C 对账 C-R5](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#块-c-对账d-reconciliation-c需主线看八项)；与合法目标分开写是主线裁定，见 [D-060 §五 K40](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)）。

- **它与哪个名字无关**：投影里有本据点传输送不出的模态时，这个会话在本据点上**任何一个名字都发不出去**；所以它不进合法目标集合、不改变切换（切到合法目标不得拒绝，[§6.5](../../../../product/PF-013-model-profiles-and-invocation/design.md#65-切换是用户的直接命令合法目标不得拒绝)），
  而在出门前检查里挡下（[S-28](#s-28-opencall) 出门前检查第 3 行，成因 `modality_mismatch`），**成因有处可归**。
- **档案登记时不校验它**：它是据点的事实，不是档案的事实；同一条档案在另一个据点上可能发得出去。

### S-12 展示列表

```text
DisplayList(会话)  ≝  { r ∈ LegalTargetSet(会话) ∪ { 选中模型 } } 每个名字一条
```

**每条是一个路由名**，带三样（[PF-013 §5.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事)、[§6.3](../../../../product/PF-013-model-profiles-and-invocation/design.md#63-官方与自建在同一份列表里)）：

1. **主标：落点那一行的来源**——那一行的 `ref`：`ref.origin` 是 `official`（官方）或 `custom`（自建），自建的 `ref.scope` 的判别式指出建在哪一层。它告诉用户**这个名字此刻用的是谁建的那一行**；有胜出行时是胜出行，选中模型没有胜出行时是落点那一行（`capability.model-profile-directory/v5#S-17` 末段）。**来源标注取自引用里这两个分量，不另立一个成员**。
2. **注记**：这个名字现在能不能用（下表）。**名字上的注记判的对象**：这个名字有胜出行时判胜出行——`legal` 或 `modality_mismatch`，外加 `credential_missing`；**没有胜出行时只判落点那一行在两道滤里卡在哪一道**——`withdrawn` 或 `scope_disallowed` 恰一个，**不对它判模态与凭据**：它此刻本来就选不了，模态与凭据的答案对它没有意义，判了只会给出一个用户据以行动却无效的原因。
3. **被盖住的同名行**：这个名字有胜出行时，链上同名的其余每一行**列在这一条之下**，各带自己的 `ref`（来源）与注记 `overridden_by{scope}`；它自己已撤回的再带 `withdrawn`，这个范围不允许的再带 `scope_disallowed`。**只作标注，选不了**——选这个名字，用的就是胜出行（主线裁定，见 D-060 §二 S-U24-5c）。**怎么呈现（排在下面、折起来还是别的）归交付面**（PF-016）。
4. **是不是选中模型**：条目上的 `selected` 为真即这一条是会话此刻的选中模型（[S-25](#s-25-displaylist) ⑤）。

**来源是每一条上的标注，不是把列表分块的依据**（§6.3）。

| 注记 | 挂在哪 | 含义 | 判据 |
|---|---|---|---|
| `legal` | 名字 | 是合法目标 | [S-11](#s-11-合法目标集合) |
| `withdrawn` | 名字；被盖住的行 | 名字上：选中的这个名字，**链上同名的都撤回了**——「已下架」；行上：这一行自己已撤回 | 名字上：落点那一行 `registration = withdrawn`（没有在册的同名行）；行上：这一行 `registration = withdrawn` |
| `scope_disallowed` | 名字；被盖住的行 | 名字上：这个名字链上在册的同名行，这个范围一条都不允许；行上：这一行这个范围不允许 | 名字上：没有胜出行而有在册的同名行；行上：范围允许对这一行不成立。**本版不出现**（`A` 恒含链上全部名字，[S-11](#s-11-合法目标集合)） |
| `modality_mismatch` | 名字 | 和会话里的模态对不上 | 胜出行的兼容那一项不成立。**本据点传输送不出不在这里**——它与名字无关，是可发出的另一条前置（[S-11](#s-11-合法目标集合) 末段） |
| `credential_missing` | 名字 | **调它时没有凭据可用**（**附加注记**，可与 `legal` 并存）：胜出行是自建档案——这个租户没配自己那一把；是官方档案——这个租户没配、部署也没给出厂格配一把 | 以会话持有的租户与**胜出行的来源**问 `capability.model-profile-directory/v5#S-20` 的有没有，答 `{ present: false }` |
| `overridden_by{scope}` | 被盖住的行 | **被 `scope` 那一格的同名档案覆盖**：这个名字此刻用的是那一格的那一行；`scope` 是胜出行所在的一格——出厂默认层为 `factory`，否则胜出行 `ref` 里的 `scope`（主线裁定，见 D-060 §二 S-U24-5c） | 这一行不是胜出行，而这个名字有胜出行 |

- **选中模型不在合法目标里时，它仍在列表上**，并带上它不合法的那一条原因——**不呈现「未知模型」**，也不从列表里消失。
- **`credential_missing` 按胜出行的来源问**：同一个租户没配自己那一把时，胜出行是官方档案的名字（部署配了出厂格那一把）可用，胜出行是自建档案的名字标明缺凭据——一个名字不能按别的名字的答案代答。
- **按上面的判据，名字上不合法的原因至多一条**（`withdrawn`、`scope_disallowed`、`modality_mismatch` 三者互斥）；`credential_missing` 是附加注记，与 `legal` 或 `modality_mismatch` 并存时一并列出。
- **选中模型这个名字在链上没有任何一行**（它曾被选中，如今链上查无此名——行不删，这意味着存储丢了行）：列表**以 `profileNotFound` 失败**（与 [S-26](#s-26-effectivemodel)、[S-28](#s-28-opencall) 同一个值），不自造一个注记把它说成「已下架」。这是一个确定的判定、不是「判不出来」，调用方不该重试。

### S-13 模态投影：读到的必须追到日志尾

**本能力读会话模态投影时，读到的必须等于「对读那一刻的整份会话日志求一遍投影」的结果。**
投影的定义（哪些块算、嵌在工具结果里的算不算、派生表示与 transcript 怎样处理）归 `capability.modality-projection` v2；块的模态由媒体类型判定（`data.content-blocks/v3#S-6`）。
**本条兑现的是 `capability.modality-projection/v2#S-6` 对读方的两条义务**（存着的答案等于重算；判合法目标用的答案覆盖到日志尾），并借它的可分解律增量维护。

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
| **输入不合形状** | **`invalidInput{reason}`**：档案引用与请求参数取 `data.model-profile/v6#S-25` 的拒绝值；身份值与判别式取 `data.identity-values/v1#S-33` 的口径；本契约自己的输入不合形状取 `malformed` |

- 本版补充归属输入拒绝原因 `observer_scope_mismatch`：观察者端口与所交会话、目标不符（S-62）。它是 `invalidInput` 的子值，不是模型调用成因。S-54～S-60 的独立函数采用各自封闭失败子集；观察交付的 `buffer_full`、`consumer_failed` 不加入 S-14 的服务操作失败值集合。

- 本版另在 S-28/S-29 增加 `invalidInput{reason: modality_mismatch}`：已有历史发出的调用在续接/再发规划时，新输入与已绑定快照的模态不匹配。它是输入拒绝，不加入 ResponseOutcome 或 FailureCause，不改变已存在的发出事实。

- S-74 三种输入限额拒绝是 `invalidInput` 的子值；实际超限与无法证明合规分开，失败码不因它们扩成第十种。

- **身份参数没有默认值**：会话、`callId`、`TenantId`、宿主缺席即 `invalidInput`，**不得**由「当前会话」「当前在跑的那次调用」补齐（`data.identity-values/v1#S-17`、`#S-18`）。
- **判别式闭合**：`initiator`、`RetryPlan` 的成员、集合外的取值一律 `invalidInput`（`data.identity-values/v1#S-32`）。

**本契约的失败值恰九个，没有「其他」**：

| 失败值 | 意思 |
|---|---|
| `invalidInput{reason}` | 输入表示非法或 S-74 明确的输入限额拒绝 |
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
- **锚点没有确认写下**：已出门没有确认写下 ⇒ **这一次不发**，按 `unavailable` 回给调用方；回执未知不等于没有记录，可能已提交的锚点须保留给 S-33 对账。已开口**确知未提交** ⇒ **内容不交给观察者**，中止这次发出，按首 token 之前的故障结算、成因 `unrecognized` 并留痕（[S-18](#s-18-成因按来源分类三类事实由守卫兑现)）。门失败或执行取消后，已开口追加仍在途、回执为 `unavailable` 或没有回执时，不能断言未提交，按 S-17 隔离、由 S-33 读回恢复。**不「先交出去再补写」**。

### S-16 首 token 判据

**首 token = 这次回复交出的第一样内容，不论模态**（[已经开口说话了](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类)）：

- 能一点点长的块（文本、思考、工具调用的参数、语音）：**第一片到了**；
- 整个交出的块（图、文件）：**整块交出来了**；
- **一个开了口、零次填充就封口的块，也算开口**，只要封口块内容非空（`data.arrival-events/v2#S-21`）——记录里已经有一个完整的块（装配器侧的判据是 `capability.stream-assembly` v3 的 [S-16](../../stream-assembly/v3/contract.md#s-16-首个内容的位置)，本条与它一致）；
- **响应头到了不算；整交的块开了口还没交出来也不算**。S-58/S-54 的 `rawHeaders` 不生成内容到达事件，不触发 `beforeFirstContent`，也不能据它填写 `firstTokenAt`。

**观察到首 token 就写「已开口」**（[S-15](#s-15-两个锚点先写后行)），响应体的 `timing.firstTokenAt` 与它一致（`data.model-response/v8#S-17`：它与「已开口」记录上的时刻相同）。
**这次发出算不算开口，以耐久「已开口」记录为准。**「已开口」**确知未提交**时，按 [S-15](#s-15-两个锚点先写后行) 末条：内容**没有交给任何观察者**、这次发出被中止——**没写下的开口不算开口**：对外没有任何一方见过它，日志里也没有这条记录。
只有这一确知未提交的分支，响应体才**不带 `firstTokenAt`**、以首 token 之前的故障收场、成因 `unrecognized` 并留痕本地错误——`firstTokenAt` 缺席在这里是如实的断言（`data.model-response/v8#S-18`：「已开口」没有写下），不是「判不出」时的填补。**零可见内容与已有耐久「已开口」可以同时成立**：回执丢失或门等待中取消之后迟到提交时，S-55 函数结果没有 `firstTokenAt`，不能据此否认日志锚点；服务面按 S-17/S-33 查明真实锚点，响应体时刻取耐久记录，不伪造已交付内容。

### S-17 结算：一处、按序、幂等、先到者赢

本版所有结算方共同遵守 S-68～S-73 与 S-75；调用方写 persisted 回复也在此范围。

**实际发送时刻**：完整响应遵守 `data.model-response/v8#S-16/#S-17/#S-24`。`sentAt` 始终必有；保留同次已知的真实交给传输时刻。只有已确认耐久「已出门」责任的 interrupted 结算、且没有可用实际时刻时才写 null，包括 S-33 失联恢复及 S-54 锚点后零 send 取消；禁止拿锚点、恢复或当前时刻补值。null 不宣称未发送，不清除已知首 token/用量/费用，不授予重发资格。无锚点取消和发前规划拒绝仍没有响应体。普通完整、截断、失败及 PendingModelResponse 的 sentAt 必须为实际时间点。

**完整响应的头事实**：本版结算消费 `data.model-response/v8#S-20/#S-21/#S-22`。S-54 的同次结果具有 `rawHeaders` 时，构造的完整 `ModelResponse.raw.headers` 必须是该自有不可变原值；没有可见内容、没有回复、读取失败、门失败或取得头后的取消都不能将其擦掉。`rawHeaders` 缺席时不补空对象或其他值；`raw.body` 仍按既有附件与留存责任处理，独立函数不因此承担附件 IO。留存失败不阻止原响应收场，但不能将主动丢弃已经交接保留的值说成没有事实。原批优先时保持已经提交的完整响应原值，不拿后来的候选头改写它；未知锚点、同批提交、late、恢复和实际停止的前提仍按本条及 S-68～S-73。

**一次发出的收场由「写下它的那条响应体」定下。**可能写它的有四方：正常收尾（交回调用方）、中断、宿主停止时的撤除、停机之后的对账。

**所有结算方共同遵守的锚点前提**：本次函数已失败或中断、或服务面正在停止本次执行时，若 `beforeFirstContent` 所属的「已开口」追加尚在途、回执未知，或取消关闭了函数可见序列而该追加仍可能迟到提交时，服务面不能用函数投影的 `failed/unrecognized`、`interrupted` 或缺席 `firstTokenAt` 断定耐久收场。按 `capability.session-log/v3#S-17`、`#S-22`，`unavailable` 只表示没有确认提交。该调用保持未结算且内容不可见，需要该未知事实的服务操作返回 `unavailable`（S-72 保留 interrupt 已提交意图的原返回时点）；不提交普通响应体、不交失败主体给重试件、不允许 retry/dispatchAgain 或续发、不抹除既有锚点，也不把隔离另立为领域状态或失败值。已接受的中断意图保留，不因等待而撤销。

**允许继续的条件**：旧网络读取、内容门回调、旧锚点追加和所有可能写本次响应的旧结算方（含 `unfenced` 写者）均已实际收束，已排除旧生产者继续写入，并能从真实会话日志读回这次发出的完整耐久事实。属于 Run 的调用还须已由共同日志里的有效尝试栅栏关闭旧尝试写入资格（`capability.session-log/v3#S-10`）；不属于 Run 的调用须在 S-33 既有重新承载时机保证旧属主实际静止和唯一承载。取消请求、函数 outcome 已返回、运行时卸载开始、追加回执失败或有效尝试栅栏本身都不证明实际收束；一份不能确认包含该追加结果的旧尾、副本或内存清单也不能证明锚点不存在。任一条件无法确认，继续 `unavailable`、不结算、不交内容。条件齐全后仅经 S-33 既有恢复时机，按真实「已开口」有无及中断意图结算；不重开原门、不续原流、不自动重发。响应体和账仍按下列幂等规则恰一次提交，恢复资格不把结算写入改成带尝试栅栏。

- **按 `ResponseId` 判重**：`ResponseId` 在「已出门」时定下（S-8）；所有结算方按 S-68～S-70 使用同一业务身份和等价键。先读只是准备，唯一性由整批提交点判重兑现；读得响应后须认回它的完整原批，不能把任意撞键当成功。**先提交的合法完整批赢**，其余结算方保留其原值且不另写消息、账或响应。S-49 对相同／不同处置的返回仍分别遵守其 ⑦。

- **撤除时的结算在一处做完，次序固定**：中止这次发出 → 按首 token 规则定收场 → 写下响应体（或交回调用方）→ 释放这次发出占的资源。**不把这几步分散到几处由各自的清理去做**——那几处之间没有次序保证，账可能在连接关掉之后才被想起来。
- **带回复的那一次，本能力按 S-75 交回共享未处分值、不自己写响应体**（`complete`、`truncated`，以及有内容的中断）：调用进入 `reply_pending`（[S-6](#s-6-调用的状态)），收场已定。**收口只有两条路**（`data.model-response/v8#S-3`）：
  - 回复过了「消息落盘之前」、**落盘成了消息**（`replyDisposition = persisted`）⇒ **调用方**把这条响应体与回复消息**同一提交**写下（`data.messages/v6#S-9`：一次回复只有一份权威内容；[S-38](#s-38-装配给的保证-vs-协议须给的保证) 第一行）；
  - 回复**被否决**或**本来就被系统拿去用**（`vetoed`、`consumed`）⇒ 调用方经 [S-49](#s-49-settlereply) 把处置交回，**本能力**以那个 `replyDisposition` 写下这条响应体（主线裁定，见 [D-060 §五 K36](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)）。
  **其余已能确定收场的各条**（故障、没有回复的中断）由本能力在返回之前写下；上文锚点未知分支先返回 `unavailable`，不以一个可能违反 S-16 的响应体代替未结算事实。
- **交回之后调用方没有收口**（它在收口之前就结束了）：本能力**不替它写成 `persisted`**——那要一条消息，而消息归调用方。兜底只有两个：宿主停止时的撤除（[S-36](#s-36-宿主停止与撤除)：写成没有回复的 `interrupted{run_cancelled}`，已交付的块进 `delivered`）、进程丢失之后下一次对账（[S-33](#s-33-reconcile)「已开口、无响应体」那一行）。
  **收口入口**：调用方收口、宿主停止、下一次对账，先发生者承担尝试收口或保留未完成责任；第一次触发不保证提交成功，实际进展依 S-71 的全部前提。loop 在结束这一步之前收口仍是它的义务（[G-11](#十二已知缺口)），不能以保留 owner 代替实际执行收口。
- **结算写入不受尝试栅栏拒收**：按 S-69 在实际提交点，原发出尝试已被新尝试取代或原 Run 已终结时，属于它的响应体与账仍以 `unfenced + tailEquals` **整批写下**，标为晚到（响应体上 `late: true`，`data.model-response/v8#S-35`，只在属于某个运行的调用上；账上同一标记，`data.call-accounts/v2#S-39`）——栅栏挡的是「旧尝试继续推 loop」，**不是「旧尝试花掉的钱」**（[PF-012 §6.17 I-11](../../../../product/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式)）。
- **账**：每条响应体恰一份账；拿不到记 `unknown`，不记零（`data.call-accounts/v2#S-19`、`#S-20`）。**追补时，同次发出已有可用的真实用量、费用照实保留，只有拿不到的事实按原规则记 unknown**；事实来源须是原执行 owner 持有、已沿既有传输/归一化边界确认且归属这次发出的真实结果，或已认回的同次完整耐久响应批，不接受任意调用方声称、目录估算或当前请求值冒充实际。原完整批已经存在时原值优先，按既有规则认回；本条不授权改写既有响应、修补账目或重新查上游。这笔账**归哪次尝试、哪个运行、哪个租户、谁发起，由承载它的条目壳给**（`data.call-accounts/v2#S-25`），本能力写条目时照实给出。

### S-18 成因按来源分类；三类事实由守卫兑现

**一次发出失败时，成因按失败的来源分类**（[§6.11](../../../../product/PF-013-model-profiles-and-invocation/design.md#611-成因在这个边界上分类不丢进外层按异常形态分)）。八个成因的名字与所属类归 `data.loop-extension/v6#S-17`。

| 来源 | 成因 | 进不进响应体 |
|---|---|---|
| **出门前检查**（[S-28](#s-28-opencall)、[S-29](#s-29-dispatch)），**含传输适配在「已出门」之前的规划拒绝**（S-29 ④：模态送不出即 `modality_mismatch`） | `withdrawn` · `scope_disallowed` · `modality_mismatch` · `credential_unavailable`（没配，或保管方判解不出值） | **不进**：没有发出（`data.model-response/v8#S-16`）；记调用终结 `undispatched{cause}` |
| **传输本地**：请求**已出门**、还没到上游，本进程这一侧就失败了（适配层自身错误、请求序列化失败、本地资源耗尽）。**规划拒绝不在这一行**：它在「已出门」之前，这次发出没有出门（S-29 ④） | **`unrecognized`**，并把本地错误留痕 | 进（这次发出已出门） |
| **连不上、超时、上游在首 token 之前断流** | `upstream_unavailable` | 进 |
| **上游返回的状态码**：HTTP 层失败的状态码；或首 token 之前、流已开始之后的带内错误的 `code`（`inBand: true`） | 按具名参数 **`status_cause_table`**：一张状态码 → 成因的表，只映射到 `credential_unavailable`（配了而上游拒绝）、`request_rejected`、`upstream_unavailable` 三者之一；**表里没有的状态码 ⇒ `unrecognized`**。带内 `code` 查同一张表——**有前提**：上游带内错误的 `code` 与 HTTP 状态是同一套码（未取证，[G-5](#十二已知缺口)） | 进；状态码原样带着，带内的另带 `inBand: true` |
| **首 token 之前、流已开始，带内错误没有整数 `code`**（`code` 缺席或不是整数） | **`unrecognized`**——没有码可查表，上一行用不上；不拿 HTTP 的成功状态或别的数顶上（主线裁定，D-060 §八 N-42） | 进；**不带状态码**，留痕是上游给的错误原文 `upstreamError`（`data.model-response/v8#S-15`「`unrecognized` 必带留痕」） |
| **首 token 之后的任何故障**（断流、超时、上游在流里回了带内错误） | **`interrupted_mid_reply`**，优先于上面各行 | 进；有带内错误时它的整数 `code` 作状态码、标 `inBand: true`，没有整数 `code` 时不带状态码、留 `upstreamError`；断流、超时没有状态码 |
| **上游正常收尾、却一样内容都没有** | `upstream_unavailable`（空回复归策略那一类，[判据例一](../../../../product/PF-013-model-profiles-and-invocation/design.md#判据怎么用三个例子)） | 进 |

- **首内容等待超时按来源事实分支**：已写「已出门」但仍在本地排队、尚未触达上游，取本地 `unrecognized`，记录本地阶段；已触达上游之后沿上游超时行。触达事实未知时不得猜成已触达，取 `unrecognized` 并记录来源未知。没有「已出门」且没有发送的拒绝或取消不产生响应体。此规则消除 S-18 的笼统「超时」与 S-21 本地排队一支的冲突。

- **本地故障不报成「上游给不出」**：传输本地那一行归 `unrecognized`——报成 `upstream_unavailable`，重试件会拿一个本地 bug 去换家、退避，一遍遍试尽。
- **`unrecognized` 必带留痕**：状态码、上游错误原文或本地错误三者至少其一（`data.model-response/v8#S-15`）。
- **`status_cause_table` 的具体内容不在本契约**（[G-5](#十二已知缺口)）；本契约只约束它：每个状态码至多映射一个成因、只映射到上面三者、不得映射到只在出门前判出的 `withdrawn`、`scope_disallowed`、`modality_mismatch`（`credential_unavailable` 两处都有：出门前是「没配、解不出」，这里是「配了而上游拒绝」）。
- **有两行按成因的定义定下**（主线裁定，[D-060 §八 N-40](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ④；`data.loop-extension/v6#S-17` 按「谁能让它不再发生」分）：**`402`（余额不足）⇒ `credential_unavailable`**——配了，而上游不收这把凭据背后的账户，能让它不再发生的是管理员；**`403`（输入被内容审核拦下）⇒ `request_rejected`**——这次请求本身上游不接受，agent 改写内容再来。两行的前提是 OpenRouter 对这两个码的含义如括号所写（未取证，[G-5](#十二已知缺口)）。

**三类事实由发出守卫兑现，不由重试件的策略兑现**（[S-30](#s-30-dispatchagain)）：成因属于「发不出去」「重试没用」「已经开口」的，任何 `retry` 结论都不生效。**默认重试件怎样写都改不了这一条**，换成自定义件也一样。

### S-19 凭据每次发出现取，取值只交给传输适配

- **每一次发出之前，以发起租户与有效模型的来源现取凭据**（`capability.model-profile-directory/v5#S-20` 取值问法）：**发起租户有自己那一把就用它**，不论档案是官方的、组织层建的还是他自己建的；
  **否则只有官方档案取出厂格那一把**（部署装配配了时）；**自建档案不落到出厂格那一把**，没有就是没有可用的凭据
  （[PF-013 §5.6](../../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上)、[§6.2](../../../../product/PF-013-model-profiles-and-invocation/design.md#62-凭据挂在范围上档案自己不存)；decisions P33、P34）。**组织那一层不持有凭据**，取用里没有它。
  **不缓存到下一次发出**：凭据轮换零通知，下一次发出就用新值。
- **来源取自这次调用绑定的有效模型引用的 `origin`**（[S-7](#s-7-一次调用绑定了什么)），**不另填、不替它换**：带错了，自建档案就会用上部署那一把、钱记到部署头上。
- **取值只交给传输适配**，由它放进这一次请求；**不进任何记录、任何结论、任何事件、任何失败说明**，也不进档案快照。
- **账上分记两件事**：这一次用的是**哪个范围**的凭据（响应体 `route.credentialScope`，`data.model-response/v8#S-9`；也随「已出门」记下）、**发起者**是谁——**由承载这条响应体的条目壳上的租户身份给出**，不在响应体上另记（`data.call-accounts/v2#S-25`、`#S-38`；响应体上的 `initiator` 只指中断发起方，`data.model-response/v8#S-12`）。**用量记在凭据所在的范围头上，成本算到发起它的租户头上**——两件事都要，缺一个都会算错；两者只在走出厂格那一把时分叉（用租户自己那一把时那一格就是发起租户），出厂格那一把是唯一分叉点（`data.call-accounts/v2#S-38`）。
- **取不到**：没有可用的凭据、或保管方判解不出 ⇒ 这一次不发，首次发出写 `undispatched{credential_unavailable}`，续接或再发写 `released{cause: credential_unavailable}`（[S-29](#s-29-dispatch) ⑧）；租户那一格或保管方够不着 ⇒ `unavailable`，**不改用出厂格那一把或别的范围的凭据**。

### S-20 写入之前脱敏

**本能力写下的任何记录都不含凭据**（`data.model-response/v8#S-21` 把规则交给本契约）：

1. **已知值替换**：这一次发出用过的凭据值，在上游错误原文、上游响应头、原始响应留存与本地错误留痕里**任何一处出现都替换掉**；它的片段按具名参数 **`credential_fragment_min_length`** 定：不短于这个长度的任何子串同样替换。
2. **凭据类头剥除**：上游响应头里名字属于具名参数 **`credential_header_names`** 的头，整条剥除。
3. **形态识别**：具名参数 **`credential_patterns`** 列出的凭据形态，在上面几处出现同样替换。
4. **内部标识**：本系统的会话标识不送往上游（[S-38](#s-38-装配给的保证-vs-协议须给的保证) 传输适配义务），也就不会从上游原文回流。

- **脱敏在写入之前**：响应体写下即不变（`data.model-response/v8#S-22`），事后清理做不到。原始响应体存进附件存储之前同样过一遍（`data.content-blocks/v3#S-21` 的 `AttachmentRef` 指向的是脱敏之后的那一份）。
- **脱敏之后仍叫「原样」**：除去凭据之外不翻译、不摘要。
- 三个具名参数的取值不在本契约（[G-6](#十二已知缺口)）。

S-58 交给调用者的 `rawHeaders` 已按上述原规则处理，S-54 与完整响应写方继续承担同一秘密保护边界。处理后的头值才沿 `data.model-response/v8#S-20` 保留；类型合法或只读不证明已经脱敏。本轮不新增头名处理策略或任何脱敏默认值。

### S-21 两个时限是运行时设置项

| 具名参数 | 含义 | 超了算什么 |
|---|---|---|
| **`first_token_wait_limit`** | 一次发出出门之后，等首 token 的上限 | 首 token 之前的故障，`upstream_unavailable`——**只在请求已到达上游（传输已发出）时成立**；传输交回 `local{queued}`（排队没拿到连接、对上游零请求）时按 [S-18](#s-18-成因按来源分类三类事实由守卫兑现)「传输本地」那一行收 `unrecognized`，留本地错误（主线裁定 [D-060 §八 N-43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)） |
| **`post_first_token_stall_limit`** | 首 token 之后，两次内容之间最长的停滞 | `interrupted_mid_reply` |

- **它们是运行时设置项**，挂在 Agent 定义上、按设置那一套求值（[PF-013 §6.17](../../../../product/PF-013-model-profiles-and-invocation/design.md#617-本-topic-不出现任何时限数值)）；**不是档案属性，也不在重试件的配置里**。时长的表示取 `data.tool-definition/v3#S-14`。
- **两个项名是规格层给的名字**：PF-002 的设置项清单里还没有它们；它们在那一类资产的推出规则里怎样声明、默认值由谁给，在 [G-9](#十二已知缺口)。
- **本候选的当前读取路径**：每次 S-29 发出之前（含 S-30 再发），按 S-66 读取同会话的当前完整输入并真实调用 AE4 evaluate，从这次结果取得两个正有限 Duration。缺任一项、非法值、源不可读、租户不一致或输入无法判为同一时刻有效，均 `unavailable`、零 HTTP、不写新「已出门」或响应体、调用保持原状态。不得用已提交历史 E、上次值、固定宿主配置或声明外默认值顶替。读取当前 model 不改变已经打开调用的 S-7 绑定；本次求值只为该次发出的两个时限。声明域仍由 AE4 S-45 所消费的 data.agent-definition/v1 唯一拥有。G-9 的当前输入提供者、runtime 与验收装配共同承担真实生产者证据。
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

> **与 `data.model-response/v8#S-23` 第 2 条一致**：那一条允许「故障、策略类、没开口」与「首 token 之前失联、被追补为 `interrupted{runtime_lost}`」两种之后再发（续接同一次调用是主线裁定，见 [D-060 §S16 S16-g](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)）。

### S-51 模型侧到达装配前提的承诺

**本能力是模型一侧的到达装配宿主**：[`capability.stream-assembly/v3#S-28`](../../stream-assembly/v3/contract.md#s-28-宿主要兑现的前提) 要宿主兑现的前提，本能力逐条承诺如下（编号与那边相同；第 3 条只对工具侧，第 5 条已不是宿主前提；主线裁定，见 [D-060 §六 L6](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)）。**生产者是传输适配**：它交来的到达事件是「增量」。

1. **路由**：一次发出恰一份装配状态，目标 `{ kind: model_call, callId, dispatch }`（`data.arrival-events/v2#S-5`），在这次发出出网时以 [`start`](../../stream-assembly/v3/contract.md#s-18-start开一份状态) 开；传输适配交来的事件按它所属的那次发出交给那一份。**路由键是（会话，目标）**：本能力同时承载多个会话，`callId` 只在会话内唯一（[S-5](#s-5-一次调用一次发出)）、目标本身不带会话，只按目标路由会让两个会话里相同的 `callId` 撞到一份状态上（主线裁定，见 [D-060 §七 M16](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）。**这次发出收场之后不再开新状态**：此后到达的事件丢弃，**不交给同一次调用的下一次发出**——续接、再发各是新的一次发出、新的一份状态（[S-22](#s-22-同一次调用的发出序列)）。
2. **串行**：同一份状态按传输适配交出事件的次序逐个 [`accept`](../../stream-assembly/v3/contract.md#s-19-accept接一个事件)，每次用上一次交出的新状态，**一份状态不分叉**。
4. **砍了要说**：传输适配若合并、截短或限额，每一次都以 `trim` 交给同一份状态，截短的那个 `trim` 紧挨在被截短的那个增量之前交；**`accept` 拒掉的每个增量，本能力紧接着（交下一个事件之前）以一个 `reason: rejected` 的 `trim` 说出来，只说一次**；本能力自己发的 `trim`、`finish` 被拒不补 `rejected`（那是本能力的缺陷）；这两种与收场之后到达的事件（第 1 条）都不进状态；**每一件，本能力记一条结构化日志事件**（`capability.stream-assembly/v3#S-26` 末条要宿主让它看得见；[SYS-OBSERVABILITY](../../../../foundation/observability-and-logging/requirements.md#sys-observability全链路可观测与日志完备).C3 要拒绝有可定位的记录）：**不进会话日志**、不成为六种记录之一；**必带**会话、`callId`、目标（含 `dispatch`）、**被拒的值**——`accept` 交回的那个失败值（`capability.stream-assembly/v3#S-23`），收场之后到达、不再交给任何状态的事件记 `event_after_finish`（同一条的第一行：状态已收尾又来一个事件；不再交给 `accept` 而记这个值是**本契约推导**）。主线裁定，见 [D-060 §七 M16](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)（载体是 JSONL 的运行日志；事件取什么名字归提供者设计，本契约不命名）。响应体写下即不变，不往上补。传输适配节不节流、阈值多少是部署政策，本契约不定。
6. **结束一条流**：
   - 上游正常收尾、写到上限 ⇒ 交 `finish`（`end`／`max_tokens`）；
   - **用户**叫停——直接叫停、插队顺带、用户取消这次运行时宿主先调的那次 `interrupt`（[S-31](#s-31-interrupt)）——⇒ 交 `finish { reason: interrupted }`；
   - 上游出错、断流、超时（[S-18](#s-18-成因按来源分类三类事实由守卫兑现)、[S-21](#s-21-两个时限是运行时设置项)）⇒ 交 `finish { reason: lost, error }`；
   - **「已开口」确知未提交**（[S-15](#s-15-两个锚点先写后行) 末条）⇒ 这次发出就此中止，交 `finish { reason: lost, error: { cause: unrecognized } }`（主线裁定，见 [D-060 §七 M15](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）——收场是首 token 之前的故障、成因 `unrecognized`、留痕本地错误（[S-16](#s-16-首-token-判据)），不是 `interrupted`；回执未知则先停止可见内容和原流，按 S-17/S-33 隔离恢复，流的局部结束不构成耐久响应体已可结算的证明；
   - 传输适配失去连续性而没给 `finish` ⇒ 调 [`abandon`](../../stream-assembly/v3/contract.md#s-22-abandon放弃)（说得出成因就带上）；
   - **宿主停止**（系统发起的运行取消：会话归档、宿主停止，[S-36](#s-36-宿主停止与撤除)）与**本能力自身被撤除或替换**时还在途的流 ⇒ **一律调 `abandon`、不带缘由**，流结局 `lost`；这次发出的收场仍是 `interrupted{run_cancelled}`，不是故障、没有回复（`data.model-response/v8#S-5` 第三处例外；主线裁定，见 [D-060 §七 M12](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）——撤下不是有意停下，**不交 `finish{ interrupted }`**。

   **不让一份状态永远不收尾**；进程没了时状态随之没了，不经本能力，由下一次对账追补（[S-33](#s-33-reconcile)）。
7. **包消息与记账**：收场时对那份状态 [`closeOut`](../../stream-assembly/v3/contract.md#s-21-closeout收尾结算)（放弃的那几支由 `abandon` 交出同一个形状的结果），交出的块按 `data.messages/v6#S-10` 包成一条 `AssistantMessage`（交回调用方，[S-17](#s-17-结算一处按序幂等先到者赢)），或不成消息、已交付的块进响应体的 `delivered`（`data.model-response/v8#S-13`）。**「已开口」确知未提交那一支例外**：交出的块没交给过任何观察者，**不进 `delivered`**，响应体也不带 `firstTokenAt`（[S-16](#s-16-首-token-判据)；D-060 §七 M15）。回执未知或取消后迟到提交按 S-17 先隔离；未交付的块仍不进 `delivered`，但不能从未交付推出耐久 `firstTokenAt` 缺席。
   交出的账进这次发出的那一条响应体，**恰一次**——响应体按 `ResponseId` 判重（[S-17](#s-17-结算一处按序幂等先到者赢)）：`usage`、`cost` 原样；**`trims` 换写**——一次也没砍（汇总各项都是 `0`）时响应体的 `trims` **缺席**，否则原样写进（`capability.stream-assembly/v3#S-13`：两种写法指同一件事；照抄一份全零的汇总在响应体那边不合形状；主线裁定，见 [D-060 §七 M24](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）。
8. **首个内容的时刻**：在 `accept` 交出的状态里第一次看到 `firstContentAt` 时，**先写「已开口」、再把那个内容推给任何观察者**（[S-15](#s-15-两个锚点先写后行)、[S-16](#s-16-首-token-判据)）；「已开口」写不进，内容不交出（[S-15](#s-15-两个锚点先写后行) 末条）。
9. **快照与增量衔接**：给观察者（交付面、会话出站流）的快照取自 [`snapshot`](../../stream-assembly/v3/contract.md#s-20-snapshot读快照)、带位置；此后推给它的只有被接受的事件，与快照数的是同一串；**被拒的事件不推给观察者**；**只推给这次调用所在会话的观察者**（D-060 §七 M16）。**「已开口」写下之前交出的快照不含内容**——第 8 条约束「推给」，快照是观察者来拉，同一个锚点同样约束它（[S-15](#s-15-两个锚点先写后行)）。

**不做逆转写**：`ModelRequest.tools` 与传输适配交来的工具调用块里的 `tool`，都是**模型面名字**（`data.tool-definition/v3#S-6` 的 `ModelToolName`，`:` 转写成 `__`）；本能力与传输适配**原样进、原样出**，不把它转回工具定义的名字——逆转写只在工具执行运行时起执行者之前做（主线裁定，见 [D-060 §五 K10](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)、§六 L6）。传输适配须兑现的那一半在 [S-38](#s-38-装配给的保证-vs-协议须给的保证) 第 11 条。

- **做不到会怎样**写在那边（`capability.stream-assembly/v3#S-29`）：状态分叉，一支的片段静默丢失；被拒的增量不说，「砍了要说」落空、同一个增量被计两次；一次发出的迟到片段拼进下一次发出的回复；内容先被看见、「已开口」后写，停机之后重发出两份回复。
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
`releaseCall` 是主线裁定的名字（见 [D-060 §S16 S16-a](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)）；`canDispatchAgain` 是主线裁定的名字（见 [D-060 §五 K22](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)）；`settleReply` 由规格层给出、主线接受（见 [D-060 §六 N-9](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)）。
**指认一次调用的操作一律同时收 `session`**（[S-5](#s-5-一次调用一次发出)）：身份参数，没有默认值；⑥ 里 `callNotFound` 先于其余判定值判——这个 `callId` 不是这个会话的，就不再往下判它处在什么状态。

### S-24 legalTargets

先按 S-66 固定会话租户并取得当前求值输入/结果；不可读或求值失败即 unavailable。合法目标仍严格按 S-11 的三条件计算，model 缺项不等于失败，也不变成第四项过滤条件；不得拿历史求值值集冒充当前输入。

| # | 内容 |
|---|---|
| ① | `session` |
| ② | 无额外授权（见 [S-23](#s-23-这一节每个操作写全九件事) 共同口径） |
| ③ | 无 |
| ④ | 只读，无提交；**每次现算**，每个输入现读 |
| ⑤ | `LegalTargetSet`：一组 `RouteName`（`data.model-profile/v6#S-2`），按 [S-11](#s-11-合法目标集合) 的式子；**次序没有含义** |
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

**给出 [S-10](#s-10-有效模型四步每步来源可查) 第 1、2、2′ 步的结果**——loop 据它填 `ModelRequest.target`（`data.loop-extension/v6#S-15`），交给「调模型之前」的拓展件。

| # | 内容 |
|---|---|
| ① | `session` |
| ② | 无额外授权 |
| ③ | 无 |
| ④ | 只读，无提交；每次现算 |
| ⑤ | `{ routeName: RouteName, profile: ModelProfileRef, selectedBy: session | layer_lock, selected: RouteName }`——`selected` 是第 1 步的选中模型（名字），`routeName` 是第 2 步之后的名字，`profile` 是它在第 2′ 步落到的那一行。**`selectedBy = layer_lock` 当且仅当第 2 步有一格上锁**，不论锁定的名字与 `selected` 相同与否（`data.model-response/v8#S-10`）；`routeName` 与 `selected` 不同只可能因为锁。**不判合法**：落点可能已下架或这个范围不允许，出门前检查才挡（[S-10](#s-10-有效模型四步每步来源可查) 第 4 步）。loop 把 `routeName` 填进 `ModelRequest.target`，并把整份 ⑤ 原样带给 [S-28](#s-28-opencall) ① 的 `basis` |
| ⑥ | `invalidInput` · `profileNotFound` · `unavailable` |
| ⑦ | 只读，天然可重复 |
| ⑧ | 会话日志、层级求值、链上档案读不到 ⇒ `unavailable`；**不回退到设置初值或上一次用过的**。第 2 步之后的名字在链上没有任何一行 ⇒ `profileNotFound`，不自造一个落点 |
| ⑨ | 不发 |

### S-27 selectModel

**用户的切换命令：把会话的选中模型换成一个合法目标——一个路由名。**

| # | 内容 |
|---|---|
| ① | `session`；`routeName: RouteName`（切到的名字，`data.model-profile/v6#S-2`；不是某一行的引用） |
| ② | **只由交付面的切换命令调用**——agent 与拓展件没有这条路（`data.loop-extension/v6#S-24`）。发命令的就是会话持有的那个租户：入口层已核身份、会话打开时已核归属（[S-23](#s-23-这一节每个操作写全九件事) 共同口径）；**「谁切的」从承载那条记录的条目壳读**（`data.messages/v6#S-49`），本操作不另收一个租户身份 |
| ③ | 无 |
| ④ | **单次提交**：判 `routeName` ∈ 合法目标 → 写下模型切换的记录（`model_selection_changed`，记这个名字，`data.messages/v6#S-49`）。**判定与写入不在同一提交**：其间目标变得不合法（被撤回、会话里新进来一张没人转的图），由[§6.9](../../../../product/PF-013-model-profiles-and-invocation/design.md#69-合法目标算不出来时不替用户改选)兜住——下一次请求发不出去、上交、不替用户改选。**这是有意接受的窗口** |
| ⑤ | `{ selected: routeName }`。**生效点是下一次 `effectiveModel`**，在途调用不受影响（[S-7](#s-7-一次调用绑定了什么)） |
| ⑥ | `invalidInput` · `unavailable` · `profileNotFound` · `notLegalTarget{because}` |
| ⑦ | **先判合法，再判重复**：`routeName` 是合法目标、且等于当前选中模型（逐码点）⇒ 不写新记录，返回同一个 ⑤。**不合法的当前选中不因「与当前相同」而成功**——重选一个已下架的当前选中得 `notLegalTarget{because: [withdrawn]}`（[S-44](#s-44-已下架的档案)） |
| ⑧ | 合法目标算不出来 ⇒ `unavailable`，本次不追加；追加**确知未提交** ⇒ `unavailable`，本次没有产生切换，不保证其他命令没有改变选中模型。追加**回执未知** ⇒ `unavailable`，本次结果未确认，不能承诺仍选旧模型；当前选中按 S-9 的权威耐久记录读取，读不到仍 unavailable。读到某个选中值不等于认定本次未知命令已提交；旧写者尚可能继续追加时，缺席读不能关闭未知责任（SL3 S-22）。本条不承诺命令恰一次、自动重放或回滚 |
| ⑨ | 不发（那条记录在日志里，读日志的人看得到） |

**合法目标不得拒绝**（[§6.5](../../../../product/PF-013-model-profiles-and-invocation/design.md#65-切换是用户的直接命令合法目标不得拒绝)）：`routeName` 在合法目标里，本操作**只可能**因 `unavailable` 失败。
**不合法的不以「被拒」出现在交付面**：交付面只把合法目标做成可选项；本失败值是接口层的，不是给用户看的一次「切换被拒」。

### S-28 openCall

**打开一次调用：绑定有效模型、档案快照与参数，过出门前检查。**

**v6 增量前置**：S-74 的完整 cap/上游事实校验在取得完整档案后、建立可发出绑定前完成；最终实际表示仍在每次 dispatch 的 plan 中检查。

**v3 增量前置**：新调用的 basis 必须来自 S-10/S-66 本次只读求值，不从已提交历史 E 或固定配置合成；effectiveModel 之后到 openCall 之间的选择窗口沿原 ④，不重新判旧 basis 为过期。宿主以 S-61 的显式生命周期输入交入；配置观察者时按 S-62 验归属与界限，错误在联网前拒绝。新调用按 S-53 取得快照指向的精确适配引用；续接先从「已出门」恢复绑定，再请求同一精确版本。缺少实现时 `unavailable`、不写调用终结、不替换最新版本；配置形状错误沿 `invalidInput`。其余十三操作的状态判定次序保持。

| # | 内容 |
|---|---|
| ① | **`ModelCallRequest`**：`callId?`（缺席 = 打开一次**新**调用，由本能力产生；给出 = **续接**一次处于 `resumable` 的调用）、`run`、`attempt`、`session`、`messages`（组装出来、这一次要发的消息）、`target`（**恒在**：过完「调模型之前」瀑布的那个路由名，`data.model-profile` 的 `RouteName`，`data.loop-extension/v6#S-15`）、`targetChangedBy?`（有拓展件经 `select_model` 改过 `target` 才给：改它的那件拓展件的能力标识，`data.content-blocks` 的 `CapabilityId`）、`basis`（loop 填 `ModelRequest.target` 时用的那份 [`effectiveModel`](#s-26-effectivemodel) ⑤，原样带来）、`parameters?`（这一次对档案 `parameters` 的逐项覆盖；缺席 = 不覆盖）、`tools`（这一次带给模型的工具条目，每项是那个条目的**模型面名字**——`data.tool-definition` v3 的 `ModelToolName`（[S-6](../../../data/tool-definition/v3/contract.md#s-6-模型面只有一个条目)），可以是空数组、不重复；**名字到条目由本能力解析**：按名字经会话资产注册表的 `lookup` 在 `tool` 类里取（`capability.asset-registry/v3#S-25`）——属于某个 Run 的调用在交来的 `report` 所依的快照里取（`within = run{report}`），不属于任何 Run 的在当前快照里取（`within = session`）；**取到「没有」⇒ `invalidInput{unknownTool}`**，读不到 ⇒ ⑧；主线裁定，[D-060 §八 N-42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）、`report?`（这一次执行尝试的可用性报告，`capability.asset-registry/v3#S-11`；**属于某个 Run 的调用必带**，就是 `capability.loop-extension-runner/v3#S-21` ① 里 `admission.report` 的同一份；不属于任何 Run 的调用不带。它不是 `ModelRequest` 的成员，与 `run`、`attempt`、`basis` 同属本请求的外层；主线裁定，D-060 §八 N-43）；外加**宿主**与**会话日志的追加入口**。**`target`、`parameters`、`messages`、`tools` 与 `data.loop-extension/v6#S-15` 的 `ModelRequest` 同名成员逐字相同**（主线裁定，见 [D-060 §S16 S16-c](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)；`tools` 取模型面名字是主线裁定，见 [D-060 §五 K10](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)）。**`run` 与 `attempt` 同时出现或同时缺席**：同时缺席是调用方的显式陈述「这次调用不属于任何 Run」（[S-5](#s-5-一次调用一次发出)），不是默认值 |
| ② | 宿主不在停止中；`session` 存在；续接时 `callId` 属于这个 `session` 且处于 `resumable` |
| ③ | **有**：`target` 不能由本操作以外的路径改——`parameters` 里出现目标、`messages` 之外塞进换模型的指示，一律 `invalidInput`（`data.loop-extension/v6#S-15`：`target` 只经 `select_model`）；**没有 `targetChangedBy` 时 `target` 必须等于 `basis.routeName`**，否则 `invalidInput`——目标变了却说不出是谁改的。**`report` 与 `run` 同在同缺**：带 `run` 而缺 `report`、或不带 `run` 而带了 `report` ⇒ `invalidInput`；带了的必须是**这个会话、这个运行、这一次尝试**的那一份（三者都核，与 `capability.loop-extension-runner/v3#S-21` ① 核 `admission.report` 同一口径），不是即 `invalidInput`——本能力不替这一次尝试现算一份，也不认别的尝试的那一份 |
| ④ | **新调用**：**用交来的 `target`，不重算选中模型**——拓展件看到、并据以改写参数的就是这个名字；`basis` 求出之后才落下的模型切换，从下一次 `effectiveModel` 起生效（[S-27](#s-27-selectmodel) ⑤）。把 `target` 经 [S-10](#s-10-有效模型四步每步来源可查) 第 2′ 步**此刻**解析为一行 → 读档案 → 合并参数 → **出门前检查**（下表）→ 绑定（[S-7](#s-7-一次调用绑定了什么)；`selectedBy` = 有 `targetChangedBy` 时 `{ extension: targetChangedBy }`，否则 `basis.selectedBy`）。**检查不过**：写一条调用终结记录 `undispatched{cause}`，这次调用即在终态 `handed_up`。**检查通过**：不写任何记录——一次还没出门的调用，停机之后不留痕迹、也没有要追补的东西。**续接**：重新绑定宿主与追加入口，**绑定从最近一次发出的「已出门」记录读**（[S-7](#s-7-一次调用绑定了什么)），不重读档案、不重做目录准入检查；每次新发送仍须按 S-74 对新 messages/tools 的最终计划重新计量，历史快照缺必要上限时不能借当前目录补齐；交来的 `target`、`parameters`、`basis` 在续接时不用。工具条目按这一次交来的 `tools` 与 `report` 重取（`within` 同上）；取到「没有」⇒ `invalidInput{unknownTool}`，报告所依的快照取不回 ⇒ `unavailable`（`capability.asset-registry/v3#S-25` ⑧） |
| ⑤ | `{ callId, state: open | resumable }`，或 `{ callId, state: handed_up, undispatched: cause }` |
| ⑥ | `invalidInput` · `callNotFound` · `runtimeStopped` · `wrongPhase` · `unavailable` · `profileNotFound` |
| ⑦ | **新调用不幂等**：同一份请求打开两次是两次调用、两个 `callId`——**防重归调用方**（loop 在同一步只打开一次）。**续接可重复**：已在 `resumable` 且已重新绑定到同一宿主 ⇒ 返回同样的 ⑤ |
| ⑧ | 目录、会话日志、允许集合、投影、保管方、会话资产注册表任一读不到 ⇒ `unavailable`，**不写任何记录**、不打开调用（**不列层级求值**：④ 用交来的 `target`、不重算，层级求值已在 `basis` 那一次 `effectiveModel` 里做过；主线裁定 [D-060 §八 N-39](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）——「判不出来」不记成 `undispatched`。`target` 那个名字在链上没有任何一行 ⇒ `profileNotFound`（接口错误：调用方交来一个这条链上从未有过的名字） |
| ⑨ | 不发 |

**出门前检查**（核的是**有效模型**——名字这一次落到的那一行，[PF-013 §6.9](../../../../product/PF-013-model-profiles-and-invocation/design.md#69-合法目标算不出来时不替用户改选)「出门之前核的是有效模型」；依次核，第一个不过的即成因。前两行只在没有胜出行时不过，那时落点就是已撤回或这个范围不允许的那一行，[S-10](#s-10-有效模型四步每步来源可查)）：

| 次序 | 检查 | 不过即 |
|---|---|---|
| 1 | 档案在册 | `withdrawn` |
| 2 | 这个范围允许它 | `scope_disallowed` |
| 3 | `compatible(档案, 投影)`；**另核可发出的前置**：投影 ⊆ 本据点传输能承载的模态（[S-11](#s-11-合法目标集合) 末段） | `modality_mismatch`（两样不过都归它：都是「会话里的模态这一次送不到这个模型」） |
| 4 | 凭据：以发起租户与有效模型的来源问「有没有」 | `credential_unavailable` |
| 5 | 合并后的参数过 `data.model-profile/v6#S-24`（含输出上限） | **不是成因**：`invalidInput{reason}`——覆盖不合法是调用方交来的输入错，不是一次上交 |
| 6 | `messages` 交得给传输：不含 `ToolInternalMessage`（`data.messages/v6#S-36`）；每一个工具调用块都有它那一条工具消息（一问一答，`data.messages/v6#S-32`） | **不是成因**：`invalidInput{reason}`——与第 5 行同理，是调用方交来的请求组错了（[G-21](#十二已知缺口)） |

- **传输适配的规划拒绝也归这张表**（主线裁定，[D-060 §八 N-40](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ④）：[S-29](#s-29-dispatch) ④ 在写「已出门」之前请传输适配把线上请求组好，它原有的三种拒绝为——**模态送不出、有调用没结果、`ToolInternalMessage` 混进请求**——就是第 3、6 行在传输那一侧的同一判定。规划消费这一次实际交入的消息、工具定义与已绑定档案快照；续接允许新的 messages/tools/report，必须重新规划。**到了发出那一步规划仍拒**，按此前耐久「已出门」数量分支：数量为 0 时，模态送不出仍写调用终结 `undispatched{modality_mismatch}`，另两种仍为 `invalidInput{reason}`；已有任一次已出门时，模态送不出为 `invalidInput{reason: modality_mismatch}`，另两种沿原 `invalidInput{reason}`，三者均不新增 send、响应体或终结记录，保持原 `resumable`/`awaiting_decision` 状态。调用者可修正输入再试或显式 releaseCall；不能把既有历史发出抹成 undispatched，也不能造 released{cause:modality_mismatch}。
- **检查的是这一刻**：拓展件改过的 `target` 若在它核完之后变得不合法，这里照样挡下。
- **`undispatched` 的调用没有响应体**（`data.model-response/v8#S-16`）；上交条目由 loop 写（[S-3](#s-3-本契约明确不承诺什么)）。

### S-29 dispatch

本条实际响应提交与未完成责任另遵守 S-69～S-72；原九项未受影响的承诺保持。

**发出一次：首次发出，或续接之后的再发。**

**v3 增量约束**：在每次发出之前先按 S-66 读当前输入并纯求值，按 S-21 取得两个时限；失败保持原调用状态、零发送，不从该次求值改选已绑定模型。规划和发送都消费 S-53 取得的同一绑定；「已出门」与返回体内快照保留完整 `adaptation`。同一进程内不得在两次发出之间重新选版本；恢复后只有日志中的精确版本可再次取得。实现不可用时 `unavailable`，这一次零发送、不写新的「已出门」、不改变既有响应体或调用状态。

| # | 内容 |
|---|---|
| ① | `session`；`callId`；这次发出落在哪一次尝试（调用属于某个 Run 时必给） |
| ② | 调用处于 `open` 或 `resumable`；宿主不在停止中 |
| ③ | **有**：调用里任何一次发出开过口 ⇒ 不发（`retryRefused{already_spoke}`）——跨尝试同样成立 |
| ④ | **提交点是「已出门」**：按 S-66/S-21 取得当前两个时限 → 取凭据 → 传输适配为这一次**组好线上请求**、定下改值与丢项、完成 S-74 输入计量并固定最终计划（规划）→ 写「已出门」（带 `ResponseId`、那一家、这次调用的绑定与那两项，[S-8](#s-8-调用在会话日志里留下的六种记录)）→ 请求出网，**发出的就是「已出门」还原得出的那一组**（[S-7](#s-7-一次调用绑定了什么)），出网之后不再改。首次发出取档案快照里的第一家；续接取失联那次的那一家。**开口时**写「已开口」再交出内容（[S-15](#s-15-两个锚点先写后行)）。**收场时**按 [S-17](#s-17-结算一处按序幂等先到者赢) 结算。<br>**规划拒绝 ⇒ 不出门**：不写新「已出门」、不出网、没有新响应体。历史已出门数量为 0 时，模态送不出写调用终结 `undispatched{modality_mismatch}`、返回 `{ undispatched }`，另两种为 `invalidInput{reason}`。已有任一次已出门时，续接的新 messages/tools/report 重新规划，任一三类拒绝均为输入错误：模态一支 `invalidInput{reason: modality_mismatch}`，工具两支沿原 `invalidInput{reason}`；保留原 `resumable`/`awaiting_decision` 状态，不写新终结记录，调用者可修正输入后再试或 releaseCall。同进程 dispatchAgain 只有实际规划输入及精确实现未变时才可推出相同规划；不能全局声称规划拒绝仅能发生于首次发出 |
| ⑤ | **正常结果等到这次发出收场才返回**；S-17 锚点未知的隔离分支返回 `unavailable`、不返回响应体。其余按 S-75 分别返回这次发出的未处分值或已写下的[模型响应体](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-response--模型响应体--model-response)（`data.model-response` 形状），并说明它**由谁写**：<br>• `outcome ∈ { complete, truncated }`，或 `interrupted` 且有回复 ⇒ **交回 MR8 的未处分值，未写**：全部响应事实保留，禁止预填 replyDisposition 或提交时 late；调用进入 `reply_pending`，由调用方收口（[S-17](#s-17-结算一处按序幂等先到者赢)）；`reply` 是一条 `AssistantMessage`，`ending` 与收场一一对应（`data.messages/v6#S-10`）<br>• `failed`，或 `interrupted` 且没有内容 ⇒ **已写**：本能力在返回之前写下。`failed` 时调用进入 `awaiting_decision`，返回里带「调模型之后」失败那一维的主体所需的事实（`data.loop-extension/v6#S-14`：档案快照、这次调用已有的「已出门」、S-76 的完整 retryConclusions、成因、原样状态码与它的 `inBand` 标记）——**重试件只凭那份主体下结论**；按 LC6 S-14 保留 model-profile/v5 快照及 messages/v6 的完整已出门记录和 adaptation，不删绑定以迁就旧 LC3。纯重试件不自行读响应体序列；由主体生产者按 S-76 从权威历史构造 LC6 新历史字段，缺失或不能唯一解释时 unavailable |
| ⑥ | `invalidInput` · `callNotFound` · `alreadyEnded` · `retryRefused{already_spoke}` · `wrongPhase` · `runtimeStopped` · `unavailable` |
| ⑦ | **不幂等**：每一次成功调用都是一次新的发出。重复调用由状态挡住：第一次调用让调用离开 `open`／`resumable`，第二次得 `wrongPhase` |
| ⑧ | 凭据取不到（按 [S-19](#s-19-凭据每次发出现取取值只交给传输适配) 没有可用的那一把）⇒ **首次发出**：不写「已出门」，写调用终结 `undispatched{credential_unavailable}`（这次调用一次也没发出），返回 `{ undispatched }`；**续接的再发**：同样不出门，写调用终结 **`released{cause: credential_unavailable}`**——这次调用此前已有发出，不是 `undispatched`（`data.messages/v6#S-50`；主线裁定，见 [D-060 §五 K21](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)），调用进入 `handed_up`、上交照常。发出前保管方、追加口够不着 ⇒ `unavailable`，**不出门**、调用停在原状态；已出门之后的「已开口」追加回执未知按 S-17 隔离，不能视作尚未出门。取不到时限设置 ⇒ `unavailable`（[S-21](#s-21-两个时限是运行时设置项)） |
| ⑨ | 不发 |

- **首 token 之后出了故障**：`failed{interrupted_mid_reply}`，已交付的块进 `delivered`（没长完的工具调用照 `data.content-blocks/v3#S-13`），**不成为消息**；调用进入 `awaiting_decision`，但它**不会再有发出**（[S-30](#s-30-dispatchagain) 守卫），loop 只能放手。
- **传输层不得在一次发出之内隐藏重试**（`data.model-response/v8#S-24`）：重试只能是下一次 `dispatchAgain`。

### S-30 dispatchAgain

本条实际响应提交与未完成责任另遵守 S-69～S-72；原九项未受影响的承诺保持。

**loop 读到一条 `retry { plan }` 之后，照计划在同一次调用下再发一次。**

| # | 内容 |
|---|---|
| ① | `session`；`callId`；`plan: { provider, after? }`（`data.loop-extension/v6#S-27`）；这次发出落在哪一次尝试 |
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
| 3 | `provider_not_allowed` | `plan.provider` 不在档案快照「允许的供应商」里；或快照说不允许回退而 `plan.provider` 不是第一家 | `data.loop-extension/v6#S-27`；[S-22](#s-22-同一次调用的发出序列) 第 5 条 |

- **`plan` 里出现 `provider`、`after` 之外的成员**（比如一个目标）⇒ `invalidInput`：**换模型不是 `retry` 能做的**，那是用户的切换命令（`data.loop-extension/v6#S-27`）。
- **被拒的 `retry` 怎样记下**，归 `capability.loop-extension-runner`（按它对可改写件的报错处置）；本操作只如实返回 `why`。
- **已终结的调用只有一个值**：调用已在终态 ⇒ `alreadyEnded`，排在 `retryRefused` 之前判（主线裁定，见 [D-060 §S16 S16-b](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)）。
- **`already_spoke` 与状态检查的次序**：`already_spoke` 排在 `wrongPhase` 之前判——一次开过口、尚未终结的调用，无论此刻处在什么状态，调用方拿到的都是「开过口」这个事实。

### S-31 interrupt

本条实际响应提交与未完成责任另遵守 S-69～S-72；原九项未受影响的承诺保持。

**单独中断这一次调用，不动别的。**

| # | 内容 |
|---|---|
| ① | `session`；`callId`；`initiator ∈ { user, run_cancelled }`。**经本操作的 `run_cancelled` 只出自用户取消这次运行**——那样收尾的回复落成 `interrupted_by_user`（`data.messages/v6#S-10`）；**系统发起的运行取消**（会话归档、宿主停止）不经本操作，走 [S-36](#s-36-宿主停止与撤除) 的撤除：在途的流被放弃、没有回复（[D-060 §七 M12](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)；只出自用户这一读法是**本契约推导**：本操作分不出运行是谁取消的，而系统发起的若落成回复就是冒称用户） |
| ② | 调用不在终态、也不在 `reply_pending`（收场已定，[S-6](#s-6-调用的状态)）。**`runtime_lost` 不是本操作的取值**——它只由对账写下（[S-33](#s-33-reconcile)） |
| ③ | **只作用于这一个 `callId`**：不动同一会话里别的调用、不动正在跑的工具执行、不终结 Run（[§5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#单独控制中断这一次调用不动别的)） |
| ④ | **提交点是「中断意图」**：先写中断意图 → 再发中止信号 → 结算（[S-17](#s-17-结算一处按序幂等先到者赢)）。**本操作在中断意图写下之后即返回**，不等结算完成 |
| ⑤ | **中断落在哪个阶段**：`before_dispatch`（`open`、`awaiting_decision`、`resumable`：没有在途发出，写调用终结 `interrupted{initiator}`，没有响应体）· `in_flight`（没开口：这次发出以 `interrupted`、无回复收场，本能力写响应体）· `speaking`（开了口：以 `interrupted`、带已交付内容作回复收场，交回 `dispatch` 的调用方，调用进入 `reply_pending`、照 [S-17](#s-17-结算一处按序幂等先到者赢) 收口） |
| ⑥ | `invalidInput` · `callNotFound` · `alreadyEnded` · `unavailable` |
| ⑦ | **幂等**：已有中断意图、尚未结算 ⇒ 不写第二条，返回同一个 ⑤。**先到者赢**：这次发出在中止信号到达之前已经收场（完成或失败），那个收场成立——调用已在终态或 `reply_pending` 时本操作得 `alreadyEnded`；已在 `awaiting_decision` 时按 `before_dispatch` 结束调用 |
| ⑧ | 中断意图写不进 ⇒ `unavailable`，**不发中止信号**——不写意图就中止，停机之后对账会把这次调用当成「失联」而再发一次，用户叫停的东西又跑了起来 |
| ⑨ | 不发 |

- **被中断不是故障**：不带成因、不经「调模型之后」失败那一维、不是上交（[还有一种没走完](../../../../product/PF-013-model-profiles-and-invocation/design.md#还有一种没走完它不在这张表里)）。响应体上 `interrupted` 带 `initiator`（`data.model-response/v8#S-12`）。
- **中断提醒由 loop 补**（`data.messages/v6#S-21`）；本契约不写它。

### S-32 releaseCall

**loop 决定不再试：让一次处于 `awaiting_decision` 或 `resumable` 的调用以上交收场。**

| # | 内容 |
|---|---|
| ① | `session`；`callId` |
| ② | 调用处于 `awaiting_decision` 或 `resumable` |
| ③ | 无 |
| ④ | **单次提交**：写调用终结 `released`（`data.messages/v6#S-50`），**不带 `cause`**——从 `awaiting_decision` 放手时最近一次发出的成因由它的响应体给出，不另记；从 `resumable` 放手时最近一次是失联补写的 `interrupted{runtime_lost}`，**不是故障、没有成因可带**（上交条目带什么归 loop，[G-17](#十二已知缺口)）。`cause` 只在续接或再发时取不到凭据那一支出现（[S-29](#s-29-dispatch) ⑧） |
| ⑤ | `{ callId, state: handed_up }` |
| ⑥ | `invalidInput` · `callNotFound` · `alreadyEnded` · `wrongPhase` · `unavailable` |
| ⑦ | 已是 `handed_up` ⇒ `alreadyEnded`（终态吸收，不区分「是我放的手」） |
| ⑧ | 调用终结追加未确认 ⇒ `unavailable`；确知未提交只说明本次未产生终结。回执未知时，本实例保留未确认处理责任，不能断言日志中尚无终结或调用仍可再发。权威状态沿 S-6/S-14 读取；旧写者未停，缺席读不关闭未知。若已认回 handed_up，重复调用仍按 ⑦ alreadyEnded；读回不可判仍 unavailable，不新增状态 |
| ⑨ | 不发 |

- **`resumable` 也可以放手**：新的一次尝试里 loop 可能判定这次调用不必再续（比如这一步已经不需要它）。
- **上交条目由 loop 写**；本操作只结束调用。

### S-33 reconcile

本条实际响应提交与未完成责任另遵守 S-69～S-72；原九项未受影响的承诺保持。

**新的一次尝试开始、进方程之前，对这个会话里没收场的调用逐个对账**（[PF-012 先对账，再进方程](../../../../product/PF-012-agent-loop-and-run/design.md#先对账再进方程)）。

**v3 增量约束**：对账只需读取已保存绑定，不要求旧适配实现仍可加载；实现缺失不阻止追补事实。追补的完整绑定来自「已出门」，缓存读取与写入按已持久事实填写，拿不到的仍为未知；不执行缓存探测、不重发、也不调用新版本重新规划。对账成功返回 `resumable` 不承诺精确实现可用，后续续接/发出会独立得到 `unavailable`。

**恢复时序**：先确认 S-17 的实际停止、同会话权威完整前缀及 durable dispatched 责任。已存在的完整响应批按原值认回；必须追补时，有同次真实 `sentAt` 就保留，否则按 MR8 S-17 写 null。没有任何已接受耐久字段能从「已出门」推得实际交给传输时刻，不能以该锚点或恢复时刻代填。`firstTokenAt` 仍只按权威「已开口」有无及其时刻；`endedAt` 是本层确认失去连续性的时刻。null 不影响既有行优先级、resumable 判据或时序不变量，不提供单独重发资格。本操作零次 HTTP，不为核实实际发送或用量发请求；账与已知事实沿原条款，不从 null 推出费用为零。

**锚点回执未知的恢复**：S-17 的隔离调用同样留给本操作的既有两种时机，不增加恢复入口。应用对账表之前须满足 S-17 的全部旧网络/门回调/追加及结算写者实际停止、有效栅栏或唯一重新承载、权威完整读回条件；栅栏只关闭旧 fenced 推进，不证明旧 unfenced 写者停止；沿 `capability.session-log/v3#S-19`、`#S-22`、`#S-23`，不能拿旧尾的空结果或 `attemptSuperseded` 本身断定先前没有提交。读回有「已开口」时按它的时刻填写 `firstTokenAt`，即使从未有内容可见，也不得写无首 token 的失败响应体；读回确无「已开口」才使用表中无首 token 的分支。已有中断意图仍优先；无中断意图时分别落「已开口、无响应体」或「已出门、无已开口、无响应体」两行。条件不齐或读回不可判时继续 `unavailable`、未结算、不交内容、不发送。只有对账实际成功得到 `resumable` 后，调用方才可按 S-29 另行续接；不是收到函数结果就获得再发许可。

| # | 内容 |
|---|---|
| ① | `session`；`attempt?`：新的这一次尝试——由会话重新承载触发时缺席（见 ②） |
| ② | **两个调用时机，都由调用方保证**：① 这个会话的**新尝试开始之后、loop 推进之前**（带 `attempt`）；② 会话在据点上**重新承载之后**（停机重启、迁到别的宿主）、**会话级的任何调用打开之前**（不带 `attempt`）——**不属于任何 Run 的调用**没有「新的一次尝试」来触发对账，由这一时机收口（**规格层推导**；谁在什么时候调它归会话生命周期那一侧，[G-11](#十二已知缺口)；[PF-015 rev13 会话睡一觉醒来](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#第一件会话睡一觉醒来还得是原来那个)）。两个时机对账的是同一张表、同一批调用，先到的那一次做完，后到的按 ⑦ 是空操作。同一会话同一时刻只有一副协程在推它（PF-012） |
| ③ | **有**：对账**从不发出**——它只追补结算、给出状态；再发由 loop 调 `dispatch` |
| ④ | 对每一次没收场的调用，按它**最后一次发出**在日志里的样子（下表）追补；**每一行各自一次提交**，按 `ResponseId` 幂等（[S-17](#s-17-结算一处按序幂等先到者赢)）。**追补的响应体的路由留痕取自那次发出的「已出门」记录**（有效模型引用、档案快照、`selectedBy`、`credentialScope`，[S-7](#s-7-一次调用绑定了什么)）——不重读档案、不自造；**参数三项同样从它读**（主线裁定，见 [D-060 §六 L4](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)；原 G-18 闭合）：`parameterAdjustments`、`droppedParameters` 原样取那条记录上的（缺席照缺席，缺席即断言没改、没丢，`data.model-response/v8#S-11` 第 3 条），`route.parameters` 取那条记录还原得出的同次固定最终发送计划的适配结果（真实 send 时必须与实际一致；锚点后零 send 或发送不可判的 interrupted 分支仍原样还原，不以参数存在宣称已发送）（[S-7](#s-7-一次调用绑定了什么)）——**不拿合并之后的那一组冒充实际发出的**；那次发出属于某个运行、以 S-69 同次完整前缀与提交点条件判明原发出尝试已被取代或原 Run 已终结的，带 `late: true`（`data.model-response/v8#S-35`：**只写在带 `runId` 的调用上**，不属于任何运行的调用的那一条不带） |
| ⑤ | 每一次被对账的调用一条 `{ callId, state }`，`state ∈ { resumable, awaiting_decision, interrupted, complete, handed_up }` |
| ⑥ | `invalidInput` · `unavailable` |
| ⑦ | **幂等**：再对一次，已追补的不再追补，返回同样的结果 |
| ⑧ | 会话日志读不到、追补写不进 ⇒ `unavailable`，**不返回部分结果**——loop 不得在对账没完成时推进 |
| ⑨ | 不发 |

**真实事实保留规则**：追补表各分支的 usage/cost 均沿 S-17：只有没有可用真实事实的部分才是 unknown；若原执行已经实际停止、但原 owner 仍持有经既有传输/归一化边界确认属于同次发出的实际值，必须保留。已知零照实记零，未知不补零；sentAt:null 不能把已知事实覆盖成 unknown。同次已保留 rawHeaders 继续沿 S-17 的原值规则。任意 caller 提供的声称不构成该来源，不能通过传入数字绕过既有来源与归属核实。不新增事实采信入口、补账政策或 HTTP 重查；现有完整批存在时仍只认回其原值。

**对账表**（按行从上到下，第一行命中即是）：

| 日志里这次调用 | 追补 | 调用随之 |
|---|---|---|
| 有**中断意图**，最后一次发出已出门、无响应体 | 响应体：`interrupted`，`initiator` 取意图上的那个；首 token 有无取「已开口」有无；账按本条真实事实保留规则；**没有回复**（在途内容不在日志里） | `interrupted`（终态） |
| 有**中断意图**，没有在途发出（含一次都还没发出、只打开过的调用） | 调用终结 `interrupted`，`initiator` 取意图上的那个 | `interrupted`（终态） |
| 已出门，**无**已开口，无响应体 | 响应体：`interrupted{runtime_lost}`，**没有首 token**，账按本条真实事实保留规则 | **`resumable`**：loop 在新尝试里以同一个 `callId` 续接、发给同一家 |
| 已开口，无响应体 | 响应体：`interrupted{runtime_lost}`，首 token 取自「已开口」，账按本条真实事实保留规则；**已交付内容可以缺席**（在途组装不进日志） | `interrupted`（终态）；**不重发**；中断提醒由 loop 补 |
| 最后一次发出有响应体，`failed`，没有调用终结 | 无 | `awaiting_decision`：loop 重新走「调模型之后」失败那一维 |
| 最后一次发出有响应体，`interrupted{runtime_lost}`、没有首 token，没有调用终结 | 无（上一次对账已追补，续接之前又停了） | `resumable` |
| 其余（已在终态） | 无 | 原终态 |

- **「首 token 之后停机」收成被中断（`interrupted{runtime_lost}`），与 [PF-013 §5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token)「记下的原因是运行时失联」、PF-012 先对账那一行「算说到一半断了、绝不再发」说的是同一件事**（主线裁定，见 [D-060 §S16 S16-g](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)）。**都不重发**。
- **已开口的那半句可能不在日志里**：在途组装不进日志，停机时它就没了——这时[「用户看见了的，日志里必须有」](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有)不成立，以中断提醒兜底（[PF-012 先对账](../../../../product/PF-012-agent-loop-and-run/design.md#先对账再进方程)那一行「追补中断提醒」）。**这是已知的、写明的例外**，不是本契约静默放弃。
- **一次还没出门、也没有中断意图的调用不在对账范围内**：它没留下任何记录（[S-28](#s-28-opencall) ④）；新尝试从方程重新算，会不会再打开一次新调用归 loop。**有中断意图的，哪怕一次都没发出，也按第二行写调用终结**——意图是一条耐久记录，用户叫停过的调用要有终态。
- **交回之后调用方尚未确认收口就停了的那一次**（`reply_pending`，[S-17](#s-17-结算一处按序幂等先到者赢)）：权威读回确为「已开口、无响应体」才落在第四行——回复本身随进程没了，按失联追补。若处置已提交但回执丢失，则认回完整原批并按实际记录判状态，不能从本地 reply_pending 推出响应缺席。

### S-34 readAttempts

| # | 内容 |
|---|---|
| ① | `session`；`callId` |
| ② | 无额外授权 |
| ③ | 无 |
| ④ | 只读，无提交；日志里已有记录的调用，从同一份合法完整会话前缀判状态、每次发出及⑤的 failureSubject，不拼接不同尾的响应/结论。不读取凭据、不发送、不追加记录 |
| ⑤ | 这次调用的状态，与它的每一次发出：序号、所在尝试、那一家、两个锚点有无、响应体（已写下的）。**当且仅当该前缀中 state = awaiting_decision 且最近一次实际响应为 failed，另必带 `failureSubject`**：按 S-76 构造完整 `data.loop-extension/v6#S-14/#S-43` 的 AfterModelCallFailureSubject，failure/statusCode/inBand 取该响应，profile/dispatches 与全部 retryConclusions 取同一前缀中的本调用事实；必要输入不可确定走⑧，不返回缺主体的部分成功。其他 state 不附 failureSubject。**刚打开、还没发出的调用**（`open`）在日志里没有任何记录：本能力手里有它 ⇒ `{ state: open, dispatches: [] }`——它此刻只存在于本能力手里，这是唯一一处以在途状态作答，停机之后它就不在了（[S-28](#s-28-opencall) ④）；手里也没有 ⇒ `callNotFound` |
| ⑥ | `invalidInput` · `callNotFound` · `unavailable` |
| ⑦ | 只读，天然可重复；来源恢复后可再调本操作取得完整 failureSubject，不重写已提交失败响应、不生成新结论、不消费重试名额。结果只代表所读完整前缀：并发新结论或新发出可能令后续读取变化；不得把本次结果当持续授权，随后 dispatchAgain 仍独立核当时状态、原守卫及尝试栅栏 |
| ⑧ | 日志读不到，或⑤应有主体但无法取得/确认同一完整前缀中的响应、绑定、发出与全部结论来源 ⇒ `unavailable`，整次读取不返回部分成功、不默认空历史；来源恢复后沿⑦重取。**日志里有记录的调用不以本能力手里的在途状态代答**——那份状态停机即失 |
| ⑨ | 不发 |

### S-49 settleReply

本条实际响应提交与未完成责任另遵守 S-69～S-72；原九项未受影响的承诺保持。

**调用方交回一份回复的处置：它被否决了，或本来就被系统拿去用了——本能力以这个处置写下那条响应体。**（服务面名由规格层给出、主线接受，见 [D-060 §六 N-9](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)；「被否决、被系统使用的那一条由本能力写」是主线裁定，见 [D-060 §五 K36](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)。）

| # | 内容 |
|---|---|
| ① | `session`；`callId`；`disposition`：`{ vetoed: { by, reason? } }` 或 `{ consumed: { by } }`——`data.model-response/v8#S-14` 的 `replyDisposition` 里除 `persisted` 之外的两支，成员与取值照那一条 |
| ② | 调用处于 `reply_pending`（[S-6](#s-6-调用的状态)）；调用方是收到那份交回的一方（本版由装配给，[S-38](#s-38-装配给的保证-vs-协议须给的保证)） |
| ③ | **有**：`disposition` 是 `persisted` 或缺席 ⇒ `invalidInput`——落盘成了消息的那一条只能由调用方与消息同一提交写（[S-17](#s-17-结算一处按序幂等先到者赢)），本能力写不出那条消息 |
| ④ | **单次提交**：按 S-75 从交回的未处分值和显式 `disposition` 构造完整 MR8 响应体，再按 S-69 确定 late 后写下，按 `ResponseId` 幂等（[S-17](#s-17-结算一处按序幂等先到者赢)）；调用进入交回时已定的终态（`complete`，或带回复被中断的 `interrupted`）。**不改收场、不改 `reply`**：否决不改写收场（`data.model-response/v8#S-14`） |
| ⑤ | `{ callId, state }` |
| ⑥ | `invalidInput` · `callNotFound` · `alreadyEnded` · `wrongPhase` · `unavailable` |
| ⑦ | **幂等**：那条响应体已以同一个处置写下 ⇒ 返回同一个 ⑤；已以别的处置写下（含调用方已写成 `persisted`）⇒ `alreadyEnded` |
| ⑧ | 写入未确认 ⇒ `unavailable`，本实例保留 `reply_pending` 的未确认处理责任，**不改既定收场**；这不保证日志里尚无响应或耐久终态。权威认回完整原批后沿 ⑦ 返回。调用方可以再调一次，但未知前提未闭合不得据此再次追加（S-70）；不能把本地待确认状态当成持久写入已回滚 |
| ⑨ | 不发 |

- **被否决不是调用失败**：这次调用照常结束、记下被谁否决；不交给重试挂件，要再试是 loop 另起一次新的模型调用（[PF-012 否决按产生者分三路](../../../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前的否决按消息是谁产生的分三路)、`data.model-response/v8#S-23` 第 4 条）。
- **账照记**：被否决、被系统使用的那一份回复花的钱与落盘成消息的一样记在这条响应体上。

### S-50 canDispatchAgain

**只读地判一条 `retry { plan }` 此刻能不能照做**——拓展件执行器在把一条 `retry` 结论落日志之前用它判合法（`capability.loop-extension-runner` v3（accepted，D-076） S-14），**不必先发出再判，也不自己复刻一份守卫表**。（主线裁定，见 [D-060 §五 K22](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)；收 `plan` 是规格层推导：守卫 3 要看它。）

| # | 内容 |
|---|---|
| ① | `session`；`callId`；`plan: { provider, after? }`（`data.loop-extension/v6#S-27`）——守卫 3 要看 `plan.provider`，所以计划是输入的一部分 |
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
本契约是其系统能力标识的唯一拥有者；精确标识与声明定位见 [S-67](#s-67-默认重试件的能力标识)，runner 据该标识识别，不自行另取名。

**本版 S-76 的 retryConclusions 是第 3、4 条的必需显式输入**；不以发出数或供应商集合大小代替本件已给出的次数。

**它的重试行为：**

1. **只对策略那一类出手**：最近一次发出的成因是 `upstream_unavailable` 或 `unrecognized` 时才考虑再试；其余一律不给 `retry`（给了也会被守卫拒——它不去试）。
2. **逐家一遍**：按档案快照「允许的供应商」的次序，**下一家**是最近一次发出那一家之后的那一家；**每一家至多一次**。
3. **不允许回退时同家至多再试一次**：档案快照说不允许回退 ⇒ 给一次 `retry { provider: 第一家 }`，此后不再给（主线裁定，见 [D-060 §S16 S16-g](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)：保住「开箱就有重试」）。
4. **退避**：`after` 由具名参数 **`default_retry_backoff`** 算出——它是这件重试件的**可配置策略**（[PF-013 §6.17](../../../../product/PF-013-model-profiles-and-invocation/design.md#617-本-topic-不出现任何时限数值)「退避等多久」一行；[D-063 R-6](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)：不写死），成员恰五个：`kind`（`constant`／`linear`／`exponential`）、`base`、`factor`、`max`、`jitter`（`none`／`full`／`half`／`decorrelated`）。`kind` 定无抖动的等待随「这是本次调用里它给出的第几个 `retry`」怎样长（`constant` 恒为 `base`，`linear` 每次加 `base`，`exponential` 每次乘 `factor`），**封顶 `max`**；`jitter` 定在那个值上怎样取随机，`none` 即取那个值。**次数不是它的成员**：由第 2、3 条（允许的供应商个数与回退声明）推出；**哪些失败才再试**也不是——第 1 条定死。默认初值归配置层（[D-060 §八 N-36](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 记下的那一组），本契约不填（原 G-8 闭合）。
5. **没有下一家 ⇒ 不再试**（试尽），交回，loop 上交。

- **试尽的判定**：默认件在有限步内必判「不再试」——允许回退时每家至多一次、家数有限；不允许回退时同家至多一次再试。**自定义件不承诺这一点**（[S-3](#s-3-本契约明确不承诺什么)）。
- **续接不经过它**：首 token 之前失联之后的续接是 [S-33](#s-33-reconcile) 与 [S-29](#s-29-dispatch) 的事，不是一次重试，不占「每家至多一次」的名额。
- **它挂了**：按 `capability.loop-extension-runner` 的系统自带件不可用处置——由装配预先声明的指定挂件顶上，效果是一律不重试、这一层试尽上交（`capability.loop-extension-runner/v3#S-17`（D-076 已接受的关门义务）；[PF-012 系统自带的几件，不可用时各有定法](../../../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件不可用时各有定法)）；本契约只写：**它不在时，调用不会被自动再发**。

> **不允许回退的档案也有一次重试**：[PF-013 §5.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#系统自带一件默认的所以开箱就有重试) 担心的「一次网络抖动就打断一轮对话」在这类档案上由同家那一次再试兜住；退避按第 4 条的策略算（原 G-8 已闭合）。

---

## 六、宿主停止与撤除

### S-36 宿主停止与撤除

本条实际响应提交与未完成责任另遵守 S-69～S-72；原九项未受影响的承诺保持。

**锚点后尚未发送**：宿主停止确认本次 durable dispatched 而独立函数返回 cancelledBeforeSend 时，按 S-17 结算 interrupted 责任，实际时刻不可用就写 `sentAt:null`；没有锚点则仍只沿无在途调用分支。已经开始 send 且真实时刻可用时保留原时刻，不因撤除改成 null。

**正常已知收场与隔离例外**：本条下述直接写 `interrupted{run_cancelled}` 的规则，以锚点结果已确知、满足 S-17 结算前提为条件。系统停止或撤除遇到 S-15/S-16/S-17 的锚点回执未知分支时，先保持隔离，沿 S-33 的既有时机恢复；本条系统停止本身不追加 S-31 的耐久中断意图。恢复时若没有已持久中断意图、也没有响应体，读回无「已开口」则按 S-33 追补 `interrupted{runtime_lost}`、进入 `resumable`；读回有「已开口」则追补 `interrupted{runtime_lost}`、`firstTokenAt` 取该锚点，调用进入 `interrupted` 且不重发。有真实中断意图时仍按 S-33 意图优先。不能将内存里知道的系统停止原因视为跨失联已保存，也不为保留该原因新增记录或阻止无「已开口」分支的既有恢复。

**一次调用跟着它的宿主停**（[PF-012 §6.13](../../../../product/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走)）：宿主（agent runtime）停下时，挂在它上面的每一次没收场的调用都被结算。

- **宿主进入停止之后**，`openCall`、`dispatch`、`dispatchAgain` 一律 `runtimeStopped`；`interrupt`、`releaseCall`、`settleReply`、`readAttempts`、`canDispatchAgain` 照常。
- **结算**：对每一次在途发出，按 [S-17](#s-17-结算一处按序幂等先到者赢) 在一处做完——中止 → **对它的装配状态 [`abandon`](../../stream-assembly/v3/contract.md#s-22-abandon放弃)、不带缘由**（流结局 `lost`，[S-51](#s-51-模型侧到达装配前提的承诺) 第 6 条）→ 收场 `interrupted`、`initiator = run_cancelled`、**不是故障、没有回复**，已交付的块进 `delivered`（`data.model-response/v8#S-5` 第三处例外、`#S-13`「开了口、没有回复」那一行）→ 写下响应体 → 释放。**宿主停止是系统发起的运行取消，不是有意停下**：不交 `finish{interrupted}`、不产出回复，那半截回复不成为消息（`data.messages/v6#S-10`；主线裁定，见 [D-060 §七 M12](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）。没有在途发出的调用写调用终结 `interrupted{initiator: run_cancelled}`（`data.messages/v6#S-50` 那一支必带发起方）。
- **有内容的那一次**：**用户取消这次运行时**，宿主**先**对它调 `interrupt(run_cancelled)`、让 `dispatch` 的调用方把回复收口（[S-31](#s-31-interrupt)、[S-17](#s-17-结算一处按序幂等先到者赢)；回复落成 `interrupted_by_user`），**再**停止——这是用户发起那一路，**这条次序是宿主的义务**（[G-11](#十二已知缺口)）。系统发起的停止、宿主没这样做就停了、或交回的回复还在 `reply_pending`、调用方没来得及收口——本能力的撤除只写一条**没有回复**的 `interrupted{run_cancelled}`，已交付的块进 `delivered`；在途的流按上一条放弃，已在 `reply_pending` 的那一次流已收尾、不再放弃。
- **进程崩溃时撤除一个都不跑**：上面这些只是加速；**权威的收口是下一次尝试的对账**（[S-33](#s-33-reconcile)）。
- **本能力自身被撤除或替换**：对它手里每一次在途调用做同样的结算——**先对在途的流 `abandon`**（流结局 `lost`），调用账仍是 `interrupted{run_cancelled}`（[D-060 §七 M12](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)；与桥换代同类）——再释放连接。**它拥有的全部耐久事实都在会话日志里**（六种记录）；手里的在途状态停机即失，**没有一条正确性依赖它**。

---

## 七、事件

### S-37 本契约不发事件

**本契约没有作为业务事实权威的通知事件，也没有控制事件。** S-62 的观察交付与 S-63 的工程诊断是显式输出端，不参与放行、不替代会话日志；其失败按各自规则可见。

- 中断、再发、放手全是直接调用的同步前置；**没有任何一次放行靠一个监听者的返回值**。
- 模型切换的记录、锚点、响应体都在会话日志里，读日志的人看得到，**不另发一份**。
- 本能力**可以消费**会话日志的追加通知来提前推进投影的中间结果——那是性能，**正确性靠读时追到日志尾**（[S-13](#s-13-模态投影读到的必须追到日志尾)）。

---

## 八、性质与前提

**编号只在本节作行标，不是可外部引用的条款号。**

### 不变量

| 性质 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|
| **每一次发出至多一条响应体** | [S-17](#s-17-结算一处按序幂等先到者赢)：按 `ResponseId` 判重、先到者赢 | 追加口按 `ResponseId` 幂等（装配给）：以它拼出的判重键，`capability.session-log/v3#S-8` | `data.model-response/v8#S-4` |
| **只有出了门的发出才有响应体** | [S-8](#s-8-调用在会话日志里留下的六种记录)：`ResponseId` 在「已出门」时定下 | —— | `data.model-response/v8#S-16` |
| **每一次出网的发出都有「已出门」** | [S-15](#s-15-两个锚点先写后行) | 追加口确认即落盘 | 规格层推导（对账表那两行判得出的前提）；[PF-012 先对账](../../../../product/PF-012-agent-loop-and-run/design.md#先对账再进方程) |
| **每一次被看见的内容都有「已开口」** | [S-15](#s-15-两个锚点先写后行) | 同上；跨进程时转发链不越过锚点 | 同上 |
| **续接与对账用的绑定就是那次调用打开时的绑定** | [S-7](#s-7-一次调用绑定了什么)、[S-33](#s-33-reconcile) ④：从「已出门」记录读 | 「已出门」带着绑定（`data.messages/v6#S-49`） | [PF-013 §6.7](../../../../product/PF-013-model-profiles-and-invocation/design.md#67-生效点收到那条事实之后下一次模型请求之前)：切换与档案改动不作用于在途调用 |
| **`interrupted_mid_reply` ⇔ 有首 token 的故障** | [S-18](#s-18-成因按来源分类三类事实由守卫兑现) | —— | [PF-013 §5.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类) |
| **发出序号跨尝试连续、不重不跳** | [S-5](#s-5-一次调用一次发出)、[S-22](#s-22-同一次调用的发出序列) | 同一次调用只有一个写入者（装配给） | `data.model-response/v8#S-8` |
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
| **一条响应体对应上游多次请求** | [S-29](#s-29-dispatch) 末条；[S-38](#s-38-装配给的保证-vs-协议须给的保证) 传输适配义务 | 传输适配关掉了所用传输库的隐藏重试与回退（依赖研究假设，[G-10](#十二已知缺口)） | `data.model-response/v8#S-24` |
| **已有发出的调用被记成「一次也没发出」** | [S-29](#s-29-dispatch) ⑧：续接或再发时取不到凭据写 `released{cause}` | —— | `data.messages/v6#S-50`：`undispatched` 只指一次也没发出 |
| **指认一次调用时串到别的会话** | [S-5](#s-5-一次调用一次发出)：指认调用的操作都收 `session`，先判归属 | `callId` 会话内唯一（`data.call-accounts/v2#S-37`） | [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) |
| **一次发出的迟到片段拼进同一调用下一次发出的回复**；**被拒的增量不说、或说两次** | [S-51](#s-51-模型侧到达装配前提的承诺) 第 1、4 条 | —— | `capability.stream-assembly/v3#S-28` 第 1、4 条 |
| **追补的响应体拿合并之后的参数冒充实际发出的** | [S-33](#s-33-reconcile) ④：参数三项从「已出门」读 | 传输适配在出网之前定下改值与丢项（[S-38](#s-38-装配给的保证-vs-协议须给的保证) 传输适配第 10 条） | `data.model-response/v8#S-11` |

### 进展性质（按所列前提与边界）

| 性质 | 上界 | 前提 | 来源 |
|---|---|---|---|
| **在所列前提成立时，每次出了门的发出最终获得一条响应体** | 结算/恢复策略允许且实际执行到的提交机会；收场、撤除、重新承载只是收口入口，不提供无条件的时间上界 | 原时限有值（S-21）、调用方履行收口职责（G-11），且 S-17/S-69～S-71 的日志可用、合法完整前缀与事实可得、未知旧写方实际停止/权威恢复等前提齐全；结算或 S-33 既有恢复**被实际调用并可执行**，策略许可的预算内有可获得的真实提交机会。只保留 owner 不保证未来获调度，第一次触发收口不等于成功；不满足时仍保留未完成义务，不虚报响应或无饥饿 | [PF-012 先对账](../../../../product/PF-012-agent-loop-and-run/design.md#先对账再进方程)；S-71 的条件进展 |
| **首 token 之前失联的调用在下一次尝试里可以续接** | 下一次尝试的对账实际完成之后 | Run 未终结、恢复起新尝试，且 S-33 的前提齐全并已成功追补/认回无首 token 的失联响应；仅触发对账不授予续接许可 | [停机之后](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token) |
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
| **回复消息与它的响应体同一提交** | 会话日志追加口支持多条目原子追加（`capability.session-log/v3#S-17` ④ 与末条） | 追加协议把两条作为一个单元接收 | 有消息无响应体：对账把已收场的调用当成失联；有响应体无消息：用户看过的回复不在日志里 |
| **追加按 `ResponseId` 幂等** | 全部结算方对同一业务身份使用跨写方各自等价的 dedupeKey 与 readKey，追加口在共同日志判重，消费者认回完整原批 | 同一业务身份、完整批认回与提交点判重的协议；至少一次投递不得落两遍 | 同一次发出两条响应体、**两笔钱** |
| **「已开口」先于内容被看见** | 同进程里先写锚点再转发 | 观察者在另一进程时，**转发链任何一跳都不越过锚点先送内容** | 停机后重发，**记录里两份回复** |
| **「已出门」先于出网** | 同进程里先写锚点再发请求 | 传输若在另一进程，出网那一方须在出网前确认锚点已落 | 发出去却没回来的那笔账消失 |
| **在册状态变化之后按新状态准入**（撤回、恢复在册） | 打开调用时现读中心目录的同一存储 | 中心 → 据点目录读的**新鲜度上界**（[G-12](#十二已知缺口)），并按写入先后单调读 | 撤回之后一段时间内仍被选中、仍被发出；或恢复之后时而发得出、时而「已下架」 |
| **凭据值只在发出时出现；来源如实** | 进程内交给传输适配；来源取自绑定的有效模型 | 秘密怎样送到据点、是否在据点落地、轮换怎样传播（[G-12](#十二已知缺口)）；取值请求带的来源随那次调用的有效模型引用一起到达、不由调用方另填（与 `capability.model-profile-directory/v5#S-22` 同一行） | 值留在不该留的地方、或轮换之后仍用旧值；或借一个假的「官方」来源让自建档案用上部署那一把 |
| **一次调用内各次发出用同一份档案快照** | 打开调用时绑定；每一次「已出门」带着它 | 续接跨进程时，绑定从日志里那条「已出门」恢复，不来自任何一方的内存 | 按旧能力准备、按新属性发出 |
| **投影 = 从日志重算** | 中间结果与日志同处，读时追补 | 中间结果必须读得到它所追的那份日志的尾 | 投影与日志对不上，合法目标算错 |
| **同一次调用只有一个写入者、发号唯一** | 一个进程、一个在途表 | 续接者须先确认所有原写入者已实际停止，带 Run 时另核共同日志有效尝试栅栏；栅栏不能替代 unfenced 写者静止 | 同号两条、两副协程各发一次 |
| **调用方身份已核实**（会话；`settleReply` 的调用方是收到交回的那一方） | **装配给**：入口层核身份、会话打开时核归属 | 在接收边界重新验证（`data.identity-values/v1#S-30`） | 任何够得着接口的一方都能以别人的会话发调用、花别人的钱 |
| **结算写入不被尝试栅栏拒收** | 追加口对结算类记录不设栅栏（结算类以 `unfenced` 追加，`capability.session-log/v3#S-10` 第 3 条） | 同 | 被关掉的尝试花掉的钱从明细里消失 |

**传输适配须兑现的十一条**（传输的选型见 D-019，实现归提供者设计；下面只写性质；第 10、11 条是修复波 1b 按 [D-060 §六 L4、L6](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加) 补的）。它们**单机也不是自动成立的**——每一条都要适配层主动做到：

| # | 义务 | 做不到会怎样 |
|---|---|---|
| 1 | **每一次发出只指定一家，并禁止上游回退**；一次发出之内不自行重试 | 一次发出之内换了家，留痕丢失，**两笔钱只记一笔** |
| 2 | **状态码按来处分两种，原样交回**：HTTP 层失败（响应头里就不是成功）⇒ 取实际 HTTP 响应的状态码；**流已开始之后的带内错误**（HTTP 已是成功、错误在流里）⇒ 取带内错误的 `code`，并标 `inBand: true`（`data.model-response/v8#S-15`；主线裁定，[D-060 §八 N-40](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ④）；**带内错误没有整数 `code` 的那一支**：不写状态码（不补 HTTP 的成功、不编一个数），把上游给的错误原文作 `upstreamError` 交回（[S-18](#s-18-成因按来源分类三类事实由守卫兑现) 表第五行；主线裁定，D-060 §八 N-42） | 成因分类与重试件看不到状态码；或把流里的 `code` 当成 HTTP 状态读、把 HTTP 的成功当成那次故障的状态码 |
| 3 | **不在中途解析工具参数**；唯一的解析点在流装配 | 同一份参数两处解析出两个结果 |
| 4 | **首 token 按 [S-16](#s-16-首-token-判据) 的判据映射**；库的「开始」事件不算 | 把没开口判成开口（关掉可以重发的窗口）或反之（重发） |
| 5 | **只用本能力交来的那一把凭据**；不回落到进程环境或任何缺省配置里的凭据 | 用错范围的凭据，账记到错的头上 |
| 6 | **不向上游送本系统的会话标识** | 内部标识外泄 |
| 7 | **不把收不下的模态静默换成占位文本**：按档案的模态声明送，或绕过那一步 | 模型「看了」一张它其实没收到的图 |
| 8 | **交回实际执行方、实际费用与费用来源** | 费用记不准；实际执行方与指定的不一致时查不出（`data.model-response` G-8） |
| 9 | **固定 base URL，拒绝重定向** | 请求连同凭据被引到别处 |
| 10 | **改值与丢项在出网之前定下**：交给本能力写进「已出门」（[S-29](#s-29-dispatch) ④），出网时照「已出门」还原得出的那一组发，出网之后不再改 | 停机之后追补的那一条响应体写不出如实的参数三项；或记下的与实际发出的对不上 |
| 11 | **不做逆转写**：请求里带的工具条目名、交回的工具调用块里的 `tool`，都是模型面名字，原样进出（[S-51](#s-51-模型侧到达装配前提的承诺) 末段） | 调用块里的名字与 `ModelRequest.tools` 对不上，放行判断逐码点比较失败；或逆转写在两处各做一次、结果不同 |

另外两条来自 `data.messages`：**我们自己那两种消息在发出前译掉、不落空不丢**（`data.messages/v6#S-35`）；**`ToolInternalMessage` 不进请求**（`data.messages/v6#S-36`）。翻译的位置在传输适配之内还是之前，归提供者设计。

---

## 十、交接、缺席与恢复

### S-39 依赖不可用、撤除与重启

- **目录、会话日志、作用域求值、投影、保管方不可用时，依赖它们的操作明确失败**（`unavailable`），不静默降级：不跳过出门前检查、不把「读不到」当「没配」「没开口」「空集」。
- **本能力拥有的全部耐久事实都在会话日志里**：六种记录（[S-8](#s-8-调用在会话日志里留下的六种记录)）。手里的在途状态只是它们的一份工作副本，**停机即失，没有一条正确性依赖它**。
- **重启之后**：没有自动行为——对账由 loop 在新尝试开始时、或会话重新承载时调用（[S-33](#s-33-reconcile) ②）；在那之前，任何一次调用都不会被发出。
- **在途的那一次发出是外部效应，不可回滚**：它可能已经计费。撤除与停机都**不假装它没发生**——它的账依 S-17 保留可用真实事实，不可得部分记 unknown，而不是被抹掉（[S-17](#s-17-结算一处按序幂等先到者赢)）。

---

## 十一、规范表达与验证义务

### S-40 本版选用哪些形式工件

| 性质 | 表达 | 为什么 |
|---|---|---|
| 一次调用 × 多次发出 × 停机 × 中断 × 宿主撤除的交错：锚点次序、守卫、结算幂等、对账 | **TLA+** [`v2/formal/Invocation.tla`](../v2/formal/Invocation.tla) ＋ [`Invocation.cfg`](../v2/formal/Invocation.cfg)，映射与前提见 [formal 入口](formal/README.md) | 这是跨提交、跨尝试、有停机的状态机：**锚点写在前还是后、意图先落还是中止先发、结算判不判重**，只有在交错里才分得出对错。**有六条性质各有一份把对应开关拧反的配置、预期出反例**——只有这六条可以说「断言能失败」；其余不变量要么被建模方式吸收（按构造成立，不作证据，证据在场景），要么只在正向配置里检查过、未证明能失败，逐条分类在 formal 入口 |
| 合法目标、展示列表（每个名字一条、主标取胜出行来源、被盖住的行作标注、按胜出行的来源取凭据）、有效模型四步（含把路由名解析为一行） | **规范场景**（[S-43](#s-43-切换先落事实后生效)～[S-45](#s-45-模态不兼容挡在算合法目标那一刻)、[S-48](#s-48-同路由名按层覆盖一个名字一条落到胜出行)）＋ [examples](examples.md) | 纯计算，没有交错 |
| 成因按来源分类、脱敏 | **规范场景**（[S-46](#s-46-成因按来源分类与脱敏)） | 分类表逐行演练；脱敏只能对真实输出核对 |
| 投影追到日志尾 | **性质测试**：任意日志前缀上，追补之后的读 = 对全日志重算；**伸缩测量**：读的代价与历史长度无关 | 「等于重算」是一条可随机化的等式 |
| 形状 | **不建 Schema**：值形状归 data 契约；本契约写的几种记录（[S-8](#s-8-调用在会话日志里留下的六种记录)）形状归 `data.messages/v6#S-49`、`#S-50`；线上形状归组合契约 | [规格入口](../../../README.md#准入门槛与停止条件) |
| 模型侧到达装配前提的承诺（[S-51](#s-51-模型侧到达装配前提的承诺)）、传输适配第 10、11 条 | **规范场景**（[S-52](#s-52-模型侧的装配宿主被拒的增量报一次收场之后的事件不进)、[S-42](#s-42-开口之后断流不重发) 参数一支） | 到达装配的交错已在 `capability.stream-assembly` 的模型里；这里要核的是本能力按次序交事件、记账、推给观察者，是对真实宿主的集成断言 |
| 精确绑定与旧实现缺失时不代换；公开函数门与取消交错（S-53～S-56） | 两份增量 **TLA+** 模型与各自正/否配置，见 [formal 入口](formal/README.md)；S-65 场景 | 旧 Invocation 未建模这些性质；模型只描述列明的有限行为，不替代真实资源与日志验证 |
| 注册/采用/撤旧、持有引用、取消/停止/释放（S-53/S-56/S-64） | 主线提供 **TLA+** Adaptation 与一正三否配置，映射见 [formal 入口](formal/README.md) | 三步独立失败、直接函数与 runtime 都持有引用；不含 HTTP、持久写与恢复，不代证真实取消响应 |
| 宿主、观察者归属/界限、诊断失败分离（S-61～S-64） | S-65 场景、真组合故障注入 | 输出端的资源上界与拒收需要真实消费者；有限模型不代证真实资源释放 |
| 当前输入的来源/一致性、配值变更无需 reload、续接新输入拒绝（S-66、S-28/S-29） | S-66 与 examples 的规范场景；真实输入提供者/会话/资产存取和零 HTTP 故障验收 | 旧有限模型均不含当前源读取或新 messages/tools，不重复运行它们冒称新性质已覆盖 |

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
**确定零写一支**：追加被确认未提交 ⇒ `unavailable`，本次没有产生切换；本场景没有其他切换，所以权威读取仍得 M1。若另一个合法命令已写 M3，则读取为 M3，不能因本次零写承诺仍是 M1。
**回执未知一支**：M2 已耐久但回执丢失 ⇒ `unavailable`；之后权威读取选中为 M2，不能报回滚为 M1，也不能把“当前选中 M2”当作本次命令恰一次认回。若旧追加仍在途，先读到 M1 不证明本次未提交或以后不会变成 M2；未知责任沿 SL3 S-22 保留。本操作不自动重放未知命令。
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
**对照一支**：另一个会话里同样一张图、**落盘之前**被转换件配上了 transcript ⇒ 投影不含 `image`，M1 是合法目标（[§5.11](../../../../product/PF-013-model-profiles-and-invocation/design.md#511-有-transcript-的块不再把任何模型挡在外面)）。**事后补不上**：已落盘的那张图不会再得到 transcript，第一个会话里 M1 一直被挡（`capability.modality-projection/v2#S-6`）。

#### S-46 成因按来源分类与脱敏

用一段已知的凭据原文 V，对下列各源各造一次失败：本地适配层抛错；连不上；上游 401；上游 400；上游 503；上游在首 token 之后在流里回带内错误 `code: 500`（HTTP 状态早已是 200）；上游返回一个表里没有的状态码。

**必须观察到**：依次是 `unrecognized`（带本地错误留痕）、`upstream_unavailable`、`credential_unavailable`、`request_rejected`、`upstream_unavailable`、`interrupted_mid_reply`（状态码 500、`inBand: true`——**不是 200**，也不是没有状态码）、`unrecognized`（状态码原样）——**状态码到成因的具体映射按 `status_cause_table` 取值，本场景只核分类来源与优先级**；
全部响应体、原始响应留存与本地错误留痕里**找不到 V**，也找不到 V 的任何不短于 `credential_fragment_min_length` 的片段。

#### S-47 用户叫停之后停机，不再发出

一次发出在途、没开口；用户 `interrupt(user)`；中断意图写下之后、中止生效之前杀掉进程。

**必须观察到**：对账按意图行追补 `interrupted`（`initiator = user`）、没有首 token；调用终结；**不是 `resumable`，不再发出**。
**绝不能观察到**：追补成 `runtime_lost` 然后续接——那是把用户叫停的东西又跑了起来。

#### S-48 同路由名按层覆盖：一个名字一条，落到胜出行

（依据：产品负责人裁定「路由名就是能力，从下往上在运行时覆盖」，[PF-013 决定](../../../../product/PF-013-model-profiles-and-invocation/decisions.md#2026-09-24--同路由名的档案并存按层从下往上覆盖)；PF-013 rev 12「设置记路由名」。）会话属于租户 T，T 没配自己那一把；部署给出厂格配了一把。有一条官方档案与 T 所在组织的组织层建的一条自建档案，**路由名同为 r**；会话选中的是 r。

**必须观察到**：
- `displayList` 里 r **只有一条**：主标是组织层那一行（胜出行），注记 `{ legal, credential_missing }`（按胜出行的来源问）；官方那一行列在它之下，带 `overridden_by{organization(O)}`，**选不了**（[S-12](#s-12-展示列表)）。`legalTargets` 里 r 一个元素。
- `effectiveModel` 给出 `routeName = r`、`profile` = 组织层那一行、`selected = r`、`selectedBy = session`；`openCall` 以 `undispatched{credential_unavailable}` 结束——**不落到官方那一行去用出厂格那一把**：缺凭据不滤（[S-10](#s-10-有效模型四步每步来源可查) 第 2′ 步；主线裁定，见 D-060 §二 S-U24-5a），这是裁决写明的代价。
- **T 配上自己那一把之后**：r 不再带 `credential_missing`；发出时 `route.profile` 是组织层那一行、`route.credentialScope` 是 T 的租户层。
- **T 在自己那层再建一条 r**：下一次 `route.profile` 是 T 租户层那一行；列表上 r 的主标换成它，组织层与官方两行列在下面、都带 `overridden_by{tenant(T)}`。
- **另跑一支（组织锁）**：组织把「用哪个模型」锁成 r——`selectedBy = layer_lock`，`profile` 仍是胜出行（锁的是名字；主线裁定，见 D-060 §二 S-U24-5b）。
- **T 把自己那层那一行撤回**：已撤回的不参与，下一次 r 落回组织层那一行；它在列表上列在 r 之下，带 `withdrawn` 与 `overridden_by{organization(O)}`。

**绝不能观察到**：r 在列表上作为两个可选项出现；被盖住的官方那一行经出厂格那一把发出；任何一条自建档案的发出用上出厂格那一把；解析改写了选中模型或写了模型切换的记录。

#### S-52 模型侧的装配宿主：被拒的增量报一次，收场之后的事件不进

（[S-51](#s-51-模型侧到达装配前提的承诺)；与 `capability.tool-execution-runtime` v2 在工具侧的那一条同形。）五支同跑；「日志里有这条事件」指本能力的结构化日志里恰有一条带齐 S-51 第 4 条四样的事件，会话日志里**没有**它（[D-060 §七 M16](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）。

- **一次发出**：传输适配交来一个文本块的开块与两段填，第二段先被截短（交来一个 `frame_too_long` 的 `trim`，紧接着截短后的那一段），那一段随即被 `accept` 拒掉；随后一个工具调用块开块、封口（`tool` 是一个模型面名字），正常收尾。一个观察者在第一段之后刷新页面。
  **必须观察到**：被拒的那一段之后、下一个事件之前，本能力恰交了一个 `rejected` 的 `trim`，那条响应体的 `trims` 里它**只按拒收计一次**（`capability.stream-assembly/v3#S-14`）；第一段内容交给观察者之前「已开口」已写下；刷新之后观察者拿到的快照带位置，此后收到的事件与快照数的是同一串，**被拒的那一段没有推给它**；**日志里有这条事件**：会话、`callId`、目标 `{ model_call, callId, dispatch: 1 }`、被拒的值是 `accept` 交回的那个失败值；回复里那个调用块的 `tool` 与 `ModelRequest.tools` 里的那一项逐码点相同（没有逆转写）；账恰记一次。**再跑一次、一段都不砍**：那条响应体**没有** `trims` 成员（不是全零的一份，`capability.stream-assembly/v3#S-13`）。
- **两次发出**：第 1 次发出在首 token 之前以策略类故障收场（`upstream_unavailable`），`dispatchAgain` 发出第 2 次；第 1 次发出迟到的一个开块这时才到。
  **必须观察到**：那个迟到的开块**没有**进第 2 次发出的状态、也没有进它的回复；**日志里有这条事件**：目标 `{ model_call, callId, dispatch: 1 }`、被拒的值 `event_after_finish`；两次发出各一份状态、各一条响应体、各一份账。
- **两个会话同一个 `callId`**：会话 `s1`、`s2` 里各有一次 `callId` 相同的调用同时在途，两边的传输适配各交来一段文本。
  **必须观察到**：两段各进自己会话那一份状态；`s1` 的观察者只收到 `s1` 那一段，`s2` 的只收到 `s2` 的（[S-51](#s-51-模型侧到达装配前提的承诺) 第 1、9 条）。
- **「已开口」确知未提交**：一次发出，`accept` 交出的状态第一次带 `firstContentAt` 时，让「已开口」的追加在提交之前被明确拒绝，并确认不会迟到提交。
  **必须观察到**：那个内容**没有**推给任何观察者，此前交出的快照也不含它；本能力对那份状态交了 `finish { reason: lost, error: { cause: unrecognized } }`；那条响应体收场是首 token 之前的故障、成因 `unrecognized`、带本地错误留痕，**不带 `firstTokenAt`、没有 `delivered`**；调用进 `awaiting_decision`；没有 `AssistantMessage`（[S-15](#s-15-两个锚点先写后行)、[S-16](#s-16-首-token-判据)；[D-060 §七 M15](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）。
- **宿主停止时在途**：一次发出已开口、交付过一段；宿主（agent runtime）停止，没有先调 `interrupt`。
  **必须观察到**：本能力对那份状态调了 `abandon`、不带缘由，**没有**交 `finish { reason: interrupted }`；那条响应体收场 `interrupted`、`initiator = run_cancelled`、不带成因、没有 `reply`，`delivered` 是交付过的那一段；没有 `AssistantMessage`。换成本能力自身被撤除，观察到的相同（[S-36](#s-36-宿主停止与撤除)；[D-060 §七 M12](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）。

**绝不能观察到**：同一个增量在 `trims` 里既算截短又算拒收；一份状态接了另一次发出的事件，或另一个会话的事件；第 2 次发出的回复里出现第 1 次的片段；一条被拒的事件只在会话日志里、或哪里都没有；「已开口」没写下而内容已被看见；宿主停止时在途的回复落成一条 `interrupted_by_user` 的消息。

---

## 独立函数、适配绑定与观察边界

### S-53 模型适配绑定的取得与保留

本条只拥有调用方必须遵守的引用与释放义务；注册、发布、撤除的提供者协议及其并发证明归主线指定的提供者。绑定的唯一值定义是 `data.model-profile/v6#S-29`～`#S-31`，本契约不复制形状。

1. `openCall` 成功返回前取得档案快照中完整 `adaptation` 指向的精确实现和模型定义；版本、配置、路由名一起校验。实现不可取得或已停止新准入 ⇒ `unavailable`；绑定或配置输入非法 ⇒ `invalidInput`。不能用已注册的另一个版本补齐。没有获得引用的调用不得进入可发出状态。
2. 同一次调用直到终态收口为止使用同一绑定；在 `awaiting_decision`、`resumable`、`reply_pending` 期间也保留引用。目录改档案、发布新版本不改变旧调用。模型定义必须对应快照路由名；配置修订在这份档案身份内解释，跨档案同名修订不能互取值。
3. 每条「已出门」的 `adaptation = profileSnapshot.adaptation`；响应体的 `route.adaptation = route.profileSnapshot.adaptation`，全部是打开时完整原值，含配置值；同一调用不同发出之间相同。跨字段校验消费 `data.messages/v6#S-49`、`data.model-response/v8#S-36`，不修补不相等的副本。禁止只记诊断中的指纹、只记实现名，或借当前目录重建旧绑定。
4. 进程失去后，对账按 S-33 恢复事实，不加载实现；下一次显式续接才尝试取得旧精确版本。不存在或不可用 ⇒ `unavailable`，不换新版本、不重写历史、不伪装成 `withdrawn`。
5. 调用正常结束或被明确取消后，在本能力负责的结算或交接已经收口、执行实际停止后释放引用，恰一次。绑定在任何可能还使用实现的回调之前不可释放。正在等待回复处置的调用由 S-17、S-36 收口；持久写失败不能冒称结算已完成。
6. 独立函数直接接受静态实现时，调用者持有资源到 `outcome` 完成；实现来自动态注册时，外包装先取得有效引用再交入，并保持到实际停止，不能绕过提供者的引用规则。函数本身不依赖注册表。

### S-54 invokeModel

**公开函数只执行一次发出，不等同于 S-5 的耐久模型调用。** 服务面与外部函数调用者共同消费它，不要求某个实现语言的基类。`ModelInvocationResult` 是本函数的未结算结果投影名，没有独立领域身份。

| # | 内容 |
|---|---|
| ① | 已解析消息；已解析模型面工具定义 `ModelToolEntry[]`（`data.tool-definition/v3#S-6`，不是工具名列表）；档案快照（含适配绑定）；这一次要求的参数与指定的一家供应商；显式 `TransportAdapter` 的 plan/send/read 构件、S-74 所需计量依据与构件及显式 tokenMargin、凭据值、成因表、脱敏参数、时钟/时限政策、取消信号；可选 `beforeFirstContent`；用于本次装配的目标标记。函数不收 `report`，不读取会话、租户、目录或持久化服务。身份与授权不得从隐藏当前上下文补齐 |
| ② | 调用者拥有所交构件与凭据的使用权并负责 S-53 第 6 条的资源寿命；所需输入齐全且表示有效。运行时服务面的会话准入与真实归属不是此函数保证 |
| ③ | 最多调用一次 send；不得自动重试、换供应商、续接、恢复、取得别的凭据或补造会话身份。系统产品装配只交 OpenRouter 传输；独立函数不从环境另选传输 |
| ④ | 无耐久提交。输入和规划确定后发送一次；首内容门按 S-55 排序；终局只决定一次，取消请求与正常结束竞争时以实际终局为准。服务面须在请求离开进程前按 S-15 写「已出门」，而且发送的必须是锚点记录对应的同一规划，不能在锚点之后换策略或改参数。函数自身没有“已落盘”的保证 |
| ⑤ | 返回一个显式句柄：`outcome`（最终结果的异步读面）、`snapshot`（S-55）、`abort`（S-56）。发出后的结果是下面的 `ModelInvocationResult`，没有自动结算。出网前的拒绝明确给出且不产生 ModelResponse |
| ⑥ | 表示错误 `invalidInput`；构件不可用 `unavailable`；规划拒绝按 S-57/S-74 的闭合分支。已发出的正常/失败/中断是 `outcome` 的业务结果，不抛成无来源的通用错误：故障按 S-18 分类，门失败是本地 `unrecognized`，调用者明确取消是 `interrupted`。不能把实现抛错吞成正常收尾 |
| ⑦ | 再调一次是另一次独立发出；没有隐式判重。句柄的最终结果只定一次；重复读取不再发请求 |
| ⑧ | 必需参数缺席即 `invalidInput`，必需政策或构件不可取得即 `unavailable`；不补默认凭据、供应商或策略。`beforeFirstContent` 缺席仅表示独立调用者未声明额外内容门，不能据此声称有耐久锚点；服务面必须交它 |
| ⑨ | 向调用者交本次流的快照、增量及诊断事实。没有全局业务事件，也没有持久记录副作用 |

**`ModelInvocationResult` 的字段账本（不是新的线上 Schema）**：

| 字段 | 唯一语义来源与条件 |
|---|---|
| `outcome` | `data.model-response/v8#S-12` 的 `ResponseOutcome` 四值 |
| `blocks` | `data.content-blocks/v3` 的内容块序列，只含已经通过内容门的结果；门失败为空。首内容后故障保存已经交付的部分，不称作回复消息 |
| `ending?` | `data.messages/v6#S-10` 的 `AssistantEnding`：可形成回复的完成/截短/显式取消分别映射 `complete` / `truncated_at_limit` / `interrupted_by_user`；故障及无内容取消缺席 |
| `failure?` | `data.model-response/v8#S-15` 的 `Failure`，当且仅当 `outcome = failed`；本地错误与来源未知保留脱敏后留痕 |
| `timing`、`usage`、`cost`、`trims?` | `data.model-response/v8#S-17`、`#S-19`、`#S-38` 与 `data.call-accounts/v2#S-6` Usage、`#S-8` Cost、`#S-15` TrimSummary；缓存读写只在 `usage.cache_read_tokens`、`usage.cache_write_tokens`，已知零与未知保留；无截短/拒收时 `trims` 缺席 |
| `routeName`、`provider`、`adaptation` | 本次要求的路由、指定供应商与已使用的完整模型适配绑定；不是档案引用或租户归属 |
| `parameters`、`parameterAdjustments?`、`droppedParameters?` | `data.model-response/v8#S-11`：实际发出的参数及规划确定的改值、丢项；不能拿要求值冒充发送值 |
| `upstreamModel?`、`servingProvider?`、`upstreamRequestId?`、`stopReason?` | `data.model-response/v8#S-9`、`#S-12`、`#S-37` 的上游原样事实；上游没给就缺席，不能以请求值或本系统标识代填 |
| `rawHeaders?` | 同次 S-58 交出的已取得且已留存、经 S-20 原凭据规则处理的自有不可变头值；唯一含义和合法值域来自 `data.model-response/v8#S-20/#S-21/#S-22` 的 `raw.headers`。保留 string／有序 string[] 形状、次序、重复及空值；缺席不等于空对象／空数组／空串 |

**头事实的终局保留**：成功、HTTP 失败、带内失败、读体／解析中断、门失败及取得头后的取消，只要同次 S-58 已交出 `rawHeaders`，发出后的 `ModelInvocationResult` 就保留这个原值。S-59 不另给第二条头事实权威；不从不透明响应或失败载荷私取另一份值并猜优先级。未取得或未留存时沿 MR8 缺席，不补 `{}`、不另造故障或第五种收场。发送前拒绝与零次 send 的取消没有这份头事实。留存失败不改变既有收场，给出非法头值的提供者不符合该端口，不能通过拼接、取首、静默丢弃或默认值伪装合规。

头值不是内容，不进入 `snapshot`、`onAccepted`、到达事件、给模型的上下文、面向人的默认呈现或诊断 `detail`；不为它新增观察者、广播或队列。事实交接不意味着已有耐久响应，实际资源停止仍按 S-53/S-55/S-56。

此投影不带 `profile`、`call`、`ResponseId`、会话、租户、`credentialScope`、`selectedBy` 或 `replyDisposition`，也不返回完整 `AssistantMessage`。函数输出没有已结算、已入账的含义。服务面沿 S-7、S-17、S-29 以自己拥有的事实构造响应体与回复消息；回复处置仍由调用方按 S-17/S-49 决定。`aborted` 等新的第五个业务收场值不得自行加入。

**发送前取消的外层分支**：基本表示校验先做，表示非法先返回 `invalidInput`；校验后在 plan 开始前已取消，或 plan 完成后而 send 尚未开始时取消，`outcome` 返回 `{ cancelledBeforeSend: true }`，零次 send、没有 `timing.sentAt`、没有 ModelInvocationResult 或 ModelResponse，snapshot 不含内容。规划拒绝与取消按本句柄先成立的终局收敛，后到者不得改写；send 开始前必须再核取消。已经开始 send 后的取消走四值结果中的 `interrupted`，不回写成未发送。本分支不是第五个 ResponseOutcome；运行时若已确认耐久「已出门」，仍按 S-17/S-36 用自己的锚点结算 interrupted 责任，sentAt 必有且在此零 send 分支为 null，不能因函数未发送分支抹除记录。ModelInvocationResult 的 timing.sentAt 始终是实际时间点，不接收 MR8 只供锚点结算使用的 null；独立函数没有锚点，不产生这种恢复投影。

### S-55 snapshot 与首内容门

| # | 内容 |
|---|---|
| ① | S-54 返回的这个句柄；首次可见内容前可调用的 `beforeFirstContent` 来自同次输入 |
| ② | 仅这次函数调用的持有者可读；服务面读者另按 S-62 验归属 |
| ③ | 门未成功时，任何 snapshot、增量回调与最终结果不得暴露未获许可内容；不能先推后补，也不能绕过快照路径泄露 |
| ④ | 只读，无提交。第一次观察到 S-16 意义的内容时，先等待门的异步完成，成功后才推进可见位置；门成功至多一次，后续增量不重复调用。快照与后续增量是同一条接受序列，位置与 `capability.stream-assembly/v3#S-20` 一致 |
| ⑤ | 一致的可见快照及位置；门等待中返回不含该内容的快照，不能把等待中的内容算进已交付部分 |
| ⑥ | 非本句柄输入 `invalidInput`。门抛错或拒绝使本次执行中止，最终 `outcome = failed`、`failure.cause = unrecognized`，记录本地阶段 `before_first_content`；没有 `firstTokenAt`、没有未获许可块。门失败不假称上游中断 |
| ⑦ | 可重复读，无发出或再次开门副作用；门已失败不得重试门后继续原流 |
| ⑧ | 函数未配置额外门时按 S-54 ⑧；服务面必须提供耐久门，缺席即拒绝发出。门长期未完成受显式取消与时限政策约束，不能因此阻止实际停止 |
| ⑨ | 门等待、成功、失败与取消可诊断。取消发生在门等待中时，门随后成功也不得再把内容交出 |

**与持久服务面的交接**：本条的 `firstTokenAt` 只表达函数可见序列；函数没有日志提交知识。服务面门追加可能已提交而回执为 `unavailable`，也可能在门等待中取消、函数已以 `interrupted` 收口之后才提交。两者都可以是函数无内容、无 `firstTokenAt` 而日志已有「已开口」。独立函数上述失败/取消结果不变；服务面不得把该投影直接结算为无首 token 的 ModelResponse，而须依 S-17 隔离、S-33 权威读回后取耐久锚点的时刻，且仍不交未获许可内容。现有有限模型没有建模真实追加、回执丢失与权威读取，不据其通过声称本分支已验证。

### S-56 abort

| # | 内容 |
|---|---|
| ① | S-54 的同一函数句柄 |
| ② | 调用者持有句柄；这是独立函数的显式取消请求，不承担 S-31 的耐久中断意图 |
| ③ | 只作用于本次发出，不影响其他句柄；不能把发送过的请求记成未发生 |
| ④ | 第一次取消请求建立本句柄的取消事实并通知执行方；请求返回不等于已停止。网络读取、内容门等待及待交付工作都必须能够看到取消；门迟到成功不恢复输出 |
| ⑤ | 确认取消已请求；实际停止和最终收场读 `outcome`。send 尚未开始时按 S-54 返回 `{ cancelledBeforeSend: true }`；已完成或规划已拒绝时不改变原终局 |
| ⑥ | 非本句柄输入 `invalidInput`；停止中的局部故障记录并体现在实际终局，不能靠取消确认冒充停止成功 |
| ⑦ | 幂等，重复请求不产生第二次发出、第二个最终结果或重复释放 |
| ⑧ | 句柄缺席即 `invalidInput`。外部取消信号与显式 abort 使用相同取消语义；构件不响应时不能假报已停止 |
| ⑨ | 取消请求与实际停止各有事实；函数显式取消的有内容结果可映射 `interrupted_by_user`，服务面宿主系统停止仍按 S-36 覆盖为无回复的 `run_cancelled` 结算 |

### S-57 TransportAdapter.plan

| # | 内容 |
|---|---|
| ① | 明确路由、指定供应商、快照与精确绑定、参数、已解析消息与工具定义；S-74 的显式计量依据与构件、tokenMargin，本次事件装配目标。没有隐式目录读取 |
| ② | 输入有效，所选实现能解释绑定；调用者已完成需要的资源取得 |
| ③ | 不联网、不取凭据、不写持久记录；不能按路由前缀猜厂家策略；不把策略配置混入任意上游参数 |
| ④ | 纯规划。相同输入与相同精确实现及计量依据给相同规划；在发送前确定消息映射、缓存方式、参数调整与丢项，再按 S-74 计量全部实际输入并固定计划。发送方消费同一计划，不再重选策略或改写所计量的表示 |
| ⑤ | `planned`，含已通过 S-74 的固定实际请求语义、参数调整与丢项；完整适配绑定、计量口径和所检限制保持可追溯；未经合规判断的值不能称作 planned |
| ⑥ | `invalidInput`、`unavailable`；表示有效的请求规划拒绝包含既有三种：模态送不出、有工具调用没结果、`ToolInternalMessage` 混入。服务面按 S-28/S-29 以历史已出门数量区分：零次的模态拒绝为 `undispatched{modality_mismatch}`；已有发出的三种拒绝均为 `invalidInput`，模态分支 reason 为 `modality_mismatch`，不新增模型终结或响应。另含 S-74 的 `input_limit_missing`、`input_limit_exceeded`、`input_size_unavailable` 三个 invalidInput 子值，全部历史分支零新锚点/出网/响应/终结。必需显式缓存配置缺失、配置不能由该定义解释是 `invalidInput{malformed}`，不是一次上游失败 |
| ⑦ | 纯函数，可重复；重复规划不产生费用 |
| ⑧ | 缺必要定义/配置时明确失败，不默认 TTL、不默认某厂商角色，不降级到最新适配 |
| ⑨ | 交回可诊断的规划事实；无业务事件 |

提醒消息投影消费 `data.messages/v6#S-35`：OpenAI 的 `developer`、其他路由适用的专用类型或 `user` 由精确适配规则给；不能丢失或静默变成 `system`。前缀缓存配置生效与真实上游命中是两件事，plan 不能宣称命中。所有上游专用值须满足统一参数词表的表示与留痕规则。

### S-58 TransportAdapter.send

| # | 内容 |
|---|---|
| ① | S-57 的确定规划、本次明确凭据值、取消信号 |
| ② | 规划仍由原实现解释，资源可用；只能接收能够核实来自 S-57/S-74 的固定 planned 值，不能信任任意对象中的通过标志；服务面调用的「已出门」已耐久 |
| ③ | 一次至多一个上游请求；禁止隐藏重试、fallback、重定向以及环境凭据回退；S-38 十一义务适用 |
| ④ | 请求离开进程是不可回滚的外部效果。已有取消且还没发送时不发送。出网后失败保留可能已计费的事实 |
| ⑤ | 原始上游响应，或带来源与所知阶段的失败／已执行取消事实；提供已知的本地排队、触达上游等事实，未知保持未知。同次逻辑结果的公共可选成员 `rawHeaders` 交出已取得且已留存的头事实，含成功、HTTP 失败和取得头后的取消分支；成功响应 `R` 保持不透明，调用者无需从 `R` 私读头值。该成员的值域、原形和凭据边界只引用 MR8 S-20/S-21/S-22；发送前拒绝、尚未取得或留存未成时缺席 |
| ⑥ | 表示错误 `invalidInput`；构件尚未执行即不可用 `unavailable`；已执行的传输失败以 S-18 的来源事实交回，不捏造 HTTP 状态码。取消请求也必须与实际停止区分 |
| ⑦ | 不幂等；不得因回执不明重复发送。S-54 最多调用它一次 |
| ⑧ | 凭据、规划、取消输入缺席即拒绝，不调用任何隐式缺省；上游事实缺席不推断为零或已触达 |
| ⑨ | 发送开始、所知触达阶段、响应或本地失败、取消及停止诊断；不泄露凭据 |

**头事实交接责任**：S-58 给出自有不可变的 `rawHeaders`；已经取得且留存原值后，后续读错误或取消不能因未形成正常响应／完整错误正文而把它擦掉；`R` 的释放或后续变化不改变已经交出的值。此公共成员是同次头事实唯一交接权威，不要求调用者同时解释 `TransportFailure` 与 `R` 内部可能存在的头。不得把数组拼接、取首、丢项、排序、去重、去空白或序列化成字符串，不用逗号重解析原串；不新增头名规范化或 HTTP 线序承诺。不能提供合法值是提供者违约，不增补默认值或本契约未定义的错误代码。

### S-59 TransportAdapter.read

| # | 内容 |
|---|---|
| ① | 本次 send 的响应、同次规划上下文及取消信号 |
| ② | 调用者持有该响应；每份响应只属于本次读过程 |
| ③ | 不再发送，不做工具参数逆转写，不以成功 HTTP 码代替带内错误码；不自行结算或修改绑定 |
| ④ | 按收到的序列解析并交出 `data.arrival-events/v2` 到达事实，由装配器接受；逐片原文保留，工具参数唯一解析点仍在流装配。结束、断流、取消均有明确收尾 |
| ⑤ | 到达事件序列与最终已知事实：实际模型/供应商、generation 标识、usage/cost、上游收尾及错误来源。给下游的内容可见性仍受 S-55 约束。S-58 已交出的 `rawHeaders` 不由本操作覆盖或抹除；读体失败、解析失败、取消或没有最终内容不是该事实不存在的证据。本操作不增加 header 到达事件或第二条头事实结果权威 |
| ⑥ | 表示错误 `invalidInput`；已发出后的读取/协议错误以来源事实交回，由 S-18 分类；未知只记未知。不可把提前断流伪装成正常结束 |
| ⑦ | 不允许对同一活响应开启两个竞争读取；新的读取不从头重发。最终收尾只交一次 |
| ⑧ | 缺 usage、缓存计数或实际执行方按权威 data 规则保留未知/缺席，不拿请求中的供应商冒充实际供应商 |
| ⑨ | 交本次目标的到达事实及 S-63 诊断；消费者拒收不另造一次模型发出 |

### S-60 纯判定与可单取用构件

下列每个函数都遵守本节九件事；除本节新增的 `retryDelay` 精确关系外，语义只有所引原条款一份，不另定义重试决定或授权规则。

| 函数 | ① 显式输入 | ⑤ 成功结果的唯一规则 |
|---|---|---|
| `classifyCause` | 来源事实、首内容事实、`status_cause_table` | S-18 成因及原样错误事实 |
| `redact` | 值、已知凭据值及 S-20 三个具名参数 | S-20 脱敏后的值 |
| `legalTargets` | 范围链的行、允许集合、投影、兼容判定 | S-11 集合 |
| `displayList` | 上行输入、选中路由与逐行凭据有无事实 | S-12 展示结果 |
| `effectiveModel` | 选择、锁、范围链与允许集合 | S-10 前三步的结果；不执行拓展件 |
| `dispatchGuard` | 调用与发出事实、档案快照、计划 | S-30/S-50 的同一守卫答案 |
| `decideRetry` | S-35/S-76 的完整 LC6 失败主体（含 retryConclusions）与显式政策 | S-35 的重试决定；绝不发送或计时 |
| `retryDelay` | S-35 政策、第几次重试 `n`、显式 `uniformSample`；decorrelated 另带 `previousDelay` | 下述纯函数关系的等待时长；绝不调度任务 |

**其余七项逐函数适用**：② 输入事实由调用者合法取得，函数不核隐藏会话权限；③ 不读取全局上下文、环境凭据或持久服务；④ 无状态提交、无外部效果，固定全部输入后结果确定；⑥ `invalidInput`，或所引规则的判定拒绝；确有输入未知而所引规则无法决定时 `unavailable`，不把未知读成空集合；⑦ 可重复；⑧ 必需输入缺席不补默认、不自动读“当前”事实；⑨ 无业务事件。函数重载与服务操作在实现接口上必须可辨，不得让调用纯函数意外触发持久读取。

**`retryDelay` 精确关系（本轮主线技术候选裁定，不追认为旧版已有）**：`n` 为正整数；`base`、`max` 是非负有限时长，单位沿 S-21；`factor` 为有限数且至少 1；`u = uniformSample`，`0 ≤ u < 1`。所有项显式给出，不指定随机数生成算法，不接收语义含糊的 seed。

令 `D = min(max, B)`，其中 `kind = constant` 时 `B = base`，`linear` 时 `B = base × n`，`exponential` 时 `B = base × factor^(n−1)`。结果由 `jitter` 决定：

| jitter | 结果 |
|---|---|
| `none` | `D` |
| `full` | `u × D` |
| `half` | `D / 2 + u × D / 2` |
| `decorrelated` | 另收有限 `previousDelay ≥ 0`，第一次必须显式给 `previousDelay = base`；`lo = min(base, max)`，`hi = min(max, max(lo, previousDelay × factor))`，结果 `lo + u × (hi − lo)` |

不离散化、不隐式取整，时钟/定时器实际精度归提供者。配置或必要输入非法统一 `invalidInput{malformed}`，不得按不认识的 jitter 悄悄退回 none。`u = 0` 取各区间下端；`u` 趋近 1 时趋近上端但不取到上端（退化区间除外）；`D = 0` 时 none/full/half 均为零。decorrelated 的结果由其独立 `lo/hi` 式决定，不误用 D；当 `lo = hi` 时取该值。

### S-61 显式宿主输入

S-28 的宿主输入必须给出三项行为：登记本调用的收口责任并得到解除登记的途径、取消信号、停止中状态的读面。它们指向同一个宿主寿命；宿主已经停止时登记不得悄悄成功。登记与读取停止状态必须避免“停止已发生而未登记”的漏取消窗口；做不到即 `runtimeStopped` 或 `unavailable`，不能先准入再补登记。

调用方显式交入以上行为；提供者不得从全局上下文偷取所谓当前宿主。宿主停止触发 S-36，调用收口后解除登记；重复停止与主动结算竞争仍由 S-17 判重。宿主撤除与策略贡献撤除是不同事件：策略版本更新不等于宿主停止；强制撤除影响在途调用时必须显式传递取消。具体宿主框架的类型、服务键与资源登记 API 归 realization。

### S-62 观察者端口

观察者端口（接口描述名，无独立领域身份）是服务面显式交付输出。**每次交付按下表九项约束**；它不成为第十四个业务服务操作。

| # | 内容 |
|---|---|
| ① | 已授权的 `session`、本次目标 `{callId, dispatch}`、接收端，以及显式正整数政策 `observer_max_buffered_events`、`observer_max_buffered_bytes`；后者按实际交付表示的字节量计。目标不带租户时归属必须由会话映射判明 |
| ② | 接收端属于同一会话和目标；提供者在交付前核实，不能靠接收方事后过滤。输入关联不一致是 `invalidInput{observer_scope_mismatch}`；在 openCall 输入时可判的不一致在联网前拒绝 |
| ③ | 不能把别的会话同名 callId 或别次发出的事件送进来；门未通过的内容、被装配拒绝的事件不得外发。`rawHeaders` 不属于该端口交付的快照或增量 |
| ④ | 观察交付与业务结算没有共同事务。按 S-51 的快照位置衔接被接受的增量，缓冲有界；不无界等待慢消费者；缓冲满后该次交付明确失败，业务流和结算继续 |
| ⑤ | `accepted` 仅表示交付端已接纳，不能当作用户已读或日志已耐久 |
| ⑥ | 输入表示错误 `invalidInput`；归属不一致 `invalidInput{observer_scope_mismatch}`；交付失败是独立子域 `rejected{reason: buffer_full \| consumer_failed}`，不是 ModelResponse 的 FailureCause。未知接收归属 `unavailable`，不放行 |
| ⑦ | 不承诺观察者恰好一次；位置用于辨认快照/增量，重复请求不能重做模型调用或结算 |
| ⑧ | 归属、接收端或两个界限缺席即明确失败；不给无限缓冲默认值。观察者中途消失不能取消已经发生的费用或丢弃响应体 |
| ⑨ | 每次拒收/满缓冲/消费失败留可关联诊断与丢弃计数；服务面结算事实仍按 S-17 保持 |

端口不承诺失败后的可靠重放；需要完整持久事实的消费者读会话日志。观察端口关闭后释放本端缓冲与监听，不继续积累待交付内容；晚到交付记录拒收，不能重新打开已终结调用。

### S-63 工程观测与耐久事实分界

本条兑现 [SYS-OBSERVABILITY.C1–C7](../../../../foundation/observability-and-logging/requirements.md#已确认要求与工程含义)。公共执行路径拥有采集责任，适配器交事实与诊断，不逐模型复制一套观测规则。

| 必须可定位的边界 | 必须可区分的事实 |
|---|---|
| 准入、绑定、规划、凭据读取 | 接受/拒绝/不可判、采用版本、调整/丢项原因；只记凭据来源与结果，不记凭据值 |
| 等待、发送、首内容、流结束 | 本地排队与触达事实、内容门等待/成功/失败、真实上游状态与实际执行方、取消请求与实际停止 |
| 回复交接、结算、再次发出、恢复 | 未结算与已提交、原尝试/新尝试、按哪个耐久锚点追补、未知费用、无重发的恢复 |
| 宿主/策略注册与撤除交接 | 本运行时取得/拒绝/释放版本引用与强制取消；注册提供者另记录发布、停准入与资源收口事实 |
| 观察及诊断输出自身 | 缓冲满、拒收、消费者故障、采样/丢弃、导出失败、延迟与保留边界 |

关联带适用的租户、会话、Run、attempt、call、dispatch 及档案、实现、定义、配置修订。独立函数只记录明确交来的工程关联，不造会话或租户。时间顺序、因果关联、调用归属分别表达；请求供应商与实际供应商分开，`usage` 缓存零与未知分开。高基数身份和原文不能作指标标签。

`rawHeaders` 不进入诊断 `detail`，不把诊断输出当作头事实或恢复真相源；脱敏后的完整头对象同样按 S-54 的结果／S-17 的响应交接。默认诊断不录凭据、消息正文、工具参数、工具结果与模型推理原文；错误留痕先脱敏。敏感调试必须有显式配置和相应内容权限，本批默认不启用。内部会话身份不得因此经请求体、头或缓存 key 外传。

诊断输出端、容量、导出与保留政策具名且可配置/替换，不由本条猜数值。诊断故障不改业务收场，不把已知事实改成零；必须能通过仍可用的独立诊断状态看出观测覆盖缺口。所有诊断出口皆不可用时，不声称覆盖完整。必要耐久记录失败仍按 S-15、S-17、S-31 阻止相关可见动作；外部追踪系统不是恢复真相源。

### S-64 新边界的装配与协议保证

| 保证 | 单机由谁给 | 跨进程由谁重建 | 做不到会怎样 |
|---|---|---|---|
| 取得精确版本与停止准入之间有顺序 | 注册提供者的取得判定点，runtime 持有引用 | 显式带精确版本的引用协议；拒绝不隐式降级 | 已撤版新调用仍发，或在途实现被提前释放 |
| 目录采用版本与旧版本撤除分开 | 先注册、目录明确采用、最后显式撤旧；每步独立失败 | 分步发布与可恢复结果；不伪装跨 owner 原子更新 | 部分失败被隐去，自建档案被擅自换版 |
| 首内容门管住所有可见读面 | S-55 门成功先于快照及增量 | 转发者必须带门已通过的证据才可见 | 先看到后补锚点，恢复重复发出 |
| 宿主停止不会漏掉刚登记调用 | S-61 登记/停止观察的共同寿命 | 明确宿主寿命与撤除通知协议 | 宿主结束后留下无人结算的发出 |
| 当前 EvaluationInput 全部来自有效且一致的同租户源 | S-66 输入提供者负责捕获身份、实际读取和完整输入核对；runtime 负责读取时点及纯求值 | 身份、源版本与输入有效性证据在边界重新验证；不能以远端历史结果代替当前输入 | 无法判明即 unavailable、零 HTTP；不返回成功的混合输入 |
| 会话/目标隔离与有界观察 | S-62 每端口校验归属、按政策限额 | 接收边界重验归属，传输背压与失败回报 | 串会话泄漏或慢消费者耗尽进程资源 |
| 同次已保留头事实原形交到最终结果与完整响应 | S-58 交出经原凭据规则处理的自有不可变值，S-54/S-17 保留同次值 | 各发送／接收边界重新兑现同次归属、MR8 值域与写前脱敏；取消或读失败不擦掉已交事实 | 排查记录丢失、数组被改写或凭据跨边界；不能以 Schema 接收证明真实交接 |

版本注册模型、生命周期实现及跨进程协议没有由本条自动实现。仅单机验收不证明右列成立。

### S-65 增量规范场景

1. **绑定不变**：C1 用档案适配 V1 打开后发布 V2、目录改用 V2；C1 的首次与再次发出都用 V1，新 C2 用 V2。相同配置修订名在两份档案中取不同值，不得互用。已出门及最终响应的绑定逐值一致。
2. **恢复缺旧实现**：V1 发出未开口即退出，重启只装 V2；reconcile 用记录中的 V1 追补，返回 `resumable`；openCall 续接或 dispatch 请求旧实现失败为 `unavailable`，无新请求、无新「已出门」。
3. **首内容门失败与取消**：门阻塞时 snapshot 无内容；门失败后 outcome 为本地 `unrecognized` 且无 firstTokenAt、无 blocks；取消后门迟到成功不能交出内容。取消确认与 outcome 实际停止是两个观察点。
4. **纯函数独立消费**：直接交工具定义、消息、快照及传输，未装 Cordis/会话/目录/存储也能执行；只一条上游请求。返回没有本系统身份与回复处置；仅服务面测试才可声称锚点、账和租户隔离已兑现。
5. **观察隔离与过载**：两会话同 callId，端口归属错即明确拒绝；慢消费者耗尽界限时得到 `buffer_full`，诊断可见，正常模型结算仍完成；消费异常为 `consumer_failed`，不会变成上游故障。
6. **来源与未知**：本地 queued 首内容超时为 `unrecognized`，实报已触达后的首内容超时沿 `upstream_unavailable`；来源未知不猜触达。缓存读零、未知、正数各自保真，实报供应商缺席不能补请求值。
7. **诊断故障对照耐久故障**：导出端失败导致覆盖缺口，正常收场不改；相同位置换成「已开口」追加失败时内容被门挡住并按 S-15 收口。日志中秘密哨兵、工具正文与推理原文均不得出现。

### S-66 currentEvaluationInputs.read：当前求值输入端口

这是运行时服务面必须显式获得的宿主读取端口，**不是第十四个服务操作，也不是 S-54 独立 invokeModel 的隐藏依赖**。端口名是接口描述名，没有独立领域身份。完整输入与纯求值关系只引用 `capability.asset-evaluation/v4#S-6/#S-7/#S-15/#S-29`，不另定义一份 EvaluationInput 或 Schema。

`currentEvaluationInputs.read(session, tenant) → { input: EvaluationInput }`

| # | 内容 |
|---|---|
| ① | 显式 `session`、`tenant`。runtime 先由 `capability.session-tenancy/v2#S-8` 的真实 holdingTenant 取得这个会话的 tenant，再交入本端口；不收调用方猜出的租户、不从进程当前身份补值 |
| ② | 会话存在且归该 tenant。每次组输入前，提供者必须另从真实本机权威或明确采用的本机副本，核实 tenant 此刻的成员资格仍有效、内部调用有权以该 tenant 求值并读取该会话配方及当前输入，兑现 AE4 PRE-3；捕获的 standing 不能代替此检查。sessionTenancy 不可用、无记录或拿不到租户时，runtime 在调用本端口及发送之前以 unavailable 失败。归属与当前授权检查不得留给下游消费者 |
| ③ | 返回的 `input.tenant` 必须与参数 tenant 相等，且与真实会话归属一致。禁止跨租户读取、从别的会话补内容、由历史 EffectiveAssembly 反推输入、因当前源缺失回退历史结果或系统默认值 |
| ④ | 只读，没有注册表提交或请求发送。输入提供者负责捕获和持久 IO，并保证下面的来源前提；runtime 负责选择读取时点，取得后调用 AE4 的纯 evaluate 及处理失败。完整 input 必须来自一致读取，或经能证明本次各来源仍共同有效的核对；reload、版本切换或配值变化造成无法判明的一致性竞争时，不交回拼接成功值 |
| ⑤ | `{ input }`：符合 AE4 表示、一致性及真实来源前提的完整 EvaluationInput。它是这次求值的输入，不是已经求出的值集、历史清单或部分结果。input 中明确空集合与未能读取须保持可辨；只有确知为空时才能给空集合 |
| ⑥ | 参数不构成端口请求为 invalidInput；端口未配置、源不可读、来源/版本不合前提、输入不一致或无法判明、返回租户不匹配、当前成员资格失效或未知、内部调用权限被拒或无法核实均为 unavailable。runtime 对读取或 evaluate 的任何失败均零 HTTP，不新增「已出门」、ModelResponse 或调用终结，保持既有调用状态；诊断保留实际失败阶段与 AE4 的原拒绝事实，不转成上游模型故障 |
| ⑦ | 可重复读取，不自动重试或写入；不同读取之间当前配值或版本可变化，不承诺重复结果相同。某次读取/求值结果只用于该次准入或发出，不成为以后的默认缓存 |
| ⑧ | 端口、会话配方、必需源或一致性证据缺席即 unavailable，禁止用 fixture、旧 manifest、固定宿主设置或空定义补齐。合法求值缺可选 model 是无锁；缺任一必需正时限则按 S-21 拒绝该次发出。两者不可混为“缺项就填默认” |
| ⑨ | 不发业务事件。S-63 诊断须能关联读取会话、已固定租户、实际根资产/版本、读取/校验/evaluate/缺项失败阶段；不记录敏感正文或完整配值原文，也不向模型外传这些内部身份 |

**输入提供者承担的来源前提：**

1. `standing` 取会话创建时已经捕获的成员资格事实，**只作该会话的求值配方**，与注册表已有的捕获配方口径一致；它不是 tenant 此刻有效或内部调用已获授权的凭据。每次组输入必须另以真实本机权威或明确采用副本核实当前有效性及内部调用权限，未知、失效或无法核权均 unavailable；不得用旧 captured effective 放行。此检查不逐请求向中心更新会话身份或 roles，也不改写已捕获配方。真实 sessionTenancy、捕获 standing、workspace 与根配方均由实际持久来源读得，不能由有效模型、档案或历史求值倒推。AE4 的 PRE-3 保持成立，其一般 standing 读法与本会话配方的适用关系由 AE4 拥有，本条不改写通用求值契约。
2. 持有及各层配值取本机此刻的权威数据或已明确采用的本机副本；这里不承诺与不可达中心的瞬时全局一致。工作区来自该会话实际挂载配方，缺工作区与工作区读不到分开。
3. `versionSelection` 与 `definitions` 来自同一份有效输入。root.source 以及 references/attributes 必须从这次按持有规则选中的同一不可变资产版本实际读取，并满足 AE4 的 C16 与 PRE-9。不能只改 version 字符串、把 current 持有改成 pinned 来强制保留旧根、沿用旧声明，或以 source 与版本号相等代替正文真实性。使用固定根配方的注册表求值路径可能因当前持有选版与固定根不符而触发 C16；应明确失败，runtime 不修改 holding 或根配方来迁就。
4. 持久正文读取失败即 unavailable；输入各来源在读取中变化时，由提供者用一致读取或有效性核对保证完整 input。不能判明即 unavailable；不靠返回一份“形状合法”的旧输入宣称当前。

**消费时点与责任边界：**

| 消费点 | runtime 承诺 | 输入提供者/纯求值器的责任 |
|---|---|---|
| S-10/S-26 有效模型、供新 openCall 的 basis | 每次 effectiveModel 读取当前输入并 evaluate；model 缺项无锁，缺源不可用；保留 effectiveModel 到 openCall 的原选择窗口，不重算或静默换 target | 输入提供者给当前真实输入；AE4 只做纯求值，不读存储、不决定初选 |
| S-24 legalTargets 与使用它的入口 | 共用本端口固定真实租户及当前求值事实；合法集合仍按 S-11，不增加 model 第四过滤项 | 不用旧 E 冒充当前输入，不用失败结果冒充空集合 |
| S-29/S-30 每次发出 | 现读并 evaluate 两个时限；不读取旧 E 顶替，不改已经打开调用的模型/快照/适配绑定 | 输入提供者响应实际配值/版本变化；无关清单 reload 不能成为当前配值生效前提 |
| 已提交历史查询 | manifest3 readEvaluation 只作历史参考，不用于上述现求 | 它按固定头上界与最近 given/mint 的规则回答历史，不承担当前输入端口保证 |

**增量规范场景（尚非执行记录）：**

- 已打开 C1 后修改同租户的 model 配值而不 reload 清单；下一次 effectiveModel 供新 C2 的 basis 使用新配值，C1 再发仍用原 S-7 绑定。修改两个时限而不 reload 后，C1 下一次 dispatch 使用当前新时限；已开始的那次发出不被追改。
- 历史 manifest 中仍有合法旧 E，当前源却读取失败、租户不匹配、root.source 不符所选版本、正文不可读、缺时限或读取不一致：分别 unavailable，零 HTTP，无新锚点或响应体，不回退旧 E。
- 配值或版本在读取各片来源之间改变，能核对为同一有效输入时才成功；无法核对时 unavailable。只改 source.version 而沿用旧 references/attributes 不得成功。
- 会话捕获 standing 为 effective，但本机当前权威/明确采用副本表明成员已失效、查不到当前有效性或内部调用权限不足：分别 unavailable、零 HTTP，不能凭旧 effective 放行。当前有效性及权限均核实通过时，仍用捕获 standing 作会话求值配方，不逐请求向中心更新会话身份或 roles；真实会话/捕获事实读不到同样拒绝。
- 一次历史发出后恢复：先交缺工具结果的新输入，规划拒绝且无新发送/响应/终结；修正输入后可再次 plan。另交已绑定快照不支持的新模态，返回 invalidInput{reason:modality_mismatch} 并保持 resumable；历史数量为 0 的首次模态拒绝仍按 S-28 的 undispatched 分支。

本条当前输入生产者及真实时序验收未开始。既有 Invocation、ContentGate、AdaptationBinding、Adaptation 有限模型均未建模本端口，不把它们的旧运行当作当前性、租户来源、跨源一致性或续接新输入分支的证据。

### S-67 默认重试件的能力标识

本契约拥有 S-35 系统默认重试件的唯一能力标识：**`{ category: loop_extension, name: "omne-official:default-retry" }`**。形状与逐码点相等规则沿 `data.loop-extension/v6#S-7`；`omne-official:default-retry` 是 `CapabilityId.name`，不是新的对象或另一种标识形状。声明中的 `name`、能力标识中的 `name` 及以该 name 指认本件的记录遵守同一条相等规则。runner 消费本条识别系统默认件，不从实现名、位置或类名猜身份。

该件声明的 **`position = after_model_call`、`dimension = { ending: failure }`**，沿 `data.loop-extension/v6#S-1`、`#S-2`、`#S-6`；重试算法、参数、终止性、可替换性及不可用处置仍沿 S-35，不因命名改变。它只交回既有 `data.loop-extension/v6#S-27` 的 `retry { plan }` 或不再试时的 `observed`；每条重试仍过本契约 S-30 守卫。

**身份不授予权限。**`power` 与 `onError` 各沿 `data.loop-extension/v6#S-4`、`#S-5`、`#S-6` 的声明及求值规则；本条不设新的出厂档或报错处置值。`retry` 是结论，`record` 是报错处置策略，两者都不是 `Power` 的合法值；本次可交回的结论仍由其实际求得的干预力依 `#S-20` 判定。本条不新增服务操作、资产形状或特权路径。

### S-68 每个追加写方显式选择条件

本版精确消费 `capability.session-log/v3#S-17`、`#S-32`：每次调用都是 `append(session, entries, fence, condition)`，四个实参齐全；不允许三参数兼容路径。`condition` 只取该契约已有的 `unconditional` 或 `tailEquals{tail}`，并不替代身份、授权、栅栏和判重。失败次序和未知结果按该契约 `#S-33`，本能力不重排。

| 实际写入 | 原先拥有者与保护点 | 显式 fence | 显式 condition |
|---|---|---|---|
| 已出门、已开口 | 本能力 S-15/S-29/S-30，先于出网/首内容可见 | 属于 Run 时 `fenced{run,attempt}`；不属于 Run 时 `unfenced` | `unconditional` |
| 中断意图 | 本能力 S-31，先于中止信号 | 同上 | `unconditional` |
| 调用终结（含未发出拒绝、released、两次发出之间中断及 S-33 对应行） | 本能力 S-28～S-33 原提交点 | 属于 Run 时仍用原操作所要求的 `fenced{run,attempt}`；不属于 Run 时 `unfenced` | `unconditional` |
| 模型切换记录 | 本能力 S-27，生效点不变 | `unfenced`；会话切换不制造 Run/attempt | `unconditional` |
| 属于 Run 的响应体及其账，包括外部 persisted 回复整批 | S-17/S-29/S-30/S-31/S-33/S-36/S-49 的各结算方 | `unfenced` | S-69 的 `tailEquals{tail}` |
| 不属于 Run 的响应体及其账，包括外部 persisted 回复整批 | 同上，保持会话归属和 S-17/S-49 原处置 | `unfenced` | `unconditional`；仍受 S-70 的完整批认回和未知恢复前提约束 |

普通记录显式 `unconditional` 是对 RT3 原提交义务的窄推导：它们原有的前置、授权、锚点排序和 fenced 判定照旧，未声明依赖提交前全部历史的 `late` 谓词；不因为 SL3 新增可选条件分支就为它们创造另一个业务前提。不属于 Run 的路径没有可判断 `late` 的 Run/attempt，沿 MR8 S-35 保持标记缺席；这不削弱唯一主体、先锚点、原子批或未知结果义务。任何操作原本需要的事实不可判时仍沿 S-14 失败，不能借 `unconditional` 跳过。

### S-69 属于 Run 的结算以同次完整前缀为依据

1. 每个实际响应提交者在 S-17 锚点前提成立后，合法取得同一会话的完整稠密前缀与其尾：同一次 `readSince(session,0)`，或消费者已有合法完整前缀再按 SL3 S-34 连续追补。事实和尾必须由这一份前缀共同给出。按键局部条目、内存清单、分别读取的运行事实布尔值与另一次尾，不构成这一输入。没有完整读取权或不能确认完整性即 `unavailable`，不猜两件事实为假。
2. `late` 按 MR8 S-35、CA2 S-39 解释：锚是这次发出的原 `attemptId` 和原 Run；前缀中原尝试已被取代，或其 Run 已终结，则 `late: true`；两者确为假才缺席。不能用恢复时归账到的新尝试替代原发出尝试。生产 Run 终结认法仍由原 owner 补齐（G-28）；`model_call_ended` 只终结模型调用，不能当 Run 终结。
3. 以该前缀解释未提交的响应整批，使用同一尾的 `tailEquals`，并以 `unfenced` 提交。实际日志追加须在共同不可插入的判定/提交点完成全部键判重、尾比较、整批写入和持久确认（SL3 S-13/S-14/S-17/S-33）。比较域是全本日志，包括无关追加。回复成为消息时，消息和响应是同一完整批，不能先写消息再补响应。不得在该批中另加入改变本次 `late` 判据的新尝试或 Run 终结事实；本版未定义此种组合。
4. 条件成功把构造所用前缀保持到实际提交点，因此 `late` 对该提交点准确；它不证明前缀读取合法或解释正确。响应先提交、边界后提交时保留原响应，不能追改为晚到；边界先提交时旧尾不能提交，按 S-70 重读与重构。所有结算者适用同一义务，包括普通失败/无回复中断、interrupt 后续、宿主停止/撤除、对账、vetoed/consumed 与外部 persisted 写方。

### S-70 稳定身份、完整原批和未知结果

1. 全部写方对同一会话、同一次发出使用 S-8 已定的同一 `ResponseId`；persisted 候选中的 `MessageId` 一旦指定，在条件争用、重交和认回期间保持不变。所有写方用于同一业务身份的 dedupeKey 彼此等价，对应的 readKey 也彼此等价；不能各加不同 owner 前缀绕开共同判重。两种键仍是各自的字段，日志的 dedupeKey 不自动成为 readKey；需要按键认回的条目必须具备相应读取键。具体编码与全写方采用归 G-29，本契约不发明字节编码。
2. 在首次构造及每次重构未提交批之前，先检查是否已有同一 ResponseId 的合法完整批。已有则认回原响应、账和对应消息（如 persisted），保留其原始值；不是把本次期望值覆盖进去。两种处置竞争时沿 S-17 先到者原批与 S-49 ⑦ 的返回，不替败方另写一条消息。完整认回须确认业务身份、关联和该批要求的所有成员与原值，不能仅凭命中一个键、命中数量或任意同键载荷就称已结算。
3. `alreadyRecorded{keys}` 仅确认本次没有写并报告碰撞；部分碰撞、身份不符或不能取得完整原批时，不能报成功、不能补齐残批、不能换 ID 再写。本能力保持原未完成阶段并返回 `unavailable`；合法已提交批与不同处置的确定结果仍按 S-49 `alreadyEnded`，不把已认回的确定终态改成未知。
4. `tailChanged{tail}` 确认 **THIS 次整批零写**；返回尾不替代合法完整读取。没有先前未决追加，且权威读确认无原批时，可由 S-71 策略准许重新读取和重构，仅更新未提交批依新前缀得出的 `late`。原 `ResponseId`、已指定 `MessageId`、绑定、参数三项、既定收场/处置及已知用量金额保持；不能重发模型、重跑规划或改选供应商。
5. 先前追加为 `unavailable`、丢回执或仍在途时，新一次 `tailChanged`、`alreadyRecorded`、租户/栅栏拒绝均不能证明旧次未写，也不能单独证明已写完整原批。旧网络、门回调、全部可能迟到的追加和 `unfenced` 结算写方必须实际停止，并完成权威恢复读取，才能以缺席为旧批未提交的依据。读得合法完整原批可以认回已成立事实；关闭未知写责任还须确认旧任务不再产生效果。停止信号、函数 outcome、卸载开始和 fence 本身都不够。
6. 未知 opened 的强门优先于任何普通响应提交，包括 host 撤除、S-49 和外部 persisted 写方：不能交内容、把函数无首 token 投影写成普通响应、交模型失败主体或放行重发。仅在 S-17/S-33 既有恢复时机及实际停止、权威读回前提齐全后，按耐久 opened 的实际存在与时刻和中断意图恢复；不新增在线恢复操作、领域状态或失败值。

### S-71 争用政策与责任保留

实际调用或回复的 owner 须显式提供一个名称可识别、可替换的消费者策略，决定条件争用后的再次读取、重构、重交许可，以及等待/退避、时间、次数与资源上限。政策的数值和计算由该策略提供，本能力不填固定次数、TTL、默认值或无限紧循环；实际端口与字段名归提供者投影，不是新服务操作或共享 DTO。此义务消费 SL3 S-35。

策略缺失或无法执行时相应推进为 `unavailable`；不能借默认模型重试件 `omne-official:default-retry` 或 `default_retry_backoff` 填补。策略只管理本次耐久结算的存储争用，不改变 S-30 发出守卫、S-35 模型重试许可、S-70 的未知恢复前提和先到者原值。

策略耗尽、取消、日志不可用、合法完整前缀或生产事实不可得时，遵守 S-72 的既有返回和未完成阶段，不报已结算、不增加一次模型失败或一次发出，不将调用释放为可重发。耐久锚点、意图、稳定身份和原 owner 的后续恢复责任都保留；只要外部效果仍可能发生，相关资源所有权不能被一个取消确认代替。

单次尝试可终止，不等于某个结算者保证最终成功。有限进展还要求日志可用、工作被实际处理、恢复责任被保留，并存在策略预算内可获得的真实提交机会；仅调度公平不能保证读后到提交之间不再有追加。无法获得机会按耗尽规则收口，不降低准确 `late` 或完整批要求。

### S-72 各操作及外部结算者的传播

以下是原操作九项的共同补充，未列出的输入、授权、守卫、失败次序、返回形状与事件保持原条款；`tailChanged` 和 `alreadyRecorded` 是日志内部结果，不加入 S-14 九个服务失败值，不成为模型上游故障。

表中的保留原阶段/未完成责任不构成“持久事实没有改变”的保证；回执未知时按 S-6 区分本地未确认处理与权威记录，不以旧状态授予再发许可。确定本次零写也不排除其他写方已经提交。

| 入口 | ④提交/⑤返回/⑦重复/⑧缺席与恢复的精确增量 |
|---|---|
| legalTargets、displayList、effectiveModel（S-24～S-26） | 无新增追加；原当前读取、失败与授权不变，不消费争用策略 |
| selectModel（S-27） | 切换记录显式 unconditional；确定未提交只保证本次未产生切换。回执未知仍 unavailable、结果未确认，当前选中沿 S-9 权威记录；读得选中不等于认回本次命令。旧 writer 未停时缺席读不关闭未知；不增加 Run 身份、命令键、恰一次、自动重放或回滚 |
| openCall（S-28） | 正常打开仍无耐久提交；检查拒绝须写调用终结时沿 S-68。新 SL3 不改变 basis 竞争窗口、快照或纯 invoke |
| dispatch、dispatchAgain（S-29/S-30） | 两锚点显式 unconditional，原 fenced 分类和先写后行不变。故障/无回复中断在响应完整批成功或合法认回前不得返回已结算结果或进入 awaiting_decision；争用耗尽等为 unavailable，保持依耐久锚点可知的原未完成阶段（in_flight/speaking），不得重新发送。有回复仍先交回 reply_pending；它未承诺响应已写下，最终实际写方按下两行结算 |
| settleReply（S-49） | vetoed/consumed 响应沿 S-69/S-70 整批提交；同处置认回返回原结果，不同合法处置沿原 alreadyEnded。写入未确认或耗尽为 unavailable，本实例保留 reply_pending 处理责任、不改既定收场；不否认可能已提交的原批/终态。调用方可按原操作重调，但未知前提未闭合不得再次追加 |
| 调用方 persisted 回复（S-3/S-17） | 同一个已指定 MessageId 与原 ResponseId 的消息+响应完整批；禁止先写消息。争用或 unknown 未收口时，该调用方保留回复结算责任，不能宣布已持久，也不把失败映射成模型 retry。它不是本契约第十四个操作；其外部返回形状归该消费者，必须表达未完成，不能伪造本契约成功 |
| interrupt（S-31） | 意图仍先以 unconditional 耐久后发信号；意图成功后即返回原 phase，不等待响应结算，后台耗尽不追改已完成返回。之后的响应沿 S-69/S-70；未结算由原 runtime owner 保留并在 S-33 时机恢复。意图本身写不进仍 unavailable、不发信号；没有在途发出的调用终结仍按原顺序写 |
| releaseCall（S-32） | 只从 awaiting_decision/resumable 写调用终结，显式 unconditional。未确认则 unavailable，保留本实例未确认责任，不断言耐久状态未变；可能已提交的终结按 S-32⑧/S-6 认回。不是在途响应结算通路，也不为争用释放未结算发出 |
| reconcile（S-33） | 原两种时机、原行优先级、原发出绑定和时刻保留；每个响应追补整批用 S-69/S-70。任何必要恢复读或追补未完成即 unavailable、不返回部分结果、不推进 loop；前面已提交的批保留，下次认回。无响应的调用终结行沿 S-68，不能伪造可用 Run fence |
| readAttempts、canDispatchAgain（S-34/S-50） | 无追加。S-34 在已结算 failed/awaiting_decision 下按同一完整前缀返回完整 failureSubject；来源未知整体 unavailable，恢复后可重复只读重取，不计次、不重写响应。未知或尚未结算发出不变成失败主体或可重发许可；S-50原判定不变，已知输入/身份判定优先级不变 |
| 宿主停止/撤除/替换（S-36） | 对普通可确定收场依旧中止→结算→释放；未知 opened 先强门。争用耗尽不虚构完成，也不要求无限等待。已实际停止且可释放的执行资源可以释放，耐久锚点及未完成责任留给既有宿主/重新承载者和 S-33，不能把释放连接等同于结算成功；所有仍可能写入的任务先实际收束或维持明确 owner，不能遗弃 |

本表返回映射承接 RT3 S-17、S-29/S-30 ⑧、S-31 ④⑧、S-33 ⑧、S-36 与 S-49 ⑧；没有新产品收场或新服务失败。

### S-73 组合前提与可失败证据

S-38 的单机/跨进程保证补下表；单机也须主动兑现，不能把独立 SL3 的有限模型视为整个 runtime 组合证据。

| 保证 | 单机承接者 | 跨进程承接者 | 做不到会怎样 |
|---|---|---|---|
| 全尾比较、批次判重、整批持久写共享一个提交点 | 日志提供者持有所有写方共同追加的那本物理会话日志 | 同一权威追加协议与共同日志对象；不能各自本地比较后另写 | 错误 late、重复响应/费用或孤消息；依赖路径停止，G-29 |
| 合法完整前缀及真实 Run 解释 | 读取授权 owner 与 runtime/回复消费者；Run 终结认法归原 loop owner | 身份核实与同一权威日志完整读取，解释规则明确采用 | 无权或判不出仍 unavailable，不以 fixture、两个 bool 或调用终结代填；G-28/G-30 |
| 跨写方稳定身份、等价键与完整原批认回 | runtime、外部回复、对账者共同采用的键和表示；日志保持载荷不透明 | 相同业务等价与认回协议 | 碰撞误报成功/重复批，G-29 |
| 旧 unknown 的真正停止与权威恢复 | runtime、宿主、日志 owner 与全部旧结算方共同完成 S-17/S-70 | 实际隔离旧写方效果并在共同日志恢复；fence 只覆盖其限定写类 | 后次零写被误作旧次没写、anchor/response 不一致；保持未结算 |
| 争用停止后仍有人承担恢复 | 实际调用/回复 owner 显式策略及 S-33 既有重新承载方 | 同一责任交接与耐久锚点 | 无响应却报告已完成/可重发；S-71/S-72 禁止 |

继承 v4 的 [Settlement](formal/README.md#结算组合模型) 有限模型表达结算读、边界/无关追加、提交、回执未知、实际停止的抽象动作与恢复、策略耗尽和两个结算者竞争。断言及故意破坏比较/整批/unknown/责任保留的否定配置要成对执行。真实 Run 识别、物理停止、文件 IO 与读取授权仍是明确假设及真实组合义务，不能由一个原子 StopOld 或 mock 成功证明。规范场景见 [examples.md](examples.md#v4-增量结算竞争与恢复)。不新发 capability Schema 或 Alloy；数据形状沿 MR8/MS6/CA2，状态交错归行为模型。新增提供者绑定为零，实际消费者版本传播与验收门见 [consumer-impact.md](consumer-impact.md)。


### S-74 每次发送之前的完整输入限制与固定计划

本条共同约束 S-28/S-29/S-30/S-53/S-54/S-57/S-58；不新增服务操作。输入上限的唯一值定义取 `data.model-profile/v6#S-8/#S-9/#S-27/#S-32/#S-33`。档案适用性按完整 `inputModalities` 判，图片档案这次只发文字也不能缺单图 cap。`upstreamInputLimits` 的显式 unknown 不是缺失，也不阻止按本条声明的计量方式通过供给 cap 检查的请求；unknown 与 unbounded 不互换，一次成功不更新上游事实。模态已确认不因限额未知被删去，限额拒绝不报为模态不支持。

1. **固定输入**：新调用同一次档案读取得完整 cap、upstreamInputLimits 与精确适配绑定，进入 S-7 的完整副本。续接从 MS6 S-49 的原锚点读取，同一次调用的每次规划都使用它。目录后来更新不改旧副本，参数/工具/消息改变必须重新检查。对全部已选定的实际发送表示计量；上下文组装选择原件或合规派生表示且不改已落盘消息，最终门不替组装缩图、丢图、截文本或改模态。没有已接受上下文组装契约，本条不虚引一个。
2. **作用点**：不涉及限额缺项的基本表示与既有三种规划拒绝检查之后，先完整校验适用 cap 及其与上游事实的一致性，再在消息/system/工具定义/协议附加内容/缓存处理及实际发送模态都确定后计量。服务面的每次检查先于新「已出门」；公开函数先于 send；send 消费同一个固定计划。原 S-28 目录、凭据及状态判定次序不被本条提前取代；输入限额检查位于规划阶段，不追加新准入终结。
3. **token**：能取得适用准确计数或可靠保守上界时使用它；否则可采用对所绑定模型/指定供应商有适用依据的模型 tokenizer 估算；输入覆盖最终固定请求中的消息、system、工具定义、协议附加内容、缓存处理与实际发送模态，不能仅估正文或遗漏发送贡献。估算实现、模型/tokenizer 版本、适用供应商及证据明确可追溯；不要求与上游私有精确计数完全一致，不以未公开的秘密模板为普遍前置。纯字符数、UTF8 长度或无模型依据的任意倍率不能替代 tokenizer 依据。准确计数与有依据的可靠保守上界仍可采用，来源类别不可混写。
   **显式余量政策**：`tokenMargin`（技术参数，无独立词条）恰含 `multiplier` 与 `reserveTokens`，两者都显式供给、无默认值；校验适用 cap/上游事实的完整性及同名数值关系之后、实际计量之前验证本政策，前者是 ≥1 的有限十进制数，后者是 ≥0 的整数。估算量 `estimatedTokens` 是非负整数，`admissionTokens = ceil(estimatedTokens × multiplier) + reserveTokens`；按精确十进制数值计算并向上取整，不准二进制近似向下越界。估算分支以 admissionTokens 对每个适用有限 token 限制判断，等于允许；政策缺席或非法为既有 invalidInput{reason: malformed}，不补 multiplier=1/reserveTokens=0。准确计数与可靠上界分支不追加估算余量，但本公开计量输入仍显式给出 tokenMargin，保证分支切换不会暗中取得默认。
   **不越过事实边界**：估算通过仅表示本次估算准入门通过，不证明实际 token 必然低于 cap，不承诺上游必然接受。估算超门是估算拒绝事实；准确值超限才可标记实测实际超限。可靠上界超 cap 而实际未知仍为 input_size_unavailable，不能冒充精确值或偷偷改标估算以绕过原分支。实际 usage/cost 始终沿 MR8/CA2 上游来源事实，估算、余量和 admissionTokens 不得写进实际 usage 或用于补未知。共享输入输出窗口换算仍归 MP6 S-8。
4. **图片与字节**：实际发送的每个图片项（含工具结果中的图片及选择的派生表示）按严格合法 base64 解码后字节计，与 `inputConstraints.maxImageBytes` 及已知同口径上游值分别比较；恰等于允许。未发送原件不参与该项。图数为最终发送图片项数量，重复发送同一图计两项。完整请求字节为最终序列化 UTF-8 请求体的字节数，含包装、文本、工具与内联数据；不是媒体大小和、头部或 HTTP 帧大小。适用有限 cap 和所有已知 limited 上游指标各自约束，逐图通过不推得总量或 token 通过。
5. **材料与证据**：`AttachmentRef.bytes` 仅为说明；地址不是授权或已核实字节。plan 不联网，不推测引用真实内容。没有可合法取得且固定的发送材料，或计量依据不足以判定全部适用限制，明确拒绝；不凭 reference.bytes 或 MIME/像素猜大小。计量实现的模型/供应商/tokenizer 版本、有效前提与估算依据或准确性/上界证据由提供者承担（G-33），不是档案的伪造默认值。所有必需构件/定义在 plan 前显式取得，获取失败是 unavailable。
6. **固定后不漂移**：planned 自有并固定所有影响限制的值与序列化结果，包括计量类别、估算量/准确量/可靠上界、tokenMargin 及应用后的准入量；调用者修改原 messages/tools/profile/definition 对象不得改变已检查的请求。直接调用 send 也只能消费可核实为 S-57 产物的固定计划；缺来源、被修改或无法验证的计划为 invalidInput{malformed}，不能用一个外部通过布尔值放行。发送阶段对固定请求的传输表示不得新增未计量输入；若必须变更，就回到新规划与检查，服务面不能在旧锚点下发另一份。

**本条新增输入拒绝子值闭合**（技术属性/枚举名，无独立词条；不新增 FailureCause 或 ResponseOutcome）：

| reason | 成立条件 | 操作映射 |
|---|---|---|
| `input_limit_missing` | 适用供给 cap 或必需 upstream fact 缺席 | `invalidInput{reason}`，不得补初值 |
| `input_limit_exceeded` | 准确量超过适用有限限制，或有依据 token 估算应用显式余量后超门 | `invalidInput{reason}`，按下述 metadata 区分估算拒绝与准确超限，不含请求内容 |
| `input_size_unavailable` | 输入表示材料或适用计量依据不足，不能完成全部限制检查；包括仅有超 cap 的保守界而准确值未知 | `invalidInput{reason}`，明确不可判的指标，不冒称上游限制未知或实际超限 |

**拒绝 metadata**：`input_limit_exceeded` 附 `metric`（恰为本次被拒限制的已有名字 maxInputTokens/maxImageBytes/maxImages/maxRequestBytes）及其计量事实，闭合为两类：准确计量 `basis = exact`、`actual`、`limit`；token 估算 `basis = estimated`、`estimatedTokens`、`admissionTokens`、`limit`，其中 metric 必为 maxInputTokens。estimated 禁止 `actual`，exact 不以 estimatedTokens 冒充 actual；这些是现有 invalidInput 子值的说明 metadata，不新增 FailureCause/ResponseOutcome/操作或档案字段。tokenMargin 与估算来源由同一固定计划可追溯，metadata 不披露原始消息或工具内容。数值均保持精确表示；limit 指本次实际触发的适用上限。线上成员封装仍归投影该操作的组合契约，本能力不另发 DTO Schema。

cap/必需 upstream 项的缺席由上述 missing 分支专门映射，不由通用 malformed 抹掉。存在但非正有限、tri-state 非法、供给 cap 大于同口径有限上游值沿 MP6（与 MP5 相同的表示拒绝）映射；不另造本地原因。全项缺失检查先于实际量检查；计量后若有准确超限或估算超门，先报 exceeded；两者同时存在时报告准确超限事实，否则报告估算拒绝。没有这两类拒绝而任一适用指标不可判，则报 size_unavailable。不能把估算拒绝写成实际超限，不能因某项可估算而省略 bytes/图数的精确检查。表示拒绝与「无法取得必需构件」的 unavailable 分开；其余原失败集合保持。

**传播**：三项新拒绝对 openCall 的完整 cap 校验及 dispatch/dispatchAgain/invokeModel/plan 均明确；检查失败零新锚点、零 HTTP、零响应体、零调用终结。新调用不取得可发出状态；已有调用保留原未完成阶段和责任，允许显式修正输入后再试或原 releaseCall，不把历史发出改成 undispatched。纯 plan 可重复无外部效果，重复拒绝不占序号；不发业务事件。invokeModel 发送前取消的先成立终局仍按 S-54，不因限额门改写取消/已发送事实。

**格式边界与当前责任**：本版不提供旧格式 codec、读取、认回或结算路径。显式输入不合本版表示时沿既有 `invalidInput{reason: malformed}`；cap/必需 upstream 项缺席仍按本条既有 `input_limit_missing` 专门映射，不能被通用 malformed 抹掉。需要的耐久内容无法按当前格式可靠解释时沿 `unavailable`，不降级到旧版本、不拿当前目录回填、不改写或清空用户旧数据。当前代际已受理调用的原锚点、中断意图、未知结果、恢复、认回、释放与结算责任全部保留；不能借本条换 ID 重发或遗弃尚未收口的工作。G-34 只保留当前格式采用与拒绝证据。

| 保证 | 单机兑现者 | 跨进程兑现者 | 做不到会怎样 |
|---|---|---|---|
| 最终实际输入与计量计划一致 | 规划/发送提供者共同持有固定值，服务写方只为该计划铸锚点 | 计划发送协议保持同一不可变内容和精确绑定，消费方验证来源与一致性 | 不得写新锚点/出网；不能证明时明确失败 |
| 计量类别及依据适用于绑定模型/供应商 | 计量/传输提供者给出 tokenizer 依据与显式余量；bytes/图数精确 | 协议保留同一来源、类别、版本、tokenMargin 与固定输入，不把估算变成实际 usage | 缺适用依据为 size_unavailable，构件不可取得为 unavailable；无来源估值不能放行 |
| 当前格式快照完整与在途责任 | 目录、runtime、MS6/MR8/LC6 写方与当前格式读写 owner | 各边采用本版精确链，保持当前调用与未知结果的完整事实 | 不裁剪或回填字段，不提供旧格式过渡；无法可靠解释明确失败，原在途 owner 责任不消失；G-32/G-34 阻断对应链 |

### S-75 完整响应事实与显式回复处置

S-29 带回复分支交接 MR8 唯一拥有的 `PendingModelResponse`（共享值名，无独立词条；[MR8 S-39](../../../data/model-response/v8/contract.md#s-39-pendingmodelresponse)，精确 Schema 为 `data/model-response/v8/model-response.schema.json#/$defs/PendingModelResponse`）。运行时不定义第二份共享 Schema。它必须保留 MR8 规定的全部已知可观察响应事实：原 ResponseId、调用/发出身份、完整 route 快照与参数事实、既定 outcome/reply、时序、账/用量/费用、trims、原始响应与多值头及所有原有可选事实。未知沿 MR8 的明确未知/缺席规则，不主动丢掉已知事实。该共享值禁止 replyDisposition 与 late，不以默认 persisted 伪造处置，不是可直接持久化的 ModelResponse。

1. runtime 保有未处分值与回复直到 S-17/S-49 或既有停止/恢复路径交接收口；调用者拿到完整事实后决定 persisted、vetoed 或 consumed。故障/无回复中断保持原已结算 MR8 分支，公开 invokeModel 的无会话 ModelInvocationResult 不被升级成 PendingModelResponse。
2. persisted 由实际调用方明确选定，连同原 MessageId/ResponseId 和同一回复按 S-69/S-70 构造完整 MR8，消息+响应+账同批；vetoed/consumed 通过 S-49 显式传入，runtime 构造完整响应。S-49 的输入/授权/失败/幂等/未知责任和不接 persisted 保持原九项。
3. 不带处分的共享值不允许送进 MR8 ModelResponse 保存入口，不能通过可选 replyDisposition 放宽持久 Schema。late 仅由实际提交者在 S-69 同次完整前缀下判定；未处分值缺 late 不表示“未晚到”。处置不改变原收场、回复和已知事实，争用仅可按既有规则重算 late，已提交原批优先。
4. 进程丢失未落盘回复仍沿 S-33 的已知内容丢失例外；宿主停止兜底沿 S-36，不能因本条新增 durable pending、自动处分、再发或在线恢复。opened 未知强门优先，不能先交 PendingModelResponse/内容再等锚点。

| 保证 | 单机兑现者 | 跨进程兑现者 | 做不到会怎样 |
|---|---|---|---|
| 完整事实先交接、最终处分后成响应 | runtime 与调用方共同消费 MR8 PendingModelResponse；写方沿 S-17/S-49 | 交换边引用 MR8 唯一定义，显式区分未处分与完整响应 | 禁止持久化未处分值或默认 persisted；返回 unavailable 并保留 owner |
| late 只在提交点可判 | 全部实际响应写方与共同日志 | 同一完整前缀与原子尾比较责任 | 原 G-28/G-29/G-30 保持，不能用布尔占位关闭 |

### S-76 默认重试的显式历史依据

共享形状唯一归 `data.loop-extension/v6`：`AfterModelCallFailureSubject.retryConclusions`、`Conclusion.modelCallId` 与 `ModelRetryConclusion`。S-14/S-30/S-32 的既有结论、生效和身份语义保持；新增性质精确消费 [LC6 S-42](../../../data/loop-extension/v6/contract.md#s-42-失败结论的模型调用关联)、[S-43](../../../data/loop-extension/v6/contract.md#s-43-失败主体的完整重试结论)。技术属性/投影名无独立词条，不新定义领域对象。十三操作数目不变。

1. **源写入**：after_model_call/failure 的每条 Conclusion 必须由 runner 写明 modelCallId，取自同次合法 failure 主体 dispatches 的唯一调用身份；不可借工具动作 callId 或当前活动调用补值。原结论先落后生效，后续发出是否已经发生不影响这条 retry 已给出的事实。其它位置不带 modelCallId，原动作 callId 规则保持。runner5 的此项是新写方必需责任，不以实现长期 unavailable 代替。
2. **构造主体**：本能力在 S-29 failed 分支及 S-34 的 failureSubject 重取分支，从合法完整会话日志前缀取同一 session、同一 callId 到该前缀为止所有已生效 output.kind=retry 的 Conclusion 原值，按日志顺序组成必填 retryConclusions；与完整 dispatches/profile 一起交付。任何出具件都保留，不丢 extension/plan/at 等成员；不按值去重（两个相同值的合法条目仍是两次），不按时间戳重新排序，不只收已发生下一次发出的结论。确无这些结论才显式空数组；源不可读、归属/完整性不能确认则 unavailable，不把不确定改成空历史、策略拒绝或新模型故障。
3. **默认件的次数**：S-35/S-60 decideRetry 唯一消费上述主体与显式政策，无持久读或私有计数。令 h 是其中 extension 等于 S-67 默认件 name `omne-official:default-retry` 的结论条数；下次由该默认件给出的 retry 的 `n=h+1`。不允许回退且 h>=1 时默认件不再给 retry；h=0 时仍按 S-35 故障类别与守卫判断。同家的 runtime_lost 续接不产生 retry 结论，不占这个名额；自定义件的结论保留但不算作默认件自身给出的次数。允许回退时下一家仍按最近发出供应商与原档案次序，不以历史数组新造路由规则。
4. **先给后发**：已提交 retry、下一次发出尚未发生，重放使用原最终结论而非重跑同次经过；S-35 的计次已增加。不能因新一次输入限额拒绝、凭据失败或停机而删除该已给事实。主体是所依据前缀的值，不授予自动重试；实际再次发出仍逐次经过 S-30/S-50 守卫、S-74 最终门与 S-15 锚点。
5. **失败与恢复**：非法主体沿 invalidInput{malformed}；必要历史不可判沿 unavailable；完整确定的“不再试”策略结论是 observed，三者分开。若失败响应已经提交但主体暂不能构造，响应与账保持，调用等待既有决策责任，操作不谎报历史可用，也不回到可重复 send 的阶段；来源恢复后由调用者调用 S-34 readAttempts 重取完整 failureSubject。S-33 对账返回 awaiting_decision 的调用也通过 S-34 取得主体，不重新 dispatch 或增设在线恢复操作。S-34 的同一完整前缀及重复规则共同适用。历史 LC4 缺关联不得猜同调用，版本边界沿 S-74/G-34；新 LC6/runner5 消费链须实际提供关联后才算这项交付完成。

本条补足 `[A,A]` 的两个合法历史：首次 runtime_lost 后续接且尚无默认 retry，h=0；首次策略故障、默认件已给 retry 后再次失败，h=1。两者保留同样的供应商序列而必须得出不同策略结果。S-60 retryDelay 的 previousDelay 对 decorrelated 仍显式给定，本条不改变该公开纯函数的输入关系。

| 保证 | 单机兑现者 | 跨进程兑现者 | 做不到会怎样 |
|---|---|---|---|
| 生效结论显式关联模型调用 | runner5、共同日志、runtime 主体生产者 | 结论保存边明确 modelCallId 与会话条目壳，回放保持原值 | 新结论缺关联即拒；历史不可判 unavailable，不隐藏计数 |
| 完整有序 retry 历史 | 有合法完整前缀读取权的主体生产者 | 同一权威前缀和未裁剪结论交接 | 不可确认即 unavailable；不能将 [] 当缺失缺省 |

## 十二、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决，实现不得据一个看起来合理的猜测推进。

| # | 缺口 | owner | 闭合条件 |
|---|---|---|---|
| G-1 | **已闭合**：`data.model-response` 已有 `interrupted.initiator` 三值与那几行、`attemptId` 在每一次发出上、`route.profileSnapshot` 与 `route.credentialScope`、`late`；本契约各处引用那里的条款号 | — | — |
| G-2 | **已闭合**：五种记录的形状归 `data.messages/v6#S-49`、`#S-50`（D-060 §S16 S16-d） | — | — |
| G-3 | **已闭合**：`ModelCallRequest` 定形（D-060 §S16 S16-c）；第一轮评审处置改为 `target` 恒在、加 `basis`、`tools` 是模型面名字（[S-28](#s-28-opencall) ①） | — | — |
| G-4 | **已闭合（主线裁定，见 [D-060 §五 K42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)）**：「用哪个模型」那项设置的允许集合**取值域是路由名**，与「设置记路由名」一致；它作为显式参数进 `capability.model-profile-directory/v5#S-17` 末段的规则（[S-11](#s-11-合法目标集合)）。**本行只闭合取值域**；这一项从哪来、是设置还是权限、锁与 `A` 的关系另立 [G-19](#十二已知缺口)（2026-09-25 按 [D-063 R-4](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) 闭合）（[D-060 §七 M17](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)） | — | — |
| G-5 | **`status_cause_table` 的内容**：OpenRouter 各状态码归哪个成因。**`402`、`403` 两行已按成因定义定下**（[S-18](#s-18-成因按来源分类三类事实由守卫兑现) 末条：`402` ⇒ `credential_unavailable`、`403` ⇒ `request_rejected`；主线 2026-09-25 裁定，报产品负责人知悉），前提是这两个码的含义取证属实；其余各行的取证仍开着（提供者给出的候选表每一行都还是待核对主张，见[验证入口修订波表](../verification.md#修订波2026-09-25pi-ai-传输节点反推)）。**另一项前提**：首 token 之前的带内错误的 `code` 查同一张表，要上游带内 `code` 与 HTTP 状态是同一套码（S-18 表第四行） | 提供者设计（据 OpenRouter 文档取证） | OpenRouter 错误页入研究，表逐行对上；带内 `code` 的码空间核实 |
| G-6 | **脱敏三个具名参数的取值**：`credential_fragment_min_length`、`credential_header_names`、`credential_patterns` | 提供者设计 ＋ 安全评审 | 取值定下，并以哨兵串场景（S-46）验证 |
| G-7 | **已闭合**：首 token 之后停机 = `interrupted{runtime_lost}`（D-060 §S16 S16-g） | — | — |
| G-8 | **已闭合（2026-09-25 修订波，[D-063 R-6](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)、[D-060 §八 N-36](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）**：原「退避值取多少」改为**策略配置项与默认初值**——`default_retry_backoff` 是一个可配置策略对象（`kind`、`base`、`factor`、`max`、`jitter`，[S-35](#s-35-默认重试件可替换) 第 4 条），次数不是独立参数、由允许的供应商个数与回退声明推出；默认初值放配置层（N-36 记下的那一组），本契约不填值。同家要不要再试已裁（不允许回退时同家至多一次，D-060 §S16 S16-g） | — | — |
| G-9 | **当前输入端口已成候选，真实生产者验收未开始**：S-66 由输入提供者持久读取真实会话配方和本机当前持有/配值，并每次独立核实当前成员有效性与内部调用权限；captured standing 只作配方，不能替代 AE4 PRE-3。runtime 每次发出前纯求值两个时限；历史 manifest E 不闭合本缺口。缺项/非法/不一致/不可读、当前资格失效或无法核权均零出网，不设默认数值 | 当前输入提供者 packages/assets/evaluation-input-store、runtime 与 acceptance app owner | 真实持久读取、旧 captured effective 但当前失效/未知/无权、配值变更无需 reload、固定根 C16 失配、租户错配、缺时限零 HTTP 的组合验收，并经独立评审接受 |
| G-10 | **传输适配十一条中依赖研究假设的几条**（1、2、4、5、7）：所选传输库（D-019）的缺省行为只有研究里的假设，未升 basis | 提供者设计（`realization/packages/model/pi-ai-transport` 节点） | **pi-ai 传输节点的符合性测试 T-1～T-11 通过**：fork 之后十一条都由本项目的传输适配主动做到、不再依赖上游库的缺省行为，所以证据是对本包的测试，不是 basis 条目（主线裁定，D-060 §八 N-40 ④） |
| G-11 | **本契约对 loop 与会话生命周期的三项义务尚无对方条款**：① **用户取消运行时**，宿主先 `interrupt(run_cancelled)`、让调用方收口，再停（没做到时本能力写的那一条没有回复；系统发起的停止本来就不产出回复，[S-36](#s-36-宿主停止与撤除)）；② 交回的回复在调用方结束这一步之前收口——落盘成消息或调 [S-49](#s-49-settlereply)（[S-17](#s-17-结算一处按序幂等先到者赢)）；③ 会话重新承载之后、会话级的调用打开之前调 [S-33](#s-33-reconcile)（不属于任何 Run 的调用由它收口） | loop 那一程与会话生命周期（主线） | loop 契约与会话生命周期契约写明这三项 |
| G-12 | **中心 ↔ 据点的线上形状与协议义务**：[S-38](#s-38-装配给的保证-vs-协议须给的保证) 右两列里跨中心与据点的几行 | 架构（组合契约起草） | 那份组合契约成立并逐行兑现 |
| G-13 | **已闭合（修复波 1b）**：`settleReply`（[S-49](#s-49-settlereply)）、`openCall` 的 `basis`（[S-28](#s-28-opencall) ①）、`reply_pending`、会话重新承载时的对账时机、`canDispatchAgain` 收 `plan`，主线接受，见 [D-060 §六 N-9](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加) | — | — |
| G-14 | **已闭合**：`capability.stream-assembly`、`capability.modality-projection`、`capability.asset-evaluation` 登进 catalog，S-4 表补齐；`capability.loop-extension-runner` 只是指路、不登（它消费本契约，反向登记会成环）。`data.arrival-events` 起初也只指路，2026-09-25 修复波 2 起据以写出 S-16、S-51 的承诺，登依赖（第二轮评审 R2-MRR-2） | — | — |
| G-15 | **已闭合（主线裁定，见 D-060 §二 S-U24-5a～b）**：同标识覆盖挑胜者时**先滤掉已撤回的行、再滤掉这个范围不允许的行，然后取最具体一格**（类推 PF-002 §5.6 三小步「禁用滤 → 谁可以使用它滤 → 取最具体」）；模态不兼容与缺凭据不滤、胜者站住，出门前才挡。落为 [S-10](#s-10-有效模型四步每步来源可查) 第 2′ 步与代价一段、[S-11](#s-11-合法目标集合) 的胜出行、[S-9](#s-9-选中模型) 名字不变落点会变一条（PF-013 rev 12 起设置记路由名，「覆盖」改称「把路由名解析为一行」）；`capability.model-profile-directory` v5 S-17 末段同改 | — | — |
| G-16 | **已闭合（主线裁定，见 D-060 §二 S-U24-5c）**：被盖住的同名行照列、每行带自己的来源，并带注记 `overridden_by{scope}`（被那一格的同名档案覆盖）；PF-013 rev 12 起列表每个名字一条，被盖住的行列在那一条之下；怎样呈现归 PF-016。落为 [S-12](#s-12-展示列表) | — | — |
| G-17 | **从 `resumable` 放手时上交带什么**：最近一次发出是失联补写的 `interrupted{runtime_lost}`，不是故障、没有成因；本契约只写 `released`、不带 `cause`（[S-32](#s-32-releasecall) ④）。上交条目在这种情形下带什么成因（或不带），产品正文与上交条目的形状都没有说 | loop 那一程（上交条目的形状归 PF-011）；产品语义有疑问报 PF-013 owner | 上交条目的规则写明这种情形；若要一个成因，`data.messages/v6#S-50` 与本契约随之改 |
| G-18 | **已闭合（修复波 1b，主线裁定，见 [D-060 §六 L4](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)）**：「已出门」（`data.messages/v6#S-49`）另带传输适配在出网之前定下的 `parameterAdjustments` 与 `droppedParameters`，`data.model-response` 不放宽；追补体的参数三项从它读（[S-7](#s-7-一次调用绑定了什么)、[S-29](#s-29-dispatch) ④、[S-33](#s-33-reconcile) ④、[S-38](#s-38-装配给的保证-vs-协议须给的保证) 传输适配第 10 条） | — | — |
| G-19 | **已闭合（2026-09-25 修订波，[D-063 R-4](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)）**：允许集合 `A` 的来源——**本版不收窄**，范围允许 = 这个范围里登记的全部档案，凭据可用即可用；`A` 由目录读面直接给（[S-11](#s-11-合法目标集合) 那一行），不从求值结果里取。将来要收窄作为设置走资产求值（PF-002），那时出新版本。**原缺口里的另一半——「用哪个模型」这项设置本身由谁产出、锁怎么判——不随它闭合**，另立 [G-20](#十二已知缺口) | — | — |
| G-20 | **判锁的技术路径已有候选，初值生产者仍开放**：AE4 根属性可选 `model`（RouteName）承接“用哪个模型”；按 S-66 读取当前输入后纯求值，成功且缺 model 即无锁，缺源/无法一致读取则 unavailable。新会话仍由独立装配显式 selectModel 写真实记录，不从目录第一行或 model 字段补初选。basis 沿本次 effectiveModel，保留到 openCall 的既有选择竞争窗口；已打开调用绑定不变。当前输入生产者尚未验收，初值的完整产品推出规则仍未定义 | 主线、PF-004/Agent 定义 owner、当前输入提供者与 runtime owner | 真实当前读取及判锁半支评审/验收；初值另以产品推出规则闭合，不自动撤掉本缺口 |
| G-21 | **已闭合（主线裁定，[D-060 §八 N-41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）**：有调用没结果、`ToolInternalMessage` 混进请求这两种规划拒绝**维持 `invalidInput{reason}`**——它们是调用方组装请求时的错误，不是发出被拒的成因；`data.messages/v6#S-50` 的 `undispatched.cause` 不放宽。落在 [S-28](#s-28-opencall) 出门前检查第 6 行与 [S-29](#s-29-dispatch) ④（规划仍拒时同样 `invalidInput`、不写记录、调用停在原状态） | — | — |
| G-22 | **上游此刻的输出上限没有来源**（2026-09-25 修订波）：`data.model-profile/v6#S-18` 要传输适配在上游此刻的输出上限低于参数时改值再发、记下实际发出的值；本程传输不取上游模型目录（依据 D-019「目录估价不得冒充」；主线已接受这一读法，D-060 §八 N-41），手里没有这一事实。**闭合之前（主线裁定，D-060 §八 N-40 ④）：不改值、按参数原样发**（那份契约 S-18 已标「有前提」）；上游因此拒收时照 [S-18](#s-18-成因按来源分类三类事实由守卫兑现) 归成因，不另造一种收场 | 主线 → `data.model-profile` 的新版本 | 这一事实有家并交进传输适配的规划——候选：将来 `data.model-profile` 新版本的档案属性 |
| G-23 | **已由 D-076 采用；实现证据仍独立**：原临时 `routeWireHints` 由 `data.model-profile/v6#S-29`～`#S-31` 的 `adaptation` 及 S-53/S-57 替代。缓存和提醒采用精确模型定义/配置，不按路由前缀猜，不保留空配置默认即可发出的旧读法 | 主线与 model-profile/传输提供者 owner | v3 数据、v3 runtime 与提供者映射整批对齐并接受，消费者显式切换 |
| G-24 | **已闭合（主线裁定，[D-060 §八 N-43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）**：`ModelCallRequest` 加成员 `report`——属于某个 Run 的调用必带，就是 `capability.loop-extension-runner/v3#S-21` ① `admission.report` 的同一份；不属于任何 Run 的调用不带、以 `within = session` 取条目。落在 [S-28](#s-28-opencall) ①（成员与 `within`）、③（与 `run` 同在同缺、核会话运行尝试三者）、④（续接重取）。不按当前快照代读报告那一份的理由原样保留：尝试中途有人 reload，当前快照与报告所依的就不是同一份 | — | — |
| G-25 | **本版候选采用边界**：RT8/MP6 已由 D-101 接受，本轮仅 MR8/RT9 为后继候选；Directory5/MS6/LC6 及其 MP5 表示资源保持，其他依赖不变。runner5 不消费此次 Timing 变化 | 主线 registry owner 与 MR8/RT9 owner | MR8/RT9 独立评审及正式采用；提供者实现与真实恢复另验，规格接受不代表实现 |
| G-26 | **精确版本引用与撤除的提供者保证仍待真实组合验收**：S-53/S-64 要取得与停准入有顺序、旧引用收口后才释放；主线 Adaptation 模型补充有限引用/撤除行为，不能代证外部执行实际停止与真实资源释放 | 主线与注册提供者 owner | 对照注册/撤除模型与否定配置完成真实组合证据，经独立评审接受；旧模型与原型不代证产品实现 |
| G-27 | **已由 D-076 采用，未改变关系**：S-60 按主线技术裁定补 uniformSample、n、previousDelay 及四种 jitter 关系，不指定 RNG、不填初值、不取整 | 主线与重试政策 owner | 评审新关系与端点/非法配置场景，显式接受后才能声称已采用；不能拿旧版接受当作新关系的依据 |

| G-28 | **生产 Run 终结认法未定**：完整前缀中怎样认出原 Run 已终结由 loop 那一程给；原 `capability.run-attempt-facts/v2` G-3 仍开放。本能力不消费其两个 bool 替代同次前缀，也不以 model_call_ended 判 Run；此前不能把未知解释为未终结 | 原 loop/Run 事实 owner、runtime/回复提供者 | 真实形状或约定读取键被明确采用，所有结算方能从同一合法完整前缀解释；fixture 不闭合 |
| G-29 | **共同业务键及真实提交/恢复组合仍未验**：沿日志节点 v2-design G2-2 的共同 codec、稳定 ResponseId/MessageId、完整原批认回；S-69/S-73 还依赖真正共同物理日志的比较、全批与持久化、旧写方实际停止 | 日志提供者、runtime、全部回复写方与主线 | 新投影精确采用 SL3/RT4，真实文件、多写方、竞争/丢回执/重启及负控证据闭合；能力正文不代定字节编码 |
| G-30 | **合法完整前缀的实际读取授权与供给未验**：受限读方不能凭一个真实尾取得未授权的整本历史，也不能以局部结果声称完整 | 会话访问授权/宿主装配 owner、日志与实际结算者 | 采用关系和身份边界给出合法完整读，不能满足时 unavailable；D-081 改票条件仍有效 |
| G-31 | **表示与交接已有候选，正式采用及真实链未完成**：MR8 S-20 给出 string／有序 string[] map；本候选 S-58→S-54→S-17 明确同次 `rawHeaders` 原值交接。旧 MR4 string-map 仍拒数组，不能将数组写进旧消费链；本候选不把该缺口标为已关闭 | 原 runtime/response 表示 owner、core／transport／共同日志构件／全部响应写方与主线 | MR8/RT9 正式采用；core 公开完整接收、runtime/transport/codec 提供者投影与实际写方显式采用；真实 TLS→invoke→同次 append→reopen、秘密哨兵及行为负控完成。日志 JSON 保真与候选 Schema 通过不代证 |

---

| G-32 | MR8/RT9 两候选须完成精确引用、登记与独立评审。其余已接受共享数据不升级；完整已知事实、PendingModelResponse 的实际时刻与重试历史保持 | 主线 registry owner 与 MR8/RT9 drafter | 两候选精确条款、registry 和 Schema 对齐并正式采用；真实写方与恢复故障证据缺口不因此闭合 |
| G-33 | 适用 tokenizer 估算/准确计数/可靠上界依据及合法固定附件材料未普遍建立；不得以无模型依据字符比例或 AttachmentRef.bytes 放行 | 模型/计量/传输提供者与输入材料 owner | 逐模型、供应商、版本明确 tokenizer 估算或准确计数/可靠上界证据；引用取得另有明确授权端口 |
| G-34 | 当前格式的精确采用、不兼容旧值的明确拒绝及当前在途责任保留尚需真实证据 | 主线、当前格式读写方、runtime 与全部写方 owner | 不建立旧 codec 或旧读取/认回/结算路径，不回填/改写/清空用户旧数据；当前代际的原事实、未知结果及恢复释放责任保持 |
| G-35 | 候选最小源字段已由主线确定：LC6 modelCallId/retryConclusions；当前格式真实 writer/reader 与不兼容值拒绝证据未完成 | LC6、runner5、runtime/日志提供者与主线 | 新结论实际带关联，构造完整原历史；已给未发、跨调用、自定义件与失联续接反例完成，不以候选或 unavailable 代实际交付 |

## 十三、消费者核对

本节不新增承诺，只走一遍具名消费者的路径。**发现不够用时回到本契约补条款，不在消费者那边自己算一份。**

| 消费者 | 它要什么 | 本契约给什么 | 够不够 |
|---|---|---|---|
| **agent loop：「等模型」** | 打开、发出、等收场、拿回复、失败交拓展件、再发或放手、交回的回复怎样收口 | [S-28](#s-28-opencall)～[S-32](#s-32-releasecall)、[S-49](#s-49-settlereply) | **够**；loop 那一侧的三项义务在 [G-11](#十二已知缺口) |
| **agent loop 与会话生命周期：先对账** | 每次没收场的调用该怎么接，含不属于任何 Run 的 | [S-33](#s-33-reconcile) | **够** |
| **「调模型之前」的 `select_model`** | 合法目标集合 | [S-24](#s-24-legaltargets) | **够**；它改的目标在 [S-28](#s-28-opencall) 出门前检查里再核一遍 |
| **拓展件执行器：判一条 `retry` 结论合不合法** | 在结论落日志之前、不发出就判出守卫的答案 | [S-50](#s-50-candispatchagain) | **够**；与 [S-30](#s-30-dispatchagain) 同一张表 |
| **「调模型之后」失败那一维的重试件** | 状态码、成因、档案两项声明、已试过哪些 | [S-29](#s-29-dispatch) ⑤ 的失败返回（`data.loop-extension/v6#S-14` 的主体）＋ [S-34](#s-34-readattempts) | **够** |
| **交付面：切换命令、模型列表** | 展示列表（每条带来源、标出选中那一条）、切换 | [S-25](#s-25-displaylist)、[S-27](#s-27-selectmodel) | **够** |
| **交付面：停止按钮** | 中断这一次 | [S-31](#s-31-interrupt) | **够** |
| **成本明细与排查** | 每次发出一条响应体、真实费用、原始响应；账归谁 | [S-17](#s-17-结算一处按序幂等先到者赢)、[S-19](#s-19-凭据每次发出现取取值只交给传输适配)、[S-20](#s-20-写入之前脱敏) | **够**；归属由条目壳给（`data.call-accounts/v2#S-25`） |
| **应用装配（据点）** | 传输能承载的模态、传输适配 | [S-11](#s-11-合法目标集合)、[S-38](#s-38-装配给的保证-vs-协议须给的保证) | **够**，前提 G-10 |
| **到达装配**（`capability.stream-assembly`）：模型侧的宿主 | 它 S-28 的第 1、2、4、6、7、8、9 条由宿主兑现 | [S-51](#s-51-模型侧到达装配前提的承诺) 逐条 | **够**（那份契约的 G-2 随之闭合） |

---

## 十四、版本差异与规范工件

**本版从 D-101 已接受 RT8 演进**：保留原 S-1～S-73 的未变化性质、十三服务操作及九项、公开函数、四种 outcome、头事实、生命周期和 SL3 结算。保留 MP6 的 token 计量语义，切换 MR8 的恢复时序表达；Directory5/MS6/LC6 及其 MP5 表示资源保持；继承 S-74～S-76 与 S-34 失败主体重取，不新增服务操作或运行时线上 Schema。输入拒绝不改为上游成因；未处分值由 MR8 定义；重试历史由 LC6 定义。本版运行面统一采用本版精确链，不为旧消费者保留兼容路径；不静默回填、改写或清空旧记录。

**来历**：起草之初档案登记、撤回、凭据绑定与调用放在一份契约里，操作是 `invoke`（内部循环重试）；主线后来把它拆成中心侧 `capability.model-profile-directory` v5 与据点侧本契约（[D-060 §块 C 拆分提案](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#块-c-拆分提案报回的推荐-aaa目录独立插件中心运行时选择与调用同在据点模态转换独立登记表据点)），
并把调用拆成 `openCall`／`dispatch`／`dispatchAgain`／`interrupt`／`reconcile`（重试不在调用内部循环，经拓展件与发出守卫）。拆分前的草稿从未成稿，不构成前身。
**第一轮独立评审处置**（2026-09-24，未冻结，原地改）：指认调用的操作加 `session`；绑定落在「已出门」；加 `reply_pending` 状态与 [`settleReply`](#s-49-settlereply)、只读守卫 [`canDispatchAgain`](#s-50-candispatchagain)；再发时取不到凭据写 `released{cause}`；合法目标回到三项、传输承载是可发出的另一条前置；`openCall` 的 `target` 恒在、加 `basis`。**修复波 1b**（同样原地改）：「已出门」带传输适配的改值与丢项、追补体参数三项从它读；新增 [S-51](#s-51-模型侧到达装配前提的承诺) 与场景 [S-52](#s-52-模型侧的装配宿主被拒的增量报一次收场之后的事件不进)；传输适配由九条增为十一条。影响记在[验证入口](../verification.md#变化的影响)。

**本版的规范工件**：本文件、[`examples.md`](examples.md)、[formal 入口](formal/README.md)、[`consumer-impact.md`](consumer-impact.md)，四份逐字继承 RT5 的模型与十九份配置，以及 S-74/S-75/S-76 的新行为模型与配置；新增头事实交接没有进入这些模型，须以本版规范场景和真实组合验证，不能据继承的断言声称已覆盖头事实。S-66 的新输入端口与续接输入分支另由规范场景和真实组合验收承接，未由旧模型覆盖。v2 Invocation 模型原字节复用，只支持原有有限范围；新版本绑定与函数内容门不在它的证明范围内。执行结果在[验证入口](../verification.md)，不写进本版本目录。

**发布后**：本目录下的规范正文、实例与模型不可原地覆盖；修改发布新版本。[已知缺口](#十二已知缺口)里改变语义或表示的项在冻结之后闭合，**出新版本**；冻结之前在本候选里原地改，每次改在[验证入口「变化的影响」](../verification.md#变化的影响)记一笔。

## 报给主线

本版为 candidate。S-74 有限 cap 与实际最终输入检查沿 PF-013 rev15 的用户明确裁定；原有限 cap 来源为 rev14/D-096；字段、失败子值、共享未处分值及历史事实的精确名字按主线账本对齐。新增属性/值均是既有概念的规格投影（无独立词条），不定义新领域对象。

G-32 记录跨包 Schema/条款定型及 registry 整批落点；G-33 记录逐模型计量依据和无授权附件解引用；G-34 记录当前格式采用、拒绝旧不兼容值与禁止回填；G-35 记录重试历史证据关联。G-28 的生产 Run 终结认法仍由 loop/Run owner 提供，不由 generic bool 或测试载荷关闭。其余继承缺口保持 owner。

新形式工件只覆盖显式有限抽象，未运行时不声称无反例；实际状态在版本外验证入口。本次不写提供者设计、产品政策或接受记录。

## 继承的 v8 最小采用边界

前驱 RT8 仅调整 S-74、相应 S-54/S-57 显式计量输入、G-33 与规范模型/场景；本版逐字保留这部分计量性质。十三个服务操作、全部既有九项、原拒绝 reason 集合、37 个模型及其模态范围、零新锚点/HTTP/响应/终结、missing 优先、planned 固定及实际 usage 来源均保留。

MS6 S-49/MR8 S-40 只校验共享快照形状并明确将发送门交运行时；LC6 S-14/S-43 消费快照/绑定/重试历史；Directory5 S-36 消费完整档案与同名有限值纯比较，不认证计量。MP6 未改变这些结构或纯判定，故这些精确版本及其 MP5 Schema 不升级；具体坐标、依据与验收在 consumer-impact.md。保留仍被消费的表示资源不是新增旧运行格式兼容。


## v9 恢复时序表示差异

仅采用 MR8 并补 S-17/S-33/S-36/S-54 的实际发送时刻投影；S-15 的锚点先行、S-16 的首 token 门、S-69～S-73 的完整批/未知责任、S-74 的全部计量和显式 tokenMargin、十三操作九项均保持。data.messages/v6 没有新增时间字段；不升级 MP6、Directory5、LC6 或 runner5。RecoveryTiming 的有限模型只验证锚点/实际发送分离、时刻真实保留与 null 不放行重发，不代证日志真实故障与写入实现。证据义务见版本外 verification。

本轮主线技术澄清已落 MR8 S-9/S-11 及本版 S-33：参数三项保存同次固定最终计划的适配结果，实际发送时须一致；零 send／发送不可判的 interrupted 仍原样还原，不以参数存在或 sentAt:null 推断未发送、零费用或重试资格。既有 requested/adapted 区分与恢复来源不变；不扩大 MP/MS 或产品边界，候选尚待独立审查及接受。
