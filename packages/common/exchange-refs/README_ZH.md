# @omne-harness/exchange-refs

[English](README.md)

三个跨域交接基础值的 module 包：`Adoption`、`DurableEvidence` 和 `ConsumerRef`。行为契约在 [SPEC.md](SPEC.md)。依据是 [#734 派发裁定](https://github.com/nemori-ai/omne-harness-lite/issues/734#issuecomment-6394333906)。

## 职责与状态

本成员拥有这三个类型的唯一定义。它只导出类型，没有运行时值、依赖或 Cordis 入口。agent-contract、model-contract、tool-contract、request-context-contract 与 authorization 以原名再导出这些类型。消费者清单由 [SPEC.md](SPEC.md#composition) 维护。

本成员不拥有任何判定。结构判定、摘要格式与算法、两个值之间的规则都留在各自的域。清单见 [SPEC.md](SPEC.md#ownership)。

## 使用

多数代码从已经使用的契约成员导入这些类型。成员需要直接使用共同形状时，从本包导入。

```ts
import type { ConsumerRef, DurableEvidence } from '@omne-harness/exchange-refs'

const consumer: ConsumerRef = { owner: 'agent', work: 'execution/step', position: 'I3', purpose: 'main' }
const completion: DurableEvidence = { owner: 'agent', record: 'r-1', revision: '1', digest: 'd' }
```

类型不核验取值。接收域用自己的判定核验。

## 契约

[SPEC.md](SPEC.md) 拥有每个类型的含义，以及留在其他域的规则清单。[docs/public-api.md](docs/public-api.md) 导航三个导出。

- `Adoption` 是可以恢复的精确采用。摘要编码归铸造方和接收域。
- `DurableEvidence` 定位一个 owner 的一份耐久记录。摘要只校验内容一致，算法归 owner。
- `ConsumerRef` 是消费者拥有者登记的稳定位置。生产方原样保存。`purpose` 是自由文本。

## 设计

`src/index.ts` 是唯一的模块，只有三个类型别名，没有 import。[docs/architecture.md](docs/architecture.md) 说明为什么放在 `common`，而不放进 `legal-identity`。[docs/object-model.md](docs/object-model.md) 描述三个值。[docs/flows.md](docs/flows.md) 与 [docs/cordis.md](docs/cordis.md) 写明不适用的理由。

## 配置与运行

本包不读环境变量，不启动进程。安装本包在运行时不带来其他包。

## 验证

| 文件 | 覆盖 |
| --- | --- |
| `tests/shapes.spec-d.ts` | 每个类型恰有四个必需的只读 `string` 成员 |
| `tests/public-entry.spec.ts` | 根入口没有运行时导出，`dependencies` 为空，只有 `.` 入口 |

运行 `pnpm turbo run test --filter=@omne-harness/exchange-refs`。类型测试在 `test:fast` 和 `pnpm typecheck` 中运行。这些测试不证明某个值来自可信的 owner。

## 维护

增加成员、删除成员或改变含义，都会改变每个再导出成员的公开契约。先改 SPEC.md，再与 Model 和 Tool 确认，然后重新生成各再导出成员的 API 快照。不要把摘要算法、谓词或跨值规则加进本包。负责人是 PanQiWei。

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
