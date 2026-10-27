# 交付账本派生

`ledger-cli.ts derive` 从文件派生一个里程碑的交付账本：卡级、波级、里程碑级与线级四张 CSV 表，以及一份说明每列来源的 `ledger-meta.json`。字段定义归 [synthesis.md「度量账本」](../../../../.meta_harness/human/map-reduce-delivery/research/synthesis.md#度量账本)。字段来源、缺失规则、运行归卡与退出码归 [SPEC](SPEC.md)。

命令只读输入文件、只写输出目录。它不调用 `gh`，不访问网络，不修改 Issue 或 Project。

## 用法

在仓库根运行：

```sh
pnpm --filter @omne-harness/dev-flow run ledger derive \
  --capture tmp/<task>/capture.json \
  --out tmp/<task>/ledger \
  [--admission tmp/test-ledger] \
  [--slots ~/.local/state/omne-test-slots/ledger.jsonl] \
  [--board tmp/<task>/board.json] \
  [--milestone <里程碑标题>]
```

`pnpm --filter` 在成员目录里启动脚本。相对路径按启动 pnpm 的目录（环境变量 `INIT_CWD`）解析；没有 `INIT_CWD` 时按当前目录解析。也可以直接运行 `node --experimental-strip-types tools/dev-flow/src/ledger/ledger-cli.ts derive …`。

成功时退出 0，标准输出一行 JSON：`kind`、`version`、`out`、卡数、波数、线数与警告数。输入错误时退出 2，标准错误一行 `{"kind":"ledger-error","message":…}`，标准输出为空。

## 输入

| 选项 | 必需 | 内容 |
| --- | --- | --- |
| `--capture` | 是 | `cli.ts --live --save-capture` 写出的 `github-delivery-capture@1`，见 [delivery](../delivery/README.md#显式读取-github)。卡级事实都从它读取 |
| `--out` | 是 | 输出目录。不存在时创建 |
| `--admission` | 否 | test-runner 的耗时账本根，结构为 `<提交短号>[-dirty]/<时间>[-fast\|-slow]/ledger.json`，见 [test-runner](../../../test-runner/README_ZH.md#测试运行)。运行按 `meta.branch` 中的 `issue-<N>` 归卡，只进线侧的 `map_*` 列；紧邻的快层与慢层目录算一次运行，见 [SPEC](SPEC.md#线侧准入运行归卡) |
| `--slots` | 否 | 名额账本 `ledger.jsonl`，字段见 [scripts](../../../../scripts/README.md) 的运行账本表。只进线侧的 `map_*` 列 |
| `--board` | 否 | Project 字段的导出文件，形状为 `{ "<卡号>": { "wave", "dispatchedAt", "deliveredAt", "acceptedAt", "cycleDays" } }`。日期为 `YYYY-MM-DD`，每项都可以省略。本命令不生成这个文件；没有它时 Wave 与 `cycle_days` 缺失 |
| `--milestone` | 否 | 只取捕获中里程碑标题等于该值的卡。省略时取全部卡 |

捕获只记录评论的 `updatedAt`，没有创建时间。事件时刻因此是近似值：评论被编辑过时，读到的时刻晚于发布时刻。

## 输出

| 文件 | 内容 |
| --- | --- |
| `cards.csv` | 每卡一行，按卡号升序 |
| `waves.csv` | 每个 Wave 一行。没有 Wave 的卡归 `(missing)` 一组，排在最后 |
| `milestone.csv` | 一行 |
| `lines.csv` | 每条交付线一行。没有交付线的卡归 `(missing)` 一组，排在最后 |
| `ledger-meta.json` | 脚本版本、生成时间、输入文件、捕获的完整性、运行归卡计数、每张表每一列的状态（`derived` 或 `missing:<原因>`）、说明与卡级警告 |

CSV 按 RFC 4180 写：UTF-8，CRLF 换行，首行是表头。字段含逗号、双引号、CR 或 LF 时用双引号包住，内部双引号写两次。列顺序固定，见 [derive.ts](derive.ts) 的 `CARD_COLUMNS`、`WAVE_COLUMNS`、`MILESTONE_COLUMNS` 与 `LINE_COLUMNS`。缺失的值是空单元格。

命令先把五个文件写成临时文件，再删除目录里旧的 `ledger-meta.json`，然后逐个改名，`ledger-meta.json` 最后改名。目录里有 `ledger-meta.json` 时，五个文件属于同一次运行。运行失败后，目录里可能残留没有 `ledger-meta.json` 的部分表。写入失败时命令删除临时文件，退出 2。

## 版本与重算

`derive.ts` 的 `LEDGER_VERSION` 是派生定义的版本，当前为 `1`。版本写进 `ledger-meta.json`。

以下改动都要升版本：列的增删或顺序变化、任何一条派生规则或评论匹配规则的变化、缺失规则的变化。升版本后，用新版本对历史里程碑的原始输入重新派生，再比较不同里程碑（[measurement-and-comparison.md](../../../../.meta_harness/human/map-reduce-delivery/research/measurement-and-comparison.md) 的「机制设计」）。

集成节点把每个里程碑的原始输入（捕获、耗时账本、名额账本、Project 字段导出）随收口点的集成报告保存，直到该里程碑不再需要重算。
