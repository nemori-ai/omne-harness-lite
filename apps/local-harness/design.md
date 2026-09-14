# Local harness 装配设计

状态：受审 `5ffba4b` 的当前装配迁移/消歧候选，尚待接受；本目录没有可运行的
目标应用，也没有新 workspace 成员或启动命令。来源与迁移记录归
[原施工入口](../../docs/proposals/core-capabilities/implementation/runtime-provider-interfaces.md)。
采用计划 `1368c52b7255e16e9c2fcde30eebca6f870679f7` 的
[最小运行基线](../../docs/proposals/core-capabilities/implementation/runtime-baseline.md)
作为本会话最终停止点：真实身份→Session/Agent→text/唯一 Run→真实授权与
本地预算→多命令文件工具的一次 allow→原结果、恢复与关闭。驱动确定性，
完整 HD、M1/M2、模型费用与扩展平台后置；ask 未交付时必须明确不可执行。

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
`packages/tools/tools/design.md`、`packages/governance/human-decisions/design.md`、
`packages/tools/local-execution/design.md`。本树未合入这些正文时按固定 Git 对象
核对，整合者同次完成导航；这里不复制它们的服务/状态协议。allow 基线选真实
TL 和 LE，完整 HD 可不挂，但缺席不能让 ask 绕行 allow。

P1 沿[共享接口](../../docs/proposals/core-capabilities/implementation/shared-interfaces.md)
选择实际 `createJsonlProvider(options, diagnostics)` 与
`createAdmissionCoordinator(writer, diagnostics)`，纯 work-data/records 不插件化。
Diagnostics 消费面沿 [D-010](../../docs/decisions/D-010-shared-diagnostics.md)。
目录 owner 候选固定为 `d4cd27ed33df815179f57af398c8cb6b5444302a` 的
`observability-directory.md`；已独立受审无阻断，但最终 factory 采用仍 pending。
应用按其最终受审面创建并保有目录/子来源，不复制或猜测旧创建/关闭签名。

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

应用实施等待真实 P1、上述受审提供者与 TL/LE 默认产物；没有它们不提供伪造
可运行命令。实际验收引用基线页的 A01–11/A17/A18/A19/A26 本地/A28–32
相关子场景：双凭据隔离、唯一激活/取批、当前撤权、真实文件效果、原结果恢复、
预算并发/unknown、关闭与旧引用、新会话独立产物消费。诊断记录安全关联与
phase/code，关键审计由业务耐久提交，普通日志失败不覆盖业务结果。
当前这些组合测试均未运行。通过基线后固定可运行提交、命令、证据、未开放
路径与残留责任并停止；完整 HD、M1/M2 和扩展功能只供用户后续规划。
