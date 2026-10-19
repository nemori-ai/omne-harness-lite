# model-cordis-contract 源码索引

- [README.md](README.md)：源码目录的职责与边界。
- [index.ts](index.ts)：根入口，只导出类型。
- [registration.ts](registration.ts)：八个登记类型，根入口声明，`./cordis` 再导出。
- [cordis.ts](cordis.ts)：`./cordis` 入口，导出抽象 Service 定义、键、Context 与 Events 增补。
- [converters.ts](converters.ts)：转换目录 `ModelConvertersService`，定义自有的具体 Service。
- [instances.ts](instances.ts)：实例目录 `ModelInstancesService`，定义自有的具体 Service。
- [caller-fiber.ts](caller-fiber.ts)：两个目录共用的 `register` 前置：在调用方 fiber 的 effect 里同步准入，并把准入结果转成 `Outcome`。
