# 仓库里现有的量法：盘点

2026-11-16，只读盘点（一路只读子代理读源码，没有跑任何东西）。「能不能用」只有静态的证据。盘点时主检出在 `7bdc40352`。

## 一、各处量什么

| 位置 | 量什么 | 怎样跑 | 判不判 | 结果去哪 | 状态 |
| --- | --- | --- | --- | --- | --- |
| `apps/harness-server/tests/long-session/`（`run.ts`、`judge.ts`、`compare.ts`、`worker-count.ts`） | 发行装配（真实 `serve`、SQLite、Shell，脚本化的模型网关），一个会话 N 轮，每轮一次 Shell。每轮自身开销、各计时段、常驻内存与堆、数据目录字节、每轮新增、提交数、读往返、提前查询、日志自有字节、各表大小 | 先构建，`node apps/harness-server/tests/long-session/run.ts --out <新目录> [--rounds 200] [--control growth] [--heap-snapshots]`。不进准入 | 只报告：运行失败才退出 1；`judge.ts` 写结论不拦；`compare.ts` 对同一提交的重复范围超出时退出 1 | 输出目录：`rounds.jsonl`、`summary.json`、`summary.md`、各类快照。没有历史 | 可用。2026-11-16 实地跑过一次。没有说明文档 |
| `apps/harness-server/tests/history-cost/` | 工具结果读回的成本：对比已完成 20 次与 200 次之后的耗时；SQL 的条数、读写行数、字节、全表扫描 | `node --import ./tests/history-cost/sql-probe.ts tests/history-cost/run.ts <out> <inline\|text> [10]`，要设 `HISTORY_COST_TRACE_DIR` | 判：不扫会增长的表、单次最大行数相等、写行数相等，不成立退出 1。不带 `sql-probe` 时静默不判 | 输出目录的 JSON | 可用，没有说明文档 |
| `tools/e9/` | 每轮自身开销（墙钟减外部等待），四段，fsync 计数；至多 200 轮 | `node tools/e9/cli.mjs run\|compare\|selftest` | 判：窗口比值加增长判定；失败退出 1，缺测退出 3 | 归档目录 | 判定算法在用。唯一的适配器（`tools/joint-b/e9-adapter.mjs`）从不传 fsync，总判定只能是阻塞；它跑的是贯通用例的世界，不是发行装配 |
| `apps/harness-server/tests/rows/storage/journal-measure.spec.ts`、`journal-bytes.spec.ts` | Agent 执行记录每次提交的字节、WAL 的页数、推出来的 fsync 次数、状态行的大小；20 步与 200 步 | 前者在快层；后者 20 步的守卫在慢层，200 步要 `OMNE_JOURNAL_GROWTH_200=1` | 判：用例失败即失败。现状已知超限的被写成了断言，修好了会变红 | 主检出的 `tmp/journal-bytes/`，覆盖写 | 可用 |
| `packages/agent/agent-host-local/tests/line-through/`（`w2-counts.spec.ts`、`growth.ts`、`w2-measure.ts`） | 每轮的存储提交数、读数、行数、字节、模型与工具请求数；两种轮形；缺省 20 轮，`OMNE_J6_ROUNDS=200` 才满量 | 慢层 | 判：后窗等于前窗；满量才判增长，带负控 | 主检出的 `tmp/line-session-run/`，覆盖写 | 可用。增长判定是第二份实现 |
| 三个度量回调：`session/src/measure.ts`、`agent/src/measure.ts`、`agent-context/src/measure.ts` | 成对的开始与结束事件，不含时间（接收方计时） | 成员测试 | 只断言配对 | 交给调用方 | 发行只接了会话与 Agent 两个，请求上下文的没接 |
| `packages/telemetry/telemetry-node`（`summary`） | 离线聚合：各计时段的最小、中位、p95、p99、最大 | `omne-telemetry-summary [--json] [file]` | 不判 | 标准输出 | 可用 |
| 成员里的微基准 | 条目编解码（`session-storage-sql/tests/entry-codec-bench.spec.ts`，只打印）；引用解析的中位数小于 50 微秒（`tool-contract`、`model-contract` 的 `reference-cost.spec.ts`）；分词 24 KiB（`tokenizer-tiktoken`）；人工介入的查询在 100、1000、10000 条历史下 SQL 条数与行数有上限（`query-cost.spec.ts`）；日程计算的候选数 | 成员的慢层 | 大多判 | 不留 | 可用 |
| `tools/model-probe` | 真实模型的缓存命中与费用；合成前缀 | 要参数与预算账本（上限 200 美元） | 只判预算 | 输出目录 | 可用。不量时间 |
| `tools/storage-probe` | 不是度量，是早期的可行性探针 | 没有调用方 | | | 历史原型 |
| 测试耗时的账本、`loop:status`、`loop:health`、`admission-runs/` | 测试与验收的墙钟、慢文件；结构读数 | `pnpm run loop:status` 等 | 只报告 | 账本目录；趋势页 | 可用。和产品性能无关，但它是仓库里唯一有历史的时间读数 |

