# Agent 活体提供者设计

状态：`f98ac926` 提供者映射已接受为最小运行基线施工输入。
现有 [src/index.ts](src/index.ts) 与 [src/types.ts](src/types.ts) 是 `/baseline`
fork；目标默认入口及 AR/CB 产品符合性尚未交付。历史来源、采用范围与证据归
[原施工入口](../../../docs/proposals/core-capabilities/implementation/runtime-provider-interfaces.md)。

## 契约、身份与提供方式

采用 [identity v1](../../../spec/data/agent-runtime-identity/v1/contract.md)、
[AR v1](../../../spec/capabilities/live-agent/v1/contract.md)、
[CB v1](../../../spec/compositions/agent-session-binding/v1/contract.md)、
[CC v1](../../../spec/compositions/core-work-coordination/v1/contract.md)。目标逻辑
端口、ActivationPermit/WorkPermit 和精确退出映射见下文，来源为已接受的
[Session/Agent 历史输入](../../../docs/proposals/core-capabilities/implementation/session-runtime-interfaces.md) `cd16f1`。

默认公开入口 `@omne-harness-lite/agent` 拟导出 `createAgentHost`、
`AgentRegistryPlugin`、RuntimeAccess/RuntimeOwner/SessionAttachment/Factory/
Driver/Resource 消费协议与 `registerSessionProvider`、`registerFactory` 管理面。
目标签名由默认公开源码拥有，现有裸 create/Agent/Context/disposer 不进入目标应用。
内部 `AgentInstancePlugin` 仅由 AR 使用，不作为用户可挂的绕门入口。

AgentHost 拥有唯一规范 SessionRef→活体占位、Factory 贡献、原尝试/资源/工作
账目和发号器。应用在本域只创建一次，同一 coordinator 重复创建拒绝
`authority_already_bound`；多个 Context 复用原 host。两个租户相同 sessionId
分别索引，不能用字符串拼接；新 writerEpoch/启动命名空间与不回绕计数区分运行
身份，旧句柄不跨恢复。AR 不拥有 Session 历史、Run 队列或工具执行状态。

## Registry、Factory 与实例插件

| 提供者 | inject、挂载及效应 |
|---|---|
| `AgentRegistryPlugin` → `agents` | 只 required inject `omneAdmission`、`omneDiagnostics`，options 接原 AgentHost；目录/恢复前提检查后 provide。服务可查询受权状态；缺 RuntimeAccess/attachment/Factory 时 activate/work unavailable |
| Factory 贡献 | 由实际 driver 包/应用插件向 `registerFactory` 登记精确 factoryKey/scopeIdentity/implementationVersion，AR 发行 FactoryBinding；同解析键重复拒绝，不新增全局 Factory 服务 |
| 私有 `AgentInstancePlugin` | 无动态服务查找；仅 AR 在真实预留后，以原 ActivationPermit、attachment、driver/资源绑定挂到稳定 runtime Context。绝非临时调用者或 Factory 贡献的子 Fiber |

