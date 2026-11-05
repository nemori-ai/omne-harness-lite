# verification/sdk 索引

本文件列出本目录的文件与阅读路径。职责、运行方式与关键摘录见 [README.md](README.md)。

## 内容

- [README.md](README.md)：探针回答的问题、运行命令、SDK 版本与关键摘录
- [p3-http-errors.mjs](p3-http-errors.mjs)：全局 `fetch` 对 HTTP 失败报出的错误
- [p4-everything-sse.mjs](p4-everything-sse.mjs)：`server-everything` 的 `sse` 与 `streamableHttp` 模式在线上的答复
- [p5-sdk-parsing.mjs](p5-sdk-parsing.mjs)：SDK 2.4.0 读法原语与版本常量的行为

阅读次序：先读 [SPEC「与 SDK 的复用关系」](../../SPEC.md#sdk-reuse)，再按其中的证据列读 README 的摘录。
