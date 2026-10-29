# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)：根入口没有导出的断言
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：Cordis 绑定入口没有导出的断言
- [transactions-access.spec.ts](transactions-access.spec.ts)：`createMemorySessionJournal` 必需 `accessCheck`、commit 显式 access、每次公开读写各问一次、denied/unavailable/抛错无副作用、内部提交路径不暴露
- [fixtures/](fixtures/index.md)：测试固定输入，现在为空