## 二、增长判定的算法

权威实现在 `tools/e9/metrics.mjs`：

- `blockGrowth(values)`：输入第 11 到 200 轮共 190 个值。分 19 个十轮的块，取每块的中位数，除以块最大值归一，做最小二乘回归；算残差的绝对中位差。**判增长**要三条同时成立：斜率为正；R² 不小于 0.95；斜率乘 180 大于 3 倍绝对中位差。方差为零时判通过。
- `evaluateMedian(rounds, 1.5)`：第 181 到 200 轮的中位数除以第 11 到 30 轮的，不超过 1.5 通过；缺窗、缺测、前窗中位数为零判阻塞。
- `evaluateSeries`：对任意 200 个值同时判上面两道。长会话量法的 `judge.ts` 用它判开销、各段、内存、每轮新增磁盘、提交数、读数。
- 第二份实现在 `agent-host-local/tests/line-through/growth.ts`，常量逐项一致，由 `growth.spec.ts` 用正则读 `metrics.mjs` 核对。

别的有界规则：

- 第 20 步最大的一次发布不超过第 5 步的加 2 KiB（`journal-measure.ts`）。
- 累计自有字节不超过 64 KiB 加每步 12 KiB（`journal-measure.ts`；`judge.ts` 里另有一份副本）。
- 长会话同一提交重复跑的允许范围：提交数与提前查询 2%，读 20%，前后窗中位数 25%，常驻内存 15%，数据目录 5%（`compare.ts`）。

## 三、哪些模块没有量法

| 模块 | 有没有 |
| --- | --- |
| 会话日志的读写 | 有：计时段、日志字节、编解码、长会话的快照、历史开销 |
| Agent 循环 | 有：计时段、逐轮计数 |
| 模型调用 | 没有。发行路径上没有调用耗时、首字延迟。架构正文要求首字延迟，没有落地 |
| 工具执行 | 弱：材料生命周期的事件、引用解析的微基准。没有执行耗时的分布 |
| 请求上下文组装 | 代码有度量点，发行没接线 |
| 运行时上下文 | 没有。架构正文要求分别度量 |
| 存储提供者 | 没有内置读数。现在的数都是从外面打补丁取的 |
| 接入层入口 | 没有延迟与吞吐，只有故障码事件 |
| 会话观察 | 没有 |
| 人工介入 | 有：查询成本的成员用例 |
| 身份与授权 | 没有。长会话里表现为读的占比 |
| 设置求值 | 没有 |
| 桌面界面 | 没有 |

## 四、遥测里现成能当数据来源的

- 计时段（带时长、结果、租户）：`omne.session.<操作>`（创建、受理、结束一轮等写操作，以及读工作状态、读输入、历史的几种读、恢复等读操作）；`omne.agent.pass.accept`、`omne.agent.pass.run`。
- 事件：`omne.session.round-complete`（可当一轮的边界）、`omne.session.diagnostic`、`omne.access.diagnostic`、`omne.tool.material.lifecycle`。
- 度量的契约（计数器）有，全仓没有发射点。
- 取数：`runServe` 的记录回调（长会话量法已在用），或标准输出与文件出口，离线用 `omne-telemetry-summary`。
- 局限：没有模型与工具的耗时；没有请求组装的段；没有存储层的读数；遥测会丢并计数，用之前先核丢了多少。

## 五、找回的旧文档

`docs/engineering/perf-baseline.md` 在根治第一程里删了，找回的一份在同目录 [perf-baseline-deleted-2026-11-14.md](perf-baseline-deleted-2026-11-14.md)。它带三次 200 轮的基线，是 macOS 上的；没有 Linux 的基线，没有 fsync 的实测。
