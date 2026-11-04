# grant 到 attempt 解析模型的运行记录

本页记录 [AttemptGrant.tla](AttemptGrant.tla) 的 TLC 运行：版本、参数、结论与判读。判读规则按 [docs/verification.md](../../../../../docs/verification.md#环境与实际执行)：正控要得到 TLC 的完成结论；负控要命中配置点名的那条性质。结论只在所列范围内成立，不表示实现符合模型；实现侧的对应用例是 session-storage-sql 与 session-adapters 的 `tests/attempt-grant.spec.ts`。

## 工具与参数

| 项 | 值 |
| --- | --- |
| 运行环境 | WSL 2 `Ubuntu-24.04`，经 `wsl.exe -d Ubuntu-24.04 --exec bash -l <驱动脚本>` 调用。驱动脚本把本目录复制到 WSL 自己的文件系统，再运行 [run-tlc.sh](run-tlc.sh)；临时目录在运行后删除 |
| 源码 | 分支 `PanQiWei/rw2-jo-bridge`，提交 `174085c6a` 之上本资源入库前的工作树 |
| JDK | Temurin `21.0.12.1+1` LTS |
| TLC | `TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)`，tla2tools 1.7.4。JAR SHA-256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88` |
| 模型 | `AttemptGrant.tla` SHA-256 `0a6148a6c4adea0d2ae25f1adfe5645895078e9768e2d38814e7a6f431adff13` |
| 参数 | 广度优先；`-workers 4`；`-Xmx2g`；`-deadlock`（发完回执是合法终止）；每个配置单独 `-metadir` |
| 预算 | 每配置 600 秒。两份都在 1 秒内结束 |
| 时间 | 2026-11-04 18:02（北京时间） |

常量：`positive.cfg` 取 `MaxAttempts = 3`、`MaxReceipts = 6`、`StartedOnly = FALSE`；`negative-started-only.cfg` 取 `MaxAttempts = 2`、`MaxReceipts = 4`、`StartedOnly = TRUE`，只检查 `GrantResolves`。

## 运行结果

| 配置 | 配置 SHA-256（前 12 位） | 开关 | 期望 | TLC 结论行 | 退出码 | 生成 / 不同状态 | 判读 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `positive` | `21f08604f042` | 无 | 无反例 | `Model checking completed. No error has been found.` | 0 | 42 / 42，深度 7 | 正控通过 |
| `negative-started-only` | `bf604d7d691d` | `StartedOnly` | `GrantResolves` | `Invariant GrantResolves is violated.` | 12 | 6 / 6，深度 4 | 负控命中 |

正控检查 `TypeOK`、`GrantResolves`、`StaleStaysStale`（不变式）与 `IndexAtCommit`（动作性质）。

## 反例的决定性内容

`negative-started-only` 的反例是四个状态：开始 attempt 1（回执 1 入索引），attempt 1 下提交一次（回执 2，只记 started 时不入索引；此时 Run 只有一个 attempt，回落答 1，仍正确），开始 attempt 2（回执 3 入索引）。此时回执 2 解析为 unknown，不等于发出它的 attempt 1：缺陷在第二个 attempt 出现时才显形。这正是 R2-D349 之前生产 `attemptOf` 的形状。
