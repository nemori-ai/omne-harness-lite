# Grok 4.6 完整输入用量校准观察

2026-09-28 UTC。只读 root 实际 OpenRouter → `xai` 请求产生的领域结果；本次分析没有发送新请求、读取凭据或原账本。对象为 `x-ai/grok-4.6`，definition `1`、implementation `pi-ai:xai/mp4-1`、cache automatic、固定上游 xAI，无 fallback。完整源保留在 HUB `tmp/model-request-runtime/xai-46-text-20260928-1753/`；三个 `outcome.json` 含实际响应领域值和原始响应 headers，**不是原始 SSE 帧副本**。账号换算沿当前 `accounts.ts` 与 [call-accounts v2 S-6](../../../../design/spec/data/call-accounts/v2/contract.md#s-6-usage四项-token-与来源)。

## 关键修正与可复核数据

`Usage.input_tokens` 是没有从缓存读取、也没有写入缓存的输入部分，不能单独拿来校准完整上下文。传输换算为 `prompt_tokens − cached_tokens − cache_write_tokens`；三项输入相加才是完整输入。任一项未知时，不能把它按零计入。旧 journal 没有缓存字段，保持原样；本次从已保存的实际领域结果派生完整输入，不改历史观察。

| 固定用例             | 分组    | wire 字节 | 原候选 | 未缓存输入 | 缓存读 | 缓存写 | 完整输入 | 输出（含推理） | 其中推理 |
| -------------------- | ------- | --------: | -----: | ---------: | -----: | -----: | -------: | -------------: | -------: |
| fit-short            | fit     |       314 |     78 |        219 |      0 |      0 |      219 |            139 |      138 |
| fit-multilingual     | fit     |       403 |    100 |        112 |    128 |      0 |      240 |            891 |      883 |
| holdout-tool-history | holdout |       912 |    228 |        206 |    128 |      0 |      334 |            234 |      233 |

实际费用依次为 `0.001272`、`0.005634`、`0.00188` USD。全输入口径下，短英文 219 小于多语 240；原先 219 > 112 的表象来自把非缓存部分当成总数。费用和输出推理是独立事实，不通过费用倒推缺失的缓存数。

原候选在发送前冻结为 `floor(finalWireUtf8Bytes / 4)`；第一方来源及与其原生 ConversationItem 的投影差异见[源码窄核验](2026-09-28-grok-build-estimator.md)。仅按两个 fit 的差额计算 `max(219−78, 240−100)=141`；固定这个数后，三个预测为 219/241/369，误差 0/+1/+35。工具 holdout 没有参与选择偏移量。这个单点 holdout 检查支持这些指定输入上的观测，**不构成精确 tokenizer、误差上界或任意大小上下文的覆盖证明**。默认推理和显式 high 的可见文本/tools 在此有样本；其他 effort、媒体和 opaque 历史没有相应计量证据。

三个结果都带有 `reasoning.encrypted` 的 opaque thinking；工具 holdout 使用的是提前构造的明文 thinking/tool 历史，不是把本次返回密文后继续多轮。不能由这三例声称 opaque replay 或完整多轮已完成。

## 输出边界与失败信息限制

三个请求的 `parameters.maxOutputTokens` 都是 128，实际输出含推理却是 139/891/234。当前 `accounts.ts` 对 `completion_tokens` 原值直接映射为 `output_tokens`，`reasoning_tokens` 是其子集。这些观测否定了用请求中的 128 作为本次计费输出硬上界；它们没有直接解释是上游仅限制可见输出、参数忽略还是其他行为。没有凭此修改产品参数语义。公共 endpoint 快照报告 `max_completion_tokens=450000`，不能把请求 128 冒充该路由完整输出上限。

4.7 先前三笔仅保存 summary journal，其缓存分项与完整 outcome 未保存；无法从非缓存 input 103/124/218 还原完整输入，也不从费用逆推。另一次 4.7 图片失败未保存完整失败/raw，原因与 request ID 的缺口保留，不能补造。新的 nonce 三例只是独立的完整输入采样，不是重试该失败图片。

## 源摘要与失效边界

| 保留源                                              | SHA-256                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `cd34bc63-521d-4470-8d9d-6ea8f54ff1f6.outcome.json` | `5859daac7dd92c73b888939f781c741cb15d930a8f5ac23fab6ba3264376158e` |
| `ff4d8bd0-710d-40b5-86b2-ef2ca5f88af8.outcome.json` | `a8bc855d4b37ff5c8303f2356770adee5b9e52c0f88f7c82dca49f3b303cce0d` |
| `2832f2f5-0f47-4398-8f08-716695ad13fa.outcome.json` | `7e191a4e8e5a9c0f0afc353642f800bed47e067f5113eb7caccb3cf41c069c1d` |

若固定 model/endpoint、上游实际协议、输入构造、域用量换算或第一方算法来源改变，应重查这些观察。当前只有 2 fit + 1 holdout、文本及构造工具历史；没有长度阶梯、图像、密文重放、跨 endpoint 或长期分布证据。偏移量是这两个 fit 的实测派生量，不是上游承诺。
