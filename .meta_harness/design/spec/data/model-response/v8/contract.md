# data.model-response v8

> 当前规范范围见 catalog。从已接受 MR7 演进，只补已确认耐久「已出门」责任在实际发送时刻不可用时的诚实表示；不改变首 token、收场、账、重发或精确数据依赖。技术语义由本轮主线施工简报裁定，接受由主线另行记录。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.model-response, 8)`；`family=data`、`topic=model-response`。
- **状态**：当前采用范围见 catalog；前驱 MR7 的接受见 registry。本版采用范围以 catalog 为准。
- **设计依据与需求 rev**：PF-013 rev 15、PF-009 rev 8、PF-004 rev 13、PF-012 rev 15、PF-001 rev 23、PF-011 rev 4、PF-010 rev 6。继承 MR7 的相同消费范围；PF-013 rev15 token 估算增量不改变本响应的实际用量或费用。此次只消除耐久锚点先于真实传输、恢复又须结算所造成的时序表示矛盾，不改变产品重发政策。
- **精确语义依赖**（引用名字，不复制定义）：

  | 坐标 | 取它的什么 | 状态 |
  |---|---|---|
  | `omne-harness-lite-design-2026-09-15 · data.call-accounts · v2` | `$defs/Usage`、`$defs/Cost`（[S-19](#s-19-用量与费用)）；`CostCorrection`（[S-17](../../call-accounts/v2/contract.md#s-17-costcorrection事后补账)）、有效费用与汇总的规则（[S-22](../../call-accounts/v2/contract.md#s-22-有效费用)、[S-23](../../call-accounts/v2/contract.md#s-23-汇总已知之和与未知笔数)；本契约 [S-5](#s-5-与别的形状的关系)、[S-19](#s-19-用量与费用)）；**一笔账归哪次尝试、哪个运行、哪个租户的权威在承载它的条目**（[S-25](../../call-accounts/v2/contract.md#s-25-按尝试记明细按-run-汇总)；本契约 [S-7](#s-7-所属的那次调用)、[S-8](#s-8-第几次发出)、[S-19](#s-19-用量与费用)）；`$defs/RunId`、`$defs/AttemptId`、`$defs/ModelCallId`（[S-37](../../call-accounts/v2/contract.md#s-37-三个归属标识的家runidattemptidmodelcallid)）；`$defs/TrimSummary`（[S-15](../../call-accounts/v2/contract.md#s-15-trimreason-与-trimsummary砍了要说)，[S-19](#s-19-用量与费用) 的 `trims`）；「用量归凭据那一格」（[S-38](../../call-accounts/v2/contract.md#s-38-两种归属用量归凭据那一格成本归发起者)，[S-9](#s-9-路由留痕) 的 `credentialScope`）；「晚到的账」的条件与含义（[S-39](../../call-accounts/v2/contract.md#s-39-晚到的账)，本契约 [S-35](#s-35-晚到的那一条) 的 `late`） | 已接受、已冻结 |
  | `omne-harness-lite-design-2026-09-15 · data.content-blocks · v3` | `$defs/ContentBlock`（[S-14](#s-14-回复与已交付部分) 的 `delivered`）、`$defs/AttachmentRef`（[S-20](#s-20-上游原始响应留存) 的 `raw.body`）；没长完的工具调用两位皆假（[S-13](../../content-blocks/v3/contract.md#s-13-半截的工具调用)，本契约 [S-14](#s-14-回复与已交付部分)） | 已接受、已冻结 |
  | `omne-harness-lite-design-2026-09-15 · data.messages · v6` | `$defs/AssistantMessage` 及其 `response`、`ending` 两个成员（[S-9](../../messages/v6/contract.md#s-9-assistantmessage一次回复只有一份)、[S-10](../../messages/v6/contract.md#s-10-assistantmessage-怎么收的尾)；本契约 [S-14](#s-14-回复与已交付部分)、[S-13](#s-13-收场与其余成员的条件关系)）；中断提醒补在哪几种收场之后、`hadContent` 说什么（[S-10](../../messages/v6/contract.md#s-10-assistantmessage-怎么收的尾)、[S-21](../../messages/v6/contract.md#s-21-中断之后必补一条)，本契约 [S-5](#s-5-与别的形状的关系)）；「已出门」「已开口」两种记录（[S-49](../../messages/v6/contract.md#s-49-模型请求运行时写的五种记录不是消息)：`ResponseId` 在「已出门」上定下、首 token 时刻在「已开口」上，「已出门」还带着要求的那一组参数与传输适配定下的两份处置清单，本契约 [S-6](#s-6-responseid)、[S-17](#s-17-首-token-与时序)、[S-11](#s-11-实际发出的参数改过的值与没发出去的项) 第 4、6 条）；系统发起的运行取消不交出回复（S-10 的回复流对应，本契约 [S-12](#s-12-收场)、[S-13](#s-13-收场与其余成员的条件关系)） | 已接受、已冻结；精确采用本行坐标 |
  | `omne-harness-lite-design-2026-09-15 · data.model-profile · v5` | `$defs/ModelProfileRef`、`$defs/ProviderName`、`$defs/ModelRequestParameters`、`$defs/ModelProfileSnapshot`、`$defs/ModelAdaptationBinding`（S-29～S-31；本契约 S-36）（[S-9](#s-9-路由留痕)、[S-11](#s-11-实际发出的参数改过的值与没发出去的项)）；每一次发出只走允许的供应商里的一家、第一次走第一家、不许回退时只走第一家（[S-5](../../model-profile/v5/contract.md#s-5-providername-与允许的供应商)、S-6，本契约 [S-9](#s-9-路由留痕) 的 `provider`）；`extra` 出现时至少一项（[S-19](../../model-profile/v5/contract.md#s-19-extra)，本契约 S-11 的 `parameters` 里 `extra` 的键全没发出时整个缺席）、项与项名（S-20）、adapter 的三种处置与各自的留痕义务（S-21）——留痕的形状落在本契约 [S-11](#s-11-实际发出的参数改过的值与没发出去的项) | 已接受、已冻结；精确采用本行坐标 |
  | `omne-harness-lite-design-2026-09-15 · data.loop-extension · v6` | `$defs/FailureCause` 的八个取值（S-17，[S-15](#s-15-故障的成因与原样状态码)）——**名字由它定，本契约 `$ref`**；「调模型之后」哪几种收场触发、按什么维度（S-2，本契约 [S-5](#s-5-与别的形状的关系)）；重试挂件的完整失败主体与已生效重试结论（S-14、S-43，本契约 [S-3](#s-3-消费者)、[S-5](#s-5-与别的形状的关系)、[S-23](#s-23-同一次调用的响应体序列)）；模型回复在落盘之前被否决之后走哪一路（S-25，本契约 [S-14](#s-14-回复与已交付部分)） | 已接受、已冻结；精确采用本行坐标 |
  | `omne-harness-lite-design-2026-09-15 · data.offer-expiry · v1` | 时间点表示 `$defs/Instant`（[S-17](#s-17-首-token-与时序)）。**依据是 [S-22](../../offer-expiry/v1/contract.md#s-22-schema-的范围) 末句（时间点的规范形式）加上它的 Schema `$defs`**——S-22 那张「可复用形状」表只列了三样，`Instant` 不在表里；那份契约已冻结，本契约不据此另立一份 | 已接受、已冻结 |
  | `omne-harness-lite-design-2026-09-15 · data.identity-values · v1` | [S-31](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示) 不透明标识的交换表示——**按它的散文自定义** [S-6](#s-6-responseid) 的 `ResponseId`，不 `$ref` 那里的 `OpaqueIdentifier`；[S-16](../../identity-values/v1/contract.md#s-16-按归属层显式携带身份值) 按归属层显式携带身份值，据以写出 [S-7](#s-7-所属的那次调用) 的租户归属一段；[S-11](../../identity-values/v1/contract.md#s-11-scopelayeridentity) 的 `ScopeLayerIdentity`（[S-9](#s-9-路由留痕) 的 `credentialScope`） | 已接受、已冻结 |

- **本契约不依赖任何 capability 契约。**正文里出现的 `capability.model-request-runtime` 标的是
  **「谁写这条响应体、谁兑现某条性质」这个落点**，方向是那份能力契约 → 本契约；它不在 catalog 的 `dependencies` 里
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如 `data.model-response/v8#S-13`

## 本版运行格式边界

本版运行面只消费本版及其**精确依赖链**规定的当前格式。不为被替代的旧接口、旧格式或旧实现提供兼容入口、双轨执行、降级、回填、旧格式只读、认回或结算路径；历史规格与证据保留不构成这些运行承诺。不原地改写、清空或补造用户已有数据；遇到不兼容值沿本契约既有表示拒绝或操作失败边界明确失败，不静默转成当前值，也不新增失败枚举。

**当前代际已经受理的任务与产生的历史事实仍受原保证约束**：同一调用的不可变快照、已有提交与未知结果、恢复、认回、释放和结算责任不因本次演进而消失。这里删除的是旧格式过渡路径，不能据此遗弃当前在途责任、换身份重发、改写原记录或用当前目录覆盖原快照。仍被本版精确引用的 IV、CB、日志、资产及 hooks 等契约按各自版本消费，版本号较小本身不表示兼容过渡。


## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| 每一次发出只走一家；试过又失败的那几次各是一条留痕，不进方程 | [PF-013 §5.5 试过又失败的那几次，留痕，不进方程](../../../../product/PF-013-model-profiles-and-invocation/design.md#试过又失败的那几次留痕不进方程) | S-4、S-8、S-23、S-24 |
| 一次模型调用的状态与三个终态 | [PF-013 flows §3.2 一次模型调用](../../../../product/PF-013-model-profiles-and-invocation/flows.md#32-一次模型调用) | S-4、S-12、S-16、S-23 |
| 选中模型与有效模型；有效模型由层级求值与调模型之前的拓展件两件事决定 | [PF-013 §4 选中模型 与 有效模型](../../../../product/PF-013-model-profiles-and-invocation/design.md#选中模型-与-有效模型) | S-9、S-10 |
| 请求参数在档案上；一次请求实际带了什么留痕；不认的项不静默丢 | [PF-013 §4 模型档案](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案)；三种处置各自的留痕义务在 [`data.model-profile/v5#S-21`](../../model-profile/v5/contract.md#s-21-不静默丢也不静默改) | S-11 |
| 三类事实归本层定死；首 token 的判据与它的优先关系；回复完整回来却落不了盘的那一例 | [PF-013 §5.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#54-三类事实归本层定死其余照状态码) · [「已经开口说话了」优先于其余各类](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类) | S-13、S-14、S-15、S-16、S-17 |
| 用户中断不是故障，不带成因 | [PF-013 §5.4 还有一种「没走完」](../../../../product/PF-013-model-profiles-and-invocation/design.md#还有一种没走完它不在这张表里) | S-12、S-13 |
| 八个成因；状态码原样带着，不翻译 | [PF-013 §5.7](../../../../product/PF-013-model-profiles-and-invocation/design.md#57-上交带什么原样带着状态码不翻译它) | S-15 |
| 重试挂件看得到什么 | [PF-013 §5.12 它看得到什么](../../../../product/PF-013-model-profiles-and-invocation/design.md#它看得到什么) | S-3、S-5、S-23 |
| 停机之后看首 token；首 token 之后停机的那次调用就此收场、原因是运行时失联；两次发出两笔钱照实记；费用拿不到记未知，拿到了再补，在 Run 终结之后才到也照样归那个 Run | [PF-013 §5.13 停机之后：能不能重来，只看首 token](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token) | S-12、S-17、S-18、S-19、S-35 |
| 成因在这个边界上分类；事实归本 topic、策略归拓展件 | [PF-013 §6.11](../../../../product/PF-013-model-profiles-and-invocation/design.md#611-成因在这个边界上分类不丢进外层按异常形态分) · [§6.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#612-事实判断归本-topic策略归拓展件) | S-15、S-23 |
| 成因封闭、兜底也要留痕；状态码另外原样带着 | [PF-013 §6.14](../../../../product/PF-013-model-profiles-and-invocation/design.md#614-上交带的成因是封闭枚举外加一个诚实的兜底状态码另外原样带着) | S-15 |
| 错误信息外泄之前要脱敏；条目不可变，写错就是永久的 | [PF-013 §6.16](../../../../product/PF-013-model-profiles-and-invocation/design.md#616-错误信息外泄之前要脱敏) | S-21 |
| 流断在半路的五行表；故障断的已交付部分记在那次模型调用的账里、不成为消息；「已经开口」是账，最终的那一条引用它 | [PF-009 §5.6 流断在半路](../../../../product/PF-009-context-message-types/design.md#56-流断在半路) · [§6.9](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有) · [§9.2](../../../../product/PF-009-context-message-types/design.md#收尾之前拼到一半的那份是在途状态不是日志不是消息) | S-13、S-14、S-17 |
| 每条模型产出的内容记下实际生成它的模型；每一次模型请求有可追溯的实际组成 | [PF-004 §6.6](../../../../product/PF-004-agent-definition-and-assembly/design.md#66-模型在每次请求时确定) · [§6.1 不变式 I-5](../../../../product/PF-004-agent-definition-and-assembly/design.md#61-不变式) | S-5、S-9、G-9 |
| 成本明细按尝试记、汇总按 Run 算；不属于任何 Run 的调用归会话 | [PF-012 成本两层](../../../../product/PF-012-agent-loop-and-run/design.md#成本两层缺哪一层都会算错) · [PF-012 §4 Run 是三样东西的归属单位](../../../../product/PF-012-agent-loop-and-run/design.md#run-是三样东西的归属单位) | S-5、S-7、S-19 |
| Run 终结之后不再发起新的成本产生动作；已发起的账迟到了照样落、归这个 Run、标明迟到 | [PF-012 §6.17 I-11](../../../../product/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式)（rev 11 收窄；主线裁定，见 D-060 §S2 S2-d） | S-35 |
| 模型回复在落盘之前被否决：那份回复没有落盘，那次调用照常结束、记下否决，要再试是 loop 另起一次新的模型调用 | [PF-012 消息落盘之前的否决](../../../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前的否决按消息是谁产生的分三路)（rev 11 起写明）；主线裁定，见 D-060 §S8 S8-a | S-13、S-14、S-23 |
| 使用成本按租户归属、能出明细 | [PF-001 §6.4 隔离](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) | S-19、G-3 |
| 响应 ID、实际服务商、实际费用及来源显式交给模型执行 owner；拿不到标 unknown；无隐藏重试 | D-019 | S-9、S-19、S-24、G-8 |
| 所有模型请求统一经 OpenRouter | [SYS-LLM](../../../../foundation/cross-system-constraints/requirements.md#sys-llm) | S-9（`upstreamRequestId` 是 OpenRouter 的 generation id） |
| 单机交付，语义可扩展为分布式 | [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) | [第四节](#四装配给与协议给) |
| 完整响应体带四类 token 与 `cost_usd`；缓存拆读写两项；原始响应体留、走附件存储、保留期是设置项 | D-058 8b ／ Q14 | S-19、S-20 |
| 凡有回复即说清它成没成为消息 | 主线裁定，见 D-060 §S8 S8-e | S-13、S-14 |
| 本来就不成消息的两种回复：旁路提问的问和答都不进日志；压缩生成的摘要落成压缩记录那条消息，不是一条模型回复 | [PF-012 §4 Run 是三样东西的归属单位](../../../../product/PF-012-agent-loop-and-run/design.md#run-是三样东西的归属单位)（旁路提问）· [PF-010 要求三](../../../../product/PF-010-context-management-and-assembly/design.md#要求三有压缩记录时边界由压缩记录来定)（压缩记录）；它们在响应体上记成 `consumed` 是规格层按 D-060 §S8 S8-e 推出的：有回复就得说它成没成为消息 | S-14 |
| 档案快照随每一次发出留痕，档案不加修订身份 | 主线裁定，见 D-060 §块 C 对账 C-R1 | S-9 |
| 凭据那一格随发出留痕，出厂格那一把由部署装配配置 | 主线裁定，见 D-060 §S16 S16-f；[PF-013 §5.6](../../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上) | S-9 |
| `ResponseId` 在「已出门」那一刻定下、写响应体的各方沿用；`replyDisposition = persisted` 的那一条由调用方写，`vetoed`／`consumed` 的由运行时写 | 主线裁定，见 D-060 §S16 S16-a 与 §五 K15、K36 | S-3、S-6 |
| `parameters` 记实际发出的值、改值留 `parameterAdjustments`、`droppedParameters` 含 `extra` 键（K13）；`late`（K14，锚是发出所在的尝试，§四「K14」行）；归属的权威是条目、`attemptId` 只是事实、`initiator` 只指中断发起方（K16） | 主线裁定，见 D-060 §五 K13、K14、K16、§四 | S-7、S-8、S-11、S-12、S-19、S-35 |
| 系统发起的运行取消与宿主被撤下：在途的流被放弃，收场被中断、发起方 `run_cancelled`、没有回复；`extra` 去空之后整个缺席；「已出门」与响应体两份处置清单的登记口径 | 主线裁定，见 D-060 §七 M2、M12、M28 | S-5、S-11、S-12、S-13 |
| 被中断的发起方三值：用户、运行被取消或宿主停下、运行时失联；首 token 之前失联可以再发；首 token 之后停机是被中断而非故障 | 用户那一支见上面「用户中断不是故障」一行；另两支是主线裁定，见 D-060 §S16 S16-g、S16-i | S-12、S-13、S-23 |
| 尝试序号属于每一次发出、发出序号跨尝试连续 | 主线裁定，见 D-060 §块 C 对账 C-R7 | S-7、S-8 |
| 统一语言正式名 | [执行与收场](../../../../ubiquitous_language/terms/execution-and-outcome.md) · [能力与组成](../../../../ubiquitous_language/terms/capabilities-and-composition.md) · [记录与上下文](../../../../ubiquitous_language/terms/record-and-context.md) · [Agent 运行与循环](../../../../ubiquitous_language/terms/agent-runtime-loop.md) | 全部用词 |

> **这张表里没有产品行的条款**：[S-26](#s-26-schema-的范围)～[S-28](#s-28-表示层拒绝与判定分开) 与 [S-25](#s-25-装配给的保证与协议须给的保证)
> 的依据是 [SYS-SPEC](../../../../foundation/cross-system-constraints/requirements.md#sys-spec) 与 SYS-DEPLOY——表示、校验与「表示层不等于判定」是规格形式的要求。
> [S-18](#s-18-首-token-缺席是一条断言) 是规格层从 §5.13 推出的：「缺席 = 可重发」只有在缺席是确知时才安全。

## 一、目的与消费者

### S-1 本契约拥有什么

**一次发出的完整响应体**：这一次发出之后，系统就这一次知道的全部事实——

- **回复**（若有）：这一次拿回来的那一份，以及它**有没有成为消息**——它可能在落盘之前被否决，也可能本来就被系统拿去用、不成消息；
- **已交付但不成消息的部分**：开了口却没有交出回复时（首 token 之后的故障、开口之后被中断），用户已经看见的那些块；
- **用量与费用**，以及这一次的流上砍了多少；
- **路由留痕**：有效模型与它当时的档案快照、它怎么来的、走的那一家、用的凭据在哪一格、上游回报的名字与请求 id、交出去的参数与没发出去的项；
- **收场**，故障时的**成因**与**原样的状态码**，被中断时**谁中断的**；
- **时序**，其中首 token 是本层自己观察到的事实；
- **上游原始响应**的留存引用。

**一次模型调用可能被发出多次，每次发出留一条**——试过又失败的那几次同样各是一条（[S-4](#s-4-一次调用一次发出一条响应体)）。

它是一份**数据契约**：没有操作、没有状态转移、没有提交点，**因此不需要插件**。
有操作的是写它的那个运行时与读它的那些消费者，它们的义务各归自己的契约；本契约只说**这条记录是什么、哪些组合合法、各成员承诺什么**。

### S-2 本契约不拥有什么

- **请求怎么发、三类事实怎么判、要不要重试、什么时候算试尽**——归 `capability.model-request-runtime`。
  本契约只记下判的结果（[S-12](#s-12-收场)、[S-15](#s-15-故障的成因与原样状态码)），不定判法。
- **成因的定义**——`FailureCause` 八个取值的名字与含义由 `data.loop-extension` v6 定，本契约 `$ref` 引用。
- **账的形状**——`Usage`、`Cost`、`CostCorrection` 与汇总规则归 `data.call-accounts` v2。
- **消息与块的形状**——`AssistantMessage` 归 `data.messages` v6，`ContentBlock`、`AttachmentRef` 归 `data.content-blocks` v3。
- **档案与参数词表**——`ModelProfileRef`、`ProviderName`、`ModelRequestParameters` 归 `data.model-profile` v5。
- **到达语法**——一条回复怎样一段段到达、怎样拼成块，归 `data.arrival-events` 与 `capability.stream-assembly`；本契约只收拼好之后的结果。
- **上交条目**——一次调用了结不了时交出去的那条，形状归 [PF-011 §5.8](../../../../product/PF-011-off-nominal-handling/design.md#58-上交交的是什么)（PF-011 rev 4）；
  本契约的响应体不是上交条目，也不代替它。
- **记录条目壳**——这条响应体作为载荷落进哪条[记录条目](../../../../ubiquitous_language/terms/record-and-context.md#ul-record-entry--记录条目--record-entry)、那条条目带的会话、租户、效力与寿命宿主，归 loop 那一程（[G-3](#七已知缺口)）。
- **重试次数、退避时长、任何时限数值**——[PF-013 §6.17](../../../../product/PF-013-model-profiles-and-invocation/design.md#617-本-topic-不出现任何时限数值)：那是拓展件的配置。
- **不承诺任何对外交换格式。**[S-26](#s-26-schema-的范围) 只约束语义表示；线上形状归把它送过进程边界的那份 composition。

### S-3 消费者

| 消费者 | 读或写什么 |
|---|---|
| **模型请求运行时**（[UL-model-call](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call) 注意②，能力契约 `capability.model-request-runtime`） | **写**：每一次发出结束时恰一条（[S-4](#s-4-一次调用一次发出一条响应体)、[S-22](#s-22-写下即不变)）。**`replyDisposition = persisted` 的那一条由调用方与回复消息同一提交写下**；`vetoed`、`consumed` 的那一条（带着回复、却没有回复消息可与之同提交）与其余各条由运行时写，各在哪个提交里写归那份能力契约 |
| `data.messages` 的 `AssistantMessage` | 它的 `response` 成员**指回**产出它的那条响应体的 `id`（[S-14](#s-14-回复与已交付部分)） |
| **重试挂件**（挂在「调模型之后」、收场维度＝失败的[拓展件](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)，[PF-013 §5.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#它看得到什么)） | **它不读响应体**：它只凭 `data.loop-extension/v6#S-14` 的失败主体下结论（完整档案快照、这次调用已有的「已出门」记录、成因、状态码，以及 `data.loop-extension/v6#S-43` 的完整已生效重试结论）。同一次调用的响应体序列（[S-23](#s-23-同一次调用的响应体序列)）是**那份主体背后的事实**：走过哪几家、各自的收场、开没开口，两处说的是同一批事实 |
| 拓展件在「调模型之后」拿到的输入（`data.loop-extension` 的 subject） | 完整回复那一维取 `reply`、`usage`、`cost`，**只对落盘成了消息的那份回复**；失败那一维取 `failure.cause`、`failure.statusCode`，档案快照与 `route.profileSnapshot` 是同一份（[S-5](#s-5-与别的形状的关系)） |
| **拓展件执行器**（`capability.loop-extension-runner`） | `select_model` 与「消息落盘之前」否决模型回复这两种结论在响应体上的落点：`route.selectedBy` 的 `extension`（[S-10](#s-10-有效模型怎么来的)）、`replyDisposition` 的 `vetoed`（[S-14](#s-14-回复与已交付部分)） |
| **可追溯组成**（[PF-004 §6.6](../../../../product/PF-004-agent-definition-and-assembly/design.md#66-模型在每次请求时确定)、[I-5](../../../../product/PF-004-agent-definition-and-assembly/design.md#61-不变式)） | 「这一次实际用了哪条档案、怎么来的、实际发出了哪些参数、哪些改了值、哪些没发出去」——`route` 整体（[S-9](#s-9-路由留痕)～[S-11](#s-11-实际发出的参数改过的值与没发出去的项)）；其余组成不在这里（[G-9](#七已知缺口)） |
| **成本两层**（[PF-012](../../../../product/PF-012-agent-loop-and-run/design.md#成本两层缺哪一层都会算错)）与成本明细（[PF-001 §6.4](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)） | 每条的 `usage`、`cost` 是一笔明细；**它归哪次尝试、哪个运行、哪个租户由承载它的条目给**（[S-19](#s-19-用量与费用)），按 Run 汇总是派生（[S-5](#s-5-与别的形状的关系)） |
| `data.call-accounts` 的 `CostCorrection` 与晚到的账 | `CostCorrection` 的目标之一是一条响应体，取的就是 `id`（[S-19](#s-19-用量与费用)）；它的 S-39「晚到的账」落在一次发出上时，那个标记由本契约的 `late` 携带（[S-35](#s-35-晚到的那一条)） |
| **排查中断的人与中断提醒的写入者**（loop 那一程） | `timing.firstTokenAt` 的有无：中断提醒的 `hadContent` 与它一致（[S-5](#s-5-与别的形状的关系)）。**停机恢复判能不能重发，读的不是响应体**，是「已开口」记录（`data.messages/v6#S-49`；`capability.model-request-runtime` 的对账）；它补写的那一条响应体上，首 token 的有无与那条记录一致（[S-17](#s-17-首-token-与时序)） |
| **排查的人** | `failure.statusCode`、`failure.upstreamError`、`route.upstreamRequestId`、`stopReason`、`raw`（[S-15](#s-15-故障的成因与原样状态码)、[S-20](#s-20-上游原始响应留存)） |

## 二、含义与使用范围

### S-4 一次调用、一次发出、一条响应体

**三样东西，不要混读：**

| | 是什么 | 有几条 |
|---|---|---|
| [一次模型调用](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call) | 把攒好的一次请求发给模型，到拿回完整一份、上交或被中断为止 | —— |
| [**一次发出**](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-upstream-send--一次发出--upstream-send) | 这次调用里**向上游发出的一次请求**；[每一次发出只走一家](../../../../product/PF-013-model-profiles-and-invocation/design.md#试过又失败的那几次留痕不进方程)，换一家、退避之后再来都是**再发一次** | 一次调用有 0 到多次 |
| **一条[模型响应体](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-response--模型响应体--model-response)**（`ModelResponse`） | 已确认「已出门」责任收场后留下的那一条；可能在真正发送前取消（S-16） | **每个已确认责任恰好一条** |

**本契约正文里的「响应体」都是「模型响应体」的简称**，只在本契约内这样简称；它不是上游 HTTP 回来的那段字节——那段字节至多是它身上的一项留存（[S-20](#s-20-上游原始响应留存)）。

**每一次发出恰好留一条响应体**，不论它成了、断了还是被中断——
[试过又失败的那几次照样是发生的事](../../../../product/PF-013-model-profiles-and-invocation/design.md#试过又失败的那几次留痕不进方程)，
哪一家、可用的实际时刻与上游实际回报的状态码都照实保留；实际发送时刻不可用的已锚定中断按 S-17 显式记 null，不能捏造。

**没有已确认「已出门」锚点的调用没有响应体。**两种情形：「发不出去」那一类在出门之前就上交了
（[PF-013 flows §3.2](../../../../product/PF-013-model-profiles-and-invocation/flows.md#32-一次模型调用) 的「待发出 → 上交」），
以及在「待发出」时就被用户中断了。它们的事实由上交条目与中断提醒承载，不由本契约承载（[S-16](#s-16-发出了的才有响应体)）。

**响应体进会话日志，不进给模型看的上下文。**它是一条[记录条目](../../../../ubiquitous_language/terms/record-and-context.md#ul-record-entry--记录条目--record-entry)的载荷；
试过又失败的那几次[不进方程，也不进模型的上下文](../../../../product/PF-013-model-profiles-and-invocation/design.md#试过又失败的那几次留痕不进方程)。
**进上下文的只有 `reply` 那条消息本身**，经组装按块标注取用；响应体的其余成员一概不进。

### S-5 与别的形状的关系

| 那个形状 | 与本契约的关系 |
|---|---|
| **到达事件流**（`data.arrival-events`） | 一次发出的那条流收尾时：`account` 事件带的就是本条的 `{ usage, cost }`；`finish` 的 reason 落成本条的 `outcome`——`end` → `complete`、`max_tokens` → `truncated`、`interrupted` → `interrupted`、`lost` → `failed`；装配器交出的消息成为 `reply`，交出的已交付块成为 `delivered`。**两处例外不由这张映射决定**：流在第一个事件之前就失败（连不上、上游直接回错误状态）没有 `finish`，由模型请求运行时判为 `failed`；上游正常收尾却一样内容都没有（[§5.4 判据例一](../../../../product/PF-013-model-profiles-and-invocation/design.md#判据怎么用三个例子)：回复是空的），归不归故障由能力判定，本契约只要求判成故障时按 `failed` 写。**第三处例外**：宿主放弃在途的流——系统发起的运行取消（会话归档、宿主停止）与宿主被撤下（有序撤除、替换）——流的 `finish` 是放弃补上的 `lost`，这一次发出的收场却是 `interrupted`、`initiator = run_cancelled`，**不是故障、不带 `failure`**，也没有 `reply`（主线裁定，见 D-060 §七 M12；回复流那一侧见 `data.messages/v6#S-10`）（**未曾交给任何观察者的块不算已交付**：`capability.model-request-runtime/v2#S-51` 第 7 条「已开口写不进」那一支 `closeOut` 交出的块不进 `delivered`，D-060 §七 M15）|
| **`AssistantMessage`**（`data.messages`） | `reply` 就是它；`reply.response` 等于本条 `id`；`reply.ending` 与 `outcome` 一一对应（[S-13](#s-13-收场与其余成员的条件关系)）。**只有 `replyDisposition = persisted` 的那份 `reply` 是会话日志里的一条消息**；被否决的、被系统拿去用的那份从未成为消息，它带着的 `MessageId` 在日志里找不到对应的消息 |
| **Loop 在「消息落盘之前」的否决**（`data.loop-extension`） | 否决落在一份 `complete`／`truncated` 的回复上时，本条记 `replyDisposition = { vetoed: { by, reason? } }`，**这次调用照样结束**；要再试，是 loop 在下一次迭代另起的一次**新的模型调用**（新的 `callId`），不是本次调用的下一次发出（[S-23](#s-23-同一次调用的响应体序列)） |
| **重试挂件** | **只凭 `data.loop-extension/v6#S-14` 的失败主体下结论，不现读响应体**；同一次调用的 `ModelResponse` 序列（每次发出一条，按 `dispatch`，[S-23](#s-23-同一次调用的响应体序列)）是那份主体背后的事实。三类事实它推翻不了 |
| **「调模型之后」的 subject**（`data.loop-extension`） | **按 `outcome` 与 `replyDisposition` 判，不只看 `outcome`**：<br>• `complete`／`truncated` 且 `replyDisposition = persisted` ⇒ 完整回复那一维（`reply`、`usage`、`cost`）；<br>• `complete`／`truncated` 且 `vetoed` ⇒ **不触发这个位置**：回复没进日志，那次调用照常结束（`data.loop-extension/v6#S-2`、`#S-25`）；<br>• `consumed` ⇒ **不触发这个位置**：`data.loop-extension/v6#S-2` 写明被系统拿去用的那一次不触发「调模型之后」（主线裁定，见 D-060 §六 N-2；原 G-14 闭合）；<br>• `failed` ⇒ 失败那一维（`failure.cause`、`failure.statusCode`、档案快照）；<br>• `interrupted` ⇒ **两维都不对应**：被中断的调用不触发这个位置（`data.loop-extension/v6#S-2`） |
| **[中断提醒](../../../../ubiquitous_language/terms/record-and-context.md#ul-interruption-reminder--中断提醒--interruption-reminder)**（`data.messages` 的 `interrupted` 来源） | 一次调用以 `interrupted`、`failed` 或 `truncated` 收尾时 loop 追加的那条提醒（`data.messages/v6#S-10`：写到上限截断的那一行同样补；`#S-21`：`by` 为 `system` 覆盖出错断、写到上限、系统侧停止——含会话归档、宿主停止或被撤下；用户取消运行时 `by` 为 `user`），它说的「有没有内容」必须与**最后那条**响应体的 `timing.firstTokenAt` 有无一致。**试过又失败、随后又发了一次的那几条不对应任何提醒** |
| **成本两层** | 按尝试记明细 = 这里每一条的 `usage`、`cost`；**按 Run 汇总是派生**：把归到同一 Run 的全部响应体（**归到哪里由承载它的条目给**，`data.call-accounts/v2#S-25`）的费用连同指向它们的 `CostCorrection` 按 `data.call-accounts` 的规则加起来，`unknown` 单独计数、不当零加。**汇总值不存进任何一条响应体** |
| **停机恢复** | 判能不能重发**读「已开口」记录，不读响应体**（`capability.model-request-runtime` 的对账）：没有「已开口」→ 这一次没开口，[新的一次尝试照常再发](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token)，补写的那一条是 `interrupted`、`initiator = runtime_lost`、没有 `firstTokenAt`；有 → [这次调用就此收场，原因是运行时失联](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token)，补写的那一条是 `interrupted`、`initiator = runtime_lost`、带 `firstTokenAt`，**不重发**（[S-12](#s-12-收场)、[S-13](#s-13-收场与其余成员的条件关系)）。两次发出两条响应体、两笔钱都照实记（[S-19](#s-19-用量与费用)） |

## 三、值、身份与结构关系

| 成员 | 精确含义与取值约束 | 身份、相等或引用规则 |
|---|---|---|
| `id` | 这条响应体的标识，[S-6](#s-6-responseid) | 部署内唯一，逐码点相等 |
| `call` | 所属的那次模型调用，[S-7](#s-7-所属的那次调用) | `callId` 在一份会话日志内指认恰一次调用；`runId` 属于某个运行时必有 |
| `dispatch` | 该次调用的第几次发出，整数 ≥ 1，跨尝试连续，[S-8](#s-8-第几次发出) | `(call.callId, dispatch)` 在一份会话日志内唯一 |
| `attemptId` | 这一次发出**在第几次执行尝试里出门**——一件事实，不是这笔账的归属，[S-8](#s-8-第几次发出) | 与 `call.runId` 同在同缺 |
| `late` | 这一条写下时，它所在的那次尝试已被栅栏关掉，[S-35](#s-35-晚到的那一条) | 只取 `true`；缺席即不晚 |
| `route` | 路由留痕，[S-9](#s-9-路由留痕)～[S-11](#s-11-实际发出的参数改过的值与没发出去的项) | 引用档案、那一家、凭据那一格与参数词表 |
| `outcome` | 四值之一，[S-12](#s-12-收场) | 闭合枚举 |
| `initiator` | **谁中断的**（中断发起方，不是这次调用的发起者），三值之一，[S-12](#s-12-收场) | 只在 `interrupted` 上，且在那里必有 |
| `stopReason` | 上游原样的收尾理由，可缺 | 不翻译，不据它推断收场 |
| `reply` | 这一次拿回来的那一份回复，[S-14](#s-14-回复与已交付部分) | 它的 `response` 等于本条 `id` |
| `replyDisposition` | 回复落盘成了消息、在落盘之前被否决，还是被系统拿去用了，[S-14](#s-14-回复与已交付部分) | 与 `reply` 同在同缺 |
| `delivered` | 开了口却没有回复时已交付的块，[S-14](#s-14-回复与已交付部分) | 与 `reply` 互斥 |
| `failure` | 成因、原样状态码、上游错误原文，[S-15](#s-15-故障的成因与原样状态码) | 只在 `failed` 上 |
| `timing` | 发出、首 token、结束三个时刻，[S-17](#s-17-首-token-与时序) | `firstTokenAt` 缺席是断言，[S-18](#s-18-首-token-缺席是一条断言) |
| `usage`、`cost` | 这一次发出的用量与费用，[S-19](#s-19-用量与费用) | 拿不到记 `unknown`，不是零、不是缺席 |
| `trims` | 这一次发出的流上砍了多少，[S-19](#s-19-用量与费用) | 缺席即一次也没砍 |
| `raw` | 上游原始响应留存，[S-20](#s-20-上游原始响应留存) | 排查用，不进任何视图 |

### S-6 ResponseId

**一条响应体的标识。**不透明、**部署内唯一**——不只在一次调用、一个 Run 或一个会话内唯一——**不回收、不复用**。

- **由模型请求运行时在写这一次发出的「已出门」记录时铸**（`data.messages/v6#S-49` 的 `response` 成员；主线裁定，见 D-060 §S16 S16-a）。
  **此后写这条响应体的无论是哪一方——运行时自己、调用方（带回复且落盘成消息的那一条），还是停机之后的对账——都沿用这个标识，不另铸**；
  所以「同一次发出至多一条响应体」可以按标识判重，一条响应体写下之前它的标识就已在日志里。消费者不得解析它推断任何事实（时间、顺序、所属的调用）。
- **它的家就在本契约。**`data.messages` 的 `AssistantMessage.response` 与 `data.call-accounts` 的 `CostCorrection` 指的都是它；
  `data.call-accounts` 那边按同一条散文自己写出形状、**不 `$ref` 本契约**（免得两份契约互相依赖成环），含义以这里为准。
- **交换表示与相等规则按 [`data.identity-values/v1#S-31`](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示) 的散文**：非空字符串，首字符与末字符都不属于 S-31 逐个列出的那个空白码点集合，相等是逐码点精确相等。
  Schema 照那张码点表写出自己的 pattern，**不跨契约 `$ref` 那里的 `OpaqueIdentifier`**——那一项的说明限它自己的文件复用。
- **它不是上游给的请求 id**，也不从上游 id 推出。上游 id 是另一个系统的标识，可能没有、可能重复出现在两次发出里（上游侧的重放），
  而本系统的每一条响应体必须有一个自己的、确定存在的身份。上游 id 另记在 [`route.upstreamRequestId`](#s-9-路由留痕)。

### S-7 所属的那次调用

`call = { runId?, callId }`。**`callId` 必有，没有默认值，不从环境、进程状态或「当前在跑的那一个」补齐**；它在一份会话日志之内指认恰一次模型调用。

| 成员 | 是什么 | 本契约承诺到哪 |
|---|---|---|
| `runId` | 这次调用所属的[运行](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run--运行--run)。**这次调用属于某个运行时必有；不属于任何运行（由会话本身发起，[归会话](../../../../product/PF-012-agent-loop-and-run/design.md#run-是三样东西的归属单位)）时必无**——缺席是一条断言，不是「不知道」 | **只引用**：`RunId` 的定义在 [`data.call-accounts/v2#S-37`](../../call-accounts/v2/contract.md#s-37-三个归属标识的家runidattemptidmodelcallid) |
| `callId` | 这条响应体属于哪一次[模型调用](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call) | **只引用**：`ModelCallId` 的定义在 `data.call-accounts/v2#S-37`，会话内唯一。**它不是工具调用的 `CallId`** |

**一次调用可以跨尝试**：停机之后新的一次尝试以同一个 `callId` 续接它（`capability.model-request-runtime`），所以**「在第几次尝试里出门」不是调用的属性，是每一次发出的属性**——它在 [S-8](#s-8-第几次发出) 的 `attemptId` 上，不在 `call` 里（主线裁定，见 D-060 §块 C 对账 C-R7）。

**归属不在这里。**一笔账归哪次尝试、哪个运行、哪个租户，**权威是承载它的记录条目**（[`data.call-accounts/v2#S-25`](../../call-accounts/v2/contract.md#s-25-按尝试记明细按-run-汇总)）；`call.runId` 与 `attemptId` 是这一次发出的事实，**不作归属**（[S-8](#s-8-第几次发出)）。
本契约的响应体不带 TenantId：它是记录条目的载荷，[条目自己声明租户身份](../../../../ubiquitous_language/terms/record-and-context.md#ul-record-entry--记录条目--record-entry)。
这使 [`data.identity-values/v1#S-16`](../../identity-values/v1/contract.md#s-16-按归属层显式携带身份值) 的持久形状义务落在条目壳上，而条目壳尚无契约（[G-3](#七已知缺口)）。
**任何把响应体脱离条目单独存放的实现，都必须自己带上归属身份**，不得据 `runId` 现查「当前租户」补齐。

### S-8 第几次发出

`dispatch` 是**该次调用的第几次发出**，从 1 起；`attemptId` 是**这一次发出在那次运行的第几次[执行尝试](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt)里出门**（整数 ≥ 1，定义在 `data.call-accounts/v2#S-37`；它是序号，只与 `call.runId` 合起来才指认一次尝试），与 `call.runId` 同在同缺。

- **`attemptId` 是出门所在尝试这件事实，不是这笔账的归属。**归属的权威是承载本条的记录条目（[`data.call-accounts/v2#S-25`](../../call-accounts/v2/contract.md#s-25-按尝试记明细按-run-汇总)）。
  两者可以合法地不同：恢复时的对账在第 n+1 次尝试里补写一次在第 n 次尝试里出门的发出，这一条的 `attemptId` 是 n；它归到哪一组、按尝试汇总时算在谁头上，**以条目为准，不以 `attemptId` 为准**。

- **同一次调用内从 1 起、逐次加一，不重、不跳，跨尝试连续**：同一次调用的第 n 次发出，不论落在哪次尝试，都是第 n 次。每一次发出恰好留一条（[S-4](#s-4-一次调用一次发出一条响应体)），所以第 n 条存在就意味着第 1 到 n−1 条都存在；
  重试挂件据此知道自己[已经走到第几家](../../../../product/PF-013-model-profiles-and-invocation/design.md#它看得到什么)。
- **`dispatch` 的先后就是发出的先后。**第 n+1 次发出不早于第 n 次的 `endedAt`（[S-17](#s-17-首-token-与时序)）——一次调用同一时刻只有一次发出在途。
- **停机丢失连续性的那一次**，由 `capability.model-request-runtime` v2 S-33 的对账在下一次尝试里补写（`interrupted`、`initiator = runtime_lost`，[S-12](#s-12-收场)；这次调用属于某个运行时，补写时它出门所在的那次尝试已被取代，所以带 `late`，[S-35](#s-35-晚到的那一条)）；在补写之前，这条序列在那一处是断的，**消费者不得把断处读成「没有发出过」**。

### S-35 晚到的那一条

**`late: true`：这一条写下时，这一次发出所在的那次尝试已被栅栏关掉——已被新的一次尝试取代，或它所在的运行已经终结。**
**锚是发出所在的那次尝试（`attemptId`），不是条目把这笔账归到的那一次**（主线裁定，见 D-060 §四「K14」那一行与 §七 M25）：对账在第 n+1 次尝试里补写一次在第 n 次尝试里出门的发出，条目可以把它归到 n+1（[S-8](#s-8-第几次发出)），这一条仍带 `late`。`data.call-accounts/v2#S-39` 对 `ModelResponse` 写的是同一句。
条件与含义都照 [`data.call-accounts/v2#S-39`](../../call-accounts/v2/contract.md#s-39-晚到的账)：那一条说「尝试被栅栏关掉之后才结算的一次发出，由 `data.model-response` 携带同一个标记」，就是这里。

- **依据**：[PF-012 §6.17 I-11](../../../../product/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式)——运行终结之后不再发起新动作，已发起的账迟到了照样落、归这个 Run、标明迟到；[PF-013 §5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token)「那一条即使在 Run 终结之后才到，也照样归那个 Run」。
- **只取 `true`；缺席即「不晚」**：写下时它所在的尝试仍是当前的、运行尚未终结。`late: false` 不是合法写法——「不晚」只有一种表示。
- **只在属于某个运行的发出上出现**：`call.runId` 缺席（不属于任何运行）的那一条没有尝试可被关掉，带 `late` 即表示非法（[S-27](#s-27-表示层拒绝值) 的 `malformed`）。
- **它不改变归属，也不改变别的成员**：晚到的那一条照样归它的运行与尝试（归到哪里由条目给，[S-8](#s-8-第几次发出)），照样按 `data.call-accounts` 的规则计入汇总；`late` 只让读的人看得出这一条是栅栏关上之后才落的。
- **谁判**：写下它的那一方——它知道那次尝试与运行此刻的状态（`capability.model-request-runtime` v2 S-17「结算写入不受尝试栅栏拒收」）。本契约只给标记与含义。
- **典型的两种**：属于某个运行的调用在停机之后由对账补写的那一条（[S-8](#s-8-第几次发出)）；一次尝试被取代时还在途、此后才结算的那一次发出。

### S-9 路由留痕

**这一次发出实际用了谁。**

| 成员 | 精确含义 | 缺席意味着什么 |
|---|---|---|
| `profile` | **这一次的[有效模型](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-effective-model--有效模型--effective-model)**，以 `ModelProfileRef` 引用那条[档案](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-profile--模型档案--model-profile) | 不许缺 |
| `profileSnapshot` | **这次调用打开时绑定的那条档案在那一刻的副本**（[`data.model-profile/v5#S-27`](../../model-profile/v5/contract.md#s-27-modelprofilesnapshot档案在某一刻的副本) 的 `ModelProfileSnapshot`）：发出与重试消费的那些属性与 `updatedAt`。档案后来改了、被撤回了，这里不变——「当时用的是哪条档案」由 `profile` 指认、「它当时是什么样」由它回答；**档案不另有修订身份**（主线裁定，见 D-060 §块 C 对账 C-R1） | 不许缺 |
| `adaptation` | 调用打开时绑定的完整 `ModelAdaptationBinding`；与 `profileSnapshot.adaptation` 精确相等，见 [S-36](#s-36-模型适配绑定留存) | 不许缺，不按当前实现或配置补值 |
| `selectedBy` | 有效模型怎么来的，[S-10](#s-10-有效模型怎么来的) | 不许缺 |
| `provider` | **本层为这一次发出指定的那一家**。每一次发出只走一家（[S-24](#s-24-一条响应体对应上游的一次请求)），并且守 `data.model-profile` 的两条（[S-5](../../model-profile/v5/contract.md#s-5-providername-与允许的供应商)、[S-6](../../model-profile/v5/contract.md#s-6-允不允许回退)）：**它是 `profileSnapshot.providers` 里的一家**；**一次调用的第一次发出（`dispatch = 1`）是第一家**；**`profileSnapshot.allowFallback = false` 时每一次都是第一家**。此后发往哪一家由重试挂件定，失联之后续接的那一次发给失联的那一家（`capability.model-request-runtime` v2 S-22） | 不许缺 |
| `credentialScope` | **这一次发出用的凭据在哪一格**：出厂格（`{ layer: factory }`，那一把由部署装配配置，主线裁定，见 D-060 §S16 S16-f），或租户格（`data.identity-values` 的 `ScopeLayerIdentity` 的租户那一支）。**没有组织那一支**：模型凭据只在租户层与出厂格（[PF-013 rev 10 裁决 33](../../../../product/PF-013-model-profiles-and-invocation/design.md)）。**出厂格那一把只供官方档案**：`credentialScope` 是出厂格时，`profile.origin` 必须是 `official`（[PF-013 §5.6](../../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上)；`capability.model-request-runtime` v2 S-19「自建档案不落到出厂格那一把」）。**用量记在这一格头上**（[`data.call-accounts/v2#S-38`](../../call-accounts/v2/contract.md#s-38-两种归属用量归凭据那一格成本归发起者)）。它不是凭据本身，也不是凭据的引用——凭据不进任何记录（[S-21](#s-21-写入之前脱敏)） | 不许缺：出了门就用过一把凭据 |
| `upstreamModel` | **上游回报的模型名，原样**——可能与路由名不同 | **上游没有回报**：没连上、首字节之前断了、错误响应里没带。**不得以路由名、档案里的任何名字或 `provider` 填充**——那是把「我们请求了什么」冒充成「上游说它用了什么」 |
| `servingProvider` | 上游回报的实际执行方，非空原串，见 [S-37](#s-37-实际执行方) | 上游未报告；不以指定的 `provider` 填充 |
| `upstreamRequestId` | 上游给这次请求的 id，原样；经 [OpenRouter](../../../../foundation/cross-system-constraints/requirements.md#sys-llm) 发出时即它的 generation id，用于事后对账与补账（[S-19](#s-19-用量与费用)） | 上游没给 |
| `parameters` | **同次固定最终发送计划的参数；真实 send 时与实际一致**，[S-11](#s-11-实际发出的参数改过的值与没发出去的项) | 不许缺；最终计划无参数时是空的那一组，不是缺席；不能因零 send 清空原计划 |
| `parameterAdjustments` | 同次最终计划中传输适配改值的那些项：项名、要求值、适配后值；真实 send 时与实际一致，[S-11](#s-11-实际发出的参数改过的值与没发出去的项) | 一项值也没改 |
| `droppedParameters` | 要求了、却未纳入同次最终发送计划的那些项的名字，[S-11](#s-11-实际发出的参数改过的值与没发出去的项) | 一项也没丢 |

**「上一条回复是哪个模型生成的」就是它**——[PF-004 §6.6](../../../../product/PF-004-agent-definition-and-assembly/design.md#66-模型在每次请求时确定) 要求「每一条模型产出的内容，记下实际生成它的模型；事后回看不改成当前选的那个」。
沿 `AssistantMessage.response` 找到本条，读 `route.profile` 与 `route.upstreamModel`，就是答案；**它是那一次求值的历史答案，不随选中模型后来的切换改变**（[S-22](#s-22-写下即不变)）。

> `provider` 保留指定的供应商，`servingProvider` 保留上游报告的实际执行方；不一致时同时保留，不用一项覆盖另一项。未报告实际执行方不等于报告与指定相同。[S-37](#s-37-实际执行方) 补齐原 G-8 的表示缺口。

### S-10 有效模型怎么来的

[有效模型由两件事决定](../../../../product/PF-013-model-profiles-and-invocation/design.md#选中模型-与-有效模型)：选中模型经层级求值，再经「调模型之前」的拓展件可能的改写。
两件事定下的都是**一个路由名**（[PF-013 §4 档案的身份](../../../../product/PF-013-model-profiles-and-invocation/design.md#档案的身份所在范围加路由名)：设置记的是名字）；这个名字这一次落到哪一行，按层覆盖定，落到的那一行就是 `route.profile`。
`selectedBy` 记的是**最后一个定下这一次那个名字的那一步**——它说名字从哪来，不说名字落到哪一格：

| 取值 | 含义 |
|---|---|
| `session` | 名字取自会话的[选中模型](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-selected-model--选中模型--selected-model)，**会话格之上没有哪一格带[不可覆盖标记](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-immutable-marker--不可覆盖标记--immutable-marker)压过它**，且没有拓展件改它。**含会话从没切换过、选中模型取自「用哪个模型」那项设置沿层级求值的那个名字**——那个名字来自哪一格不论，只要不是被锁压过来的 |
| `layer_lock` | [层级求值](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-evaluation--作用域求值--scope-evaluation)时会话格之上有一格带不可覆盖标记，**名字取自那一格、压过了选中模型**，且没有拓展件改它。**不论锁住的那个名字是否恰好与选中的相同**——看的是名字从哪一格来，不是值是否相等；**锁锁的是名字**，这个名字落到哪一行照样按层覆盖（PF-013 §4 档案的身份） |
| `{ extension: <name> }` | 「调模型之前」有拓展件给出了 `select_model` 结论，并且它是最后生效的那一件；`extension` 是那件拓展件的名字。**拓展件改掉有效模型[必须留下结论](../../../../product/PF-012-agent-loop-and-run/design.md#610-能干预的拓展件必须留下结论)，这里是它在响应体上的回指**，不是第二份结论 |

**闭合。**没有「未知」这一值：有效模型算不出来是一件[非常态](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-off-nominal--非常态--off-nominal)，那时这一次根本发不出去，也就没有响应体（[S-16](#s-16-发出了的才有响应体)）。

### S-11 实际发出的参数、改过的值与没发出去的项

**发送事实与计划留痕的边界**：本条三项留痕保存同次固定最终发送计划的适配结果。真实 send 时，它们必须与实际发送逐项一致，以下“实际发出”“改了值再发出”“没发出”的正常发送约束不放松。已确认耐久「已出门」之后零 send、或恢复无法判定实际发送的 interrupted 分支，仍从同次计划原样还原这三项；参数的存在不宣称网络已经发送。不得用要求的合并值冒充适配后的值，不得因零 send 将 parameters 清空或把所有要求项改记 dropped；不得借此或 sentAt:null 推断未发送、费用为零或可重试。真实上游事实与账仍按 S-9/S-17/S-19 各自的来源规则。

**「要求的那一组」**（本条的记号，不是成员）：本层交给传输适配的那一组[模型请求参数](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-request-parameters--模型请求参数--model-request-parameters)——
档案上的默认值，经「调模型之前」的拓展件为这一次逐项覆盖之后合并的那一份（`capability.model-request-runtime` v2 S-7）。
传输适配对其中**每一项**恰有三种处置之一：按原值发出、改了值再发出、没发出（[`data.model-profile/v5#S-21`](../../model-profile/v5/contract.md#s-21-不静默丢也不静默改)，统一项与 `extra` 项一视同仁）。
[上游不认的项不静默丢，一次请求实际带了什么要留痕](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案)——留痕就是下面三个成员：

| 成员 | 是什么 |
|---|---|
| **`parameters`** | **这一次实际发给上游的那一组**，以统一词表表示（`data.model-profile` 的 `ModelRequestParameters`）：按原值发出的项记原值；**改了值再发出的项记实际发出的值**；**没发出的项不在这里**——`extra` 的键全都没发出时，**整个 `extra` 成员缺席**，不写成空对象（`extra` 出现时至少一项，[`data.model-profile/v5#S-19`](../../model-profile/v5/contract.md#s-19-extra)；主线裁定，见 D-060 §七 M28）。**译成上游的字段名、上游的拼法不是改值**（[`data.model-profile/v5#S-21`](../../model-profile/v5/contract.md#s-21-不静默丢也不静默改)），这里照统一词表的名字与取值记 |
| **`parameterAdjustments`** | **改了值再发出的那些项**，每项 `{ name, requested, sent }`：`name` 是项名，`requested` 是它在要求的那一组里的值，`sent` 是实际发出的值 |
| **`droppedParameters`** | **要求的那一组里没有发给上游的那些项的名字**——统一项与 `extra` 项一样，`extra` 项以它的键为名 |

它说的是这一次，不是档案；档案后来改了参数，这里不变（[S-22](#s-22-写下即不变)）。

约束：

1. **项名按 [`data.model-profile/v5#S-20`](../../model-profile/v5/contract.md#s-20-项与项名)**：统一项以成员名为名，`extra` 项以它的键为名；一份值里项名唯一，单看项名就知道是哪一项。
2. **三处互相对得上**：`droppedParameters` 的每个名字**都不在** `parameters` 里（既不是它出现的统一成员，也不是它 `extra` 的键）；`parameterAdjustments` 的每个 `name` **都在** `parameters` 里，`sent` **等于** `parameters` 里那一项的值，`requested` 与 `sent` 不同（相同就不是改值）。一个项名至多出现在两份清单之一里，且在那一份里至多一次。
3. **缺席即断言**：`parameterAdjustments` 缺席即一项值也没改，`droppedParameters` 缺席即一项也没丢。一个改了值或丢了项却不写的传输适配违反本条。**空数组都不是合法写法**——「一项也没有」只有一种表示。
4. **要求的那一组还原得出**：**最直接的是取同一次发出的「已出门」上的 `parameters`**——那一条记的就是要求的那一组（第 6 条）。只凭响应体时：取 `parameters`，把 `parameterAdjustments` 列的那几项换回 `requested`，再加上 `droppedParameters` 列的那几项（`parameters` 里没有 `extra` 而要加回 `extra` 项时，重新立起这个成员）——加回的那几项要求的值不在响应体上，由档案快照 `route.profileSnapshot.parameters` 与「调模型之前」的改写结论还原。
5. **实际发出的值要在统一词表里表示得出**：`parameters` 取 `ModelRequestParameters` 的形状，所以一项统一项改了值再发出时，发出的必须是那一项取值域内的值；一个改过之后在统一词表里表示不出来的值，传输适配**不得把它发出去而在这里记别的值**——那一项要么改成表示得出的值，要么不发、记进 `droppedParameters`。`extra` 项的值是任意 JSON，不受这一条限制。
6. **与「已出门」逐项相同**：传输适配对每一项的处置在请求离开本进程之前就已定下，同一次发出的「已出门」记录（[`data.messages/v6#S-49`](../../messages/v6/contract.md#s-49-模型请求运行时写的五种记录不是消息)）上记着同样的 `parameterAdjustments` 与 `droppedParameters`，那条的 `parameters` 就是要求的那一组；
   这一条的三个成员与那条算出的、写下的**逐项相同**。停机之后替这一次发出补写响应体的一方从那条读它们（`capability.model-request-runtime` v2 S-33；主线裁定，见 D-060 §六 L4）。
   **形状由那份契约逐字自定义、不 `$ref` 本契约**——L4 原文写的「`$ref`」已由 D-060 §四「L4」那一行改为「逐字自定义 ＋ 对齐义务」（§七 M2：两份 data 契约互引会成环，一侧 `$ref`、另一侧逐字自定义；口径写在 registry）。本契约是这两项形状的家；改形状时那边同轮改。

### S-12 收场

`outcome` 是**这一次发出**的收场，闭合四值：

| 取值 | 含义 | 这次调用随之落在哪（[PF-013 flows §3.2](../../../../product/PF-013-model-profiles-and-invocation/flows.md#32-一次模型调用)） |
|---|---|---|
| `complete` | 上游正常收尾，拿回完整一份 | 完整一份（终态）。**回复在落盘之前被否决也一样**：这次调用照样结束，否决记在 `replyDisposition` 上（[S-14](#s-14-回复与已交付部分)） |
| `truncated` | 写到输出上限被截断。**主路径走完了，[不是非常态](../../../../product/PF-013-model-profiles-and-invocation/design.md#判据怎么用三个例子)** | 完整一份（终态，含撞上输出上限）；被否决时同上 |
| `interrupted` | **这一次发出被中断了**，`initiator` 说是谁：`user` 用户中断了这次调用（直接，或插队顺带）；`run_cancelled` 它所在的运行被取消、或它的宿主停下或被撤下（系统发起的这几种在途的流被放弃、**没有回复**；用户取消运行时已交付的那一份可以成为回复，见 [S-13](#s-13-收场与其余成员的条件关系)）；`runtime_lost` 失去了连续性、由恢复时的对账补写（[PF-013 §5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token)「记下的原因是运行时失联」；后两支是主线裁定，见 D-060 §S16 S16-g、S16-i）。[那是控制动作或停机，不是一次故障](../../../../product/PF-013-model-profiles-and-invocation/design.md#还有一种没走完它不在这张表里)，**不带任何成因** | 被中断（终态）；**例外**：`runtime_lost` 且没有首 token 时，这次调用可以在新的一次尝试里续接、再发一次（[S-23](#s-23-同一次调用的响应体序列)） |
| `failed` | 这一次发出出了**故障** | 回到在途再发一次（策略说再试），或上交 |

**收场只看 `outcome`。**`stopReason` 是上游原样的收尾理由，留给排查；消费者**不得**据它推断收场，也不得拿它去改写 `outcome`——上游的词会变，收场不会。

**`initiator` 在本契约里只指中断发起方**——谁让这一次发出停下的。`data.call-accounts`、`capability.model-profile-directory` 里同名的 `initiator: TenantId` 指**发起者**（发起这次运行或这个操作的租户），**不是这里这一个**；
一次发出的发起者不在响应体上，由承载本条的条目给（[`data.call-accounts/v2#S-38`](../../call-accounts/v2/contract.md#s-38-两种归属用量归凭据那一格成本归发起者)）。跨契约读的时候，同名不同义，不得互相代入。

**`interrupted` 与 `failed` 形态几乎一样**（都可能发生在首 token 之后、都留下半句话），**但不得互相替代**：
把中断记成失败，[用户每插一次队，记录里就多一条「模型调用失败」](../../../../product/PF-013-model-profiles-and-invocation/design.md#还有一种没走完它不在这张表里)；
把失败记成中断，一次真的故障就不带成因、不上交。

### S-13 收场与其余成员的条件关系

**这张表是本契约的核心。**每一行都是一种合法组合，**表外的组合一律非法**：

| `outcome` | `reply` | `replyDisposition` | `delivered` | `failure` | `timing.firstTokenAt` |
|---|---|---|---|---|---|
| `complete` | **必有**，`ending = complete` | **必有**，三值之一 | 无 | 无 | **必有** |
| `truncated` | **必有**，`ending = truncated_at_limit`（没长完的工具调用也在里面） | **必有**，三值之一 | 无 | 无 | **必有** |
| `interrupted`，有回复（`initiator` 不是 `runtime_lost`） | **必有**，`ending = interrupted_by_user`——内容是已交付的那部分 | **必有**，三值之一 | 无 | **无** | **必有** |
| `interrupted`，开了口、没有回复 | **无** | 无 | **有才带**：写入者手里还有已交付的块就必带；失去连续性之后在途内容已不在，可以缺席 | **无** | **必有** |
| `interrupted`，没开口 | **无**——[不伪造一条空的](../../../../product/PF-009-context-message-types/design.md#56-流断在半路) | 无 | 无 | **无** | **无** |
| `failed`，首 token 之前 | **无** | 无 | 无 | **必有**，`cause ≠ interrupted_mid_reply` | **无** |
| `failed`，首 token 之后 | **无**——[出错断的不成为消息](../../../../product/PF-009-context-message-types/design.md#56-流断在半路) | 无 | **必有** | **必有**，`cause = interrupted_mid_reply` | **必有** |

**逐行的理由都在产品正文里，本条只把它们合成一张判定表：**

- **有 `reply` ⇔ 这一次拿回了一份可以成为消息的回复**：正常收尾、截断、叫停时已有内容，这三种[落成一条完整的消息](../../../../product/PF-009-context-message-types/design.md#56-流断在半路)；
  `reply.ending` 取 `data.messages` 的三值之一，**与 `outcome` 一一对应**，不许错配。
  **三种都还要过「消息落盘之前」那一关**，过没过、或者本来就被系统拿去用，记在 `replyDisposition`（[S-14](#s-14-回复与已交付部分)；主线裁定，见 D-060 §S8 S8-e）。
- **失去连续性补写的那一条没有回复**（`initiator = runtime_lost`）：在途内容随进程没了，没有人还拿着一份可以成为消息的回复。
  **开了口之后被中断、没有交出回复**（系统发起的运行取消——会话归档、宿主停止或被撤下——时在途的流被放弃，或失去连续性）：已交付的块有才带在 `delivered`，[没有的由中断提醒兜底](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有)。
- **`initiator = run_cancelled` 又带 `reply`，只在用户取消运行时成立**：那时回复的 `ending = interrupted_by_user` 说的正是那位用户；**系统发起的运行取消不交出回复**，在途的流被放弃（`data.messages/v6#S-10` 的回复流对应；主线裁定，见 D-060 §七 M12）。
  响应体上看不出取消是谁发起的，**Schema 管不到这一条**；它是写入者（`capability.model-request-runtime`）的义务（[S-26](#s-26-schema-的范围)）。
- **故障断的不成为消息**，已交付的那部分[记在那次模型调用的账里](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有)——就是 `delivered`。
- **用户中断不带成因**；**故障必带成因**。
- **首 token 之后的故障，成因一律是 `interrupted_mid_reply`**：[只要首 token 已经出来，无论上游最后返回什么，都归它](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类)。
  上游最后回的状态码（比如 429）**照样原样带着**（[S-15](#s-15-故障的成因与原样状态码)），但它不改变成因。
- **反过来，`interrupted_mid_reply` 只出现在首 token 之后。**首 token 之前的故障，照[那张表](../../../../product/PF-013-model-profiles-and-invocation/design.md#57-上交带什么原样带着状态码不翻译它)取其余七个成因之一。

> **回复完整回来了，却在[落盘之前被否决](../../../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前的否决按消息是谁产生的分三路)**
> （比如[转换件转不成](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类)）：
> **收场仍是 `complete` 或 `truncated`**——这一次发出本身走完了主路径；`reply` 照记，`replyDisposition = { vetoed: { by, reason? } }`，**它没有成为消息**；**不带 `failure`**。
> **这次调用就此结束**；要再试，是 loop 在下一次迭代另起的一次**新的模型调用**（新的 `callId`），
> 所以[「首 token 之后不许重发」](#s-17-首-token-与时序)在这里**没有例外**——新调用的发出不是这次调用的重发（[S-23](#s-23-同一次调用的响应体序列)）。

### S-14 回复与已交付部分

`reply` 的 `AssistantMessage` 采用 `data.messages/v6#S-9`、`#S-31`；`delivered` 的块采用 `data.content-blocks/v3#S-12`。因此两者都可原样记下非法模型名字的完整未解析调用；这种表示不授予执行资格，仍禁止重解析或改名。

- **`reply` 是这一次拿回来的那一份回复本身**，不是它的摘要或副本：`reply.response` **必须等于**本条 `id`，这是 `AssistantMessage` 指回响应体的唯一依据。
  **同一次调用至多一条响应体带 `reply`，且它是这次调用的最后一条**（[S-23](#s-23-同一次调用的响应体序列)）。
- **`replyDisposition` 说这份回复有没有成为消息**，**凡 `reply` 存在即必带，`reply` 缺席即不带**（主线裁定，见 D-060 §S8 S8-e）：

  | 取值 | 含义 |
  |---|---|
  | `persisted` | 它过了「消息落盘之前」那一关，**落盘成了会话日志里的一条消息** |
  | `{ vetoed: { by, reason? } }` | 它在「消息落盘之前」被否决，**没有成为消息**。`by` 是否决它的那件[拓展件](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)的名字（[转换件](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-modality-converter--模态转换件--modality-converter)也算），`reason` 是它给出的理由，有就带 |
  | `{ consumed: { by } }` | 它**本来就不成为消息**，被系统拿去用了：`by ∈ { compaction, side_query }`——压缩时生成摘要的那次调用（摘要落成[压缩记录](../../../../product/PF-010-context-management-and-assembly/design.md#要求三有压缩记录时边界由压缩记录来定)那条消息，不是一条模型回复）、旁路提问的那次调用（[问和答都不进日志](../../../../product/PF-012-agent-loop-and-run/design.md#run-是三样东西的归属单位)）。**账照记**。这一值是规格层按 D-060 §S8 S8-e 推出的：有回复就得说它成没成为消息 |

  **被否决的那份回复只活在这条响应体里**：它带着的 `MessageId` 在会话日志里找不到对应的消息；
  用户可能已经看见它一段段冒出来，[那部分记在那次模型调用的账里](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类)——就是这条响应体（[PF-009 rev 8](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有) 把「这次尝试的账」统一为「那次模型调用的账」）。
  **否决不改写收场**：`outcome` 仍是原来那一个，不带 `failure`，这次调用照样结束（[S-12](#s-12-收场)）。
- **`interrupted` 的那份 `reply` 同样过「消息落盘之前」那一关**：被叫停时已经交出来的半截回复，照样可能被否决；否决了它就不成为消息，这次调用仍以被中断结束、不再发出（原 G-12）。
- **同一条消息在日志里只有一份权威内容。**`reply` 在响应体里、消息又是会话日志里的一条消息——
  两者落成同一条记录条目的两个面，还是两条条目，归条目壳（[G-3](#七已知缺口)）；**无论怎样落，都不得出现两份可以各自改、各自分叉的内容**——
  [同一件事两处登记必然分叉](../../../../product/PF-013-model-profiles-and-invocation/design.md#55-上交交给谁看模型说没说出话)。
- **`delivered` 是开了口却没有交出回复时已交付、不成为消息的那部分**——首 token 之后的故障，或开了口之后被中断而没有回复（[S-13](#s-13-收场与其余成员的条件关系)）；块的形状取 `data.content-blocks` 的 `ContentBlock`：
  已封口的块照原样，断在半路的块取断开那一刻它已有的内容；**没长完的工具调用照 `data.content-blocks` 的规则两位皆假**。
  [用户看见了的，会话日志里必须有](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有)——它就是那一「有」。
- **`reply` 与 `delivered` 互斥。**一条响应体里已交付的内容要么在 `reply` 里，要么在 `delivered` 里，**不能两处都放**。
- **`delivered` 缺席即没有已交付的内容**；空数组不是合法写法。

### S-15 故障的成因与原样状态码

`failure = { cause, statusCode?, inBand?, upstreamError?, localError? }`，**只在 `outcome = failed` 上出现，且在那里必有**（[S-13](#s-13-收场与其余成员的条件关系)）。

- **`cause`**：八个成因之一。**名字与定义归 `data.loop-extension` 的 `FailureCause`，本契约 `$ref` 它、不复述**；
  八个取值按 [PF-013 §5.7](../../../../product/PF-013-model-profiles-and-invocation/design.md#57-上交带什么原样带着状态码不翻译它) 的顺序是
  `withdrawn` · `scope_disallowed` · `modality_mismatch` · `credential_unavailable` · `request_rejected` · `upstream_unavailable` · `interrupted_mid_reply` · `unrecognized`。
  **成因在这个边界上分类**（[§6.11](../../../../product/PF-013-model-profiles-and-invocation/design.md#611-成因在这个边界上分类不丢进外层按异常形态分)）：由写响应体的那一层认出来，不丢给外层按异常形态去猜。
- **成因说的是这一次发出。**`upstream_unavailable` 在产品正文里带着「且试尽了」——**那是上交的条件，不是这一次的分类**：
  一条带 `upstream_unavailable` 的响应体只说「这一次上游给不出回复」，**不表示这次调用已经试尽**。试没试尽由重试挂件判，结论落在它自己的结论条目里。
- **`statusCode`**：上游返回的状态码，**原样带着，不翻译**。[成因回答「谁能了结」，状态码回答「上游到底怎么了」，两者不互相替代](../../../../product/PF-013-model-profiles-and-invocation/design.md#614-上交带的成因是封闭枚举外加一个诚实的兜底状态码另外原样带着)。
  **上游没有返回状态码时缺席**（连不上、超时、没到上游）——**缺席不是 0，也不得补一个「看起来合理」的值**。
  **状态码有两种来处**（主线裁定，D-060 §八 N-40 ④）：HTTP 层失败时是实际 HTTP 响应的状态码；**流已开始之后的带内错误**（HTTP 已是成功、错误在流里给出）是带内错误的 `code`——这时**带 `inBand: true`**。
- **`inBand`**：只取 `true`，**只能与 `statusCode` 同在**；在即「这个状态码是流里带内错误的 `code`，不是 HTTP 状态」，缺席即「这个状态码是 HTTP 状态」。**不许把流开始时的 HTTP 成功状态当成那次故障的状态码**，也不许把带内 `code` 不加标记地写进 `statusCode`——两者读起来是同一个数，意思不同。
- **`upstreamError`**：上游在错误里给出的 `code`、`message` 与原样错误体 `raw`，**脱敏之后原样**（[S-21](#s-21-写入之前脱敏)）；三样都没有就不写这个成员。
- **`localError`**：本层自己出的错——传输适配报错、解不开上游的回应——的原文，**脱敏之后原样**；没有就不写。它与 `upstreamError` 分开：一个是上游说的，一个是本层遇到的。
- **兜底值不许用来偷懒**（[§6.14](../../../../product/PF-013-model-profiles-and-invocation/design.md#614-上交带的成因是封闭枚举外加一个诚实的兜底状态码另外原样带着)）：
  带 `unrecognized` 的那一条**必带认不出来的那样东西**——`statusCode`、`upstreamError`、`localError` 或 `raw` 至少其一；Schema 管得到，缺了即 `malformed`（[S-27](#s-27-表示层拒绝值)）。**留下的是不是真的那样东西**仍是判定层的事。

### S-16 发出了的才有响应体

**响应体记每个已确认耐久「已出门」锚点的发出责任**（[S-4](#s-4-一次调用一次发出一条响应体)）。该责任至多对应一次上游请求，不保证网络实际已开始；锚点之后、真正交给传输之前的取消仍须结算该责任。没有锚点的规划拒绝或发送前取消没有响应体；这不把零次网络发送重新定义为真实发出。由此：

- **`withdrawn`、`scope_disallowed`、`modality_mismatch` 三个成因不出现在任何一条响应体上。**它们[都发生在出门之前](../../../../product/PF-013-model-profiles-and-invocation/design.md#最后一行不再往下细分)——
  请求根本没到上游，也就没有「一次发出」可记。它们随上交条目与「调模型之后」失败那一维的输入走。
- **`credential_unavailable` 只以「配了而上游拒绝它」的那一半出现**；「范围没配凭据」那一半同样在出门之前。
- **Schema 形状上放过这三个值**（`cause` 直接引用八值枚举）；写入者不写它们，是**判定层**的约束，证据形式在[验证入口](../verification.md)。

### S-17 首 token 与时序

`timing = { sentAt, firstTokenAt?, endedAt }`。`sentAt` 必有，取时间点或 `null`；另两项在存在时及 `sentAt` 非空时都是 [`data.offer-expiry/v1#S-22`](../../offer-expiry/v1/contract.md#s-22-schema-的范围) 定的时间点。

| 成员 | 是什么时刻 |
|---|---|
| `sentAt` | 实际交给传输的时刻；`null` 唯一表示“没有可用的实际交给传输时刻”，不表示确知没有发送，不提供重发资格 |
| `firstTokenAt` | **本层观察到首 token 的时刻**。[首 token 指这次回复交出的第一样内容，不论模态](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类)：能一点点长的块（文本、思考、工具调用的参数、语音）是**第一片到了**；整个交出的块（图、文件）是**整块交出来了**。**响应头到了不算，整交的块开了口还没交出来也不算**。**它与这一次发出的「已开口」记录上的时刻相同**（`data.messages/v6#S-49`）；本条经 `(call.callId, dispatch)` 指回那条记录——「已经开口」是那次模型调用的账，[最终的那一条引用它](../../../../product/PF-009-context-message-types/design.md#收尾之前拼到一半的那份是在途状态不是日志不是消息)（PF-009 rev 8），不另存一个指针 |
| `endedAt` | **本层确认这一次发出已经结束的时刻**：收到收尾、判定故障、收到中断，或恢复时确认它已失去连续性（`capability.model-request-runtime` v2 S-33 的对账）。它不是上游那边的结束时刻 |

- **空值的限定**：只有已确认耐久「已出门」责任的 `interrupted` 结算才可取 `sentAt: null`，包括失联恢复和锚点后零次 send 的取消；写入者须确认锚点及结算前提。`complete`、`truncated`、`failed` 与 S-39 `PendingModelResponse` 均须有实际时间点，后者即使 outcome 为 `interrupted` 也不例外。Schema 只表达 outcome／投影限制，不证明真实锚点。
- **真实事实优先**：有可用的真实实际 `sentAt` 必须保留，不能主动丢成 null；不可用则显式 null，禁止用锚点时刻、恢复时刻或当前时刻代填。`firstTokenAt` 仍按 S-18 的确知断言与权威「已开口」事实填写；null 不放松其规则，不要求删去已知首 token。
- **先后**：`firstTokenAt` 存在时仍须 `firstTokenAt ≤ endedAt`；`sentAt` 非空时须 `sentAt ≤ endedAt`，首 token 存在时还须 `sentAt ≤ firstTokenAt`。null 不参与时间比较。跨字段比较不在形状约束内，由写入者兑现。
- **所有实际时刻来自同一个时间源**（[S-25](#s-25-装配给的保证与协议须给的保证)），否则「首 token 之前还是之后」在两个时钟之间会判出两个答案。
- **首 token 是这一层自己观察到的事实，与上游最后返回什么无关**（[§5.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#最后一行不再往下细分)）。
  它决定两件事：**这一次的故障成因是不是 `interrupted_mid_reply`**（[S-13](#s-13-收场与其余成员的条件关系)），以及**停机之后能不能重发**——
  [之前可以，之后一律不](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token)。本契约只记这一事实，「重不重发」由能力按它判。
- **有首 token 就不许重发，没有例外。**回复在落盘之前被否决也不例外：那次调用以 `complete`／`truncated` 加 `replyDisposition = { vetoed }` 结束（[S-13](#s-13-收场与其余成员的条件关系)），
  要再试是 loop 另起的一次**新的模型调用**，它的发出从它自己的 `dispatch = 1` 数起，不是被否决那次调用的重发。

### S-18 首 token 缺席是一条断言

**`firstTokenAt` 缺席的意思是「本层确知这一次没有开口」，不是「不知道开没开口」。**

它必须是断言，因为消费者会据它**放行一次重发**：把「判不出来」写成缺席，一次已经吐了半句的回复就会被再发一遍，
[记录里躺着两份回复，而用户只看见过一份半](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token)。

**写入者判不出来时，不得写成缺席。**本版的响应体形状**没有「判不出」这一取值**——
典型情形是停机之后在途状态已经没了（[在途状态由运行时持有，失去连续性它就没了](../../../../product/PF-009-context-message-types/design.md#收尾之前拼到一半的那份是在途状态不是日志不是消息)）。
**本契约只禁止「写成缺席」这一种答法**；首 token 的观察怎样在失去连续性之后仍判得出，由 `capability.model-request-runtime` v2 兑现：「已开口」先落耐久记录再交出内容（它的 S-15），恢复时首 token 的有无取那条记录（它的 S-33）；「已开口」写不进时内容不交给任何观察者，这一次按首 token 之前的故障结算（它的 S-15 末条）——那时确实没有内容交出去，缺席仍是确知的。

### S-19 用量与费用

`usage` 与 `cost` 的形状取 `data.call-accounts` 的 `Usage`、`Cost`，**本契约不复述**；成员名 `input_tokens`、`output_tokens`、`cache_read_tokens`、`cache_write_tokens`、`cost_usd` 沿用上游用量报文的命名，那是 `data.call-accounts` 的规定。

本契约在它之上只承诺五件事：

1. **每一次发出各记各的。**一次调用发出两次，就是两条响应体、两份用量、**两笔钱**，[都照实记](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token)——
   请求到了上游、首 token 还没出来，上游可能已经开始计费，**重发不使前一笔消失**。
   这与[「账只记一次」](../../../../product/PF-009-context-message-types/design.md#到达的过程有它自己的语法)不冲突：那说的是一条流里记一次，这里是两次发出、两条流。
2. **拿不到记 `unknown`，不记零，也不缺席**——失败了、被中断了、上游没给，都一样（D-019：实际费用不能被目录估算冒充）。
   这一次发出的流收尾前没有交出 `account` 事件时，`usage` 与 `cost` 按 `data.call-accounts` 的「来源 = 无」写，**不伪造**。
3. **事后补账不改这条响应体**：拿到了实际费用，追加一条 `data.call-accounts` 的 `CostCorrection`，目标是 `{ kind: model_response, responseId: <本条 id> }`（[S-22](#s-22-写下即不变)）。
   经 `route.upstreamRequestId` 向上游补查是补账的一条来路。
4. **按 Run 汇总是派生，不存进响应体**（[S-5](#s-5-与别的形状的关系)）。[明细按尝试记、汇总按 Run 算](../../../../product/PF-012-agent-loop-and-run/design.md#成本两层缺哪一层都会算错)：
   **每一笔归哪次尝试、哪个运行、哪个租户，权威是承载本条的记录条目**（[`data.call-accounts/v2#S-25`](../../call-accounts/v2/contract.md#s-25-按尝试记明细按-run-汇总)），**不是** `call.runId` 与 `attemptId`——那两个是这一次发出的事实（[S-8](#s-8-第几次发出)）；两者不一致时以条目为准。不属于任何运行的调用归会话，它的钱怎样汇总归 `data.call-accounts`。
   [成本要能算到发起它的那个租户头上](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)——租户身份由承载本条的记录条目给（[S-7](#s-7-所属的那次调用)、[G-3](#七已知缺口)）；**用量那一格**是 `route.credentialScope`（[S-9](#s-9-路由留痕)）。
5. **砍了要说**：这一次发出的流上若有合并或截掉，汇总落在 `trims`（`data.call-accounts` 的 `TrimSummary`，[`#S-15`](../../call-accounts/v2/contract.md#s-15-trimreason-与-trimsummary砍了要说)，由砍的那一方计数；模型侧由宿主写进这里，`capability.stream-assembly` v3 S-13）；**缺席即一次也没砍，全零的汇总不是合法写法**——「没砍」只有一种表示。

### S-36 模型适配绑定留存

`route.adaptation` 必填，引用 [`data.model-profile/v5#S-29`](../../model-profile/v5/contract.md#s-29-modeladaptationbinding) 的 `ModelAdaptationBinding`，不在本契约重定义它的三个组成部分。配置值的精确 JSON 保留、秘密排除及配置修订的解释范围沿该契约 S-29、S-30。

一条响应体必须同时满足：

1. `route.adaptation` 与 `route.profileSnapshot.adaptation` 按该公共定义的相等规则精确相等；实现、模型定义、配置修订及完整 `configuration.values` 均参与比较。
2. `route.adaptation.definition.modelId` 与 `route.profile.routeName` 逐码点相等；不以 `route.upstreamModel` 替代请求模型名参与此比较。
3. 绑定来自打开本次调用时取得的档案快照，与本次发出的耐久事实一致。同一调用的不同发出沿用同一绑定；后来的发布、撤除或配置修改不改写它。
4. 响应体自行保留完整绑定；诊断被丢弃、导出失败、当前配置改变或旧实现已不可用，都不使已记录的绑定丢失。读取历史事实不要求旧实现仍可运行；再次发出的准入与实现可用性归运行时。

前两项是单文档的纯判定义务；JSON Schema 不支持跨字段相等。Schema 通过之后仍需比较，任一错配按 S-27 最后一步返回 `malformed`，不增加失败值、不修补输入；它不是模型调用的失败成因。后两项需要写入者与恢复场景兑现，单份文档不能证明。

### S-37 实际执行方

`route.servingProvider` 可缺席；存在时是上游报告的实际执行方的非空字符串，原样保留，不做大小写折叠、别名替换或规范化。本属性不复用指定路由的 `ProviderName` 来假定上游采用同一命名空间。

上游未提供时成员缺席；不得从 `route.provider`、模型档案、适配绑定或价格表补值，也不得填 `"unknown"` 作为缺席的替代写法。`upstreamModel` 继续沿 S-9 的同一事实来源纪律。空字符串或类型错误按 S-27 返回 `malformed`。

若运行时已判明实际执行方不符合固定供应商请求，响应体保留指定方和实际上报方两个事实，不能记录为一次符合固定路由的成功。处置仍沿 S-13、S-15 的既有成因及首 token 优先规则：首 token 之前可由运行时按 `unrecognized` 留下故障事实；首 token 之后适用 `interrupted_mid_reply`。本契约不以两个原串不相等直接证明供应商不同，名称对应事实由传输提供者核实，不新立失败值。

G-8 的「没有成员可记」由本条关闭；上游是否如实报告、指定与实际上报名称如何核对及错配处置的真实证据仍归提供者，见本版验证说明。

### S-38 请求前缀缓存事实

缓存计数的唯一持久权威仍是 `usage.cache_read_tokens` 与 `usage.cache_write_tokens`，直接引用 [`data.call-accounts/v2#S-6`](../../call-accounts/v2/contract.md#s-6-usage四项-token-与来源)。该版本没有另立 `TokenAmount` 或 `TokenCount`；本版不引入同义计数类型，也不另加 `cache` 对象或镜像读写计数。

两项各记录上游为这一次发出报告的请求前缀缓存事实；不表示响应复用。已知零写 `0`，未报告的一项写公共 `Unknown` 值 `"unknown"`，不得缺席。上游只报告读取量时，写入量为 `"unknown"`；两项未报告时都为 `"unknown"`。`usage.source` 按四项用量整体判定：其他用量已知时仍是 `upstream`，不是仅因缓存未知就改为 `none`。

读取量大于零才构成该次发出的已报告缓存读取命中；写入量为正不推出读取命中。适配配置、TTL、断点、目录价格、自动缓存声明或曾有别的请求命中过，均不能补出任何一个计数。`usage` 与 `cost` 的原有精确计量、实际费用、未知和事后补账语义保持；本版不增加 TTL 估算费用或第二份计费来源。原始来源诊断与留存继续归原边界。

### S-20 上游原始响应留存

`raw = { headers?, body? }`：上游原始响应的留存，**排查用**。

- **不进给模型的上下文，也不进任何面向人的呈现**；读它的只有排查的人。
- `headers`：上游响应头，**脱敏之后原样**，**不得含凭据**（[S-21](#s-21-写入之前脱敏)）。它是 JSON object；每个头值恰为一个字符串或一个元素全为字符串的有序 JSON 数组。可以在同一对象内同时出现两种形状。
  - **保存采得且脱敏后的对象及其值**：字符串保持字符串，数组保持数组；数组元素的次序、重复值及空字符串逐值保留。不排序、不去重、不拼接、不取首、不将数组序列化成字符串，也不按逗号重解析字符串。
  - **空值与缺席不同**：空字符串 `""`、空数组 `[]` 都是合法头值，分别保持原形；空头对象 `{}` 是合法 `headers`，表示采得的空对象，区别于 `headers` 缺席。不得把空数组改成缺键，也不得从缺席补出任何一种空值；这些合法表示不证明对应事实确实被采得。
  - 头名的大小写与同名多值怎样合并，本契约不规定；不新增头名格式、去空白或排序政策。此处承载的是采得且脱敏后的头对象，**不承诺原始 HTTP 头行次序、逐字头名或线上重复头的表示**，不允许凭空重建未采得的值。
  - 数字、布尔值、`null`、对象、嵌套数组或含任何非字符串元素的数组都不是合法头值，按 [S-27](#s-27-表示层拒绝值) 的既有次序给 `malformed`，不增加拒绝值。
- `body`：上游原始响应的字节**存进附件存储**之后的引用，形状取 `data.content-blocks` 的 `AttachmentRef`。
  **它不是[附件](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-attachment--附件--attachment)**——那个词说的是工具执行的产出；这里只借同一种存储与同一种引用形状。
  「上游原始响应留存」不是词条，是[模型响应体](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-response--模型响应体--model-response)身上的一项属性（那条词条的注意 ②）。
- **保留期是一项设置**，不在本契约定（[G-4](#七已知缺口)）。**过了保留期、附件被清理之后，`body` 的引用可能取不到**：
  取不到**不改变响应体其余任何成员的含义**，也不得据此判定响应体损坏；清理附件不改写响应体（[S-22](#s-22-写下即不变)）。
- **上游有回报时应当留。**`raw` 缺席有两种来路——上游什么都没回，或者留存本身没成——本版**不区分**这两种。
  **留存没成不阻止响应体写下**：那一条的用量、费用与收场比它的原始字节更要紧，**也不得为了凑齐而伪造任何一项**。
  两项都没有就不写 `raw`；空对象不是合法写法。

### S-21 写入之前脱敏

**响应体的任何成员都不得含凭据。**[上游返回的原文里可能带着凭据](../../../../product/PF-013-model-profiles-and-invocation/design.md#616-错误信息外泄之前要脱敏)——鉴权头的片段、密钥的前几位；
而响应体写下即不变（[S-22](#s-22-写下即不变)），**写错了就是永久的**。

- **脱敏发生在写入之前**，覆盖 `failure.upstreamError`（`code`、`message`、`raw`）、`failure.localError`、`raw.headers` 与 `raw.body` 指向的那份留存。
  **不是写下之后再清理**：日志只增不改，事后清理做不到。
- **脱敏之后仍叫「原样」**：除去凭据之外不翻译、不改写、不摘要。
- **什么算凭据、哪些头要剥、怎样判定一段文本里有凭据**，归写入者所在的能力（[G-5](#七已知缺口)）。本契约只立「不得含」这条结果。

### S-22 写下即不变

**一条响应体在这一次发出结束时写下一次，此后不再改变。**它是[记录条目](../../../../ubiquitous_language/terms/record-and-context.md#ul-record-entry--记录条目--record-entry)的载荷，条目一旦写下就不再改变——要改变，靠追加。

- **没有「写到一半」的响应体**：这一次发出还在途时，它的中间状态归运行时持有，不是一条响应体。
- **费用更正**：追加 `CostCorrection`（[S-19](#s-19-用量与费用)），原响应体不动。
- **选中模型后来切换、档案后来改了参数或被撤回**，都不回头改任何一条已写下的响应体——[事后回看不改成当前选的那个](../../../../product/PF-004-agent-definition-and-assembly/design.md#66-模型在每次请求时确定)。
- **上游原始响应的字节按保留期从附件存储清理**，是附件存储上的事，不是对响应体的改写（[S-20](#s-20-上游原始响应留存)）。
- **晚到的那一条也是写下一次、此后不变**：`late` 在写下的那一刻由写入方判定并写入（[S-35](#s-35-晚到的那一条)），不在事后补标。

### S-23 同一次调用的响应体序列

**同一次调用（同一个 `call`）的全部响应体，按 `dispatch` 排成 R₁ … Rₙ（n ≥ 0），满足：**

1. **`dispatch` 恰是 1 … n**（[S-8](#s-8-第几次发出)）。n = 0 即这次调用一次都没发出（[S-16](#s-16-发出了的才有响应体)）。
2. **除了最后一条，每一条都是下面两种之一，且都没有 `firstTokenAt`**：`failed`、成因是 `upstream_unavailable` 或 `unrecognized`；或 `interrupted`、`initiator = runtime_lost`（首 token 之前失去连续性，新的一次尝试续接再发；[PF-013 §5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token)「首 token 之前……照常再发一次」，续接同一次调用是主线裁定，见 D-060 §S16 S16-g）。
   理由在 [PF-013 flows §3.2](../../../../product/PF-013-model-profiles-and-invocation/flows.md#32-一次模型调用) 与 [§6.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#612-事实判断归本-topic策略归拓展件)：
   `complete`、`truncated`、`interrupted` 都是这次调用的终态；**「已经开口说话了」「重试没用」两类是事实，[重试挂件推翻不了](../../../../product/PF-013-model-profiles-and-invocation/design.md#有三件事它改不动)**，
   所以 `interrupted_mid_reply`、`credential_unavailable`、`request_rejected` 之后**不会再有下一次发出**；「发不出去」那三个成因根本不上响应体。
   **只有策略那一类（`upstream_unavailable`、`unrecognized`）之后才可能再发**——而发不发由重试挂件定；**没开口就失去连续性的那一次之后可以续接再发**，发给同一家。
3. **至多一条带 `reply`，且它是 Rₙ。**它的 `replyDisposition` 不论是哪一种，这次调用都到此为止。
4. **没有例外。**回复在落盘之前被否决之后的再试**不在这条序列里**：它是 loop 另起的一次新的模型调用（新的 `callId`），有它自己的一条序列、从 `dispatch = 1` 数起
   （[S-13](#s-13-收场与其余成员的条件关系) 的引注、[`examples.md` E-8](examples.md#e-8-同一个-run-里前后两次调用前一次的回复被否决)）。

**这条序列性质的保护者是写响应体的那一方**（`capability.model-request-runtime`）：它只在策略那一类之后、或没开口就失去连续性之后才发起下一次。
**重试挂件不读这条序列**：它只凭 `data.loop-extension/v6#S-14` 的失败主体下结论（完整档案快照、这次调用已有的「已出门」记录、成因、状态码，以及 `data.loop-extension/v6#S-43` 的完整已生效重试结论）；**这条序列是那份主体背后的事实**——同一次调用走过哪几家、各自怎么收场、开没开口，两处说的是同一批事实。它也不写这条序列。

### S-24 一条响应体对应上游的一次请求

**每个已确认耐久「已出门」锚点的责任恰对应一条完整响应体，至多发起一次上游请求。**实际交给传输之后仍是一条响应体对应那一次请求；锚点后尚未 send 即取消的责任同样结算，但不能据它或 `sentAt: null` 声称已发生、未发生网络发送或费用为零。规划拒绝、无锚点取消仍无响应体。

- **传输层不得在一次发出之内隐藏重试。**[让上游在一次请求里自己按次序换家，那几条留痕就全没了——在我们这边它只是一次请求](../../../../product/PF-013-model-profiles-and-invocation/design.md#试过又失败的那几次留痕不进方程)；
  D-019 的比较门同样点名「无隐藏重试」。
- **每一次发出只指定一家，并且不许上游替我们回退到别家。**换一家是**再发一次**，由重试挂件决定，**各留一条**。
- **它的兑现方是传输适配**（pi-ai 定向 fork，D-019）与发出它的能力；本契约只立这条对应关系，证据形式在[验证入口](../verification.md)。

## 四、装配给与协议给

### S-25 装配给的保证与协议须给的保证

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：第一版是单机，但语义不变地可扩展为分布式。
**这张表本身是契约的一部分**：左列单机时由装配顺带给出的，在跨进程之后**不会自动成立**。

| 保证 | 单机由谁给 | 跨进程之后谁重新兑现 | 做不到会怎样 |
|---|---|---|---|
| **一条响应体对应已锚定责任及至多一次上游请求**（[S-24](#s-24-一条响应体对应上游的一次请求)） | **装配给**：传输适配与模型请求运行时同进程，重试只能由运行时发起 | **协议给**：传输若跑在另一个进程或节点，须把「一次发出」作为可对账的单元交回，任何重试都由调用方发起并各自留痕 | 留痕丢失：重试挂件看到的次数少于实际，**两笔钱只记一笔** |
| **所有实际时刻同源可比**（[S-17](#s-17-首-token-与时序)） | **装配给**：同一进程、同一时间源 | **协议给**：观察首 token 的一方与写响应体的一方若不在同一节点，须定义时钟偏差上界并纳入契约 | 「首 token 之前还是之后」判错——**把已经开口的判成没开口，重发一份** |
| **首 token 的观察可以被判出来**（[S-18](#s-18-首-token-缺席是一条断言)） | **装配给**：观察与写入在同一进程；**停机之后靠耐久记录**——「已开口」在首个内容交给任何观察者之前落进会话日志（`capability.model-request-runtime` v2 S-15），恢复时首 token 的有无取那条记录（它的 S-33） | **协议给**：观察者与写「已开口」的一方不在同一进程时，转发链上任何一跳都不得越过那条记录先把内容送出；观察者须在任何可能丢失连续性之前让「已经开口」这件事可恢复，且先于它宣称这一次结束 | 停机或网络分区之后，已开口的一次被读成没开口，**记录里躺着两份回复** |
| **`(call, dispatch)` 唯一、同一次调用内不重不跳**（[S-8](#s-8-第几次发出)） | **装配给**：同一次调用只有一个写入者（它的模型请求运行时），在一个进程里逐次发号 | **协议给**：发号须由一处给出；多个节点替同一次调用写响应体时要有唯一的序号来源 | 同号两条或跳号：**重试挂件数错已经试过几家** |
| **`ResponseId` 部署内唯一，写响应体的各方沿用同一个**（[S-6](#s-6-responseid)） | 单一生成点：写「已出门」的那一处；调用方与对账从那条记录取 | **协议给**：跨节点标识分配；唯一是承诺，不是「碰撞概率足够低」；写响应体的一方在另一节点时，标识随「已出门」记录或调用结果一起到达，不另铸 | `AssistantMessage.response` 指到两条，**「这句话是哪个模型说的」答出两个答案**；或同一次发出写下两条响应体 |
| **`late` 的判定**（[S-35](#s-35-晚到的那一条)） | **装配给**：写响应体的一方与尝试栅栏在同一进程，写下那一刻读得到那次尝试是否已被取代 | **协议给**：写入方须在写下时读到栅栏的最新状态（或随写入一起被栅栏裁决），不得据一份过期的「当前尝试」判不晚 | 栅栏关上之后才落的那一条没带 `late`：读的人以为运行终结之后的汇总不会再变 |
| **实际发出的参数、改过的值与没发出去的项如实留痕**（[S-11](#s-11-实际发出的参数改过的值与没发出去的项)） | **装配给**：传输适配与写「已出门」、写响应体的一方同进程，三种处置在出门之前当场可知 | **协议给**：传输适配在另一个进程时，每一项的处置（改了值的项名与前后两个值、没发出的项名）须**在出网之前**交回写「已出门」的一方、落进那条记录，出网时照它还原得出的那一组发、出网之后不再改（`capability.model-request-runtime` v2 S-38 传输适配第 10 条；`data.model-profile/v5` 第六节同一行）；**只随那次发出的结果一起回传不够** | 请求出网之后、结果回来之前停机：「已出门」上没有这两项，补写的响应体按「缺席即断言」写成「没改、没丢」——**一条假留痕**，排查的人被它带偏 |
| **凭据不进响应体**（[S-21](#s-21-写入之前脱敏)） | 写入点只有一个，在那里脱敏 | **协议给**：每个写入点各自在写入之前脱敏，不得把脱敏集中到下游某一处 | **凭据永久留在不可变的记录里** |

## 五、表示与边界校验

### S-26 Schema 的范围

交换与存储表示由 [`model-response.schema.json`](model-response.schema.json) 约束，JSON Schema **Draft 2020-12**，
`$id` = `https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/model-response/v8/model-response.schema.json`。
根模式只约束可保存的 `ModelResponse`。待提交交接须显式取 `$defs/PendingModelResponse`（S-39）；下述处置与晚到条件仅约束持久形状。

| `$defs` | 是什么 | 本契约的落点 |
|---|---|---|
| `ModelResponse` | 一条响应体；收场的条件关系以 `allOf` 的 `if/then` 表达 | [S-4](#s-4-一次调用一次发出一条响应体)、[S-13](#s-13-收场与其余成员的条件关系) |
| `PendingModelResponse` | 完整待提交回复事实；禁止处置与晚到，必带回复 | [S-39](#s-39-pendingmodelresponse) |
| `ResponseId` | 响应体标识，**家在本契约**；按 `identity-values` S-31 的散文自定义 pattern | [S-6](#s-6-responseid) |
| `ReplyDisposition` | `persisted`、`{ vetoed: { by, reason? } }` 或 `{ consumed: { by } }` | [S-14](#s-14-回复与已交付部分) |
| `ModelCallRef` | `{ runId?, callId }` | [S-7](#s-7-所属的那次调用) |
| `RunId`、`AttemptId`、`ModelCallId` | 运行标识、尝试序号、模型调用标识；三者都只 `$ref` `data.call-accounts` 的同名定义 | [S-7](#s-7-所属的那次调用)、[S-8](#s-8-第几次发出) |
| `CredentialScope` | 凭据那一格：`{ layer: factory }` 或 `ScopeLayerIdentity` 的租户那一支 | [S-9](#s-9-路由留痕) |
| `Route` | 路由留痕 | [S-9](#s-9-路由留痕)～[S-11](#s-11-实际发出的参数改过的值与没发出去的项) |
| `ParameterAdjustment` | 改了值再发出的一项：`{ name, requested, sent }` | [S-11](#s-11-实际发出的参数改过的值与没发出去的项) |
| `SelectedBy` | 有效模型怎么来的 | [S-10](#s-10-有效模型怎么来的) |
| `ResponseOutcome` | 收场四值 | [S-12](#s-12-收场) |
| `Failure`、`UpstreamError` | 故障与上游错误原文 | [S-15](#s-15-故障的成因与原样状态码) |
| `Timing` | 三个时刻 | [S-17](#s-17-首-token-与时序) |
| `RawResponse` | 上游原始响应留存 | [S-20](#s-20-上游原始响应留存) |
| `RawHeaders` | 头对象；值是字符串或有序字符串数组，允许空串、空数组、重复元素与空对象 | [S-20](#s-20-上游原始响应留存) |

`RawHeaders` 只是 S-20 的 Schema 表示名，不是新的领域概念或身份。Schema 能拒绝非法头值，但**不能证明采集、脱敏、交接和留存过程中未改写、丢弃或重排事实**；这些证据归写入者。`raw` 本身仍不得为空对象，`raw.headers = {}` 则是 S-20 明确允许的另一种值。

**它能约束的**：必需成员都在、没有多余成员、枚举取值闭合、`dispatch ≥ 1`、「缺席」与「空」只有一种写法（`delivered`、`droppedParameters`、`parameterAdjustments`、`upstreamError`、`raw` 都不许写成空，`trims` 不许全零，`late` 只取 `true`）、`replyDisposition` 与 `reply` 同在同缺、`initiator` 只在 `interrupted` 上且在那里必有、`runtime_lost` 不带 `reply`、`attemptId` 与 `call.runId` 同在同缺、`late` 只在带 `call.runId` 的那一条上、出厂格凭据只配官方档案、`unrecognized` 至少带一样痕迹、
[S-13](#s-13-收场与其余成员的条件关系) 那张表的每一格。

**它不能约束的**：S-36 的两个绑定相等关系（由 S-27 的纯判定继续检查）、历史绑定与实际发出是否相同；S-37 实际执行方是否被请求值冒填、名字是否对应同一供应商；S-38 缓存计数是否真实来自上游、是否由配置推测；`id` 是不是「已出门」上定下的那一个（[S-6](#s-6-responseid)）；`reply.response` 等于 `id`（[S-14](#s-14-回复与已交付部分)）；三个时刻的先后与同源、`firstTokenAt` 与「已开口」记录一致（[S-17](#s-17-首-token-与时序)）；
`firstTokenAt` 缺席是否确知（[S-18](#s-18-首-token-缺席是一条断言)）；`droppedParameters` 的名字都不在 `parameters` 里、`parameterAdjustments` 的名字都在 `parameters` 里且 `sent` 等于那一项、一个项名只出现一次、有没有漏报、与同一次发出的「已出门」逐项相同（[S-11](#s-11-实际发出的参数改过的值与没发出去的项)）；
`provider` 是否是档案允许的一家、第一次发出是不是第一家、不许回退时是不是第一家（[S-9](#s-9-路由留痕)）；`initiator = run_cancelled` 又带 `reply` 时那次取消是不是用户发起的（[S-13](#s-13-收场与其余成员的条件关系)）；`upstreamModel` 有没有被冒填（[S-9](#s-9-路由留痕)）；
三个「发不出去」成因不上响应体（[S-16](#s-16-发出了的才有响应体)）；`unrecognized` 带的痕迹是不是真的那样东西（[S-15](#s-15-故障的成因与原样状态码)）；`delivered` 在写入者手里还有已交付的块时有没有漏带（[S-13](#s-13-收场与其余成员的条件关系)）；`credentialScope` 是不是真用的那一格（[S-9](#s-9-路由留痕)）；`late` 判得对不对（[S-35](#s-35-晚到的那一条)）；
同一次调用的序列性质（[S-23](#s-23-同一次调用的响应体序列)）；脱敏（[S-21](#s-21-写入之前脱敏)）；无隐藏重试（[S-24](#s-24-一条响应体对应上游的一次请求)）；写下即不变（[S-22](#s-22-写下即不变)）。
**Schema 校验通过不表示这些条款成立**；它们的证据形式在[验证入口](../verification.md)。

**引用的形状由各自的家决定**：`call.runId`、`attemptId`、`call.callId`、`usage`、`cost`、`trims`（`data.call-accounts`），`reply`（`data.messages`），`delivered`、`raw.body`（`data.content-blocks`），`route.profile`、`route.profileSnapshot`、`route.adaptation`、`route.provider`、`route.parameters`（`data.model-profile`），`route.credentialScope` 的租户那一支（`data.identity-values`），`failure.cause`（`data.loop-extension`）；`parameterAdjustments` 与 `droppedParameters` 的项名按 `data.model-profile/v5#S-20` 的规则，Schema 只管它们是非空字符串。

### S-27 表示层拒绝值

**一个值不是合法的响应体时，给出下列闭合集合中恰一个拒绝值。**没有「其他」。

| 拒绝值 | 什么时候给 | Schema 里在哪 |
|---|---|---|
| `malformed` | 形状不合，且不属于下面任何一个具名情形：缺必需成员、类型不对、有多余成员、引用的外部形状不合、把不允许为空的成员写成空数组或空对象（S-20 的空 headers 对象、头值空串与空数组除外）、`trims` 全零、`late` 不是 `true`、`inBand` 不是 `true`；**另含几种无专名的跨成员情形**：`failure.inBand` 在而 `failure.statusCode` 缺席；`replyDisposition` 与 `reply` 不同在同缺；`initiator` 在 `interrupted` 上缺席或出现在别处；`runtime_lost` 带了 `reply`；`attemptId` 与 `call.runId` 不同在同缺；`late` 出现在不属于任何运行的那一条上；凭据记在出厂格而有效模型不是官方档案；`unrecognized` 一样痕迹都没带；S-36 的两处绑定错配；非 `interrupted` 持久响应的 `sentAt` 为 null | 各成员定义；`ModelResponse.allOf` 与共用 `ResponseFactsConstraints` 中对应条件 |
| `outcome_unknown` | `outcome` 是字符串但不在四值之内 | `ResponseOutcome` |
| `dispatch_zero` | `dispatch` 是整数但小于 1 | `ModelResponse.properties.dispatch` |
| `cause_unknown` | `failure.cause` 是字符串但不在八个成因之内 | `Failure.properties.cause` |
| `reply_missing` | `complete`／`truncated` 没有 `reply` | 共用条件约束第一支 |
| `reply_on_failure` | `failed` 带了 `reply` | 共用条件约束第二支 |
| `reply_and_delivered` | 同时带 `reply` 与 `delivered` | 共用条件约束第三支 |
| `failure_missing` | `failed` 没有 `failure` | 共用条件约束第四支 |
| `failure_on_interrupted` | `interrupted` 带了 `failure` | 共用条件约束第五支 |
| `failure_on_success` | `complete`／`truncated` 带了 `failure`——回复在落盘之前被否决也不例外，那记在 `replyDisposition` 上 | 共用条件约束第六支 |
| `reply_ending_mismatch` | `reply.ending` 与 `outcome` 错配（`complete` ↔ `complete`、`truncated` ↔ `truncated_at_limit`、`interrupted` ↔ `interrupted_by_user`） | 共用条件约束第七支的三个分支 |
| `first_token_inconsistent` | `firstTokenAt` 的有无与收场、回复、已交付部分或成因对不上：成因是 `interrupted_mid_reply` 却没有它；`failed` 有它而成因不是 `interrupted_mid_reply` 或没有 `delivered`；有 `reply` 或 `delivered` 却没有它 | 共用条件约束第八支的五个分支 |

**一个值同时违反几条时，按下面的次序取第一条被违反的，给恰一个值**——拒绝值说明的是第一处不合，不是违规的全集：

1. **成员各自的形状**：先 `outcome_unknown`、`dispatch_zero`、`cause_unknown`，其余成员层面的不合一律 `malformed`；
2. **跨成员的条件**：`reply_missing` → `reply_on_failure` → `reply_and_delivered` → `failure_missing` → `failure_on_interrupted` → `failure_on_success` → `reply_ending_mismatch` → `first_token_inconsistent`，最后是上一行列的那几种无专名的跨成员情形（包括 S-36 的两处绑定错配），给 `malformed`。

**「`delivered` 只出现在开了口却没有回复的那几行」不单列一支**：按上面的次序它必然先撞上 `reply_missing`、`reply_and_delivered` 或 `first_token_inconsistent` 之一
（`complete`／`truncated` 必带 `reply`；带 `reply` 即与 `delivered` 冲突；`delivered` 要求有首 token）。

**`first_token_inconsistent` 管的是「`firstTokenAt` 的有无与 [S-13](#s-13-收场与其余成员的条件关系) 那张表对不上」的全部情形**，不只「`interrupted_mid_reply` 却无 `firstTokenAt`」那一种。

### S-28 表示层拒绝与判定分开

**表示非法的输入在进入任何判定之前被拒绝**，与 [`data.identity-values/v1#S-33`](../../identity-values/v1/contract.md#s-33-表示层校验与判定分开) 同一规矩：

- **拒绝不表示这次发出没有发生**，也不表示这次调用失败了。一个被判为 `malformed` 的值说明**写入者写坏了**，
  正确的收场是那个写入者的缺陷被暴露出来，**不是**把这次发出当成「没发过」而再发一次，也**不是**把它当成一次 `failed`。
- **表示合法不表示任何条款成立**：[S-26](#s-26-schema-的范围) 列的那些 Schema 管不到的条款，一条都不因校验通过而成立。
- **校验失败不得降级为「按默认处理」或「尽力而为」**：不补一个 `outcome`、不把缺了的 `firstTokenAt` 当作「没开口」、不把缺了的 `failure` 当作「没认出来」。

## 六、性质与规范场景

### 性质

| 类别 | 性质 | 条款 | 来源 |
|---|---|---|---|
| 不变量 | 每个已确认「已出门」责任恰好留一条响应体；无锚点的调用没有 | S-4、S-8、S-16 | [PF-013 §5.5](../../../../product/PF-013-model-profiles-and-invocation/design.md#试过又失败的那几次留痕不进方程)、[flows §3.2](../../../../product/PF-013-model-profiles-and-invocation/flows.md#32-一次模型调用) |
| 不变量 | 收场与回复、已交付部分、故障、首 token 的组合只取 S-13 表中七行之一 | S-13 | [PF-009 §5.6](../../../../product/PF-009-context-message-types/design.md#56-流断在半路)、[PF-013 §5.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类) |
| 不变量 | 一条响应体写下即不变 | S-22 | [UL-record-entry](../../../../ubiquitous_language/terms/record-and-context.md#ul-record-entry--记录条目--record-entry) |
| 不变量 | 同一次调用至多一条带 `reply`，且是最后一条 | S-14、S-23 | [PF-013 flows §3.2](../../../../product/PF-013-model-profiles-and-invocation/flows.md#32-一次模型调用) |
| 不变量 | 正常收尾与截断的回复都说得出有没有成为消息；被否决的那份不在日志里冒充一条消息 | S-13、S-14 | [PF-012 消息落盘之前的否决](../../../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前的否决按消息是谁产生的分三路) |
| 安全 | **绝不能**：首 token 之后的故障被记成可重发的成因；**绝不能**：有首 token 的一次调用再发一次——回复被否决之后的再试是另一次调用 | S-13、S-17、S-23 | [PF-013 §5.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类) |
| 安全 | **绝不能**：「不知道开没开口」被写成「没开口」 | S-18 | [PF-013 §5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token) |
| 安全 | **绝不能**：用户中断被记成故障，或故障被记成中断 | S-12、S-13 | [PF-013 §5.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#还有一种没走完它不在这张表里) |
| 安全 | **绝不能**：拿不到的用量或费用被记成零；重发之后前一笔钱消失 | S-19 | [PF-013 §5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token)、D-019 |
| 安全 | **绝不能**：上游不认的参数被静默丢掉，或被静默改了值；留痕里的参数与实际发出的不一样 | S-11 | [PF-013 §4 模型档案](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案) |
| 安全 | **绝不能**：尝试被栅栏关掉之后才落的那一条被当成不晚——运行终结之后的汇总被读成不会再变 | S-35 | [PF-012 §6.17 I-11](../../../../product/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式) |
| 安全 | **绝不能**：凭据写进响应体 | S-21 | [PF-013 §6.16](../../../../product/PF-013-model-profiles-and-invocation/design.md#616-错误信息外泄之前要脱敏) |
| 安全 | **绝不能**：上游没回报的模型名被路由名冒填 | S-9 | D-019（同一条理由：不把路由名填进实际服务商字段） |

**本契约没有进展性质**：它不拥有「一次发出最终会结束」这类承诺——那是写它的能力的事（发出有没有超时、谁收口）。
它只承诺**结束之后写下的那一条是什么**。

### 规范场景

场景是本契约触发的证据形式；执行状态与结果在[验证入口](../verification.md)，不写进本版本目录。
**每一条都需要一个实现了模型请求运行时的提供者**；Schema 正反实例在 [`examples.md`](examples.md)。

#### S-29 两次发出，两条响应体，两笔钱

让一次调用的第一次发出以上游 503 失败（首 token 之前），重试挂件换一家再发，第二次正常收尾。
**必须观察到**：恰两条响应体，`dispatch` 为 1、2，`call` 相同，`route.provider` 不同；第一条 `failed`、成因 `upstream_unavailable`、`statusCode = 503`、没有 `firstTokenAt`、没有 `reply`；
第二条 `complete`、带 `reply` 且 `reply.response` 等于它的 `id`；**两条各有自己的 `usage` 与 `cost`**，按 Run 汇总时两笔都计入（拿不到的那一笔计为「未知」，不当零）。
**绝不能观察到**：只有一条响应体，或第一笔费用消失。手算见 [`examples.md` 末节](examples.md#四按尝试记明细按-run-汇总)。

#### S-30 首 token 之后的故障

让上游在吐出第一段文本之后，在流里回一个带内错误 `code: 429` 再断开。
**必须观察到**：一条 `failed`，成因 `interrupted_mid_reply`，`statusCode = 429` 原样且带 `inBand: true`（不是那次响应的 HTTP 200），`firstTokenAt` 在，`delivered` 含已交付的那段文本，**没有 `reply`**；
**这次调用不再有第二次发出**，哪怕重试挂件被换成一件「见 429 就重试」的拓展件。

#### S-31 用户中断的两支

同一次演练里跑两支：在首 token **之前**中断，在首 token **之后**中断。
**必须观察到**：两条都是 `interrupted`、都**不带 `failure`**；之前那条没有 `reply`、没有 `firstTokenAt`；之后那条有 `reply`（`ending = interrupted_by_user`，内容是已交付的那部分）、有 `firstTokenAt`。
**绝不能观察到**：任何一条被记成 `failed`。两支必须同跑，只跑一支证明不了「中断不带成因」对两种情形都成立。
**再加系统取消运行的一支**（会话归档，在首 token 之后）：必须观察到 `interrupted`、`initiator = run_cancelled`、**没有 `reply`**、`delivered` 带着已交付的那段；**绝不能观察到**一条 `ending = interrupted_by_user` 的回复（[S-13](#s-13-收场与其余成员的条件关系)）。

#### S-32 没发出去的调用没有响应体

让选中的档案被撤回，再发起一次调用。
**必须观察到**：这次调用上交、成因「已下架」随上交条目走，**没有任何一条响应体**；日志里也找不到一条带 `withdrawn` 的响应体。

#### S-33 参数不静默丢、不静默改

同一次演练里跑三支，**每一支都同时抓发往上游的请求体**：
① 让档案或「调模型之前」的拓展件带上一项传输适配认不得的统一参数；② 带上一项 `extra` 里上游认不得的私有项；③ 让上游只认更窄的取值域（比如推理强度没有 `max` 那一档），档案带 `reasoningEffort: max`，传输适配改成上游收得下的一档再发。
**必须观察到**：①② 那一条响应体的 `route.parameters` **不含**该项，`route.droppedParameters` 列出它的名字（② 是 `extra` 的键），**发给上游的请求里没有它**；
③ 那一条的 `route.parameters.reasoningEffort` 是实际发出的那一档，`route.parameterAdjustments` 有 `{ name: reasoningEffort, requested: max, sent: <那一档> }`，发给上游的请求里正是那一档。
**绝不能观察到**：`droppedParameters` 缺席而某一项实际没发出去；`parameters` 里的值与发给上游的不一样；改了值却没有 `parameterAdjustments`。

#### S-34 凭据不进响应体

让上游错误与响应头里带上一段已知的凭据样式文本。
**必须观察到**：写下的响应体里——`failure.upstreamError`、`raw.headers`，以及 `raw.body` 指向的那份留存——**找不到那段文本**。
本场景的判据依赖脱敏规则本身（[G-5](#七已知缺口)），在规则定下之前只能用「已知凭据原文不出现」这一种判法。

## 七、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决，实现不得据一个看起来合理的猜测推进。

| # | 缺口 | owner | 闭合条件 |
|---|---|---|---|
| G-1 | **已闭合（2026-09-23）**：主线裁定 `RunId` 的家在 `data.call-accounts` v2，本契约 `$ref` 那里（[S-7](#s-7-所属的那次调用)）；定义已在 [`data.call-accounts/v2#S-37`](../../call-accounts/v2/contract.md#s-37-三个归属标识的家runidattemptidmodelcallid)。编号保留不重排 | — | — |
| G-2 | **已闭合（2026-09-23）**：同上，`ModelCallId` 与 `AttemptId` 的家也定在 `data.call-accounts` v2；`data.arrival-events` 本地那一份同样改为引用那里（对齐波的事） | — | — |
| G-3 | **租户归属与条目壳**：响应体不带 TenantId，归属靠承载它的记录条目；条目壳（带会话、Run、尝试与租户，声明效力与寿命宿主）**尚无契约**。`reply` 与日志里那条消息落成一条条目还是两条也等它（[S-7](#s-7-所属的那次调用)、[S-14](#s-14-回复与已交付部分)、[S-19](#s-19-用量与费用)） | loop 那一程（主线） | 条目壳的契约成立，并兑现 `data.identity-values/v1#S-16` 的持久形状义务 |
| G-4 | **上游原始响应留存的保留期**：它是一项设置，归 PF-002 那套设置机制，本契约不定（[S-20](#s-20-上游原始响应留存)） | 产品负责人（PF-002 设置）＋ 主线（哪份契约承载这项设置） | 那项设置立起来（名字、归属的资产、默认值由谁给） |
| G-5 | **脱敏规则**：什么算凭据、哪些头要剥、怎样识别错误原文里的凭据（[S-21](#s-21-写入之前脱敏)） | `capability.model-request-runtime` | 能力契约写出规则与它的证据形式；S-34 的判据随之具体化 |
| G-6 | **已闭合（2026-09-23）**：主线裁定（与 `data.loop-extension` 对齐）——回复在落盘之前被否决时，收场仍是 `complete`／`truncated`，记 `replyDisposition = { vetoed: { by, reason? } }`，这次调用照样结束；再试由 loop 另起一次新的模型调用（新的 `callId`），首 token 规则不加例外（[S-13](#s-13-收场与其余成员的条件关系)、[S-14](#s-14-回复与已交付部分)、[S-17](#s-17-首-token-与时序)、[S-23](#s-23-同一次调用的响应体序列)、[`examples.md` E-8](examples.md#e-8-同一个-run-里前后两次调用前一次的回复被否决)） | — | — |
| G-7 | **已闭合（2026-09-24 整批对齐）**：补写者与时点、两支的收场由 `capability.model-request-runtime` v2 S-33 的对账给出——首 token 之前与之后都是 `interrupted`、`initiator = runtime_lost`，前者可续接再发（[S-12](#s-12-收场)、[S-23](#s-23-同一次调用的响应体序列)）；「已开口」先落耐久记录再交出内容，判不出时不写成缺席，由那份契约的 S-15 兑现。首 token 之后停机记成被中断（`initiator = runtime_lost`）而不是故障，与 [PF-013 §5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token) 现行措辞一致（「这次调用就此收场，记下的原因是运行时失联」，PF-013 decisions R-MR-1；主线裁定见 D-060 §S16 S16-g） | — | — |
| G-8 | **继承 v4 表示**：S-37 的 `route.servingProvider` 保留上游报告的实际执行方，不替换请求方、不在缺席时冒填。原缺口的取证部分见本版验证说明 | 模型请求运行时的提供者设计 ＋ `capability.model-request-runtime` | 表示已起草；名称对应、供应商不一致处置及真实响应证据仍须提供者验证 |
| G-9 | **可追溯组成的其余部分不在这里**：[I-5](../../../../product/PF-004-agent-definition-and-assembly/design.md#61-不变式) 要的「当时装的是什么」除了档案与参数，还有这一次组装出的系统提示词与上下文视图；本契约只兑现档案与参数那一半（[S-3](#s-3-消费者)） | PF-010 组装的能力 ＋ `capability.model-request-runtime` | 请求组成的留痕有了家，并说明怎样与本条的 `id` 关联 |
| G-10 | **OpenRouter 真实费用字段的取证**：提供者层事实，不进条款；详情只记在[验证入口的已知缺口](../verification.md#已知缺口) | 模型请求运行时的提供者设计 | 钉 SDK 版本时一并取证，结果回填到验证入口 |
| G-11 | **已闭合（2026-09-23）**：两条裁决已落为 D-058（8b ／ Q14）；设计依据已改成链接 | — | — |
| G-12 | **已闭合（2026-09-24 整批对齐）**：`replyDisposition` 凡 `reply` 存在即必带（主线裁定，见 D-060 §S8 S8-e）；被中断的那份回复被否决之后不成为消息，这次调用仍以被中断结束（[S-14](#s-14-回复与已交付部分)） | — | — |
| G-13 | **已闭合（修复波 2）**：运行被取消按谁发起的分两路（主线裁定，见 D-060 §七 M12，`data.messages/v6#S-10`）——用户发起的，已交付的那一份成为回复、`ending = interrupted_by_user` 说的正是那位用户；系统发起的（会话归档、宿主停止或被撤下）在途的流被放弃，**没有回复、带 `delivered`**（[S-13](#s-13-收场与其余成员的条件关系)「开了口、没有回复」那一行）。`ending` 不新增取值，本契约的表示不变 | — | — |
| G-14 | **已闭合（修复波 2）**：`consumed` 的那一次**不触发**「调模型之后」——`data.loop-extension/v6#S-2` 已写明（主线裁定，见 D-060 §六 N-2）；[S-5](#s-5-与别的形状的关系) 那一行改为引用它 | — | — |
| G-15 | **本候选内已按主线技术澄清收齐，待独立审查**：S-9/S-11 的参数三项保持同次固定最终计划的适配结果；真实 send 必须一致，锚点后零 send／发送不可判的中断原样还原，不以参数存在断言已发送。不升级 MP/MS 形状 | 主线语义 owner 与独立评审者 | 候选表达独立审查及主线接受；真实发送一致性与恢复取证由提供者另验 |

## 八、待提交交接与版本边界

### S-39 PendingModelResponse

`PendingModelResponse`（无独立词条）是本契约拥有的模型响应体待提交表示名，不新增领域对象、身份、状态或收场。它适用于运行时向回复写入者交接尚待确定消息处置的那份完整回复事实；所有持久日志保存入口仍只接受根 `ModelResponse`。

1. **完整事实**：拥有 `ModelResponse` 的全部已知可观察事实，适用同一必填、可缺席、相等、来源、时序、结束、身份及回复关联规则，**仅移除且禁止** `replyDisposition` 与 `late`。不以未知用量填零，不裁掉路由、实际参数、完整档案快照、适配绑定、上游执行方、缓存、用量费用、原样多值头、原始响应引用或已知结束事实。可选项的缺席仍是原条款的断言，不因「待提交」而省略已知事实。
2. **有回复的闭合分支**：`timing.sentAt` 必须是实际时间点，不接受 null（投影成员形状不合，按 S-27 第 1 层 `malformed`）；`reply` 必填；`outcome` 仅允许 `complete`、`truncated` 及满足 S-12/S-13 条件的有回复 `interrupted`；不接受 `failed`。沿 S-13 的 `reply.ending` 对应、首 token 必在、`reply` 与 `delivered` 互斥、故障成员禁用、`runtime_lost` 无回复等约束。S-13 对用户/系统发起取消的事实判定仍适用，Schema 不能把系统取消改判为用户取消。
3. **纯校验边界**：输入是显式选用本投影的完整值，输出是合法或 S-27 中恰一个表示层拒绝值；失败集合及优先级沿 S-27。三值之外但属持久四值的 `failed`、禁止的成员、缺 `reply` 等投影本身的形状不合归成员层 `malformed`，任意未知 outcome 仍先为 `outcome_unknown`。其余结束错配与首 token 错配沿原具名拒绝。校验不授权、无状态变化、无提交点、无外部副作用；身份无默认值，不能验证事实时由交接能力明确失败，不补值或放行。
4. **提交责任**：待提交值不是已保存记录。提交者必须确定 S-14 的 `replyDisposition`，并按 S-35 在实际提交时判 `late` 后，产出完整合法的持久 `ModelResponse`；不能从待提交缺 `late` 推断「不晚」，不能先填 `persisted` 再等待消息提交。此投影不授权删去或更改其余事实；消息变换、否决或消费的处理仍沿相应写入契约。已有标识沿用，不重新铸造。并发提交、恢复、原子性与授权由写入者的能力契约兑现，不由本数据表示假定。
5. **共同条件**：Schema 在本 owner 内共用 `ResponseFactsConstraints`。待提交形状没有引用强制 `replyDisposition` 的持久根再追加禁止条件；持久根仍要求凡有 `reply` 即带处置，缺席不放行。S-21 脱敏在交出待提交事实前同样成立。

### S-40 输入限制快照与历史版本边界

`route.profileSnapshot` 精确消费 [`data.model-profile/v5#S-27`](../../model-profile/v5/contract.md#s-27-modelprofilesnapshot档案在某一刻的副本)。完整保留当时项目供给 cap、`inputConstraints`、匹配的 `upstreamInputLimits` 与 `updatedAt`，不改模态、不从当前目录补旧快照、不把缺字段解释为 unknown/unbounded。快照的 S-18/S-33 跨字段关系由写快照一方按 MP5 S-27 的完整原样复制义务保证；响应体接收方只校验快照形状，不重做这些关系的表示层判定，不把写入者违约映射为本契约 `malformed`。缺必填成员、类型或条件适用域不合等形状错误仍按本契约 S-27 拒绝；本契约 S-36 的绑定相等判定不受此边界影响。实际输入计量证据、最终发送计划及发送许可归消费快照的能力。

`reply` 精确消费 `data.messages/v6` 的 `AssistantMessage`。本版只接受精确当前格式；缺少必填限制或其它不合表示的旧响应沿 S-27 的既有 `malformed` 拒绝，不提供旧响应读/认回/结算路径，不改写或清空原数据。当前代际响应与待提交事实的保存、对账及提交责任仍按本版原保证；发送许可归运行时。本值不新增版本判别成员，也不通过来源版本号本身拒绝结构与语义均符合本版的显式输入。

## 九、版本差异与规范工件

本版从已接受 MR7 演进，保留 S-1～S-40 编号，S-9/S-11 澄清同次最终计划的参数留痕与真实发送关系，S-16/S-17/S-24 澄清锚点责任与未知实际发送时刻；S-27 复用 malformed，S-39 保留待提交值必须有实际发送时刻。其余收场、首 token、账、真实事实、原样头、绑定与精确依赖保持。根 ModelResponse 的合法域只在 interrupted 的 sentAt:null 分支扩展；不升级 MP5/MS6/LC6，不为旧实现留过渡面。

规范工件为本文件、[`model-response.schema.json`](model-response.schema.json)、[`examples.md`](examples.md)。本契约只有数据形状与纯校验，无新运行操作；操作九项中的状态、提交、授权及副作用均不适用，交接操作由能力拥有。**不建空 TLA+ 或 Alloy**：S-39 的有限组合约束由 Schema 与正反实例表达，事实完整性、跨字段相等由纯校验和写入者场景取证；S-23 序列及 S-35 提交时晚到判定是运行时行为，形式义务归其 owner。本契约不把未建模语义登记成已覆盖。

## 报给主线

- `PendingModelResponse`（S-39）是主线确认的 Schema 表示名，无独立词条；不新增正式领域术语。若需提升为独立概念，由统一语言 owner 裁定。
- S-39 提交时 `late`、完整事实交接与 S-40 新旧发送边界须由运行时及调用方提供者验证；本包不宣称链路已实现。继承 G-3/G-4/G-5/G-8/G-9/G-10 的 owner 与闭合条件不变。

- 本版新增时序表达须由实际日志恢复与写入者符合性验证；Schema 通过不能证明 durable dispatched 存在、实际 sentAt 已不可用或恢复未发送。

- G-15 已按本轮主线施工简报的补充裁定窄修；仅为候选技术澄清，未被接受。参数真实发送一致性与恢复原样还原须由提供者验收。
