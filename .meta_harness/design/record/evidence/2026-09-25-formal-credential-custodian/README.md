# 2026-09-25 · `capability.credential-custodian` v2 形式工件的首次执行（正配置两次 + 五份核对配置）

接口契约批（[D-043 R-1](../../decisions/assets-runtimes-rulings-2026-09-25/README.md)）新立的 `capability.credential-custodian` v2 带一份 TLA+ 模型
（[`formal/README.md`](../../../spec/capabilities/credential-custodian/v2/formal/README.md)）：正配置登记为 formal task `credential-custodian-v2-sweep`；
另五份核对配置**预期出反例**（三份去保护：清扫不只丢三种、完成按旧时刻判过期、没有清扫；两份可达性：证明 `granted` 与丢弃两个状态真的到得了），按契约原话不登记为 formal task。
起草者没有工具链、未运行；本 run 是第一次执行，输入快照与原始输出入库。契约仍 **candidate**，通过不提升状态。

执行在 HUB 分支 `panqiwei/assets-runtimes`，模型与配置取自提交 `a3877671`（[`started.txt`](started.txt)；此后到 `c6aa2fed` 这两份文件未改），工作目录是设计根。
各目录 `commands.txt` 是实际命令，`input/` 带 `SHA256SUMS`，`output/tlc.log` 是 TLC 原始日志；[`exit-codes.tsv`](exit-codes.tsv) 汇总退出码。

## 结果

| 目录 | 配置 | 预期 | 结果 | 规模 |
|---|---|---|---|---|
| `credential-custodian-v2-sweep/` | `Sweep.cfg`（正配置，按登记的命令：`-workers 1`，300 s 上限） | 无反例 | 退出 **124**（**超时**，未得结论）：最后一行进度 4,482,727 generated · 1,507,347 distinct · 537,123 left | 未完成 |
| `credential-custodian-v2-sweep-rerun-4workers/` | `Sweep.cfg`（同一文件，`-workers 4 -Xmx8g`，40 min 上限） | 无反例 | 退出 **0**，无反例（`Model checking completed. No error has been found.`） | 7,883,874 generated · **2,303,290 distinct** · 0 left · 深度 17 · 03min 26s |
| `validity-Sweep_Validity_SweepNotGranted/` | `SweepOnlyThree = FALSE` | 推翻 `GrantedResolvable` | 退出 12，**找到反例**（`Invariant GrantedResolvable is violated`） | 355 generated |
| `validity-Sweep_Validity_StaleCompletionTime/` | `CompleteFreshTime = FALSE` | 推翻 `GrantedResolvable` | 退出 12，**找到反例** | 3973 generated |
| `validity-Sweep_Validity_NoSweep/` | `SweepEnabled = FALSE` | 推翻 `OrphanEventuallySwept` | 退出 **13**，**找到反例**（`Temporal property OrphanEventuallySwept was violated`） | 154699 generated |
| `validity-Sweep_Reach_Granted/` | 探针 `NoGrantedEver` | 「`granted`」可达 | 退出 12，**可达** | 59 generated |
| `validity-Sweep_Reach_Discard/` | 探针 `NoDiscardEver` | 「丢弃」可达 | 退出 12，**可达** | 231 generated |

**正配置的结论以第二次为准**：第一次只是登记的时限太紧（单 worker 五分钟跑不完这份 230 万状态的模型），不是模型有问题；两次的输入快照逐字节相同（各自 `input/SHA256SUMS`）。
五份核对全部按预期：两条不变量各有去保护配置把它推翻，进展性质有去公平性配置把它推翻，两个探针都被反驳——正配置的无反例不是空真。

**由这次运行改的登记**：`registry/formal-tasks.json` 里 `credential-custodian-v2-sweep` 的命令改为 `-workers 4`，`timeout_seconds` 改为 900（第二次实测 206 s，留三倍余量）；契约验证入口的运行方式一行随之改。

## 边界

- 常量取值（两个绑定、三个引用、`TTL = 1`、`MaxTime = 3`）与关闭的路径见 `formal/README.md`；有限检查不是无条件证明。模型只覆盖 S-18 的清扫与 `granted` 的可解析；「在绑定上排序」与 `sweepInterval` 上界都是前提，不在模型里，证据归场景 S-28。
- `OrphanEventuallySwept` 依赖 `Spec` 里每条条目上 `Sweep` 的弱公平性，那是前提不是结论。
- 工具：Java 21、`tla2tools.jar`（`/opt/tlaplus`），与 `2026-09-25-formal-session-log` 相同；时间戳为 UTC。

返回[运行证据](../README.md)。
