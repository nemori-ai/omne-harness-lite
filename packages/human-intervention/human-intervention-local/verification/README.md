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

Identity 撤权协调、池分页、运行时名额和完整应用服务尚未实现或验证，不纳入以上通过范围。
