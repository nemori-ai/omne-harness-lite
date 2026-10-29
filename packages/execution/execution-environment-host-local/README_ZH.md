# @omne-harness/execution-environment-host-local

PACKAGE_TEMPLATE_DRAFT
[English](README.md)

执行环境的 Service 实现与宿主提供者成员，`service-provider` 变体。

## 职责与状态

本成员做两件事。第一，把 [execution-environment](../execution-environment/README_ZH.md) 的登记表装进 [execution-environment-cordis-contract](../execution-environment-cordis-contract/README_ZH.md) 定义的服务 `executionEnvironment`，承担登记即效应、服务撤除时的关闭与撤除失败的报告。第二，在宿主机上提供 `files` 设施：按点名的对象身份读取、查看、写入与关闭文件。领域行为归 [execution-environment-contract](../execution-environment-contract/README_ZH.md)。

状态：Service 实现成员，`draft`。宿主文件使用一节已被接受，见 [SPEC 宿主文件使用](SPEC.md#宿主文件使用)。采用依据还有[系统页执行环境](../../../docs/architecture/runtime/execution-environment.md#环境选择与资源准备)与组的[主题与唯一拥有者](../docs/architecture.md#主题与唯一拥有者)。现在的实现情况如下：

- 已实现：宿主文件设施的读取、查看、写入与关闭；宿主文件责任域 `createHostFilesDomain`；宿主文件提供者：每份获取一个门面、配额、原获取查询、获取枚举与结清；Service 子类 `ExecutionEnvironmentRegistry`、插件 `filesFacilityPlugin` 与插件工厂 `createHostFilesPlugin(domain)`。
- 未实现：`files` 的其余八项操作（现在返回 `unsupported`）、`command` 与 `terminal` 提供者、平台前提的探测、授予根限制、Runtime Context 两条块的发布、调用方类核对、两个插件经 `definePlugin`，以及进程结束之后对旧容量的结清（需要域外的进程退出证据，见 [#323](https://github.com/nemori-ai/omne-harness-lite/issues/323)），见 SPEC [明确缺项](SPEC.md#明确缺项)。
- 未验证：同一 isolate 标签下重复装载失败、配置校验失败，都没有测试。

现在没有应用装配本成员，也没有包依赖本成员。

## 使用

本成员有两个入口：

- `@omne-harness/execution-environment-host-local/cordis`：插件。应用装配者装载服务、三个端口服务、`files` 声明插件与宿主文件插件。
- `@omne-harness/execution-environment-host-local`：不依赖 Cordis 的宿主文件设施、对象身份读取、宿主文件责任域与宿主文件提供者。

```ts
import { Context } from '@deepseek-ai/cordis'
import { createHostFilesDomain } from '@omne-harness/execution-environment-host-local'
import {
  ExecutionEnvironmentRegistry,
  createHostFilesPlugin,
  filesFacilityPlugin,
} from '@omne-harness/execution-environment-host-local/cordis'

// 进程宿主只创建一次责任域，插件重载时保留它。
const domain = createHostFilesDomain()
const ctx = new Context()
await ctx.plugin(MyEnvironmentAuthority)
await ctx.plugin(MyScopeBinding)
await ctx.plugin(MyRecoveryAuthority)
await ctx.plugin(ExecutionEnvironmentRegistry)
await ctx.plugin(filesFacilityPlugin)
await ctx.plugin(createHostFilesPlugin(domain))
```

`MyEnvironmentAuthority`、`MyScopeBinding` 与 `MyRecoveryAuthority` 分别是 `@omne-harness/execution-environment-cordis-contract/cordis` 的 `ExecutionEnvironmentAuthorityService`、`ExecutionScopeBindingService` 与 `ExecutionRecoveryAuthorityService` 的子类，由集成方实现。服务每次使用时从自己装载时的上下文现取；没有装载时答不可用，不放行。调用方插件经服务定义使用服务，不导入本成员。执行适配用根入口的 `hostObjectToken` 点名对象。装配、点名与独立使用见[使用与定位](docs/context.md#使用方式)。

## 契约

- 公开形状归 `src/`。导出索引归[公开接口页](docs/public-api.md)。
- 类型以外的行为归 [SPEC](SPEC.md)：宿主提供者的事实、宿主文件使用（已接受）、其余现行行为、Service 实现与撤除顺序。
- 宿主文件使用的机制归[内部架构的宿主文件使用](docs/architecture.md#宿主文件使用)，运行记录归 SPEC [组合与验证](SPEC.md#组合与验证)。
- 插件、配置、登记即效应、撤除顺序与 IC 映射归 [Cordis 说明](docs/cordis.md)。
- 服务键与抽象类归 [execution-environment-cordis-contract](../execution-environment-cordis-contract/docs/cordis.md)。

服务插件的 fiber 拥有服务实例与登记表实例。服务卸载时关闭登记表：拒新请求，使租约失效，退役全部提供者；退役待处置时撤除函数抛出 `RetirementPending`。fiber 卸载时 Cordis 把这个错误写入 `ctx.logger`，卸载照常完成；调用方直接调用返回的撤除函数时可以重试。`filesFacilityPlugin` 的 fiber 拥有 `files` 设施声明的登记，宿主文件插件的 fiber 拥有一代宿主文件提供者。责任域比插件活得久：重载后的插件加入同一个责任域，看到原占用与原获取。撤除不撤回已写入的字节。

## 设计

根入口有宿主文件设施、宿主文件责任域与宿主文件提供者三个模块，`./cordis` 有 Service 子类与两个插件。包外依赖是 execution-environment-contract、execution-environment、execution-environment-cordis-contract、legal-identity、runtime-context-contract（只用类型）与 `@deepseek-ai/cordis`。宿主文件设施只核对对象身份，租户与守卫由登记表的租约视图核对。责任域持有一个共用的文件引擎；每份获取有自己的门面：自己的准入、在途操作，以及关闭失败的描述符上的所有者标签。释放、结清或退役先封门面，最多等 `drainBoundMs`，再重试失败的关闭。只有什么都不剩时，名额才返还，且只返还一次；否则答待处置，资源清单可以为空。账本关闭后由登记表的门以 `closed` 拒绝操作，提供者不查账本。Service 子类只转发与管理生命周期。模块与理由见[内部架构](docs/architecture.md)，三条机制流程见[机制流程](docs/flows.md)，对象见[对象模型](docs/object-model.md)。

## 配置与运行

Service 子类与 `filesFacilityPlugin` 的配置只接受缺省、`null` 或空对象。宿主文件插件另接受 `drainBoundMs`：有限的非负毫秒数，是释放、结清或退役等在途文件操作的上界，初值 10000。结果为待处置时，`ctx.logger` 收到一条错误级诊断。配额策略是 `createHostFilesDomain` 的选项，不是插件配置；初值是每租户 64 个未结清的获取，没有全局上界。三个端口以 `executionEnvironmentAuthority`、`executionScopeBinding` 与 `executionRecoveryAuthority` 服务给出，不进插件树。一个 isolate 标签下只装一份服务。

宿主文件设施在 Node 上运行，使用 `O_NOFOLLOW` 与设备号、inode 核对对象身份；没有 `O_NOFOLLOW` 的宿主（Windows 上的 Node）改为打开之后对末段 `lstat` 核对。`package.json` 声明的引擎是 `>=24`。宿主事实里的平台取 `process.platform` 加 `os.release()`，提供者版本取本包 `package.json` 的 `version`。没有探测，所以前提报 `unknown`。

## 验证

在仓库根执行：

```sh
pnpm --filter @omne-harness/execution-environment-host-local test
```

在本目录执行 `pnpm typecheck` 做类型检查。十个测试文件共一百四十八个测试，见 [tests/](tests/README.md)。文件字节、符号链接、对象替换与描述符用真实文件系统，Cordis 装载用真实 Cordis 4.0.4，授权决定用替身；两个测试文件用模块替身让 `open` 停住，使文件操作保持在途；两个测试文件让活描述符上的 `FileHandle.close` 失败。运行记录：PanQiWei 接受时只在 Node v26.0.0、darwin 上运行过；当前的运行记录见 SPEC [组合与验证](SPEC.md#组合与验证)。授予根限制、重复装载与配置校验失败没有测试。结构检查通过不表示行为已验证。

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
├── object-model.md       服务实例、责任域、提供者、获取记录与句柄代际
├── public-api.md         导出入口与定义索引
├── context.md            装配、点名、独立使用与定位
└── cordis.md             插件、配置、登记即效应、撤除顺序与 IC 映射
src/                      index.ts、host-files.ts、host-domain.ts、host-provider.ts、cordis.ts
tests/                    十个测试文件与一个测试辅助，fixtures/ 现在为空
schema/                   现在为空，配置 Schema 写在 src/cordis.ts
verification/             models/ 与 proofs/，现在为空
adr/                      现在为空
examples/                 现在为空
resources/                现在为空
acceptance/               现在为空，fixtures/ 也为空
```

每个目录的 README.md 说明职责与现状，index.md 负责导航。阅读路径见 [index.md](index.md)。
