# model-cordis-contract 源码索引

- [README.md](README.md)：源码目录的职责与边界。
- [index.ts](index.ts)：根入口，只导出类型。
- [registration.ts](registration.ts)：八个登记类型，根入口声明，`./cordis` 再导出。
- [cordis.ts](cordis.ts)：`./cordis` 入口，导出抽象 Service 定义、键、Context 与 Events 增补。
- [converters.ts](converters.ts)：转换目录 `ModelConvertersService`，定义自有的具体 Service。
- [instances.ts](instances.ts)：实例目录 `ModelInstancesService`，定义自有的具体 Service。
- [receivers.ts](receivers.ts)：结果接收登记表 `ModelResultReceiverTable`，`ModelRuntimeService.registerResultReceiver` 的后端；由 cordis.ts 转出。
- [testing/index.ts](testing/index.ts)：`./testing` 入口，只实现登记的替身 `modelRuntime` 宿主与符合性用例。
