# agent-contract

## 职责与状态

Agent 能力的契约：公共值、操作、结果、行为及可替换提供者端口。设计已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受。

本包导出：

- 全部契约类型，覆盖定义、扩展、身份、求值、请求、台账、执行与 Journal。
- 五个常量：`ATTRIBUTE_ITEMS`、`POSITIONS`、`POWERS`、`POSITION_OUTPUTS` 与 `AGENT_IDENTITY_MAX_LENGTH`。
- 三个判定函数：`judgeAgentDefinition`、`judgeLoopExtensions` 与 `judgeExtensionOutput`。
- 资产正文契约 `agentBodyContract`。
- 十四个 `decode*` 身份解码函数，以及四个结构判定：`judgeAdoption`、`judgeEvidence`、`judgeAccess` 与 `judgeAuthority`。

本包没有实现推进 Loop、评估器、runtime、Journal 提供者和宿主插件。这些部分的接口在包里只有类型，目前没有提供者实现它们。提供者与宿主插件归 [agent](../agent/README.md)、[agent-host-local](../agent-host-local/README.md) 和各提供者包。

## 使用

```ts
import { decodeStepId, judgeAgentDefinition } from '@omne-harness/agent-contract'

const definition = await judgeAgentDefinition(raw)
const step = decodeStepId(text)
```

`raw` 与 `text` 是调用方取得的未知输入。每个函数都返回带具名原因的拒绝，不抛出异常。限额、拒绝原因和身份规则见 [SPEC](SPEC.md#声明判断)。

消费者把正文契约登记到资产类别注册表：

```ts
import { createCategoryRegistry } from '@omne-harness/assets'
import { agentBodyContract } from '@omne-harness/agent-contract'

createCategoryRegistry().register(agentBodyContract())
```

## 契约

[SPEC](SPEC.md) 拥有行为。[入口页](docs/public-api/README.md)是源码文件的导航页，类型由源码文件拥有。

## 设计

[架构](docs/architecture.md) 拥有机制和依赖理由，其他主题从 [文档索引](docs/index.md) 进入。

## 配置与运行

不把业务身份放入配置。本包不依赖 Cordis 或具体宿主。它为正文契约依赖 `assets`，`assets` 不依赖本包。绑定与撤除规则见 [Cordis 集成](docs/cordis.md)。

## 验证

在仓库根运行 `pnpm turbo run test --filter=@omne-harness/agent-contract`，在本目录运行 `pnpm typecheck`。turbo 先构建本包及其依赖。本目录里的 `pnpm test` 只运行 Vitest，不构建。测试覆盖声明判断、输出判断、身份解码与结构判定、正文契约、导出集合和依赖方向，文件清单见[测试说明](tests/README.md)。这些测试不证明 runtime、提供者、装配或 Cordis 集成。

## 维护

修改公开承诺同步真实消费者、SPEC 和验证。实现机制不反向改变契约。组内责任见 [组入口](../README.md)。

## 目录结构与文档职责

完整骨架沿源码包模板。六个主题及其子页见 [docs](docs/README.md)。源码、测试、schema、verification、adr、examples、resources 与 acceptance 各有索引。空资源目录保留草稿说明，不授予模板采用或业务接受。
