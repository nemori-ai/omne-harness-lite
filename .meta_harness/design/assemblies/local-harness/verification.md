# 本机 harness：验证、来源与差异

## 已有证据及严格边界

| 对象与采用前提 | 原始结果 | 可以得出的结论与当前限制 |
|---|---|---|
| 旧固定 HUB `31197742905a3c66fc3e650c153d65d014372c21` 的 P1：真实 records/JSONL、原生 flock、admission、D1 diagnostics、独立 tarball 消费 | [`apps/local-harness/evidence/storage-admission/README.md`](../../../../apps/local-harness/evidence/storage-admission/README.md) 固定源码、Linux/Node 环境、测试与原始日志；[测试源码](../../../../apps/local-harness/tests/storage-admission/real-composition.spec.ts)仍在应用下 | 只支持当时 A05–A08、A30/31、O09/O10 所列局部机制；不包含真实 Account/Tenant/Run/Agent/Tools，也不覆盖新候选 `core-journal/3`、个人创建目标单流与 CC-06 恢复。 |
| 旧运行映射只读评审 `f98ac926`，对象 `976149b` | [`evidence/runtime-mapping-applicability/README.md`](../../../../apps/local-harness/evidence/runtime-mapping-applicability/README.md) | 只支持旧设计命题与当时来源的适用性判断；不证明当前提供者末门、资源清理或完整 Cordis refinement。 |
| 当前 `apps/local-harness` 成员 | [`package.json`](../../../../apps/local-harness/package.json) 和 `tests/storage-admission/` | 有 P1 验证载体；没有应用 `src/`、真实启动入口、身份/Agent/Session/工具端到端运行结果。 |

当前新谱系 v1 的 [DR](../../spec/capabilities/durable-records/verification.md)、[CC](../../spec/compositions/core-work-coordination/verification.md)、[Account](../../spec/capabilities/account-identity/verification.md)、[Tenant](../../spec/capabilities/tenant-governance/verification.md) 仍记录发布与提供者缺口。旧固定结果不自动随重基升级；当前没有本装配全链可运行提交或验收日志。

## 必须补的真实组合反例

| 边界 | 集成判据；当前状态 |
|---|---|
| Account 凭据绑定与初始资格 | 真实 adapter 在 Account 耐久固定 A/规范标识后，以同 A 原子幂等绑定唯一标识与稳定 subject；注入 provider 已 bound、Account 映射未写就崩溃，重启按 A 查 `bound/conflict/unknown/已证明 not_seen` 并补原映射，不造第二身份或 F。确定凭据冲突留 A/UserRef/sourceRef 墓碑、查询终局 `rejected_credential_conflict`；init 仅在无 F/可推进绑定的确定终局后允许新受信 A，unknown/pending 不释放首位。当前无认证 provider、adapter 或 AccountHost 联合实测。 |
| 初始账号及第二账号 | init 与 signup 共享 Tenant F→T/C、注入式 target、目标单流与认回；同一 F 重试只认回原 T。不同 F 同 UserRef 时，第一 T 未决则第二 T 只能报 `target_occupied_pending`，第一 T 耐久创建后第二 T 才终局 `personal_target_conflict`，原 A 再耐久标记并查询 `blocked_personal_target_conflict`；不同 UserRef 不撞目标。F 后宕机、Account/Tenant 失联、丢回执和跨进程重启不能造第二目标。当前无 Account/Tenant/CLI 单流联合实测。 |
| 同机多账号与租户 | 切换登录态和目标租户后，Session、settings/skills、授权、预算与结果查询都按可信 `UserRef` 和目标租户隔离；logout 后旧会话不准新交互。当前无产品装配实测。 |
| 首次运行与恢复 | fresh 时分别核实 Account 空状态、DR/CC 完整空业务前缀与 writer/owner 基线；已拒绝 A 的不复用墓碑必须保留，缺失、损坏或未知责任不能当新部署。init 的目标单流前缀由必需 owner 完整 fold 并一次发布同水位 roots；Account pending/F、确定冲突和阻断在重启后仍可按原 A 查询，可推进者再接续；`committed_blocked` 保留历史结果，完整新基线后单独判可消费，原 attempt unknown 不自动执行。当前旧 P1 recovery 不证明这条链。 |
| Agent/Session/Run | 双 Context 竞争激活/取批、撤权、卸载重入、迟到资源、旧引用与关闭，仍只有原占位和原清理责任；文本与唯一 Run 可查询。当前未执行。 |
| 工具/预算/真实文件 | 多命令文件工具参数完整校验，真实授权与预算在效果前成立；仅原 allow attempt 写一次，ask 缺席拒绝；各效果/回执窗口 kill/reopen 后完成不重做、未知不假成功。当前未执行。 |
| 独立消费者与关闭 | 从固定提交安装、构建并用公开入口跑整条链；退出后 fd、订阅、任务、timer 或具名 retained 可核对，旧 provider/disposer 不控制新代。P1 tarball 仅覆盖五个基础包，整链未执行。 |

