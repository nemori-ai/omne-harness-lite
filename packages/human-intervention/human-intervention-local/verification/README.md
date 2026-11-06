# 持续验证

## 允许的内容

本包承载单机事务与恢复实现的验证映射。跨提供者的状态模型仍由[公共 HITL 验证](../../human-intervention/verification/README.md)拥有，不在此复制模型。

## 边界

真实 SQLite 测试证明被执行场景中的事务和恢复行为，不证明物理断电耐久、任意规模或完整运行时接入。独立验收和逐次日志留任务 tmp。

## 维护

运行本成员 build、typecheck 与 test:fast。更改事实依赖、操作结果或等待状态时，同步下列映射与反例。

## 本包事实

| 不变量 | 持续检查 |
| --- | --- |
| 封口排除迟到提交，缺记录不等于失败 | [terminals.spec.ts](../tests/terminals.spec.ts)、[requests.spec.ts](../tests/requests.spec.ts) |
| 请求、等待与收件箱同提交或同回滚 | [requests.spec.ts](../tests/requests.spec.ts) 的缺参与者和晚失败场景 |
| 竞争答复至多一个决定，已答历史不被终局擦除 | [requests.spec.ts](../tests/requests.spec.ts) 的并发及终局场景 |
| 旧代不能消费，全批完成前不能恢复 | [requests.spec.ts](../tests/requests.spec.ts) 的重启、换代及批次屏障场景 |
| 原方法和完整结果可以认回，确定拒绝不变成成功 | [requests.spec.ts](../tests/requests.spec.ts) 的结果读回、CAS 失败及损坏记录场景 |

[identity.spec.ts](../tests/identity.spec.ts)使用真实 IdentitySql 与 SQLite 验证撤权先赢、提交先赢、目标离线与恢复、回执丢失、主体伪造以及关闭排空。ID-19 只覆盖成员关系及具名资格。运行时名额、更广的权限保护向量和完整应用服务不纳入以上通过范围。


[queries.spec.ts](../tests/queries.spec.ts)使用真实 IdentitySql/SQLite 覆盖请求与卡片披露、分页重装配、过滤/位置/actor/密钥绑定、篡改、快照变更、读取中撤权、关闭排空及65个请求跨扫描预算续页。故障适配只延迟或拒绝真实存储端口，不替换业务决定。

## 固定修订下的分页不变量

令 R 是修订 v 下按登记序号排序的请求序列，C(r) 是请求内有序卡片，F 是固定过滤与原拥有者受众谓词。位置 p=(after,offset) 划分已扫描前缀和未扫描后缀。初始位置 (0,0) 的已扫描前缀为空。

一次 selectPoolCards 只从 offset 起检查卡片。达到页容量时返回最后检查位置的后继；读完请求时将 after 推至本请求序号并将 offset 置零。拒绝受众或过滤不匹配也只向后推进。因此在 v 和受众不变的前提下，每次续页处理严格不相交的后缀前缀，符合 F 的卡片不会重复或遗漏。64次扫描预算只截断本次计算，游标保留未处理后缀。

每次请求读取与修订读取属于同一个 SQL snapshot；请求写入同时递增修订。扫描前后比较 v，发现变化则不返回混合页。此论证依赖数据库快照合同、修订不回退和独立等待准备受众不可变，不是任意外部提供者的证明。HMAC 绑定查询上下文，当前资格核验仍须独立执行。测试给出具名反例，不能由有限案例推出任意故障下正确。
