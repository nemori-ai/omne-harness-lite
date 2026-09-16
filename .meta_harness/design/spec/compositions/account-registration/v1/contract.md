# 账号建立与个人范围激活 v1 候选

本组合覆盖首次受信 `init` 和已建立部署内的后续自助 signup 共用的 Account→Tenant→激活链；公开注册准入政策仅适用于 signup。它消费已接受 [D-016](../../../../decisions/account-identity/decision.md)、[D-017](../../../../decisions/personal-tenant-creation/decision.md) 与 [PF-026](../../../../requirements/product/PF-026-account-journey-and-isolation/requirements.md)，依赖同 baseline 的 [CD-01/02](../../../data/core-work/v1/contract.md)、[AI-01/02/02a/04/05/08](../../../capabilities/account-identity/v1/contract.md)、[TG-01/03](../../../capabilities/tenant-governance/v1/contract.md)、[CC-03/06](../../core-work-coordination/v1/contract.md) 与 [DR-01/02](../../../capabilities/durable-records/v1/contract.md)。精确坐标依次为 `data.core-work@1`、`capability.account-identity@1`、`capability.tenant-governance@1`、`composition.core-work-coordination@1`、`capability.durable-records@1`，同 baseline 的 `rebase_relation:null`。本坐标保持 `candidate`、`acceptance:null`。

## 权威与共同成功条件

Account 唯一拥有凭据绑定、A、`digestA`、不复用 `UserRef`、不复用 `sourceRef`、F 和 pending/active；Tenant 唯一拥有个人租户、唯一 owner 与 T/C；DR 只持久化 T/C 的普通单租户提交；本组合拥有两权威之间的推进、未知查询及整体成功屏障。F 是 Account 的不可变来源事实，由 Tenant 经当前受信本地服务直接读取，不复制为导入事实，也没有个人创建专用 outbox/ack。Tenant 的 T 从 F.sourceRef 稳定推导，target 从 F.userRef 稳定推导，二者不等于 Account A。账号成功仅在同一 UserRef 的凭据绑定与个人租户/唯一 owner 耐久可消费、且 Account active 可再读时对外确认。历史成功不替代每次业务使用的当前资格。

首版受信 init 须在 Account 已核实空根、无任何已接纳账号和无另一 init 操作、持本代独占初始化资格时占首账号位置；Tenant 须核目标流已核实完整空前缀和自身未建立前态。文件不存在、坏前缀、未发布 root 或恢复未完不能自称 fresh。只有初始账号 active 且部署建立可核实后，公开 signup 才开放。后续 signup 是部署内可用者的自助入口，仍受输入校验和滥用防护约束；它不取得 init 资格。两入口均以同一形状 F 和 Tenant 创建机制推进。客户端自报的 user、target、origin、operationKind、seed、同机文件或旧 session 不授予创建资格。

## 组合性质

**ACR-01（原操作与身份）**：Account 对原 A 与规范请求 `digestA` 同键同输入认回同一不复用 UserRef、sourceRef、固定 target 和状态；同键异输入冲突。A/digestA 只由 Account 持有，F 精确形状见 AI-02a，不含秘密或可离线猜测值。凭据唯一绑定未耐久核实、标识冲突或凭据结果 unknown 时不得发行 F。初始 pending A 不因暂时故障自动释放；只有权威恢复证明 A 未提交，才可重新争一次性首账号位置。不同 A/不同 F 即使含同一 UserRef，也不能被合并为同一来源成功。

**ACR-02（pending 的范围）**：Account 已耐久接纳 A 后可保存 `pending_personal_scope`。它只允许原操作查询和必要的凭据恢复，不授个人或组织业务访问。Tenant 已建立而 Account 激活未完成时仍保持 pending，个人租户及成员事实保留，不作静默回滚。init 的 pending 期间部署未建立，signup 不开放；signup 本身不创建组织成员。独立组织入会有其自身准入政策，不能以 pending 身份绕过业务门。

