# tool-host-local 成员测试

本目录维护本提供者的单元、契约和装配测试。测试经包名导入本成员。

| 文件 | 检查的行为 |
| --- | --- |
| [public-entry.spec.ts](public-entry.spec.ts) | 根入口草稿不导出值 |
| [cordis-entry.spec.ts](cordis-entry.spec.ts) | `./cordis` 草稿不导出值。根入口构建产物的导入图不含 Cordis 和绑定模块。本成员以 `workspace:*` 依赖契约成员 |

运行命令为 `pnpm --filter @omne-harness/tool-host-local test`。该命令先构建，再运行 vitest。现有测试只检查草稿入口和依赖方向，不覆盖任何工具行为。

固定输入归 [fixtures](fixtures/index.md)。目录导航见 [index](index.md)。
