# src 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责
- [index.ts](index.ts)：根入口与公开定义
- [resources.ts](resources.ts)：资源类型 `TiktokenRanks` 与 `TiktokenResources`
- [tokenizer.ts](tokenizer.ts)：worker 内部初始化核对与同步 engine
- [ordinary-counter.ts](ordinary-counter.ts)：普通文本预切分、固定引擎适配与局部 BPE 计数
- [digest.ts](digest.ts)：资源的规范 JSON 与 SHA-256 摘要
- [engine-version.ts](engine-version.ts)：实际安装的 js-tiktoken 版本

- [executor-types.ts](executor-types.ts)：executor、lease 与 limits 公开形状
- [executor.ts](executor.ts)：准入、轮转、取消、release 和 close
- [worker-port.ts](worker-port.ts)：真实 worker 适配
- [worker-protocol.ts](worker-protocol.ts)：私有消息与边界校验
- [worker.ts](worker.ts)：worker 入口
- [piece-cache.ts](piece-cache.ts)：每 worker 与每 lease 有界缓存
- [definition.ts](definition.ts)：采用身份与冻结副本
- `cordis/index.ts`：独立 Cordis 借用服务入口
