# 台账口径

本页是派发流水、台账增量与派发台账的唯一口径。`ledger.py` 实现本页。台账目录 `.meta_harness/agents/evaluation/dispatch-ledger/` 的 `README.md` 只写边界与指针，结构约束在同目录的 `ledger.schema.json`。

三个对象：

- **派发流水**：任务 tmp 里的 `tmp/<任务>/delegate/flow.jsonl`。每次独立验收后追加一行。不入库。
- **台账增量**：`ledger.py aggregate` 从一个会话的流水算出的文件。会话负责人随交接报告交回。
- **派发台账**：`.meta_harness/agents/evaluation/dispatch-ledger/ledger.json`。按类别聚合的计数。只有 reduce 写它（`docs/engineering/integration.md`「不变量」第 2 条）。它与 `tools/dev-flow/src/ledger/` 的交付账本是两回事。

台账目前只积累计数，不据它改默认档位；收紧方向的规则见 `workflow.md` D6 第 1 点。

## 类别

类别 = 角色 × work × risk × 清晰度。

- **角色**：`.meta_harness/agents/roles/dispatch-policy.json` 的 `roles` 键。另有两个伪角色 `docs` 与 `read-only`。伪角色的 `policy_scope` 为 `none`，只给 `delegate` 作参考，不驱动策略。
- **work**：该角色在策略里的 `work` 键。工具链修复（`tools/` 下的验证与开发工具）记为 developer 的 `verification`。伪角色的 work 固定为 `none`。
- **risk**：`none`，或一个主风险。主风险取命中的 `top_risks` 中第一个属于 `hardest_risks` 的风险。没有这样的风险时，取命中的第一个。伪角色固定为 `none`。
- **清晰度**：`定`、`界`、`探`，判法见下一节。

## 清晰度判法

按顺序回答三问。某一问答「是」，就停在那一问的结果：

1. 要不要先复现或诊断，才能定做法？是 → **探**。
2. 有没有一项事实要写者开工后自己查明，而查明的结果可能改变写范围、机制或判据？不带约束的设计选择也算这一类。是 → **界**。下面几种不算界：
   - 带停止条件的核对。
   - 在给定的选项里二选一。
   - 只在写范围内的「若有」。
   - 只影响交回内容的测量。
3. 其余情形 → **定**。定的规格满足三条：写范围是路径并有推出依据；机制写到函数或数据结构一级；每条验收有命令、预期与具名变异。

## 流水字段

只有经过独立验收的闭包才写流水行，每轮一行。独立验收是评审、qa，或派发者在写者分支头复跑验收命令。只读调研、起草、建卡与派发这类平台操作、装环境，没有独立验收，不写行。在反思里列出它们的模型、档位、用时与追加数。

`flow.jsonl` 每行一个 JSON 对象，字段如下：

| 字段 | 含义 |
| --- | --- |
| `ts` | UTC 时间，ISO 格式，以 `Z` 或 `+00:00` 结尾。其他时区的写法 `check` 拒绝 |
| `task` | 卡号，例如 `#951` |
| `closure` | 闭包 ID |
| `round` | 轮次，从 1 起 |
| `role`、`work`、`risk`、`clarity` | 类别的四个分量 |
| `model` | 精确模型 ID |
| `effort` | 推理档位 |
| `host` | 宿主与版本 |
| `policy_version` | 解析时用的策略版本 |
| `role_source_tree` | `git rev-parse HEAD:.meta_harness/agents/roles/<角色>` 的 40 位哈希。伪角色为 `null` |
| `minutes` | 本轮用时（分钟）。`null` 表示未记录 |
| `tokens_reported` | 宿主报告的 token 数。`null` 表示未记录 |
| `tool_calls` | 工具调用次数。`null` 表示未记录 |
| `usage_source` | 用量的来源：`notification` 或 `transcript` |
| `appends` | 本轮的追加数 |
| `acceptance` | 对象：`report`（卡评论或 PR 评审的 URL）、`verdict`、`defects`。`defects` 每条有 `id`、`owner`（`writer`、`spec` 或 `env`）、`blocking`、`class`，另有可选的 `found`（`review` 或 `after-merge`，缺省 `review`）。`after-merge` 表示合回之后才发现的缺陷 |
| `escalation` | `null`，或对象：`to_model`、`to_effort`、`mode`（`takeover` 或 `redo`）、`reason`、`trigger_report` |
| `outcome` | `merged`、`discarded`、`stopped` 或 `pending` |
| `experiment` | `null`，或 `owner-experiment` |

`tokens_reported` 取完成通知里的数。实测（#960 写第一批计数时，用子代理会话记录对照完成通知），这个数是最后一条消息的上下文长度，不是累计用量，不能当作成本。`usage_source` 记下来源，供以后核实。

## 汇总口径

`ledger.py aggregate` 按下面的口径汇总：

- 一个闭包只数一次 `dispatched`，计在它第一轮写者的模型与档位那一格。
- 一轮通过 = 该轮没有任何阻断缺陷。
  - `first_pass`：第 1 轮通过。
  - `first_no_writer_block`：第 1 轮没有归属写者的阻断缺陷。
  - `within_two`：没有升级，并且在第 1 或第 2 轮通过。
