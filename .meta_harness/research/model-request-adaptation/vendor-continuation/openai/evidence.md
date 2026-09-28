# 来源与复核

取证日期 2026-09-28；既有实际请求由主调度执行，本分支只读原件并运行离线脚本，没有接触凭据或账本，也没有发送模型请求。

| 证据                                                                                                                               | 取得方式、支持范围及限制                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [OpenRouter GPT-6 migration guide](https://openrouter.ai/docs/cookbook/evaluate-and-optimize/model-migrations/gpt-6) 的 What’s New | 直接打开官方全文，型号表列出 Astra/Sol/Luna 与各 Pro slug，并说明 Pro 模式选择；支持精确 slug 对应，不能揭示实际内部 wire 或 token 拆分。                                                                                        |
| [OpenRouter Astra Pro 型号页](https://openrouter.ai/openai/gpt-6-astra-pro) 的型号说明                                             | 直接打开官方全文，Astra Pro 对应 Astra 的 Pro 模式；与 migration guide 独立页面相符。                                                                                                                                            |
| [OpenAI reasoning guide](https://developers.openai.com/api/docs/guides/reasoning#reasoning-mode) 的 Reasoning mode                 | 经官方文档读取工具抓取全文；Pro 汇总模型工作并据此计费。这里只引用原生行为，不把它直接当 OpenRouter usage 字段规范。                                                                                                             |
| [OpenAI token-counting guide](https://developers.openai.com/api/docs/guides/token-counting) 的 Why use the token counting API      | 经官方文档读取工具抓取全文；本地文本计量遗漏结构、媒体及模型相关因素。不曾调用原生计数端点。                                                                                                                                     |
| 既有真实请求 `openai-fit-afd30ca4-01d9-41f7-9354-6d128b56949b`                                                                     | HUB 的 `tmp/model-request-runtime/` 下完整 owner 证据。六条 `gpt6-N-baseline-observation.json` 已只读核原件；[摘录](initial-observations.json)逐条保存原件 SHA-256、请求哈希、提供者及精确用量。原响应和费用账本仍由主调度保留。 |
| `packages/model/pi-ai-transport/tests/fixtures/openai/initial-baselines.json`                                                      | 保存六个合成测试输入的原始 wire、哈希和已知输入特征，不包含模型响应。计量脚本重新校验 wire，再经当前公开 `planRequest` 生成新实验；新请求除最后 user text 外必须逐字节一致。                                                     |

普通型号三点的纯文本特征分别 25、29、32，计算来自同树锁定的 `js-tiktoken` 与逐 text block 求和。此处没有重新命名词表为 GPT-6 tokenizer。

本轮属于对[原十二路由复核](../../reports/2026-09-28-openai-twelve-route-facts.md)的**补充**：原报告保留；新核的 Pro slug 对应缩小了此前原生身份未闭合的范围，没有补足原生转换细节或实际完整认证。
