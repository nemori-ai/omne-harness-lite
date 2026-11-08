# 权限关系验证

在仓库根执行 `pnpm --dir packages/assets/permissions run build`，再执行 `node packages/assets/permissions/verification/check-oracle.mjs`。需要 Node.js 24 及以上和 Python 3.10 及以上；默认 Python 命令为 python3.12，`PYTHON` 可指定其他解释器。

`oracle-cases.py` 导入 [HJ0 check-semantics.py](../../../human-intervention/human-intervention/verification/check-semantics.py) 的 `permission_relation`。它不调用其中的参考求值算法，也不复制生产算法。生产入口由 `check-oracle.mjs` 从本包 dist 导入。

| 关系分区                              | 案例数 | 生产映射                                                                           |
| ------------------------------------- | -----: | ---------------------------------------------------------------------------------- |
| bounds-picks-comparison               | 393216 | 外部允许集、两个锁界、四层挑选和两种距离或无比较                                   |
| default-and-three-active-prohibitions |  16384 | 三个主动禁止事实映射为独立具名 prohibition 约束                                    |
| required-source-missing               |  12288 | 必要来源缺失映射为未满足的 requiredConstraintIds；不可读锁/外界为 unavailable 约束 |
| declared-strictness                   |   4096 | 正序与反序的显式严格度                                                             |
| invalid-input                         |      1 | 非法输入                                                                           |

合计 425,985。两个锁界分别交入默认规则和组织来源，外界单独交入 constraint。oracle 将主动禁止事实与挑选值独立建模，因此这一映射中的三个值都设为 permitsOperation true，禁止单独交入。它证明集合、选择和禁止优先级，不证明值到主动禁止的翻译。后者由 [rules.spec.ts](../tests/rules.spec.ts) 对组织、租户、会话各自验证。

追加 `--witnesses` 可单独执行 HJ0 的 11 个具名关系见证。源码变异在构建后调用此入口，对关键错误取得生产结果与关系期望不一致的反例。

来源缺失分区证明必要来源未齐时的结果，不替代实际声明缺失/身份绑定测试。公开测试另覆盖来源不同、未知档位、工作区配值、非均匀距离、缺比较、同 key 不同 origin、资产声明、Settings 元数据和替换缺声明。

具名源码变异的原始日志留在获准任务 tmp。每个变异均重建 dist，再运行公开入口测试，最后按原字节还原。有限关系案例和变异均不证明注册权、并发、持久性或真实执行关口。

作者上界的投影前提、单调性论证与公开边界守护见 [author-bound.md](author-bound.md)。

配值编辑与执行资格的区别、确定限制的安全性及有限组合守护见 [assignment.md](assignment.md)。该检查不证明生产来源或提交原子性。
