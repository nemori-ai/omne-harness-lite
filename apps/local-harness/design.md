# Local harness 装配设计

状态：`f98ac926` 装配映射及消歧已接受为最小运行基线施工输入。本目录现有
[workspace 成员](package.json)及 [P1 存储/准入组合测试](tests/storage-admission/real-composition.spec.ts)，
尚无目标应用源码、启动入口或 Agent/Session/工具真实运行闭环。来源与迁移记录归
[原施工入口](../../docs/proposals/core-capabilities/implementation/runtime-provider-interfaces.md)。
采用 `1368c52b7255e16e9c2fcde30eebca6f870679f7` 的
[最小运行节点选择](../../docs/proposals/core-capabilities/implementation/runtime-baseline.md)：真实身份→Session/Agent→text/唯一 Run→真实授权与
本地预算→多命令文件工具的一次 allow→原结果、恢复与关闭。驱动确定性，
完整 HD、M1/M2、模型费用与扩展平台后置；ask 未交付时必须明确不可执行。

## 可依赖的行为

同一真实本机装配通过公开入口完成：认证主体创建 Session → 激活 Agent →
受理文本并形成唯一 Run → 装载有权限声明的多命令文件工具 → 按当前授权和
本地预算准入一次已获授权的调用 → 实际执行并把结果保存回原 Session/Run。
驱动是确定性的，不依赖模型；存储、权限、预算和执行者使用产品实现。

| 交接门 | 必须实际观察的结果 | 沿用验收范围 |
|---|---|---|
| 共享运行基础 | 公开包产物可独立消费；真实 JSONL/共同准入、双视图及诊断输出已组合验证 | A05–08、A28、A30/31 的相应子场景 |
| Agent 与 Session | 两次激活/取批不产生双实例或双驱动；文本、Run 与结果可查询；关闭后重新附着同 Session；旧实例引用不能操作新代 | A04/A09/A17 的相应子场景 |
| 工具定义与执行 | 定义自声明随装载进入索引；命令参数完整校验；真实 allow 调用写入部署控制目录并返回结果；无权限、跨租户、未知声明不能执行 | A01/A10/A11/A19、A26 本地子场景 |
| 恢复与责任 | 宿主重启认回 Session/Run/call 和已完成结果，不重复产生文件效果；未确认的执行不假称成功或重新发出 | A08/A17/A19 的相应子场景 |
| 新会话接入 | 从固定提交安装、构建，运行文档中的实际命令；独立消费者能从公开入口定义工具、提交文本、查询结果 | A30–32 的相应子场景 |

第一条调用使用通过真实管理入口建立的授权。若交接时系统审批路径尚未完成，
涉及 ask 的调用必须明确不可执行，不能静默放行、伪造用户批准或冒充 M1 的
持久 HITL。实际验收分别列出可用与未开放路径；双入口审批、多请求独立接续及超出基线的
控制/动态/故障场景属于原 M1/M2，不能从本基线推导其已交付。

## 提供者选择与公开来源

应用只选择、配置、装配和调用所属能力，不拥有其状态转移；精确公共签名归
实现后的默认公开源码。现有 `/baseline` 不进入目标应用。

| 选择 | 当前映射正文与应用传入的资源 |
|---|---|
| TG / `@omne-harness-lite/tenant` | [Tenant](../../packages/governance/tenant/design.md)：本域唯一 TenantHost、受限身份协议和指定 link 管理能力 |
| AU / `@omne-harness-lite/authorization` | [Authorization](../../packages/governance/authorization/design.md)：原 AuthorizationHost、真实资源/Session 事实源 |
| BG / `@omne-harness-lite/budget` | [Budget](../../packages/governance/budget/design.md)：原 BudgetHost、实际本地来源立场和计量接口 |
| AR / `@omne-harness-lite/agent` | [Agent](../../packages/core/agent/design.md)：原 AgentHost、稳定 runtime Context、单次绑定到 owner=agent 的 ExactUseIssuer |
| SR / `@omne-harness-lite/session` | [Session](../../packages/session/session/design.md)：原 SessionHost、已验证恢复输入及三类 link 两端的管理能力 |
| SR 恢复 / `@omne-harness-lite/session-persistence` | [persistence](../../packages/session/persistence/design.md)：真实受限 RecordReader、同域水位与 Session decoder/fold，无插件/额外 writer |
| SR 视图 / `@omne-harness-lite/session-projection` | [projection](../../packages/session/projection/design.md)：获准源快照/订阅输入；只读适配回接 SR，应用不开放未经 SR 授权的视图 |

