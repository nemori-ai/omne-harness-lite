# verification

本目录承载本包的持续验证资源：验证义务、模型、论证或证明。

## 允许的内容

[obligations.md](../docs/verification-obligations.md) 的验证义务，`models/` 下的形式模型，`proofs/` 下的论证或证明，以及说明文件。

## 边界

每份资源说明所验证的性质、前提、运行命令、覆盖与限制。义务是后继实现必须通过的可观察结果，不是已运行的证据。单次运行的原始输出与基准读数留任务 tmp，不进本目录。数值进入 [SPEC](../SPEC.md) 的声明边界之前不写进义务。

## 维护

被验证的承诺变化时，同步义务、模型、证明与本目录 `index.md`。[SPEC](../SPEC.md) 的条款编号变化时，先改义务表的「条款」列。

## 本包事实

- 验证义务在 [obligations.md](../docs/verification-obligations.md)：组 D 派生等于重算，组 R 读路径的复杂度与退化，组 W 写路径与并发写裁定，组 F 失败分类与耐久。
- 符合性套件的规则在 [SPEC 的符合性](../SPEC.md#符合性)，派生等于重算的检查方式是影子表集合差。
- [attempt-grant/](attempt-grant/README.md) 是 grant 到 attempt 解析的有限模型（R2-D349）：索引在提交时写入，读时不推断；负控复现只记 `started` 回执、回落到唯一 attempt 的生产读法在第二个 attempt 上的失败。
- [log-commit/](log-commit/README.md) 是同日志提交与未知结果认回的有限模型。[原执行当前性](proofs/execution-current.md) 是只读修订核回的局部证明，实际 Worker 守护不授予跨领域捕获接受。候选模型仍包括两个进程对同一 `tail` 的并发提交裁定（[W6](../SPEC.md#w6)）。
- 现有用例在 `tests/`，跑在 `node:sqlite` 夹具上，不覆盖 sqlite-provider 的 Worker、持久与关闭（[tests](../tests/README.md)）。义务表里的各组大多尚未实现。目标前提是真实 SQLite 或 PostgreSQL 提供者，没有内存替身。
- 断电耐久归 [SQL-T01](../../../../docs/architecture/deployment/infrastructure-policy.md#sql-t01) 的承接方，本目录不记录耐久证据。
