# Agent 活体提供者设计

状态：受审 `5ffba4b` 的当前提供者映射迁移候选，尚待接受。
现有 [src/index.ts](src/index.ts) 与 [src/types.ts](src/types.ts) 是 `/baseline`
fork；目标默认入口及 AR/CB 产品符合性尚未交付。历史来源、采用范围与证据归
[原施工入口](../../../docs/proposals/core-capabilities/implementation/runtime-provider-interfaces.md)。

## 契约、身份与提供方式

采用 [identity v1](../../../spec/data/agent-runtime-identity/v1/contract.md)、
[AR v1](../../../spec/capabilities/live-agent/v1/contract.md)、
[CB v1](../../../spec/compositions/agent-session-binding/v1/contract.md)、
[CC v1](../../../spec/compositions/core-work-coordination/v1/contract.md)。目标逻辑
端口、ActivationPermit/WorkPermit 和精确退出规则沿已接受
[Session/Agent 接口](../../../docs/proposals/core-capabilities/implementation/session-runtime-interfaces.md)
`cd16f1`；本文不重写状态机。

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
