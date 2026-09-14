# P2 运行提供者与最小装配接口候选

状态：待审技术设计；尚未接受、尚未实现。基线 `61e732b979098f568ccd5d21d21939ff0c5036c4`。
首个提交 `947885c` 固定相邻消费键；本文完整候选补齐挂载、当前检查与保有责任。
接受技术设计、真实共享前提通过、产品符合性通过是分别记录的状态。

## 边界与输入

本稿只把已接受的 TG/AU/BG、AR/SR 逻辑接口映射到具体 Cordis 提供者和
`apps/local-harness` 的最小装配。沿用 [治理接口](governance-interfaces.md)
`058c77c`、[Session/Agent 接口](session-runtime-interfaces.md) `cd16f1`、
[共享接口](shared-interfaces.md)、[D-005](../../../decisions/D-005-agent-runtime.md)、
[D-007](../../../decisions/D-007-runtime-composition.md)、
[D-008](../../../decisions/D-008-core-capabilities.md) 与
[D-010](../../../decisions/D-010-shared-diagnostics.md)。逻辑端口、数据形状和状态机
保持原归属，本稿不复制第二套声明。

目标和验收沿 [scope](scope.md)、[最小运行基线](runtime-baseline.md)、
[acceptance](acceptance.md) 及 [plan](plan.md)；完整 M1/M2 仍未交付。
TL/HD/local-execution 由并行技术稿拥有，本稿只给它们可消费的相邻提供者。
维护规范、skills 和长期包设计归属继续由另一会话处理。

## 最小服务键与公开归属

下表是候选实现映射，所有新入口须由所属包在默认公开入口导出并实际验证。
现存 `/baseline` 入口不是目标应用的隐式后门；类型引用沿各包实际公开源码，
实现前本表只表达必须交付的符号与职责，不声称已有对应 TS 签名。

| Cordis 服务键 | 提供插件 / 默认公开入口所有者 | 服务内容与边界 |
|---|---|---|
| `omneDiagnostics` | 应用 `SharedServicesPlugin`；类型与 factory 归 `@omne-harness-lite/diagnostics` | D-010 的受限 `Diagnostics`；关闭/配置管理面只在应用宿主持有 |
| `omneAdmission` | 同一应用 `SharedServicesPlugin`；类型与 factory 归 `@omne-harness-lite/admission` | 唯一 `AdmissionCoordinator`，包含 `RecordPreparation`；不暴露 `AdmissionHost`、writer 或 `createUseIssuer` |
| `omneIdentity` | 应用 `IdentityPlugin`；身份消费协议由 `@omne-harness-lite/tenant` 默认入口声明 | 本机真实认证发行与当前检查，兑现治理稿的 `AuthenticatedInvocation`；不拥有成员、对象权或 grant |
| `omneTenant` | `TenantPlugin` / `@omne-harness-lite/tenant` | TG 已接受管理与资格端口；引用清单通过受信注册面进入，缺失不是空清单 |
| `omneAuthorization` | `AuthorizationPlugin` / `@omne-harness-lite/authorization` | AU 设置/grant/声明/四值判断端口；当前 Session、绑定、资源及一次决定事实分别注册，不 hard inject 反向依赖方 |
| `omneBudget` | `BudgetPlugin` / `@omne-harness-lite/budget` | BG 管理、联合预留与原 attempt 结算；可信费用来源按原 owner 注册 |
| `agents` | `AgentRegistryPlugin` / `@omne-harness-lite/agent` | AR 唯一 Registry、Factory 精确贡献与受限活体操作；沿用现有键，直接演化 fork，不并挂 baseline registry |
| `omneSession` | `SessionPlugin` / `@omne-harness-lite/session` | SR 已接受操作、attachment、委托/工作事实及引用清单；长期根不由临时 Agent Fiber 拥有 |
| `omneSessionProjection` | `SessionProjectionPlugin` / `@omne-harness-lite/session-projection` | SR 授权读取所消费的版本化派生视图；无独立正文披露权或准入权 |

不提供 `omneRecords` 服务键：records 是纯端口/codec 包，准备面已经由
`omneAdmission` 提供。受信恢复 owner 经自己的 factory/options 获得受限
`RecordReader`，普通业务/工具 body 不取得完整 reader 或 writer；这项装配
输入不伪装成另一种记录能力。`createJsonlProvider(options, diagnostics)` 和
`createAdmissionCoordinator(writer, diagnostics)` 的真实 factory 仍沿共享稿，
由应用调用一次后桥接受限服务，不把 codec/data 插件化。

