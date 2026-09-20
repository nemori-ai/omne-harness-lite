# 账号与租户的组合链

| 触发与稳定点 | 当前责任者 | 交接与失败边界 |
|---|---|---|
| 注册请求取得准入结果和稳定 `UserRef` | 账号身份 | 首版允许能使用部署的人自助注册；同一原操作重试认回身份，输入不合法、结果未知与凭据冲突分别报告。身份先处于 pending，不授予个人业务准入。 |
| 建立该账号唯一的个人租户与 owner 成员 | Tenant，注册组合保留推进责任 | Account 唯一凭据绑定后发行 F；Tenant 本代受信读取，稳定派生 T/C 与目标，在单目标租户流提交。init 与 signup 共用创建机制，受信入口前提由 Account 分别判定；未知按原 A/T 核实，不另造目标。 |
| 宣布注册可用 | 账号身份与跨 owner 协调者 | 仅在个人范围 ready 经核实后激活；回执丢失能以原操作认回，不把 pending/unknown 伪装为成功。 |
| 登录并使用资源 | 账号身份、Tenant 与资源 owner | 会话先验证并绑定 `UserRef`；租户范围操作再核验明确目标 tenant 及当前成员/所有权；资源 owner 判定对象范围。CLI 缓存和本地目录不能替代这些门。 |
| 退出当前登录态 | 账号身份及本机凭据槽 | 只有服务端当前态不能再授权新交互，才返回成功；结果未知时本机封闭继续使用并可核实。既有运行工作和外部效果仍由原 owner 收口。 |

Account A 与 Tenant T 是两个稳定原操作，不要求同事务提交；[D-021](../../decisions/account-personal-local-creation/decision.md)及[注册组合](../../spec/compositions/account-registration/v1/contract.md)固定来源、恢复和成功屏障。应用的第二 CLI 进程如何连接唯一 writer、呈现当前账号及目标租户，仍是装配缺口。
