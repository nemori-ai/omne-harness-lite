# OpenAI 十二个所选 route 的定向复核

2026-09-28。对象是 `tools/model-probe/src/models.mjs` 固定的十二个 `openai/gpt-*` ID，所选 OpenRouter provider 均为 `openai`。这是无凭据、零模型调用的公开资料复核；没有重新认证任何模型。

## 已核事实与来源

- 2026-09-27 的[第一方字段归档](../first-party-and-joint-2026-09-27.tar.gz)中 `facts-openrouter-2026-09-27/facts.json` 将十二个 ID 均配到唯一所选 `openai` endpoint；每个 endpoint 报 `reasoning_effort`、`seed`、`max_tokens` 参数名。参数名出现不证明逐值域或条件组合；`max_completion_tokens` 只在 aggregate 出现，不能当作所选 route 的实际键。
- 同一归档的 `facts-native-openai-anthropic-2026-09-27/16IDfacts.json` 保留原生型号页取得结果。六个 `*-pro` 后缀型号的精确原生身份未闭合；不能从非 Pro 同名基础型号推导所有行为。
- [OpenAI GPT-6 指南](https://developers.openai.com/api/docs/guides/latest-model)与[OpenRouter GPT-6 迁移文档](https://openrouter.ai/docs/cookbook/evaluate-and-optimize/model-migrations/gpt-6)在本次访问中可读。Astra 不接受 `none` effort；Sol/Luna 接受。原生 Chat 的 reasoning＋tools 限制与 OpenRouter Chat 转换路径是两层事实，不能由一方推出另一方的完整运行保证。先前[受控请求报告](2026-09-27-first-party-and-joint.md)只观测到 Astra/Sol/Luna 的有限 reasoning＋tools 样本，包含一条算错结果；不覆盖其余九个 ID 或生产流式回放。
- [OpenRouter 缓存文档](https://openrouter.ai/docs/guides/best-practices/prompt-caching)本次访问明确：OpenAI 自动缓存无需额外控制；GPT-5.6+ 显式缓存的 TTL 使用请求根 `prompt_cache_options.ttl`，断点在文本块 `prompt_cache_breakpoint`；Anthropic 样式 `cache_control.ttl` 向 OpenAI 转发时被丢弃。缓存最短 30 分钟的声明不是允许值全集，也不证明所选 route 实测续期或命中。

## 限制与失效信号

本轮未重新 GET 十二个精确 endpoint、未探测上游 Chat wire、没有凭据/POST/付费/实际缓存 TTL 到期实验。归档的 endpoint 快照仍是 2026-09-27；模型、所选 tag、网关转换、缓存文档或账号政策变化会使其需要重核。所选 endpoint 的完整 effort 值域、采样条件、图像逐件限制、Pro 原生映射及所有十二个实际流式工具/推理回放仍未知。旧 warm-read 记录只说明当时账号与请求发生过缓存读数，不是新代码的证据。
