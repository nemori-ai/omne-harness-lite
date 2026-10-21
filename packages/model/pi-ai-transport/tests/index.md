# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试分层、真实依赖与替身
- [capacity.spec.ts](capacity.spec.ts)：连接容量的 FIFO、取消、关闭、消费、归还与预约归属（快层）
- [diagnostics.spec.ts](diagnostics.spec.ts)：诊断观察者的隔离与计数（快层）
- [sse.spec.ts](sse.spec.ts)：任意切点下的 SSE 分帧、四种失败原因与读者提前结束（快层）
- [frames.spec.ts](frames.spec.ts)：无损 JSON 帧、end-marker、失败与读者提前结束（快层）
- [iteration.spec.ts](iteration.spec.ts)：提前结束的包装：`return()`、`throw()` 与 `asyncDispose` 关闭来源，启动后不重复关闭，来源关闭失败时生成器仍完成，关闭期间到达的调用不启动生成器也不重复关闭（快层）
- [http-refusals.spec.ts](http-refusals.spec.ts)：发起前的拒绝原因、拒绝时不触网、同步异常时原异常不被归还掩盖，与网络资源的配置校验（快层）
- [http.spec.ts](http.spec.ts)：同步发起、停止、2xx 与非 2xx、响应体读取错误的类型、读者提前结束、错误体、连接超时与计时器清除、关闭后的清理与诊断隔离（慢层）
- [network.spec.ts](network.spec.ts)：网络资源的关闭排空、连接池、同一接收方连续发起、容量是唯一的并发上限、多接收方不排队与排队即缺陷（慢层）
- [public-entry.spec.ts](public-entry.spec.ts)：根入口没有运行时导出，类型形状与组架构一致
- [public-entry.spec-d.ts](public-entry.spec-d.ts)：五个公开类型的编译期用例
- [dependencies.spec.ts](dependencies.spec.ts)：运行依赖与导入方向
- [support/https-server.ts](support/https-server.ts)：自签证书、本地 HTTPS 服务与黑洞监听
- [support/exchange.ts](support/exchange.ts)：交换的输入、预约、观察工具与清理断言
- [support/sources.ts](support/sources.ts)：记录读者行为的字节源
- [fixtures/](fixtures/index.md)：测试固定输入（不适用）