包依赖只消费 data/records/admission/diagnostics 与自有 scope 的公开入口；AR
声明所需窄协议，不 import Session/TG 实现。SR 的
[SessionAgentLinkPlugin](../../session/session/design.md#链接与当前资格) 实现访问/
attachment，并把 AR 工作/结算面回接 SR，避免相互 required inject。
Factory 的实际 inject 由其提供者声明；实例执行只用已捕获的完整原绑定，不逐次
ctx.get 同名新服务。依赖已 pin 后的工作存续责任与插件注入图分开。

`registerSessionProvider`/`registerFactory` 管理能力只交受信装配/贡献插件，
不暴露给 AgentHandle 或工具。两端门外 prepare，同一 gate 查精确 host/mount/
registration/generation 与范围后建立 held/可用关系；未完成初始化不能正向用。
原 `retire/inspect/waitReleased` 只匹配原登记，旧撤回器不能删除新贡献。

## 当前资格与资源所有权

Registry/贡献/实例的受信 apply 捕获 `c.fiber` 和本次 mount generation，
ctx.plugin 返回的 PromiseLike 外壳仅供 await/dispose，不能靠其 uid 或
symbols.original 认回 status 中的真实实例。宿主观察先分派本 owner 的关闭
入口；最终 gate 检查 mount/link 与所有必要 provider 的原代次/存活，再检查
当前 RuntimeAccess、Session attachment、Factory/资源和 Run epoch/WorkPermit。
同 Fiber 重载进入 ACTIVE 不恢复旧闭包；消费者仍 ACTIVE 也不能掩盖 provider
已失效。Fiber 存活只是一项依赖条件，不认证或授权。

激活严格先共同门预留唯一 AgentRef/登记 RuntimeOwner 清理责任，再私有准备
attachment/driver/资源，末门复核并发布 ready；preparing/closing/releasing 都
占位。原尝试接回准备晚到结果，不能以超时当没有分配。准备/发布不自动开始
业务；SR 原 input_run/Step 准入才形成工作许可，耐久 ready 后驱动取得工作。
由应用从唯一 AdmissionHost 给 AR 一份 `createUseIssuer("agent")` 的发行能力，
AR 真实扣住资源后形成 ExactUse；它不把发行器再交给其他 owner。

RuntimeOwner 是稳定宿主的实际关闭能力，独立于 Session.owner、业务 parent、
调用 Context 和 initiator。scope 路由/ALS 只作可见性与归因；共享 timer/服务
初始化在无请求 initiator 的宿主上下文创建。activated 事实发布后才有序通知，
同步异常/异步拒绝隔离并诊断，重入 close 可以使返回句柄已 closing，不否决发布。

## 装载效应与退出

| 装载建立的效应 | 撤除动作、完成判据与保留事实 |
|---|---|
| Registry 服务与普通观察 | 原插件撤自己注册；host 的活体/退出账目不随 facade 消失，旧 facade 不跟随新 mount |
| Factory 注册/未交接准备 | 先关原贡献新使用，失败新代不替代旧合法选择；晚到准备仍归原 attempt。已经交接给实例的资源不由贡献 disposer 清掉 |
| 实例 attachment、driver、订阅/timer/必要资源 | AR 关新工作→SR 耐久 checkpoint/封闭原 epoch，TL 等确认保有/移交→AR settle→driver 真实 quiescent→封闭提交→按依赖释放，完成后才释放 SessionRef 占位 |
| 工作 pin 与未移交后代 | SR/TL/执行 owner 给出真实结算/接管证据；未知移交留在 AR 账目，不能先减工作数再等回执。独立 TL/HD 状态不会因 Agent 退出删除 |

实例资源的必要顺序置于一个复合清理过程，不拆成多个并发 async disposer。
若失败返回 retained，host 保留原清理函数/资源身份、最近错误和可重试性；
retry 不在 disposed Context 重新申请资源。关闭请求共享同一次过程，取消等待/
deadline 不取消关闭；自等待明确拒绝，由外部宿主继续等。

计划替换先关新使用并真实排空/合法移交，再卸载必要提供者；清理失败不能换
同服务名抹占位。突发失联时 current 门先拒绝新工作，原责任继续收口；P1 不可用
不宣称持久控制成功。外部 unknown 可以由原独立 owner 确认接管，AR 才释放观察
资源；未确认则 retained。force_stop 的结果隔离仍由 SR/TL 原控制合同判断。
host 本体替换须原账目/资源释放及同水位恢复，不建立第二权威热迁移。

## 源差异与实施门

官方 Cordis 固定 4.0.2；自有 fork 来源 `c291e7961a515f6d7af9304e7fd1d257929aef26`
沿 [provenance.json](provenance.json)。直接演化单字符串索引、裸访问、created
可否决和无代次 Factory slot；保留有效 scope/initiator/快照算法，不修改官方包。
[有限机制证据](../../../docs/proposals/core-capabilities/implementation/evidence/runtime-provider-design/README.md)
观察了延迟发布、disposer 异步窗口及旧普通引用残留，不证明产品生命周期。

真实 P1 及 SR 消费端口固定后，按 S02/S03/S09 和 allow 基线 A04/A17/A18 的
实际依赖切片推进：双 Context 并发激活、准备后失权/晚到、必要服务突失、旧
handle/disposer、清理失败后替换、关闭后同 Session 新激活。观察真实任务/timer/
资源归零或逐项 retained，不能以 Fiber disposed 或 Map 清空通过。当前未运行。

## 实施协议的采用来源

下列状态、记录、端口和算法从已接受的 `cd16f1` Agent/Session 输入迁入，
迁移源快照为 `7e758f21f8f92c1d46fab194fdaf120239b8e11c`。
原稿只保留受审/接受和取舍历史；本页拥有所列当前提供者设计，语言无关承诺
仍归所采用的精确 spec。接口记法不等于已经存在或发布的产品 API。

## 活体审计与通知

AR 的阶段、attachment/pin/订阅/工作许可为运行权威，不从上述 SR 日志复活。
AR 操作审计另以 owner `agent` 的 tenant 审计 stream 保存
`agent.operation_recorded/1={agent,operationKind,phase,reason,relatedOperation}`；它是
已观察生命周期的审计，不是重建活体目录的指令。激活的准备资源无业务执行权；
ready 发布后在门外保存关键操作审计并分发有序 activated；通知不作为审计回执，
AR 在该激活审计耐久前保持工作面不可用，不允许监听器先启动业务。审计
失败不撤销已经成立的 ready：结果明确 published_but_audit_unavailable，封闭新工作，
保留原句柄/退出责任并收口；重试查询原尝试，不新建一次激活。关闭先同步关门，
随后记录；审计不可用不能阻止安全清理，不能假称审计已保存。通知在 ready/退出
提交时登记原序号、门外逐实例有序分发，审计晚到不会使 disposed 超过 activated。
AR 生命周期本身仍没有跨崩溃 activate 幂等承诺；源/结果丢失按精确 attempt 查询，不能盲重试。

## AR：激活、附着与工作面

以下协议由 agent 声明其消费要求，Session/Factory/资源 owner 兑现；不是新包。
“候选”皆属原提供者私有对象，门外准备得到；数据快照附不可变 stamp，任意
结构仿造无效。所有 check 为同一活动 GateFrame 内的同步纯检查，返回
`ready | prepare_again | denied(code) | unavailable(owner,code)`，不调用 resolver/I/O。

| 端口 | 输入、结果与线性化义务 |
|---|---|
| RuntimeAccess.prepare/check | 原适配绑定的调用者、精确 SessionRef/AgentRef、操作 → 私有候选；check 同门核验当前身份/TG/SR 对象权，目标或操作不同不得复用。AR 内不另缓存 allow |
| RuntimeOwner.registerAttempt/closeAdmission | 由稳定宿主持有；预留前登记 AgentRef/清理责任，close 在同门封闭新尝试。对象不是 ownerId 字符串；调用者取消等待不撤销登记 |
| FactoryRegistry.select/prepare/check | `{factoryKey,scopeIdentity,implementationVersion}` → `{registrationId,generation,exactVersion,scopeIdentity}` 的精确 FactoryBinding 和私有资源准备；同解析键重复拒绝，缺版本不 fallback |
| SessionAttachment.prepare | 仅真实 ActivationPermit、精确 SessionRef/选择 → `Attachment`；本批 SR 从已恢复内存根同步建立 held 登记，异步恢复在 activate 前由宿主完成。可替换提供者若异步分配，先登记原 attempt 再 await，丢回执须可 inspect/release 原登记 |
| SessionAttachment.checkActivation | 同门核对 held、原 AgentRef、provider generation、Session 原 DefinitionVersion/acquisition 身份、TG 当前原选用及配置适用性、open、当前资格/恢复兼容 stamp；stamp 不含无关标题/历史追加。revoked 永不变回 held |
| SessionAttachment.release/inspect | 精确 attachmentRegistrationId → released / retained(diagnosticId,remaining)；不归档、不取消 Run、不删 Session。旧释放不能匹配后来 attachment |
| RuntimeResource.prepare/check/pin/retire | 真实资源先登记给尝试；check/pin 与 retire 共用门，绑定 owner/registration/generation；实例必需、操作必需、可选用途明确。pin 不做 I/O，发行 ExactUse 由资源原 owner 执行 |
| Driver.requestRetire/awaitQuiescent/releaseResources | 前者只关新工作，后两者返回实际 `quiescent` / `blocked(remaining)` 与 `released` / `retained`；不会把 AbortSignal、清空表或超时作为完成 |
| AgentRegistry.activate/lookup/resolve/close/inspectExit | activate 只消费既有 Session/精确 selection/owner/access；返回原 AgentRef 的 preparing/ready/closing 描述和受限句柄，或 conflict/inaccessible/unavailable。lookup 受权描述，resolve 仅精确 AgentRef；close 受理同一次退出，等待取消只结束该等待者。句柄不含 ctx/原 Agent/factory/disposer |
| AgentRegistry.prepareWork/checkWork/pinWork/settle | 绑定精确 AgentRef、RunRef/epoch、整份实际装配、真实 RuntimeAccess；SR 的 input_run/epoch_replaced/step 准入在同门使用。一个 WorkPermit 覆盖该 Run 在本实例的整个执行 epoch 及未移交后代，不按底层函数重取配置 |

WorkPermit 初始随真实 AR pin 被候选扣住；SR 记录 requiredUses 时使用
`{recordOwner:"session",binding:{owner:"agent",resourceId:canonical(AgentRef),
generation:incarnationId,epoch:runEpoch}}`，pin 的私有表另绑定 Factory/必要资源完整
版本。它不是从这份 UseBinding 构造权限。AR 的 ExactUseIssuer 由 AdmissionHost
只交给 AR 一次；生命周期由共享接口的单次 claim/release 协议封闭。

`checkWork` 也用于每个 Step/工具联合准入，校验原许可仍属当前实例/Run epoch，
不再次 claim 同一 ExactUse。不产生 AR 耐久记录的纯资源检查不伪造 agent publication；
requiredUses 的 recordOwner 是实际记录该许可关系的 session。新工具资源另由
TL/执行 owner 持有，不能复用 AR pin 代替工具绑定。工作结算须 SR 确认安全停驻/
终态及全部 AR 后代结算或具名接管；未知分配/未确认移交返回 retained。
AR 另给原 SR 收口者 `checkSettlement(frame,permit,run,epoch,kind)`，只允许 closing
阶段的 checkpoint、原已准入结果、停止/具名接管确认，SR 同时核对自身 epoch/控制
规则；releasing 后拒绝运行结果提交。它不能取得新 Step/工具准入，也不因用户撤权
失去必要清理资格。force_stop 后结果走原事实隔离通道，不能用收口能力绕过撤销。

激活返回/查询另含 `publication:unpublished|published`、`audit:pending|durable|unknown`、
`reason` 和有权可见的 remaining；失败准备若清理未完成仍返回原尝试/inspectExit，
不能只 throw 并遗失资源。AgentHandle 仅允许 inspect、requestClose、waitExit，
每次普通操作经 RuntimeAccess 当前重检；宿主另持原 cleanup capability。内部
WorkPermit 不能从 AgentHandle 转出给用户或工具 body。

激活过程固定：同门当前访问/owner/Factory 检查→预留 SessionRef 与新 AgentRef→
门外私有准备 attachment/资源/driver→同门复核全部 stamp 并一次 ready 发布→
门外审计/有序 activated 通知。资源建立前原尝试已经持清理权，失败/晚到准备归
同一尝试；preparing/ready/closing/releasing 均占位。发布通知可重入 close，
同步异常/异步拒绝单独隔离；activate 返回时句柄可能已 closing，通知不否决发布。

只有受信宿主持一份 Registry 状态；多个 Cordis Context 注入相同受限服务，不能
各构造一份独占表。实例存续必需 binding 撤除先同步关新使用/关闭使用者，再等
真实排空后卸载 Cordis；可选工具一旦被某工作 pin，由 TL 的在途政策保护，不
因此关闭所有 Agent。意外失联封闭相关门并报告原责任，依赖恢复不复活旧尝试。
