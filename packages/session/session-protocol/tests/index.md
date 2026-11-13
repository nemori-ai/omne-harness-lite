# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)：根入口只导出 `sessionProtocol`
- [operations.spec.ts](operations.spec.ts)：操作表的三栏、算业务访问、结果名
- [shapes.spec-d.ts](shapes.spec-d.ts)：形状与结果名集合的类型断言
- [wire.spec.ts](wire.spec.ts)：与旧家族的读写等价
- [observe-session.spec.ts](observe-session.spec.ts)：观察的建立点、帧与结束原因
- [browser-fixture.spec.ts](browser-fixture.spec.ts)：浏览器消费者编过包入口（慢层）
- [fixtures/](fixtures/index.md)：浏览器夹具