TG/AU/BG/SR 的权威由各自 `createTenantHost`、`createAuthorizationHost`、
`createBudgetHost`、`createSessionHost` 创建；AR 由 `createAgentHost` 创建。
这些候选默认导出属于各自包。应用保有 host 的恢复/关闭管理面，操作插件只挂
受限运行面；同一个 host 可附着多个消费 Context，但不能创建第二份权威。
host 不是通用状态容器，各自仅能执行原稿具名状态转移。

`@omne-harness-lite/session-persistence` 导出候选 `recoverSession`，消费 reader、
同一恢复水位与 Session 的 decoder/fold；不增加 Cordis 服务或另一份持久提交。
Factory/驱动是向 `agents` 注册的贡献，没有额外全局 Factory 服务键。
scope 继续复用自有 `@omne-harness-lite/scope` 的协议；Context 可见性、scope、
Fiber ACTIVE 和 initiator 都不能发行认证、授权或工作许可。

各 host 的受信事实注册/参与者管理面只交给装配指定的 link 插件，不放在上述
普通服务表面，也不交给用户/工具。TL/HD/local-execution 可沿其 own state host
存续；AU/BG 失联时关闭新动作，原请求、调用、执行与清理仍归原 owner。

## 精确语义与实现状态

正式依赖均为 [catalog](../../../../spec/catalog.json) 已接受的 v1：
`data.agent-runtime-identity`、`data.core-work`、`capability.live-agent`、
`capability.tenant-governance`、`capability.action-authorization`、
`capability.budget-accounting`、`capability.session-run`、`capability.durable-records`、
`composition.agent-session-binding`、`composition.core-work-coordination`。
相邻 TL/HD 的正式 v1 约束其提供者；其技术稿需要共同对齐后独立接受。
TG-03、BG-05–07、完整模型/媒体、沙箱及分布式实施不在本稿开放范围。

逻辑 API 的精确语义直接定位治理稿“管理与消费端口”“公开端口与联合准入”和
Session 稿“AR：激活、附着与工作面”“SR：公开操作与一个实际 batch”。
本稿增加 host/插件/事实注册的实现映射，不改变其中的业务结果、事件 kind/version、
logical/durable 双视图或 prepare/check/submit 分工。
records 公开源码在 [records/src/index.ts](../../../../packages/storage/records/src/index.ts)，
数据在 [work-data/src/index.ts](../../../../packages/core/work-data/src/index.ts)；
P1 admission/jsonl 目标行为仍须真实交付。现有 agent/Session 公开入口只有
`/baseline`，不把源算法及其测试描述为 AR/SR v1 实现。

D-010 的 `Diagnostics` 消费面保持。新增诊断目录 owner 的 D1-R1 候选由独立
`observability-directory.md` 任务拥有；其创建/关闭接口尚待受审，本稿不复制或
将旧 `createLocalDiagnostics(options)` 视为最终创建方式。应用必须保有该目录
owner 及子来源残留的管理责任，依最终受审创建接口装配；这不改变业务审计归属。

## 权威、挂载与可用性的分界

每个协调域先取得唯一真实 writer/coordinator，再由受信应用分别创建一份
TG/AU/BG/SR/AR host。TG 等 host 内按 TenantRef 分区，AR 用规范 SessionRef
索引；租户分区不产生第二提交域。工厂不在请求/Agent/普通插件的 apply 中调用。
应用单次初始化保有固定 host 集合，重复启动同域初始化拒绝；各包还在其 factory
对同一 coordinator 的重复创建返回 `authority_already_bound`。这是同一部署、
同一公开包产物的防错，不能代替 OS writer 排他或跨进程协调。应用不得为第二
Context 再造另一份工厂/发号器。独立消费 Context 只接收原 host 的挂载能力。

| 对象 | 权威与存续 | Cordis 和释放关系 |
|---|---|---|
| TG/AU/BG/SR host | 自己的 logical/durable 根、原操作/候选、当前事实来源和恢复水位；AR host 拥有唯一活体/Factory/工作账目 | 应用的稳定资源责任持有到确认关闭；服务 Fiber 只拥有一次运行附着，不销毁根。不得输出可变根或任意 patch |
| 操作服务挂载 | 精确 host、mount generation、绑定的依赖和开放操作集合 | 插件 Fiber 拥有服务注册、普通订阅、未交接准备；消失使本代新调用 unavailable，旧引用不会追随新代 |
| Factory 贡献 | AR 所有精确 registration/generation/版本/解析范围及使用关系 | 贡献 Fiber 拥有注册和未交接准备；已交接实例资源属于原 AR 尝试，不能随贡献 effect 清空 |
| Agent 活体 | AR 占位和原 RuntimeOwner；SR attachment 只指向长期 Session | 每实例一个私有 `AgentInstancePlugin` Fiber；由稳定 runtime Context 挂载，绝非临时调用者/Factory 贡献的子插件 |
| 原 Run/工具/等待 | SR、TL、HD、执行 owner 各自拥有；AR 只保有所属工作和未确认移交 | 不以 Agent 子 Fiber 承载独立 TL/HD/执行状态；退出时逐项确认保有/移交，不靠 Context 树推导业务父系 |
| Session projection | projection owner 的可重建视图/贡献代次 | 独立可卸载；原事实、当前对象权与准入仍归 SR |

