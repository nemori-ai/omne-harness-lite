# 模型请求、上下文、媒体和会话切换

正文已按状态权威迁入以下精确规范；本页保留来源导航，不维护并行 draft。

- [模型选择、请求与上下文装配 v1](../../../spec/capabilities/model-execution/v1/contract.md)。
- [媒体保存、投送与内容交付 v1](../../../spec/capabilities/media-content/v1/contract.md)。

## OpenRouter 的具体映射依据

2026-09-13 查阅官方文档；它们是时点证据，实际实现还须固定 API/SDK
依赖版本并用请求/响应 fixture 及获准真实调用验证。

- [Multimodal overview](https://openrouter.ai/docs/guides/overview/multimodal/overview)：
  Chat Completions 使用 image_url、file、input_audio、video_url 等内容类型；
  具体模型/格式支持仍需判定，不能只据 API 联合类型标记全模态已支持。
- [Audio](https://openrouter.ai/docs/guides/overview/multimodal/audio)：原生音频输入
  使用带格式的 base64；音频输出需相应 modalities/audio 配置和 streaming。
  本项目因此在 adapter 中保留音频块和部分交付，不能统一替换为文本。
- [Models](https://openrouter.ai/docs/guides/overview/models)：目录包含模态、
  参数、上下文和价格信息；请求全输出模态目录需明确过滤，不能只取默认
  文本目录。目录观察和实时可用资格分别存储。
- [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)：
  `require_parameters` 可以排除不支持所需参数的 provider。它参与本项目
  必需参数约束，但不代替租户授权、精确请求记录或端到端模态验证。

- [PDF inputs](https://openrouter.ai/docs/guides/overview/multimodal/pdfs)：供应方
  对非原生文件模型可能默认解析；本项目必须显式选择原生或获准转换路径。
- [Image generation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)：
  专用图片 API 的能力／流式声明与 Chat Completions 分别核对，仍受同一
  OpenRouter 出口、内容保存与请求准入契约约束。

本版具体提供者选择项目自有 OpenRouter adapter，首版采用标准 HTTP/SSE
映射而非引入被 D-006 排除的 DSH DeepSeek/pi-ai adapters；源码 fork 阶段
仅导入允许的 dsh-llm 基础，不宣称已交付该 OpenRouter adapter。
