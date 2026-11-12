# src 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责
- [index.ts](index.ts)：公开根：`createLocalTransportFactory`、`LocalTransportOptions`
- [cordis.ts](cordis.ts)：`./cordis` 入口：插件工厂 `createMcpPlugin`、`McpPluginParts`、`McpPluginConfig` 与配置的 Standard Schema；四个端口适配器（每次调用现取，缺席答该端口的 `unknown`）、三个服务子类与撤除函数（行为见 [SPEC「Cordis 插件」](../SPEC.md#cordis-plugin)）
- [options.ts](options.ts)：选项的形状与 `RangeError` 的核对
- [factory.ts](factory.ts)：按材料建线路、包成会话，给缺省的计时端口与缺陷出口；`open` 不发请求并再核 `signal`（SPEC H3）
- [session.ts](session.ts)：协议会话：在途请求表（每项带自己的结算与出发点，按相结算）、调用方只等结算而工作流是后台工作（`work`）、连接模式的判别联合、`classifyWireEvent` 归类后取契约决策层的结论、契约的组成与按连接的规则、再发、探测时限、取消与关闭（单飞）、凭据句柄的一处入口、授权发现的进度、对端请求与进度路由、旧 HTTP+SSE 回退的判定与模式；计时端口 `Scheduler`、缺陷出口与 `SessionOptions`（SPEC H1、H4、H5、H9、H11、H14、所有权一节）
- [line.ts](line.ts)：线路端口的内部类型：`Line`、`Outbound`、`Exchange`、`LineEvent`、`GetOpened`、`FirstEvent`、`AnswerHeaders`（SPEC H2）
- [stdio-line.ts](stdio-line.ts)：stdio 线路：按行读写、每一行的字节上界、退出窗口、stderr 读出丢弃、被 `signal` 中止的写、关闭时一律中止写端、单飞的关闭与 T5 的关闭次序（SPEC H6、H8、H12）
- [http-line.ts](http-line.ts)：Streamable HTTP 线路：POST 与 JSON/SSE 应答、不跟随重定向、离开前失败的分法、2xx 正文的上界、回退 GET 的事实（`openGet`）、SSE 模式的共用流与 endpoint（SPEC H2、H8、H9、H10、H11）
- [authorization.ts](authorization.ts)：一个 well-known 地址的元数据取回，按契约的 `WIRE_LIMITS` 读，不经凭据句柄
- [sse-bytes.ts](sse-bytes.ts)：SSE 正文一个事件的字节上界：在解码之前数自上一个空行以来的原始字节，超过上界时以 `RangeError` 结束流（SPEC H8）
- [body.ts](body.ts)：有字节上界地读出整个 HTTP 正文：错误状态的正文、回退 GET 的非 2xx 正文、授权元数据（SPEC H8）
- [limits.ts](limits.ts)：字节上界 `BYTE_LIMIT`，取契约的 `WIRE_LIMITS.maxBytes`（16 MiB）
- [queue.ts](queue.ts)：线路事件的异步队列

阅读次序：`index.ts` → `factory.ts` → `session.ts` → `line.ts` → 两条线路。Cordis 插件另从 `cordis.ts` 读起。
