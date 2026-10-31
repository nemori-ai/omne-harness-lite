# 交付账本派生规格

本页规定版本 `1` 的派生规则。字段的含义归 [synthesis.md「度量账本」](../../../../.meta_harness/human/map-reduce-delivery/research/synthesis.md#度量账本)。本页只规定怎样从输入文件得到这些字段，以及哪些字段在本版缺失。用法归 [README](README.md)。

## 边界

- `sources.ts` 读文件，把它们解析成 `derive.ts` 的输入类型。读不到、不是合格 JSON 或形状不对的输入都形成 `DeliveryInputError`，消息里写选项与文件。
- `derive.ts` 的 `deriveLedger(inputs)` 是纯函数。它不读文件、时钟或环境，生成时间由调用方给出。
- `csv.ts` 只做 RFC 4180 序列化。
- `ledger-cli.ts` 只做参数解析、路径解析与写文件。命令不调用 GitHub。

## 评论匹配

几项卡级事实按评论文字匹配，不读结构化记录。评论格式变了，这些规则会漏读；改规则时升版本。每项规则见下表的对应行。

## 卡级字段来源

卡来自 `--capture`。给出 `--milestone` 时只取 `milestone` 等于该标题的卡；捕获没有读取里程碑的卡不算在内。

| 列 | 来源与规则 |
| --- | --- |
| `card` | Issue 号 |
| `attempts` | 不同 attempt 的个数。来源是正文 binding 的 `attempt`，以及评论里每个 `omne-integration-authority:v1` 区块的 `task.attempt`。区块解析不了时跳过该评论。没有派发的卡为 0 |
| `line` | 正文 binding 为版本 2 时取它的 `line`；否则取「身份与责任」里唯一的「交付线」值。没有或有多个值时为空 |
| `kind` | 唯一的 `kind:` 标签的值。没有或有多个时为空 |
| `wave` | `--board` 中该卡的 `wave` |
| `milestone` | 捕获中的里程碑标题 |
| `t_dispatch` | 带 `omne-integration-authority:v1` 区块并能读出 attempt 的评论中，最早的 `updatedAt` |
| `t_deliver` | 有一行以 `## 交接报告` 开头的评论中，最早的 `updatedAt`（评论匹配） |
| `t_accept` | 有一行以 `- 决定：accept` 开头、其后是行尾或不是 ASCII 字母的字符（例如 `- 决定：accept（完整接受）`）的评论中，最早的 `updatedAt`（评论匹配）。冒号可以是全角或半角。`- 决定：acceptx`、`- 决定：partial` 不算 |
| `cycle_days` | `--board` 的 `cycleDays`；没有时取 `acceptedAt` 减 `dispatchedAt` 的天数；两个日期缺一则为空 |
| `t_in_line_h` | `t_deliver − t_dispatch`，单位小时，一位小数 |
| `t_in_reduce_h` | `t_accept − t_deliver`，单位小时，一位小数 |
| `map_a`、`map_admit_fail` | 归到该卡的线侧准入运行数，以及其中失败的运行数。见「线侧准入运行归卡」 |
| `map_S_admit_min` | 归到该卡的线侧准入运行的 `wallSeconds` 之和，单位分钟，一位小数。只来自 `--admission` |
| `map_admission_evidence` | 有交接报告评论时：任一交接报告评论同时含「准入」与 `exit=0` 或「退出 0」为 `true`，否则为 `false`。没有交接报告评论时为空（评论匹配） |
| `session_restarts` | 只对带 `level:delivery` 标签、且至少有一条含 `<!-- line-state -->` 的评论的卡（线父卡）：这类评论的条数减一。其他卡为空（评论匹配）。当前的线协作不产生这种评论，没有这种评论的卡此列为空。含这种评论的历史线父卡按原评论计算 |
| `contract_change_declared` | 「身份与责任」里唯一的「契约变更」值 |

一个时刻缺失时，用到它的差值为空。正文 binding 不合格时，该卡按没有 binding 处理，`ledger-meta.json` 的 `warnings` 记一条；其他卡照常派生。

`map_a`、`map_admit_fail`、`map_S_admit_min` 与里程碑级的 `map_flaky_rate` 是本脚本新增的线侧列，上层定义里没有它们。上层的 `a`、`admit_fail`、`first_pass`、`p` 是 reduce 侧的值，线侧的值不填进这些列。

## 线侧准入运行归卡

`map_a` 与 `map_admit_fail` 只取一个来源。给出 `--admission` 时用它，即使同时给出 `--slots`；只给出 `--slots` 时用名额账本；两者都没有时这两列缺失。`ledger-meta.json` 的 `mapAdmissionSource` 记实际来源。

`--admission`：

- 只读名字为 `<时间>[-fast|-slow]` 的运行目录，其他目录不读。运行目录里没有 `ledger.json` 时计入 `admission.directoriesWithoutLedger`，不参与分组。
- 在同一个 `<提交短号>[-dirty]` 目录里，按时间前缀排列运行目录。`-fast` 目录后面紧跟 `-slow` 目录时，两者是一次运行，因为 `pnpm run check` 先跑快层、再跑慢层。其他目录各自是一次运行，包括单独的 `-fast` 或 `-slow` 目录。一次运行的 `wallSeconds` 是各目录之和；任一目录的 `failures` 非空，这次运行就算失败。
- `meta.branch` 是字符串、null 或不存在。其他值是输入错误，退出 2。
- 运行的 `meta.branch` 含 `issue-<N>` 时，运行归 #N。卡的分支名形如 `<用户名>/issue-<N>-…`。没有匹配的运行归 unmapped，计入 `unmappedAdmissionRuns`。
- 表内（`--milestone` 过滤之后）没有一张卡分到运行时，`map_a`、`map_admit_fail`、`map_S_admit_min` 记为 `missing:no admission run maps to a card of the table …`。运行归到表外的卡不算。

`--slots`：

- 只计 `event` 为 `ran`、且 `command` 以 `./scripts/check.sh` 开头或含 `pnpm run check`（后接空白或结尾，`pnpm run check:docs` 等不算）的行。
- 行的 `issue` 为卡号时归该卡，优先于 `cwd`；`issue` 为 null 或没有该字段时，`cwd` 含 `issue-<N>` 则归 #N；都没有时计入 `slots.unmappedCheckRows`。
- `exitCode` 不为 0 的行算失败。名额账本不给 `map_S_admit_min`。

## 波级、里程碑级与线级

波级按 `wave` 分组，没有 Wave 的卡归 `(missing)`。

| 列 | 规则 |
| --- | --- |
| `n` | 组内卡数 |
| `L_max_h`、`L_med_h`、`L_min_h` | 组内 `t_in_line_h` 的最大值、中位数与最小值 |
| `idle_seat_time_h` | `Σ(L_max − L_i)`，只计有 `t_in_line_h` 的卡 |
| `attempts_extra` | `Σ max(attempts − 1, 0)`，不分重派原因。本脚本新增的列 |

里程碑级：

| 列 | 规则 |
| --- | --- |
| `milestone` | `--milestone` 的值；省略时，表内卡只有一个里程碑标题则取它，否则为空 |
| `cycle_days_*`、`t_in_line_*`、`t_in_reduce_*` | 卡级列的中位数与 P85 |
| `map_flaky_rate` | 只用 `--slots`，只看表内的卡。在有失败行的卡中，按 `endedAt` 排序后第一次失败之后又有通过行的卡所占比例。第一次失败之前的通过不算。没有失败行的卡时为空 |

`first_pass_rate` 按上层定义是 `first_pass` 为真的卡数 ÷ 卡数。版本 `1` 中 `first_pass` 缺失，所以 `first_pass_rate` 也缺失。

线级按卡级 `line` 分组，没有交付线的卡归 `(missing)`。`cards` 是组内卡数。

## 数值格式与分位数

- 小时与分钟写一位小数；比例写三位小数；天数是整数时写整数，否则写一位小数。
- 中位数与 P85 用最近秩法：样本升序排列，取第 `ceil(P/100 × N)` 个值。样本为空时为空。
- 分位数与差值先用原始值计算，最后再取小数位。

## 缺失规则

缺失的值写空单元格，不估填。`ledger-meta.json` 的 `fields` 对四张表的每一列写 `derived` 或 `missing:<原因>`。`derived` 表示本版派生这一列；单元格仍可能因为该卡缺少事件而为空。

以下列在版本 `1` 中始终缺失：

| 表 | 列 | 原因 |
| --- | --- | --- |
| 卡级 | `a`、`admit_fail`、`first_pass`、`S_admit_min` | reduce 侧准入按批次运行，耗时账本与名额账本不记卡号 |
| 波级 | `sum_S_min` | 同上：它是卡级 `S_admit_min` 之和 |
| 里程碑级 | `p`、`first_pass_rate`、`flaky_rate` | 同上 |
| 卡级 | `tokens_in_*`、`tokens_out_*`、`cost_usd_*`（`worker`、`review`、`coordinator`、`reduce` 四组） | 宿主不导出会话用量 |
| 线级 | `coordinator_tokens` | 同上 |
| 里程碑级 | `cost_per_accepted_card` | 同上 |
| 波级 | `redispatches` | attempt 记录不带重派原因，上层要求失联与准入失败分开计 |
| 卡级 | `decision_requested_at`、`decided_at` | 卡评论里没有 `<!-- decision-requested -->` 与 `<!-- decision -->` 标记。采用这套标记后，派生定义升版本并扫描它们 |
| 里程碑级 | `decision_wait_median_h`、`decision_wait_share` | 同上 |
| 卡级 | `plan_version`、`change_ids`、`t_integrating`、`t_sync`、`S_sync_min`、`S_gate_min`、`S_accept_min`、`map_fix_rounds`、`reduce_fix_rounds`、`rework_cause`、`findings_by_severity`、`review_density`、`decomp_errors`、`named_exceptions`、`contract_change_measured`、`host_checks` | 输入中没有对应的记录 |
| 波级 | `P`、`T_freeze`、`T_wave`、`f`、`lambda`、`W`、`L_q`、`Q_over`、`skeleton_hops_real`、`skeleton_hops_total`、`decomp_pre`、`decomp_post`、`signals_triggered` | 输入中没有对应的记录 |
| 里程碑级 | `plan_version`、`co_interventions`、`fix_rounds_distribution`、`rework_cause_shares`、`review_density_median`、`decomp_ratio`、`first_e2e_ratio`、`late_integration_defects`、`forecast_percentile`、`gate_median_min` | 输入中没有对应的记录 |

以下列随输入缺失：没有 `--board` 时 `wave`、`cycle_days` 及其里程碑分位数缺失；`map_a`、`map_admit_fail`、`map_S_admit_min` 按「线侧准入运行归卡」；没有 `--slots` 时 `map_flaky_rate` 缺失。

## 退出码

| 退出码 | 含义 |
| --- | --- |
| 0 | 五个文件都已写出 |
| 2 | 参数不合格、缺必需选项、输入文件读不到或不合格、输出目录写不进去。标准错误一行 `ledger-error` JSON，标准输出为空 |

其他错误是工具缺陷。它们不被转换成退出 2，按 Node 的未捕获异常退出。
