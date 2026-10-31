# @omne-harness/modality

[English](README.md)

模态的 module 包。它给能力契约一份四种模态的列表，和一条从媒体类型读出模态的规则。行为契约是 [SPEC.md](SPEC.md)。

## 职责与状态

本成员拥有类型 `Modality`、列表 `MODALITIES` 和五个函数：`judgeModality`、`judgeModalities`、`judgeMediaType`、`isCanonicalMediaType`、`missingModalities`。它没有运行时依赖，不导入任何其他成员，也不导入 Cordis。

具名消费者是 Model 与 Tool。Model 用模态表示档案的输入输出和转换件的键，并从媒体类型读出内容块的模态。Tool 用模态表示工具定义的参数模态与结果模态。以后其他成员可以用同一个入口。生产调用点在 Model 与 Tool 的契约成员里。Model 主干会话于 2026-10-19 确认含义与 Model 契约一致。媒体类型对照表由 PanQiWei 随 #397 接受。

本成员只说有哪几种模态。它不说消费者支持哪几种，不做块种类到模态的映射，也不持有历史投影、转换件选择和初始文本规则。范围外的内容列在 [SPEC.md](SPEC.md)。

## 使用

按包名导入公开入口。本包没有 Cordis 入口。[docs/context.md](docs/context.md) 列出消费者和安装闭包。

```ts
import { judgeMediaType, judgeModalities, missingModalities } from '@omne-harness/modality'

judgeMediaType('Audio/WAV; rate=8000') // { ok: { mediaType: 'audio/wav', modality: 'voice' } }
judgeMediaType('application/pdf') // { ok: { mediaType: 'application/pdf', modality: null } }
judgeMediaType('image/') // { rejected: 'media-type' }

judgeModalities(['text', 'image', 'text']) // { rejected: 'duplicate', index: 2 }
missingModalities(['image', 'voice'], ['text', 'image']) // ['voice']
```

## 契约

行为由 [SPEC.md](SPEC.md) 拥有。[docs/public-api.md](docs/public-api.md) 索引 [src/index.ts](src/index.ts) 的导出。

`Modality` 是 `text`、`image`、`voice`、`video` 之一。全部 `audio/*` 媒体类型读作 `voice`。顶层类型是其他值的媒体类型，例如 `application/pdf`，不属于任何模态，它的模态是 `null`。判定函数对普通值不抛出异常，返回 `{ ok }` 或 `{ rejected }`。输入自身的 getter 或 Proxy 抛出的错误，以及引擎资源耗尽（见 [SPEC](SPEC.md#所有权失败与生命周期)），原样传出。`judgeModalities` 允许空列表。需要非空列表的消费者自己检查。

## 设计

`src/index.ts` 是唯一的模块，放类型、列表和函数。它没有状态、导入和配置。媒体类型的规则对应 RFC 9110 第 8.3.1 节的文法，参数按第 5.6.6 节。`image/png;` 这样的空参数位合文法。[docs/architecture.md](docs/architecture.md) 写机制与理由。[docs/object-model.md](docs/object-model.md) 解释值。[docs/flows.md](docs/flows.md) 与 [docs/cordis.md](docs/cordis.md) 说明流程与 Cordis 为什么不适用。

## 配置与运行

本包不读环境变量，不启动进程。安装它在运行时不会再安装其他包。

## 验证

适用的测试是单元测试、从公开入口出发的契约测试和一个类型测试。测试按包名导入。该名字解析到 `dist/index.js`，所以测试同时检查构建产物能独立使用。集成测试与端到端旅程测试不适用，本包没有存储、服务或用户旅程。

| 文件 | 覆盖 |
| --- | --- |
| `tests/modality.spec.ts` | `MODALITIES`、`judgeModality`、`judgeModalities` 与 `missingModalities` |
| `tests/media-type.spec.ts` | `judgeMediaType` 与 `isCanonicalMediaType`：对照表、文法与拒绝 |
| `tests/modality-types.spec-d.ts` | `Modality` 的精确类型与各判定的拒绝原因 |
| `tests/public-entry.spec.ts` | 运行时导出的精确集合、`dependencies` 为空、只有 `.` 入口、产物不含导入 |

turbo 先构建 `dist` 及其依赖，再运行测试：`pnpm turbo run test --filter=@omne-harness/modality`。本目录里的 `pnpm test` 只运行 Vitest，不构建。运行 `pnpm typecheck` 对照源码类型检查测试。

## 维护

改动模态列表、媒体类型对照表或拒绝原因，就改变了公开契约。先改 SPEC.md，再改两份 README，然后同步消费者。新增依赖和新增入口都需要新的采用决定。Model 与 Tool 在各自的交付里采用本成员。在那之前它们保留各自的副本，采用时各自删除副本。

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
