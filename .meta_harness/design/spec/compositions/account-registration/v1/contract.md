# composition.account-registration v1 候选

本契约适用于首版单机部署内后续自然人账号的注册，不适用于部署首次 `init`。它细化 [D-016](../../../../decisions/account-identity/decision.md) 的跨能力交接，依赖同 baseline 的 [CD-01/02](../../../data/core-work/v1/contract.md)、[AI-01/02/04/05/06](../../../capabilities/account-identity/v1/contract.md)、[TG-01/02](../../../capabilities/tenant-governance/v1/contract.md) 和 [CC-03/06](../../core-work-coordination/v1/contract.md)；对应精确坐标分别为 `data.core-work@1`、`capability.account-identity@1`、`capability.tenant-governance@1`、`composition.core-work-coordination@1`，同 baseline 的 `rebase_relation` 均为 `null`。当前 `candidate`、`acceptance:null`；Tenant 后续个人创建端口及真实恢复映射未锁定，不能作为已发布的实施接口。

## 权威与目标

账号权威唯一分配并保留不复用的 `UserRef`、注册身份及 pending/active 状态；Tenant 唯一裁决个人租户及 owner 成员、每个 `UserRef` 最多一个有效个人租户。注册协调者持有跨 owner 的原操作身份、稳定目标、每步回执与待核实责任；它不直写账号或 Tenant 的内部事实。注册的成功事实只在**同一个账号 active 且其唯一有效个人租户和 owner 成员已耐久可消费**时成立，不是任一步骤的局部成功。此后租户关闭、成员状态变化不改写历史注册结果；每次业务使用仍另核当前资格。

认证 provider 的凭据提交与项目 `UserRef` 映射须可核实且稳定；提供者自身注册成功不能绕过上述产品完成条件。准入政策未确定时不允许把公开注册视为默认许可。客户端提交的账号 ID、tenant ID、同机文件或身份令牌本身均非可授予个人租户的资格。

## 共同性质

**ACR-01（原操作与身份）**：一次注册使用由受信入口固定的 `registrationOperation` 与规范化请求摘要。账号权威对同一原操作及相同摘要只认回同一不复用 `UserRef`；同键异摘要明确冲突。重复请求、进程重启与响应丢失不允许新建第二个账号。外部凭据标识冲突是可辨拒绝，不能与“同一现实人”混淆。

**ACR-02（pending 的安全范围）**：账号权威可先持久建立 `pending_personal_scope`，并保存与原操作关联的稳定 personal tenant target；该账号只可执行继续/查询注册和必要的凭据恢复，不得凭 pending 身份取得个人业务、组织业务或设置/资产访问。pending 凭据验证不等于 active 主体授权。

**ACR-03（Tenant 后续个人创建）**：Tenant 必须提供与首次部署 bootstrap 不同的受信后续创建入口。该入口在当前个人唯一 claim 与原操作/目标绑定下，共同提交个人租户、唯一有效 owner 成员及 claim；同一原操作重试认回原 tenantId，异输入或竞争账号的错误占用明确冲突。Tenant 不因认证库表中有 `UserRef` 就放弃唯一性检查；账号协调者不能代其分配第二个有效个人租户。后续创建入口和权威回执尚须在 TG-01 增量中精确定义。若继续使用 system personal-index 与新 tenant stream 的混合批次，DR-01/CC-03 目前只授予首次 bootstrap 的窄许可，须先发布后续创建的受限扩展及真实存储映射；也可采用另一个能同样证明唯一性与耐久发布的明确路径。不能复用首次初始化许可。

**ACR-04（激活屏障）**：注册协调者只有取得账号身份/凭据映射的耐久确认，以及 Tenant 对**同一 `UserRef`、原操作、稳定 target、个人租户和 owner 成员**的耐久且可消费确认，才能要求账号权威从 pending 转为 active。账号权威在转移时重核这些绑定；对外成功回执只在 active 可核实后成立。Tenant 的逻辑位置、待 fsync 回执、临时 `not_seen`、单方成功或客户端自报不构成激活依据。