本批每个 host 的默认公开工厂返回该 owner 专有的受限服务面、恢复安装面、
具名 link 管理面及关闭/检查面；类型分别归所属包，不新增共同 Host 基类/SDK。
关闭请求、等待、检查沿原 owner 的 pending/retained/完成结果，重复等待不能
重做关闭或覆盖原资源身份。应用只调用这些面，不亲自推进业务状态。

恢复安装只接收同一已验证 Watermark 下本 owner decoder/fold 产生的根与证据，
并由 host 核对安装身份/版本/水位；不是任意对象传入就可信。新建空状态也须从
真实新域事实认回。初始化失败保留所取得资源及诊断，不发布半恢复服务。
一个 owner 不可恢复时，依赖入口 unavailable；有完整安全前缀且已恢复的受权
历史读可以独立开放。不能以 projection 可读证明域已恢复。

### 具体 plugins、inject 与 effect

插件使用 Cordis 对象/函数插件的 `apply` 和 `ctx.provide`。工厂产物及恢复检查
先完成，最后才 provide；不先 `new Service` 立即注册再启动后台恢复 Promise。
每个包唯一负责自己的 Context 类型增强，新默认入口实际导出时消费同一类型；
类型增强不保证运行时已注册。表中 options 均由受信装配提供，不来自用户 JSON。

| 导出及归属 | required inject | options / effect 与可用条件 |
|---|---|---|
| 应用 `SharedServicesPlugin` | 无 | 注入实际 coordinator、Diagnostics；provide 两个受限面。reader/writer/发行器/诊断目录管理面留在宿主；effect 只撤挂载，后台关闭走有序协议 |
| 应用 `IdentityPlugin` | `omneAdmission`, `omneDiagnostics` | 应用 `createLocalIdentityHost` 的真实身份面；credential 观察/连接属于身份 host，不属于认证请求。恢复/凭据来源不可用不 provide |
| TG `TenantPlugin` | `omneAdmission`, `omneDiagnostics`, `omneIdentity` | 原 TenantHost；先恢复，再挂普通管理/资格。缺 SR/TL inventory 只关闭依赖完整引用清单的操作 |
| AU `AuthorizationPlugin` | 基础两键、`omneIdentity`, `omneTenant` | 原 AuthorizationHost；恢复设置/grant/声明。缺 Action/Decision/Session 当前来源则相应操作 unavailable，不等待这些来源才发布整个服务 |
| BG `BudgetPlugin` | 基础两键、`omneIdentity`, `omneTenant` | 原 BudgetHost；恢复所有已知/未知暴露、来源立场、period。来源尚未核实不能接受新预留；原计量收口由 host 持有 |
| AR `AgentRegistryPlugin` | 基础两键 | 原 AgentHost；目录/发号器准备后挂 `agents`。不 inject Session 或具体 Factory；相应访问/attachment/Factory 登记缺失时 activate/work unavailable |
| SR `SessionPlugin` | 基础两键、`omneIdentity`, `omneTenant`, `agents` | 原 SessionHost 的已验证恢复根、原状态贡献。AU 配置通过下列 link 进入；缺它可读/精确控制，不能领取依赖配置的新 Run/Action |
| SR `SessionTenantLinkPlugin` | `omneSession`, `omneTenant` | 两端具名管理能力；注册 SR ReferenceInventory，封闭已开放范围的“无来源默认空”路径 |
| SR `SessionAuthorizationLinkPlugin` | `omneSession`, `omneAuthorization` | 向 AU 登记 SessionFacts/ActionFacts；向 SR 登记 AU 当前配置面。失联只关对应设置/工作，不销毁 SR 根 |
| SR `SessionAgentLinkPlugin` | `omneSession`, `agents` | SR 实现 AR 的 RuntimeAccess/SessionAttachment；AR 工作/结算面回接 SR。未完成链接不能激活/驱动；已登记清理能力独立存续 |
| projection `SessionProjectionPlugin` | `omneDiagnostics`, `omneSession` | 获准源快照/变化输入与投影 host；effect 撤精确贡献/普通订阅。公开视图经 SR 当前披露检查；无第二 writer |
| 应用 `DeterministicDriverPlugin` | `agents`, `omneSession`, `omneTools` | 固定版本 Factory/Driver 的受管贡献；调用 SR/TL 已接受窄接口，无 append、直接工具 body 或模型请求 |
| AR 私有 `AgentInstancePlugin` | 无动态服务查找 | 仅 AR 用真实 ActivationPermit 和已准备的精确 attachment/driver/资源挂载；闭包捕获原绑定，全部工作仍经 SR/AR/TL 当前门。effect 持有原实例的一次有序收口，不能重新 resolve 当前同名服务 |

