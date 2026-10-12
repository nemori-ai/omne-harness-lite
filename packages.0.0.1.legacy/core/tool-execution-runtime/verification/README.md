# 工具执行验证义务

[公共SPEC](../SPEC.md)约束当前接口与行为。[有限协议模型](models/README.md)保留原模型、配置和成立前提。模型只覆盖其明确表达的执行、终局、交付及恢复关系。

日志提交、租户授权、context读取、管理关闭及真实执行者停止沿实际提供者的测试与组合验证。模型未表达的当前增量不能从模型通过推导为已验证。

正配置须完成模型检查，负配置须命中所选原性质。超时、语法错误和工具失败均不记通过。输出与本轮报告放工作树tmp。

## 原发起参加与结果来源

original-issue.ts和result-custody.ts的形状及类型外行为归[公共SPEC](../SPEC.md)。
选中的实际提供者必须以真实AtomicStorage、Session Log及原结果存储验证以下义务。

| 义务 | 必须观察的反例或原结果 |
| --- | --- |
| 原意图、唯一claim与Session栅栏同提交 | 参加者不另开事务；任一拒绝／异常全批回滚；复制claim、异Storage、旧permit和当前资格拒绝均不进入作者 |
| commit之后才issued／launch | 在真实提交前及提交返回丢失时不启动；并发消费只准原owner一次，alreadyIssued／alreadyConsumed不取得第二启动权 |
| 暖态consume回执丢失 | 只有已核原作者未进入、无原任务／writer且作者入口已关闭，才沿原unavailable终局收场；缺证明继续保管，不重新执行工具 |
| 实际stopped | 原任务和所有writer已结束、借用已归还；completion、日志终局或observer.release不能代替；归还失败不返回stopped成功 |
| 完整结果来源及引用 | 核同一原终局／账／DeliveryBasis及作者返回所必需的stored，全引用可持续取用；伪造、缺失和异值拒绝，原job关闭后仍可读取 |

现有Execution模型表达持久意图先于作者、至多启动和终局交付的有限关系，
不表达新claim的同Unit身份、consume回执丢失或实际引用／writer寿命。
这些增量不得沿旧模型通过冒称已验证。
实现同Unit参加及暖态收场时，提供者须将实际交错映到该协议；
相称的故障／并发测试至少覆盖上表。若论证依赖新增时序或独立状态，须补对应拥有者的有限模型及去保护负控。
不能把待验证的SQL原子性、无在途作者或writer停止直接当作前提补绿。
