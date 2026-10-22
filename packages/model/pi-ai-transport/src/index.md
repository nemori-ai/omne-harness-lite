# src 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责
- [index.ts](index.ts)：根入口，转出五个家族类型、家族表、三段传输的工厂与配置类型、网络资源的工厂与配置类型
- [family-table.ts](family-table.ts)：家族表：`defineFamily`、`composeFamilies`、`recordAdoption` 与 `replayFormatsOf`
- [canonical-json.ts](canonical-json.ts)：纯数据的规范 JSON 与 SHA-256 摘要
- [chat-completions/index.ts](chat-completions/index.ts)：子入口 `./chat-completions`，转出 `bindChatCompletions` 与引擎类型
- [chat-completions/vocabulary.ts](chat-completions/vocabulary.ts)：记录词表、四个 hook 与计量接缝的类型
- [chat-completions/bind.ts](chat-completions/bind.ts)：`bindChatCompletions`：绑定时的记录检查与完整绑定
- [chat-completions/request.ts](chat-completions/request.ts)：plan 与 encode 的步骤，改编自 pi
- [chat-completions/projection.ts](chat-completions/projection.ts)：请求到网关消息的投影、缓存位置与工具，改编自 pi
- [chat-completions/parameters.ts](chat-completions/parameters.ts)：按记录表规划与写出参数
- [chat-completions/gateway.ts](chat-completions/gateway.ts)：网关字段的闭合词表
- [chat-completions/json.ts](chat-completions/json.ts)：排序键的 json-text 值树构造
- [chat-completions/decoder.ts](chat-completions/decoder.ts)：解码器的位置，尚未交付
- [family.ts](family.ts)：已接受的家族贡献接口类型
- [config.ts](config.ts)：三段传输的配置类型与校验
- [transport.ts](transport.ts)：`createPiTransport`：外层与 prepared 的生命周期、路由查找与家族绑定
- [materialized.ts](materialized.ts)：materialize 与一次发送：名额、payload、回执、start 与关闭
- [fact-stream.ts](fact-stream.ts)：一次发送的事实流：SSE、协议帧、家族解码器与唯一的 `ended`
- [termination.ts](termination.ts)：发送结束到流终止的纯函数映射
- [payload.ts](payload.ts)：内容引用扫描、请求体序列化与 SHA-256 摘要
- [capacity.ts](capacity.ts)：连接容量、预约与座位
- [diagnostics.ts](diagnostics.ts)：诊断事件与观察者隔离
- [sse.ts](sse.ts)：字节流到 SSE 事件 data 文本，改编自 pi
- [frames.ts](frames.ts)：SSE data 文本到协议帧
- [http.ts](http.ts)：一次同步发起的 HTTPS 交换，含读者看到的错误类型
- [network.ts](network.ts)：网络资源的组合、代理配置的校验与关闭排空
- [pool-agent.ts](pool-agent.ts)：连接池 `PoolAgent`：经代理建立连接时的缺陷规避与建连取消，以及 Node 版本是否支持代理
- [iteration.ts](iteration.ts)：读者提前结束时关闭来源的包装
- [limits.ts](limits.ts)：限额与计时值的校验
