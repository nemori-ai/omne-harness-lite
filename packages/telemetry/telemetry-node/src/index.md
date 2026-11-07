# src 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责
- [index.ts](index.ts)：根入口
- [options.ts](options.ts)：选项与预算的类型和校验
- [record.ts](record.ts)：记录形状与 `log` 记录的构造
- [outlet.ts](outlet.ts)：`writer` 与 `file` 两种出口
- [pipeline.ts](pipeline.ts)：有界队列、计数、摘要、排空与关闭
- [emitter.ts](emitter.ts)：端口、绑定快照与段
- [runtime.ts](runtime.ts)：运行时的组装与 `ingestLog`
- [summary.ts](summary.ts)：离线热点聚合 `summarizeTelemetry`（TN-11）
- [summary-cli.ts](summary-cli.ts)：命令 `omne-telemetry-summary`
- [disabled.ts](disabled.ts)：禁用实现
- [cordis.ts](cordis.ts)：`./cordis` 入口与两个插件工厂
- [log-bridge.ts](log-bridge.ts)：Cordis 日志桥