“基础两键”只指 `omneAdmission`、`omneDiagnostics`。Session persistence 的
`recoverSession` 是具名恢复过程，不是插件；它只用受限 reader 和 Session 公共
decoder/fold。projection 不能反向注入进 SR 形成循环，宿主将它的受限查询适配
登记给 SR，查询可用性与原状态就绪分开。

包依赖方向：TG 的接口不依赖 SR/TL；AU 接口依赖 TG/data，SR/TL/HD 实现其
窄事实；BG 接口依赖 TG/data，TL/执行 owner 实现费用事实；agent 声明自己的
Access/Attachment/Driver 协议，不 import Session。Session 消费 TG/AU/AR；
persistence/projection 消费 Session。运行 inject 先基础→身份→TG→AU/BG，
基础→AR，身份/TG/AR→SR；各 link/Factory 在其两端之后。没有回向的 required
inject。原业务交互双向，通过窄注册与共同 gate 实现，不把包依赖、注入依赖、
工作使用关系混成同一张图。

### 事实注册与瞬时失联屏障

以下新增候选注册符号与返回能力归消费方默认入口；它们承载治理/SR 原稿已经
固定的字段/current 义务，不另写 Action 或业务事实定义。

| 消费方管理面 / 来源 | 具体挂载与缺失结果 |
|---|---|
| TG `registerReferenceSource` / SR、TL | source kind + 已封闭的适用范围 + 精确来源代次；来源 `prepareReferences/checkReferences` 沿原稿。每种已开放来源必备；缺失 `unavailable/complete=false` |
| AU `registerSessionFacts` / SR | 沿 SR 的 `prepareSessionFacts/checkSessionFacts`、settingsUser/subjectDefinition/对象操作与 epoch。设置检查不经 SR 再递归求 AU；AU 自己求模式/grant |
| AU `registerActionFacts`、`registerResourceFacts` / TL、真实资源 owner | 原冻结 Action 的实际绑定/声明和对象硬资格/授予上限；准备在门外，check 只查原 owner 当前根，不反调 AU |
| AU `registerDecisionFacts` / HD | HD 原决定/消费状态与当前 grantorBasis；HD 不在 check 回调里递归调用 AU。组合者先分别准备，AU 同门核硬资格，HD 同门核原决定/消费 |
| BG `registerChargeSourceFacts` / TL、执行 owner，后续 MC | source 精确币种/价格质量/attempt/start/计量依据；缺失不能把金额设为零。原结算事实通道留在原来源 owner |
| AR `registerSessionProvider` / SR | RuntimeAccess/Attachment 及可用 generation；SR 的这些检查只查当前身份/TG/对象/attachment，不回调 AR activate/work |
| AR `registerFactory` / 实际驱动贡献 | 精确 factoryKey/scopeIdentity/implementationVersion 与私有 FactoryBinding；同解析键重复拒绝。原 slot 占用与退役检查都归 AR |
| SR `registerAuthorization`、`registerAgentRuntime` / AU、AR | 当前配置、工作许可/结算检查；SR 组合者调用，不由 link 代码拥有这些业务判定 |
| SR `registerProjection` / projection | 只读查询适配、输入版本/水位/generation；撤除使对应视图 unavailable，不清事实或授予读权 |

