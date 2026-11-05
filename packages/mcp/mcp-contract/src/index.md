# src 索引

<!-- documentation:placeholder -->

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

<!-- documentation:placeholder -->

- [README.md](README.md)：源码目录的职责
- [index.ts](index.ts)：根入口与公开定义
- [provider.ts](provider.ts)：`./provider` 入口，端口与传输的类型
- [revisions.ts](revisions.ts)：旧一路接受的协议修订 `LEGACY_PROTOCOL_VERSIONS`（T3）
- [wire.ts](wire.ts)：应答类别与线上事件的归类函数 `classifyWireEvent`（T2、T8）
- [plain.ts](plain.ts)：`PlainJson`、`PlainRecord` 与它们的守卫，脚本与请求体的普通 JSON 形
- [envelope.ts](envelope.ts)：每请求 `_meta` 的键、`clientEnvelopeOf` 与 MCP 请求头 `mcpRequestHeadersOf`（T3）
- [withheld.ts](withheld.ts)：`x-mcp-header` 声明不合法的工具的剔除 `withheldTools`（T2）
- [authorization.ts](authorization.ts)：`WWW-Authenticate` 参数、元数据地址次序、授权发现的组装与取回循环 `discoverAuthorization`（R4、T4）
- [readers.ts](readers.ts)：探测、`initialize`、`tools/list`、`tasks/get` 结果与错误对象的读法（T2、T3、T6、T7）
- [decisions.ts](decisions.ts)：T8 的决策层：一个归类的结论 `concludeAnswer`、探测应答的结论 `concludeProbe`、`WireAnswer` 与各常量（T8）
- [answer-readings.ts](answer-readings.ts)：已结算应答按请求的读法：`interpretAnswer`、`callAnswerOf`、`listingPageOf`、`taskReportOf`、`taskAnswerOf`、`legacyIdentityOf`（T2、T6、T7）
- [composition.ts](composition.ts)：传输写出的内容：旧一路 `initialize` 的参数、对端请求的答复、三种消息的文本（T3、RFC-0010）
- [discovery.ts](discovery.ts)：`discover` 的编排 `discoverWith`：探测、再次探测与旧一路（T3、T8 D 行）
- [testing.ts](testing.ts)：`./testing` 入口，套件、替身与样本构造器
- [testing-transport.ts](testing-transport.ts)：传输符合性套件与夹具接口（`TransportFixture`、`PeerScript`）
- [testing-transport-table.ts](testing-transport-table.ts)：传输决策表 T8 的数据形式与输入域
- [testing-scripted-transport.ts](testing-scripted-transport.ts)：内存脚本化传输 `createScriptedTransportFactory`
