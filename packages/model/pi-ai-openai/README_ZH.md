# @omne-harness/pi-ai-openai

[English](README.md)

## 职责与状态

本成员是 pi 传输的 OpenAI 家族。它给出 OpenAI 型号的记录、引擎四个 hook 的规则、输入计量器与官方档案。共享传输经 `composeFamilies` 取得本家族。所有型号都经 OpenRouter 请求。组架构在[成员与新增条件](../docs/architecture.md#成员与新增条件)与 [pi 家族贡献的取得协议](../docs/architecture.md#pi-家族贡献的取得协议)中规定本成员的职责。

`pi-ai-anthropic` 的联调用例与跨家族示例以开发依赖消费本包。计划中的消费者是发行装配（官方档案与 `composeFamilies`）。目前还没有装配消费本包。

### 支持范围

每一级只写已核实的事实。改变支持范围的提交须同步本表、英文 README、[SPEC](SPEC.md) 与组页。

| 级别 | 已交付 | 入口 | 验证 |
| --- | --- | --- | --- |
| 公开入口 | `createOpenAiFamily`、`officialOpenAiProfiles`、`openAiTokenizerResources`、`OPENAI_RECORDS`、`OPENAI_OWNER` 与相应类型 | 根入口 | `public-entry.spec.ts` |
| 记录 | 12 条 `current` 记录，修订为 `1`，从封存的家族政策迁入。纯数据，提交指纹 | `OPENAI_RECORDS` | `records.spec.ts`、`adoptions.spec.ts` |
| 取得与绑定 | 一次取得给出精确供应商的一个绑定。未知采用、路由不符、tokenizer 不符与取消都整体失败 | `createOpenAiFamily` 与 `composeFamilies` | `family.spec.ts` |
| 参数与请求体 | 输出上限与各型号公布的推理强度，原样写出：`low`、`medium`、`high` 与 `max`。按项目约定，记录不关闭推理，所以 `none` 与其他参数在发送前返回 `unsupported` | `binding.rules.plan`、`binding.encode` | `plan.spec.ts` |
| 规则 | 加密推理的封存与回放、用量算术与 Pro 的未知范围、输入余量为负时的 `usage-inconsistent` 诊断、根为对象的工具 schema | `src/rules.ts` | `rules.spec.ts` |
| 计量 | 可见投影的 o200k 代理估算与配置余量；按像素事实计算的三条图片补丁规则；加密推理没有估算 | `binding.meter` | `meter.spec.ts` |
| 官方档案 | 每条 `current` 记录一份档案。每份档案的供应商都能取得绑定并规划请求 | `officialOpenAiProfiles` | `profiles.spec.ts` |
| 回放夹具 | 封存测试的内联 SSE 用例，转换为契约事实，含每个已收场响应的账目，有意不同逐条列出 | `tests/fixtures` | `fixtures.spec.ts` |
| 跨家族回放（OpenAI 一侧） | 另一家的 assistant 消息不带状态与思考，并出现在 encode 的 `replay-omitted` 诊断中；OpenAI 自己的消息带回状态 | `binding.encode` | `cross-family-replay.spec.ts` |
| 经共享传输的联调 | 本家族与 Anthropic 家族经同一 `composeFamilies` 交给 `createPiTransport`。本地 HTTPS 服务按请求体的型号回放每条记录的夹具：发出的请求体与夹具相同，事实序列与夹具相同。两家各取一条记录运行符合性套件 transport 组，六条义务通过 | `composeFamilies`、`createPiTransport` | `pi-ai-anthropic` 的 `two-families.spec.ts`（慢层） |
| 示例 | [examples/openai-request.ts](examples/openai-request.ts) 经代理请求 `openai/gpt-5.6-luna` 一次。历史中有只带工具调用的 assistant 消息、没有内容的工具结果与一张图片 | 根入口 | 类型检查。`examples.spec.ts`（慢层）只在 `OMNE_LIVE_TESTS=1` 时运行示例，否则跳过。实跑的证据只来自手动运行 |
| 未交付 | 凭据解析与真实路由的持续验证（#466） | 无 | 这些路径没有持续验证的证据 |

## 使用

装配方创建一次家族，交给传输：

```ts
import { composeFamilies, createPiTransport } from '@omne-harness/pi-ai-transport'
import {
  createOpenAiFamily,
  officialOpenAiProfiles,
  openAiTokenizerResources,
} from '@omne-harness/pi-ai-openai'

const openai = createOpenAiFamily({
  tokenizer: openAiTokenizerResources(),
  limits, // ChatCompletionsLimits：解码器的缓冲限额
  margin: { percent: '10', source: marginPolicy }, // 每个估算的余量
})
const families = composeFamilies([openai])
const profiles = officialOpenAiProfiles({ retryPolicy, compactionTriggerPercent: '80' })
```

`createOpenAiFamily` 只做计算。第一次 `acquire` 初始化 tokenizer，家族的各个绑定共享它。tokenizer 没有需要释放的资源。本包没有 Cordis 入口，理由见 [Cordis 集成](docs/cordis.md)。更多说明见[使用与定位](docs/context.md)。

## 契约

[行为规格](SPEC.md)拥有记录、规则、计量、官方档案与取得。[pi-ai-transport](../pi-ai-transport/SPEC.md) 拥有家族表、网关引擎与夹具检查。[model-contract](../model-contract/SPEC.md) 拥有档案、回放与计量的类型与规则。[公开接口](docs/public-api.md)索引根入口。

## 设计

`records.ts` 持有数据。`rules.ts` 与 `images.ts` 持有带修订名的规则表。`meter.ts` 写出 token 输入并计量。`family.ts` 经引擎形成绑定。`profiles.ts` 派生官方档案。[内部架构](docs/architecture.md)说明模块、机制与理由，[关键流程](docs/flows.md)与[对象模型](docs/object-model.md)补充其余部分。

## 配置与运行

本包没有默认值。全部输入都是 `createOpenAiFamily` 与 `officialOpenAiProfiles` 的参数：

- `tokenizer`：tokenizer 资源。使用 `openAiTokenizerResources()`。其定义必须等于记录指名的定义。
- `limits`：每个绑定的解码器缓冲限额。
- `margin`：每个估算的余量百分比，以及该余量政策的采用。
- `retryPolicy` 与 `compactionTriggerPercent`：Model 的重试策略与档案的压缩触发百分比。

本包不读环境、文件或网络。需要 Node.js 24 或更新版本。

## 验证

在仓库根目录运行下列命令。包的 engines 要求 Node.js >=24，pnpm 版本为 10.28.1。

```sh
pnpm turbo run typecheck test:fast --filter=@omne-harness/pi-ai-openai
pnpm turbo run test --filter=@omne-harness/pi-ai-openai
pnpm run lint:deps
pnpm run check:docs
```

turbo 在测试前构建本包及其依赖。示例经代理发出真实请求，不属于 `test`。构建后在本包目录运行 `pnpm run examples`，前提与预期输出见 [examples/README.md](examples/README.md)。改动夹具用例表后，运行 `pnpm --filter @omne-harness/pi-ai-openai run fixtures`。新增记录后，运行 `pnpm --filter @omne-harness/pi-ai-openai run fingerprints`。[测试说明](tests/README.md)写明测试分层与未迁入的封存测试。覆盖与缺口见 [SPEC“组合与验证”](SPEC.md#组合与验证)。

## 维护

- 新型号是一条新记录、一行指纹与一组夹具。型号变化是一个新修订。不得原地修改记录。
- 规则行为变化时新增规则名，引用它的记录新增修订。
- 升级 js-tiktoken 会改变每条记录的 tokenizer 定义，须新增修订。
- 改变支持范围时，同步本表、英文 README、[组页](../README.md)与[包组织](../../../docs/package-organization.md)。

## 目录结构与文档职责

```text
README.md, README_ZH.md   入口：用途、状态与本地图
index.md                  包内阅读路径
SPEC.md                   公开类型以外的行为
provenance.json           迁入数据的来源
documentation.json        文档登记
docs/                     内部设计、公开使用与集成
├── architecture.md       模块、状态与资源归属、机制
├── flows.md              关键业务流程与数据流
├── object-model.md       内部对象模型
├── public-api.md         公开边界与定义索引
├── context.md            消费方式与系统定位
└── cordis.md             Cordis 适用性与集成
src/                      公开定义、校验与实现
tests/                    持续测试；fixtures/ 放测试输入
schema/                   外部 Schema
verification/             models/ 与 proofs/
adr/                      有持续消费者的实现决定
examples/                 面向公开入口的示例
resources/                非源码运行资源
acceptance/               独立验收；fixtures/ 放验收输入
```

每个目录有 README.md 说明职责，index.md 提供导航。阅读路径见 [index.md](index.md)。docs 专题可以扩展为同名目录，内含 README.md 与 index.md。专题移动时同步本地图。
