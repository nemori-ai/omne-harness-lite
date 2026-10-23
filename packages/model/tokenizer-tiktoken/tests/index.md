# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试分层、真实依赖与替身
- [count.spec.ts](count.spec.ts)：两份词表的普通文本计数、文本中的特殊 token 字样、显式特殊 token 段、相邻文本段合并、未知特殊 token、空序列、非良构 Unicode、固定表的初始化快照（快层）
- [initialization.spec.ts](initialization.spec.ts)：三项采用核对各自不符时返回 `unavailable`，以及没有规范 JSON 形式的特殊 token id（快层）
- [public-entry.spec.ts](public-entry.spec.ts)：根入口只有 `createTiktokenTokenizer` 一个运行时导出（快层）
- [published.spec.ts](published.spec.ts)：构建产物在子进程与临时目录中初始化并计数，结果与源码一致，版本失配同样返回 `unavailable`（慢层）
- [support/resources.ts](support/resources.ts)：两份词表、固定特殊 token 表、独立算出的摘要常量与资源构造
- [fixtures/](fixtures/index.md)：测试固定输入
