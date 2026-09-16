# 账号建立组合验证与缺口

本坐标仍是候选。旧 [AccountRegistration.tla](v1/formal/AccountRegistration.tla) 的有限结果只支持旧单操作抽象，不能证明本版 F 直读、T/C 单流、init→signup 门或不同来源竞争；详细边界见 [formal README](v1/formal/README.md)。

| 条款 | 必要证据 | 当前限制 |
|---|---|---|
| ACR-01/02 首账号与凭据 | 已核实空根、本代独占 init、A/digestA 认回、凭据唯一绑定后才有 F、初始 active 后开放 signup | 场景已写；真实 provider 未验 |
| ACR-03 F→T/C | 当前代受信读取、F 同 ref 内容不变、sourceRef→T 与 UserRef→target 注入性、同 UserRef 两 F 冲突、不同用户独立 | 新形式模型待纳入本目录；真实联合实验未验 |
| ACR-04/05 激活与 unknown | pending、T committed/blocked、本代 CC-06 可消费证明、A/T 回执丢失、错证明拒绝 | 旧模型仅旧抽象；新链未验 |
| ACR-06 恢复 | Account 枚举 pending/F 驱动继续、T 完整前缀、换代重读、无另一个 durable intent、Account 缺席保留责任 | 新模型和真实重启实验未验 |
| ACR-07 当前业务隔离 | 两账号、多组织、会话/成员/资源 owner、历史完成与当前关闭状态 | 未执行 |

模型检查只说明被建模状态空间内的性质；真实认证、存储和装配符合性须单独证明。
