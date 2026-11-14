# 权限关系的对照

规则归包组规格的[权限：上界、挑选与主动禁止](../../SPEC.md#权限上界挑选与主动禁止)。有限参考关系是 [permission_relation.py](permission_relation.py) 的 `permission_relation`；[oracle-cases.py](oracle-cases.py) 只用这份关系生成案例，不调用其中的参考求值算法，也不复制生产算法。[check-oracle.mjs](check-oracle.mjs) 从本包 `dist` 导入生产入口，逐案比较生产结果与关系期望。

| 规格规则                             | 关系分区                              | 案例数 | 生产映射                                                                            |
| ------------------------------------ | ------------------------------------- | -----: | ----------------------------------------------------------------------------------- |
| 锁定集合取交集、挑选次序、最近档回退 | bounds-picks-comparison               | 393216 | 外部允许集、两个锁界、四层挑选和两种距离或无比较                                    |
| 主动配置的不允许不被下层放宽         | default-and-three-active-prohibitions |  16384 | 三个主动禁止事实映射为独立具名 prohibition 约束                                     |
| 必要来源缺失时不产生允许             | required-source-missing               |  12288 | 必要来源缺失映射为未满足的 requiredConstraintIds；不可读锁或外界为 unavailable 约束 |
| 有序分档按显式严格度比较，不猜       | declared-strictness                   |   4096 | 正序与反序的显式严格度                                                              |
| 非法输入有确定答复                   | invalid-input                         |      1 | 非法输入                                                                            |

合计 425,985 案。两个锁界分别交入默认规则和组织来源，外界单独交入约束。关系把主动禁止事实与挑选值分开建模，所以这一映射里三个挑选都设为允许操作，禁止单独交入：它证明集合、选择和禁止的优先级，不证明「值」到「主动禁止」的翻译；那一步由 [rules.spec.ts](../tests/rules.spec.ts) 对组织、租户、会话分别验证。带 `--witnesses` 时另跑 11 个具名关系见证。

来源缺失分区证明必要来源未齐时的结果，不替代声明缺失与身份绑定的用例。有限关系案例不证明登记权、并发、持久性或真实执行关口。确定限制与作者上界的论证见 [proofs/assignment.md](proofs/assignment.md) 与 [proofs/author-bound.md](proofs/author-bound.md)。
