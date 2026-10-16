# Tool 成员测试

本目录维护单元、契约和类型测试。测试经包名导入本成员，不使用模拟提供者。

| 文件 | 检查的行为 |
| --- | --- |
| [public-entry.spec.ts](public-entry.spec.ts) | 根入口的值导出清单。根入口的源码、产物和声明导入图都不含 Cordis、任何 `./cordis` 入口或提供者成员 |
| [identity.spec.ts](identity.spec.ts) | 八个品牌身份解码函数各自接受合法文本，并对非字符串、空串、超长和非法字符返回具名失败 |
| [result-policy.spec.ts](result-policy.spec.ts) | 默认结果政策的采用摘要可由规则集复算，规则集只接受文本与共享引用块，且不可原地修改 |
| [contract.spec.ts](contract.spec.ts) | 资产正文端口的判定、Skill 引用、伪造文档拒绝和固定后的引用 |
| [cordis-entry.spec.ts](cordis-entry.spec.ts) | 18 个服务键唯一，并且各等于唯一服务类的 `static provide`。`./cordis` 的源码、产物和声明都不导入提供者成员。真实 Cordis 4.0.4 下抽象定义可被提供者继承并按键取得，`ToolInstancesService` 返回具名失败而不抛出 |
| [public-api-names.spec-d.ts](public-api-names.spec-d.ts) | 已接受契约的 168 个类型名都能从根入口导入。名单从迁移前的 public-api 机械生成 |
| [contract.spec-d.ts](contract.spec-d.ts) | 公开类型的负编译用例，例如品牌身份不能互换、后台收场不接受 `no-response`、Ask 没有 deadline |
| [cordis-entry.spec-d.ts](cordis-entry.spec-d.ts) | `Context` 增补的服务类型、键的字面量类型和 `tool/call-changed` 的参数 |
| [module-graph.ts](module-graph.ts) | 导入图遍历工具，读取静态导入、再导出、裸副作用导入和动态 `import()` |

运行命令为 `pnpm --filter @omne-harness/tool test`。该命令先构建，再运行 vitest，并对 `*.spec-d.ts` 做类型检查。`pnpm --filter @omne-harness/tool typecheck` 单独检查全部测试源码。现有测试不覆盖执行、等待、控制、结果保管、恢复或 Cordis 装配。这些行为实现后须补齐验证，义务见 [verification](../verification/index.md)。

固定输入归 [fixtures](fixtures/index.md)。目录导航见 [index](index.md)。
