# @omne-harness/operation-result

[English](README.md)

操作结果的 module 包。它给各能力契约一种统一的形状：带值成功、不带值的确认，以及失败。行为契约在 [SPEC.md](SPEC.md)。形状已在 [#248 技术采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/248#issuecomment-6176737639)中接受。拆成本成员的依据是 [#371 技术采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/371#issuecomment-6229850851)。

## 职责与状态

本成员拥有 `Outcome`、`Ack`、`succeed`、`ack`、`fail` 和 `isSuccess`。它没有运行时依赖，也不导入 Cordis。失败词汇 `F` 归调用方。本包不规定共同的失败词汇，也不是所有能力共用的统一信封。

位置 `packages/common/operation-result` 依据 #371 技术采用决定。具名消费者是 `tool-contract`、`tool`、`tool-cordis-contract` 和 `model-contract`。当前轨道没有生产调用点。这四个成员合入本轨道时按公开入口导入本成员，不复制结果类型。形状和函数从 `@omne-harness/kernel-basis` 原样迁来，没有改动。

## 使用

调用方用包名导入公开入口。依赖为空。本包没有 Cordis 入口。[docs/context.md](docs/context.md) 列出消费者和安装闭包。

```ts
import { ack, fail, isSuccess, succeed } from '@omne-harness/operation-result'

const valued = succeed({ id: 'job-1' })
const empty = ack()
const broken = fail('rejected' as const)

isSuccess(valued) // true，valued.ok 是 { id: 'job-1' }
isSuccess(empty) // true，empty.ok 是 true
isSuccess(broken) // false
```

## 契约

[SPEC.md](SPEC.md) 拥有结果形状和消费者对照。[docs/public-api.md](docs/public-api.md) 给出六个导出在源码中的位置。

`Outcome<T, F>` 是 `{ ok: T } | { failure: F }`。`Ack<F>` 是 `{ ok: true } | { failure: F }`。`F` 归调用方。对象带有 `ok` 时 `isSuccess` 为真。带值成功把载荷放在 `ok` 里。无值确认的 `ok` 等于 `true`，不携带载荷。

## 设计

`src/index.ts` 是唯一的模块。它有两个类型和四个小函数。它没有状态、没有 import，也没有配置。[docs/architecture.md](docs/architecture.md) 写成员位置和依赖方向。[docs/object-model.md](docs/object-model.md) 说明 `Outcome` 与 `Ack` 为什么分开。[docs/flows.md](docs/flows.md) 与 [docs/cordis.md](docs/cordis.md) 写明流程和 Cordis 为什么不适用。

## 配置与运行

本包不读环境变量，也不启动进程。安装它不会在运行时带来其他包。

## 验证

适用的测试是单元测试和从公开入口做的契约测试。测试用包名导入本包。包名解析到 `dist/index.js`，所以这些测试同时检查构建产物能被独立消费。集成测试和端到端旅程不适用。本包没有存储、服务或用户旅程。

| 文件 | 覆盖 |
| --- | --- |
| `tests/outcome.spec.ts` | `succeed`、`ack`、`fail` 和 `isSuccess` 的结果 |
| `tests/public-entry.spec.ts` | 根入口的运行时导出恰为四个函数、`dependencies` 为空、`exports` 只有 `.`，以及 `dist/index.js` 与 `dist/index.d.ts` 不含 Cordis 文本 |

在本目录运行 `pnpm test`。它先构建 `dist`，再运行测试。运行 `pnpm typecheck` 按源码类型检查测试。

## 维护

修改形状，或修改 `ok`、`failure` 的含义，都会改变公开契约。先改 SPEC.md，再改两份 README，再同步具名消费者。新增依赖或新增入口都需要新的采用决定。失败词汇留在各自拥有它的调用方。

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
