# 账号建立组合验证与缺口

本坐标仍是候选。[AccountRegistration.tla](v1/formal/AccountRegistration.tla) 的四项有限 TLC 任务覆盖 init→signup、F 直读、T 单流和同 UserRef 竞争的抽象；[formal README](v1/formal/README.md)列出实际状态数和前提。provider A↔subject 崩溃认回、确定凭据冲突的终局及 Account 对目标冲突的阻断分类仍在模型外。

| 条款 | 必要证据 | 当前限制 |
|---|---|---|
| ACR-01/02 首账号与凭据 | 已核实空根、本代独占 init、A/digestA 认回、先固定 A 再由 adapter 同键原子绑定 provider subject、已写 provider 未写 Account 的恢复及确定凭据冲突 | 模型检查先绑定后发 F 的抽象；真实 provider 与冲突终局未验 |
| ACR-03 F→T/C | 当前代受信读取、F 同 ref 内容不变、sourceRef→T 与 UserRef→target 注入性、同 UserRef 两 F 冲突、不同用户独立 | 四项模型覆盖有限抽象；实际编码、Schema 与真实联合实验需另验 |
| ACR-04/05 激活与 unknown | pending、T committed/blocked、本代 CC-06 可消费证明、A/T 回执丢失、确定目标冲突的 Account 阻断分类 | 模型覆盖 Tenant conflict；Account 阻断分类及真实恢复未验 |
| ACR-06 恢复 | Account 枚举可推进 pending/F、T 完整前缀、换代重读、终局/阻断退出自动推进、Account 缺席保留责任 | 模型覆盖有限崩溃交错；真实重启与 provider 原键认回未验 |
| ACR-07 当前业务隔离 | 两账号、多组织、会话/成员/资源 owner、历史完成与当前关闭状态 | 未执行 |

模型检查只说明被建模状态空间内的性质；真实认证、存储和装配符合性须单独证明。