**ACR-03（F 的受信读取与 Tenant 创建）**：Account 唯一凭据绑定确认后发行不可变 F；Tenant 在门外从当前受信 Account 服务读取完整 F，核服务身份、版本、sourceRef、entryKind、UserRef、target 映射与本次受信入口。F 缺席、来源不可核实或 Account 暂不可达时保持 pending，不以缓存或客户端 DTO 代替。完成本代读取并冻结 F 后，Account 该实例暂时离线不撤销本次准备；host/owner/writer 换代使旧准备失效，新代须重读同一 F。F 同 ref 异内容是完整性冲突并封闭创建。Tenant 依 TG-01 生成 T/C，在 CC-03 当前代短门核已核实目标流空前态、当前代资格和唯一 owner，以普通单租户 DR-01 一批写入个人租户与唯一 active owner；不同 F 同 UserRef/target 时仅一 T 可成为流创建者，另一 T 明确冲突，绝不认回他人的结果。

**ACR-04（激活屏障）**：组合只有取得 Account 身份/凭据绑定的耐久确认、Tenant 对同一 F/T/UserRef/target/个人租户/唯一 owner 的完整耐久证明，以及 CC-06 当前代可消费 owner publication，才能请求 Account 从 pending 转 active。Account 在转移时重核全部绑定；相同证明可认回，异来源、异 owner 或不完整证明拒绝。对外 init/signup 成功仅在 active 可再读、init 的部署建立亦可核实时成立。Tenant 的逻辑占位、待 fsync 回执、暂时 `not_seen`、历史 `committed_blocked` 或客户端自报不构成激活依据。

**ACR-05（未知与认回）**：Account A 或凭据写入 unknown 先从 Account 权威核实，不新建 A 或 UserRef；F 已发行后 Tenant T 的写入/回执 unknown 只按 T 与 C 查询。暂时 `not_seen` 不证明未提交；不换 sourceRef、T、target 或 C，不发送第二批。仅独占恢复核实旧 writer 完整前缀、证明 T 未提交并安全解除占位后，才能同 T/C 重备。已提交而 owner publication 失败时，原 completion 保持 `committed_blocked(owner_publication_required)`；只由 CC-06 受信宿主在新代一次安装覆盖该位置的全部 owner roots，随后查询另给可消费证明。Account 激活 unknown 按 A 与原证明认回；未核实前对用户显示 pending/unknown，不能报告成功。

**ACR-06（重启与推进责任）**：Account 可枚举已接纳的 pending A/F；恢复协调者从该权威枚举和 Tenant T 结果重建待推进集合，不依赖另一份耐久 intent、outbox 或执行租约。并发推进者在 CC-03 当前代门与 T 去重下只能使同一 T 成立一次；旧 generation 的准备不能提交。Account 缺席或来源损坏时不推进新创建；Tenant committed 后 Account 缺席则保留已建个人租户和 pending，待 Account 恢复再核实激活。重启后先核 Account A/F、Tenant T 的完整前缀及 CC-06 本代基线，不能凭进程内缓存推断进度。已完成 A 重试仅认回历史结果；租户后来 closing/closed 时不重建、不恢复业务权限。

**ACR-07（后续业务准入）**：active 账号的会话仍须在每次受保护交互验证；租户范围请求另核明确目标、当前成员/所有权和资源 owner。CLI 账号切换或组织选择不改变历史 Session owner、账号级设置或额度归属。

## 失败后的所有者

| 阶段 | 可核实后果 | 未知或缺席时的接续责任 |
|---|---|---|
| Account A 与凭据 | pending 身份、唯一绑定与 F 各自耐久确认 | Account 沿 A/凭据原操作核实，协调者查询 pending；未确认绑定不发行 F |
| Tenant 受信读取 | 本代冻结的完整 F，未产生第二持久事实 | Account 暂缺席则等待；换代重读，错内容封闭 |
| Tenant T 提交 | 单目标 tenant 流的个人租户与唯一 owner 同批提交，并由本代证明可消费 | Tenant 沿 T/C 核实 unknown、冲突与 publication；协调者保留 pending 激活责任 |
| Account 激活 | active 可再读；init 还须部署建立可核实 | Account 核实转移，协调者不得提前报成功 |

[规范场景](scenarios.md)固定 init、signup、同/不同 UserRef 竞争、来源冲突、unknown 和 publication 恢复。现有 [AccountRegistration.tla](formal/AccountRegistration.tla) 按旧抽象建模，不证明本版 F 直读、T 单流及 init 共同链；新行为模型和真实提供者符合性分别登记覆盖，不因候选文字宣称已验证。
