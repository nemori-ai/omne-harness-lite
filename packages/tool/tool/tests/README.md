# Tool 成员测试

本目录维护单元和契约测试。测试经包名导入本成员，不使用模拟提供者。

| 文件 | 检查的行为 |
| --- | --- |
| [public-entry.spec.ts](public-entry.spec.ts) | 根入口只导出 `toolBodyContract` |
| [contract.spec.ts](contract.spec.ts) | 资产正文端口的判定、Skill 引用、伪造文档拒绝和固定后的引用 |
| [cordis-entry.spec.ts](cordis-entry.spec.ts) | `./cordis` 草稿不导出值。根入口构建产物的导入图不含 Cordis 和绑定模块。本成员不依赖提供者成员 |

运行命令为 `pnpm --filter @omne-harness/tool test`。该命令先构建，再运行 vitest。现有测试不覆盖执行、等待、控制、结果保管、恢复或 Cordis 装配。这些行为实现后须补齐验证，义务见 [verification](../verification/index.md)。

固定输入归 [fixtures](fixtures/index.md)。目录导航见 [index](index.md)。
