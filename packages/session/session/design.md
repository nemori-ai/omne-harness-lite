# Session 提供者设计

状态：`f98ac926` 映射已接受为最小运行基线施工输入。现有
[src/index.ts](src/index.ts) 为 `/baseline`，目标默认入口及真实 SR 产品尚未交付。
[来源入口](../../../docs/proposals/core-capabilities/implementation/runtime-provider-interfaces.md)
保留历史、采用范围和检查；当前实施终点为 allow 最小基线。

目标契约为 [session v1](../../../spec/capabilities/session/v1/contract.md)、
[生命周期组合 LC v1](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)、
[identity v1](../../../spec/data/agent-runtime-identity/v1/contract.md)、
[CD v1](../../../spec/data/core-work/v1/contract.md)、
[CB v1](../../../spec/compositions/agent-session-binding/v1/contract.md)、
[CC v2](../../../spec/compositions/core-work-coordination/v2/contract.md)、
[DR v1](../../../spec/capabilities/durable-records/v1/contract.md)（接受依据
[D-014](../../../docs/decisions/D-014-session-run-agent-lifecycles.md)）。下文从"Host 与服务"起
是 `f98ac926` 基线对 [SR v1](../../../spec/capabilities/session-run/v1/contract.md) 的映射，
其中 SR-xx 编号按 [D-014 引用的归属表](../../../docs/proposals/session-run-agent-lifecycles/session.md#2-条款逐句归属)
读作 SE/RN 条款；Run 形状、Step/DriverClaim、driver 端口与 `checkpoint_saved` 段落已被
[Run 提供者设计](../run/design.md)取代，保留只为说明基线源码。逻辑操作、事件/fold、
对象权限已从 `cd16f1` 迁入下文；治理事实沿 `058c77c` 的[当前治理设计](../../governance/tenant/design.md)。
原受审身份归[历史输入](../../../docs/proposals/core-capabilities/implementation/session-runtime-interfaces.md)。

## D-014 后的插件划分

本包拥有四个插件，Run 另成 [run 包](../run/design.md)；`omneSession` 与 `omneRun`
互不 required inject（作者裁决 [A-12](../../../docs/proposals/session-run-agent-lifecycles/README.md#作者裁决)），
凡同时涉及两者的操作落在下面三个宿主级插件。依赖图、广播机制与撤除顺序见
[提案 Cordis 视角](../../../docs/proposals/session-run-agent-lifecycles/cordis.md)。

| 插件 | 服务键 | required inject | 职责 |
|---|---|---|---|
| `SessionPlugin` | `omneSession` | `omneAdmission`、`omneRecords`、`omneDiagnostics`、`omneIdentity`、`omneTenant`、`agents` | session / queue / inbound 三条流的 owner；生命周期、队列、hold、状态贡献注册、附着提供者（`attach` / `guardActivation` / `release`）、Inbound 受理；prepare/check 端口供组合者使用 |
| `InboundAdjudicatorPlugin` | `omneInboundAdjudicator` | `omneSession`、`omneRun`（读 `waitingPositions` 与 `stateStamp`）、`omneAdmission` | 消费 accepted 的 arrival，一次短提交内按裁决时刻的 Run 状态判意图并写 `arrival_classified`（[SE-12～14](../../../spec/capabilities/session/v1/contract.md)）；启动时扫描全部 Session（[SE-18](../../../spec/capabilities/session/v1/contract.md)），扫描完成是调度者重取的前提 |
| `SessionSchedulerPlugin` | `omneSessionScheduler` | `omneLifecycleCompositions`、`omneSession`、`omneRun`、`agents`、`omneInboundAdjudicator`（扫描完成信号） | 订阅 `records/committed`，对铃（队列变化、Run 终态、hold 解除、接续/审批就绪、epoch 封闭、门恢复、resume）在门内重读：无占位且队首合格 → 取批/取命令/取 trigger；占位在、执行者空且有可干的事 → 重取；先找 ready 实例再 `agents.activate`。不轮询；开机扫描在裁决扫描之后 |
| `LifecycleCompositionsPlugin` | `omneLifecycleCompositions` | `omneSession`、`omneRun`、`omneAdmission`、`agents` | 向协调者登记具名组合，每个是一次 batch：`take_batch` / `take_command` / `take_trigger`（队列取用 + Run 建立 + epoch 发行，[LC-04 行 3](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)）、`run_settle`（Run 终态 + arrival 转换/关闭，行 4）、`session_archive` / `session_delete`（生命周期转移 + 队列与 arrival 关闭 + 前提读 Run，行 1）、`session_force_stop`（hold + Run 控制受理 + epoch 撤销，行 2）、`interrupt_then_run_accept`（新 input + 复合意图，行 11）、`reacquire` |

事件词汇 v2：kind 前缀 `session.`，version `"1"`；候选清单与兑现条款见
[提案 session.md §4](../../../docs/proposals/session-run-agent-lifecycles/session.md#4-事件词汇-v2候选)。
去掉 `driver_reserved` / `driver_released` / `epoch_parked`（占位派生）与 `checkpoint_saved`
（位置是投影，缓存归 [projection](../projection/design.md)）；`step_*`、`driver_claimed` 等
Run 流事件迁到 run 包。附着资格新增"Session open"与"该 Session 无更早未释放实例"，
`lifecycle_changed{archived / deleted}` 使资格失效并由 AR 宿主关闭空闲实例（形状 3）。

跨域前提下（[LC-09](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)）
裁决门、归档门与取批门带 `omneRun.stateStamp` 的版本戳；首版同域，戳作为守卫输入
保留但不构成分布证明。

## Host 与服务

候选默认入口 `@omne-harness-lite/session` 拥有 `createSessionHost`、
`SessionPlugin`、下面三个 link 插件和具名注册面，以及公共事件 decoder/纯 fold。
准确签名由目标公开源码建立，不把现有 append/create/flush 当作符合 DR 的入口。
SessionHost 拥有本域分租户的长期 Session、队列、Run/Step/continuation/control、
当前委托、attachment 与 referenceRevision；不把长期事实放在 Agent Fiber 下。

应用单次创建 host，保有受限恢复安装/关闭与 link 管理能力，同一 coordinator
重复创建返回 `authority_already_bound`。第二 Context 复用原 host，不生成另一
Run/驱动占位。运行发号沿原 writerEpoch/启动命名空间，恢复不反序列化活句柄。
业务只持 coordinator 的窄 RecordPreparation/提交面，完整 reader 只供受信恢复。

`SessionPlugin` 提供 `omneSession`；required inject 是 `omneAdmission`、
`omneDiagnostics`、`omneIdentity`、`omneTenant`、`agents`。options 接已恢复的
原 SessionHost。先由 [persistence](../persistence/design.md) 校验同一 Watermark
的纯 fold/跨记录关系、必需 state contribution/定义/配置兼容性，再 provide。
坏前缀/未知必需事件不默认空；已恢复安全前缀的受权历史读可独立开放，原效果
核实未完则新运行 unavailable。投影可读不证明恢复完成。

## 链接与当前资格

| 本包导出 / required inject | 两端具名关系与失联结果 |
|---|---|
| `SessionTenantLinkPlugin` / `omneSession`,`omneTenant` | 向 TG registerReferenceSource 交 SR 原 ReferenceInventory；SR create/attachment 的引用更新与 TG retire/disable 同门核 stamp。缺来源不能报告无引用 |
| `SessionAuthorizationLinkPlugin` / `omneSession`,`omneAuthorization` | 向 AU registerSessionFacts 交 Session/工作事实，向 SR `registerAuthorization` 交当前配置面；失联关闭相应设置/新 Run/Action，受权读控不因 AU 缺席全部消失 |
| `SessionAgentLinkPlugin` / `omneSession`,`agents` | 向 AR registerSessionProvider 交 RuntimeAccess/SessionAttachment，向 SR `registerAgentRuntime` 交工作/结算面；未登记不能激活/驱动，原收口能力独立保有 |
| `registerProjection` / 无反向 required inject | 由宿主登记 [projection](../projection/design.md) 的只读查询适配/水位/代次；缺失显示 rebuilding/unavailable，不给出额外正文权 |

注册管理面只给受信 link options，不在普通服务、用户/工具 body 上公开。两端
门外 prepare，同一 coordinator.enter 核精确 host/source/mount/registration/
generation 与适用范围后建立；LOADING 只持 held，双方及 link 当前可用才正向
消费。部分装载失败撤原精确登记，retire/inspect/waitReleased 不作用后来新代。

包依赖 TG/AU/AR 的公共消费协议；它们不反向 import Session 实现。SR 的
SessionFacts/RuntimeAccess/Attachment check 只查实际身份/TG/对象/原 attachment
事实，不递归调用 AU 判模式或 AR activate/work。SR 具名组合者分别准备/检查
这些参与者并提交一次 batch；link 不获得业务状态转移权。

每个 apply 捕获 `c.fiber` 与 host 发出的本次 mount generation；ctx.plugin
返回外壳只供控制等待/卸载。生命周期观察推进本 owner 的单调关闭 stamp，
最终 gate 同时检查原 mount/link 和所有 required provider 的代次/真实存活，
覆盖消费者尚 ACTIVE、provider 已 UNLOADING 和同 Fiber 重载两个窗口。
旧 closure 不能因 Fiber 又 ACTIVE 复活；之后仍需身份/TG/SR 对象权、当前 AU
配置、原 epoch/WorkPermit，不以 Context 或 scope 当授权。

## 从文本到原结果

SR 拥有 create/enqueue/takeBatch/acquireNextStep 和原 DriverClaim 的进展/结算。
create 在分配 Session ID 前固定 OperationInput，在当前认证/披露资格内先 lookup，
生成 ID 只进后果；
取批由真实内部派发意图代表原 owner，原队首/成员加入/定义 acquisition 当前
检查通过后，与 AR pin 一次 input_run 批提交。只有 durable ready 才交工作给
确定性 driver，pending/unknown 留原占位，不偷偷取第二批。

TL proposed 与 SR 原 continuation 同批登记；完整 return/yield 后接原裁决 claim，
allow 的联合授权/预算/执行准入由 TL 拥有，deny 回原 Step。原真实结果按当前
接收资格进入原 continuation，再由 SR 串行取得 claim/结算；后来的新决策才新
Step，不把结果当新用户输入。重启先核实原 call/attempt，unknown 不盲目重发。
完整细节及 S18 沿原逻辑稿，应用/driver 没有 append 或直接 setState 权。

独立 TL/HD owner 的原结果/请求不依赖 Agent 活体存续。当前 allow 基线不装完整
审批时 ask 明确不可执行；后续 HD 答复/结果接收仍必须按其所属契约核当前
receiving/control 资格，不因原 adjudicate claim 已交还而遗失合法后果。
普通 AU/link 重载不自动取消 HD 未消费、未关闭的耐久批准；旧私有候选失效与
原历史保留的边界由 [AU](../../governance/authorization/design.md) 维护。

## 装载效应与撤除责任

| 效应 | 撤除/清理与保留 |
|---|---|
| `omneSession` 操作面、普通订阅 | 原 Fiber 撤精确服务/监听；当前披露先重检权限。Session 根/Run/原结果保留在 host，失联不变不存在 |
| 三类 link、projection 与 authoritative contribution 注册 | 原 owner 撤本次 generation；未知/缺失必需贡献关依赖工作。projection 仅关视图，authoritative 撤回先封闭依赖并排空或 busy，记录不删除 |
| attachment/委托/工作账目 | 新工作撤代与原 TG/AR 同门；旧 attachment revoked 不复活，清理能力只处理原实例；AR 确认真实 release 才去原引用，非一条卸载通知即减引用 |
| 已准入 Run、pending publication/控制与接续 | SR host 保有，原 TL/执行 owner 核停止/结果；checkpoint/epoch_parked 和接管确认之后才让 AR settle。没有实际证据不释放 stopping 占位 |

计划 Agent/owner close 按 AR 原协议：关新工作→SR 耐久 checkpoint/封闭旧执行
者→TL 等确认独立保有→AR settle/真实 quiescent→释放。它不是用户 cancel。
cancel/force_stop 的原 epoch/停止墓碑和迟到结果隔离沿 SR/TL，不靠 dispose
或 AbortSignal 证明停止。P1 不可用时可封闭旧运行通道并尽力收口，但不得声称
控制耐久成功。清理失败留原 remaining/诊断，重试原清理不用新 Context 申请资源。

facade 重挂复用原 host；host 本体替换先关新工作、排空 publication/确认清理
或具名移交、冻结完整 durable 水位，再恢复切换。旧权威未释放拒绝第二份。
恢复以新 epoch/委托/AR 许可与当前 TG/身份资格重新成立，不反序列化旧句柄。

## 采用来源与本批验证

保留自有 fork 的有效 scope 路由、快照和纯 fold；直接移除绕门裸写、无代次
贡献和假 flush。官方 Cordis 4.0.2、固定 DSH `c291e796` 与有限机制依据见
[原证据](../../../docs/proposals/core-capabilities/implementation/evidence/runtime-provider-design/README.md)。
真实 P1/AR/TG/AU 类型先固定，然后按 S01–S10/S14–S18 中 allow 基线实际依赖
推进：双租户权限、唯一激活/取批/claim、fsync/回执中断、原 deny/结果恢复、旧
epoch、依赖失联、投影与真实资源清理。S11/S13 的完整 HD/M2 部分留后续规划。
本稿没有运行这些产品符合性测试；共享诊断只记录安全阶段/关联，关键审计仍
在原耐久批，普通日志失败不能覆盖业务结果。

## CB 模型与当前性映射

`f98ac926` 已采用的挂载、link 和工作协议对
[CB v1 Binding 模型](../../../spec/compositions/agent-session-binding/v1/Binding.tla)
有以下有限对应；[独立判断及输入身份](../../../apps/local-harness/evidence/runtime-mapping-applicability/README.md)
不表示本包真实符合性已通过。业务事实、运行资格与资源清理分别由原 owner 维护。

| 模型动作/状态 | SR 与实际参与者兑现的位置 | 尚未由模型证明的部分 |
|---|---|---|
| `Publish`、`StartWork/Current` | SR `checkActivation` 与 AR 发布联合核原 attachment/Session 资格；SR 新 Run/Step 的具名准入与 AR `checkWork` 同门检查原挂载、link、必要 provider 和当前 epoch/WorkPermit | 模型把联合条件检查抽象为原子动作；真实 gate、运行时身份/TG/AU 根及持久 ready 仍须产品证据，不能用分散的旧快照替代 |
| `Invalidate/Restore`、`epoch/revision` | SR 拥有原 attachment 的 held/revoked 状态及当前资格修订；已撤销附着不回 held，新恢复资格重新取得合法许可 | 模型 Restore 只恢复 eligible，不回退 epoch；这检查 Session 资格恢复不复活旧 revision，不是对所有 host/mount 代次或完整故障恢复的证明 |
| `LoseDependency` | 原必要 provider 失效时，SR 末门直接核其真实状态/原代；宿主观察另调用 SR 同门封闭本次 mount/link | 模型 dependency 只从 TRUE 变 FALSE，没有重挂动作。失联后同 Fiber 重现仍须新 mount generation 和原代单调关闭，不能把 LoseDependency 当完整失联—重挂模型 |
| `PrepareReturns`、移交/清理/移除动作 | 晚到准备回原尝试；SR 保有原 Run/控制/接续及 attachment，AR 保有实例工作/资源；TL/LE 的独立事实由其原 owner 确认。SR 仅在 AR 真实 release 后撤原引用 | 确认移交、quiescent、资源释放均是需要实际兑现的前提；未确认或清理未知继续具名 retained，不以通知、Promise 结束或旧 disposer 代替 |

SR 受信 apply 与两端登记绑定真实 host/source/Fiber/mount/registration/generation，
同 Fiber 重挂不复用旧代。纯 check 不递归调用 AU 判定或 AR 激活，不装卸插件、
触发任意回调或在未来继续使用 frame；[admission](../../coordination/admission/design.md)
和受信组合者分别兑现活动 frame/禁止重入及调用约束。较早观察器重入时，即使
SR consumer 仍 ACTIVE、关闭 stamp 未推进，末门也须检查原必要 provider，不能放行。

这些约束维持 CB-03/06/07/10–14 的既有保护位置，没有新增共同状态或服务。
AR 的计划退役模型不补足 CB 缺少的重挂动作，两模型不能拼成完整 Cordis 精化证明。
[应用场景](../../../apps/local-harness/design.md#运行映射的命题与前提)将 S03/S09/S12
及 A04/A18/D08 的本基线依赖落到真实 owner；相应符合性当前未验证。

## 实施协议的采用来源

下列状态、记录、端口和算法从已接受的 `cd16f1` Agent/Session 输入迁入，
迁移源快照为 `7e758f21f8f92c1d46fab194fdaf120239b8e11c`。
原稿只保留受审/接受和取舍历史；本页拥有所列当前提供者设计，语言无关承诺
仍归所采用的精确 spec。接口记法不等于已经存在或发布的产品 API。

## 数据、权威与记录

### 精确引用与身份

所有 SessionRef、AgentRef、UserRef、MembershipRef、DefinitionVersion、RunRef、
StepRef、WorkOwner、Input、ContentBlock、CallRef、RequestRef、Action、OperationRef
直接用 work-data。特别是 `RunRef.session`、`StepRef.run` 和 `CallRef.owner` 保持
原嵌套字段；`Binding` 是工具动作的绑定，不拿它充当没有 parserVersion 的 Factory。
Principal/Causality/Counter/StreamRef/OwnedRecord/Position/Watermark/Receipt 来自 records，
GateFrame/OwnerPublication/ExactUse 来自 admission；不加第二套提交状态或 envelope。

Input.revision 仍为 CD Schema 的正整数 number，入口另限制在精确安全整数范围；
itemRevision 就是它，不能换成 Counter 字符串或 Number 化 stream 修订。queue、
control、stream 修订及排序/序号使用 Counter；输入修订耗尽明确拒绝，不回绕。
成员依据沿治理已接受输入的 `{member:MembershipRef,joinedRevision:Counter,observedRevision:Counter}`；
前者区分移除后重加，后者只解释观察，不作为缓存许可。
身份用无歧义结构值比较；存储键使用 core-json/1 的具名元组规范串，不拼接 tenant
与 sessionId。namespace 使用部署固定值，OperationRef.principalId 按 Principal 规范串
生成；同 operationId 换 tenant/输入冲突。create 在分配 Session ID 前固定 operation
输入，以目标 tenant/选择作为 target，生成的 ID 仅进入拟提交后果和原回执。

| 不可混用的身份 | 本批含义 |
|---|---|
| `Session.owner: Principal` | 长期对象所有者，create 固定为实际创建主体，本批不开放转让/任意代建 owner；当前权限仍逐操作检查 |
| `Session.initiator` | `{principal:Principal, agent:AgentRef|null}` 的原始归因，agent 存在时从可信调用链核实；之后不随运行用户/实例改变 |
| `Session.source` | `{parentSession:SessionRef|null, parentWork:WorkOwner|null, sourceOperation:OperationRef}`；本批普通 create 的两个 parent 为 null，恢复不改原关系。关系不授予权限或终止后代 |
| AR runtime owner | 宿主发行的、已登记关闭权的活能力；独立于 Session.owner/业务 parent/最初调用者 Context |
| 工作委托 | SR 从原受理/运行依据发行的活能力，绑定 principal、tenant、Run/Step、epoch、操作范围与成员加入依据；不是 AgentRef 或 initiator |
| incarnation / generation / epoch | incarnation 区分每次激活；generation 区分 Factory/attachment/驱动提供者绑定；SR epoch 区分原 Run 的执行权。writerEpoch 只隔离记录写者，不能替代 SR epoch |

AR/SR 的新运行身份采用受信宿主的唯一启动命名空间（含本域新 writerEpoch）与各 owner
不回绕的计数形成不透明值；一个 writer 生命周期只允许一份逻辑 AR/SR 权威，第二
Context/Registry 不能重新从零发号。发行器是宿主内部直接函数，无新 ID 服务包。
正式实现须覆盖失败准备、重启及旧 owner 重入；UUID/字符串形状或 TS brand 不证明
唯一性。所有活能力由真实 owner 私有实例表验证，不复制/反序列化/跨新代复活。

### SR 状态与边界

| 状态 | 最小 shape 与解释 |
|---|---|
| Session | `{session, owner, initiator, source, definition:DefinitionVersion, acquisition:{tenantId,acquisitionId}, createdAcquisitionRevision:Counter, lifecycle, title, manualTitle, pin, modelChoice, historyThrough, controlRevision, queueRevision}`；tenant/owner/initiator/原 DefinitionRef 及 acquisition 身份不可变。lifecycle 识别 open/archived/deleted，首批新建 open；modelChoice 是 Session 的选择/待生效事实，AU 仅拥有保存覆盖 |
| QueueItem | `{input:Input, acceptedOrder:Counter, order:Counter, state:queued|held|taken|withdrawn|closed, acceptedBy:Principal, membershipBasis, takenBy:RunRef|null, closedReason:string|null}`；原输入/编辑关系可追查，busyBehavior 本批仅 queue；held 是全 Session hold 下未取批项的有效状态，原受理状态仍保存 |
| Run | `{run, batch:Input[], definition, acquisitionBasis, executionChoice, epoch:OpaqueId, phase, checkpoint, blockers, controlRevision, delegationBasis, driverBinding, activeClaim:DriverClaim|null, outstanding}`；phase 完整沿 SR-08，batch 冻结精确修订/原消息顺序。outstanding 只存原调用/请求/接续引用及 SR 消费位置，不复制 TL/HD/BG 状态机 |
| Session 驱动占位 | `null | {run:RunRef, epoch:OpaqueId}`；在 takeBatch 逻辑提交时取得。waiting/stopping 仍占位；等待时没有运行中的 JS driver 也不让普通输入穿过 |
| Epoch 的执行者 | `null | {agent:AgentRef, workPermitId, driverGeneration}`；这是当前受管关联，不能由磁盘 DTO 得到能力。退役停驻可清除关联但保持 Run 占位；再次驱动原 Run 要新 epoch |
| Step | `{step:StepRef, createdEpoch, kind:model|auxiliary, requestBinding|null, trigger, status:running|waiting|settled|failed, proposedCalls:CallRef[], presentedOrder:CallRef[]}`；M1 是具名 `auxiliary` 的确定性工具工作，不能伪造模型结果；M2 一个模型决策及其工具批次为一个 Step，新模型决策新 Step |
| continuation | `{continuationId, run, sourceStep, call:CallRef|null, request:RequestRef|null, callWork:adjudicate|consume_result|null, localPrerequisites, state:blocked|ready|claimed|settled|closed, readyAt:Position|null, claimedEpoch:OpaqueId|null}`；只能由来源事实建立/转移，q1/q2 各自独立；callWork 是 SR 下一项消费责任，非 TL 调用状态，call=null 时才为 null。readyAt 相同以本批记录顺序裁决 |
| DriverClaim | `{claimId,run,epoch,step,continuationId:null|OpaqueId,kind:new_step|continuation}`；SR 分配的本次串行驱动事实，只一项 activeClaim。旧 Step 可在新 Run epoch 被合法续接，createdEpoch 不改；真实驱动权限还需当前私有句柄/委托和 AR 许可 |
| Control | `{operation:OperationRef, run, observedEpoch, scope:run|session, kind:interrupt|resume|cancel|force_stop, stage:accepted|applying|settled, effect:ended|stale_target|pending|applied, stopEvidence, remaining}`；请求受理/逻辑权撤销/真实停止/清理/效果质量分别保存 |
| Hold | `{operation:OperationRef, revision:Counter, reason:explicit|session_force_stop}` 的活动集合；有任一 hold 就不取新批/Step。continueQueue 携带 expected controlRevision 和明确解除的 hold operations，不用过期清空覆盖新 hold |

`executionChoice` 本批为 `{kind:deterministic, driverKey, driverVersion}` 或
`{kind:model, profileId, profileRevision}`。前者明确没有模型请求/usage，是工作包已选
M1 无模型路径的实施投影；后者须真实 MC 资格。两者固定一个 Run，不能运行中
互换；模型不可用不影响确定性基线，但不能向缺 MC 的模型 Run 返回可运行。
同理预算依据由真实 BG 参与第一次实际收费/零计费调用，Run 元数据不铸造预算许可。

Session.acquisition 只是 TG 原 Acquisition 的身份投影，不能按 DefinitionVersion 搜索
另一条 enabled 选用代替它。create 必须显式给出该 acquisitionId，TG 核对 tenant、
selected 精确版本、enabled、权益及当时 configuration/revision，创建事件保存原关联。
Run.acquisitionBasis 保存取批时 TG 的完整不可变 Acquisition 快照；准备 stamp 包含
原 acquisitionId/revision。恢复/激活/后续准入仍查询**该身份**，removed 后同版本
重新 select 得到的新 ID 不复活旧 Session，缺失/停用则后续使用明确阻塞，历史保留。
本批未开放 Session 重选关系；需要改目标时不能偷偷重绑。同 ID 的 configure 按
下一工作边界生效，当前 Run 沿原配置快照；若变更实例必需装配则先退役/重新激活，
不能在一个 Run 逐字段吸收。TG 的当前收紧与 TL/AU 资格照常封闭新准入。

checkpoint 使用 `inputs_taken | step_prepared | calls_recorded | waiting | results_linked |
step_settled` 的具名安全位置，保存原 Step、来源记录位置及未交付后果引用。
它不是反序列化调用栈；恢复可否继续还必须核对原模型/调用的实际接纳与结果。
step_started 将可运行 Run 置 running，无就绪接续的等待保存为 waiting；只有
checkpoint/控制/结算的具名合法事件能推进 phase，不提供任意 setState。
工具实际完成顺序记录 source Position，模型呈现顺序沿原 proposedCalls，不互相覆盖。

### 唯一记录 owner 和事件

SR 记录 owner 固定 `session`，tenant-scoped streams 为具名元组 `session(S)`、
`queue(S)`、`run(R)`；Session stream 保存目录/hold及唯一驱动占位，queue 保存内容
版本/顺序，run 保存 Step/continuation/控制/checkpoint。streamId 使用完整引用的
规范元组；一个 batch 每个 stream 只有一个 append，修订每 batch 加一。输入内容
直接嵌入已校验 Input，无第二份内容仓储。业务事件 version 均为字符串 `"1"`。

| kind（前缀 `session.`，全部 /1） | data 与 fold 义务 |
|---|---|
| `created` | Session 初始完整值；检查身份/原定义/owner，已有 Session 不可重复创建 |
| `input_enqueued` | `{input, acceptedOrder, acceptedBy, membershipBasis, order}`；只接 text，不接受用户伪造 tool_result/deferred_receipt |
| `input_edited` | `{input, previousItemRevision}`；保留原件，必须未 taken，严格下一修订 |
| `queue_reordered` / `input_withdrawn` | `{orderedInputIds, previousQueueRevision}` / `{inputId,itemRevision,previousQueueRevision}`；完整范围与当前成员一致，不丢新加入者 |
| `batch_taken` + `run_created` + `driver_reserved` | queue 的 `{run,batch,previousQueueRevision}`、run 初始值、Session 的 `{run,epoch}`；同一 batch，fold 验证成员/修订/顺序、旧占位为空、三者互指 |
| `step_started` / `driver_claimed` / `driver_yielded` | Step 初值 / DriverClaim / `{claimId,run,epoch,checkpoint}`；新 Step 与 claim 同批，续接已有 Step 只写 claim；yield 精确封闭本 claim，不释放 Session 的 Run 占位 |
| `step_returned` / `checkpoint_saved` / `step_settled` | `{step,claimId,source,content:TextBlock[],proposedCalls,nextIntent}` / `{run,epoch,checkpoint,sourcePositions}` / `{step,claimId,outcome,evidence}`；按下文 driver 端口核实来源/完整性/合法阶段，不能跳过未关联结果 |
| `decision_intent_consumed` | `{sourceOperation,step}`；新 Step 消费原 inputs_taken 或已保存 next_decision 意图，与 step_started/driver_claimed 同批，原意图只能消费一次 |
| `driver_failed` / `run_failure_requested` | `{run,epoch,claimId,step,code,sourceFacts}` / `{run,epoch,failureOperation,exactCalls,exactRequests,remaining}`；SR 将原 Step 标 failed 并保存不可恢复失败/停止意图，和相关 TL/HD 封闭同批；不是任意 driver 自写 failed |
| `continuation_waiting` / `continuation_ready` / `continuation_claimed` / `continuation_settled` | 精确 continuation 及原 request/call/来源位置、上一状态、claim epoch；ready 的排序用 envelope Position，claimed 与本次 DriverClaim 同批；已有 sourceStep 不重建 |
| `call_proposed` | `{step,call,continuationId,sourcePosition,sourceOwner,protocolVersion,presentationIndex}`；与 TL 原 proposed/冻结 Action 同批及 continuation_waiting 互指，只登记原调用和等待 step_returned 的裁决责任，不准入效果 |
| `call_linked` / `result_linked` | `{step,call,sourcePosition,sourceOwner,protocolVersion,presentationIndex,result:ToolResultBlock|null}`；从 TL 真实事实导入，原 call/attempt 唯一关联；迟到隔离事实不能用此事件替换有效结果 |
| `control_requested` / `control_progressed` | 完整 Control 的合法前后修订、终止意图、已知 stop 事实/剩余责任；force_stop 的 epoch 封闭发生在 accepted 的 logical publication |
| `hold_set` / `holds_released` | Hold / `{operations,previousControlRevision}`；释放明确目标，清理成功不产生此事件 |
| `epoch_parked` / `epoch_replaced` | `{run,oldEpoch,checkpoint,reason}` / `{run,oldEpoch,newEpoch,delegationBasis,driverBinding}`；park 封闭旧执行者，新代恢复不得修改原 batch/定义/模型选择 |
| `run_settled` + `driver_released` | `{run,epoch,phase:completed|failed|cancelled|interrupted,reason,evidence,remainingIndependent}` 与 Session 精确占位；同批且已满足对应安全条件，不能把 unknown 当 stopped |
| `late_fact_recorded` | `{run,oldEpoch,call|null,sourcePosition,classification,remaining}`；只增加原工作隔离/诊断证据，无有效结果或继续权 |
| `operation_denied` | `{operationKind,target,code,observed:Watermark}`；独立 Session 审计 stream，披露按读权裁剪；未保存关键拒绝返回 audit_unavailable |

`run_settled(interrupted)` 是已安全中断，非逻辑终态；此时可和 driver_released
一起释放活动占位，历史/未关闭接续仍属于原 Run。恢复旧 interrupted Run 必须
没有另一活动占位，并核对中间历史/原逻辑目标相容，否则 busy/superseded，不
重定向。仅退役 park/waiting 则保留原 Run 的 Session 占位，恢复可原位换 epoch。
队列还受 hold/当前资格限制，stopping 不因无 JS driver 而释放占位；这不开放
SR-11 的复合控制。一个 Session 可保留多个历史 Run，只有一个当前活动占位。

事件中的 `sourcePosition` 在来源早已耐久时为完整 Position；同批新事实尚未
分配 Position 时使用 `{kind:"this_batch",stream:StreamRef,recordIndex:number}`，
只能引用本 envelope 内真实匹配的来源记录，恢复据本 envelope 得到其 Position。
索引按冻结 appends 的实际排序固定，禁止预猜 seq/commitId；跨批缺回执不得使用
this_batch。source owner/protocol/对象版本同时匹配，不能仅凭一个位置取得事实权。

跨 owner 的同批核对由具名组合和受信恢复装配完成；SR reducer 不要求执行 TL/HD
代码。凡来源未知版本、错误 tenant、call 不属原 Step、非法 epoch 转移或缺少
应当同批的对项，恢复失败；不能跳过后继续写。TL/HD 的 source Position 是来源
引用，不是批准/结果权限。消费状态保存 source owner/protocol/Position 与原对象
引用，幂等按这些精确事实而非通知 ID。

## 当前调用者、对象权限与运行委托

这是 cd16f1 已接受、与治理消费面衔接的最小权限政策，不能由方法名自然推出：create 的 owner
是当前真实 Principal；owner 的 `session.read_metadata/read_content/enqueue/edit_queue/
control/activate/settings.write.confirmation_mode` 逐项明确授予，前提仍为当前认证/TG 资格与对象可用。其他同 tenant
成员默认无这些权利；`tenant.members` 等管理权不扩大为 Session 读权。
额外 `session.emergency_control` 是 TG 实际登记、可撤销的独立租户权限，仅允许
精确 interrupt/cancel/force_stop，不含正文、resume、设置写、新工作或隐式代答；本批不新增
通用 ACL 编辑服务。未来分享/代建政策缺席时明确不支持。

对象正文权归 SR 判断，TG 提供当前成员/明确紧急控制资格；工具资源权限仍归
实际资源 owner/AU。list/history/subscribe/lookup/原 operation 返回都在披露时
再查；权限丢失立即关闭该订阅的新披露，事件 payload 不先排入无权客户端缓冲。
无权与不存在对普通调用者统一 inaccessible；控制回执仅给获权状态/停止信息。

Session 的设置写权与 control/read 独立求值。AU 的
`setOverride/clearOverride(scope=session(S),settingId=confirmation_mode)` 门外调用 SR
`prepareSessionFacts`，同门 `checkSessionFacts` 必须返回当前 owner 的
`settings.write.confirmation_mode`；核对真实 invocation、TG 当前成员、Session open、
原 acquisition/定义及 SR 权限 stamp，AU 再核对字段/值 Schema、作用域和自己 stream
的 expectedRevision。只由 AU 一次 owner_change 写 override/审计；SR 是只读参与者，
不复制保存模式或虚造 publication。hold/interrupted 或历史 Run 终态本身不撤销
owner 的 Session 设置权；撤权/停用先发生则该旧候选不可提交。
set 的 standard/confirm/unattended 与 clear 分开，false/null 仍拒绝；生效/来源由
AU readEffective 按已接受层次计算，变更不伪造 pending 请求的答案。紧急控制者/
普通管理员不能借控制权改模式。这里不开放 text_model；其 SR/MC 同批选择门不变。

`settingsUser` 从真实被代表的用户取得：本批用户 Session 是 Session.owner.user，
内部宿主派发/RunDelegation 保持同一用户；不是当前查询者、initiator 或工具参数。
SR 返回 AU 要求的明确 UserRef；无法核实被代表用户的 system 工作返回 unavailable，
不猜一个默认用户。Session 设置操作也不因此得到 user_definition/definition_default
写权，它们继续由 AU 的各自作用域规则判断。

应用的真实身份适配发行治理输入中的 `AuthenticatedInvocation`，每次
`inspectCurrent(frame)` 核验私有身份、Principal、凭据修订及可用性；撤销/失联的
当前状态写入口也参加同一 coordinator。Session 消费这一个协议，不再发一种
Principal DTO 凭证。AR 不 import 应用或治理类型：它声明下面的 RuntimeAccess
消费面，由 SR/治理适配捕获原 invocation；只有受信装配登记的适配能提供它。

用户 enqueue 只授本次受理；每项保存原 acceptedBy/成员加入依据，排队不保留
客户端活连接。takeBatch 的宿主调用使用真实内部系统身份并携带 SR 已登记的
限定派发意图：代表 Session.owner 运行，只能领取该 Session 当前队首输入。
它必须在当前 TG 根重新核对 owner/每项输入主体资格和定义 use 权；输入队首失权
返回具名 blocked，不跳过。最小政策只有 owner 可入队，因此一个批次不混入多个
被代表主体。客户端断开不撤销意图；凭据失效拒绝该旧凭据的新请求，成员/定义/
Session 资格撤回则封闭尚未准入工作。组织移除后再加入不认回旧 joinedRevision。

SR 发行 `RunDelegation` 活能力：`{principal,tenantId,run,epoch,subjectDefinition,
sourceOperation,membershipBasis,acquisitionBasis,allowedOperations}`。公开字段仅为解释；真实对象
必须在 SR 当前表认回，且 Run 当前 epoch/控制/可用性都有效。allowedOperations
仅为推进该 Run、提议其 Step 工具/模型工作、关联原结果；不含 Session 管理、任意
其他对象或代表他人。Step 消费委托必须匹配 `StepRef.run` 和当前 DriverClaim.step；续接已有 sourceStep
时不要求它是最新创建的 Step，也不以 Step.createdEpoch 代替当前 claim.epoch。
AU 的 subjectDefinition 从此和 Session 原定义关系取得；Action.definition 仍是
TL 工具定义，二者不能因同用 DefinitionVersion 类型而合并。

resume/recovery 先根据原耐久 delegationBasis 和当前 TG/SR 资格形成新委托及新
epoch，不能从日志反序列化原句柄；紧急控制者不能借 resume 获得 owner 的运行
身份。该委托的消费/撤销/epoch 变化与 TG/AU/AR 检查处于同一门。当前资格失效
关新 Step/Action；已位于 n 的合法工作沿 CC-03 保持其原准入，必要停止另用
精确控制。收口/外部结果核实使用独立清理/事实通道，不冒用失效委托。

## SR：公开操作与一个实际 batch

| 表面 | 输入与结果 |
|---|---|
| create | invocation、operationId、tenant、精确 Agent DefinitionVersion 与原 acquisitionId；TG 当前 use/选用检查，生成原 Session；AdmissionResult 的已耐久业务结果包含 SessionRef |
| read/list/history/queue/run/subscribe | invocation、精确目标、分页/水位；先当前权限，再一致快照。正文与元数据分开，projection 缺失标 rebuilding/unavailable，不把它当不存在 |
| enqueue/edit/reorder/withdraw | 原 operation、Session、输入/目标、expected queueRevision/itemRevision；text-only、容量/修订/顺序检查；返回原耐久结果及新修订 |
| takeBatch | 受信宿主派发意图、精确 AgentRef、Session、expected queueRevision；队首连续合格 text、配置批大小、固定顺序；成功创建唯一 Run 并把本批全部 taken |
| acquireNextStep | 原操作、RunDelegation、WorkPermit、RunRef/epoch、expectedRunRevision、`trigger=new_step(fromCheckpoint,sourceOperation)` 或 `continuation(continuationId)`；SR 按下文取得唯一 DriverClaim，返回已耐久 `{claim,step,checkpoint}`；续接不分配新 Step |
| driver 进展/结算 | `recordStepReturn/yieldDriver/settleContinuation/settleStep/requestRunCompletion/reportDriverFailure` 只给注册 driver/原收口宿主；输入和裁决见下节，不给 driver append 或 setState |
| requestControl/readControl | 当前调用者、operationId、精确 RunRef/observedEpoch、kind/scope；重复认回原控制，旧目标 ended/stale_target，不转向新 Run |
| hold/continueQueue | 当前 owner 权限、operationId、Session、expected controlRevision、明确 hold 集合；只改变 hold，不越过 stopping/待答/失权 |
| preparePark/recoverRun | 受信退役/恢复 owner、精确 Run/epoch、checkpoint/原工作核实事实；前者停驻并封闭旧执行者，后者按当前资格/兼容性建新 epoch。不是用户传 JSON 即可调用的恢复入口 |

read/list 等不导出 raw RecordReader。写操作沿共享 AdmissionResult，业务拒绝写入
原 owner outcome，不把 committed 的 denied 说成业务成功。内部 stamp 过期为
prepare_again，门外有界重准备；用户 expected 修订冲突保留原值并按 records 写成
可重试认回的确定冲突，不偷偷改 expected。公开非法输入在准备边界拒绝。

以 takeBatch 为具名 `input_run` 组合，所有准备/检查/发布明确分开：

1. 门外规范化操作；短门核验当前读权并 lookupPrepared，已知结果认回，not_seen
   才准备 TG、AU busy_input/所需模型配置、SR 队列/占位和 AR 工作候选。
2. 门外按当前队首形成唯一冻结 batch、Run/epoch/委托/初始 checkpoint、SR 三个
   stream 的 appends/候选根；AR 准备原资源。模型路径另需要实际 MC 资格，M1
   直接核对确定性 driver。coordinator.prepare 预编码这一整个 batch。
3. 同一个 enter 内再次去重，依次核验真实调用/派发意图和 TG → SR 对象/队列/
   control/原定义/原 acquisition → AU 当前所需配置 → AR 精确 ready/attachment/工作/资源及
   driver 绑定。准备 stamp 变化退出重准备；禁止外部查询、解析、await、通知。
4. AR 同门 pinWork，交入该 batch 的 requiredUses/uses；submit 一次。
   此 batch 只有 `session` 写记录，所以 publications 恰有一个 session；TG/AU
   只读不造假 publication。logical 同步占队列/Run/driver 并封闭冲突。
5. 门外待 coordinator completion；只有 committed 且 publication=ready 才向 driver
   交 Step/工作。writer Promise、Position、已排队的 pin 都不允许启动。unknown
   保留原票据/占位/使用，只 lookup 原操作；冲突不创建第二 Run。

跨 owner 的请求/结果/控制也按同一规则准备一个 PreparedCommit，绝不把上面
步骤拆成 `SR.save()` 再 `HD.save()`；所有写 owner 一一对应 publication，全部
stamp 检查后才能 pin/submit。`publishLogical/publishDurable` 严格同步返回 undefined，
只换已冻结根；异常隔离，不通用回滚。logical 不被旧 durable 根覆盖。

否定事实（hold、interrupt、终止意图、epoch 撤销、TG/AU 收紧）立即封闭后续位置；
正向事实（解除 hold、中断恢复、人类答案、授予/资格增加）必须耐久才供新准入。
当前允许集合与所有未耐久收紧取交集，不能只比最终 logical/durable：例如
hold→clear 都 pending 时不能让 clear 掩掉 hold。普通撤权 n+1 不改 n 的准入；
force_stop 可以封闭原执行权，使 n 耐久后仍不能启动。域失败禁止越过水位缺口。

### Driver 向 SR 交付进展与结算

这些是 Session 的真实受信写操作。共同输入为 `{operation,claim:DriverClaim,
expectedRunRevision,expectedCheckpoint}` 加下表具名数据；
真实 claim 必须由 SR 私有表认回、等于 activeClaim，绑定同一 Run/当前 epoch/Step、
注册 driver、RunDelegation 及 AR WorkPermit。方法返回 AdmissionResult，result 只
报告 SR 实际选择的进展/等待/终态；driver 的 nextIntent 不是状态赋值或完成证据。
门外核实原事实/准备候选，门内重检全部 stamp/控制，SR 组装一次 batch；正常进展
用 checkWork，closing 下有限收口用 checkSettlement，force_stop 后只能入隔离证据。
expectedRunRevision 就是 run(R) stream 修订，不另造未定义的 Step 修订。
recordStepReturn/settleContinuation/settleStep 的 nextIntent 由 SR 在**本次调用**内
计算是否同时结算 Step/Run、保存下一意图或进入等待，并同批 yield；不要求 driver
先交还 claim 再持失效 claim 调结算。requestRunCompletion 是仍持 claim 时的
无新增输出结算请求。需要新 Step 的意图保存原 sourceOperation/来源位置，只能
由 new_step 分支同批消费一次；initial inputs_taken 同样只消费一次。

| driver → SR 操作 | SR 裁决、合法转移及同批记录 |
|---|---|
| `recordStepReturn` | 输入 `{source,content:TextBlock[],proposedCalls:CallRef[],nextIntent:finish_run|next_decision|await_calls}`。source 是本部署确定性 driver 的受管返回，或 MC 原请求/attempt 的可核实完整终止事实；不接受 driver 自造模型成功/ToolResult。SR 核对 source 的完整调用列表与 TL 已登记 proposedCalls 及同批建立的 SR 原接续；缺任一绑定返回 unavailable(proposal_handoff_incomplete)，不交还 claim。保存 step_returned + 对应 checkpoint，有 proposed 时的交还按下段同批置就绪，其它 nextIntent 不跳过它；无工具完整成功才可作为 settleStep 的依据，partial/unknown 不能冒充成功 |
| `yieldDriver` | 输入 `{reason:await_facts|park,sourceFacts}`。SR 从已持久 call/wait/结果推导 checkpoint；有尚未结束的精确调用可保持 source Step waiting，将正在等待其结果的 continuation 从 claimed 置 blocked；仍为 proposed 的原调用不能按“等待结果”阻塞，交还裁决 claim 时必须保留原 adjudicate 就绪责任。checkpoint_saved + driver_yielded 同批封闭 activeClaim；有别的合法 ready 则可再取 claim，否则 Run waiting。park 另沿 epoch_parked，不能以 yield 免掉 AR 后代责任 |
| `settleContinuation` | 输入 `{continuationId,consumedFacts,nextIntent:finish_run|next_decision|await_facts}`。必须是本 claim 的原接续，其所需 HD 后果/原 call 终态已关联且未重复消费；pending/unknown 未经原 owner 明确处置不结算。continuation_settled + checkpoint_saved + driver_yielded 同批；next_decision 只记录下一决策意图，q2 未答仍保留，不顺带关闭它 |
| `settleStep` | 输入 `{step,sourceFacts,nextIntent}`，SR 检查完整 step_returned、原 proposedCalls 的可信结果/具名独立责任、该 Step 全部 continuation 已结算且无未处理依赖。step_settled + checkpoint_saved 同批；未满足则报告 waiting，不因 driver 函数 return 就 settled。它可和 settleContinuation 在同一 SR 候选批内成立，不要求先提交两次 |
| `requestRunCompletion` | 输入 `{sourceFacts}`；SR 核对全部 Step/continuation 的完成判据、没有 pending 请求/ready/在途 driver 后代，剩余责任已结算或确认独立持有。可与最后一次 Step/continuation 结算合成一个 owner_change batch，写 run_settled(completed) + driver_yielded（若仍有 claim）+ driver_released；缺任何条件只返回 waiting/blocked，不能取消请求来凑成功 |
| `reportDriverFailure` | 输入 `{code,sourceFacts}`，由原受管任务的 throw/reject 接管点调用，错误正文不入普通日志。SR 核验失败属于原 claim，保存 driver_failed，按不可恢复失败在同门封闭继续权并和 TL/HD 的精确终止片段提交 run_failure_requested；其余处置见下段。已先 cancel/force_stop 或旧 epoch 只保留迟到失败，不取代已有终止意图 |

#### proposed 登记到裁决、结果的交接

TL-07 的 proposed 耐久登记先于当前门裁决。本部署由 TL 在登记时调用下表
prepareProposedCall：门外准备原冻结 Action、CallRef/来源及 SR 候选，同门核对
TL 来源 stamp、SR 原 new_step claim/Step/委托/AR 许可后，以一次 owner_change
提交 TL proposed 与 SR call_proposed + continuation_waiting，两 owner 各有唯一
publication。SR 只在这里为该 CallRef 分配一次 continuationId，初值为
`blocked, callWork=adjudicate, request=null`，前提是原 Step 的完整 step_returned。
此批不释放原 claim，不建 attempt/预算预留/执行许可；重复原操作认回同一绑定。
本域不接受 TL 先单独落 proposed、再靠通知补 SR；缺 SR 提供者登记不可提交。

recordStepReturn（含 await_calls，其它 nextIntent 也不跳过未裁决调用）核对完整
列表和这些原绑定后，**同批**保存 step_returned、calls_recorded checkpoint、全部
尚待裁决接续的 continuation_ready
和 driver_yielded。耐久前不得 claim 这些正向 ready，logical 交还也不放行新效果。
原 new_step claim 已登记 proposed 但尚未完整返回时，yieldDriver(await_facts)
拒绝交还，须经 recordStepReturn 完成交接；park 仍保留原交付责任。交还后有
可认回的 adjudicate 工作，不能只写 waiting，期待尚不存在的审批/执行结果。
acquireNextStep(continuation) 取得原 Step 的新 claim 后，
才向 TL 当前门交原调用；以下裁决都消费此 claim，不修改 CallRef.owner/Action。

| TL 当前裁决 | 同一原接续及 claim 的去向 |
|---|---|
| allow | action_execution 同批保存 TL 准入/原 attempt 与 SR call_linked、continuation_waiting(callWork=consume_result)、checkpoint、driver_yielded；原接续等待该调用终态，耐久且许可仍有效才可执行 |
| ask | request_wait 同批保存原 HD 请求/TL waiting 与 SR 原接续的 request/人类决定前提、checkpoint、driver_yielded；不分配另一接续。HD approve 后同一 adjudicate 接续 ready，再取得原 Step claim 重检当前门 |
| 直接 deny | owner_change 同批保存 TL settled(denied_before_execution)、本次 AU 拒绝审计及 SR result_linked、continuation_ready(callWork=consume_result)、checkpoint、driver_yielded。无 attempt、预算预留或 HD 请求，禁止工具效果；不能把 deny 仅作为 RPC 返回丢弃 |

ask 后的拒绝也必须关联 TL 原执行前终态才可消费结果；HD 决定自身不冒充
ToolResultBlock。prepareResult 用 TL 发行的执行前终态证据接受直接 deny，不要求
不存在的 executionEpoch。原结果接续 ready 后再 claim 原 Step，并以
settleContinuation 消费/结算；q2 独立待答不阻碍此过程。unavailable/prepare_again
不是 deny，更不是结果；原 proposed/接续/持有责任保留，不能静默结算或忙重试。

恢复按同水位的 TL proposed/终态与 SR 绑定、step_returned/claim 事实重建：
已交还而未裁决保留原 adjudicate ready；deny 批已耐久则恢复原 consume_result
ready，丢通知/回执不再裁决或执行。若崩溃时旧 adjudicate claim 尚在且 TL 仍为
proposed 或已执行前拒绝，recoverRun 用 epoch_replaced 同批封闭旧 claim，并把
**同一接续**恢复为对应 ready；其它 TL 状态按原等待/执行事实恢复，不能统统置
就绪。只有当前身份/新 epoch/AR 许可齐备才能再 claim 原 Step。proposed 登记已
耐久而 step_returned 未耐久时，仍保留原 Step 的完整返回交付责任与 blocked 接续，
不推断已交还；恢复缺原完整输出或原 Step 的当前受管 claim 时明确 blocked，
不能用新 Step/伪造完整返回/重发调用填补缺失。
同域 proposed 缺 SR 绑定是组成/恢复错误，不以新建空接续掩盖；强停、已关闭或
未解除的全局阻塞照常封闭继续权。所有认回沿原 CallRef/Action/continuationId，
无效果的执行前 deny 不得恢复出 attempt。

无工具返回且 nextIntent=finish_run：recordStepReturn 在符合条件时必须把
step_settled/checkpoint/run_settled/driver_yielded/driver_released 合为一次提交，
耐久后才向调用者确认完成。工具返回后
相同算法消费 TL 真实 result_linked；driver 只能提供消费意图，不能改变结果状态。
正常 checkpoint 的迁移由具体来源约束：inputs_taken→step_prepared 随新 Step，
完整工具建议关联后→calls_recorded，等待事实→waiting，原结果关联/消费后→
results_linked，Step 全部前提满足后→step_settled；迟到通知不会绕过中间事实。

不可恢复失败使用 SR 具名终止组合：原 activeClaim/epoch 和引用清单同门封闭，
SR 的失败意图/continuation closed、HD 对仍待答请求及未应用后果的取消
(reason=run_failed)、TL 未准入调用封闭/原调用停止意图在**一个** owner_change
batch 保存。HD 已有答案与已完成接续仍保留，只关闭剩余后果；不得先 run.failed
再异步猜哪些请求需关闭。需要真实停止/隔离时 Run stopping 保留占位，按原停止
协议取证后另一批 run_settled(failed)+driver_released；无在途责任可在首批直接
安全结算。必需 TL/HD 提供者 unavailable 则不宣称联合关闭/失败终态，原 owner
保留停止意图与责任，封闭效果。driver 抛错不让 detached Promise 静默消失。

### 原 Step 的继续与下一次决策

q1/q2 来自 Step S 时，HD 答复使 q1 接续 ready；acquireNextStep 的 continuation
分支 **继续 S**，只分配新 DriverClaim，原 CallRef.owner、Action.owner 和 S 的
createdEpoch 都不改。TL/AU 的当前 Step 检查针对 `activeClaim.step == S`、当前
claim.epoch/RunDelegation 与原调用绑定，不要求 S 是最后创建的 Step。批准后
执行原 attempt，等待工具结果可 yield，再由原 TL 结果使同一接续 ready；拒绝
则消费原 denied_before_execution。两者结算后 q2 仍属于 S，不被标为完成。

若 q1 后需要下一次模型决策，SR 先保存 q1 consumed 事实/next_decision 意图并
释放 claim，再由 new_step 分支消费原 sourceOperation 的意图创建 S2；它不依赖
S 中独立 q2 已答，模型投影
携带 q2 deferred receipt。S 可以因 q2 未完仍为 waiting，**未结算 Step 可以多个，
可执行 DriverClaim 只有一个**。后来答 q2 仍 claim S，不将原调用改绑 S2；S2
自己的新工具建议才归 S2。普通无工具返回只产生一个新 Step；恢复/批准/结果
重放都不凭通知创建新 Step。该分工不允许 driver 把模型建议当作已执行结果。

## TL/HD 的窄交互与独立接续

下面由 SR 声明必需输入/消费责任；TL/HD 各自拥有状态、具体 provider 协议和发行
事实能力。实现前必须与其作者固定相同 shape/版本，不能用调用者填写的 DTO 或
通知 payload 充当已接纳/已停止事实。SR 不提供任意 `setCallState` 或 `unblock`。

| 方向与消费端口 | 必需 shape、核验及同批关系 |
|---|---|
| TL → SR `prepareProposedCall/checkProposedCall` | `{run,epoch,claim,call,action,source,presentationIndex}`；TL 私有候选包含冻结 Action/CallRef 与 proposed 记录，source 证明来自原 Step 的受管输出。SR 检查当前 new_step claim、未完整返回的 Step、原 WorkOwner/Action.owner、顺序/去重和 TL stamp；返回原 continuationId、SR 私有记录/publication 候选。一次 owner_change 登记两 owner 原事实，保留 claim；sourcePosition 引用本批 TL proposed，不能由 driver 拼接事实 |
| TL → SR `prepareCallLink/checkCallLink` | 原 WorkOwner=StepRef、Run/epoch、CallRef、continuationId、精确 Action/来源 owner stamp；核对 SR 当前 adjudicate DriverClaim.step（可为续接的原 Step）/委托/AR 许可和原 CallRef.owner/Action.owner。TL action_execution 聚合 AU 判定、HD 消费（如有）、BG 预留、TL 调用与 SR link/原接续转等待/yield，一次 batch；不得在此首建接续 |
| HD/TL → SR `prepareWait/checkWait` | `{run,epoch,step,call,request,continuationId,action,requestContentVersion,localPrerequisites}`；来源 owner 私有候选证明原 Action/request。`request_wait` 核对原 adjudicate claim/已登记接续，同批持久 request/Action/调用 waiting 与 SR 原 continuation_waiting/checkpoint/driver_yielded；耐久前不展示可答请求，不首建接续 |
| HD → SR `prepareConsequence/checkConsequence` | `{request,contentVersion,outcomeVersion,call,continuationId,sourceOperation,outcome}`；HD 当前唯一决定/后果候选，SR 核对原等待与全局终止。`answer_consequence` 同批保存 HD 决定/后果和 SR ready 或具名 closed 结果；approve 不直接启动工具 |
| TL → SR `prepareResult/checkResult` | `{call,step,sourcePosition,result:ToolResultBlock,terminalEvidence}`；terminalEvidence 为 TL 私有事实：`before_execution {proposalRevision,terminalVersion,decisionOperation}` 或 `execution {executionOwner,executionEpoch,terminalVersion}`，分别核对未建立 attempt 的原执行前终态或原执行 owner/epoch。来源是已耐久事实或本批唯一终态；SR 核对已登记原接续后 result_linked + ready(callWork=consume_result)，若是直接 deny 则同批 yield 对应 adjudicate claim；无此 claim 的耐久结果交付不虚构 claim。确认前不可消费，不能把缺执行身份的任意 DTO 当执行前事实；分次交付由 TL 保留具名后果至 SR 回执 |
| SR → TL/HD `prepareRunControl/checkRunControl` | `{run,observedEpoch,controlOperation,kind:interrupt|cancel|force_stop|driver_failure,scope,exactCalls,exactRequests}`；所有原非终态自有调用由 SR/TL 同门快照确认，TL/HD 各给自己的记录/publication。SR 保存停止或失败意图/阻塞，HD 关闭应关闭请求/后果，TL 封闭未接纳调用；同域一次 owner_change batch |
| SR → TL `inspectRunCalls/requestStop` | 原 CallRef、执行 owner identity/protocol、原执行 epoch、controlOperation；只查询/停止同一 attempt。异步执行器账本交接沿 CC-05，响应丢失查原操作，SR 保留待交付意图 |
| TL → SR `prepareStopProgress/checkStopProgress` | `{call,executionEpoch,controlOperation,acceptance,physical,isolation,cleanup,effect,sourcePosition}`；各字段独立，证明覆盖迟到 start/旧结果入口。未知/not_found/本地 abort 无法令 SR 释放占位 |
| SR → AU 的 Session/工作事实（实现 AU ActionFacts） | `prepareSessionFacts/checkSessionFacts` 用于无 Run 的设置/对象操作，`prepareWorkFacts/checkWorkFacts` 用于精确工作；返回 `{session,owner,subjectDefinition,acquisition:TG当前原Acquisition,settingsUser:UserRef,run?,epoch?,controlRevision,operations:明确集合}` 的私有快照/current 结果，附原 Run acquisitionBasis、当前 claim/委托 stamp；正文读、输入写、设置写、控制独立，无批准或资源许可 |
| SR → TG 的引用清单（实现 TG ReferenceInventory） | `prepareReferences(target)/checkReferences(frame,candidate)`；由 SR 持有具名引用项/完整性和当前修订，含 Session 原定义/acquisition、Run 快照与 attachment 使用；下节固定范围/双视图与交错。缺 provider 不返回空清单 |

普通工具 call/result 关联只给部署信任的 TL owner。公开用户粘贴工具结果是 text。
同域来源若先已耐久，再独立交 SR，源后果以原 CallRef/终态版本稳定去重，SR 返回
原 Receipt；不能以“已收到通知”让 TL 删除待交付责任。强停已封闭或终态后的事实
进入 late_fact_recorded 或原 TL 账目，继续保留外部效果/费用，不更新有效 Run 输出。
普通热释放/恢复后的独立 TL owner 可以把原 call 的合法结果交给当前 SR：实际
执行的原 epoch 与当前 Run epoch 分别核验；执行前终态核验原 proposed/决定来源。
原调用未被强停/结算取代、结果来源已核实，
当前接收操作按新的 SR 资格同门提交，不能让旧 Agent 回调代行。结果可在无 Agent
时入账/使接续 ready，取得新 Step 仍须当前 AR 许可；这条事实通道不授新工具执行权。
HD 的决定后果也使用原 request/outcomeVersion；新 attempt 不能消费旧批准。

SR 对 ready continuation 与已保存 next_decision 意图按耐久位置、同批记录顺序串行 claim；只有当前
activeClaim 能驱动下一动作，原 waiting Step 不阻止独立就绪接续。q1 已答、q2 未答时 q1 可准入，q2 的阻塞仍在；
q1 结束不能 completed。普通 completed 的检查必须同时满足：全部本 Run 接续
settled、没有 pending 请求/未消费 ready、所有剩余责任已结算或有具名独立接管
证明；该检查、run_settled 与 driver_released 是同门同批，不能以空 ready 列表
替代。新用户输入始终排队，普通文本不会答复 HD。无 ready 时
保存 waiting 原因并释放可释放观察资源，不运行模型轮询，不给等待自动答案或
人类请求总量上限；分页/当次处理预算有界。激活宽限只影响资源，不取消请求。

工具首次 allow 路径不依赖 HD；但 AU 判为 ask 且真实 HD/request_wait 未交付时，
返回 unavailable(human_decisions_unavailable)，不执行、不伪造批准或在内存等答。
最小节点必须经真实 grant 管理和真实本地预算准入文件工具；这一门必须在最小
节点前通过。完整 q1/q2、持久审批和 M2 deferred receipt 仍是后续本批必交行为。

### SR 提供给 TG 的引用清单

TG 定义 ReferenceInventory 消费协议，Session 实现它；接口依赖方向为 SR→TG，
不让 TG import SR 实现，也不把正文历史投影作为判断无引用的权威。
`prepareReferences(target)` 的 target 为精确 DefinitionRef/DefinitionVersion、
`{tenantId,acquisitionId}` 或 `{definition,draftRevision}`；门外取得 SR 私有候选，
含已接受治理形状的 `ReferenceReport={sources:[{owner,revision}],references:
[{owner,target:ResourceRef,relation,blocksDiscard}],complete}` 与原查询/范围 stamp。
`checkReferences(frame,candidate)` 同门验证原实例、查询和当前引用根，返回
ready / prepare_again / unavailable；不在门内全量扫描、调用户函数或查询存储。

| SR 引用项 | ReferenceReport 中的对应与范围 |
|---|---|
| 已创建 Session 的原 DefinitionVersion/原 acquisition | owner=session，target 为该 Session 的 ResourceRef，relation=session_definition/session_acquisition；包含仍受保留义务约束的历史，不因没有活体 Agent 丢失 |
| Run 的 acquisitionBasis/definition/driver 依据 | target 为原 Run 的 ResourceRef，relation=run_definition/run_acquisition；保留准备、等待、停止与历史工作，不能在释放 driver 时删去引用 |
| SR 当前 held/revoked/releasing attachment | target 为精确 AgentRef 对应 ResourceRef，relation=agent_attachment；释放确实完成才撤回运行引用，blocked 清理仍在；来源是 SR attachment 登记，不推测 AR 目录 |
| draft | 当前 Session 只允许已发布 DefinitionVersion，SR 不产生 draft 引用；仅在已恢复完整根且相关创建入口受此限制时返回 complete=true 的空项。未来开放 draft 引用需另行实现，缺解析器/未恢复不是空 |

ResourceRef 使用真实 tenant，kind=session/run/agent_runtime，resourceId 分别为
sessionId/core-json(RunRef)/core-json(AgentRef)，version 为该记录修订或 incarnationId；
它们只是引用报告的边界投影，不新增业务身份/访问权。以上已发布引用的
blocksDiscard=false，不使 retire/disable/remove 默认 busy；TG 保留影响/下一准入
生效边界，原 Session/历史不级联删除，不强停已准入调用。报告给 TG 受信门保留
完整关系，对外对象/计数再按 SR 当前元数据权裁剪，不借资产管理权泄漏私人对象。

SR 的引用根由本 owner 的耐久事实/待确认候选和 attachment 账目生成，属于必需的
当前条件依据；不是可落后的查询 projection。每次引用增加/变化在其原同批
publishLogical 或 attachment 注册的同一门推进 referenceRevision；来源 stamp
为 provider generation 与 referenceRevision 的规范组合（满足治理 revision 的
OpaqueId 表达）。pending 引用增加立即可见，撤回仅在对应耐久/真实释放确认后
从集合消失；恢复从完整 SR 前缀和新 attachment 表重建，再给新的来源 generation。

TG 在 discard/retire/disable/remove 末门检查该 stamp；SR create/运行绑定则检查
同一原 TG acquisition/定义的当前 stamp。若 SR 新引用先占逻辑位置，TG 旧清单
必须重准备并报告它；若 TG 先停用/移除，SR 的旧创建候选不能随后借同版本其它
acquisition 通过。没有第二把互不相关的锁或通知后补清单。provider 缺失、重建
未完/异常失联为 unavailable/complete=false，不能当无引用；只有部署已封闭
全部 SR 引用创建且证明此范围不适用时，TG 才可按其已接受规则列为不适用。

## 控制、退出和恢复

| 动作 | SR 权限/状态、TL/HD 责任与继续条件 |
|---|---|
| interrupt | 立即关新 Step，持久 Run 中断阻塞；请求全部原自有调用（含以后开放的后台）停止。system_approval 随待批调用取消，question/agent_approval 若存在仍保留，答案不解除全局阻塞。真实安全收口后 interrupted，不自动重试工具 |
| resume | 仅原 interrupted 或存在可解除阻塞的 waiting，且无另一 Run 占位、终止意图、hold/当前资格阻断，核对中间历史/原位置；新 epoch/委托与 AR 许可同批。只解除列名可解除阻塞，不清 HD 待答，不重发 unknown |
| cancel | 同门封闭原 epoch 的新工作，保存不可恢复终止意图、关闭对应请求/继续权、请求原调用停止。收口期间 stopping，取得安全停止/有效隔离后 cancelled，迟到答案/结果不能恢复 |
| force_stop | 受理点立即撤销原 epoch 继续执行及有效结果提交；持 stopping。必须取得覆盖迟到 start/所有旧提交通道的停止/隔离证明才 cancelled(reason=force_stopped) 并释放占位；残留清理、外部 unknown/费用另存 |
| Session force_stop / hold | 精确捕获当前 Run 与所有应控制对象，和 hold 同批；无 Run 也可成立 hold。continueQueue 只解除明确 hold，不能释放 stopping 占位或恢复 cancelled |
| Agent close/owner close/退役 | AR 关新工作→SR 到耐久 checkpoint 停驻，保留 Session/Run/request/call→确认原执行 owner 接管及观察/控制独立→AR settle→真实 quiescent→封闭提交→按依赖释放；不自动等价用户 cancel/interrupt |

控制目标列表在门外准备后以 SR/TL 的当前根 stamp 同门核对；若另一个调用先准入，
必须重准备纳入它；若控制先逻辑生效，则后来的新调用失败。真正执行器 stop 的
异步传输不在短门内，必须消费已保存意图，并在其原账本先建立耐久取消墓碑。
start 在路上/inspect 暂空仍是未核实，不能发安全停止回执。成功终态先成立时
保留成功，控制记 ended；不要把每个收到 stop 的 call 重写为 interrupted。

即使业务 journal 当下不可用，运行宿主仍可同步封闭旧提交/启动通道并尽力停止；
不得报告耐久控制成功或丢失原责任。恢复未核实原 control/attempt 前不开新效果。
自关闭只返回受理，工作内部等待包含自己的排空明确 self_wait；外部宿主继续
等待。deadline 只终止等待，inspectExit 给出阶段、原资源、最近安全错误、可重试性。

独立 TL/HD owner 自始由长期宿主持有；若接管已确认，外部 unknown 可以留给原
owner，AR 仅释放观察资源，不必无限持有 Agent；未确认接管则原 AR 账目继续持有。
等待期停车须一次提交 checkpoint、epoch_parked/当前执行者封闭，然后实际退订；
晚到准备/订阅仍登记原尝试并清理。不能先减工作数再等接管回执，也不能把 Cordis
Fiber disposed 当作任意工具、I/O 或业务后代已停止。

恢复输入和重新开放条件见[持久恢复设计](../persistence/design.md#恢复顺序与开放边界)。

## 状态贡献、投影和可观测性

SR-13 的注册描述为 `{stateKey,scope,owner,kind:authoritative|projection,
schemaVersion,inputVersions,initialize,upgrade,withdrawPolicy}`，由真实贡献 owner
持有精确 registration/generation。Session 管 authoritative 的受限变更/依赖登记，
projection 管可重建 fold；同 scope/key 重复拒绝，不因版本字符串相同共用首份函数。
本批先实现自身具名状态及必要贡献协议，不开放任意 JSON patch/自定义状态服务器。

| 权威/派生 | 恢复与撤回义务 |
|---|---|
| Session/queue/Run/control/continuation 原事实 | SR authoritative，只有具名条件操作能变；缺 schema/reducer/required contribution 时依赖能力 unavailable，不能初始化空历史/无占位 |
| attachment、AR 工作/资源使用、当前 delegation | 对当前执行有权威性但不耐久；从原事实重新核实/取得，不用 checkpoint 复活权限；撤回先同门关新使用再收口 |
| 历史 surface、列表/过滤/队列展示、run 状态摘要 | projection/derived，输入版本+SessionRef+watermark+贡献 generation 明确；缺失从确定性 fold 重建。不得用旧摘要准入或给控制者额外正文 |
| checkpoint | 绑定 namespace、SessionRef、输入 kind/version、fold/schema 版本和完整源 Watermark；只能加速已验证前缀，越界/错 Session/版本未知则明确弃用并重建或 unavailable，不作为权限或恢复证据 |

初次为空只在真实“新建且无此状态”的事实下初始化。升级由 state owner 明确提供
可验证映射、保留原件与依据；无映射拒绝，不能 deserialize 失败后回默认。
authoritative 贡献卸载不删记录：先关依赖的激活/工作，排空或按声明 busy 拒绝；
重新装载先当前资格/版本校验，新注册身份不接受旧 disposer。projection 撤回只使
相应视图 unavailable，独立历史权限/原件仍由 SR；新 fold 不能重写原数据。

各运行 owner 注入 D-010 Diagnostics；`phase/code` 使用具名常量，关联既有
Principal/Causality/operation/AgentRef/RunRef/StepRef/Position、实际绑定及原尝试。
准备、准入、耐久确认、等待、控制、恢复和清理分别留阶段；正文/工具参数/秘密
不进入普通 log/span。短门只收集有限字段，门外输出，避免日志启动 I/O。
通知/诊断失败不改已耐久业务结果，关键业务审计失败按 CC-07 封闭效果。
本机共享 timer/服务初始化清空 initiator，从可信宿主创建，因果用显式字段传播；
ALS 不承担授权或资源排空。Cordis logger 桥仍沿 observability 的 O11 独立门，
缺桥不允许各包造另一份日志设施，也不要求等 P3 查询 UI 才运行最小节点。
