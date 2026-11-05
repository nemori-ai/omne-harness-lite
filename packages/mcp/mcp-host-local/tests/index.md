# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)（快层）：导出集合、选项的 `RangeError`、`open` 不发请求且 `signal` 中止时不交出传输（SPEC H3）
- [session.spec.ts](session.spec.ts)（快层）：契约 `TRANSPORT_TABLE` 每行每格在内存线路上驱动会话；探测时限与 F5；对端请求与进度路由；旧 HTTP+SSE 模式；T5/T9 的关闭与凭据句柄
- [memory-line.ts](memory-line.ts)：内存线路替身：按方法脚本答复，记录发出的消息，推送共用流的事件
- [conformance.spec.ts](conformance.spec.ts)（慢层）：契约 `mcpTransportConformance()` 在 A 层对端上跑两遍（stdio 优先、HTTP 优先），通过/不适用/失败分开计数，不适用集合钉死
- [stdio.spec.ts](stdio.spec.ts)（慢层）：MC3-10：非 JSON 行、16 MiB 行上界、进程退出的时序、SDK 旧对端、探测时限、取消通知、`server-everything stdio`
- [http.spec.ts](http.spec.ts)（慢层）：MC3-11：SDK bearer 网关与授权发现、凭据不泄漏、再发规则、离开前失败与头前重置、重定向、`x-mcp-header`、2025 会话与 `DELETE`、现代取消、旧 HTTP+SSE 回退、`server-everything sse`/`streamableHttp`
- [fixtures/](fixtures/index.md)：A 层脚本化对端与 B 层 SDK 对端
