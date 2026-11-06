# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)（快层）：导出集合、选项的 `RangeError`、`open` 不发请求且 `signal` 中止时不交出传输（SPEC H3）
- [session.spec.ts](session.spec.ts)（快层）：契约 `TRANSPORT_TABLE` 每行每格在内存线路上驱动会话；探测时限与探测在途时的 `close()`；对端请求与进度路由；旧 HTTP+SSE 模式；契约的类别决定结论（D05、D11、O03、C02）；出站文本的词形；T5、T9 的关闭与凭据句柄；调用的 `signal` 与 `close()` 对在途写、答复流、通知与授权发现的中断；凭据句柄或元数据取回挂起时调用方仍由 `signal` 与 `close()` 放开（授权中答 `not-sent`，发现中答 `authorization-required`）、`cancelRequest` 当即返回、两个调用方同时 `close()`；线路断开与会话结束按相结算（授权中、发现中、已交给线路；进程退出与 SSE 共用流断开；迟到的 404 与迟到的应答）；会话不可用之后不发送也不询问凭据；信号之后不再取下一个元数据地址；取消通知；探测计时只经注入的 `schedule`
- [lines.spec.ts](lines.spec.ts)（快层）：两条线路在内存上的行为：不在块首的超长行，跨块未换行就越界的行，EOF 处没有换行的尾行，写被拒绝答 `unsent`，两个重叠写后 `close()` 当即返回并中止写端，交换结束后移除 `signal` 上的监听，HTTP 线路按失败码表判请求有没有离开（T8 X01），stdio 进程已停止与进程先退出时的窗口（T8 X02、退出窗口），授权元数据的取回（状态、请求形状、字节上界）
- [memory-line.ts](memory-line.ts)：内存线路替身：按方法脚本答复（含等 `signal` 才返回的写、忽略 `signal` 的答复流），记录发出的消息、被 `signal` 或 `abort()` 中止的写与流、被拒绝的回退 GET，推送共用流的事件
- [unhandled.ts](unhandled.ts)：`vitest.config.ts` 的 setup 文件，对每个用例文件生效：用例里没人处理的拒绝或未捕获的异常使该用例失败
- `model/`：会话的有界穷举探索器（SPEC「性质与证据」）：`explore.ts` 引擎、`ports.ts` 端口替身（线路、可挂起的凭据句柄与元数据取回、计时）、`properties.ts` V1–V6 的可观察形式（V4 看调用方的 promise）、`scenarios.ts` 上限、`session-model.spec.ts` 用例；`mutants.ts` 列负控，`mutate.ts` 把负控逐个放进 `src/`、跑对应用例并按字节还原（在包根运行 `node tests/model/mutate.ts [名字…] [--out 目录]`）
- [conformance.spec.ts](conformance.spec.ts)（慢层）：契约 `mcpTransportConformance()` 在 A 层对端上跑两遍（stdio 优先、HTTP 优先），通过/不适用/失败分开计数，不适用集合钉死
- [stdio.spec.ts](stdio.spec.ts)（慢层）：契约 T2、T3、T5 与 T8 的 S、X 行在真实管道上：不是 JSON 的行、16 MiB 行上界、进程退出的时序、SDK 旧对端、探测时限、不读 stdin 的对端（含缓冲里还有已出发的小写时 `close()` 在界内返回）、取消通知、`server-everything stdio`
- [http.spec.ts](http.spec.ts)（慢层）：契约 T2–T5、R4 与 T8 的 HTTP 行在本机端口上：SDK bearer 网关与授权发现、凭据不泄漏、`signal` 与 `close()` 管辖的等待、再发规则、离开前失败与头前重置、重定向、`x-mcp-header`、2025 会话与 `DELETE`、现代取消、旧 HTTP+SSE 回退（含 GET 的 401）、应答流里先到的非 `message` 事件只当噪声、`server-everything sse`/`streamableHttp`
- [fixtures/](fixtures/index.md)：A 层脚本化对端与 B 层 SDK 对端
- [e2e/](e2e/index.md)（慢层）：`createMcp` 加本地传输对五个目标走各自适用的步，两个现代传输的结局序列逐步相等
- `probes/`：SPEC 复用表依据的三个 SDK 与 `fetch` 探针，不是测试用例，手工运行；回答的问题、命令与输出摘录见 [verification/proofs/sdk](../verification/proofs/sdk/README.md)
