# @omne-harness/session-contract

[English](README.md)

Session 的纯契约成员，不依赖 Cordis。

## 职责与状态

本成员拥有 Session 治理的公开契约：工作、管理、对账、历史四个调用方面；构造时由提供者提供的依赖端口，以及 Session 向外调用的出站端口；会话日志的事件目录；纯领域服务的签名、决定函数 `decide` 与归约函数 `reduce`；块声明 `session.modes`。

本成员不拥有执行。Agent、Model、Tool 的执行生命周期归各自成员。本成员不点名任何邻域契约，不拥有存储、调度，也不拥有把服务绑定到 Cordis 的插件。Session 是工作治理服务，Run 与 attempt 是被治理的对象，不是运行实例。

状态：契约成员。[SPEC](SPEC.md) 写明哪些部分由技术接受采用，状态行写明源码支持范围。#536 revision 5 把本次交付限定在 M2 首条租户路径，其余归 #756。

| 范围 | 支持 | 位置 |
| --- | --- | --- |
| [公开接口页](docs/public-api.md)的类型：值、身份、固定输入、结果、四个面、端口、领域服务与 `decide`/`reduce` 的签名 | 已导出 | `src/` |
| `create`、`completeInitialization`、`accept`（普通输入）、`startRun`、`recordMessage`、`receive`（交入回执）、`finishRun` | `decide` 与 `reduce` 已实现，但普通输入被拒时不写 SE12，见 SPEC 的 SE12-JC03 | `src/decide.ts`、`src/reduce.ts` |
| `accept`（卡片答复、业务输入）、`claim`、`reload`、`preserveResult`、`completeConsumption`、`completeExternalConsumption`、`bindExternalCall`、`commitDerived`、`release`、`control`、`change`、`setRelation`、`configureAutoArchive`、`considerAutoArchive`、`recordIdle`、`interrupt`、`freeze`；交入回执之外的 `receive` 事实 | 未支持：`decide` 返回 `rejected`，失败为 `unavailable`，诊断指向 #756 | `src/decide.ts` |
| `judgeAdvance`、`routeInput`、`judgeRunStart`、`openWork`、`judgeCompletion`、`resolveOperation` | 已实现 | `src/judgments.ts` |
| `resolveControlScope`、`judgeIdle`、`resolveCascade` | 未支持：返回指向 #756 的 `invalid`/`unavailable`；`resolveCascade` 抛错 | `src/judgments.ts` |
| `./testing`：`SessionTransactionPort` 的一致性套件与非耐久替身，身份桥、证据桥、Context 输入与时钟的替身 | 已导出；替身通过套件 | `src/testing*.ts` |
| `ToolStartFencePort`、`DeliveryReleasePort`、`ControlProgress.startFence`、`start-fence` 与 `agent-event` 事实 | 已被替代，不声明 | [SPEC 被替代的协议](SPEC.md#被替代的协议) |

未验证：耐久、跨进程并发、对真实存储的恢复、真实身份源与时钟。替身只在内存里证明判定。

组内 session、session-cordis-contract、session-cordis 三个成员在 `package.json` 里依赖本成员。`session` 与 `session-cordis` 当前只声明依赖，尚未导入本成员；`session-cordis-contract` 在其 Cordis 服务定义下转出这些类型。

## 使用

本成员有根入口 `@omne-harness/session-contract` 与只给测试的 `@omne-harness/session-contract/testing`，没有 `./cordis` 入口。只需要类型与纯函数的调用方只安装本成员，不需要 Cordis，也不需要宿主。

调用方按自己的调用方类取对应的面：

```ts
import type { SessionFaces } from '@omne-harness/session-contract'

declare function drive<P>(session: SessionFaces<P>): void
// session.work, session.management, session.reconciliation, session.history
```

导出按源文件的导航见[公开接口页](docs/public-api.md)，各面由谁消费、按什么顺序见[使用与定位](docs/context.md)。在 Cordis 中工作的调用方使用 [session-cordis-contract](../session-cordis-contract/README_ZH.md) 的服务定义，见 [Cordis 说明](docs/cordis.md)。

## 契约

- 公开形状、纯判定、`decide`、`reduce` 与条目编码归 `src/`。
- 类型以外的行为归 [SPEC](SPEC.md)：操作表、共同提交表、与 Agent 的参加条款、推进与换代条款、事件消费条款、Run 的两层状态机。
- 导出的导航归[公开接口页](docs/public-api.md)，API 快照是 `api/session-contract.api.md`。
- 日志事件、状态转移，以及各对象的身份与生灭归[对象模型](docs/object-model/README.md)。
- 跨成员的顺序与失败分支见[流程](docs/flows/README.md)。

每个变更操作都有操作身份。同一意图的同一操作重复提交，得到原回执。提交结果未知时一直保持未知，直到查询取得原结果。本成员不持有资源，没有需要释放的对象。

## 设计

本成员只有一个根入口，里面有值与结果类型、四个面、构造与出站端口、纯领域服务和一个块声明。依赖单向：消费者依赖本成员；[session](../session/README_ZH.md) 提供机制；[session-cordis-contract](../session-cordis-contract/README_ZH.md) 把同一组操作绑定到 Cordis；[session-adapters](../session-adapters/README_ZH.md) 是组内唯一导入邻域契约的成员。本成员不导入以上任何一个。边界理由见[内部架构](docs/architecture.md)，顺序与对象见[流程](docs/flows/README.md)与[对象模型](docs/object-model/README.md)。

## 配置与运行

本成员没有配置，没有环境前提，运行时不读取资源。调用方在每次操作里传入租户、会话、主体与操作身份。存储、时钟、身份与通知由提供者提供。调度策略与重试上限的配置归 [session](../session/README_ZH.md) 的工厂。

## 验证

在仓库根执行：

```sh
pnpm turbo run test --filter=@omne-harness/session-contract
```

在本目录执行 `pnpm typecheck` 做类型检查。测试覆盖导出集合、首条路径种类的 `decide`/`reduce`、边界上的纯判定、事务端口套件的自证与依赖方向，见 [tests/](tests/README.md)。SPEC 其余验证义务还没有测试覆盖，包括[持续验证义务](SPEC.md#持续验证义务与未覆盖)与[候选的持续验证义务](SPEC.md#候选的持续验证义务)。结构检查通过不表示行为已验证。

## 维护

- 公开导出变化时，同步 SPEC、[公开接口页](docs/public-api.md)、[src 索引](src/index.md)与导出测试。
- 操作、结果或端口变化时，同步依赖方：[session](../session/README_ZH.md)、[session-cordis-contract](../session-cordis-contract/README_ZH.md)、[session-cordis](../session-cordis/README_ZH.md)、[session-adapters](../session-adapters/README_ZH.md)、[session-storage-sql](../session-storage-sql/README_ZH.md)。
- 事件目录或状态转移变化时，一并同步[对象模型](docs/object-model/README.md)与[流程](docs/flows/README.md)。
- 成员关系与依赖方向归[组入口](../README.md)。具名维护者由负责人指定。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   公开类型以外的行为
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       依赖方向与设计限制
├── context.md            消费者、使用顺序与系统定位
├── cordis.md             本成员没有 Cordis 入口的理由
├── public-api.md         候选定义与导出索引
├── flows/                跨成员流程与失败分支
└── object-model/         日志事件与状态转移
src/                      公开类型、判定、decide、reduce 与测试替身
tests/                    导出集合、decide/reduce、套件自证、依赖方向
schema/                   模板占位
verification/             models/ 与 proofs/，模板占位
adr/                      模板占位
examples/                 模板占位
resources/                模板占位
acceptance/               模板占位，fixtures/ 同
```

每个目录的 README.md 说明职责，index.md 负责导航。除 `docs/` 外，这些文件仍是模板占位，没有写本包事实。阅读路径见 [index.md](index.md)。
