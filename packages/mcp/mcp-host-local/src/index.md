# src 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责
- [index.ts](index.ts)：公开根：`createLocalTransportFactory`、`LocalTransportOptions`
- [options.ts](options.ts)：选项的形状与 `RangeError` 的核对
- [factory.ts](factory.ts)：按材料建线路、包成会话；`open` 不发请求并再核 `signal`（SPEC H3）
- [session.ts](session.ts)：协议会话：请求的组成、`classifyWireEvent` 归类、T8 的结论、再发、探测时限、取消与关闭、凭据句柄、授权发现、对端请求与进度路由、旧 HTTP+SSE 模式（SPEC H1、H4、H5、H9、H11）
- [line.ts](line.ts)：线路端口的内部类型：`Line`、`Outbound`、`Exchange`、`LineEvent`、`SseEntry`（SPEC H2）
- [stdio-line.ts](stdio-line.ts)：stdio 线路：按行读写、行字节上界、退出窗口、stderr 读出丢弃、T5 的关闭次序（SPEC H6、H8、H12）
- [http-line.ts](http-line.ts)：Streamable HTTP 线路：POST 与 JSON/SSE 应答、不跟随重定向、离开前失败的分法、正文上界、旧 HTTP+SSE 模式的 GET 流与 endpoint（SPEC H9、H10、H11）
- [authorization.ts](authorization.ts)：一个 well-known 地址的元数据取回
- [message.ts](message.ts)：对端消息的解析与本侧消息的写出
- [limits.ts](limits.ts)：16 MiB 的字节上界与 JSON 上界
- [queue.ts](queue.ts)：线路事件的异步队列

阅读次序：`index.ts` → `factory.ts` → `session.ts` → `line.ts` → 两条线路。
