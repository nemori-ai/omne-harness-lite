# 原执行当前性的局部证明

对应 [同事务原执行修订核回](../../SPEC.md#同事务原执行修订核回)。这是条件式手写证明。它不证明原 Agent 资格服务已正确装配、权限捕获或未来实际发起，也不声明机器检查完成。

## 关系、函数与不变量

E 的键为 tenant 与 execution，行含 session 和 revision。输入 x=(t,s,e,r)。G(x,E) 在输入不合法时返回 unsupported；E(t,e) 缺失或其 session/revision 不等于 (s,r) 时返回 conflict；其余情况返回 current(x) 并提供本事务 fact。

G 仅有一条 SELECT，不改变 E、执行事实或共同历史根。主键唯一性排除同键多个版本。采用现有主键点读，不扫描历史；实际 SQLite 查询计划必须包含按 tenant/execution 的 SEARCH，不能退化为 SCAN。

## 并发证明

前提一：影响 Agent 动作资格的原执行更新推进同一 er_execution.revision，且版本不复用。前提二：观察 Q 通过原 owner 取得 r 及原执行归属。前提三：guard 与消费者在同一事务域提交，外部写串行；同事务 er_execution 发布先于 guard，之后没有可修改此表的参加者。

外部变更先提交时，当前修订不同于 r，G 返回 conflict，Storage 撤销本笔所有写入。捕获先提交时，在 guard 至 COMMIT 之间没有执行变更，fact 在捕获时成立；随后外部变更不抹去原捕获事实，但禁止把它当作下一次发起的当前许可。

同笔发布先执行时，G 看到新修订。旧观察导致整笔回滚，发布与耦合写均不可见。若原发布被改到 guard 之后，这一证明失效，因此同笔变更必须作为持续反例守护。重复 operation 的旧回执可被 Storage 认回，认回不重新执行 G；消费方不得从回执存在推导当前状态。

## 实现守护与限制

`tests/execution-current-guard-real.spec.ts` 在真实 SQLite Worker 验证原修订匹配、错租户/会话/执行/修订、只读不改历史、旧依据回滚耦合输入、同笔执行变更回滚、新依据提交、关闭重开和旧回执认回。原执行事实为显式夹具；实际 Journal 版本映射另由应用的 Agent 资格组合验证。

`tests/execution-current-guard.spec.ts` 固定静态读表权限、fact 完整定位和非法输入不读写。运行上述两个文件及 `tests/participants.spec.ts`；目录完整快层承担材料登记回归。单次输出留任务 tmp。这里没有跨进程故障、断电耐久或无限活性结论。
