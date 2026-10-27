# M1.5 交付账本

本目录是 M1.5 里程碑交付账本的位置。账本由派生脚本从原始输入生成，用于和其他里程碑比较。

## 目录内容

| 文件 | 内容 |
| --- | --- |
| `cards.csv` | 卡级表，每卡一行 |
| `waves.csv` | 波级表，每个 Wave 一行 |
| `milestone.csv` | 里程碑级表，一行 |
| `ledger-meta.json` | 脚本版本、输入文件、生成时间、每列的来源状态与未归卡的准入运行数 |

集成节点在 M1.5 的收口点把这四个文件生成到本目录。建立本页的卡（#794）只建立位置与脚本，不提交数据文件。

## 字段定义

字段的含义与计算归 [synthesis.md「度量账本」](../../../../.meta_harness/human/map-reduce-delivery/research/synthesis.md#度量账本)（第 114-188 行）。脚本怎样从输入得到每一列、哪些列缺失，归[派生规格](../../../../tools/dev-flow/src/ledger/SPEC.md)。

## 脚本版本

数据由派生定义版本 `1` 生成（`tools/dev-flow/src/ledger/derive.ts` 的 `LEDGER_VERSION`）。实际版本以 `ledger-meta.json` 的 `version` 为准。

## 重新生成

在仓库根运行：

```sh
pnpm --filter @omne-harness/dev-flow run ledger derive \
  --capture <M1.5 收口点的捕获文件> \
  --admission <主检出的 tmp/test-ledger> \
  --slots <名额账本 ledger.jsonl> \
  --board <Project 导出的 board.json> \
  --milestone M1.5 \
  --out docs/engineering/ledger/m1.5/
```

`--capture` 与 `--out` 是必需选项，其他输入可以省略；省略的输入使对应的列缺失。捕获用 `delivery/cli.ts --live --save-capture` 生成，见[用法](../../../../tools/dev-flow/src/ledger/README.md#用法)。派生定义升版本后，用新版本和保留的原始输入重新运行同一命令，再与其他里程碑比较。

## 版本 1 缺失的字段

缺失的值是空单元格，不估填。`ledger-meta.json` 对每一列写出 `missing:<原因>`。

- 输入中没有记录的列始终缺失：方案版本与共干预、gate 与同步打点、修复轮次与返工原因、评审发现、分解错误、人裁决等待、会话用量与成本、具名例外、契约变化实测、宿主检查，以及波级的座位数、冻结时刻、队列采样、骨架跳数与信号计数。
- `decision_requested_at` 与 `decided_at` 缺失，因为仓库尚未采用 `<!-- decision-requested -->` 与 `<!-- decision -->` 评论标记。
- Wave 与 `cycle_days` 只来自 `--board`。Project 字段在云端读不到，这个文件由本地会话导出；没有它时这些列缺失。
- 准入运行按耗时账本 `meta.branch` 中的 `issue-<N>` 归卡，紧邻的快层与慢层目录算一次运行。分支名不含卡号的运行不归卡，计入 `ledger-meta.json` 的 `unmappedAdmissionRuns`。没有一次运行归到卡时，`a`、`admit_fail`、`first_pass`、`S_admit_min` 缺失。只给出 `--slots` 时，`a`、`admit_fail` 与 `first_pass` 从名额账本派生，`S_admit_min` 缺失。

完整清单与原因见[派生规格的缺失规则](../../../../tools/dev-flow/src/ledger/SPEC.md#缺失规则)。
