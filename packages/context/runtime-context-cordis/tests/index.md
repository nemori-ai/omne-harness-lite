# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、运行方式与当前缺口
- [public-entry.spec.ts](public-entry.spec.ts)：根入口没有导出
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：`./cordis` 入口没有导出
- [trust-inject.spec.ts](trust-inject.spec.ts)：信任键缺席时插件停在 PENDING、只取得两个原端口、提供者撤除后的重跑
- [fixtures/](fixtures/index.md)：测试固定输入，现在为空
