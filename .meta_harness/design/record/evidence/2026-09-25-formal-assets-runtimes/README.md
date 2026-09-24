# 2026-09-25 · 资产／工具运行时／模型请求运行时一程的形式工件执行

本程 8 个已登记的 formal task（`asset-transfer-v1-{transfer,share,revival}`、`stream-assembly-v1-assembly`、`model-request-runtime-v1-invocation{,-no-fallback}`、`tool-execution-runtime-v1-execution{,-progress}`）在**修复波 2 之后**的模型上各跑一次；命令与 [`registry/formal-tasks.json`](../../../registry/README.md) 登记的逐项相同，由执行脚本 [`run-formal.sh`](run-formal.sh) 在执行当时写下 [`commands.txt`](commands.txt) 与 [`exit-codes.tsv`](exit-codes.tsv)，不是事后重建。四份契约（asset-transfer、stream-assembly、model-request-runtime、tool-execution-runtime）仍是 **candidate**，通过不提升状态；接受归 [D-041](../../decisions/assets-runtimes-contract-acceptance/README.md)（待签）。

**这是本程第一次有输入快照与原始输出入库的执行**；此前各起草者在工作树里跑过多轮（主检出 `tmp/formal-runs/*`，Git 忽略），只把结论写在各契约验证入口。

## 跑了什么，结果是什么

执行在 HUB 分支 `panqiwei/assets-runtimes`、提交 `1667ea4c`，工作目录是设计根 `.meta_harness/design`。每个任务目录下 `input/` 是模型与配置的快照（带 `SHA256SUMS`），`output/` 是 TLC 原始日志。

| 任务目录 | 命令 | 结果 | 规模 | 快照 = 当前 `spec/` |
|---|---|---|---|---|
| `asset-transfer-v1-transfer/` | 与登记逐项相同 | 退出 **0**，反例无 | 925185 generated · **195984 distinct** · 0 left · 深度 16 · 10s | 是 |
| `asset-transfer-v1-share/` | 与登记逐项相同 | 退出 **0**，反例无 | 8445161 generated · **1179208 distinct** · 0 left · 深度 20 · 01min 49s | 是 |
| `asset-transfer-v1-revival/` | 与登记逐项相同 | 退出 **0**，反例无 | 8,445,161 generated · **1,179,208 distinct** · 0 left · 深度 20 · 03min 06s | 是 |
| `stream-assembly-v1-assembly/` | 与登记逐项相同 | 退出 **0**，反例无 | 871519 generated · **826411 distinct** · 0 left · 深度 9 · 01min 05s | 是 |
| `model-request-runtime-v1-invocation/` | 与登记逐项相同 | 退出 **0**，反例无 | 29,521 generated · **15,802 distinct** · 0 left · 深度 21 · 03s | 是 |
| `model-request-runtime-v1-invocation-no-fallback/` | 与登记逐项相同 | 退出 **0**，反例无 | 13,861 generated · **7,420 distinct** · 0 left · 深度 21 · 02s | 是 |
| `tool-execution-runtime-v1-execution/` | 与登记逐项相同 | 退出 **0**，反例无 | 2656347 generated · **741344 distinct** · 0 left · 深度 22 · 01min 09s | 是 |
| `tool-execution-runtime-v1-execution-progress/` | 与登记逐项相同 | 退出 **0**，反例无 | 1,858,831 generated · **524,448 distinct** · 0 left · 深度 20 · 15min 55s | 是 |

**全部退出 0、无反例。**「快照 = 当前 `spec/`」一列是写这份记录时逐文件比对 SHA-256 的结果（全部相同）；模型此后再改，这一列以 `frozen.json`（接受时登记）为准重核。

## 边界

- 各模型的常量取值、关闭的故障路径与公平性假设见各契约 `v1/formal/README.md`；**有限检查不是无条件证明**，引用处沿用同一边界。
- 修复波 1／1b／2 的新增承诺凡「不在模型里」的（各 formal README「模型吸收了什么」之外的条款），本 run 不作证据。
- `asset-transfer-v1-revival` 按登记用 4 workers，其余 1 worker。
- 租户领域 5 个任务未重跑：模型自 [`2026-09-23-formal-governance-center-entry`](../2026-09-23-formal-governance-center-entry/README.md) 之后未变。
- Alloy 模型（`messages`、`asset-evaluation`）不是 formal task（`alloy exec` 退出码无意义），本 run 不含；它们的场景证据在各契约验证入口按构造登记。

## 工具与环境

```
git_head=1667ea4c37f0e8412cfe1c7e18d0774f34b3e53c
git_branch=panqiwei/assets-runtimes
java=openjdk version "21.0.12.1" 2026-08-18 LTS
tla2tools_sha256=db131ddb48e7004d823bef4493df7b35694babe37505b9d9fa5685e7a331f1f1
host=Linux 5.15.0-1084-aws x86_64
date_utc=2026-09-24T12:53:59Z
```
