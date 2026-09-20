# 产品账号身份 v1 规范场景

以下场景解释 [AI-01～AI-08](contract.md) 的可观察边界；均为候选规范，不是已运行测试。真实 provider、CLI 与 Tenant 组合仍需独立验证。

| 情形 | 必须可观察的结果 |
|---|---|
| 一个准入注册请求提交后回执丢失，再用原操作和原输入重试 | 认回同一个 `UserRef`、固定个人租户目标与 pending/active 进展；不产生第二账号。 |
| 注册提交 unknown 且权威尚不能核实原操作是否存在 | 状态查询仅返回 unknown 和接续方式，不虚构或泄露 `UserRef`/tenant target；后续核实才披露已绑定目标。 |
| 原操作 ID 配异输入，或另一个账号恰由同一现实人持有 | 前者冲突且不新分配；后者仍是独立 `UserRef`，不得因为现实人、OS 用户或磁盘位置相同而共享事实。 |
| 两次注册的标识经当前 provider 规则规范化后等价，或登录输入使用不同但等价的写法 | 注册不得建立两个占用同一规范标识的账号；登录必须解析到同一既有 `UserRef`，不能因 provider 的别名规则产生另一映射。开发阶段的用户名只是此场景的一种实现。 |
| 账号已经分配、Tenant 个人租户未耐久 ready，或其结果未知 | 账号保持 pending；不能以它登录取得个人业务权限，也不能报告注册成功。重启后从原操作和固定目标继续核实。 |
| 账号已分配 pending，但凭据唯一绑定还未耐久确认 | 不发行 F；Tenant 不能凭 pending 行、客户端 `UserRef` 或目标字符串建立租户。adapter 仅按已耐久固定的同 A 查询或重试，不换 UserRef/sourceRef。 |
| provider 已按 A 耐久绑定 subject，Account 尚未写完 A↔subject 映射时崩溃 | 重启先查询同 A 得 `bound`，再耐久补全原映射和 F；不生成第二 provider subject、UserRef 或 target。若查询仍 unknown，不凭暂时 not_seen 重试或发行 F。 |
| provider 权威确认规范标识已绑定另一 A | 原 A 终局 `rejected_credential_conflict`，保留身份墓碑，无 F/T；重复 A 认回同一拒绝。init 只有确认此终局且无可推进绑定后才允许新的受信 A 争首位。 |
| 同 F 目标已由另一 T 耐久创建 | 原 A 查询 `blocked_personal_target_conflict`，F 与 A 保留，不借他人的结果激活，也不换目标。另一 T 仅预留未耐久时仍是待核实，不提前报确定冲突。 |
| AI-02a 的 F 已发行，随后 Account provider 换代、退出登录或关闭新注册入口 | 相同 sourceRef 仍认回逐字段相同 F；旧 provider 实例不能追加或伪造新 F，Tenant 新代须受信重读。历史 F 不授业务准入。 |
| 同一 sourceRef 返回不同字段，或 F 含密码、verifier、离线可猜摘要、seed、A/digestA | 前者封闭交付并报完整性冲突；后者违反 F Schema 和 AI-02a 的无秘密边界。 |
| F 的 sourceRef 或 UserRef.userId 含非 ASCII、空值、不成对 surrogate，或 target 不等于 TG-01 重算值 | 前者被 F Schema 拒绝，后者由 Tenant 拒绝；不能以不同编码生成第二个 T/target。 |
| 部署首次 `init` 给出受信 seed，但 Account 尚未耐久分配初始 `UserRef` 和唯一凭据绑定 | Tenant 不得把 seed 当 UserRef；Account 在权威空根、本代独占资格下以 A 占首账号位置，发行 F 前保持 pending，重试先认回同 A。 |
| pending init 已接纳，凭据提交 unknown 或进程重启 | 首账号位置仍占用；沿同 A 核实，不因文件缺失或暂时 not_seen 报 fresh。只有权威证明 A 未提交或确认原 A 终局凭据冲突且无 F/可推进绑定后，新的受信 A 才能争首位。 |
| pending 账号以有效凭据登录查询原注册 | 至多得到 `registration_only` 的受限会话；个人、组织业务门拒绝它，不把查询能力当作 active 证明。 |
| Tenant 提供同一账号、固定目标、个人 owner 与耐久 ready 的可信证明；证明回执再丢失 | 账号至多一次变为 active，重复核实认回 active；异目标或仅有部分事实的证明不得激活。 |
| active 账号登录，随后新进程验证会话 | 验证稳定返回同一 `UserRef`；业务仍须另核验目标 tenant、成员和资源 owner。 |
| 当前态 logout 返回成功，旧 token 或缓存 cookie 从另一进程及重启后重放 | 新保护交互均拒绝；本地槽清除但服务端仍接纳旧凭据的实现不符合。 |
| logout 原操作提交后会话已撤销、成功回执丢失 | 使用事先持有的本次退出认回证明只查询原结果，不要求旧会话重新获得业务授权；异输入/异会话不能认回该结果。 |
| logout 的服务端结果未知、CLI 已清空当前槽 | 用户看到 pending/失败，本机不再使用该槽；不得把槽清除显示为确认成功，重试查询原撤销结果。 |
| 本地账号 A 切换为 B，同时选定 B 的组织；读取 A 的 settings/skills 或个人额度 | A 的会话、成员、缓存均不能成为 B 的授权依据；按 B 的可信身份及目标资源声明重新核验。切换组织也不把 B 的账号级设置变成组织设置。 |
| 会话权威在重启时不可读，或旧会话已到期 | 新业务准入拒绝；恢复核实后按原状态判断，不从本机当前目录或缓存推断有效。 |

首版自助注册、账号密码和可撤销会话已确定；用户名仅供早期本地开发快速迭代，正式生产版标识未决定。账号恢复、具体滥用防护、独立设备的撤销范围以及跨 owner 恢复细则仍需后续设计与验证。
