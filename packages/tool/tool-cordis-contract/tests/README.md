# tool-cordis-contract 成员测试

测试经包名导入本包，不使用模拟容器。

| 文件 | 检查的行为 |
| --- | --- |
| [public-entry.spec.ts](public-entry.spec.ts) | 根入口不导出值 |
| [cordis-entry.spec.ts](cordis-entry.spec.ts) | 18 个键逐对等于对应类的 `static provide`。`./cordis` 的源码、产物和声明都不导入 Tool 实现。清单依赖 Cordis 与契约包。真实 Cordis 4.0.4 下抽象定义可被继承并按键取得，`ToolInstancesService` 返回具名失败而不抛出 |
| [cordis-entry.spec-d.ts](cordis-entry.spec-d.ts) | `Context` 增补的服务类型、键的字面量类型和 `tool-cordis-contract/call-changed` 的参数 |
| [module-graph.ts](module-graph.ts) | 导入图遍历工具。各 Tool 包各有一份同样的副本，因为测试不能跨包导入相对路径 |

运行命令为 `pnpm --filter @omne-harness/tool-cordis-contract test`。该命令先构建，再运行 vitest，并对 `*.spec-d.ts` 做类型检查。

固定输入归 [fixtures](fixtures/index.md)。目录导航见 [index](index.md)。
