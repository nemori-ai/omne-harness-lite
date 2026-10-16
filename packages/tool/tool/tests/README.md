# tool 成员测试

测试经包名导入本包。

| 文件 | 检查的行为 |
| --- | --- |
| [public-entry.spec.ts](public-entry.spec.ts) | 根入口不导出值。根入口的源码、产物和声明导入图都不含 Cordis、`tool-cordis-contract` 与 `tool-host-local`。清单依赖契约包，不依赖它们 |
| [construction.spec-d.ts](construction.spec-d.ts) | 构造形状可从根入口导入：配置扩展作者限额，依赖列出 runtime 消费的端口 |
| [module-graph.ts](module-graph.ts) | 导入图遍历工具。各 Tool 包各有一份同样的副本，因为测试不能跨包导入相对路径 |

运行命令为 `pnpm --filter @omne-harness/tool test`。该命令先构建，再运行 vitest，并对 `*.spec-d.ts` 做类型检查。

固定输入归 [fixtures](fixtures/index.md)。目录导航见 [index](index.md)。