TL/HD/LE 提供者由其原作者唯一维护，当前共同消费快照为
`0a6e91ea643497f309f1a69f8adecc8a98751df3` 下的
[tools](../../packages/tools/tools/design.md)、
[human-decisions](../../packages/governance/human-decisions/design.md)、
[local-execution](../../packages/tools/local-execution/design.md)。正文已合入；
这里不复制它们的服务/状态协议。allow 基线选真实
TL 和 LE，完整 HD 可不挂，但缺席不能让 ask 绕行 allow。

P1 沿 [JSONL](../../packages/storage/jsonl/design.md) 与
[Admission Gate](../../packages/coordination/admission/design.md) 的当前映射选择
`createJsonlProvider(options, diagnostics)` 与 `createAdmissionCoordinator(writer, diagnostics)`；
两者产品仍待交付，纯 work-data/records 不插件化。
Diagnostics 消费面沿 [D-010](../../docs/decisions/D-010-shared-diagnostics.md)，
目录 owner 采用 `e2190ad` 的
[D-011](../../docs/decisions/D-011-diagnostics-directory-ownership.md) 与
[包设计](../../packages/observation/diagnostics/design.md)。应用按唯一目录 factory
创建并保有目录/子来源；D1 已按[成员证据](../../packages/observation/diagnostics/evidence/directory-owner/README.md)
接受，应用只消费该目录 factory。真实 JSONL/admission 和应用组合仍未交付。

## 身份与宿主装配

应用拥有 `createLocalIdentityHost` 与 `IdentityPlugin`。`omneIdentity` 的消费
协议由 TG 默认入口声明：部署安装的、受 OS 权限保护的显式本机凭据映射经
真实验证后发行 AuthenticatedInvocation，私有表绑定 principal、credential
修订与可用性。用户/CLI 只提交不可信凭据呈现，不能自报 tenant/user/system
变成身份。传输/CLI 的实际凭据安全仍须在应用任务验证；本设计不读取任何凭据。

当前 inspect 在同一个 GateFrame 重认原对象、主体、凭据修订和来源可用性；
撤销/切换/失联与业务 gate 同序，旧 invocation 不跨重启，仍有效凭据重新认证。
TG 解释 seed/成员/定义权，SR 解释对象与 RunDelegation；系统派发身份只配合 SR
登记的原 owner/队首意图，不产生全权。initiator/Context/scope 均不作为凭据。

| 应用插件 | required inject 与 effect |
|---|---|
| `SharedServicesPlugin` | 无；受信 options 持实际 P1 产物，仅 provide `omneAdmission` 和 `omneDiagnostics`。服务 effect 只撤本次挂载，writer/锁/诊断目录最终关闭由宿主有序调用 |
| `IdentityPlugin` | `omneAdmission`,`omneDiagnostics`；凭据来源与私有 issuance 表已就绪才 provide `omneIdentity`。本次服务/监听归插件，凭据连接/撤销状态由身份 host 保有，失联关闭新认证和旧调用依据 |
| `DeterministicDriverPlugin` | `agents`,`omneSession`,`omneTools`；向 AR 注册固定版本 Factory/Driver，调用 SR/TL 窄进展/工具接口。贡献 effect 只撤原注册/未交接准备，已交接实例资源归 AR，不运行模型或直接工具 body |

