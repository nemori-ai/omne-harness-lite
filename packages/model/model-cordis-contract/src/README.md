# model-cordis-contract 源码

本目录拥有实际公开导出与本成员内部代码。[index.ts](index.ts) 是根入口，只导出 [registration.ts](registration.ts) 的八个类型。[cordis.ts](cordis.ts) 是 `./cordis` 入口，再导出这八个类型，并导出抽象 Service 定义与键、`Context` 与 `Events` 增补；转换目录 `ModelConvertersService` 在 [converters.ts](converters.ts)，实例目录 `ModelInstancesService` 在 [instances.ts](instances.ts)，由 cordis.ts 转出。两个目录的 `register` 都经 `@omne-harness/kernel-basis/cordis` 的 `registerInCallerFiber` 在调用方 fiber 的 effect 里同步准入（[kernel-basis SPEC](../../../assembly/kernel-basis/SPEC.md#调用方-fiber-登记辅助)）。结果接收登记表在 [receivers.ts](receivers.ts)，经 cordis.ts 转出，`ModelRuntimeService.registerResultReceiver` 用它；`./testing` 入口在 [testing/](testing/index.ts)。设计声明归 [docs/public-api.md](../docs/public-api.md)，导出清单见 `tests/fixtures/exports.json`。

## 边界

根入口及它到达的 registration.ts 不导入 `@deepseek-ai/cordis`。键与类写在同一个文件，键常量取自类的 `static readonly provide`。源码只用可擦除的 TypeScript 语法。

## 维护

新增或改名公开入口时，同步 `package.json` 的 `exports`、`tests/fixtures/exports.json`、[公开接口](../docs/public-api.md)与本目录 `index.md`。

[目录索引](index.md)。
