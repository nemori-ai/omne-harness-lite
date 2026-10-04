# 身份装配生命周期候选的机制取证

2026-10-04 在 BASE `588628544ab92bd542f24efa1801634eb6eee56e` 工作树执行。
这是 R1-D0 候选的主线机制探针，不是产品实现、独立 QA 或技术接受。
环境、命令和精确输入/产物散列见 [run.json](run.json)，命令从仓库根执行。

| 实际运行 | 结果 | 边界 |
|---|---|---|
| [Cordis 原始探针](cordis-probe.mjs)／[输出](cordis-probe.stdout) | 六项断言通过；包含两个真实机制反例 | Cordis 4.0.4；配置、实际 fiber、逆序等待、吞清理错误和缺少排空屏障 |
| [候选机制探针](lifetime-probe.mjs)／[原型](lifetime-prototype.mjs)／[输出](lifetime-probe.stdout) | 管理关闭保住后半程 CAS；直接关闭负控丢失 CAS；双失败、部分 setup 与第二代拒绝通过 | 真实 Cordis/Service/注入/撤除，业务是受控异步替身，不是真实 TLS/SQLite |
| [有限状态枚举](lifetime-model.py)／[输出](lifetime-model.stdout) | 正配置 127 状态、208 转移无反例；三负控分别命中提前关闭、旧开闸资格和隐藏失败 | 三行、每行至多一个在途工作，整代关闭；不是 TLC/Alloy，也不证明全部运行实现 |

第一轮 Cordis 探针因 Node assert.rejects 不接受 Cordis thenable 中止。
[原输入](cordis-probe-first.mjs)及 [原错误](cordis-probe-first.stderr)保留。
只把断言包装改为 async 函数后重跑，没有修改产品或 Cordis。

模型的 ready 与业务完成抽象成外部动作，close 的拒绝被假定发生在已静止之后。
模型未包含恶意插件、进程崩溃、操作系统损坏、无法返回的外部工作、真实 guard/SQLite 或 arbitrary dependency graph。
枚举检查安全性质。进展额外要求 ready、已接纳工作与 close 最终返回，并由调度公平执行关闭步骤。
不据状态数宣称无条件活性证明。

候选原型只验证责任安排，不是可发布实现：它没有完整 shape 校验、未登记 apply 检测、
slot 类型、资源注册规则或真实业务提供者适配。其字段拼写不是公共协议权威。
负控故意绕过协调器的 close 通道；即便关闭报告为 complete，也无法保护此前已被非法关闭的依赖。
正式提供者必须满足“实际资源只有一个关闭拥有者”，并由独立实施审阅及真实组合验证。

后续必须完成候选独立 Choice、表达与施工审阅，再进入实施。
T2/T3/T4 各自仍须完成真实产品组合、独立 L3 与干净检出 QA。
本证据没有关闭原 45 秒冷恢复问题、PostgreSQL 恢复或任何领域验收。
