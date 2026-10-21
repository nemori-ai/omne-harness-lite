# @omne-harness/execution-environment-host-local

PACKAGE_TEMPLATE_DRAFT
[English](README.md)

执行环境的 Service 实现与宿主提供者成员，`service-provider` 变体。

## 职责与状态

本成员做两件事。第一，把 [execution-environment](../execution-environment/README_ZH.md) 的登记表装进 [execution-environment-cordis-contract](../execution-environment-cordis-contract/README_ZH.md) 定义的服务 `executionEnvironment`，承担登记即效应、服务撤除时的关闭与撤除失败的报告。第二，在宿主机上提供 `files` 设施：按点名的对象身份读取、查看、写入与关闭文件。领域行为归 [execution-environment-contract](../execution-environment-contract/README_ZH.md)。

状态：Service 实现成员，`draft`。宿主文件使用一节已被接受，见 [SPEC 宿主文件使用](SPEC.md#宿主文件使用)。采用依据还有[系统页执行环境](../../../docs/architecture/runtime/execution-environment.md#环境选择与资源准备)与组的[主题与唯一拥有者](../docs/architecture.md#主题与唯一拥有者)。现在的实现情况如下：

- 已实现：宿主文件设施的读取、查看、写入与关闭；宿主文件提供者；Service 子类 `ExecutionEnvironmentRegistry`、插件 `filesFacilityPlugin` 与插件 `hostFilesPlugin`。
- 未实现：`files` 的其余八项操作（现在返回 `unsupported`）、`command` 与 `terminal` 提供者、平台前提的探测、授予根限制、Runtime Context 两条块的发布、调用方类核对，以及两个插件经 `definePlugin`，见 SPEC [明确缺项](SPEC.md#明确缺项)。
- 未验证：同一 isolate 标签下重复装载失败、配置校验失败，都没有测试。

现在没有应用装配本成员，也没有包依赖本成员。

## 使用

本成员有两个入口：

- `@omne-harness/execution-environment-host-local/cordis`：插件。应用装配者装载服务、`files` 声明插件与宿主文件插件。
- `@omne-harness/execution-environment-host-local`：不依赖 Cordis 的宿主文件设施、对象身份读取与宿主文件提供者。

```ts
import { Context } from '@deepseek-ai/cordis'
import {
  ExecutionEnvironmentRegistry,
  filesFacilityPlugin,
  hostFilesPlugin,
} from '@omne-harness/execution-environment-host-local/cordis'

const ctx = new Context()
await ctx.plugin(ExecutionEnvironmentRegistry)
await ctx.plugin(MyRecoveryAuthority)
await ctx.plugin(filesFacilityPlugin)
await ctx.plugin(hostFilesPlugin)
```

`MyRecoveryAuthority` 是 `@omne-harness/execution-environment-cordis-contract/cordis` 的 `ExecutionRecoveryAuthorityService` 的子类，由集成方的维护拥有者实现。服务每次恢复操作现取它；没有装载时恢复答不可用。调用方插件经服务定义使用服务，不导入本成员。执行适配用根入口的 `hostObjectToken` 点名对象。装配、点名与独立使用见[使用与定位](docs/context.md#使用方式)。

## 契约

- 公开形状归 `src/`。导出索引归[公开接口页](docs/public-api.md)。
- 类型以外的行为归 [SPEC](SPEC.md)：宿主提供者的事实、宿主文件使用（已接受）、其余现行行为、Service 实现与撤除顺序。
- 宿主文件使用的机制与运行记录归[内部架构的宿主文件使用](docs/architecture.md#宿主文件使用)。
- 插件、配置、登记即效应、撤除顺序与 IC 映射归 [Cordis 说明](docs/cordis.md)。
- 服务键与抽象类归 [execution-environment-cordis-contract](../execution-environment-cordis-contract/docs/cordis.md)。

服务插件的 fiber 拥有服务实例与登记表实例。服务卸载时关闭登记表：拒新请求，使租约失效，退役全部提供者；退役待处置时撤除函数抛出 `RetirementPending`。fiber 卸载时 Cordis 把这个错误写入 `ctx.logger`，卸载照常完成；调用方直接调用返回的撤除函数时可以重试。`filesFacilityPlugin` 的 fiber 拥有 `files` 设施声明的登记，`hostFilesPlugin` 的 fiber 拥有宿主文件提供者的登记。撤除不撤回已写入的字节。

## 设计

根入口有宿主文件设施与宿主文件提供者两个模块，`./cordis` 有 Service 子类与两个插件。包外依赖是 execution-environment-contract、execution-environment、execution-environment-cordis-contract 与 `@deepseek-ai/cordis`。宿主文件设施只核对对象身份，租户与守卫由登记表的租约视图核对。一个提供者共用一个设施实例，并记录在途的文件操作。账本关闭后由登记表的门以 `closed` 拒绝操作，提供者不查账本。退役时提供者不再接纳新操作，并等在途操作结束，最多 `drainBoundMs`，超界为待处置。Service 子类只转发与管理生命周期。模块与理由见[内部架构](docs/architecture.md)，三条机制流程见[机制流程](docs/flows.md)，对象见[对象模型](docs/object-model.md)。

## 配置与运行

Service 子类与 `filesFacilityPlugin` 的配置只接受缺省、`null` 或空对象。`hostFilesPlugin` 另接受 `drainBoundMs`：有限的非负毫秒数，是宿主提供者退役等在途文件操作的上界，初值 10000。退役超界时，`ctx.logger` 收到一条带在途数目的错误级诊断。恢复授权端口以 `executionRecoveryAuthority` 服务给出，不进插件树。一个 isolate 标签下只装一份服务。

宿主文件设施在 Node 上运行，使用 `O_NOFOLLOW` 与设备号、inode 核对对象身份。`package.json` 声明的引擎是 `>=24`。宿主事实里的平台取 `process.platform` 加 `os.release()`，提供者版本取本包 `package.json` 的 `version`。没有探测，所以前提报 `unknown`。

## 验证

在仓库根执行：

```sh
pnpm --filter @omne-harness/execution-environment-host-local test
```

在本目录执行 `pnpm typecheck` 做类型检查。八个测试文件共七十九个测试，见 [tests/](tests/README.md)。文件字节、符号链接与对象替换用真实文件系统，Cordis 装载用真实 Cordis 4.0.4，授权决定用替身；有一个测试文件用模块替身让一次 `open` 停住，使文件操作保持在途。运行记录：PanQiWei 接受时只在 Node v26.0.0、darwin 上运行过；2026-10-21 在 Node v24.18.0、linux 上，七十九个测试全部通过。授予根限制、重复装载与配置校验失败没有测试。结构检查通过不表示行为已验证。

## 维护

- 改宿主文件使用的已接受行为，要经原接受入口重新接受，再同步 SPEC、[内部架构](docs/architecture.md#宿主文件使用)与测试。
- 服务定义改变时，同步 Service 子类、[Cordis 说明](docs/cordis.md)与测试。
- 登记表工厂改变时，同步 Service 子类。
- 新的宿主设施进入时，同步 SPEC 的宿主提供者事实、[公开接口页](docs/public-api.md)与 Cordis 说明。
- Cordis 升版时，先重跑服务定义成员列出的 basis probe。
- 成员关系与依赖方向归[组入口](../README.md)。具名维护者由负责人指定。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   宿主提供者、宿主文件使用（已接受）、Service 实现、撤除顺序
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       模块、依赖、关键机制、宿主文件使用（已接受）
├── flows.md              F-EEH01 至 F-EEH03 机制流程
├── object-model.md       服务实例、提供者、设施实例与句柄代际
├── public-api.md         导出入口与定义索引
├── context.md            装配、点名、独立使用与定位
└── cordis.md             插件、配置、登记即效应、撤除顺序与 IC 映射
src/                      index.ts、host-files.ts、host-provider.ts、cordis.ts
tests/                    八个测试文件，fixtures/ 现在为空
schema/                   现在为空，配置 Schema 写在 src/cordis.ts
verification/             models/ 与 proofs/，现在为空
adr/                      现在为空
examples/                 现在为空
resources/                现在为空
acceptance/               现在为空，fixtures/ 也为空
```

每个目录的 README.md 说明职责与现状，index.md 负责导航。阅读路径见 [index.md](index.md)。
