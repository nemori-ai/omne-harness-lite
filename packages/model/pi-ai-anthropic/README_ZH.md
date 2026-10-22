# @omne-harness/pi-ai-anthropic

[English](README.md)

## 职责与状态

本成员是 pi 传输的 Anthropic 家族。它给出 Anthropic 型号的记录、引擎四个 hook 的规则、输入计量器、`claude.json` 词表资源与官方档案。共享传输经 `composeFamilies` 取得本家族。所有型号都经 OpenRouter 请求。组架构在[成员与新增条件](../docs/architecture.md#成员与新增条件)与 [pi 家族贡献的取得协议](../docs/architecture.md#pi-家族贡献的取得协议)中规定本成员的职责。

计划中的消费者是发行装配（官方档案与 `composeFamilies`）以及本包的请求示例与跨家族示例。目前还没有装配消费本包。

### 支持范围

每一级只写已核实的事实。改变支持范围的提交须同步本表、英文 README、[SPEC](SPEC.md) 与组页。

| 级别 | 已交付 | 入口 | 验证 |
| --- | --- | --- | --- |
| 公开入口 | `createAnthropicFamily`、`officialAnthropicProfiles`、`anthropicTokenizerResources`、`TokenizerResourceError`、`ANTHROPIC_RECORDS`、`ANTHROPIC_OWNER` 与相应类型 | 根入口 | `public-entry.spec.ts` |
| 记录 | 4 条 `current` 记录，修订为 `1`，从封存的官方定义迁入。纯数据，提交指纹 | `ANTHROPIC_RECORDS` | `records.spec.ts`、`adoptions.spec.ts` |
| 取得与绑定 | 一次取得给出精确供应商的一个绑定。未知采用、路由不符、tokenizer 不符与取消都整体失败 | `createAnthropicFamily` 与 `composeFamilies` | `family.spec.ts` |
| 参数与请求体 | 输出上限、停止序列与推理强度 `low`、`medium`、`high`、`max`，原样写出。`none` 与其他参数在发送前返回 `unsupported`。1h 缓存标记在最后一条消息上，没有位置时返回 `unsupported` | `binding.rules.plan`、`binding.encode` | `plan.spec.ts` |
| 规则 | 整组签名推理的封存与回放、没有签名组的思考返回 `unsupported`、缓存读写的用量算术与 `usage-inconsistent` 诊断、根为对象的工具 schema | `src/rules.ts` | `rules.spec.ts` |
| 计量 | 可见投影的 NFKC JSON 经 `claude.json` 估算并加配置余量；按像素事实计算的 28 像素块图片规则；带签名组的请求没有估算 | `binding.meter` | `meter.spec.ts` |
| 词表资源 | 读取发布的 `claude.json` 并核对 SHA-256；经 tokenizer-tiktoken 计数与独立参考值相等；特殊 token 字样按普通文本计 | `anthropicTokenizerResources` | `meter.spec.ts` |
| 官方档案 | 每条 `current` 记录一份档案。每份档案的供应商都能取得绑定并规划请求 | `officialAnthropicProfiles` | `profiles.spec.ts` |
| 回放夹具 | 封存测试的内联 SSE 用例，转换为契约事实，含每个已收场响应的账目，有意不同逐条列出 | `tests/fixtures` | `fixtures.spec.ts` |
| 跨家族回放（Anthropic 一侧） | 另一家的 assistant 消息不带状态与思考，并出现在 encode 的 `replay-omitted` 诊断中；本家族的签名组带回；`claude-opus-5.5` 与 `claude-fable-5.1` 在最后一个工具轮次来自另一家时关闭推理并给出 `reasoning-disabled` 诊断 | `binding.rules.plan`、`binding.encode` | `cross-family-replay.spec.ts` |
| 未交付 | 在结束之前失败的流的账目；经本地 HTTPS 服务的真实传输、符合性套件、示例与真实路由 | 无 | 这些路径没有证据 |

## 使用

装配方读取一次词表资源，创建一次家族，交给传输：

```ts
import { composeFamilies, createPiTransport } from '@omne-harness/pi-ai-transport'
import {
  anthropicTokenizerResources,
  createAnthropicFamily,
  officialAnthropicProfiles,
} from '@omne-harness/pi-ai-anthropic'

const anthropic = createAnthropicFamily({
  tokenizer: anthropicTokenizerResources(), // 读取并核对 claude.json
  limits, // ChatCompletionsLimits：解码器的缓冲限额
  margin: { percent: '20', source: marginPolicy }, // 每个估算的余量
})
const families = composeFamilies([anthropic])
const profiles = officialAnthropicProfiles({ retryPolicy, compactionTriggerPercent: '80' })
```

`createAnthropicFamily` 只做计算。第一次 `acquire` 初始化 tokenizer，家族的各个绑定共享它。tokenizer 没有需要释放的资源。本包没有 Cordis 入口，理由见 [Cordis 集成](docs/cordis.md)。更多说明见[使用与定位](docs/context.md)。

## 契约

[行为规格](SPEC.md)拥有记录、规则、计量、词表资源、官方档案与取得。[pi-ai-transport](../pi-ai-transport/SPEC.md) 拥有家族表、网关引擎与夹具检查。[model-contract](../model-contract/SPEC.md) 拥有档案、回放与计量的类型与规则。[公开接口](docs/public-api.md)索引根入口。

## 设计

`records.ts` 持有数据。`rules.ts` 与 `images.ts` 持有带修订名的规则表。`meter.ts` 写出 token 输入并计量。`tokenizer.ts` 读取并核对词表文件。`family.ts` 经引擎形成绑定。`profiles.ts` 派生官方档案。[内部架构](docs/architecture.md)说明模块、机制与理由，[关键流程](docs/flows.md)与[对象模型](docs/object-model.md)补充其余部分。

## 配置与运行

本包没有默认值。全部输入都是 `createAnthropicFamily` 与 `officialAnthropicProfiles` 的参数：

- `tokenizer`：tokenizer 资源。使用 `anthropicTokenizerResources()`。其定义必须等于记录指名的定义。
- `limits`：每个绑定的解码器缓冲限额。
- `margin`：每个估算的余量百分比，以及该余量政策的采用。
- `retryPolicy` 与 `compactionTriggerPercent`：Model 的重试策略与档案的压缩触发百分比。

`anthropicTokenizerResources` 读取本包发布的 `resources/tokenizers/anthropic-legacy/claude.json`，约 680 KiB。本包的其他部分不读环境、文件或网络。需要 Node.js 24 或更新版本。

## 验证

在仓库根目录运行下列命令。包的 engines 要求 Node.js >=24，pnpm 版本为 10.28.1。

```sh
pnpm turbo run typecheck test:fast --filter=@omne-harness/pi-ai-anthropic
pnpm turbo run test --filter=@omne-harness/pi-ai-anthropic
pnpm run lint:deps
pnpm run check:docs
```

turbo 在测试前构建本包及其依赖。改动夹具用例表后，先构建本包，再运行 `pnpm --filter @omne-harness/pi-ai-anthropic run fixtures`。新增记录后，先构建本包，再运行 `pnpm --filter @omne-harness/pi-ai-anthropic run fingerprints`。两个脚本从 `dist` 载入本包。[测试说明](tests/README.md)写明测试分层与未迁入的封存测试。覆盖与缺口见 [SPEC“组合与验证”](SPEC.md#组合与验证)。

## 维护

- 新型号是一条新记录、一行指纹与一组夹具。型号变化是一个新修订。不得原地修改记录。
- 规则行为变化时新增规则名，引用它的记录新增修订。
- 升级 js-tiktoken 或替换 `claude.json` 会改变每条记录的 tokenizer 定义，须新增修订，并同步 `src/tokenizer.ts` 中的摘要与资源目录的来源记录。
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
resources/                非源码运行资源：claude.json 与其许可证、来源
acceptance/               独立验收；fixtures/ 放验收输入
```

每个目录有 README.md 说明职责，index.md 提供导航。阅读路径见 [index.md](index.md)。docs 专题可以扩展为同名目录，内含 README.md 与 index.md。专题移动时同步本地图。
