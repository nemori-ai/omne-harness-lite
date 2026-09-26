# 块 C 模型请求运行时：切成几份能力、由几个插件提供、落在哪个领域

## 需要作出的选择

机制读数把块 C 拆成了 20 个对象：PF-013 的模型档案与凭据、选中模型与有效模型、模态投影、一次模型调用、模态转换件。
其中三个落在 #8（插件＋服务），是本包要切的对象：

| 单元 | 承载什么 | 在哪一处 |
|---|---|---|
| **P-1 档案目录**（无词条，装配单元名） | [模型档案](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-profile--模型档案--model-profile)的登记、撤回、读与列举；官方档案清单的装入；范围上那把[模型凭据](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential)的配与取 | [治理中心](../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-governance-center--治理中心--governance-center) |
| **P-2 模型请求运行时** | 合法目标集合（无词条）、展示列表（无词条）、切换、[选中模型](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-selected-model--选中模型--selected-model)与[有效模型](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-effective-model--有效模型--effective-model)、[一次模型调用](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call)的发出与收场、单独中断、停机后的对账、[模态投影](../../../ubiquitous_language/terms/record-and-context.md#ul-modality-projection--模态投影--modality-projection)的缓存、传输适配 | [会话据点](../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-session-base--会话据点--session-base) |
| **P-3 模态转换** | [模态转换件](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-modality-converter--模态转换件--modality-converter)的登记表，以及站在「消息落盘之前」的那件系统自带模态转换挂件。每个键上的转换件（P-4\*）是它之下的子插件，落点 #7 | 会话据点 |

下文「中心」指治理中心、「据点」指会话据点，只是简称。

本包回答三件事：这三块各自该是一份独立能力、并进已有能力，还是互相合并；由几个插件兑现；落在哪个领域名下。
每块至少比较三个实质候选，写清各自怎样承载性质、失去哪个保护点、出现哪个反查信号、可计数的代价是多少，
然后推荐一条，并写明什么证据会让落选的候选重新被考虑。这些都在 [alternatives.md](alternatives.md)。

**选错的后果是看得见的**。下面每块举一条，都出自 alternatives 的反例：

- **P-1**：若并进组织治理，一份格式有误的官方档案清单会让组织治理那条 fiber 起不来，登录之后切不了租户、发不了邀请
  （[`plugin-throw-fails-fiber`](../../../basis/cordis/plugin-throw-fails-fiber.md)）。若并进据点上的运行时，
  甲在组织层建的档案乙看不到（[PF-016 §5.6](../../../product/PF-016-cli-tui-delivery-surface/design.md#56-哪些东西在中心一侧哪些在据点一侧)）。
- **P-2**：若把调用做成 fiber，提供者一换代，内核就把插件体重跑一遍。这时插件体就是那次调用，
  于是开过口的回复会被自动再发一次（[`plugin-body-reruns-on-provider-change`](../../../basis/cordis/plugin-body-reruns-on-provider-change.md)，与 M-11 相冲）。
- **P-3**：若每个转换件直接做成一件独立拓展件，转换件一时不可用就会被当作「没装」。块于是照原样落盘、没有 transcript，
  这个会话的可选模型从此永久少一截——这正是主线裁定 C-7 要堵的那条路。

### 必须保留的性质（与切分有关的那一部分）

领域读数列了 63 条性质（不变量 25、安全 26、进展 12），对账后得到「能」27 条、「有前提地能」30 条、「不能·需求正当」5 条、「不能·需求过度」1 条（已处置）。
下表只收**保护点会随切法移动**的那一部分，编号 M-n 只在本包内有效。**依据以产品正文为准**。
标「主线裁定」的几条出自任务区账本（`tmp/assets-runtimes/`，未入库），**还没有经产品负责人签字**。

| # | 性质 | 依据 |
|---|---|---|
| **中心一侧** | | |
| M-1 | **路由名唯一**：判定与建档写入落在同一个提交边界里，这个边界覆盖整个判定域。判定域有两种读法：[`data.model-profile` v2 S-3](../../../spec/data/model-profile/v2/contract.md#s-3-路由名在全部档案里唯一)（候选）写的是全部档案；主线 2026-09-23 改判为「官方名对所有层保留，自建名在所在隶属树内唯一」，要等对齐波落实 | [PF-013 §4 模型档案](../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案)；[D-058](../../decisions/message-and-shape-rulings/decision.md) Q11 |
| M-2 | **撤回是一个动作，不是删除**：行保留；已撤回的读得出来，但不能再被新选中；官方档案谁都撤不了；官方清单随发布装入，只增不删。另有账本 U-2 待裁：上游把同名模型重新上架时怎么办 | [PF-013 §6.4](../../../product/PF-013-model-profiles-and-invocation/design.md#64-撤回不删行会话指向被撤回的档案时说已下架)；[flows §3.1](../../../product/PF-013-model-profiles-and-invocation/flows.md#31-一条模型档案)、[§4](../../../product/PF-013-model-profiles-and-invocation/flows.md#四角色与操作) |
| M-3 | 模型凭据是范围身上的一项属性，一个范围一把，轮换就是改值；档案上没有凭据 | [PF-013 §5.6](../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上)、[§6.2](../../../product/PF-013-model-profiles-and-invocation/design.md#62-凭据挂在范围上档案自己不存)；[MP S-22](../../../spec/data/model-profile/v2/contract.md#s-22-凭据价格与实际用了哪条都不在档案上) |
| M-4 | 建、撤自建档案与配凭据，只限组织超管与租户在自己那一层 | [PF-013 flows §4](../../../product/PF-013-model-profiles-and-invocation/flows.md#四角色与操作) |
| M-5 | 凭据的值不出现在任何对外可见的面上；能呈现的只有「有没有、是哪个范围的、什么时候配的」 | [PF-013 §6.16](../../../product/PF-013-model-profiles-and-invocation/design.md#616-错误信息外泄之前要脱敏)；[PF-016 §6.11](../../../product/PF-016-cli-tui-delivery-surface/design.md#611-秘密不进任何一份呈现) |
| M-6 | 档案和挂在范围上的凭据都在中心一侧。据点调用时取所在范围的那一把；中心不可达时用手上的副本；组织层那一把本版不下发（账本 U-1 待裁） | [PF-016 §5.6](../../../product/PF-016-cli-tui-delivery-surface/design.md#56-哪些东西在中心一侧哪些在据点一侧)、[§6.17](../../../product/PF-016-cli-tui-delivery-surface/design.md#617-治理中心不可达已经开着的会话照常干活)、[§6.20](../../../product/PF-016-cli-tui-delivery-surface/design.md#620-每台机器上只有自己那一把凭据) |
| M-7 | 一次调用用的是发起租户所在范围里最具体的那一把：租户层有就用租户层的，否则用组织层的；**从不**取个人范围或别的租户的 | 主线裁定 C-12；[SYS-TENANT](../../../foundation/cross-system-constraints/requirements.md#sys-tenant) |
| **据点一侧：选择** | | |
| M-8 | 选中模型等于会话日志里最后一条切换事实。从没切换过时，取「用哪个模型」这项设置在会话格的求值（主线裁定 C-11）。切换是用户的直接命令，对合法目标不得拒绝；先落事实再生效；不打断正在进行的调用 | [PF-013 §6.5](../../../product/PF-013-model-profiles-and-invocation/design.md#65-切换是用户的直接命令合法目标不得拒绝)～§6.8 |
| M-9 | 合法目标集合 = 在册 ∩ 这个范围允许 ∩ 兼容模态投影；展示列表 = 合法目标 ∪ 当前选中的那条。出门前核对的是有效模型（主线裁定 C-10）；不替用户改选 | [PF-013 §5.10](../../../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事)、[§6.9](../../../product/PF-013-model-profiles-and-invocation/design.md#69-合法目标算不出来时不替用户改选)、[§6.10](../../../product/PF-013-model-profiles-and-invocation/design.md#610-模态兼容挡在算合法目标那一刻不挡在出门那一刻) |
| M-10 | 模态投影从会话日志派生，只增不减，重算一定得同一个答案；问一次的代价是常数 | [PF-013 §4 模态投影](../../../product/PF-013-model-profiles-and-invocation/design.md#模态投影)、[§6.18](../../../product/PF-013-model-profiles-and-invocation/design.md#618-模态投影要答得快而且是增量维护出来的) |
| **据点一侧：调用** | | |
| M-11 | 三类事实——发不出去、重试没用、已经开口说话了——都不重试，任何拓展件都推翻不了；首 token 之后，同一次调用不再发出 | [PF-013 §5.4](../../../product/PF-013-model-profiles-and-invocation/design.md#54-三类事实归本层定死其余照状态码)、[§5.12「有三件事它改不动」](../../../product/PF-013-model-profiles-and-invocation/design.md#有三件事它改不动)、[§6.12](../../../product/PF-013-model-profiles-and-invocation/design.md#612-事实判断归本-topic策略归拓展件) |
| M-12 | 停机之后看首 token：停在首 token 之前，就在同一次调用下再发；停在之后，一律不重发。「已出门」写在出网之前，「已开口」写在第一份内容交给任何观察者之前（主线裁定 C-2） | [PF-013 §5.13](../../../product/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token)；[PF-012 §5.8 等人是 loop 的原语](../../../product/PF-012-agent-loop-and-run/design.md#等人是-loop-的原语) |
| M-13 | 宿主永远是 [agent runtime](../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-agent-runtime--agent-runtime--agent-runtime)。单独中断只作用于这一次调用，不动工具执行，也不动这个 Run。用户中断不算故障，中断意图要先落日志 | PF-013 §5.13、[flows §4](../../../product/PF-013-model-profiles-and-invocation/flows.md#四角色与操作)；[PF-012 §6.13](../../../product/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走)、[§6.15](../../../product/PF-012-agent-loop-and-run/design.md#615-取消先落日志再发信号) |
| M-14 | 每次发出只走一家；不让上游在一次请求里自己换家；没有隐藏的重试 | [PF-013 §5.5](../../../product/PF-013-model-profiles-and-invocation/design.md#55-上交交给谁看模型说没说出话)、[§2 非目标](../../../product/PF-013-model-profiles-and-invocation/design.md#非目标)；[D-019 比较门](../../decisions/model-provider-pi-ai-fork/decision.md#理由与保留前提) |
| M-15 | 重试是挂在「调模型之后·失败」上的可替换拓展件，系统自带一件默认的，不为它新增位置；agent 不能为了绕开一次失败自己换模型 | [PF-013 §5.12](../../../product/PF-013-model-profiles-and-invocation/design.md#512-重试站在一个已经存在的位置上)、[§6.13](../../../product/PF-013-model-profiles-and-invocation/design.md#613-试尽由拓展件判定档案的两项声明是它的输入)；[PF-012 §5.8 系统自带的几件](../../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件各站在哪) |
| M-16 | 挂件、压缩闭包、旁路提问里发起的调用都适用同一套规则，宿主同样永远是 agent runtime（主线裁定 C-14） | [PF-012 §5.8 挂件自己花的钱](../../../product/PF-012-agent-loop-and-run/design.md#挂件自己花的钱算它插手的那个-run) |
| M-17 | 凭据改了值，此后的下一次发出就用新值 | PF-013 §5.6「轮换就是改这一项的值」；PF-016 §6.20 |
| M-18 | 每次调用都留下实际用的那条档案、实际发出的参数，以及没带上的那几项；一次调用里的各次发出用同一份档案快照（快照落在哪里，见 D 对账「需主线看」第 1 项） | [PF-004 §6.6](../../../product/PF-004-agent-definition-and-assembly/design.md#66-模型在每次请求时确定)；PF-013 §4 请求参数 |
| **据点一侧：转换** | | |
| M-19 | 每个键（一种模态，或一种文件媒体类型）上至多一件转换件生效；替换只发生在系统装配那一层；本版转换件不是资产 | [PF-013 §4 转换件](../../../product/PF-013-model-profiles-and-invocation/design.md#转换件) |
| M-20 | 转换失败就是否决，那条消息不落盘。登记了但此刻不可用，也算转换失败（主线裁定 C-7）；只有没登记的键，块才照原样落盘 | PF-013 §4 转换件；[PF-012 §5.8 不可用即卸载](../../../product/PF-012-agent-loop-and-run/design.md#拓展件是可插拔的服务不可用即卸载报错按策略) |
| M-21 | 一个文件块同时命中模态键与媒体类型键时，媒体类型键优先，只出一份派生表示（主线裁定 S1-g） | 任务区账本 S1-g |
| M-22 | 转换件不判断这次要不要转，也不知道会话此刻用哪个模型；「消息落盘之前」那一刻可以没有 agent runtime | PF-013 §4 转换件「三件事它不做」；[PF-012 §5.8 两个地方等不了](../../../product/PF-012-agent-loop-and-run/design.md#两个地方等不了)；[PF-014 §5.6](../../../product/PF-014-inbound-intake-and-queueing/design.md#56-消息落盘之前那一刻看得到什么) |
| M-23 | 原块不动；[派生表示](../../../ubiquitous_language/terms/record-and-context.md#ul-derived-rendering--派生表示--derived-rendering)与 [transcript](../../../ubiquitous_language/terms/record-and-context.md#ul-transcript--transcript--transcript) 挂在原块上，落盘之前写定 | PF-013 §4 转换件 |
| **贯穿** | | |
| M-24 | 系统自带的拓展件不享受特权：外来拓展件做不到的事，自带的也不能做 | PF-012 §5.8 系统自带的几件 |
| M-25 | 会话与 Run 在据点；中心是独立应用，**不知道任何会话**；模型请求不经中心出去 | [D-022](../../decisions/cli-tui-delivery-form/decision.md) ③④；UL-governance-center；[PF-016 §7 取舍](../../../product/PF-016-cli-tui-delivery-surface/design.md#七取舍) |
| M-26 | 所有模型请求都经 OpenRouter；单机交付，但语义不变地可拆开：凡是装配顺带给的保证，都要写明拆开之后协议须给什么 | [SYS-LLM](../../../foundation/cross-system-constraints/requirements.md#sys-llm)、[SYS-DEPLOY](../../../foundation/cross-system-constraints/requirements.md#sys-deploy) |

**可调整**：能力边界与契约的份数、插件与服务键、inject 的方向、包布局与领域名，以及默认重试件写在哪一份契约里。
**不可调整**：上表的全部性质；[D-019](../../decisions/model-provider-pi-ai-fork/README.md)（传输以 pi-ai 定向 fork 为基线）、D-022 ③④、
[D-035](../../decisions/message-and-stream-baseline/README.md)（pi-ai 只用到传输适配为止）、D-058 的形状裁决。

## 读了什么

| 材料 | 用在哪 |
|---|---|
| 领域读数 `tmp/assets-runtimes/readings/B-domain-c.md`（封存版，未入库） | 性质表的来路；M-n 按产品正文重述，不引它的编号 |
| 机制读数 `tmp/assets-runtimes/readings/C-mechanism-c.md`（未入库） | 对象分解、落点、六问、装配草图、N-／Y- 理由。**本包下一节把被引用的理由全部收进来**，不依赖任务区文件继续存在 |
| 对账 `tmp/assets-runtimes/readings/D-reconciliation-c.md`（未入库） | 表 A 的前提、表 D「D1 自证」换过的六种分解 (a)～(f)——它们就是 alternatives 里候选的直接素材 |
| `product-gaps-from-readings.md`「块 C」两节、`pending-user-rulings.md` §一 U-1/U-2 与 §二（任务区） | 主线裁定 C-1～C-15、RP 处置、已自决项 |
| 产品正文 PF-013 rev 8、PF-012 rev 10、PF-009 rev 7、PF-004 rev 10、PF-016 rev 5、PF-014 rev 5、PF-001 rev 16、PF-002 rev 16 | M 表各行，只读引用的那些节 |
| 决定 D-019、D-022、D-035、D-058；候选契约 `data.model-profile`、`data.model-response`、`data.call-accounts`、`data.loop-extension`、`data.content-blocks` v2；已接受的 `capability.organization-governance` v1、`composition.governance-center-entry` v1；候选 `capability.asset-governance` v2 | 现有能力的覆盖 |
| 任务区简报 S15、S16、S17（能力契约起草中，不在本分支基线上） | 起草中的切法；它们已经按机制读数改过一轮 |
| basis `cordis/` 下 8 条：`plugin-body-reruns-on-provider-change`、`plugin-throw-fails-fiber`、`inject-has-no-optional-form` 读了全文；其余 5 条只按 basis README 核对了存在与 probe 状态，读数沿用机制读数的转述。另读 realization 入口、handbook 的能力覆盖与演化 | 机制依据与判据 |

**双盲说明**：提案阶段按设计同时读领域读数与机制读数，本包**不享有**防偏置声明。两份读数本身由不同执行者完成，各自的封存声明写在它们自己那里。

## 现有能力如何承载

调查范围：本分支基线 `9fb10ba3` 的 `spec/`、`realization/`、`record/decisions/`。三份起草中的能力契约只读了简报。

| 要求 | 现有能力与精确契约 | 覆盖依据 | 未覆盖的部分、缺口或未确认前提 |
|---|---|---|---|
| 档案的形状、引用、参数词表、撞名规则 | [`data.model-profile` v2](../../../spec/data/model-profile/README.md)（候选） | 形状、`ModelProfileRef`、撞名判定的规则与失败值名 | **没有操作**：建档、撤回、读面失败值与授权都没有主人——它的 G-11 明写「维护档案的能力契约不存在」 |
| 一次发出的记录、账、拓展件的形状、块 | [`data.model-response`](../../../spec/data/model-response/README.md)、[`data.call-accounts`](../../../spec/data/call-accounts/README.md)、[`data.loop-extension`](../../../spec/data/loop-extension/README.md)、[`data.content-blocks`](../../../spec/data/content-blocks/README.md) v1（候选） | 数据这一半齐了 | 发出、守卫、中断、对账都没有主人 |
| 建档与配凭据的授权 | [`capability.organization-governance` v1](../../../spec/capabilities/organization-governance/README.md)（已接受，D-023）的[成员资格判定](../../../spec/capabilities/organization-governance/v1/contract.md#s-26-成员资格判定) | 角色与成员资格是它的事实 | 它[不拥有](../../../spec/capabilities/organization-governance/v1/contract.md#s-2-本契约不拥有什么)资产持有、属性配值与求值，也没有档案与凭据的写面 |
| 范围允许、锁死、「用哪个模型」这项设置的求值 | 块 A 的 [`capability.asset-governance` v2](../../../spec/capabilities/asset-governance/README.md) 及其求值契约（候选） | 设置、项锁、作用域求值 | 档案不是资产（[PF-002 decisions「模型档案在五类里的位置」](../../../product/PF-002-assets-settings-and-permissions/decisions.md)）。块 A 只提供「范围允许」与选中初值这两个输入 |
| 据点读中心上的事实 | [`composition.governance-center-entry` v1](../../../spec/compositions/governance-center-entry/README.md)（已接受，D-028）＋ `https-json` 传输绑定 v1（D-029） | 请求—答复形式的查询面 | [路由表是封闭的](../../../spec/compositions/governance-center-entry/v1/contract.md#s-17-路由表封闭每条路由的九件事从哪读)，里面没有档案与凭据的路由——**任何中心侧的目录都要它出 v2**；秘密值怎样跨进程送达也没有条款 |
| 拓展件派发，以及系统自带件不可用时怎么处置 | `capability.loop-extension-runner` v2（起草中，S15） | 按装配清单顺序逐件求值、结论落日志、fail-closed 表（C-7） | 转换件按键登记、键的优先次序、输出约束都不在它的通用协议里 |
| 流装配与首 token 判据 | `capability.stream-assembly` v2（起草中，S4c） | 到达语法、第一份内容 | 「已开口」这条耐久记录在什么时刻写，归运行时兑现 |
| 传输 | D-019 选定的 pi-ai 定向 fork；D-035 定它只做传输适配 | 单家路由、流与工具调用解析 | 状态码、实际执行方、实际费用要靠 fork 补丁；**它不承担任何守卫** |

## 剩余责任与能力演化

| 剩余问题 | 关系 | 为什么归这个拥有者，对消费者有什么影响 |
|---|---|---|
| 档案的建、撤、读、列，凭据的配与取，官方清单的装入 | **新增**（候选里也有「扩展一份已接受契约」：并进组织治理，见 P1-B） | 事实在中心，授权要读组织治理，变化原因是 PF-013 的档案规则。消费者：管理面、据点上的读提供者、「用哪个模型」取值的校验 |
| 选择与一次模型调用 | **新增** | 事实（切换事实、发出记录）在会话日志里，宿主是 agent runtime。消费者：agent loop、交付面的切换命令、拓展件 |
| 转换件的登记与模态转换挂件 | **新增**（候选里也有「扩展 runner」，见 P3-B） | 键与输出约束归 PF-013，位置归 PF-012。消费者：runner、各转换件插件 |
| 据点读中心上的档案与凭据 | **读面投影**（P-1r）＋ **扩展**已接受的入口组合（v2 路由） | 副本与新鲜度归据点装配，与块 A 对「据点上的中心事实副本」的同题裁定一致 |
| 默认重试件 | **组合**：`data.loop-extension` 系统自带件表里的一行，加运行时契约里的一节 | 它是一件贡献，不是一份能力 |
| 模态投影判定函数 | 纯计算：契约归 S17，缓存归 P-2 | —— |

**为什么是三份新增维度，而不是扩展已有的**（[能力覆盖与演化](../../../../agents/skills/harness-design-handbook/canonical/references/decompose.md#新维度怎样获得依据)判据）：

- **档案目录**。已检查过的承载者：组织治理——它不拥有范围化对象，提交域按组织划，且已接受、已实现；
  资产治理——档案不是资产；运行时——不在同一处（M-25）。独立承诺：档案行与凭据的写与读、撞名判定与写入同一提交、撤回不删行。
  它怎样与别人组合：授权读组织治理的成员资格面；据点经入口组合 v2 来读；运行时 inject 据点上的读提供者。
- **模型请求运行时**。已检查过的承载者：runner——只管位置与逐件求值，不发请求；流装配——只管装配，不发出；
  传输——是一个库，不带守卫。独立承诺：三类事实守卫、首 token 规则、单独中断、停机对账、合法目标。
  它怎样与别人组合：重试由 loop 读结论驱动；日志追加口由调用方交进来。
- **模态转换**。已检查过的承载者：runner——通用，不带键的语义；运行时——转换跑在一个可以没有宿主的位置上（M-22）。
  独立承诺：同键一件、键优先、声明了的键不可用即否决、输出约束。它怎样与别人组合：挂到 runner 的挂载接口上；转换件向它登记。

三份契约在任务区分别叫 S16a（`capability.model-profile-directory`）、S16b（`capability.model-request-runtime`）和 S17（`capability.modality-projection`，已收窄）。
**主线已按机制读数把 S16/S17 的简报改成了这个切法**，本包补的是比较，并给这些理由一个长期的家。**这个切法仍未被接受**。

## 装配草图与切分理由

> **这一节可以单独引用。**提供者设计与投影引用它时，不必先读本包其余部分。
> P-n 是本包的装配单元编号，N-n（为什么不拆）、Y-n（为什么拆）、H-n（假设）只在本包内有效；
> N-1～N-9、Y-1、Y-2 的内容与编号沿用机制读数；N-1 的理由⑥、N-10、Y-3 是本包新增的。这一节是它们全部的正式出处。
> **这里给的是候选形状，不是提供者设计**：推荐被接受之前，引用这一节的下游须标「候选」。机制依据按采用版本 Cordis 4.0.4（D-025）逐条引 basis 条目。

### 草图

```text
┌──────────── 治理中心（独立应用；装配节点见「领域名与包布局」）──────────────┐
│ P-1 档案目录        服务 modelCatalog：建、撤、读（含已撤回行）、列、           │
│                     配凭据、取凭据（「有没有」与「取值」两种问法）              │
│   存储：档案行（所在范围, 路由名, 属性…, 在册|已撤回）；范围凭据（秘密）        │
│   装载时：装入官方档案清单（发布物；只增不删，清单里消失的标已撤回）            │
│   inject：存储；组织治理的成员资格判定面（已接受 v1）                           │
└─────────────────────────────────┬──────────────────────────────────────────────┘
                                  │ 读档案 · 问凭据 · 取凭据值
                                  │ （跨进程，走治理中心入口 v2；协议给，见下）
┌─────────────────────────────────▼──────────── 会话据点（用户本机）───────────┐
│ P-1r 目录读提供者   服务 modelCatalogRead、credentialLookup                     │
│                     （中心不可达时读副本；同进程开发装配由 P-1 直接提供）        │
│ P-2 模型请求运行时  服务 modelRuntime                                           │
│   inject：modelCatalogRead · credentialLookup · 作用域求值（块 A）              │
│   内部：传输适配（pi-ai 定向 fork）· 成因分类与脱敏 · 模态投影函数＋缓存         │
│   effect：在途表（撤除时幂等结算全部在途调用）· 传输连接池                      │
│   写：切换事实、「已出门／已开口」、失败发出的响应体 → 调用方交来的带栅栏追加口  │
│ agent runtime（块 B／D）  inject：modelRuntime · 拓展件执行器 · …               │
│   每次调用一个 effect（撤除 = 中止 → 结算 → 释放）；退避计时也是 effect         │
│   驱动：调模型之前 → openCall → dispatch → 调模型之后 → dispatchAgain 或上交     │
│ 拓展件执行器（块 B）◄── P-5 默认重试件    @ 调模型之后·失败（挂载 effect）       │
│                     ◄── P-3 模态转换挂件  @ 消息落盘之前（挂载 effect）          │
│ P-3 模态转换        服务 converterRegistry；声明的键来自装配配置                 │
│                     ◄── P-4* 转换件，每键一条子插件（登记 effect）               │
│ 会话日志（块 D）· 到达语法与流装配器（core，D-035）                              │
└──────────────────────────────────────────────────────────────────────────────────┘
```

草图里没有画 P-4\* → P-2。原因是 D 对账「需主线看」第 2 项建议**本版转换件不发起模型调用**，这一项还在等主线裁；裁成允许之前，这条边不存在。

### 一次调用的时序

```text
agent runtime        执行器          P-2                                   会话日志
 │ 调模型之前 ───────►│ 结论（可含 select_model）───────────────────────────► 落
 │ openCall(请求, 宿主, 追加口) ─────► 出门前检查：有效模型｜合法目标｜凭据有无
 │                                   └ 不过 → undispatched{成因}，交回（loop 写上交）
 │ 宿主上登记一个 effect（撤除 = 中止并结算）
 │ dispatch(callId) ─────────────────► 写「已出门」──────────────────────────► 落
 │                                   传输适配：单家发出
 │                                   第一份内容到：写「已开口」────────────────► 落
 │                                   再把事件交给流装配与观察者（块 D）
 │ ◄──────────── 完整｜失败（成因＋原样状态码）｜被中断
 │ 失败 → 调模型之后·失败 ──────────►│ retry{plan} 或不给 ──────────────────► 落
 │ retry → 退避计时 → dispatchAgain(callId, plan) ─► 守卫：已终结／已开口／事实类 → 拒
 │ 完整 → 消息落盘之前（转换件、脱敏…）→ 回复消息与它的响应体同一提交 ────────► 落
```

### 装配单元

| P | 单元 | 进程 | 对外服务 | 落点 | 说明 |
|---|---|---|---|---|---|
| P-1 | 档案目录 | 中心 | `modelCatalog` | #8 | 档案行、官方清单装入、范围凭据 |
| P-1r | 目录读提供者 | 据点 | `modelCatalogRead`、`credentialLookup` | P-1 服务面的另一个提供者，**不是新维度**（N-10） | 副本与新鲜度归据点装配 |
| P-2 | 模型请求运行时 | 据点 | `modelRuntime`：合法目标、展示列表、切换、打开调用、发出、中断、读发出记录、恢复对账 | #8 | 传输适配、模态投影缓存都在它里面 |
| P-3 | 模态转换 | 据点 | `converterRegistry`，外加执行器上的一件系统自带挂件 | #8 | 键表来自装配配置 |
| P-4\* | 转换件 | 据点 | 无（向 P-3 登记） | #7（在 P-3 之下） | 每个键一条（Y-3） |
| P-5 | 默认重试件 | 据点 | 无（挂到执行器上） | 执行器契约下的一件贡献 | 一个零依赖的小插件（N-7） |

### inject 边，以及消费者能不能承受被卸载重跑

依据：`inject` 的含义是「提供者换代或不可用，我就卸载重跑」（[`plugin-body-reruns-on-provider-change`](../../../basis/cordis/plugin-body-reruns-on-provider-change.md)）；`inject` 没有可选形式（[`inject-has-no-optional-form`](../../../basis/cordis/inject-has-no-optional-form.md)）。

| 消费者 → 提供者 | 必需吗 | 能承受重跑吗 | 重跑的代价与处置 |
|---|---|---|---|
| agent runtime → P-2 | 是 | **能**：agent runtime 本来就按「日志还在、协程不在，就重新算一遍」设计（[PF-012 §5.7](../../../product/PF-012-agent-loop-and-run/design.md#先对账再进方程)） | 在途调用被切断：没开口的，在新尝试里再发；开过口的，记「说到一半断了」。**这不是优雅取消**：若要排空，就得改成 `ctx.get` 取 P-2，多出一条「打开调用时 P-2 不在」的路——这一项留给提供者设计裁 |
| P-2 → P-1r | 是 | 能（P-2 自己没有跨重载的状态） | 会连带 agent runtime 重跑。所以远程客户端**只维持一个提供者实例**，断线重连在实例内部处理——同一实例内部的状态变化不触发重载 |
| P-2 → `credentialLookup` | 是 | 能 | 值轮换不触发重跑，只有实现换代才触发（N-9） |
| P-2 → 作用域求值（块 A） | 是 | 能 | 会连带 agent runtime |
| P-3 → 执行器挂载接口 | 是 | 能（P-3 无状态） | 重新挂上 |
| P-5 → 执行器挂载接口 | 是 | 能（纯函数） | 重新挂上 |
| P-4\* → P-3 | 是 | 能 | 重新登记；正在进行的转换按「转换件挂了」处置，也就是否决 |
| P-1 → 组织治理读面、存储 | 是 | 能 | 目录没有闭包里的状态；官方清单装入是幂等的持久写 |

**有意不设的边**：P-2 不 inject 执行器；P-5 不 inject P-2；P-2 不 inject 会话日志服务（追加口随调用显式交进来，同时带着尝试栅栏）；
P-2 不 inject 传输（它是内部依赖）；没有任何单元 inject 模态投影（它是 P-2 里的数据）；P-3 与 P-2 之间没有边（Y-2）。

### 装载效应与撤除责任

| 效应 | 谁建立 | 归谁拥有 | 撤除时做什么 | 留下的事实 |
|---|---|---|---|---|
| 一次调用的 effect | agent runtime 打开调用时 | 宿主 fiber | 中止 → 按首 token 规则结算（`interrupted`，或按下表对账）→ 释放流，**在同一个撤除函数里按这个次序做完** | 响应体、锚点记录 |
| 在途表 | P-2 插件体 | P-2 fiber | 对表里每一次调用做同样的结算（幂等，先到者赢），然后关连接池 | 同上 |
| 退避计时 | loop 读到 `retry` 之后 | 宿主 fiber | 清掉计时 | 日志里的 `retry` 结论；恢复时据它重新布计时 |
| 默认重试件的挂载 | P-5 插件体 | P-5 fiber | 摘下 | 那个位置「此刻不在」，日志里看得见 |
| 模态转换挂件的挂载与登记表 | P-3 插件体 | P-3 fiber | 摘下、清表 | 同上；此时由 runner 的 fail-closed 行接管（C-7） |
| 转换件登记 | P-4\* 插件体 | P-4\* fiber | 注销，并中止进行中的转换 | —— |
| 官方档案清单装入 | P-1 插件体 | **不是 effect**，是持久写 | 什么都不做，行留着 | 档案行 |

内核只给三条事实：effect 之间并发释放，逆序只约束取出的次序；撤除函数里的异常只进日志、不上抛；fiber 进入 UNLOADING 之后再建 effect 会抛错
（[`effect-disposal-concurrent-not-ordered`](../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)）。
**进程崩溃时撤除函数一个都不跑**，所以撤除时写下的任何记录都只是加速；真正收口的是下一次尝试做的对账：

| 这次调用的最后一次发出，日志里有 | 对账时怎么收 |
|---|---|
| 「已出门」，无「已开口」，无响应体 | 补一份结算，费用记未知；在**同一次调用**下再发 |
| 「已开口」，无响应体 | 补一份结算：失败，成因「说到一半断了」，费用记未知；**不重发**；中断提醒充当上交 |
| 有响应体 | 什么都不补 |

### 事件：只用来通知，不用来控制

- P-1、P-2、P-3、P-5 都不定义控制类事件。中断走直接调用；否决与重试走落进日志的结论
  （`emit` 丢掉返回值，`bail` 不等待异步判定：[`async-control-not-bail`](../../../basis/cordis/async-control-not-bail.md)）。
- 消费的通知：会话日志的追加通知（块 D；模态投影可以借它提前推进，这是可选的）；插队落账后的通知（块 D → agent runtime → `interrupt`）。
- 可发的通知：P-1 的「档案已撤回／已变」，供据点刷新（可选；跨进程时由入口协议承担）。
- 凡用 `emit` 发通知，发送方都要把它包住：监听者一抛出，异常就穿回发送方、截断本轮派发（[`emit-listener-throw-propagates`](../../../basis/cordis/emit-listener-throw-propagates.md)）。

### 存储、写入者与提交点

| 存储对象 | 唯一写入者 | 提交点 | 说明 |
|---|---|---|---|
| 档案行、范围凭据 | P-1 | 行写入 | 路由名唯一是同一存储里的唯一约束，单写入者。**判定域若按隶属树读，树归组织治理**——见 alternatives 里 P1-A 的反查信号 |
| 会话日志（块 D 拥有） | P-2 写切换事实、锚点记录、失败发出的响应体；loop 写回复消息及其响应体（**同一提交**）和上交条目；执行器写挂件结论 | 各自的追加 | 写入口带尝试栅栏，按响应体标识幂等；晚到的账标 `late` 照记，栅栏不拒收（主线裁定 S2-d） |
| 模态投影缓存 | P-2 | 缓存行写入 | 缓存不是权威，读的时候先从水位追到日志尾 |
| 附件存储（上游原始响应，D-058 Q14） | P-2 | —— | 存储的形态归 core/storage 的附件那一侧 |

**切换不需要跨 owner 的同一提交**。判定合法之后、追加切换事实之前，目标可能恰好变得不合法（被撤回了，或会话里刚进来一张没人转的图）。
这种情形 [PF-013 §6.9](../../../product/PF-013-model-profiles-and-invocation/design.md#69-合法目标算不出来时不替用户改选) 已经给了处置：下一次请求发不出去、上交，不替用户改选。

### 装配给 vs 协议给

| 保证 | 单机同进程装配时由谁给 | 跨进程之后谁须重新兑现 | 做不到会怎样 |
|---|---|---|---|
| 撤回之后不再有新的准入 | P-2 打开调用时现读 P-1 的同一份存储 | 中心 → 据点目录读的新鲜度上界（未定） | 撤回之后的一段时间里，仍会被选中、被发出 |
| 凭据值不外泄，只在发出时出现 | 进程内交给传输适配 | 秘密怎样送到据点、在据点上怎样落地、轮换怎样传播（账本 U-1） | 值留在用户本机；人离职了收不回 |
| 路由名唯一 | 中心单一存储上的唯一约束 | **不变**：只在中心写 | —— |
| 一份账只落一次、结算幂等 | 同一份会话日志、确定性的响应体标识 | 追加口按标识幂等 | 账重复 |
| 「已开口」先于内容被看见 | 同进程里先写锚点再转发 | 观察者在另一个进程时，转发链不得越过锚点先送出内容 | 停机后重发，用户看见两份回复 |
| 一次调用里各次发出用同一份档案快照 | P-2 打开调用时绑定快照 | 同 | 按旧能力准备、按新属性发出 |
| 模态投影等于从日志重算的结果 | 缓存与日志同处，读时追补 | 缓存必须与它追的那份日志同处，或读得到日志尾 | 投影与日志对不上 |

### 为什么不拆（每条都可以单独引用）

| # | 结论 | 理由 | 代价 | 什么情况下改判 |
|---|---|---|---|---|
| **N-1** | **一次模型调用不做 fiber，而是宿主上的一个 effect**；P-2 自己的 fiber 上另登记一条在途表项 | ① 落点 #3 在 #7 之前问，而且答「是」：它的死与宿主绑定（PF-013 §5.13「宿主永远是 agent runtime」「没有不停那一格」），撤除责任也明确。② `Fiber.uid` 只是本次 registry 里的实例身份（H-7），而调用的身份要跨尝试稳定，只能落在日志里。③ 调用失败是一个值（响应体 `failed`＋成因），不是插件失败；做成 fiber，上游 503 就得表达成插件体抛出、`FAILED`、什么都不提供（`plugin-throw-fails-fiber`）。④ 资源只有一条流、一个中止句柄、一个计时，一个撤除函数收得住。⑤ 并行判定时，一个 agent runtime 里同时有好几次调用，一次一个 effect，自然并存。⑥ **一条会换代的 inject 边会让调用 fiber 的插件体被重跑，重跑就是再发一次**（`plugin-body-reruns-on-provider-change`「给长时操作加 inject」） | 结算要自己在一个撤除函数里按次序做完：中止 → 写结算记录 → 释放；结算失败要自己落一条诊断，不能只打 warn（warn 缺省不导出：[`logger-level-order-error-lowest`](../../../basis/cordis/logger-level-order-error-lowest.md)）；宿主停止之后不许再开新调用（`openCall` 明确失败 `runtimeStopped`）；结算幂等、先到者赢（宿主撤除与 P-2 撤除可能同时结算同一次调用，见 H-2） | 一次调用需要自己的依赖集或按调用注入的配置；或 H-1 不成立，且在宿主下开子作用域的代价比一条 fiber 还高 |
| **N-2** | **传输适配不做插件，也不做服务**：它是一个 fork 库包加一个适配模块，作为 P-2 的内部依赖；装配时按配置选实现（pi-ai fork 或脚本化传输） | #8 要求「独立变化原因**且**独立消费者」，它只有前一半：消费者只有 P-2——SYS-LLM、成本、首 token、三类事实都在 P-2，挂件、转换件、旁路提问的调用也都经 P-2。做成服务，换一次传输就连带重跑 P-2 和全部 agent runtime；改用 `ctx.get`，P-2 的发出条款就得对一个随时可能缺席的东西成立。可测性不需要服务：一个构造参数级的接口 `dispatch(请求, 中止信号) → 到达事件序列＋状态码＋用量与费用来源` 就能注入脚本化实现（D-035「两条链各自能从脚本化输入跑到真实 JSONL 日志」） | 换传输要重新装配 P-2 | 出现第二个消费者（另一条不经 P-2 的发出通道）；或必须在不重启 P-2 的前提下热换传输 |
| **N-3** | **模态投影不做服务，也不挂在拓展点上**：它是 P-2 里的一个视图、一个纯函数，外加每个会话一行带水位的持久缓存 | 没有要被别人 inject 的行为，唯一的消费者是合法目标（PF-013 §4 模态投影「它只为一件事服务」）。缓存是 `{无 transcript 的模态集合, 已覆盖到的日志位置}`，读的时候从水位追到日志尾，所以代价与已经过去的历史长短无关；集合只做并集，追补幂等、停机也安全。正确性不依赖事件订阅，追补兜得住漏掉的通知。不挂在「消息落盘之后」：那是产品可见、租户可替换的位置，而拓展件不可用会被视作卸载（PF-012 §5.8），投影就会静默落后 | 多一份持久的小状态；它是缓存不是权威，丢了可以按日志长度重建一次。须有一条性质测试钉住 `fold(全日志) == 追补后的缓存` | 投影出现第二个消费者；或缓存没法与它追的那份日志同处 |
| **N-4** | **合法目标、选中／有效模型、切换不另立能力，与发出一起放在 P-2** | 它们与发出在同一个进程里，读同一批输入（目录、作用域求值、模态投影、会话日志）；出门前检查每次都要重算合法目标，放在热路径上跨插件读没有收益；变化原因重合——PF-013 §5.9–§5.11 与 §6.5–§6.10 都是「这次能不能发」的规则；消费者（交付面的切换命令、出门前检查、`select_model` 校验）本来就都经过 P-2；治理中心不知道任何会话（M-25），所以中心一侧没有别的消费者 | P-2 更大 | 出现一个只要「选择」、不要「调用」的消费者，且它经 P-2 的服务面拿不到（见 alternatives P-2 的改票条件） |
| **N-5** | **不为范围、租户或凭据开 isolate** | 各范围之间差在凭据的值与档案行，是数据，不是实现；isolate 隔的是服务实例的可见性，不隔数据，而且会让实例数随租户增长、租户增删跟着服务装卸（[`isolate-hides-instances-not-data`](../../../basis/cordis/isolate-hides-instances-not-data.md)）。凭据每次按会话持有的租户身份现取 | —— | 各范围需要不同的**实现**（不只是不同的数据），例如某个租户必须走自己的一种传输实现 |
| **N-6** | **不为转换键开 isolate，用登记表（键 → 实现）** | 同键一件、不同键不同实现，但分派者要在一次落盘里看遍全部的键（M-21 的键优先）；isolate 会让别的标签彼此不可见。同键重复登记，在装配时明确失败 | —— | 看不到改判条件：isolate 隔的是可见性，不是分派所需的全表视图 |
| **N-7** | **重试挂件与运行时互不 inject；重试由 agent loop 驱动** | 位置属于 loop 的状态点，执行器由 loop 调用。若 P-2 在自己的发出里循环调用执行器，同一个执行器就有了两个驱动者，而且依赖会成环：P-2 → 执行器 → 挂件 → P-2（挂件会自己调模型；H-3）。反过来，挂件若 inject P-2，就拿到了「自己循环调下一层」的通道，这正是 PF-012 §5.8 环绕式里装不进的那一半——中间那几次发出不经日志。挂件的输入全是数据：成因、状态码、**调用绑定时的档案快照**、本次调用已有的发出记录。**三类事实由 P-2 的发出守卫兑现，不写进任何挂件的策略**：写进默认件，租户一替换就被推翻（M-11） | 默认件要零外部依赖——它「此刻不在」时，那一次失败没人说再试，按 C-7 直接上交 | 产品允许重试在一次调用内部、不经日志地多次发出（须先改 PF-012 §5.8） |
| **N-8** | **不用事件做控制** | 中断需要一个确定的答复（这次调用此刻在哪个阶段；已经结束则答 `alreadyEnded`）；重试与否决靠落进日志的结论。`emit` 丢掉返回值，`bail` 不等待（`async-control-not-bail`）。事件只用来通知，发送方要包住（`emit-listener-throw-propagates`） | —— | —— |
| **N-9** | **凭据与部署凭据都不进插件配置** | 配置一改值就要重启插件（H-4），并连带下游。把值当数据现取，轮换时零重载；把缺席的部署凭据写成「缺了就抛」，就把可选做成了必需（`plugin-throw-fails-fiber`「已知的误用」）——而产品正文说「范围没配凭据不阻止任何事的发生」，缺了只让那一次调用落「凭据不可用」 | —— | 部署凭据的运维语义改成「改值就必须重启」 |
| **N-10** | **据点上的目录读提供者（P-1r）不是一份新能力**：它是 P-1 服务面的另一个提供者，副本与新鲜度归据点装配 | 它不拥有新的事实，只是把中心的事实搬到据点来读；PF-016 §6.17 要求中心不可达时用副本，这是装配给的一项。块 A 对「据点上的中心事实副本」同一问题的裁定是「归据点装配，读面 = 入口契约查询面 + 本地缓存，不另立契约」，这里同题同答 | 新鲜度只能写进「装配给 vs 协议给」表 | 据点副本需要自己的语义，例如离线时的新鲜度承诺、冲突合并——那时要立一份读面契约或组合 |

### 为什么拆

| # | 结论 | 理由 | 什么情况下改判 |
|---|---|---|---|
| **Y-1** | **档案目录（P-1）与运行时（P-2）分开** | 两者不在同一个进程（中心 vs 据点，M-6、M-25）；写面带管理授权，读面在调用的热路径上；变化原因不同（管理员建撤、官方清单随发布 vs 发出失败模型、传输演进）；消费者不同（管理面 vs agent loop）。合成一个，要么把管理写面搬到用户本机，要么把调用搬到中心——两者都违背 D-022 | 见 alternatives P1-C 的改票条件 |
| **Y-2** | **模态转换（P-3）与运行时（P-2）分开** | 转换跑在「消息落盘之前」，输入消息落盘时可以没有 agent runtime（M-22），而 P-2 的一切都假定有一个宿主在场。变化原因（新媒体类型、转换件契约）与发出无关；消费者（执行器、转换件插件）与 P-2 的消费者不相交。二者唯一的接点是日志里块上的 transcript——P-3 写，P-2 的投影读——**不需要任何 inject 边** | 见 alternatives P3-C 的改票条件 |
| **Y-3** | **转换件每个键一条子插件（#7，在 P-3 之下）** | 独立资源（可能调本地识别库）；失败要隔离——一个键上的转换件挂了，不能连带别的键（PF-013 §4 转换件「各管各的键」）；有宿主可挂（P-3）。这是一处**被标价的动态性代价**：k 条 fiber，同键一件，同键重复登记在装配时失败，不随租户变化 | 所有转换件都是没有外部资源的纯函数，而且能接受「一个键出错，连带同一插件里的其他键」——这时登记退化成 P-3 里的一张函数表 |

### 传输适配必须兑现的义务

N-2 能成立，前提是适配层自己兑现下面这些义务。它们进 S16b 的「装配给」表。

| 义务 | 来路 |
|---|---|
| 每次发出只走一家：`provider.order` 只写一家、`allow_fallbacks: false`（OpenRouter 缺省允许回退）；不给 `maxRetries`（缺省为 0） | M-14；【研】pi-ai 自身不对 OpenRouter 做隐藏重试或回退 |
| 状态码从注入的 `fetch` 取 | 【研】pi-ai 的结果不带结构化的 HTTP 状态码 |
| 禁止中途解析工具参数，唯一的解析点在装配器 | D-035 保留前提 |
| 首 token 按到达语法判：「第一个填充，或第一个整交块的封口」；pi 的 `start` 不算 | M-12；stream-assembly（起草中） |
| 不让库回落到环境变量里的 key | 【研】缺 key 时 pi-ai 回落 `OPENROUTER_API_KEY` |
| 不向上游送本系统的会话标识 | 【研】0.86.1 给了 `sessionId` 就发 `x-session-id` 头；M-5 |
| 非视觉模型的图不得被库静默换成占位文本：按本系统档案的模态声明喂给库，或者绕过那一步 | 【研】；PF-013 §6.10 |
| 实际执行方、实际费用及其来源靠 fork 补丁；`anthropic-messages` 那条路径的补丁不覆盖 | [D-019 选择与范围](../../decisions/model-provider-pi-ai-fork/decision.md#选择与范围) |
| 固定 base URL，拒绝重定向 | SYS-LLM；D-019 比较门 |

【研】＝ 取自研究 [model-request-transport-sources](../../../../research/model-request-transport-sources/research.md)（离线读的是 `0.85.1` 发布物与 `0.86.1` 源码）。**这些不是 basis 条目，只能作假设**；它们升格为 basis 之前，这几条义务的可信度就停在研究那一层。

### 机制依据

**引用的 basis 条目**：8 条都有 probe，对 4.0.4 通过——
[`plugin-body-reruns-on-provider-change`](../../../basis/cordis/plugin-body-reruns-on-provider-change.md)、
[`inject-has-no-optional-form`](../../../basis/cordis/inject-has-no-optional-form.md)、
[`effect-disposal-concurrent-not-ordered`](../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)、
[`isolate-hides-instances-not-data`](../../../basis/cordis/isolate-hides-instances-not-data.md)、
[`async-control-not-bail`](../../../basis/cordis/async-control-not-bail.md)、
[`emit-listener-throw-propagates`](../../../basis/cordis/emit-listener-throw-propagates.md)、
[`plugin-throw-fails-fiber`](../../../basis/cordis/plugin-throw-fails-fiber.md)、
[`logger-level-order-error-lowest`](../../../basis/cordis/logger-level-order-error-lowest.md)。
**待核对主张（probe 为 null）**：无。

**假设**（basis 里没有；不成立时怎样）：

| H | 主张 | 用在哪 | 若不成立 |
|---|---|---|---|
| H-1 | `ctx.effect()` 返回一个可以提前调用的撤除函数：调用正常结束时，能先于宿主撤除而释放自己 | N-1 | 调用结束时自行登记与注销，或在宿主下开一个子作用域；结论（effect，不是 fiber）不变 |
| H-2 | inject 触发重载时，内核会不会等旧 fiber 的异步撤除函数完成，再重跑插件体 | N-1 双处结算的竞态 | 不依赖它：已用「结算幂等、先到者赢」兜住 |
| H-3 | 两个插件互相 inject、成环时怎样收场 | N-7 | 只用来说明为什么不要这条边，不依赖具体结果 |
| H-4 | `fiber.update(config)` 会重启该 fiber | N-9 | handbook 的最小内核模型据 4.0.2 源码写明，未入 basis；若不重启，N-9 的理由减弱，但结论不变 |
| H-5 | 服务方法里能否拿到调用方的上下文 | 刻意不依赖：宿主以显式参数交给 P-2 | —— |
| H-6 | `provide` 由内核纳管，随 fiber 撤除 | 装载效应表 | `packages/core/kernel-basis` 里有同名 probe（`provide-is-effect-managed`），但还没升格为条目 |
| H-7 | `Fiber.uid` 只是本次 registry 里的实例身份，不能当持久身份 | N-1 理由② | handbook 最小内核模型据 4.0.2 源码写明，未入 basis；即便它能持久，调用身份仍要落日志，N-1 的其余理由不变 |

**不属于拆分、留给契约与提供者设计的一项**：两类锚点（「已出门」「已开口」）还是只留「已开口」。
只留「已开口」也守得住「回复只有一份」，但会丢掉「发出去却没回来」那一笔可能已经计费的账。
两类锚点的代价是每次发出多一到两次追加，而且「已开口」落在首 token 的热路径上，要多一次耐久写——这笔代价还没有测量。它不改变本包的任何候选比较。

## 取舍入口

见 [alternatives.md](alternatives.md)。那里有三个 #8 对象各 3～4 个候选的承载方式、失去的保护点、反查信号与可计数代价，
每块一张性质矩阵、一条推荐和改票条件，最后是三块合起来的计数，以及仍待区分的事项。**推荐不是接受。**

## 领域名与包布局（待产品负责人拍板）

realization 的[两层布局](../../../realization/README.md#packages-的两层布局)只定了形状：`capability.*` 按契约拥有的事实归领域，`data.*` 几乎总在 `core`。
**领域名要有人拍板**；在拍板之前，下表每一行都是候选。

| 单元 | 包（候选） | 装配进 |
|---|---|---|
| P-1 档案目录 | `packages/model/model-profile-directory` | **治理中心的装配节点**。派发写作 `apps/governance-center`，而现有的治理中心装配节点是 [`apps/tenancy-host`](../../../realization/apps/tenancy-host/README.md)（名字由 [D-027](../../decisions/infrastructure-names-and-sqlite-durability/README.md) 拍板）。装进现有节点，还是另立或改名，**待产品负责人拍板** |
| P-1r 目录读提供者 | 与块 A 同题：据点装配里的一个提供者；若要成包，放 `packages/model/<node>` | `apps/runtime-host`（候选名，块 B／C／D 共用） |
| P-2 模型请求运行时 | `packages/model/model-request-runtime` | `apps/runtime-host` |
| pi-ai 定向 fork | `packages/model/<fork 名>`——只被 `model` 领域消费，按 realization 入口「core 不是公共工具箱」不进 `core`；fork 的维护边界归 SYS-KERNEL | 随 P-2 |
| P-3 模态转换 | `packages/model/<node>`，节点名跟随 S17 的契约名（见交接缺口） | `apps/runtime-host` |
| P-4\* 转换件 | `packages/model/<converter>`；一个转换件一个包还是合包，归提供者设计 | `apps/runtime-host` |
| P-5 默认重试件 | `packages/model/<node>`，或与 P-2 同包、作为第二个插件导出；包的粒度归提供者设计 | `apps/runtime-host` |
| `data.model-profile`、`data.model-response` | `packages/core/<node>`：它们是 `data.*`，被两个以上领域消费（资产那一侧的设置取值、拓展件、账） | —— |

**领域名的候选是 `model`**（块 C 的步骤 A 提出）。若 P-1 选了 P1-B（并进组织治理），中心侧目录就落进 `tenancy`，`model` 下只剩据点一侧的节点。

## 证据义务与受阻消费

| 依赖的性质与前提 | 谁保护、谁只是假设 | 所需证据与当前结果 | 闭合条件、负责产物，以及受影响的选择 |
|---|---|---|---|
| M-1 的判定域：全局，还是隶属树；如果是隶属树，是只在建档那一刻成立，还是隶属关系变化之后也要成立 | 主线／产品负责人 | 无；MP S-3 现写全局，改判在账本里 | 一句裁定（对齐波）。若裁成「隶属树，且须跨隶属变化成立」，P1-A 会出现跨 owner 的同一提交，**P1-B 重新被考虑**（alternatives X-1） |
| 撤权与建档写入不同提交也可以（PF-001 §6.6「撤销不等于强制停止」的读法） | S16a 起草者，对照资产治理候选契约对同一个面的消费方式 | 未核 | S16a 写明；若裁成必须同提交，P1-B 重新被考虑 |
| 入口组合 v2 的档案与凭据路由；秘密值跨进程送达 | 入口组合（已接受 v1）的 owner | 未起草 | 挡的是 P-1 的跨进程消费，**不挡本选择**；块 A 同有此需，建议一波出 v2 |
| H-1：effect 能提前撤除 | `core/kernel-basis` | 无 probe | 提供者设计前补一条 probe；只影响 N-1 的写法 |
| 「已开口」耐久写的延迟代价 | 提供者设计 | 未测量 | 影响锚点数目的取舍，不影响本选择 |
| 研究里的 pi-ai 事实 | 研究 `model-request-transport-sources` | 离线读的源码，没有 probe | 按研究家族的升格通路建 `basis/pi-ai/*` 条目；影响 N-2 那张义务表的可信度 |

## 交接缺口

| 缺口 | 影响谁 | 负责产物／拥有者 | 闭合条件 |
|---|---|---|---|
| 中心侧装配节点叫什么（派发写 `apps/governance-center`，现有节点是 `apps/tenancy-host`） | P-1 的装配与投影 | 产品负责人（G3） | 一句拍板 |
| 领域名 `model` | 全部块 C 节点的包路径 | 产品负责人（G3） | 一句拍板 |
| S17 的契约名 `capability.modality-projection` 与收窄后的内容（投影判定函数＋转换件登记与挂件）是否还对得上；缓存已归 P-2 | S17、P-3 节点名 | S17 起草者与主线 | 保留原名，或改名（例如 `capability.modality-conversion`），二选一写明 |
| 本版转换件能不能发起模型调用（D 对账「需主线看」第 2 项） | P-4\* → P-2 这条边；宿主问题 | 主线 | 裁成不能：草图照现在这样；裁成能：须先有「落盘前、没有 agent runtime 时」的宿主方案 |
| P-3 整件不在时，runner 的 fail-closed 范围：只否决含非文本模态块或文件块的消息，还是一律否决 | S15 fail-closed 表 | S15 起草者 | S15 写明 |
| 账本 U-1、U-2 | M-6、M-7、M-2 的具体写法 | 产品负责人 | 两种答案下切法都不变，只改 S16a 条款 |

评审处置见 [review.md](review.md)；实际决定与下游入口从 [README](README.md#后续消费) 导航。
