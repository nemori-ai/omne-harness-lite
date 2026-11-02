# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、接口定义索引，以及输入输出与失败行为的定位。精确类型与运行时校验归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。

## 导出入口

`package.json` 只声明根入口 `.`，对应 [src/index.ts](../src/index.ts)。没有 `./cordis`。调用者是应用的受信存储子树：它持有 `storage`、`tenantDomainLookup` 与已登记的组合。本包不核验主体（[SPEC 的所有权一节](../SPEC.md#所有权失败与生命周期)）。

## 定义索引

| 导出                                                                                                 | 定义                                          | 行为条款                   |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------- |
| `createSqlToolLedgerStore`、`SqlToolLedgerStore`                                                     | [src/ledger-store.ts](../src/ledger-store.ts) | TS-01、TS-02、TS-03、TS-09 |
| `createSqlToolOutputCustody`                                                                         | [src/custody.ts](../src/custody.ts)           | TS-03 至 TS-08             |
| `SqlToolStorageOptions`、`SqlToolOutputCustodyOptions`、`CHUNK_ENVELOPE_BYTES`、`TOOL_STORAGE_OWNER` | [src/options.ts](../src/options.ts)           | TS-07                      |
| `toolStorageMaterials`、`ToolStorageMaterials`、`TOOL_PARTICIPANT`                                   | [src/materials.ts](../src/materials.ts)       | TS-10                      |

端口形状 `ToolLedgerStore` 归 [`@omne-harness/tool`](../../tool/src/ledger-store.ts)，`ToolOutputCustody` 归 [`@omne-harness/tool-contract`](../../tool-contract/src/custody.ts)。