不存在 `omneRecords` 服务：RecordPreparation 已由唯一 coordinator 提供，完整
reader/writer/AdmissionHost/诊断管理面只在受信宿主持有。各 owner 按需得到窄
reader 或自己的 ExactUseIssuer；应用不发行任意 owner 的使用给业务/工具。

应用在真实 writer 持锁后单次初始化固定 host 集合，所有消费 Context 共用原
host；不能在请求、Agent、普通插件 apply 再调用 host factory。包自身的重复
创建防错不代替这个单一装配和真实 OS 排他。状态权威的本体生命周期与可重挂
服务面分别管理，application 不直接修改任何 owner 根。

## 挂载顺序与生命周期观察

服务具体 keys/inject 由上表各包正文拥有。应用先挂 P1 基础→身份→TG→AU/BG，
基础→AR，身份/TG/AR→SR，再挂 SR 两端 link、TL/LE 及其 link、确定性 Factory。
SR 与 AU/AR/TG 的双向业务关系只经具名注册，不反向 required inject；projection
晚于 SR，受限查询适配回接。包依赖、Cordis 注入和业务工作依赖分别按这些正文核对。

恢复前不调用会立即发布未就绪对象的 Service 构造；操作插件在原 owner 恢复/
参与者初始化后最后 provide。业务特定来源缺失则对应操作 unavailable，可以
保留独立受权读控；不能先暴露 allow、再异步补需要的事实源。

应用在消费者前安装稳定的 `internal/status` 观察，分派到各 host 自己的关闭
入口，只触发它们同 gate 封闭原代次，不补业务状态。每个受信 apply 登记真实
`c.fiber` 与本次 mount generation；ctx.plugin 返回的 PromiseLike 外壳只用于
await/dispose，不能凭 symbols.original 或 uid 当它等于 status 中的实例。
同一个真实 Fiber 重载也必须新建 mount generation。

观察不是唯一许可依据：较早监听器可能重入，consumer 仍 ACTIVE 时 provider
可能已失效，各 owner 最终 check 必须直接核原挂载和所有必需 provider 当前
存活/代次，再核真实身份、授权、预算和业务许可。effect 清理在 microtask 后
开始，不能只靠 disposer 第一行关门。应用自己的身份/Factory 挂载也按此方式
检查；不能把 Fiber ACTIVE 当工作资格。短门不调用 Cordis 装卸/任意外部回调。

上述外壳/重入/代次观察沿工具作者固定 `0a6e91e` 的
`evidence/tool-decision-design/cordis-current-window-output.json` 和源码核对；
本次复用，不重跑无变化机制。[原三组机制证据](../../docs/proposals/core-capabilities/implementation/evidence/runtime-provider-design/README.md)
仍只支持内核时序，不证明本应用的当前检查已实现。

## 启动、结果与停止责任

1. 无请求 initiator 的启动上下文创建实际诊断资源，调用真实 jsonl factory、
   持锁扫描/重新同步有效前缀，再创建唯一 admission。各原 owner 在同一水位
   完成 decoder/fold/相关版本与参与者恢复；AR 从空目录建立新运行发号器。
2. 实际身份/治理恢复后按上节挂载。通过 TG 真实初始化、定义发布/选用，AU
   grant/设置、BG 来源立场/预算管理建立前提，不直接预置业务 Map。坏前缀/
   未知必需事件/原 attempt 未核实的依赖路径不开放；ask 未提供则不可执行。
3. 用户 create/enqueue、AR activate、SR takeBatch/acquireNextStep 全部走各包
   默认公开面。SR 与 AR 的共同门保持唯一 Session/活体/Run/claim；耐久 ready
   后才交 driver，应用不启动未确认工作。稳定 OperationInput 认回丢回执的原操作。
4. 确定性 driver 经 TL 提议，TL/SR 原 proposed/continuation 联合耐久；原 claim
   return/yield 后再裁决，AU/BG 与 TL 的 action_execution 一批成立，LE 才按原
   attempt 实际写文件。结果回原 Step/Session/Run，BG 留原 period/attempt 计量，
   SR 决定接续/结算；应用不补写结果或假装用零费用替身完成预算。
