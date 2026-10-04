# D-019 追加：fork 改锚到 pi 1.0.0（2026-10-02）

产品负责人 2026-10-02 裁定：pi 于 2026-10-01 发布 1.0.0，把 [`pi-ai-transport`](../../../realization/packages/model/pi-ai-transport/README.md) 这份 fork 的上游基线从 0.86.1 改锚到 1.0.0。
依据是 [D-063 R-5](../assets-runtimes-rulings-2026-09-25/README.md) 与 [2026-09-25 追加](gate-status-2026-09-25.md) 定的「上游追踪只按需要同步」：1.0.0 是上游语义化版本的起点，此后按需比对的都是 1.x 之间的小差分；眼下两版之间只有几处改动、已逐处判过，这时候改锚最省事。

**本次只记账，fork 来的代码一行未改。**范围、托管方式与 D-019 的比较门（[2026-09-23 补记](gate-status-2026-09-23.md)）都不变；本页只追加。

## 基线

| | 原基线 | 新基线 |
|---|---|---|
| 版本 | 0.86.1 | 1.0.0 |
| 提交 | `3390bd93630965a12a0a1a5c36ce890ec22f7e1d`（`v0.86.1-2-g3390bd93`：发布标签之后两个提交时的 main；取用的两个源文件与标签逐字相同） | `a13d35a742c6ef8462812a28fbe1d8c8b7431c32`（`v1.0.0` 发布提交） |
| 源码归档 SHA-256 | `29b35ae6…` | `1de4da19981f0caed95df5ed76a14aa90b082fa08d997407e6e3a1898fc913d1` |
| `LICENSE` SHA-256 | `0457f5bc…` | 不变 |

两份归档都用同一取法：`git archive --format=tar.gz <提交>`（git 2.25.1）。用这个取法重做原基线，复现出了原哈希 `29b35ae6…`。归档存在主检出 `tmp/sources/`，`SHA256SUMS` 在案。逐文件哈希与下表的机读版写在包内 `provenance.json` 的 `rebase` 一节。

## 两个源文件在 0.86.1 → 1.0.0 之间的改动与处置

fork 只取上游 `packages/ai/src/api/openai-completions.ts` 与 `openai-codex-responses.ts` 两个文件里的函数与片段（取哪些见节点设计的 [fork 边界](../../../realization/packages/model/pi-ai-transport/design.md#fork-边界)）。两版之间这两个文件共 7 处改动：

| 上游改动 | 处置 |
|---|---|
| 每个已解析的供应商事件调一次 `onProviderStreamEvent` 钩子（两个文件各一处，pi 0.99.0） | 不适用：本包的流读取本来就把原始到达事件交给消费方 |
| `stream_options`、`max_tokens` 两处赋值去掉类型断言 | 不适用：只改类型写法 |
| 模型级 `samplingParams` 先于请求级合并 | 不适用：本包只发显式绑定的参数，没有这一层 |
| 未知的 OpenAI 兼容端点默认不发 strict 工具 schema（pi #9816，0.87.0） | 不适用：本包本来就不发 `strict`（fork 边界表 `convertTools` 一行） |
| 用户消息里滤掉空文本段（pi #9797，0.87.1） | 不在改锚里采纳：本包的投影是自写的，而文本块规格允许空串，照抄会改动线上字节、牵动输入计量与缓存锚。另立 [nemori-ai/omne-harness-lite#50](https://github.com/nemori-ai/omne-harness-lite/issues/50)，先在真实路由上实测 |
| `parseSSE` | 上游未变 |

## 同日一并升级的另一处锚

`apps/cli` 依赖的 `@earendil-works/pi-tui` 也锚在 0.86.1，同日裁定一起升到 1.0.0。那是 npm 依赖升级，不是这份 fork，记录在 CLI 节点自己的页面里，不归本决定。

返回[本 topic 入口](README.md)。
