# @omne-harness/mcp-contract

[English](README.md)

MCP 组的纯契约：值、结局、失败、五个应用服务的接口、纯函数、接入点正文的类别端口、需求端口，以及给端口实现方的符合性套件。

## 职责与状态

本包用 MCP 自己的词写出 MCP 提供什么、需要什么。它不点名调用方。它没有服务实现，没有传输，也没有 SDK。MCP SDK、Cordis 与任何实现都不进入本包。

状态：契约，已由 [技术接受](https://github.com/nemori-ai/omne-harness-lite/issues/1119#issuecomment-6704668621) 接受。行为正文是 [SPEC.md](SPEC.md)，组设计是[组工程设计](../docs/architecture.md)。

| 部分                                                                                   | 状态                                                                                                                                    |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 值、品牌守卫、键                                                                       | 已实现并测试                                                                                                                            |
| 正文解析、类别端口 `mcp`、schema                                                       | 已实现并测试                                                                                                                            |
| 清单函数 `completeListing`、`mergeListing`、`markUnavailable`、`actionPermissionItems` | 已实现并测试                                                                                                                            |
| `classifyOutcome`、`toContentBlocks`、`boundInstructions`                              | 已实现并测试                                                                                                                            |
| 五个服务接口                                                                           | 只有接口，由 `@omne-harness/mcp` 实现                                                                                                   |
| 五个需求端口与传输端口                                                                 | 只有接口；`./testing` 有符合性套件与内存替身，传输套件 `mcpTransportConformance()` 在脚本化传输 `createScriptedTransportFactory` 上运行 |
| 真实对端、凭据、进程落点、耐久存储                                                     | 本包不验证                                                                                                                              |

## 使用

本包有三个入口。调用方导入公开根。端口实现方导入 `./provider`。端口实现方只在测试里导入 `./testing`。

```ts
import { createCategoryRegistry, readBodyText } from '@omne-harness/assets'
import { mcpEndpointBodyContract, parseEndpointBody } from '@omne-harness/mcp-contract'

const registry = createCategoryRegistry()
registry.register(mcpEndpointBodyContract())

const read = readBodyText(text, limits)
if (read.kind === 'ok') {
  const parsed = parseEndpointBody(read.value, 'files')
  if ('failure' in parsed) report(parsed.failure)
}
```

端口实现方在自己的测试框架里运行套件：

```ts
import { mcpCatalogStoreConformance, runConformanceCase } from '@omne-harness/mcp-contract/testing'

for (const conformance of mcpCatalogStoreConformance())
  it(conformance.name, async () => {
    // 每个用例一份新夹具，由实现方构造。
    expect(await runConformanceCase(conformance, newFixture())).toEqual({ kind: 'passed' })
  })
```

本包不需要初始化，不持有资源，不需要 Cordis。见 [docs/context.md](docs/context.md)。

## 契约

- 公开类型与运行时校验：[src/](src/README.md)，索引在 [docs/public-api.md](docs/public-api.md)。
- 类型以外的行为：[SPEC.md](SPEC.md)。
- 正文 schema：[schema/endpoint-body.schema.json](schema/endpoint-body.schema.json)。

每个函数答哪些失败、哪些前提违反会抛出，见 SPEC.md：清单函数见 C4 与 C7，`boundInstructions` 见 S3。

## 设计

模块：`brands`、`values`、`args`、`json`、`endpoint`、`listing`、`catalog`、`classify`、`content`、`instructions`、`revisions`、`wire`、`keys`、`outcomes`、`ports`、`transport`、`services`，以及 `./testing` 入口的 `testing-*` 模块。`testing-transport` 放传输套件与夹具类型（`TransportFixture`、`PeerScript`），`testing-transport-table` 放 SPEC T8 决策表的数据形式，套件按表的每一行生成一个用例；`testing-scripted-transport` 放通过它的内存脚本化传输。见 [docs/architecture.md](docs/architecture.md)、[docs/flows.md](docs/flows.md) 与 [docs/object-model.md](docs/object-model.md)。

## 配置与运行

本包没有配置。`McpConfig` 是服务实现的配置类型，它的字段与配值的使用见 SPEC S3、S4。

## 验证

运行 `pnpm turbo run build typecheck test --filter=@omne-harness/mcp-contract`。测试导入构建后的包，覆盖正文的每个拒绝原因、清单性质与带种子的随机序列、结局穷举表、每种内容类型、五个套件对内存替身的运行、传输套件在脚本化传输上对两种材料的运行，以及违约替身与违约脚本传输使套件变红。类型测试钉住每个封闭集合与 `./provider` 的类型导出。SPEC.md 列出测试没有覆盖的部分。

## 维护

公开类型或 SPEC 条款变化时，同步 `@omne-harness/mcp`、`@omne-harness/mcp-host-local` 与组设计。封闭集合变化时更新 `tests/closed-sets.ts`。`schema/endpoint-body.schema.json` 与 `src/endpoint-schema.ts` 保持相同，有测试核对。契约合入后，没有新的决定只做可加改动。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   公开类型以外的行为
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       模块、状态与资源归属、关键机制
├── flows.md              关键业务流程与数据流
├── object-model.md       内部对象模型
├── public-api.md         公开边界与定义索引
├── context.md            消费侧使用与系统定位
└── cordis.md             Cordis 适用性与集成
src/                      公开定义、运行时校验与内部实现
tests/                    持续测试；fixtures/ 存放测试输入
schema/                   对外 Schema
verification/             models/ 与 proofs/
adr/                      有持续消费者的实现取舍
examples/                 面向公开入口的示例
resources/                运行所需的非源码资源
acceptance/               独立验收；fixtures/ 存放验收输入
```

每个目录的 README.md 说明职责，index.md 负责导航。阅读路径见 [index.md](index.md)。docs 专题可以升级为同名目录，目录内须有 README.md 与 index.md；专题移动时同步本结构图。