- `escalated`：有任一行的 `escalation` 不为空。`escalations` 按（目标模型@档位，`mode`）分组，记 `n` 与 `success`。`success` 指升级后该闭包的 `outcome` 为 `merged`。一个闭包对每个（目标模型@档位，`mode`）至多贡献 1：闭包 A → B → A 升级时，A 项的 `n` 与 `success` 各只计 1。
- `appends` 取各轮之和。
- `spec_defects`、`writer_defects.blocking`、`writer_defects.nonblocking` 按缺陷 `id` 去重后计数。
- `minutes_sum`、`tokens_reported_sum` 是起点模型那几轮的和。升级后各轮的和计入对应的 `escalations` 项。
  - 值为 `null`（未记录）的轮不计入和。`minutes_n`、`tokens_n` 是有数的轮数，平均值用它们作分母。`escalations` 项有同样的两个计数。
- 合回后才发现的写者阻断（`found` 为 `after-merge`）计入 `writer_defects.blocking`，不回改首轮结论：它不影响 `first_pass`、`first_no_writer_block` 与 `within_two`。
- `acceptance.report` 不是 GitHub 评论或 PR 评审 URL 的行不计数，列进增量的 `excluded`。
- `experiment` 为 `owner-experiment` 的行汇总进 `source: owner-experiment` 的格，与 `source: field` 的格分开，不进提炼。负责人发起的 Haiku 写者实验（#951、#953、#954 的闭包）属于这一类。

## 台账字段

`ledger.json`：

- `schemaVersion`：`1`。
- `batches[]`：已合入的批次 ID，排序且没有重复。每格的 `batches` 都在这里。增量的 `rows` 为空时，批次 ID 也记在这里。
- `rows[]`：每行有 `category`（`role`、`work`、`risk`、`clarity`）、`policy_scope`（例如 `developer.work`，伪角色为 `none`）与 `cells[]`。
- 每格有：`model`、`effort`、`source`（`field` 或 `owner-experiment`）、`dispatched`、`first_pass`、`first_no_writer_block`、`within_two`、`escalated`、`escalations[]`、`appends`、`spec_defects`、`writer_defects`、`minutes_sum`、`minutes_n`、`tokens_reported_sum`、`tokens_n`、`usage_source`、`evidence`、`batches[]`。`evidence` 在第一版只用 `field-small-n` 与 `field`。

## 增量文件

增量文件有 `schemaVersion`、`batch`、`produced_by`、`rows[]`、`excluded[]` 与 `lessons[]`：

- `batch` 写成 `<UTC 日期>-<任务>-<会话简称>`。
- `rows[]` 的结构与台账相同。
- `excluded[]` 列出被剔除的流水行与原因，每项的键是 `task`、`closure`、`round`、`report`、`reason`。验收报告不是持久 URL 时，剔除的是这个闭包的全部轮，不只是那一行：缺了首轮，首轮通过一类的计数就算错。
- `lessons[]` 至多 3 条，每条的键是 `phenomenon`（现象）、`evidence`（证据链接）、`route`（建议去处），都是非空字符串。`aggregate` 输出空的 `lessons`，由会话负责人随后填入。`apply` 读增量时核对条数与键。
- 一个闭包的全部轮必须进同一个批次。`aggregate` 按闭包算 `dispatched` 与首轮结论，把后几轮单独放进另一个批次，会把同一闭包再算一次。已出的增量还没有 `apply`、同一闭包又有新的一轮时，作废旧增量，用全部流水重新 `aggregate` 成一个新批次 ID，并在反思里写明旧增量作废。已经 `apply` 的批次不改，后来的轮只写进反思。

## 上限

- 类别行唯一。
- 同一行内，（`model`、`effort`、`source`）唯一。
- `batches`（顶层与每格）没有重复的批次 ID。
- `apply` 先看顶层 `batches`：批次 ID 已在其中时，这个增量不改动台账，输出 `already-applied`。
- 增量的 `lessons` 不超过 3 条。

## 写回门槛

把计数或教训写回台账之前，逐条满足：

1. 缺陷归属能引用持久的独立验收报告（URL）。只在 tmp 的报告不算。
2. 写明样本量。样本少于 5 时，只写「n 次里成 k 次」。
3. 只往强的方向收紧。
4. 改动逐条增量：用 `aggregate` 出增量，用 `apply` 合入，不整体重写台账。
5. 同一批次不写两次。

## 命令

在仓库根运行。路径参数相对当前目录。`--policy` 缺省为 `.meta_harness/agents/roles/dispatch-policy.json`。

```sh
L=.meta_harness/agents/skills/delegate/canonical/scripts/ledger.py
uv run --locked python "$L" check --flows <文件…>
uv run --locked python "$L" check --ledger <ledger.json>
uv run --locked python "$L" aggregate --flows <文件…> --batch <批次 ID> --out <增量文件>
uv run --locked python "$L" apply --ledger <ledger.json> --increment <文件…>
```

- `check` 逐行核对字段、枚举与策略词表，错误写明文件与行号。
  - 核对台账时，每格还要自洽：`escalations` 各项 `success` 不大于 `n`，`n` 不大于 `escalated`；`escalated` 为 0 时 `escalations` 为空，大于 0 时不为空，并且不大于各项 `n` 之和；`first_pass` 不大于 `first_no_writer_block`；`evidence` 与 `dispatched` 一致（小于 5 为 `field-small-n`，否则 `field`）。
- `aggregate` 先核对流水。流水有错误时，它不写文件。
- `apply` 遇到已应用过的批次时不改文件，输出 `already-applied <批次>`。合并结果过不了核对时，它不写文件。
- 退出码：0 通过；1 输入有错误；2 用法错误或读文件错误。
