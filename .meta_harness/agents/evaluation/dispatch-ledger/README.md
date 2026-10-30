# 派发台账

这里保存派发子代理的聚合计数。台账按类别（角色、work、风险、清晰度）和模型档位计数，并带少量领域教训。它不保存单次派发的记录。单次流水只留任务 tmp。

台账的单写者与写入时点见[不变量](../../../../docs/engineering/integration.md#不变量)第 2 条：每个会话在交付时先写自己的增量，reduce 负责人在集成完成后提炼并写 `ledger.json`。第一版只积累计数，不改默认档位。

## 格式

- 字段含义与汇总口径：[`delegate` 的台账参考页](../../skills/delegate/canonical/references/ledger.md)。
- 文件结构：[`ledger.schema.json`](ledger.schema.json)。台账与增量文件共用这份结构。
- 角色、work 与 risk 对[派发策略](../../roles/dispatch-policy.json)的核对由 `ledger.py check` 做，不在 schema 里。

## 命令

脚本是 [`ledger.py`](../../skills/delegate/canonical/scripts/ledger.py)，只用 Python 标准库。路径相对当前目录，在仓库根运行。

```sh
# 核对台账（退出 0 表示结构、词表与上限都通过）
PYTHONUTF8=1 uv run --locked python .meta_harness/agents/skills/delegate/canonical/scripts/ledger.py check --ledger .meta_harness/agents/evaluation/dispatch-ledger/ledger.json
```

另有两个子命令：`aggregate` 把一个会话的流水汇总成增量文件，`apply` 把增量合进台账。同一批次 ID 的增量只会合入一次。退出码：0 通过，1 内容有错误，2 用法或读文件错误。
