# src 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责与现状
- [index.ts](index.ts)：根入口。现在为空，随实现承载翻译纯函数
- [cordis.ts](cordis.ts)：Cordis 绑定入口。现在为空，随实现承载全部插件
- [testing.ts](testing.ts)：`./testing` 入口，导出非耐久内存提供者
- `testing/`：`./testing` 入口的实现模块
- `journal/`：Agent 事实族的核心（SPEC「事实族与折叠核」）：`facts.ts` 事实、批、`er_fact` 行与编解码，`fold.ts` 纯折叠与视图，`answer.ts` 答复推导，`decide.ts` 游标差分与成批规则，`index.ts` 汇出
- `cordis/agent-journal.ts`：生产 Journal 提供者（SPEC「事实族存储」）：追加批、按 `pub > head` 折叠、冷启动、认回与采用请求读；`cordis/journal-read.ts` 事实族的读口；`cordis/journal-batch.ts` 核心追加的批如何成行与成块；`cordis/attempt-grant.ts` Authority 经挂接的 grant 与 Session attempt 记录解析到 attempt（R2-D348/R2-D349）；`cordis/durable-codec.ts` 预受理记录的耐久编码
