# Tool 成员测试

本目录维护单元、契约和类型测试。测试经包名导入本成员，不使用模拟提供者。

| 文件 | 检查的行为 |
| --- | --- |
| [public-entry.spec.ts](public-entry.spec.ts) | 根入口的值导出清单，根入口不导出也不提及作者读取函数与槽类型，`./binding` 入口只导出这两个读取函数。根入口与 `./binding` 入口的源码、产物和声明导入图都不含 Cordis、任何 `./cordis` 入口或其他 Tool 包。清单不依赖 Cordis 与其他 Tool 包；完整生产安装闭包不含 Cordis |
| [identity.spec.ts](identity.spec.ts) | 八个品牌身份解码函数各自接受合法文本，并对非字符串、空串、超长和非法字符返回具名失败 |
| [result-policy.spec.ts](result-policy.spec.ts) | 默认结果政策的采用摘要可由规则集复算，规则集不可原地修改。判定只接受文本与共享引用块，拒绝原因取自规则集，整结果判定也检查卸载摘要与附件 |
| [contract.spec.ts](contract.spec.ts) | 资产正文端口的判定、Skill 引用、伪造文档拒绝和固定后的引用 |
| [body-programmable.spec.ts](body-programmable.spec.ts) | 资产正文的 `programmable` 只接受布尔值，只有 `true` 产生声明项 |
| [definition-judgment.spec.ts](definition-judgment.spec.ts) | 定义判定：命令重名、空白说明、缺参数说明、字符串 `programmable` 与未知字段被拒绝并给出字段，省略的 `programmable` 保持省略，P15 设置路径规则 |
| [request-judgment.spec.ts](request-judgment.spec.ts) | 固定请求判定：合法直接请求与已知不可用目标被接受并冻结；函数工具带命令、多命令工具缺命令或命令未声明、上限超范围、未知字段、非布尔 `complete`、非法定义与非对象都被拒绝并给出字段 |
| [release-judgment.spec.ts](release-judgment.spec.ts) | 交付解除输入判定：消费位置与交接证据是封闭值，多出字段、函数字段、空串、缺证据与非对象被拒绝并给出字段，读取时抛出的值是 `unreadable` |
| [state-judgment.spec.ts](state-judgment.spec.ts) | 状态判定：阶段与前后台分支，后台不接受 `no-response` 或 Ask，占位与 call 一致，`unavailable` 的效果是 `not-started` |
| [catalog.spec.ts](catalog.spec.ts) | 呈现摘要只把布尔 `true` 读作可编程许可。可用性判定列出全部未满足的条件 |
| [author-registration.spec.ts](author-registration.spec.ts) | 作者注册：空命令表、非法名称、返回模式与作者种类不符、程序契约不符和伪造句柄在构造时被拒绝。`./binding` 入口的 `readToolOperation` 与 `readToolRegistration` 读出句柄的作者与注册的操作表，未标记的值读作 `undefined`。等待契约不装载 schema，Ask 不接受到期 |
| [parameter-codec.spec.ts](parameter-codec.spec.ts) | 参数 codec：重复键、`complete=false`、半截 JSON 和超预算都不产生参数值。采用摘要覆盖预算。参数判定：两份文本都解析，任一失败指明是哪份，`complete=false` 不解析，坏输入或坏预算是 `shape` 拒绝 |
| [result-rendering.spec.ts](result-rendering.spec.ts) | 结构化判定：带 `content` 的普通对象对普通作者仍是普通值。普通返回按程序编码填 `data`，渲染失败不抛出 |
| [result-projection.spec.ts](result-projection.spec.ts) | `projectToolResult`：附件身份数量不等、重复或与已有块冲突时拒绝。地址文本使用固定前缀和 JSON 定位 |
| [tool-values.ts](tool-values.ts) | 契约函数测试用的合法值构造器，不是测试文件 |
| [public-api-names.spec-d.ts](public-api-names.spec-d.ts) | 已接受契约的 166 个类型名都能从根入口导入。名单从迁移前的 public-api 机械生成，拆包时 `ToolConfiguration` 与 `ToolDependencies` 移到 `@omne-harness/tool`。已实现的契约函数也能从根入口导入，并符合已接受的签名；作者读取函数与槽类型从 `./binding` 入口导入 |
| [contract.spec-d.ts](contract.spec-d.ts) | 公开类型的负编译用例，例如品牌身份不能互换、后台收场不接受 `no-response`、Ask 没有 deadline |
| [module-graph.ts](module-graph.ts) | 导入图遍历工具，读取静态导入、再导出、裸副作用导入和动态 `import()`。各 Tool 包各有一份同样的副本，因为测试不能跨包导入相对路径 |

运行命令为 `pnpm --filter @omne-harness/tool-contract test`。该命令先构建，再运行 vitest，并对 `*.spec-d.ts` 做类型检查。`pnpm --filter @omne-harness/tool-contract typecheck` 单独检查全部测试源码。现有测试不覆盖独立执行、等待、控制、结果保管或恢复。Cordis 定义的测试在 `tool-cordis-contract`。这些行为实现后须补齐验证，义务见 [verification](../verification/index.md)。

固定输入归 [fixtures](fixtures/index.md)。目录导航见 [index](index.md)。