**ACR-05（未知与认回）**：每步写入若返回 pending、结果未知或回执丢失，协调者保留原身份/目标、占位和接续责任，只查询相应权威并等待可核实结论；不得换键、换 tenant target 或按暂时 `not_seen` 再提交另一份。只有权威在独占恢复下证明原操作未提交、占位安全释放，才可用同一 `registrationOperation`/摘要/目标重试原步骤。若 Tenant 批次已提交但 owner publication 失败，原 completion 按 CC-06 保持 `committed_blocked`，协调者不得重发或仅凭它激活；受信恢复宿主安装覆盖原位置的全部 owner 基线后，新代权威查询另给可消费证明，才能继续 ACR-04。恢复宿主无法完成时账号保持 pending，用户看到待恢复而非成功。确定冲突或不能继续的结果对用户可辨，但不把已发布的账号或租户作为“回滚”静默删除。

**ACR-06（并发与重启）**：两个协调者争同一原操作时，只有一个可拥有进行中的推进许可，另一方读取其状态或获得冲突；协调者崩溃后，新实例从耐久意图和两 owner 的权威回执或 CC-06 新恢复基线的受信查询认回，不凭本机缓存推断进度。注册完成后重复原操作只认回同一**历史完成事实**，不再执行创建；若个人租户后来 closing/closed，当前业务资格仍按 TG-03 拒绝，不能将历史回执解释为新建租户或恢复权限。pending/unknown 可查询，不能报告假成功。

**ACR-07（准入与资源使用）**：active 账号的登录态仍须在每次受保护新交互验证；租户范围请求还须核对明确目标 tenant、当前成员/所有权以及资源 owner 的 scope。CLI 账号切换、选择组织和同机磁盘布局不改变历史 Session 的 owner，也不复制账号级设置到租户级。

## 交接与失败结果

| 阶段 | 发送方可释放责任的条件 | 失败或结果未知时的所有者 |
|---|---|---|
| 建立 pending 身份 | 账号权威给出可核实的同操作身份/凭据映射 | 账号权威保留内部写入，协调者保留原操作查询和用户状态 |
| 建立个人范围 | Tenant 给出同目标耐久且可消费的 claim、tenant、owner 成员 | Tenant 保留写入/唯一性；协调者保留查证与重试，账号保持 pending |
| 激活账号 | 账号权威确认 active 并能以原操作认回 | 账号权威保留状态；协调者不报成功，继续核实 |

认证/协调者失联应封闭新的相关推进，不将现有 pending 身份升级或把已发布个人租户删除。账号插件卸载、重启或 provider 更换后，原操作与目标仍由持久权威持有；如何恢复具体凭据由账号契约和 provider 设计决定。已建立但尚不能激活的个人租户是可诊断的保留责任，不授予该账号业务访问。

## 发布前必须闭合

1. `capability.account-identity@1` 明确 pending/active、会话验证、操作认回与授权边界。
2. TG-01 的后续个人创建增量固定受信调用、唯一 claim、稳定目标、耐久回执及与首次 bootstrap 的区别。
3. 账号/协调者/Tenant 对原操作的持久存储和恢复映射、跨 owner 回执、CC-06 `committed_blocked` 的新基线认回，以及必要的“结果未提交”证明路径。
4. 后续个人租户创建若使用混合 system/tenant 批次，DR-01/CC-03 的受限许可与提供者映射须扩展；采用其它路径时须给等价唯一性/耐久保证。
5. 并发与故障的行为模型、规范场景和真实提供者故障实验，含重复请求、回执丢失、fsync unknown、publication blocked、重启与跨进程请求。

本候选不预设两个 owner 共用一笔数据库事务，也不把成功注册等同于 session 建立；登录及退出由账号能力独立约束。