5. 重启查原调用/执行账本，已完成结果仅重新交付，不重复文件效果；unknown
   不重发。当前身份/TG/Session 资格与新 epoch/AR 许可重新成立后才继续。
6. 退出先撤应用新请求/派发，再调用各 owner 关准入/退役。SR checkpoint/原
   控制、TL/LE 停止或确认保有、AR quiescent/资源释放按所属协议完成；这些
   有序动作不拆成并发 async disposer。原 owner 尚 retained 时宿主保有原清理
   句柄，取消等待/deadline 不表示关闭成功。最后才关闭 writer/锁及 diagnostics
   子来源/目录 owner；后者不得早于其未完成写入/扫描/清理。

计划替换先由原 owner 收口，再实际卸载；突发失联关闭相关新门，原工作/迟到
事实仍由原 owner 保有。facade 重挂不建空 host；host 本体替换只在原责任释放/
合法移交、完整 durable 水位冻结及新恢复核实后切换。主进程崩溃不保留运行
对象，恢复从耐久责任核实，无法判断不报成功。

## 验证与停止点

真实 P1 存储/准入与 D1 组合已在固定 HUB
`31197742905a3c66fc3e650c153d65d014372c21` 按
[实际组合证据](evidence/storage-admission/README.md)接受。应用仍待上述运行提供者、
TL/LE 默认产物与最终运行组合交付；P1 测试不代表五门闭环已形成。
实际验收引用[A01–A32 原场景](../../docs/proposals/core-capabilities/implementation/acceptance.md)中
A01–11/A17/A18/A19/A26 本地/A28–32
相关子场景：双凭据隔离、唯一激活/取批、当前撤权、真实文件效果、原结果恢复、
预算并发/unknown、关闭与旧引用、新会话独立产物消费。诊断记录安全关联与
phase/code，关键审计由业务耐久提交，普通日志失败不覆盖业务结果。
当前最终运行闭环组合测试尚未运行。交付证据须固定可运行提交、命令、未开放路径与
残留责任；完整 HD、M1/M2 和扩展功能不包含在本基线范围。

## 运行映射的命题与前提

本节沿 `f98ac926` 已采用协议记录 F3 的证据适用性。独立只读判断对象为
`976149b`，原返回及逐文件身份见[评审证据](evidence/runtime-mapping-applicability/README.md)。
本次没有重选机制；以下是 CB-03/06/07/10–14、AR-8/10–16 的既有命题和控制
位置，当前符合性仍待真实提供者与本应用组合验证。

| 命题 | 强制位置与前提 owner |
|---|---|
| 新发布/工作不能穿过原必要依赖的失效点 | AR 联合发布/工作门与 SR 具名准入直接核原 mount/link/provider；身份/TG/AU 等事实由各自 owner 当前核对。应用登记真实挂载并限制受信组合的调用；[admission](../../packages/coordination/admission/design.md)拒绝重入/异步 frame，owner 的纯 check 不调用装卸或任意回调 |
| 重新挂载不能复活旧许可 | AR/SR 及实际贡献 owner 绑定真实 Fiber、精确 registration 和新的 mount generation；原代关闭单调，原 attachment revoked 不回 held。应用重挂服务面复用原 host，不能用新同名服务或再次 ACTIVE 复活旧闭包 |
| 原清理只作用原登记，责任未解除前保留占位 | AR 保有原尝试/工作/资源与 SessionRef 占位，SR 保有 attachment/Run/控制/接续；TL/LE 独立保有其原事实。应用按原 owner 顺序关闭并持有尚 retained 的清理能力，真实释放或确认接管前不卸载其仍需依赖 |