这些判据承接旧应用设计中的 A01–A32 与 S01–S18 相关切片，但不复写长场景表为第二份权威；各精确行为以当前能力与组合候选、接受后版本及实际实施任务核对。完整 HD/M1/M2 和模型费用不因最小 allow 节点通过而取得验收。

## 来源与旧设计到当前基线的对应

旧正文为 [`apps/local-harness/design.md`](../../../../apps/local-harness/design.md)（本次读得 SHA-256 `a8b88dfa227d0447f4cef1d5ddc7cafc620c19f9ee1b4d549c0b82ca005d7eef`）；其接纳的最小运行选择来自提交 `1368c52b7255e16e9c2fcde30eebca6f870679f7`，装配映射接受点为 `f98ac926`。以下对应是迁移后的适用性判断，不追溯改变原接受记录：

| 旧应用设计中的假设或范围 | 当前处理及原因 |
|---|---|
| 应用私有 `createLocalIdentityHost`、`IdentityPlugin` 和部署凭据表直接形成 `AuthenticatedInvocation` | 由 [D-016](../../decisions/account-identity/decision.md) 的独立账号权威取代；应用只消费已验证会话及目标租户资格。认证 provider 尚未采用，不能保留私有表为兼容层。 |
| TG bootstrap 先以 seed 建初始身份，后续 personal create 另走路径 | [D-017](../../decisions/personal-tenant-creation/decision.md) 接受两入口共用一套个人租户状态机；[AI-08](../../spec/capabilities/account-identity/v1/contract.md) 要求 Account 先耐久建立初始 `UserRef` 与来源后果。旧 seed 不能单独授创建资格。 |
| 旧 `bootstrapTargetTenantId`、core-journal v2 与 personal-index 的不同流形状 | [DR-01](../../spec/capabilities/durable-records/v1/contract.md)、[TG-01](../../spec/capabilities/tenant-governance/v1/contract.md)、[CC-03/06](../../spec/compositions/core-work-coordination/v1/contract.md) 的目标单流与普通 v3 仍是候选；不为旧开发记录设计兼容层，但旧字节须保全或明确拒绝，不能误读成新格式。 |
| 旧 Agent/Session 二者承担全部 Run 与 driver 接线 | 当前 [Run](../../spec/capabilities/run/README.md)、[RunDriver](../../spec/capabilities/run-driver/README.md) 有独立边界；应用必须按当前 [生命周期组合](../../spec/compositions/session-run-agent-lifecycles/README.md) 连接，不复制旧 owner 划分。 |
| 旧文档里的 `docs/`、`spec/` 及包内长场景表 | 语义权威转到 `.meta_harness/design/{requirements,decisions,spec,providers}`；本包只记录实际采用、动作链与集成证据。旧场景编号保留来源辨识，不作为新坐标的通过报告。 |
| P1 已接受且有日志 | 验证页首表保留精确旧证据范围；新 v1 全链、统一注册、owner 恢复和真实文件效果均为缺口，不从 P1 外推。 |

若旧来源、当前规格与实际运行结果出现冲突，先定位条款版本和权威 owner；不得通过本装配文件静默改变规格或把旧结果提升为当前发布证据。
