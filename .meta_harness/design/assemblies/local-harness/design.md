# 本机 harness 装配设计

## 目标、采用范围与权威

目标是同一真实本机部署中，用户经可信账号登录，在自己有资格的租户范围创建 Session、提交文本、取得唯一 Run，经确定性驱动完成一次有真实授权和预算前提的多命令文件工具 allow 调用，随后查询原结果，并能在重启后认回原责任。它来自[旧应用设计](../../../../apps/local-harness/design.md)采用的最小运行节点；这是目标动作链，**当前应用尚不能执行它**。

[PF-026](../../requirements/product/PF-026-account-journey-and-isolation/requirements.md)、[D-016](../../decisions/account-identity/decision.md)、[D-017](../../decisions/personal-tenant-creation/decision.md) 与接受列明账号到个人租户语义的 [D-021](../../decisions/account-personal-local-creation/decision.md) 已改变旧设计的身份与初始化前提。精确行为以相应 [Account](../../spec/capabilities/account-identity/v1/contract.md)、[Tenant](../../spec/capabilities/tenant-governance/v1/contract.md)、[注册组合](../../spec/compositions/account-registration/v1/contract.md)、[共同协调](../../spec/compositions/core-work-coordination/v1/contract.md)及其精确接受范围为准；完整候选坐标存在不等于已发布接口。应用不增设一套身份、租户 claim、运行或工具账本。

## 实际选择与目标提供者

| 能力/组合 | 应用采用或目标提供者 | 实例、配置、消费及目前界限 |
|---|---|---|
| [DR](../../spec/capabilities/durable-records/README.md)、[CC](../../spec/compositions/core-work-coordination/README.md)、诊断 | [`@omne-harness-lite/records`](../../../../packages/storage/records/package.json)、[`jsonl`](../../../../packages/storage/jsonl/package.json)、[`admission`](../../../../packages/coordination/admission/package.json)、[`diagnostics`](../../../../packages/observation/diagnostics/package.json) 是当前应用依赖；目标映射见 [records](../../providers/storage-records/README.md)、[JSONL](../../providers/storage-jsonl/README.md)、[admission](../../providers/coordination-admission/README.md)、[diagnostics](../../providers/observation-diagnostics/README.md) | 单一受信宿主持实际 writer/锁、coordinator 与诊断目录；消费 Context 只取得窄服务/能力。已有 P1 测试只覆盖旧固定基线，个人创建目标单流、`core-journal/3` 与完整 owner 恢复仍待验证。 |
| [Account](../../spec/capabilities/account-identity/README.md) 和注册组合 | 尚无采用的认证 provider、adapter 或 AccountHost；账号密码及可撤销会话是首版产品政策，成熟组件是优先验证方向 | 应用负责 CLI/本机凭据槽到受信账号会话的接入及当前账号显示；Account 先耐久固定 A、规范标识与不复用身份，adapter 再以同 A 的 `bindCredential` 原子幂等地绑定唯一规范标识与稳定 subject，并由 `credentialBindingStatus(A)` 权威查询崩溃窗。Account 映射耐久后才发行 F；上述 adapter/Account 对接未有实现或证据。早期用户名只用于本地开发。 |
| [Tenant](../../spec/capabilities/tenant-governance/README.md)、[Authorization](../../spec/capabilities/action-authorization/README.md)、[Budget](../../spec/capabilities/budget-accounting/README.md) | 目标包依次见 [Tenant](../../providers/governance-tenant/README.md)、[Authorization](../../providers/governance-authorization/README.md)、[Budget](../../providers/governance-budget/README.md) | 同一部署各一权威 host，按当前账号和目标租户核成员/权益、授权与预算。现有 Tenant/Budget 只有部分 decoder/fold，相关 host、共同业务门和真实来源尚未交付。 |
| [Session](../../spec/capabilities/session/README.md)、[Run](../../spec/capabilities/run/README.md)、[Agent](../../spec/capabilities/live-agent/README.md)、[RunDriver](../../spec/capabilities/run-driver/README.md) | 目标映射见 [Session](../../providers/session-session/README.md)、[Run](../../providers/session-run/README.md)、[Agent](../../providers/core-agent/README.md)、[Driver](../../providers/agent-run-driver/README.md)；受限恢复读面见 [Session persistence](../../providers/session-persistence/README.md) | Session 持长期输入/队列和附着，Run 持 Step/控制/结算，Agent 持活体占位，Driver 贡献固定版本的确定性驱动。应用不复刻这些根；共同附着及生命周期由 [CB](../../spec/compositions/agent-session-binding/README.md) 与 [生命周期组合](../../spec/compositions/session-run-agent-lifecycles/README.md)拥有。 |
| [Tools](../../spec/capabilities/tools/README.md)、本地执行、Human Decisions | 目标映射见 [ToolHost](../../providers/tools-tools/README.md)、[Local Execution](../../providers/tools-local-execution/README.md)、[Human Decisions](../../providers/governance-human-decisions/README.md) | 最小节点选真实工具定义、受限多命令文件 allow 与执行账本。完整 HD 可后置，但 ask 路径缺席时不可执行，不能转成 allow；已确认或未知的文件效果都归原 attempt 处理。 |

