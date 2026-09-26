# 2026-09-25 · stream-assembly 三份有效性核对配置的执行（预期出反例）

`capability.stream-assembly/v1` 的 P-1、P-7 两条不变量各配了预期**出反例**的有效性核对配置
（[`formal/README.md`](../../../spec/capabilities/stream-assembly/v1/formal/README.md) 的三行）。
它们按契约原话**不登记为 formal task**，但 [`packages/core/stream-assembly`](../../../realization/packages/core/stream-assembly/bindings.yaml)
两条绑定的有效性前提是「变异配置给得出反例」——这次运行把那个前提从契约验证入口里的文字记录变成有输入快照与原始输出的证据
（主线裁定 [D-040 §八 M54](../../decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。

执行在 HUB 分支 `panqiwei/assets-runtimes`、提交 `0ea85c0b`（[`started.txt`](started.txt)），工作目录是设计根 `.meta_harness/design`，
命令与登记任务 `stream-assembly-v1-assembly` 的命令只差配置文件与 `-metadir`（各目录 `commands.txt` 为执行当时写下）。
每个目录下 `input/` 是模型与配置的快照（带 `SHA256SUMS`，与 `2026-09-25-formal-assets-runtimes` 快照的 `Assembly.tla` 相同），`output/tlc.log` 是 TLC 原始日志。

## 结果

| 目录 | 变异 | 预期被推翻的不变量 | 结果 | 规模 |
|---|---|---|---|---|
| `Assembly_OrderByClose/` | 到达装配按封口次序排块 | `BlockOrderIsOpenOrder` | 退出 **12**，**找到反例**（`Error: Invariant BlockOrderIsOpenOrder is violated.`） | 18457 generated · 18219 distinct · 01s |
| `Assembly_ReplaceAsAppend/` | 整体替换的填当追加片段相接 | `SplitInvariance` | 退出 **12**，**找到反例**（`Error: Invariant SplitInvariance is violated.`） | 4454 generated · 4405 distinct · 00s |
| `Assembly_OneShotCloseFirst/` | 一次性形式把封口排到填之前 | `OneShotAccepted` | 退出 **12**，**找到反例**（`Error: Invariant OneShotAccepted is violated.`） | 3362 generated · 3323 distinct · 00s |

三份**全部按预期出反例**（[`exit-codes.tsv`](exit-codes.tsv)；TLC 对不变量被违反的退出码是 12）。
这说明 `Assembly.cfg` 正配置下「无反例」不是因为不变量恒真或模型空转：把装配规则改错任意一处，对应不变量就会红。

## 边界

- 反例只证明**变异后的模型**违反该不变量，不证明实现的任何行为；实现与模型的一致性归节点 verification 的 V-2／V-3（尚无）。
- 同一批常量与规模界限沿 `Assembly.cfg`（见各 `input/*.cfg`），无公平性假设；只在这些界内出反例。
- 运行环境：Java 21、`tla2tools.jar`（`/opt/tlaplus`），与 `2026-09-25-formal-assets-runtimes` 相同。
- run id 用本程工作日 `2026-09-25`；`started.txt` 与日志里的时间戳是 UTC。