两端 link 由上表真实提供者包实现，应用只选择并传入该 link 所需管理能力。
注册结果绑定确切 host、source、registrationId、generation、运行挂载及适用范围；
返回精确 `retire/inspect/waitReleased` 受限句柄，重复 retire 认回原结果，旧 disposer
只能撤原登记。开放流程为门外准备两端→同一 coordinator.enter 检查双方当前
挂载→登记双方闭包/推进当前 stamp→门外通知。不能一端先 allow、再异步补另一端。
注册过程不写业务记录时不造 publication；实际业务记录仍由原具名组合提交者发布。
link 自己处于 LOADING 时可登记 held 候选和清理责任，但普通事实 check 必须等
双方及 link 的本代挂载 ACTIVE；这只是开放检查的一项条件，不在 apply 中假造
业务 ready。加载结束前失效则撤原 held 登记，不留下半开放的一端。

每个 link/提供者的运行附着都由原 host 记录**单调关闭**状态。应用在加载消费方前
安装稳定的生命周期观察，使用 Cordis `internal/status` 识别本次挂载退出，调用原
owner 的具名关闭入口，在同 gate 撤该代正向资格并推进 stamp。观察器只分派可信
owner 关闭，不做业务补写；其自身错误关闭该域新准入并保有诊断，不吞掉继续运行。
事件传入的 Fiber 可能是 traced proxy，内部身份以已登记的 canonical Fiber/精确
挂载能力认回，不用裸对象相等或可复用 uid 作为持久身份；只对受信 Cordis 对象使用
`symbols.original`，不对用户数据“脱壳认证”。

**不能只依赖 effect disposer 的第一行**：4.0.2 的 `_unload` 先安排异步清理，
Fiber 同步转为 UNLOADING 后，disposer 才运行。每次 prepare 的最终 check 因而还
核对原 host/mount/link 当前 stamp 与捕获 Fiber 的存活状态；任一端进入卸载、
依赖丢失、身份来源不明立即 unavailable。Fiber 存活只是实施依赖条件，之后仍
核对真实身份/TG/AU/SR/预算/精确许可。cached facade 不能跳过此门。
本批禁止在短门内调用 Cordis 装卸或任意外部回调；计划撤除先过原 owner 关闭门，
门外才动 Cordis。意外撤除即使早于观察器的清理，也不能用旧 snapshot 新准入。

生命周期 effect 负责撤服务/监听器和回收精确登记，不能把返回值当真实安全停止。
宿主保存独立关闭完成/retained 结果；等待被取消不影响原关闭。依赖回来生成新
mount/link generation，重新验证并注册，旧候选/一次决定/ExactUse/attachment 不复活。
已经准入的资源 pin/收口能力不受“新使用关闭”擦除，具体哪些旧结果还有效仍由
SR epoch/控制与 TL/执行停止事实决定。
实际资源的有序释放置于原 owner 的一个复合清理过程：先驱动静止，再退订和
释放资源；不得把这些有先后依赖的动作拆成 Cordis 的多个并发 async effect。
若该过程返回 retained，原 host 保留原清理函数/资源身份供 inspect/retry，重试
不需要在已 disposed 的 Context 上重新注册 effect，也不重新申请同一资源。

## 身份接入、恢复与最小运行链

应用 `createLocalIdentityHost` 负责本机凭据的验证、私有 issuance 表和当前凭据
修订；消费协议 `IdentitySource` 与 `AuthenticatedInvocation` 由 TG 默认入口
声明，其他能力不 import 应用实现。输入只有不可信凭据呈现，成功验证后才发行
绑定实际 Principal 的活对象，不能把命令行的 tenant/user/system 字段当凭证。
本批本机凭据由部署安装的、受 OS 访问权限保护的显式映射提供；未知来源、读取
失败、撤销或切换修订都关闭对应身份。精确凭据传输/CLI 实现由应用任务验证，
本稿不生成或读取任何凭据。

当前检查在同一 GateFrame 重认发行对象、实际 principal、credential revision 和
身份 host 可用性。凭据撤销/身份来源失联与业务 gate 同序，重启不复活旧 invocation；
仍有效凭据须重新认证。TG 才解释成员/引导权，SR 才解释对象操作与 RunDelegation。
可信初始化仅给治理稿列名主体/操作，不能由环境变量中的自报角色获得 seed 权。
内部派发由身份宿主发行受限系统调用依据，SR 再核原 Session owner、队首和派发
意图；“system”不等于不检查成员/定义/对象，initiator 也不是替代凭据。

1. 应用在无请求 initiator 的启动上下文创建诊断资源（依目录 owner 最终受审
   创建面），调用真实 jsonl factory、持锁取得 writer 和同步有效前缀，再创建
   唯一 admission。完整 writer/reader 管理能力留宿主；各 owner 只取得其所需窄面。
