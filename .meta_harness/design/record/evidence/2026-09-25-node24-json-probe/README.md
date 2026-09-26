# 2026-09-25 · Node 24 无损 JSON 读写的运行时前提取证

[`packages/core/content-blocks`](../../../realization/packages/core/content-blocks/design.md#严格的无损-json-读写) 的 `readJsonStrict`／`writeJsonLossless`
是本程 [D-040 §八 M36](../../decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)（超出 2^53 的整数与金额无损保留原文）的唯一实现点，
其实现路径依赖 Node 的两个 API：`JSON.parse` reviver 的第三参 `context.source`（原文片段）与 `JSON.rawJSON`（写回原文）。
节点起草时把它标为「假设、须取证」，节点独立评审 N1 要求在 G5 前取证；本次是那个探针
（主线裁定 [M49](../../decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。

## 跑了什么

[`probe.mjs`](probe.mjs)：解析 `{"a":9007199254740993,"b":1.10,"c":[1e400,-0,0.1]}`，在 reviver 里记下每个数字的 `(键, 折成的 number, context.source)`；
再用 `JSON.rawJSON` 写回 `9007199254740993` 与 `1.10`。原始输出在 [`output.txt`](output.txt)。

## 结果

| 项 | 观察 |
|---|---|
| 运行时 | Node **v24.18.0**，V8 13.6.233.17-node.50 |
| `context.source` | 可用：`9007199254740993` 折成 `9007199254740992` 但原文完整保留；`1.10` 原文保留；`1e400`（折成 `null`／Infinity）、`-0`、`0.1` 原文都保留 |
| `JSON.rawJSON`／`JSON.isRawJSON` | 都是 `function`；`JSON.stringify` 写回 `{"x":9007199254740993,"y":1.10}`，逐字节等于原文 |
| 退出码 | 0 |

**结论**：在 Node ≥ 24.18.0 上，节点选定的实现路径成立；手写 RFC 8259 解析器的退路不需要启用，保留为改选条件。

## 边界

- 只证明这两个 API 在该版本可用且对这五个样本保留原文，不证明 `readJsonStrict` 对重复键、深嵌套、超长输入的行为——那些归节点的单元测试。
- 实施时以 `engines` 把 Node 下限钉在 24.18.0 或更高；换运行时或降版本须重跑本探针。
- run id 用本程工作日 `2026-09-25`；执行时刻为 UTC 2026-09-24 晚。
