# @omne-harness/tokenizer-tiktoken

[English](README.md)

## 职责与状态

本成员是 `ModelTextTokenizer` 的 tiktoken 引擎 adapter。家族成员的计量器把本家的词表与特殊 token 表交给它，得到一个 tokenizer。职责与建包条件见[组架构“成员与新增条件”](../docs/architecture.md#成员与新增条件)与[“Tokenizer 的资源与计量分工”](../docs/architecture.md#tokenizer-的资源与计量分工)。

本包只封装引擎：初始化时核对资源，`count` 只做纯计算。本包不收录任何厂商词表。计划中的消费者是 `pi-ai-openai`（o200k）与 `pi-ai-anthropic`（`claude.json`），两者都还没有消费本包。

### 支持范围

支持范围分五档。每档只写已核对的事实。改变支持范围的提交同步本表、英文 README、[SPEC](SPEC.md) 与组页的状态。

| 档 | 已交付的内容 | 入口 | 验证范围 |
| --- | --- | --- | --- |
| 公开入口已导出 | 运行时值 `createTiktokenTokenizer`；类型 `TiktokenRanks`、`TiktokenResources` | 根入口 | `public-entry.spec.ts` 核对根入口只有一个运行时导出 |
| 初始化核对已实现 | 实现版本等于实际安装的 js-tiktoken；词表摘要与配置摘要等于规范 JSON 的 SHA-256；任一不符返回 `unavailable` | 根入口；包内 `src/tokenizer.ts`、`src/digest.ts`、`src/engine-version.ts` | 快层，真实 js-tiktoken 1.0.21，o200k 与合成词表。摘要常量在本包以外独立算出 |
| 计数已实现 | 文本中的特殊 token 字样按普通文本计；相邻文本段合并后编码；显式特殊 token 段只查固定表，查不到返回 `unsupported-token`；空序列计 `"0"`；非良构 Unicode 返回 `invalid` | `ModelTextTokenizer.count` | 快层，o200k 的计数与完整 js-tiktoken 编码器比较；合成词表的计数按手算核对 |
| 构建产物已验证 | 构建产物在另一进程与临时目录中初始化并计数，结果与源码相同；版本失配同样返回 `unavailable` | `dist/index.js` | 慢层，子进程。没有安装到包外的消费者 |
| 尚未交付 | 家族成员的消费：`pi-ai-openai` 传入 o200k，`pi-ai-anthropic` 传入 `claude.json`。`claude.json` 的计数验证随 `pi-ai-anthropic` 进行 | 无 | 这些路径没有证据 |

## 使用

家族成员从根入口导入工厂与类型，在发布计量能力之前初始化一次：

```ts
import o200k from 'js-tiktoken/ranks/o200k_base'
import { createTiktokenTokenizer } from '@omne-harness/tokenizer-tiktoken'

const created = createTiktokenTokenizer({
  definition, // TokenizerDefinition：家族给出的四项采用值
  ranks: { patStr: o200k.pat_str, specialTokens: o200k.special_tokens, bpeRanks: o200k.bpe_ranks },
  specialTokens: { '<|endoftext|>': 199999 },
})
if ('failure' in created) throw new Error(created.failure.kind)
created.ok.count([{ kind: 'text', text: 'hello world' }]) // { ok: { tokens: '2' } }
```

`definition.implementation.revision` 写实际安装的 js-tiktoken 版本。`vocabulary.digest` 与 `configuration.digest` 按 [SPEC“规范 JSON”](SPEC.md#规范-json) 算出。依赖本包会安装 model-contract、operation-result 与 js-tiktoken，不安装 Cordis 或任何家族。本包没有 Cordis 入口，理由见 [Cordis 集成](docs/cordis.md)。更多说明见[使用与定位](docs/context.md)。

## 契约

[行为规格](SPEC.md)拥有初始化核对、规范 JSON、计数规则、所有权与失败。tokenizer 的类型与共同计数规则归 [model-contract](../model-contract/SPEC.md#分词与完整请求计量)。公开入口的导航见[公开接口](docs/public-api.md)。

## 设计

`tokenizer.ts` 拥有初始化与计数。`digest.ts` 写出规范 JSON 并算摘要。`engine-version.ts` 读取实际安装的 js-tiktoken 版本。模块、机制与理由见[内部架构](docs/architecture.md)，流程见[关键流程](docs/flows.md)，对象见[对象模型](docs/object-model.md)。

## 配置与运行

本包没有配置项，也没有默认值。全部输入是 `createTiktokenTokenizer` 的参数：

- `definition`：家族给出的四项采用值。
- `ranks`：家族提供的词表。
- `specialTokens`：允许经显式段使用的固定特殊 token 表。

初始化读取一次 js-tiktoken 的 `package.json`，以取得实际版本。`count` 不读文件，不读当前工作目录，不访问网络。tokenizer 没有需要释放的资源。运行需要 Node.js 24 或更高版本。

## 验证

在仓库根运行以下命令。包的 engines 要求 Node.js >=24，pnpm 版本为 10.28.1。

```sh
pnpm turbo run typecheck test:fast --filter=@omne-harness/tokenizer-tiktoken
pnpm turbo run test --filter=@omne-harness/tokenizer-tiktoken
pnpm turbo run test:slow --filter=@omne-harness/tokenizer-tiktoken
pnpm run lint:deps
pnpm run check:docs
```

Turbo 的 `test`、`test:fast` 与 `test:slow` 先构建本包及其依赖，再执行所选测试。慢层需要构建产物。测试分层与固定输入见[测试说明](tests/README.md)，覆盖与未覆盖见 [SPEC“组合与验证”](SPEC.md#组合与验证)。

`pnpm run package:template scan --member packages/model/tokenizer-tiktoken` 的已知限制：

- `integration` 为 `unknown`。原因是 `docs/architecture/constraints.json` 中没有本成员的登记。这项登记归架构拥有者，结构检查不受影响。
- 加 `--check` 时退出码为 1。原因是 `adoption` 为 `unmarked`：`package.json` 没有包模板标记。`structure` 仍为 `pass`。

## 维护

- 升级 js-tiktoken：先有依据，再改 `pnpm-workspace.yaml` 的 catalog。同时更新测试中的 `ENGINE_REVISION`，并通知家族成员更新 `implementation.revision`。
- 改变规范 JSON 的写法：所有家族成员的摘要都会失效。须先修订 SPEC，并同步全部家族成员。
- 改变计数规则：同步 SPEC、对应测试与[关键流程](docs/flows.md)。
- 增加运行依赖：先核对组架构的依赖方向。
- 改变支持范围：同步本表、英文 README、[组页](../README.md)与[包组织](../../../docs/package-organization.md)中的状态。

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