以上“目标提供者”保留旧施工映射的有用选择，但未交付者仅是候选，不能写成已加载的插件或真实公开签名。`work-data` 是当前应用的公开依赖，不因此成为额外的运行状态 owner。

## 受信宿主与挂载

宿主取得本机真实 writer 排他，固定诊断目录和共同 coordinator，然后从完整有效前缀恢复各必需 owner 于同一水位；只有当前 writer epoch、所有必需 owner 根、跨 owner 关系和未决清理责任核实后才开放业务门，详见 [CC-06](../../spec/compositions/core-work-coordination/v1/contract.md)。Account 自身空状态及 F/pending、Tenant 空或既有根、注册结果、旧登录态撤销和当前租户资格必须各自可核实；物理空文件、仅有 writer epoch 或缺失 owner 根不能冒充首次合法空部署。当前并无支持这些条件的完整应用启动入口。

目标挂载按依赖推进：基础记录/协调/诊断与账号身份 → Tenant、Authorization、Budget → Session/Run/Agent 及具名 link → Tool、Local Execution、必要的 HD → 确定性 Driver。Host 由同一受信宿主创建一次，插件 mount 可换代；普通请求或插件重新 `apply` 不创建空 host。服务只有在所属权威恢复及必需事实源就绪后才发布；来源缺席封闭相应操作，旧同名服务或旧 Context 不获得新代权限。

应用登记真实 Cordis 挂载和新 generation，按 owner 的窄门核实际 provider 存活。`internal/status` 可帮助观察失活，但较早观察器可能重入，因而不能替代执行前最后一次直接复核。Tenant 在短门外由同进程当前受信 Account 服务读取 F，门内只核冻结 F 与当前耐久投影，不做插件装卸、外部 I/O 或等待 Account provider；host/owner/writer 换代须重读 F。应用保有 writer、诊断目录及尚未交接的清理句柄；各能力自身拥有业务效应、未决尝试和关闭状态。

## 从初始化到原结果的动作链

