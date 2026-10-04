# Grok 4.7 新 nonce 完整输入观察

2026-09-28 UTC，接续[完整输入口径修正](2026-09-28-complete-prompt-calibration.md)。本次只读 root 的三次实际 OpenRouter → `xai` 结果；不是旧图片失败的重试。model `x-ai/grok-4.7`、definition `1`、implementation `pi-ai:xai/mp4-1`，cache automatic，无 fallback。新 nonce 是 `xai47-totalprompt-20260928-a`，请求在发送前冻结于 `grok47-fresh-manifest.json`（SHA-256 `22c541910122b027ff791cafe04fd7528aac4283af4f6348e087cb2e5caa882f`）；每个 JSON 序列化及 wire SHA 与冻结值相同。

原始保留位置是 HUB `tmp/model-request-runtime/xai47-fullprompt-20260928-1807/observed.jsonl` 和每 reservation 的 `outcome.json`。完整 outcome 是实际领域结果，保留 headers、usage、cost、内容及推理块，并非原始 SSE 帧副本。分析者未发送请求、读取凭据或原账本。

| 用例                 | 分组    | UTF-8 wire 字节 | 原候选 | 未缓存输入 | 缓存读 | 缓存写 | 完整输入 | 含推理输出 | 推理子集 |       USD |
| -------------------- | ------- | --------------: | -----: | ---------: | -----: | -----: | -------: | ---------: | -------: | --------: |
| fit-short            | fit     |             373 |     93 |        122 |   1152 |      0 |     1274 |         89 |       88 | 0.0010832 |
| fit-multilingual     | fit     |             469 |    117 |       1297 |      0 |      0 |     1297 |        553 |      545 | 0.0047296 |
| holdout-tool-history | holdout |             982 |    245 |        240 |   1152 |      0 |     1392 |        125 |      111 | 0.0014448 |

三笔都是 complete、provider xAI，完整输入由实际 `input_tokens + cache_read_tokens + cache_write_tokens` 独立复算；最后一笔非缓存数的 JSON 原文是 `24e1`，无损数值读取保持其精确含义 240。缓存项有明确数值；没有用费用倒推或把缺失按零填入。

## 固定算法的 fit 与 holdout

第一方算法来源及投影边界仍见[Grok Build 源码读数](2026-09-28-grok-build-estimator.md)。发送前原候选为 `floor(finalWireUtf8Bytes / 4)`，不是原生 tokenizer。只取两个 fit 差额：`max(1274−93, 1297−117)=1181`。固定这个经验偏移后，预测分别为 1274、1298、1426；误差为 0、+1、+34。工具 holdout 没有参与偏移选择；这个偏移没有借用 4.6 的数值，也没有调整乘数。

4.6 的独立偏移141与这里1181，均可由同一算式加每型号窄参数表达；这只是观测上成立的算法结构，不证明两模型共享 tokenizer，也不证明1181是固定官方协议开销、隐藏 prompt 或其他特定机制。内部来源未被本次观测解释。2 fit + 1 holdout 不构成误差界、任意文本长度的覆盖、媒体或完整路由认证。

三笔结果都带 `reasoning.encrypted`；工具 holdout 是冻结的明文 thinking 与工具历史，没有消费此次实际返回的 opaque 后再发下一轮。这组数据不支持密文按字节推算或删除它来制造多轮可用。默认 effort 与 high 在当前可见文本/tools 输入有观察，其他 effort 不在本批范围。

多语请求 `maxOutputTokens=128`，实际 output553、reasoning545；这再次表明128不能作为当前路由含推理费用的硬上界。本次预算预留使用公共 endpoint `max_completion_tokens=450000`；这一操作没有解释或修改产品参数语义。4.7 旧图片失败缺失 raw 的限制仍成立，本批不能替它补证。

## 保留源摘要

| 完整领域结果                                        | SHA-256                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `fff4b44f-1d2e-467d-8cb9-0a1f190e68ce.outcome.json` | `67d3911f415cfa5eba4270abf74b9e81c72a5f41d4b815c27233c1a8516d29e5` |
| `0f288c88-8d90-4019-93da-06f54a6343c3.outcome.json` | `843a3d08423075f3e897864d2d0e10a5f203fdccd7a637f520b80a8eb26449e1` |
| `a20b11ad-dcc0-44e5-8b42-13202daf8773.outcome.json` | `f2568710dfa9ffc9be3c69b5c50b82516d456854104eb405b52ffc287fac18e9` |

失效边界：model/endpoint、上游协议、输入构造、第一方算法来源或领域计量换算发生变化时重查。没有长度阶梯、媒体、opaque 历史、跨供应商端点或长期样本支持更强结论。
