# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)：根入口没有导出的断言
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：Cordis 绑定入口没有导出的断言
- [transactions-access.spec.ts](transactions-access.spec.ts)：`createMemorySessionJournal` 必需 `accessCheck`、commit 显式 access、每次公开读写各问一次、`readInput` 与 `queryOperation` 的 denied/unavailable 不披露答案、denied/unavailable/抛错无副作用、内部提交路径不暴露
- [participation-access.spec.ts](participation-access.spec.ts)：Agent 提交派生的四种 Session 参加各问检查一次、denied/unavailable 两侧不写、allowed 证据随同次提交可读回、认回再问一次、裁定后修订被推进时返回可重试的 unavailable 且不写入、被拒调用不改变后续回执、scene 记录每次裁定的结论且外租户由检查本身拒绝
- [fixtures/](fixtures/index.md)：测试固定输入，现在为空
