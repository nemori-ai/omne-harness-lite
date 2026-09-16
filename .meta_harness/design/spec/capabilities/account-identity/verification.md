# 产品账号身份 v1 验证与缺口

本坐标是候选；[规范场景](v1/scenarios.md)和 [F Schema](v1/schema.json)不是 provider 通过证据。D-016 固定独立能力与成熟嵌入式认证 provider 方向，不等于采用特定库。

| 范围 | 待取得的证据 | 当前状态与消费者 |
|---|---|---|
| AI-01/04 A/digestA、UserRef/sourceRef 不复用 | 同键重复/异输入、并发、凭据标识规范化与碰撞、重启认回 | 未执行；ACR/Tenant 依赖 |
| AI-02a F 的发行与无秘密边界 | 凭据唯一绑定后才发行、unknown 不发行、F Schema 正负例、同 ref 内容不变、目标重算、旧实例不能伪造 | 未执行；Tenant TG-01 依赖 |
| AI-08 首账号位置 | Account/Tenant 已核实空根、独占 init 资格、pending 不自动释放、unknown 与重启、初始 active 后开放 signup | 未执行；部署建立依赖 |
| AI-02/05 pending→active | 同 F/T/target/owner 与 CC-06 本代可消费证明、激活 unknown 认回、错证明拒绝 | ACR 候选场景；真实组合未执行 |
| AI-03/06 登录与退出 | 密码处理、会话过期/撤销、旧 token 跨进程/重启重放、logout 原操作窄认回证明 | 未执行；业务门依赖 |
| AI-07 账号切换 | 两账号、多租户设置/资产/额度与缓存归属 | 未执行；资源 owner 依赖 |

后续证据须绑定本候选精确修订和真实 provider/装配。现有旧 ACR 行为模型不覆盖 F 直读及初始账号链；新模型与真实故障实验分别登记。
