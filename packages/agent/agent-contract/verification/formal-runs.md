# 收尾协议形式模型的运行记录

本页是 [Finishing.tla](models/Finishing.tla) 的 TLC 运行与轨迹回放的索引。每行写明输入摘要、工具版本、参数、预算、输出与判读。原始日志不进本包，保存在任务过程目录（见“原始证据”）。规模上限与映射见 [formal-mapping.md](formal-mapping.md)，判读规则见 [models/README.md](models/README.md)。

本页的结论只在所列规模上限内成立。它不是证明，也不表示实现符合模型。

## 工具与参数

| 项 | 值 |
| --- | --- |
| 运行环境 | Windows 11 宿主，Git Bash。经 `node scripts/with-test-slot.mjs` 取运行名额后执行 `run.py` |
| JDK | Temurin 21.0.13+9 |
| TLC | `TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)`，即 tla2tools 1.7.4。JAR SHA-256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88` |
| 工具环境检查 | `pnpm run check:formal-tools` 在宿主退出 0，输出同一 JAR 摘要 |
| 参数 | 广度优先模型检查；`-workers 8`；`-Xmx8g`；`-XX:+UseParallelGC`；`-fp 0`；`CHECK_DEADLOCK FALSE`。安全配置使用 `VIEW View`，活性配置不用 VIEW 并取 `Observe = FALSE` |
| 轨迹参数 | 模拟：`-simulate -depth 80 -seed <种子>`，目标不变量被违反时停止。违规轨迹：在 `TraceSpec` 上广度优先求最短反例。两者都用 `-workers 1`：多个 worker 时同一种子的结果不重复。连续两次导出的 `finishing-traces.json` 逐字节相同 |
| 预算 | 每案 1200 秒（`FORMAL_BUDGET_SECONDS`）。所有运行都在预算内结束，没有缩小规模 |

## 模型检查

模型 `Finishing.tla` SHA-256 `c35cc33b2351c0775c11883941221301f8b394952300c841c0da3b55b09f4ff7`；运行目录 `20261101T175602.312305Z`、`20261101T181336.619043Z`（同一模型字节）。

| 配置 | 配置 SHA-256（前 12 位） | 期望 | TLC 报告 | 退出码 | 不同状态数 | 深度 | 用时（秒） | 运行目录 | 判读 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `valid` | `217ed800cbcc` | 无反例 | 无反例，搜索完成 | 0 | 6900732 | 27 | 66.234 | `20261101T175602.312305Z` | 正控通过 |
| `valid-cancel` | `946b5ea1bd1d` | 无反例 | 无反例，搜索完成 | 0 | 12066882 | 28 | 121.063 | `20261101T175602.312305Z` | 正控通过 |
| `valid-coordinated` | `136ac4aab0b9` | 无反例 | 无反例，搜索完成 | 0 | 5143437 | 29 | 57.828 | `20261101T175602.312305Z` | 正控通过 |
| `live` | `e35877e9aca0` | 无反例 | 无反例，搜索完成 | 0 | 4694581 | 28 | 658.516 | `20261101T175602.312305Z` | 正控通过 |
| `live-cancel` | `993cbd00a1ad` | 无反例 | 无反例，搜索完成 | 0 | 2207262 | 24 | 300.375 | `20261101T181336.619043Z` | 正控通过 |
| `bad-skip-pending` | `f58c3ff74678` | NoEndWithPending | `NoEndWithPending` 违反 | 12 | 2046 | 8 | 1.765 | `20261101T181336.619043Z` | 负控命中 `NoEndWithPending` |
| `bad-unknown-as-pending` | `5084afb290f7` | UnknownNotBlockedOrEnded | `UnknownNotBlockedOrEnded` 违反 | 12 | 1812 | 7 | 1.563 | `20261101T181336.619043Z` | 负控命中 `UnknownNotBlockedOrEnded` |
| `bad-ignore-cancel` | `cd3db2c7ed51` | CancelFirst | `CancelFirst` 违反 | 12 | 3705 | 9 | 1.937 | `20261101T181336.619043Z` | 负控命中 `CancelFirst` |
| `bad-stale-intent` | `1bf6dab9b68d` | NoEndOutsideSettling | `NoEndOutsideSettling` 违反 | 12 | 1667 | 8 | 1.672 | `20261101T181336.619043Z` | 负控命中 `NoEndOutsideSettling` |
| `bad-stale-judgment` | `c92484c89cad` | NoStaleJudgment | `NoStaleJudgment` 违反 | 12 | 369703 | 13 | 3.641 | `20261101T181336.619043Z` | 负控命中 `NoStaleJudgment` |
| `bad-rh-moves-pointer` | `34a1019328cd` | PointerByJa | `PointerByJa` 违反 | 13 | 536 | 7 | 1.297 | `20261101T181336.619043Z` | 负控命中 `PointerByJa` |
| `bad-release-before-custody` | `e892f31371a3` | OneCustodian | `OneCustodian` 违反 | 12 | 7863 | 9 | 1.5 | `20261101T181336.619043Z` | 负控命中 `OneCustodian` |
| `bad-recheck-before-recognize` | `ee3d548971fc` | ReplayOriginal | `ReplayOriginal` 违反 | 12 | 323 | 6 | 1.297 | `20261101T181336.619043Z` | 负控命中 `ReplayOriginal` |
| `bad-new-run-blocks-cancel` | `4c9601748863` | CancelSettles | 时序性质违反 | 13 | 86647 | — | 5.25 | `20261101T181336.619043Z` | 负控命中 `CancelSettles`（该配置唯一的 PROPERTY） |
| `probe-keep-cancelled` | `5450b42be209` | CancelSettles | 时序性质违反 | 13 | 51674 | — | 4.672 | `20261101T181336.619043Z` | 探针：`CancelSettles` 在该读法下不成立（见下文） |

八条安全性质（`NoEndWithPending`、`UnknownNotBlockedOrEnded`、`CancelFirst`、`NoEndOutsideSettling`、`NoStaleJudgment`、`PointerByJa`、`OneCustodian`、`ReplayOriginal`）与 `TypeOK` 在三个安全正控中都被检查。活性 `CancelSettles` 在两个活性正控中被检查。每条性质有一个负控，负控只检查它应命中的那一条性质。安全负控的判读依据是 TLC 输出的 `Invariant <名> is violated` 或 `Action property <名> is violated`。活性负控与探针的判读依据是 `Temporal properties were violated.` 加反例，配置里只有 `CancelSettles` 一条 PROPERTY。

## 探针 probe-keep-cancelled 的判读

探针取 `SupersedeStaleCancelled = FALSE`，即两份内存 Journal 的读法：`establish-cancellation` 不替代当前的取消候选。TLC 给出的反例是：取消受理并生效，建立取消候选，此后又受理一项输入，再发行清单并判断，之后停在一个状态里不再变化（TLC 报告为 Stuttering）。这个状态里，候选的输入水位线落后，tryFinish 只能返回 changed，`establish-cancellation` 只能返回 invalid，两者都不改变状态，execution 不能结束。

这说明在这个读法下 `CancelSettles` 不成立。SPEC 没有写明取消候选建立之后又受理新输入时取消怎样收束，两种可能的读法见 [formal-mapping.md](formal-mapping.md)“两种读法与探针”。哪种读法正确由 Agent 契约拥有者裁定。正控取 TRUE，轨迹导出取 FALSE。

## 轨迹导出

模型 `Finishing.tla` SHA-256 `c35cc33b2351c0775c11883941221301f8b394952300c841c0da3b55b09f4ff7`；运行目录 `20261101T182042.741576Z`。

| 轨迹 | 配置与方式 | TLC 报告 | 退出码 | 步数 | 判读 |
| --- | --- | --- | --- | --- | --- |
| `ordinary-1` | `trace-ordinary.cfg`，模拟，seed 11 | `NotEndedOrdinary` 违反 | 12 | 5 | 已导出 |
| `ordinary-2` | `trace-ordinary.cfg`，模拟，seed 12 | `NotEndedOrdinary` 违反 | 12 | 20 | 已导出 |
| `ordinary-3` | `trace-ordinary.cfg`，模拟，seed 13 | `NotEndedOrdinary` 违反 | 12 | 21 | 已导出 |
| `complete-1` | `trace-complete.cfg`，模拟，seed 31 | `NotEndedComplete` 违反 | 12 | 11 | 已导出 |
| `complete-2` | `trace-complete.cfg`，模拟，seed 32 | `NotEndedComplete` 违反 | 12 | 29 | 已导出 |
| `cancelled-1` | `trace-cancelled.cfg`，模拟，seed 21 | `NotEndedCancelled` 违反 | 12 | 53 | 已导出 |
| `cancelled-2` | `trace-cancelled.cfg`，模拟，seed 22 | `NotEndedCancelled` 违反 | 12 | 36 | 已导出 |
| `cancelled-3` | `trace-cancelled.cfg`，模拟，seed 23 | `NotEndedCancelled` 违反 | 12 | 33 | 已导出 |
| `skip-pending` | `trace-bad-skip-pending.cfg`，模型检查（最短反例） | `NoEndWithPending` 违反 | 12 | 4 | 已导出 |
| `unknown-as-pending` | `trace-bad-unknown-as-pending.cfg`，模型检查（最短反例） | `UnknownNotBlockedOrEnded` 违反 | 12 | 5 | 已导出 |
| `recheck-before-recognize` | `trace-bad-recheck-before-recognize.cfg`，模型检查（最短反例） | `ReplayOriginal` 违反 | 12 | 3 | 已导出 |

导出的轨迹写在 [models/finishing-traces.json](models/finishing-traces.json)，回放驱动内嵌同一份内容。成员自测核对两者相等。

## 轨迹回放

| 调用方 | 命令（成员目录） | 结果 |
| --- | --- | --- |
| agent 的内存 Journal | `NO_COLOR=1 pnpm exec vitest run tests/journal-replay.spec.ts` | 11 个用例通过：8 条符合轨迹逐步一致，3 条违规轨迹都在最后一步被报告 |
| session-adapters 的会话日志 Journal | `NO_COLOR=1 pnpm exec vitest run tests/journal-replay.spec.ts` | 11 个用例通过：8 条符合轨迹逐步一致，3 条违规轨迹都在最后一步被报告 |

回放只覆盖 [formal-mapping.md](formal-mapping.md)“回放映射”一节列出的步骤，并且只在导出的轨迹上成立。

## 原始证据

原始日志在执行工作树的任务过程目录 `tmp/line-session-run/w1/logs/C06/runs/<UTC 时间>/`，不进 Git。每个目录含模型、配置与脚本的快照，各案的 `tlc.log`，以及汇总 `results.json`。本页各表取自下列两个目录：模型检查 `20261101T175602.312305Z` 与 `20261101T181336.619043Z`（第一次运行在 live 之后被中断，其余配置在第二个目录补跑，模型字节相同），轨迹导出 `20261101T182042.741576Z`。同一父目录中其他较早的目录属于模型调整过程，已被这些运行取代。
