# src 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责与现状
- [index.ts](index.ts)：根入口。现在为空，随实现承载翻译纯函数
- [cordis.ts](cordis.ts)：Cordis 绑定入口。现在为空，随实现承载全部插件
- [testing.ts](testing.ts)：`./testing` 入口，导出非耐久内存提供者
- `testing/`：`./testing` 入口的实现模块
- `journal/`：Agent 事实族的核心（SPEC「事实族与折叠核」）：`facts.ts` 事实、批、`er_fact` 行与编解码，`fold.ts` 纯折叠与视图，`answer.ts` 答复推导，`decide.ts` 游标差分与成批规则，`index.ts` 汇出
