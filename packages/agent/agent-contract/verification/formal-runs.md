# 收尾协议形式模型的运行记录

本页是 [Finishing.tla](models/Finishing.tla) 的 TLC 运行与轨迹回放的索引。每行写明输入摘要、工具版本、参数、预算、输出与判读。原始日志不进本包，保存在任务过程目录（见“原始证据”）。规模上限与映射见 [formal-mapping.md](formal-mapping.md)，判读规则见 [models/README.md](models/README.md)。

本页的结论只在所列规模上限内成立。它不是证明，也不表示实现符合模型。

## 工具与参数

| 项 | 值 |
| --- | --- |
| 运行环境 | Windows 11 宿主，Git Bash。经 `node scripts/with-test-slot.mjs` 取运行名额后执行 `run.py`，源码提交为分支基线 `88053f57a`，模型与配置是该提交之上未提交的修订（快照在运行目录） |
| JDK | Temurin 21.0.13+9 |
| TLC | `TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)`，即 tla2tools 1.7.4。JAR SHA-256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88` |
| 工具环境检查 | `pnpm run check:formal-tools` 在宿主退出 0，输出同一 JAR 摘要 |
| 参数 | 广度优先模型检查；`-workers 8`（`FORMAL_WORKERS=8`）；`-Xmx8g`（`FORMAL_HEAP=-Xmx8g`）；`-XX:+UseParallelGC`；`-fp 0`；`CHECK_DEADLOCK FALSE`。安全配置使用 `VIEW View`，活性配置不用 VIEW 并取 `Observe = FALSE` |
| 轨迹参数 | 模拟：`-simulate -depth 80 -seed <种子>`，目标不变量被违反时停止。违规轨迹：在 `TraceSpec` 上广度优先求最短反例。两者都用 `-workers 1`：多个 worker 时同一种子的结果不重复。连续两次导出的 `finishing-traces.json` 逐字节相同 |
| 预算 | 每案 1200 秒（`FORMAL_BUDGET_SECONDS`）。所有运行都在预算内结束，没有缩小规模 |
| 判定 | `run.py` 的退出码只由控制决定。本次全部控制运行后退出 0。探针只记录观察 |

## 模型检查

模型 `Finishing.tla` SHA-256 `2770b9f7c423580f4a80e57e23436bb49bbd2b5d89f46dff2606d73fb815a10f`；运行目录 `20261101T210408.906542Z`。

| 配置 | 配置 SHA-256（前 12 位） | 期望 | TLC 报告 | 退出码 | 不同状态数 | 深度 | 用时（秒） | 判读 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `valid` | `217ed800cbcc` | 无反例 | 无反例，搜索完成 | 0 | 6900732 | 27 | 50.5 | 正控通过 |
| `valid-cancel` | `946b5ea1bd1d` | 无反例 | 无反例，搜索完成 | 0 | 12066882 | 28 | 93.547 | 正控通过 |
| `valid-coordinated` | `136ac4aab0b9` | 无反例 | 无反例，搜索完成 | 0 | 5143437 | 28 | 37.906 | 正控通过 |
| `valid-keep-cancelled` | `a0e7b96b7ee0` | 无反例 | 无反例，搜索完成 | 0 | 12066535 | 28 | 94.047 | 正控通过（`SupersedeStaleCancelled = FALSE`） |
| `live` | `8bf41e682340` | 无反例 | 无反例，搜索完成 | 0 | 4694581 | 28 | 403.156 | 正控通过，前提 `SupersedeStaleCancelled = TRUE`。FALSE 下见探针 |
| `live-cancel` | `edb1a79e4df3` | 无反例 | 无反例，搜索完成 | 0 | 2207262 | 24 | 174.187 | 正控通过，前提 `SupersedeStaleCancelled = TRUE`。FALSE 下见探针 |
| `bad-skip-pending` | `f58c3ff74678` | NoEndWithPending | `NoEndWithPending` 违反 | 12 | 681 | 7 | 0.954 | 负控命中 `NoEndWithPending` |
| `bad-unknown-as-pending` | `5084afb290f7` | UnknownNotBlockedOrEnded | `UnknownNotBlockedOrEnded` 违反 | 12 | 1550 | 8 | 0.953 | 负控命中 `UnknownNotBlockedOrEnded` |
| `bad-ignore-cancel` | `cd3db2c7ed51` | CancelFirst | `CancelFirst` 违反 | 12 | 8653 | 9 | 1.25 | 负控命中 `CancelFirst` |
| `bad-stale-intent` | `1bf6dab9b68d` | NoEndOutsideSettling | `NoEndOutsideSettling` 违反 | 12 | 963 | 7 | 0.906 | 负控命中 `NoEndOutsideSettling` |
| `bad-stale-judgment` | `c92484c89cad` | NoStaleJudgment | `NoStaleJudgment` 违反 | 12 | 486494 | 14 | 3.234 | 负控命中 `NoStaleJudgment` |
| `bad-rh-moves-pointer` | `34a1019328cd` | PointerByJa | `PointerByJa` 违反 | 13 | 689 | 7 | 0.985 | 负控命中 `PointerByJa` |
| `bad-release-before-custody` | `e892f31371a3` | OneCustodian | `OneCustodian` 违反 | 12 | 1721 | 8 | 1.0 | 负控命中 `OneCustodian` |
| `bad-release-while-issued` | `022588f60f71` | OneCustodian | `OneCustodian` 违反 | 12 | 875 | 7 | 0.953 | 负控命中 `OneCustodian`，见下文 |
| `bad-recheck-before-recognize` | `ee3d548971fc` | ReplayOriginal | `ReplayOriginal` 违反 | 12 | 294 | 6 | 0.89 | 负控命中 `ReplayOriginal` |
| `bad-new-run-blocks-cancel` | `4c9601748863` | CancelSettles | 时序性质违反 | 13 | 122565 | — | 4.11 | 负控命中 `CancelSettles`（该配置唯一的 PROPERTY），归因见下文 |
| `probe-keep-cancelled` | `5450b42be209` | 只记录 | 时序性质违反 | 13 | 86663 | — | 4.64 | 探针：`CancelSettles` 在该读法下不成立（见下文），不参与判定 |

负控的状态数与深度是 TLC 找到第一个反例时的读数。多个 worker 时它们在两次运行之间可能不同，判读只看被违反的性质。

八条安全性质（`NoEndWithPending`、`UnknownNotBlockedOrEnded`、`CancelFirst`、`NoEndOutsideSettling`、`NoStaleJudgment`、`PointerByJa`、`OneCustodian`、`ReplayOriginal`）与 `TypeOK` 在四个安全正控中都被检查。活性 `CancelSettles` 在两个活性正控中被检查，前提是 `SupersedeStaleCancelled = TRUE`。每条性质至少有一个负控，`OneCustodian` 有两个。负控只检查它应命中的那一条性质。安全负控的判读依据是 TLC 输出的 `Invariant <名> is violated` 或 `Action property <名> is violated`。活性负控的判读依据是 `Temporal properties were violated.` 加反例，配置里只有 `CancelSettles` 一条 PROPERTY。探针按同样的读法记录观察，不参与 `run.py` 的退出码。

安全负控与 valid 系列的配置是包含关系：每个安全负控的 Scope 是 `valid` 的 Scope 的子集，其余常量与 `valid` 相同，只多一个故意的错误。所以安全负控命中的反例归因于那个错误。活性负控 `bad-new-run-blocks-cancel` 没有去掉错误的同配置正控：`live` 是 coordinated 绑定，`live-cancel` 没有 newrun。它的归因取自反例本身，见下节。

## S7 的两个负控

`OneCustodian` 用幽灵变量 `produced` 判断结果是否存在，与谁持有结果无关。两个负控的反例都停在调用仍为 issued 的状态：

- `bad-release-while-issued`：Effect → Produce → Release。生产者在任何 custody 写入之前释放副本，此后没有保管者。
- `bad-release-before-custody`：Effect → Produce → Lose-Custody（写入未生效）→ Release。

为了确认这个修订有区分力，另把 `ResultExists` 换回修订前的定义（`pcopy \/ call \in {"recorded", "settled"}`），对这两份配置各跑一次。`bad-release-while-issued` 搜索完成且没有反例（退出 0，3619613 个不同状态）：旧定义把“有人持有”当作“结果存在”，副本释放后不变式空真。`bad-release-before-custody` 在旧定义下仍被报告，因为 TLC 另找到了 call 为 recorded 的路径。这次核对的模型副本与日志在任务过程目录的 `discriminate/`，它不是本包的配置。

## 活性负控 bad-new-run-blocks-cancel 的归因

这个负控没有去掉错误的同配置正控，所以归因取自反例。反例的前 7 个状态建立 H、排除、Rh、接管，再受理取消并使它生效。第 8 个状态是 NewRun（`slot = "new"`）。第 9、10 个状态是 Submit 与 Load。之后 TLC 报告 Stuttering。这时 Establish、Migrate、Judge、Prepare 与 TryFinish 都要求槽位空闲，在故意的错误下都不可用，所以公平性不要求它们执行，execution 不能结束。反例中 NewRun 之后的停顿正是故意的错误造成的。

## 探针 probe-keep-cancelled 的判读

探针取 `SupersedeStaleCancelled = FALSE`，即两份内存 Journal 的读法：`establish-cancellation` 不替代当前的取消候选。TLC 给出的反例是：F1-complete，TakeInputs，取消受理，接管，取消生效，Load，Establish 建立取消候选，此后又 Submit 一项输入，再 Load、Prepare、Judge，之后 TLC 报告 Stuttering。这个状态里，候选的输入水位线落后，tryFinish 只能返回 changed，`establish-cancellation` 只能返回 invalid，两者都不改变状态，execution 不能结束。

这说明在这个读法下 `CancelSettles` 不成立。Reduce 已定读法乙（[#502 评论](https://github.com/nemori-ai/omne-harness-lite/issues/502#issuecomment-6562280172)）：取消候选不因后来的输入返回 changed，这些输入记为 held。本波 SPEC 未补写，两份内存 Journal 未实现乙，模型也没有表达乙。这是进波 2 的已知限制。所以本页的活性结论只在 `SupersedeStaleCancelled = TRUE`（读法甲）前提下成立，采用的读法乙下活性没有被检查。两种读法与安全结论为什么覆盖 FALSE，见 [formal-mapping.md](formal-mapping.md)“取消收束”。正控取 TRUE，`valid-keep-cancelled` 与轨迹导出取 FALSE。

## 轨迹导出

模型 `Finishing.tla` SHA-256 `2770b9f7c423580f4a80e57e23436bb49bbd2b5d89f46dff2606d73fb815a10f`；运行目录 `20261101T211921.457775Z`。这次导出的全部 11 条轨迹（`conforming` 与 `violating` 两个数组）与上一版模型（SHA-256 `c35cc33b2351…`）导出的逐项相同，`finishing-traces.json` 只更新了 `modelSha256`。回放驱动内嵌的轨迹因此不变。导出在任务过程目录的副本中进行，没有改写本包的回放驱动。

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

本次修订后重跑了三处回放用例。轨迹未变，被测成员的源码也未变。agent 成员在本工作树先运行 `pnpm run build` 生成 `dist`，再运行用例。

| 调用方 | 命令（成员目录） | 结果 |
| --- | --- | --- |
| agent-contract 的驱动自测 | `NO_COLOR=1 pnpm exec vitest run --mode fast tests/journal-replay.spec.ts` | 11 个用例通过：内嵌轨迹与 `finishing-traces.json` 相同，驱动报告首个不一致的步骤 |
| agent 的内存 Journal | `NO_COLOR=1 pnpm exec vitest run --mode fast tests/journal-replay.spec.ts` | 11 个用例通过：8 条符合轨迹逐步一致，3 条违规轨迹都在最后一步被报告 |
| session-adapters 的会话日志 Journal | `NO_COLOR=1 pnpm exec vitest run --mode fast tests/journal-replay.spec.ts` | 11 个用例通过：8 条符合轨迹逐步一致，3 条违规轨迹都在最后一步被报告 |

回放只覆盖 [formal-mapping.md](formal-mapping.md)“回放映射”一节列出的步骤，并且只在导出的轨迹上成立。

## 原始证据

原始日志在执行工作树的任务过程目录 `tmp/line-session-run/w1/logs/C06b/runs/<UTC 时间>/`，不进 Git。每个目录含模型、配置与脚本的快照，各案的 `tlc.log`，以及汇总 `results.json`。本页各表取自两个目录：模型检查 `20261101T210408.906542Z`，轨迹导出 `20261101T211921.457775Z`。同一父目录中较早的目录是本次修订中只跑 S7 负控的过程运行，已被取代。上一版模型（`c35cc33…`）的运行在 `tmp/line-session-run/w1/logs/C06/runs/`，已被本页的运行取代。