| 阶段 | 真实交接与必须观察的结果 | 归属与状态 |
|---|---|---|
| 1. 建立部署 | 打开锁与 journal，扫描有效完整前缀，安装同水位的必需 owner roots；坏前缀、未知必需事件或 `committed_blocked` 未重建完成时不开放业务。 | DR/CC 和各 owner。P1 机制已有局部测试；完整 owner 恢复未验。 |
| 2. 首次 `init` | 受信初始账号操作由 Account 在已核实部署初态下先耐久固定 A、规范标识与不复用 `UserRef`/sourceRef，再由认证 adapter 以同 A 绑定 subject；Account 映射耐久后发行 F。Tenant 经同进程受信读面取得 F，派生 T/C，核已证实空 Tenant 根，只向目标 tenant 流提交个人租户与唯一 owner；当前代 Tenant 结果可消费后 Account 激活，active 可再读才报告完成。确定凭据冲突使原 A 留不复用墓碑，且无 F/可推进绑定时新受信 A 才可争首位；unknown 仍占首位。 | [AI-08](../../spec/capabilities/account-identity/v1/contract.md)、[TG-01](../../spec/capabilities/tenant-governance/v1/contract.md)、[CC-03/06](../../spec/compositions/core-work-coordination/v1/contract.md) 的列明语义已由 D-021 接受，提供者仍未验证。仅 seed 字符串、物理空文件或 writer epoch 不生成身份或创建资格。 |
| 3. 后续 signup/login | 已建立部署中的账号可自助注册；Account 按原 A 核凭据 `bound/conflict/unknown/已证明 not_seen`，同 A 补全 provider bound 后未写完的映射，确认耐久后发行 F。Tenant 用同一 F→T/C、目标单流及恢复机制；第二 T 遇目标未决占位仅待核实，胜者耐久后才可确定 `personal_target_conflict` 并让原 A 查询显示 `blocked_personal_target_conflict`。Account 保留可推进 pending/F，确定凭据冲突留墓碑；T unknown 只查原操作，publication blocked 不重提。Tenant 当前结果可消费且 Account active 可再读时注册成功；登录取得可撤销会话，业务动作再核账号、目标租户、当前成员及对象所有权。 | [ACR](../../spec/compositions/account-registration/v1/contract.md) 的列明语义已由 D-021 接受；认证 adapter、AccountHost、CLI 第二进程到唯一 writer 的通道均未选定/验证。 |
| 4. 准备运行资格 | 当前账号在目标租户中取得所需定义选用、授权 grant/设置、预算来源和限额；创建 Session，文本被受理/裁决入队，取批与 Run 占位耐久后才可激活 Agent、交固定 Driver。 | TG/AU/BG、[SE](../../spec/capabilities/session/v1/contract.md)、[RN](../../spec/capabilities/run/v1/contract.md)、[CB](../../spec/compositions/agent-session-binding/v1/contract.md)。应用不能以本地 Map 预置资格。 |
| 5. 一次 allow 调用 | Driver 只提出确定性的文件工具 Action；Tools/Run 先登记原 proposed/continuation，交还原 claim；当前授权和预算与原 call/attempt 在具名 `action_execution` 共同准入。Local Execution 在耐久许可后执行，原文件结果/未知状态回写原 Step、Session、Run，预算按原 attempt 结算。 | [TL](../../spec/capabilities/tools/v1/contract.md)、[AU](../../spec/capabilities/action-authorization/v1/contract.md)、[BG](../../spec/capabilities/budget-accounting/v1/contract.md)及 [CC](../../spec/compositions/core-work-coordination/v1/contract.md)。ask 未接 HD 时拒绝，不伪造批准或零费用。 |
| 6. 查询、恢复与退出 | 查询必须经当前账号/租户/对象权限；重启查原 operation、Run/call 和 LE attempt，已完成不重执行，unknown 不重发。退出先关闭新请求/派发，再由各 owner 收口在途工作与清理；最后释放 writer、锁、诊断来源及目录。 | Account logout 只撤当前登录态的新交互授权，不取消已持久成立的创建来源或外部效果；各 owner 保留未决责任。 |

应用不以 CLI 缓存、同一 OS 用户或本地路径作为跨账号或跨租户授权。目标运行链仍需确定 Agent/Run/工具实际 provider 与 CLI 通道，不能用 P1 test fixture 代替产品状态转移。

## 采用变化与停止条件

本装配可在已有能力组合足够时接线，不为“本机 harness”再建同义业务插件。若实际运行发现跨 owner 完整性、恢复或原效果归属无法由现有契约保证，应回到相应能力/组合修订，而不是在应用胶水里补隐藏账本。每个可运行声明必须引用 [验证记录](verification.md)中固定修订、环境、命令和观察；目标链任一必需 owner 未实现或未恢复时，对应业务入口保持 unavailable。
