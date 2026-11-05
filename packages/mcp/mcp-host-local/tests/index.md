# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)（快层）：导出集合、选项的 `RangeError`、`open` 不发请求且 `signal` 中止时不交出传输（SPEC H3）
- [session.spec.ts](session.spec.ts)（快层）：契约 `TRANSPORT_TABLE` 每行每格在内存线路上驱动会话；探测时限与探测在途时的 `close()`；对端请求与进度路由；旧 HTTP+SSE 模式；契约的类别决定结论（D05、D11、O03、C02）；出站文本的词形；T5、T9 的关闭与凭据句柄
- [lines.spec.ts](lines.spec.ts)（快层）：两条线路在内存上的行为：不在块首的超长行，交换结束后移除 `signal` 上的监听
- [memory-line.ts](memory-line.ts)：内存线路替身：按方法脚本答复，记录发出的消息，推送共用流的事件
- [conformance.spec.ts](conformance.spec.ts)（慢层）：契约 `mcpTransportConformance()` 在 A 层对端上跑两遍（stdio 优先、HTTP 优先），通过/不适用/失败分开计数，不适用集合钉死
- [stdio.spec.ts](stdio.spec.ts)（慢层）：契约 T2、T3、T5 与 T8 的 S、X 行在真实管道上：不是 JSON 的行、16 MiB 行上界、进程退出的时序、SDK 旧对端、探测时限、不读 stdin 的对端、取消通知、`server-everything stdio`
- [http.spec.ts](http.spec.ts)（慢层）：契约 T2–T5、R4 与 T8 的 HTTP 行在本机端口上：SDK bearer 网关与授权发现、凭据不泄漏、`signal` 与 `close()` 管辖的等待、再发规则、离开前失败与头前重置、重定向、`x-mcp-header`、2025 会话与 `DELETE`、现代取消、旧 HTTP+SSE 回退、`server-everything sse`/`streamableHttp`
- [fixtures/](fixtures/index.md)：A 层脚本化对端与 B 层 SDK 对端
- `probes/`：SPEC 复用表依据的三个 SDK 与 `fetch` 探针，不是测试用例，手工运行；回答的问题、命令与输出摘录见 [verification/proofs/sdk](../verification/proofs/sdk/README.md)