2. 应用分别创建 host，向各 owner 安装明确 decoder/fold/参与者版本清单。TG/AU/BG
   恢复原治理账目，Session persistence 校验 SR 同批关系并恢复同一水位，TL/HD/执行
   owner 校验原 call/request/attempt/停止墓碑。未知事件/坏前缀/缺必需贡献关闭依赖
   路径；没有所有 owner 完整恢复就不声称域完成。AR 目录为空，发号器使用新
   writerEpoch/启动命名空间；旧活能力全部失效。
3. 挂基础、身份、治理、AR/SR 操作与具名 link；每次提供服务前检查本 owner 恢复
   和服务成立所需注册，业务特定来源的缺失按上表逐操作关闭。TG 管理先通过真实
   initialize/create/draft/publish/acquisition，AU 通过真实 grant/设置、BG 通过真实
   source 立场/预算操作建前提，不直接 seed 内存表。应用才开放已满足条件的入口。
4. 真实用户创建 Session：SR 规范稳定 OperationInput，先 lookup 原操作，再 TG
   检查、SR 一批提交。新分配 ID 仅在结果/事件中；丢回执重试不会另造 Session。
   `agents.activate` 通过已注册 SR RuntimeAccess、当前 Factory 和稳定 RuntimeOwner
   在共同门预留唯一 AgentRef；异步资源在原尝试纳管后准备，末门核完整 binding
   并发布 ready。运行 Context 不携带正文权；activated 通知不能否决发布。
5. 用户 text 经 SR enqueue 耐久后，受限派发意图调用 takeBatch。SR/TG/AU/AR
   按原 `input_run` 一次门冻结队首、Run/epoch、WorkPermit；耐久 ready 后驱动才
   acquireNextStep 取得唯一 DriverClaim。确定性 Factory 选择只决定实现版本，
   不在构造时启动业务或改变原 DefinitionVersion/acquisition。
6. Driver 用 TL 公共窄入口提议工具，TL/SR 同批登记 proposed/原接续；Driver
   完整 return/yield 后才由原裁决 continuation 求当前 AU/HD/BG。allow 的一次
   `action_execution` 批包括全部真实 owner，耐久后 LE 才接纳原 attempt。deny
   回原 Step；ask 需真实 HD，否则具名不可用且无效果，不伪造批准或持久 grant。
7. LE/TL 原结果、BG 原 attempt/period 计量与 SR 原 continuation 依精确事实接回；
   SR 串行取得原 Step claim、结算，再决定新 Step。重启先查原 attempt，完成结果
   不重发效果，unknown 不按超时重试。工具与请求可由独立 owner 保有，Agent 可
   在确认 checkpoint/移交后释放。完整责任与原 S18 保持，应用不手写结果状态。
8. 正常停机先撤应用新请求/派发，再请求各 owner 关新准入/退役；SR checkpoint
   或精确控制、TL/HD/执行核实保有/停止、AR 等真实 quiescent 与资源释放。各原
   owner 的耐久后果完成后停止订阅/operation links，最后关闭 writer/释放锁和
   diagnostics 子来源/目录 owner。任何 retained 都保留精确原资源与重试入口；
   deadline 只终止等待，不能报告进程已安全退出。

## 丢失、替换与退出的明确责任

| 触发 | 谁立即封闭、谁保有与后续动作 |
|---|---|
| 身份/TG/AU 当前服务失联 | 捕获它的 mount/link current 检查与原 host 撤代屏障关相关新操作。TG/AU/SR/TL/HD 的耐久根不删除；已准入动作按原控制合同收口，失联不冒充用户 cancel |
| BG 失联/新预算下调 | TL/MC 联合新准入不可用/重新准备；BG host 留原暴露和迟到结算。currency/period/attempt 不因重载改归属，未知不能释放 |
| SR 操作挂载/必需 attachment 丢失 | AR 关闭使用该 attachment 的新激活/工作并请求原 driver 退役；SR host 保留 Session、Run、原 checkpoint/接续，TL/HD 独立保有工作。新代不得接管旧对象引用 |
| Factory 准备失败或被替换 | 未发布新贡献不能替代旧合法选择。已开始退役的旧 binding 不复活；AR 的 preparing/closing/releasing 始终占位，晚到资源归原 attempt。实例必需代码变化先退出旧实例，再以新 incarnation 激活 |
| 普通投影/可选未 pin 工具撤除 | 仅关闭相应新视图/选择；已 pin 工具由 TL/执行 owner 保护。不能为可选工具缺失无条件摧毁所有 Agent |
| 清理失败后挂新同名服务 | 操作 facade 可重新挂到同一保有 host，仅开放已经真实就绪的范围；不能新建空 host 抹残留。旧 Agent/Factory 的冲突占位、原 pin 与错误仍在；相同独占资源未释放则新准备 busy |
| P1 writer/admission 突失 | 所有依赖新提交/启动通道关闭。各 host 同步封闭旧 epoch/启动资格并尽力收口，保留无法耐久的意图/原回执 unknown；不报告 durable 或安全停止。需真实持锁恢复与全部 owner 核实后再开放 |
| 强行 Cordis dispose、旧 disposer 晚到 | 检查原挂载已失效，effect 只能碰原 registration。稳定宿主持有的关闭账目继续保有剩余 I/O/资源；Cordis 记录异常或 dispose resolved 不清该账目，不解除 AR 占位 |
| 宿主进程崩溃 | 运行句柄不可保留；真实 reader/fold 重建耐久责任，执行 owner 查询其原账本/外部事实。无法核实保 unknown，无持久依据不能自称原运行/清理成功 |

