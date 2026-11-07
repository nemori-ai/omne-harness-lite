# 权限读取的来源保管不变量

本论证覆盖 [GL-25](../../SPEC.md#gl-25-权限读取的来源保管) 的持久关系和状态转换。它是源码对应的归纳论证，不是新的机器证明，也不证明实际权限来源或 Agent/Tool 准入已经接通。

## 前提与状态

SqlStorage 将一个拥有者事务的写入原子提交，未提交写入回滚。Settings 来源回执来自受信装配，遵守其公共协议。Governance 是相关表的唯一写者。读取使用同一事务快照。摘要比较以规范编码与哈希不碰撞为前提。

设原操作键为 K，完整命令为 Q，摘要为 H(Q)。原操作状态 O 属于 accepted、submitted、committed、aborted。只有 committed 和 aborted 是终态。

带来源命令的保管状态 C 属于 requested、held(R,S)、settled(R,T)。R 是来源请求，S 是不可变来源快照，T 是 committed 或 aborted。无来源命令没有关联行。函数 R=f(K,Q,SQLDomain) 只依赖已保存的原身份和命令。客户端回执不提供新的计划。

## 不变量与归纳步骤

1. **原请求绑定**。每份已保存回执的 request 等于 f 的结果。接受事务先保存 Q 和 requested 关联行；held/settled 写入均比较完整 request。读回再次核验公共回执 schema、reservationId 和原绑定。因此修改 route、principal、domain、source、attempt 或摘要不能替换原责任。
2. **终态一致**。C=settled(R,T) 蕴含 O=T。唯一 settled 写入先读取原操作并检查该等式；原操作终态不可改变，故后续转换继续保持该性质。损坏行在读回时抛错，不能静默恢复成有效状态。
3. **不复活**。settled 没有返回 requested 或 held 的转换。相同 settled 重传认回；相同请求的迟到 held 只返回既有 settled。晚到 held 可以在 O=aborted 时保存，但来源保管函数不写 O，因此不会复活业务。
4. **快照不替换**。held(R,S) 再收到 held(R,S') 时，只接受 S'=S。公共 schema 验证快照所属 source；完整回执比较阻止同一个保留身份换入另一份材料。
5. **恢复不遗漏**。恢复集合是待决业务、未结算 Identity 和未结算来源三个集合的并集。来源关联行从接受事务起即进入部分索引，仅 settled 回执使它退出。O 进入终态不删除该行，因此来源责任仍可扫描。

不存在已保存 held 的 requested 可以在 O=aborted 后认回合法 settled/aborted。这处理请求尚未到达源或回执丢失的情况，不允许把 not-found 自行解释成 settled。

## 有界归并

两条 SQL 查询分别按相同的完整键顺序取 n+1 个候选。归并比较使用 UTF-8 字节序，与 SQLite BINARY 一致。去重之后取前 n 个。

若任一分支还有未读取候选，则该分支已经返回 n+1 个不同键，归并后的集合至少有 n+1 个键。因此交回的后继游标不会遗漏继续分页的需要。若归并后不超过 n 项，则两个分支均已读尽本次快照中的剩余候选。分页跨事务发生的新记录仍需下一轮从头扫描，不能据此声称全局冻结。

每页 n≤64，最多读一行 scope 加两组各65行候选。来源分支通过完整主键连接原操作。查询计划测试检查两个分支均使用部分索引，没有历史全表扫描或临时排序树。该结论不是吞吐或延迟基准。

## 验证映射与未覆盖范围

- [来源保管测试](../../tests/permission-capture-custody.spec.ts) 覆盖重开、封口后仍可恢复、错绑、提前结算、快照替换、迟到回执和无来源计划。
- [生产 SQL 协调测试](../../tests/sql-coordinator.spec.ts) 覆盖来源阶段保存、授权读取、发送与重传。
- [迁移测试](../../tests/permission-capture-migration.spec.ts) 检查旧行字节、旧阶段、主外键和新增阶段。实际 Worker 安装由 [材料测试](../../tests/materials.spec.ts) 覆盖。
- [关闭测试](../../tests/scope-lifecycle.spec.ts) 检查身份已结算但来源未结算时仍报告 pending。
- [恢复测试](../../tests/recovery-read.spec.ts) 检查有限页、去重责任、历史数据下的查询计划。

未证明的部分包括旧装配摘要下的 pending envelope 重放、来源协调器的活性、外部服务故障、进程强杀、完整权限求值及准入消费者。迁移保留字节不能替代这些验证。
