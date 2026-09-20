# pi-ai OpenRouter 传输证据

## 固定版本、源码与离线 SSE

- 对象：`@earendil-works/pi-ai@0.85.1`；DSH `@deepseek-ai/dsh-llm-pi-ai` 当时声明该依赖的 `^0.85.1` 范围。本次实际运行固定版，不能外推到所有未来版本。
- 来源：[pi-ai 源仓库](https://github.com/earendil-works/pi/tree/main/packages/ai)、[OpenRouter 用量说明](https://openrouter.ai/docs/cookbook/administration/usage-accounting)、[pi issue #8940](https://github.com/earendil-works/pi/issues/8940)。本地固定安装版 `dist/api/openai-completions.js` 的流循环未保存 top-level `chunk.provider`，结果 `provider` 取路由 `model.provider`；`parseChunkUsage` 只取 token 并调用 `calculateCost`，没有保留 raw `usage.cost`。
- 方法：`node tmp/pi-ai-spike/compare-both.mjs` 将同一受控 SSE 送入直接 transport 与 pi-ai；模型 `openai/gpt-5.1`、虚拟凭据、注入 fetch，载荷有 `provider=OpenAI`、`usage.cost=0.12345`、一个 `read_file` 工具调用；无真实出站。
- 观察：两者只请求一次 `https://openrouter.ai/api/v1/chat/completions`，并使用 `provider.order=['OpenAI']`、`allow_fallbacks=false`、`require_parameters=true`。直接 transport 得到服务商 `OpenAI`、实际费用 `0.12345`；pi-ai 得到路由 `openrouter`、目录估价 `0.0000625`，无服务商/实际费用来源；均识别工具流。离线安装副本的最小解析补丁同时保留两种费用与服务商，证明解析点可修改，**不证明补丁可用于产品**。
- 限制：pi-ai 还发出 `store:false`、`max_completion_tokens`、`reasoning.effort=none`、`strict:false` 等请求差异；未证明它们对所有模型无影响。复现实验脚本原件在本次任务的忽略目录，正式持续验证须落入产品测试。

## 真实 OpenRouter 短请求

- 方法：在已授权环境用 `node tmp/pi-ai-spike/compare-live.mjs` 对直接 transport 与未改 pi-ai 分别发送一次 `openai/gpt-4o-mini` 短文本请求，固定 OpenAI 路由且关闭 fallback，随后以各自 response ID 查询 `GET /api/v1/generation?id=...`；密钥没有进入脚本和文档。
- 观察：两次均 HTTP 200；各自 SSE 报 `provider=OpenAI`、`usage.cost=0.0000027`、`is_byok=false`，各自 generation 记录报 `provider_name=OpenAI`、`total_cost=0.0000027`。直接 transport 保留 `quality=actual`；pi-ai 返回 `provider=openrouter`、无实际服务商和费用来源，其目录估价约 `0.0000027`（浮点表示有末位误差）。
- 支持范围：本次证明 pi-ai 结果**丢失来源语义**，没有证明真实扣费数值不符；也没有核对 BYOK、折扣、缓存、多模型或 Agent Run 全链。官方 OpenRouter 文档区分账户 `usage.cost` 与上游推理成本，二者不得混用。

## 产品实施探针的边界

实施分支 `f0bb020` 的直接 transport 真实双轮工具请求给出唯一 `read_file(input.txt)`、按原 tool-call ID 回传本地文件正文、最终文本匹配，并按两个 response ID 查询实际费用。后续隔离探针以产品 `LocalExecutionHost + LocalFileToolPlugin` 运行文件读取，也得到 succeeded/quiescent/cleanup done/effect none。它们验证一个真实正常路径和 wire 投影，**没有经过产品 AU、Budget、Run/Tools Admission 或 CC-06 恢复**；不作为这些 owner 的符合性证据。
