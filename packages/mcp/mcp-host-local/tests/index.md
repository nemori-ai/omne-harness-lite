# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)（快层）：导出集合、选项的 `RangeError`、`signal` 在 `open` 之前中止时不交出传输也不授权（SPEC H3）
- [session.spec.ts](session.spec.ts)（快层）：契约 `TRANSPORT_TABLE` 每行每格在内存线路上驱动会话；探测在途时的 `close()`；对端请求与进度路由；旧 HTTP+SSE 模式；契约的类别决定结论（D05、D11、O03、C02）；出站文本的词形；T5、T9 的关闭与凭据句柄；调用的 `signal` 与 `close()` 对在途写、答复流、通知与授权发现的中断；凭据句柄或元数据取回挂起时调用方仍由 `signal` 与 `close()` 放开（授权中答 `not-sent`，发现中答 `authorization-required`）、`cancelRequest` 当即返回、两个调用方同时 `close()`；线路断开与会话结束按相结算（授权中、发现中、已交给线路；SSE 共用流断开；迟到的 404 与迟到的应答）；会话不可用之后不发送也不询问凭据；信号之后不再取下一个元数据地址；取消通知
- [lines.spec.ts](lines.spec.ts)（快层）：HTTP 线路在内存上的行为：交换结束后移除 `signal` 上的监听，按失败码表判请求有没有离开（T8 X01），授权元数据的取回（状态、请求形状、字节上界）
- [sse-bytes.spec.ts](sse-bytes.spec.ts)（快层）：SSE 事件的字节计数器，上界取小值：正好上界与多一字节、按字节不按字符、三种空行（LF LF、CRLF CRLF、CR CR）与分在两块的 CRLF、跨块累计、越界之后不交出（SPEC H8）
- [cordis-entry.spec.ts](cordis-entry.spec.ts)（快层）：`./cordis` 的插件在真实 Cordis `Context` 上，没有对端：完整合法配置装载后三个键取得到服务、撤除后取不到；没有连接时三个服务的每个方法的答复；三个端口逐个缺席时实际调用缺席端口的那一步的答复（S1 的 `unknown`、R6 的 `credential-unavailable`（`unknown`）），记录请求的 `fetch` 替身没有收到请求，补上端口后下一次 `refresh` 发出请求；三个端口各自换代后下一次端口调用用新的实例；`AggregateError` 撤除的 Cordis 机制探针；配置 Schema 的接受与逐行拒绝（含 `null`、`undefined` 与各上界不是数的行；`ValidationError` 与消息），越界值的 `RangeError`；插件名是 `mcp`；接入点经工厂参数 `fetch` 的替身走一次在请求离开之前失败的 `refresh`，凭据端口按 `http-authorization` 用途被问到
- [memory-line.ts](memory-line.ts)：内存线路替身：按方法脚本答复（含等 `signal` 才返回的写、忽略 `signal` 的答复流），记录发出的消息、被 `signal` 或 `abort()` 中止的写与流、被拒绝的回退 GET，推送共用流的事件
- [unhandled.ts](unhandled.ts)：`vitest.config.ts` 的 setup 文件，对每个用例文件生效：用例里没人处理的拒绝或未捕获的异常使该用例失败
- `model/`：会话的有界穷举探索器（SPEC「性质与证据」）：`explore.ts` 引擎、`ports.ts` 端口替身（线路、可挂起的凭据句柄与元数据取回）、`properties.ts` V1–V6 的可观察形式（V4 看调用方的 promise）、`scenarios.ts` 上限、`session-model.spec.ts` 用例；`mutants.ts` 列负控，`mutate.ts` 把负控逐个放进 `src/`、跑对应用例并按字节还原（在包根运行 `node tests/model/mutate.ts [名字…] [--out 目录]`）
- [cordis-journey.spec.ts](cordis-journey.spec.ts)（慢层）：`./cordis` 的插件在脚本化 HTTP 对端上：「刷新 → 调用」；工厂参数 `clock` 的时刻盖在发布的清单的 `acquiredAt` 上；三个服务的每个方法经插件调用一次；`cancel` 在途调用；缺席的端口补上后发布清单；采用换代后下一次 `refresh` 按新的采用发布；撤除后三个键取不到、凭据句柄的 `release()` 被调用；撤除时在途的调用答 `unknown`（`abandoned`）
- [conformance.spec.ts](conformance.spec.ts)（慢层）：契约 `mcpTransportConformance()` 在 A 层 HTTP 对端上跑一遍，通过/不适用/失败分开计数，不适用集合钉死
- [http.spec.ts](http.spec.ts)（慢层）：契约 T2–T5、R4 与 T8 的 HTTP 行在本机端口上：SDK bearer 网关与授权发现、凭据不泄漏、`signal` 与 `close()` 管辖的等待、再发规则、离开前失败与头前重置、重定向、`x-mcp-header`、2025 会话与 `DELETE`、现代取消、旧 HTTP+SSE 回退（含 GET 的 401）、应答流里先到的非 `message` 事件只当噪声、SSE 事件的字节上界（正好上界被读、多一字节流断开，事件由 3 字节字符组成）、`server-everything sse`/`streamableHttp`；脚本化对端的用例经对端交出的 `factory` 打开传输，`received()` 只等经它发出的请求；夹具自己的用例：对端晚 50 ms 才记下的请求，`received()` 仍拿到
- [fixtures/](fixtures/index.md)：A 层脚本化对端与 B 层 SDK 对端
- [e2e/](e2e/index.md)（慢层）：`createMcp` 加本地传输对两个目标走各自适用的步
- `probes/`：SPEC 复用表依据的三个 SDK 与 `fetch` 探针，不是测试用例，手工运行；回答的问题、命令与输出摘录见 [verification/proofs/sdk](../verification/proofs/sdk/README.md)
