# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)：公开入口的测试，断言根入口没有导出
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：Cordis 绑定入口的测试，断言 `./cordis` 只导出 `SessionProvider`
- [provider-load.spec.ts](provider-load.spec.ts)：装载、`PENDING`、换代、配置、重复装载
- [provider-callers.spec.ts](provider-callers.spec.ts)：调用方类核对
- [provider-ports.spec.ts](provider-ports.spec.ts)：按调用现取的端口
- [provider-notice.spec.ts](provider-notice.spec.ts)：提交通知与扫描者绑定
- [provider-teardown.spec.ts](provider-teardown.spec.ts)：撤除与有序关闭
- [checkpoint-cp1.spec.ts](checkpoint-cp1.spec.ts)：线内贯通检查点 CP1，对真实 SQLite
- [fixtures/](fixtures/index.md)：测试的装配与存储夹具，没有数据文件
