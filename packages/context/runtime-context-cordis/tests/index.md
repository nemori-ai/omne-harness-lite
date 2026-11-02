# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、运行方式与当前缺口
- [support.ts](support.ts)：共用的租户、作用域、块声明、信任提供者与最小插件
- [public-entry.spec.ts](public-entry.spec.ts)：根入口没有导出
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：`./cordis` 的导出集合与子类的继承关系
- [trust-inject.spec.ts](trust-inject.spec.ts)：信任键缺席时 PENDING、只交出两个原端口、信任提供者卸载与重新提供
- [conformance.spec.ts](conformance.spec.ts)：整套 `runtimeContextConformance` 经服务在真实 Cordis 上通过
- [lifecycle.spec.ts](lifecycle.spec.ts)：配置失败、重复装载、生产者效应与交错、调用方在登记中卸载、唤醒过滤、intercept 一致性与卸载
- [fixtures/](fixtures/index.md)：测试固定输入，现在为空