模型动作和实现步骤的对应分别归 [AR](../../packages/core/agent/design.md#既有模型与控制前提)
与 [SR](../../packages/session/session/design.md#cb-模型与当前性映射)：AR RetireFactory
只覆盖计划退役；CB LoseDependency 是单向失联，Invalidate/Restore 只说明资格
恢复不复活旧修订，Publish/StartWork 的共同原子边界仍由实现兑现。
[固定 Cordis 探针](../../docs/proposals/core-capabilities/implementation/evidence/tool-decision-design/README.md#t-r1同步状态延后清理和旧句柄)
观察到 provider 先失效、consumer 暂仍 ACTIVE、较早观察器重入及同 Fiber 重现的
旧闭包；所以不能只等观察器 stamp 或 disposer 关门。原模型绿色和探针成功均
不证明产品末门、单调关闭、结果接续或逐资源清理，也没有组成完整 Cordis refinement。

本基线相关的实际验证义务如下。原 A 编号见[验收来源](../../docs/proposals/core-capabilities/implementation/acceptance.md#m1真实可恢复的系统审批)，
S 编号见下方[原组合场景](#agentsession-原组合场景)，D08 见
[工具历史场景](../../docs/proposals/core-capabilities/implementation/tool-decision-interfaces.md#历史行为验证范围)。
引用 M1 来源只识别原场景，本轮只消费确定性 allow 的依赖切片；完整 HD/M1/M2 仍后置。

| 相关刺激 | 本基线可观察判据与实际 owner |
|---|---|
| A04/S03：双 Context 激活、准备晚到、activated 抛错/异步拒绝/重入 close | AR 保留唯一占位及已发布事实；晚到资源回原尝试，SR 原 attachment 不被偷换。真实准备/任务、订阅及计时器未收口时再激活仍冲突，不能只看 Fiber disposed |
| A18/D08：provider 已 UNLOADING，较早监听器用旧闭包重入，consumer 暂仍 ACTIVE | AR/SR 末门及本基线 [TL](../../packages/tools/tools/design.md)/[LE](../../packages/tools/local-execution/design.md)原准入/执行门拒绝新操作；观察器未推进 stamp 也不得穿入。已准入工作与 pin 留原 owner，不因操作 Fiber 卸载丢任务；未装完整 HD 不伪造其通过 |
| A18/S12/D08：新代准备失败/晚到、依赖失联后同 Fiber 重现、旧 disposer 迟到 | 合法旧选择仅在其前提仍成立时保留；新挂载用新代，旧句柄不跟随，旧清理不删新登记。AR/SR/TL/LE 各核自身真实工作/资源；应用按原 S12 循环检查任务、订阅、timer/fd 回到基线或逐项具名 retained |
| A04/S09/S12：清理失败后再激活、自等待/取消等待、移交回执丢失、订阅晚到、A 使用 B 且 A 清理失败 | AR 拒绝自等待并保留原占位/依赖；SR/TL/LE 核原结算或接管证据，未确认不减责任。应用保有原 cleanup 并查询 remaining，实际 fd/订阅/timer/任务由持有它们的 owner 释放或报告 retained，超时和 Map 清空不作成功 |

上述判据须固定实际源码、装配、刺激和结果，未持有的资源种类说明不适用。
当前均未执行；有限循环或端到端通过也只覆盖所列环境和交错，不推论任意插件。
独立判断未发现本次需新增模型或机器证明的事实；若实现映射允许既有模型无法
解释的新交错，须针对受影响命题重新判断，不能用本说明豁免原符合性接入门。

## 治理原组合场景

本表逐字承接 `058c77c` 治理输入的验收切片，迁移快照为 `7e758f21`。它保留
原 A 编号、刺激和预期，不是新规范或通过声明；各 owner 实现自己的状态转移，
应用只装配真实提供者并测量组合。完整 HD/模型的未开放部分不计入最小 allow
节点，也不被记为已完成。

| 验收局部切片 | 必须可观察的反例及结果 |
|---|---|
| A01 / TG+AU | 两真实主体/两 tenant；伪造 Principal/TS cast、同 user 多组织、跨 tenant 所有嵌套引用、管理者无正文权。读/list/count/旧回执/订阅均当前授权，无存在性泄漏；正文/财务/精确控制分别有结果 |
| A02 / TG | 同自然人两个 operation 并发 personal create 恰一 tenant；personal/organization 创建完整落盘后丢回执并重启，同原请求/operation 认回原 tenantId，不用内存映射、不因重分配冲突；同键改 kind/成员仍冲突。两个管理员互撤仍保留一个；remove/re-add 不恢复旧 grant/委托。真实管理创建草稿→发布，重复 publish 同版本、异输入冲突、旧版不可改、official 不能改、fork 不继承 grant |
| A03 / TG+AU | 实际 issue/select/grant/amend/revoke 建立依据；v1 可用、fork/v2 越界；源权益停用不删除原 Session；撤权排 n+1 阻新调用而 n 等耐久后可继续。撤销再重授都未耐久不越过中间撤销；源不可用 unavailable，不 ask |
| A11 / AU | 穷举[授权模式表](../../packages/governance/authorization/design.md#声明解析与最小-action-端口)中的模式×确认类型×硬资格×grant×一次决定；当前合法授予者缺失不能 ask。真实 set/clear/readEffective，Session→用户定义→默认；false/null 非法 set 不清除。模式变化不造答案；未耐久放宽不用、收紧立即封闭 |
| A26 本地 / BG | limit(10) 下 finite(7)→finite(7)、unknown(K=7)→finite(7)、unknown(K=7)→unknown(K=7) 均只有首个 call+reservation 成立，即使 unknown 已显式获准。unknown 部分 C=3/R=4 后贡献仍7，新增 Q=3 可达10、Q=4 拒绝；C=9/R=0 后只剩1。重复/恢复同结果；一项硬预算拒绝不留另一个预留；下调/新增适用预算参与 gate；未知默认拒、零成本需来源依据 |
| A26 恢复 / BG | 重放同 externalFact/revision 不增费、同键异内容冲突；同 request 两真实收费分别保留；跨周期 late actual 归原 period；unknown/未收到 start 回执不释放；真实墓碑证明未开始才释放；重启后 reserved/negative/unknown 不归零 |
| A26 币种 / BG | 仅 USD 硬预算而来源已核实 EUR：没有 EUR 姿态时 budget_posture_missing，显式错绑 USD 时 budget_currency_mismatch；实际声明 EUR 姿态后仍检查所有匹配的 EUR 预算，不折算 USD。changeBudget 尝试改 tenant/scope/currency 或替换 periodId 被拒，原 attempt/period 保持原账目 |
| A28 / 三 owner | 未形成 Action 的拒绝仍有 operation/主体/tenant/阶段和裁剪目标；关键成功/拒绝保存失败时禁止新效果并返回 audit_unavailable/原 unknown；诊断丢弃有 gap，普通通知失败不回滚业务结果 |
| A05/A08 回归 / 三 owner+P1 | 相同 operation 原回执含业务 denied 也跨重启稳定；异输入冲突、过期修订冲突不随未来状态变成功；fsync 阻塞无效果，失败隔离后不能越过；某 owner publication blocked 保留 committed 与所有未决责任 |

## Agent/Session 原组合场景

本表逐字承接 `cd16f1` 接口的 S01–S18，迁移快照为 `7e758f21`。每项只在实际
消费的提供者、场景与环境范围验收，当前尚无这些产品符合性结果。S10 的 P1
机制结果不抵扣真实业务 owner 组合；两进程 writer 排他与多个 AR/SR 调用入口
分别测量自己的权威。完整 HD/M2 场景保留原范围，不把节点收窄解释为已通过。

| ID / 原验收 | 刺激 → 必须观察的结果与测量 |
|---|---|
| S01 / A01 | 两真实凭据/两租户（相同 sessionId）、同租户管理者无正文权；跨 tenant/伪造 caller/delegation、原回执/订阅重放；当前权限撤回与读/activate/Step 同门竞争 → 无存在/计数/正文泄漏，旧 joinedRevision 不复活；不能只测 parseData |
| S02 / A04 | 同宿主两个 Context/Registry 入口并发 activate 同 Session，另 tenant 同 ID；资源准备在屏障暂停，owner close/attachment revoke 后归还 → 只一占位，另一 tenant 独立，晚到原资源被原 attempt 持有并清理 |
| S03 / A04/A18 | 实际 Cordis 4.0.2 effect、订阅/计时器/受管任务；activated 抛错/异步拒绝/重入 close，必要 binding 撤除和清理失败后再激活 → 发布不可否决，真实资源未收口前冲突，旧 handle/disposer 不控制新代；Fiber 状态不足以通过 |
| S04 / A09 | 真实 queue/run/session streams；并发 edit/reorder/withdraw/enqueue 与两个 takeBatch；同 operation 重试及同键异输入，fsync 挡住 → 一个冻结有序 batch/Run/占位；未取批/撤回版本不入上下文，pending 不启动 driver |
| S05 / A09/A17/A08 | 两个 ready continuation/两个 acquireNextStep，hold→clear 均未耐久、撤权 n+1 与 Step n 同步失败/成功 → 单驱动、正向事实不早用、n 耐久且未精确取消可继续，新位置不能穿过撤销/缺口 |
| S06 / A17/A16 | 精确 interrupt/cancel/force_stop/resume、stop 与真实成功结果竞争、start 尚在途中/inspect not_found、continueQueue 在 stopping 期间 → 真实 stopped/隔离前不放占位，unknown 独立；旧 epoch 不写有效结果，已成功不被改中断 |
| S07 / A17/A19 | 真实 journal/工具文件，取批/工具接纳/效果/结果回执各窗口 kill→持锁恢复；重新附着同 Session 并查原 Run/call → 已完成不重复效果，未明 attempt unknown 不重发，新 epoch 拒旧提交；真实调用者当前资格重检 |
| S08 / A09/SR-13 | 删除可重建投影、错误 Session checkpoint、未知 event/schema、同 key 同版不同贡献、旧撤回器 → 原事实仍在，坏版本依赖入口 unavailable，重建水位可核对，新贡献/权限不被旧对象改变 |
| S09 / A04/A17/A29 | 自关闭等待、在途准备/移交回执丢失、订阅晚到、A 使用 B 且 A 清理失败、原 TL 独立持有 unknown → 自等待拒绝；未确认移交保留原 owner，确认后可释 Agent；保留失败依赖和 cleanup 可查询 |
| S10 / A05–08/A28 | 真实多 owner batch 中 SR 或 HD/TL publication 违规、磁盘/审计/诊断同时失败、旧 writer/准备票据 → 不半发布、不提前效果、不丢原 unknown/使用；committed+blocked 不改称未提交，恢复同水位再开放 |
| S11 / A12/A15/A17 | q1/q2 真 HD 待答，释放 Agent/重启，先答 q1（含 reject）再答 q2，期间 interrupt/hold/cancel → q1 独立耐久串行接续，q2 不被清掉，Run 不提前 completed；答案不清全局阻塞，取消后不复活 |
| S12 / A18/A29 | 定义/Factory/工具准备换代失败与成功、依赖失联/重现、已准入 pin、旧 provider 清理迟到；100 次等待/关闭/恢复循环 → 无同名跟随，真实任务/订阅/timer/fd 回到基线或逐项具名 retained，等待无模型忙轮询 |
| S13 / A24/A30–32 | 真实公开 tarball/独立确定性工具消费者跑最小闭环；M2 后实际 wire 中 q2 deferred receipt 与 q1 结果并存 → 无 baseline 绕门，原 call 不重发，未执行的 M1/M2 子场景单列，不由编译/源测试抵扣 |
| S14 / A09/A17/SR-08/09 | 无工具正常返回、真实 TL 结果后的结算、q1 就绪而 q2 未答、driver throw 与终态竞争 → 原 Step/CallRef 不变，新的模型决策才新 Step；driver 进展/Step/Run 结算经同批，剩余 HD 后果在失败意图同批关闭，停止未知时保留 stopping；重放/旧 claim 不二次推进 |
| S15 / A03/TG-05 | 同一 DefinitionVersion 下选用 a/b 配置不同，Session 原属 a；准备后 configure/disable/remove a，再同版本重选 c 并重启 → 不借 b/c，不混当前 Run 配置；原 a 被移除后后续使用阻塞，已准入/历史原关联保留 |
| S16 / A11/A01 | owner 与仅有 emergency_control 的管理者分别 set/clear Session confirmation_mode，准备后撤权或停用；再测 false/null → 只有 owner 的独立设置权可提交，旧候选拒绝，非法值不变 clear，重启恢复 AU 原覆盖/来源，未做模型选择 |
| S17 / A03/TG-05/PF-010.C10 | TG 先准备空引用清单，SR create/attachment 先占位；反向让 TG disable 先提交；再撤掉 SR inventory/加载缺口 → 前者 TG 重准备并报告新增引用，后者 SR 当前门拒绝；缺来源 unavailable 而非空。已存在引用不级联删除/强停，也不向无正文/元数据权的管理者泄漏内容或存在性 |
| S18 / A09/A17/TL-07 | 真实 TL proposed 与 SR 原接续联合耐久登记，driver recordStepReturn(await_calls) 交还 claim；尚无 allow/ask 时取原 adjudicate 接续并让当前门直接 deny，在 deny 批耐久后、结果消费前 kill/reopen。另在交还后/裁决 claim 后分别重启，并阻断登记/交还/deny 批的 fsync、丢回执/通知 → 原 Step/CallRef.owner/Action/continuationId 不变，交还后原裁决 ready 可查；重启认回原执行前拒绝结果并按 finish_run 串行结算，无新 Step/attempt/HD 请求、无工具效果（真实文件保持原值/不存在），旧 claim 拒绝、相同操作无第二结果。缺 proposed→SR 绑定拒绝交还/恢复，不以待工具结果永远挂住 |

## 治理组合的装配投影

本表来自 `058c77c`，仅说明既有具名组合的提供者交接；TG/AU/BG 的当前操作
协议分别归[tenant](../../packages/governance/tenant/design.md)、
[authorization](../../packages/governance/authorization/design.md)、
[budget](../../packages/governance/budget/design.md)。SR 行为归
[Session](../../packages/session/session/design.md)，调用与请求分别归
[tools](../../packages/tools/tools/design.md)和[human-decisions](../../packages/governance/human-decisions/design.md)。
应用不实现这些状态转移；未来模型组合只保留已接受契约的接入义务。

| 具名组合 / 提交者 | 各 owner 准备的最小原子关系 |
|---|---|
| `owner_change` / TG、AU 或 BG 的管理入口 | 原 owner 状态变化+其审计/确定结果；TG personal 创建含列名 system index 与 tenant 初始成员 |
| `input_run` / SR | SR 输入/取批/Run 占位；TG/AU 是当前只读资格，SR 保存实际依据/设置值，不能复制 grants 或改预算 |
| `request_wait` / TL 与 HD 的受信调用组合 | AU ask 判定+HD 原 Action/request+SR/TL 精确等待位置；此时不 reserve 执行预算，不发效果 |
| `answer_consequence` / HD | HD 唯一决定+SR/TL 唯一接续意图；答复不写 grant、不提前消费执行预算 |
| `action_execution` / TL | TL 原 call/attempt 准入与执行许可记录+AU allow 依据+HD 精确一次消费（如有）+BG 全部预留；真实资源 owner 提供 ExactUse |
| `budget_call` / MC | MC 请求/attempt 准入+授权/运行依据+BG 全部预留，执行 owner 保留其精确许可/取消账本；P4 才接真实模型 |

组合者只组装各 owner 冻结片段并提交一次，不提供第二套准入政策。跨不同 owner
同批的结果由该具名组合者形成明确业务结果（例如 call admitted、request pending），
分别嵌入各 owner 结果引用；不能拿预算 reserved 当工具已经执行成功。已有 P0
participants 校验不替代“是否漏写一次消费/预算”的业务完整性检查，P3 必须通过
真实组合反例验证。
