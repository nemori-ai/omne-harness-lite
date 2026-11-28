# 新机制的一次 execution：决定者只读记录、不绕过、效果不做两遍

AG-34、AG-35、AG-36：新机制的决定者每次叫醒从头算，只读执行记录；环的点、没有成员的经过与收尾的否决都作为答复进记录；每个效果调用都先过「调用之前」与准入；拓展件成员的效果只经记过账的调用。规则在 [Agent 的规格](../../../SPEC.md#可替换的环)。

## 状态与对应

| 模型 | 实现 |
| --- | --- |
| `Want(Known)` | 决定者：环的脚本，固定为 `model`、`extend(P)`、按结论选 `tool(main)` 或 `tool(alt)`、`finish`，被否决时再 `model`、`finish` |
| `rec` | 新机制的执行记录：只增的序列 |
| `mem` | 活体内存里还没落盘的；只有坏的实现会把决定依据留在这里 |
| `issued`、`blocked`、`reply` | 已发出、被拦下、答复 |
| `chain`、`cap`、`verdict` | 经过开始、成员经注入能力做的一件事、经过的结论 |
| `terminal` | 收尾 |
| `tenant` | 租户此刻启用的拓展件 |
| `Flush` | 没有成员的经过的「原样通过」搭在下一次提交里写下 |

## 性质

- `Justified`：记录里每个由决定者发起的调用，都能由它之前的记录算出来；每个经过至多一个结论。
- `NoDup`：每个效果至多一次，含成员的效果。
- `NoBypass`：每个「已发出」的效果调用都过了「调用之前」与准入。

## 负控与见证

| 配置 | 改坏了什么 | 违反 |
| --- | --- | --- |
| `bad-empty-unrecorded.cfg` | 没有成员的经过不写进记录 | `Justified` |
| `bad-finish-unrecorded.cfg` | 收尾的否决只在内存 | `Justified` |
| `bad-bypass.cfg` | 环的点答 go 就当放行 | `NoBypass` |
| `bad-direct-effect.cfg` | 成员直接动外界，不经注入能力 | `NoDup` |

`witness-*.cfg` 各打破一条「永远不会」：环的点否决、收尾被否决、被拦下、结束、成员在活体丢了之后重放时认回原来的效果。

模型只有一次 execution，不含调用树与取消收尾，它们在 `loop-tree`。

从仓库根运行，输出目录须不存在：

```sh
node scripts/with-test-slot.mjs --want 1 --min 1 python3 packages/model/tokenizer-tiktoken/verification/run_tlc.py packages/agent/agent/verification/loop-exec tmp/formal-agent-loop-exec --jar "$TLA2TOOLS_JAR"
```

## 证明到契约测试

| 性质 | 测试断言 | 去掉什么会变红 |
| --- | --- | --- |
| `Justified` | 环的点上没有成员：丢活体前后记录逐字相同；中途启用一件会否决的拓展件，重放不改已发的调用 | 「原样通过」不落盘 |
| `Justified` | 收尾被否决，脚本接着走；丢活体后重放，记录相同 | 否决不落盘 |
| `NoDup` | 成员经注入能力做的事，在活体丢了之后重放时认回，不做第二次 | 成员的效果不记账 |
| `NoBypass` | 环的点答 go 之后发的工具调用，被准入拒绝时答「被拦下」，工具没被调用 | 让 go 跳过准入 |
