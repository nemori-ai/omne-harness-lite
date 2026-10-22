# examples 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：示例的步骤、运行前提与预期输出
- [anthropic-request.ts](anthropic-request.ts)：经代理请求一个 Anthropic 型号一次，历史中有另一来源的工具轮，推理保持开启
- [cross-family-history.ts](cross-family-history.ts)：同一段历史中 OpenAI 与 Anthropic 交替四轮，打印回放投影与每轮回复是否带有推理状态
- [support.ts](support.ts)：两个示例每一轮共用的步骤，以及组成 assistant 消息的步骤
