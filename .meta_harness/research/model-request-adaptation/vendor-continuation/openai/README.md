# OpenAI GPT-6 输入计量的续查

2026-09-28；对象为既定六个 GPT-6 ID 的 OpenRouter `openai` 固定路由。消费者是模型适配纵线的 OpenAI 计量与逐模型验证工作。

- [结论与限制](research.md)：六个首样本可说明什么、Pro 用量为什么不能直接当上下文长度。
- [来源及可复核证据](evidence.md)：第一方原文、原始运行路径及哈希。
- [首样本的脱敏数值摘录](initial-observations.json)：仅用量与身份；不含凭据或实际响应内容。

这是研究证据，不是 tokenizer 身份确认、生产 meter 采用或模型完整认证。下一轮离线实验工具位于 `packages/model/pi-ai-transport/tests/fixtures/openai/calibration.mjs`，只生成请求与分析数字，不发送请求。