host 本身的实现替换比 facade 重挂更严格：先按依赖反序关新工作、排空所有
pending admission/publication、确认收口或具名移交，再冻结同一完整 durable
watermark；新 host 恢复并检查兼容，原 host 的资源/读写能力确认释放后才切换。
本批不提供“把可变根交给新模块继续写”的热迁移。旧 host 未释放或收口未确认
时拒绝第二权威；独立研究/新代私有准备可以继续，不发布可工作的新权威。

## 官方机制、fork 改造与验证边界

官方 [Service API](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/service.md)
支持具名服务和受管注册；[Services 教程](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-tutorial/03-services.md)
说明 inject 持续追踪、失联卸载/重现重载；
[Lifecycle 教程](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-tutorial/02-lifecycle-and-effects.md)
说明 effect 和多个异步清理并发。这些不保证业务授权、原工作收口或耐久性。

本次从固定 DSH URL 取得三篇官方文档与 `fiber.ts/reflect.ts/service.ts`；后三者
与既有官方 4.0.2 安装中的源码逐字节相同。`_updateState/_unload` 的先状态变化、
后异步 disposer，以及 reflect 的服务删除/依赖刷新是源码观察；实际发布 JS 的
三个有限机制探针覆盖延迟发布、卸载窗口、依赖恢复时旧普通引用仍存在。
原始源码、URL/哈希、脚本和失败/成功输出归本稿 [evidence](evidence/runtime-provider-design/README.md)，不据此推导完整发行物
等价或产品安全证明。未安装新产品库、未执行模型请求。

项目可直接修改自有 agent 的 Registry/Factory/dispatch、Session 的状态/fold、
persistence 与 projection 的恢复/贡献行为，来源及许可沿各包 provenance。
需要替换的旧语义包括：单字符串索引、裸 Agent/Session 权限、created 可否决、
无代次 Factory slot、内存 append/flush 冒充 DR、同 key 同版复用首个贡献。
有用的 scope 路由、initiator 隔离、事件快照和纯 fold 保留；官方 Cordis 包不修改。
保留原算法不等于保留绕共同门的 `/baseline` 应用路径。

## 跨包施工与验收

以下安排只在本稿和 TL/HD/执行稿共同接口受审、P1 真正组合通过后开放产品实施。
准确 TS 签名在各 owner 的默认公开源码建立并经真实消费者编译，不在文档复制。
第一步的声明可以无业务运行；它证明签名闭合，不替代随后行为验证。

