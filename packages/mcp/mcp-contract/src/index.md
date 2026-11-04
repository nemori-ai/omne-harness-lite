# src 索引

<!-- documentation:placeholder -->

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

<!-- documentation:placeholder -->

- [README.md](README.md)：源码目录的职责
- [index.ts](index.ts)：根入口与公开定义
- [provider.ts](provider.ts)：`./provider` 入口，端口与传输的类型
- [revisions.ts](revisions.ts)：旧一路接受的协议修订 `LEGACY_PROTOCOL_VERSIONS`（T3）
- [testing.ts](testing.ts)：`./testing` 入口，套件、替身与样本构造器
- [testing-transport.ts](testing-transport.ts)：传输符合性套件与夹具接口（`TransportFixture`、`PeerScript`）
- [testing-transport-table.ts](testing-transport-table.ts)：传输决策表 T8 的数据形式与输入域
- [testing-scripted-transport.ts](testing-scripted-transport.ts)：内存脚本化传输 `createScriptedTransportFactory`
