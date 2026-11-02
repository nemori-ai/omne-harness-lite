# src 索引

## 内容

- [README.md](README.md)：源码目录的职责与本包事实
- [index.ts](index.ts)：根入口，只导出五个类型，没有到 Cordis 的边
- [cordis.ts](cordis.ts)：Cordis 定义入口，含 `AgentPublicationAuthority`、抽象 Service、键常量、`Context` 与 `Events` 增补、实例目录服务和目录插件
- [testing.ts](testing.ts)：`./testing` 入口，再导出内存替身与符合性套件
- [testing-provision.ts](testing-provision.ts)：实例取得的内存替身
- [testing-provision-conformance.ts](testing-provision-conformance.ts)：实例取得的符合性套件
