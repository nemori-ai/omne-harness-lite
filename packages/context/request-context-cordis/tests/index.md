# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、替身、运行方式与当前缺口
- [public-entry.spec.ts](public-entry.spec.ts)：根入口没有导出
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：`./cordis` 入口只导出 `RequestContextProvider`
- [provider.spec.ts](provider.spec.ts)：信任键、两个键的寿命、经信任授权的登记与收件口
- [config.spec.ts](config.spec.ts)：配置 Schema、策略按名选择、配置不合时加载失败
- [fixtures/](fixtures/index.md)：测试固定输入，现在为空