| 顺序 / owner 与可写包 | 目标、实施输入与可观察验收 |
|---|---|
| R0 / 原 P1 owner | 真正 diagnostics（含目录 owner 最终创建面）、records、jsonl、admission 公开产物和组合；A05–08、同步 publication/撤销、恢复水位与真实锁先通过，业务只持窄面 |
| R1 / TG/AU/BG capability owners：各 `packages/governance/{tenant,authorization,budget}/` | 实现治理稿原状态和本稿 factory/plugin/具名注册；先真实管理/双视图恢复与非法来源 RED，再接当前身份/引用/Action/计量；A01–03/A11/A26 原 T/U/B 场景保持 |
| R1 / AR kernel owner：`packages/core/agent/` | 默认入口 Registry/Factory/RuntimeOwner/实例插件与私有账目，直接改 fork；先 S02/S03/S09 的重复/撤除/失败准备与真实资源反例，再接 Session attachment。不额外写 scope，确有缺口另报 |
| R1 / SR capability owner：`packages/session/session/` | 默认入口 host/插件、三个 link 与已接受 S01–S18 逻辑行为；先空/缺来源阻塞、真实恢复、唯一驱动，再同 gate 操作。AR 类型、TG/AU 消费端口在其原 owner 固定后消费 |
| R1 / persistence infrastructure、projection capability owners：各自原包 | 只读恢复同水位与版本化投影，复用 SR 公开 fold；S08/S10。不能实现另一 writer、从坏 checkpoint 默认空或开放未授权正文 |
| R2 / TL/HD/LE 原 owners | 消费双方共同受审的默认面及原事实管理 capability；实际 link/代次/当前撤销/原工作保有符合本稿。具体源码/接口由其技术稿唯一拥有 |
| R3 / application owner：`apps/local-harness/` | 真实 credential/固定 host 集合、上述挂载与确定性 driver；完成启动→文本→原 Step/工具结果→恢复→关闭，应用不补状态。根 workspace/锁/索引由整合者处理 |
| R4 / verification owner：被单独派定的应用组合测试 | 从独立公开产物、真实凭据、真实 journal 与文件效果验证下表；全部相关 owner 修自己的边界。M1/M2 与 A01–32 按实际覆盖对账 |

R1 各 owner 在已固定公开类型上可并行；依赖没有实现时可做不冒充 GREEN 的
编译边界/独立研究，不能使用 permissive 业务替身开放调用。每项行为按原 plan
RED→最小真实实现→GREEN→必要整理推进，不人为重写已经符合的 fork 行为。

| 验收切片 | 必须实际观察的反例；当前均未运行产品组合 |
|---|---|
| RP01 / A01–03/A11，S01/S15–17 | 两真实用户/租户同 ID；管理者无正文权，准备后凭据/成员/选用撤回；SR 新引用抢在 TG retire 前；inventory/SessionFacts 突失不能按空/默认 allow。重启仍认原 create 操作和原定义关系 |
| RP02 / A04/A18/A29，S02/S03/S09/S12 | 两 Context 同域并发 activate/挂重复 Factory、准备晚到、旧 disposer、Factory 新代失败、真实 timer/任务清理失败；只有一份权威，占位直至真实释放，旧句柄不控新实例 |
| RP03 / A05–09/A17，S04–07/S10/S14/S18 | 真实 fsync/回执阻断，Run/Step/工具 proposed/直接 deny 各窗口崩溃；全部 owner 同水位恢复，原 call/Step/claim 不复制，unknown 不重发，未耐久无文件效果 |
| RP04 / A17/A18/A29，S03/S06/S09/S12 | 在 Fiber 已 UNLOADING、effect 尚未执行的同一轮尝试 cached facade；TG/AU/AR/SR/link 各自失联/重现，P1 突失；新准入失败，旧原责任仍可查，物理停止或隔离未证实不释放 |
| RP05 / A26，BG 原 B1–B5 | limit10 下 unknown K7 再 finite U7/unknown K7 都拒绝，部分结算 C3+剩余4 保持7；USD-only 对 EUR 来源拒绝，明确对应立场才求所有同币预算；重载不改 attempt/period/currency，迟到计量唯一归集 |
| RP06 / A28，S10；D-010 | 在门内/门外观察诊断调用、普通日志失败与关键审计失败、通知重入/抛错；诊断不能覆盖业务回执，关键审计缺失封闭效果，记录原 owner/operation/Agent/Run/Step/绑定/水位和失联/收口阶段 |
| RP07 / A30–32，S13 | 独立 tarball 只用默认公开入口跑实际最小启动/工具/原结果/关闭；无 baseline 私有导入。声明编译通过但 writer/真实 I/O/身份未接入时仍未交付；覆盖未完成不得宣称 M1/M2 |

A28 责任：host 留具名恢复/失联/残留状态，操作 owner 留原业务结果和耐久审计，
诊断只投影安全关联与 phase/code，不写正文/凭据。日志故障不充当业务拒绝或
成功；原日志目录 owner 的剩余资源由应用保有。P2 原生 Cordis logger 桥、P3
受治理查询和全量保留沿 OB 的独立验收，缺桥不由各包自建 logger。

未决门：D1-R1 创建/关闭面由其原 owner 受审；本稿与 TL/HD/LE 的注册符号、
私有事实类型和生命周期须共同对齐并真实编译；P1/RP 产品场景尚未实现验收。
目前没有发现必须修改冻结 v1 的语义反例；旧 baseline 与目标不符是已知 fork
实施差异，runtime-baseline 中旧治理审阅状态不覆盖后续 `058c77c` 接受事实。
