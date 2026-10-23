# @omne-harness/model-host-local

[English](README.md)

## 职责与状态

本成员是 Model 的单机宿主提供者，承载本地凭据保管与本地发送路径。本地凭据保管是文件保管库（磁盘记录、文件锁、原子发布、关闭）和装载它的 Cordis 插件。本地发送路径是生产发送资源 `createPiSendResources` 与本地 Model 装配 `assembleLocalModel`：它把凭据保管、model 的发送边界、pi 传输与两个家族、调用方注入的 `ModelCommands` 连成一条真实请求路径。其余宿主能力（时钟、实例调度、目录装载、托管运行插件）的设计已接受，暂存于 [model/docs/cordis.md](../model/docs/cordis.md)，尚未实现。凭据的公共值与端口归 [model-contract](../model-contract/README_ZH.md)，`modelCredential` 服务定义归 [model-cordis-contract](../model-cordis-contract/README_ZH.md)，存在性与解析的判定和发送边界归 [model](../model/README_ZH.md)，传输与家族归 [pi-ai-transport](../pi-ai-transport/README.md)。设计、实现与运行验证分别判断。

| 能力 | 状态 | 证据范围 |
| --- | --- | --- |
| 文件保管库与 Cordis 插件 | 已实现 | 真实文件系统、子进程与真实 Cordis 4.0.4 |
| 生产发送资源 `createPiSendResources` | 已实现 | 观察凭据槽的传输工厂与真实 pi 传输（不发送） |
| 本地 Model 装配 `assembleLocalModel` | 已实现 | 本地 HTTPS 服务回放两个家族录制的 SSE，经 model 运行时与内存 `ModelCommands`；两家回复含推理状态的调用都收场 |
| 经真实厂商或代理的请求 | 未在本包验证 | 无 |
| 计量准备资源、耐久 `ModelCommands` | 不在本包 | 无 |
| 时钟、实例调度、目录装载、托管运行插件 | 未实现 | 无 |

## 使用

独立程序从根入口取得 `createLocalCustodian` 与 `openLocalCustodian`，不启动 Cordis。要发出真实请求时，程序从根入口取得 `assembleLocalModel`，给出保管库、`ModelCommands`、`SendCoordinator`、组合后的家族、网络配置、路由与限额，得到 model 的发送边界 `send` 与 `close`。Cordis 宿主从 `./cordis` 装载 `LocalCredentialPlugin`，需要时用 `deliverInjected` 经静态注入发送。用法与示例见[使用与定位](docs/context.md)，初始化与释放责任见[Cordis 集成](docs/cordis.md)。选择本成员会安装 Cordis、model-cordis-contract、pi-ai-transport 与 proper-lockfile；直接使用根入口不启动 Cordis，但安装闭包仍含它们。

## 契约

[行为规格](SPEC.md)拥有保管库文件、文件锁、发布确认、刷新、关闭与插件生命周期的行为，以及发送资源与本地装配的行为。引用、结果和端口的形状归 model-contract。`SendResources` 端口与发送边界归 model，传输配置归 pi-ai-transport。公开入口的导航见[公开接口](docs/public-api.md)。

## 设计

磁盘记录的编码在 [records.ts](src/records.ts)，保管库与文件系统交互在 [store.ts](src/store.ts)，插件在 [cordis.ts](src/cordis.ts)，注入发送在 [deliver-injected.ts](src/deliver-injected.ts)，发送资源在 [send-resources.ts](src/send-resources.ts)，本地装配在 [assembly.ts](src/assembly.ts)。保管状态的类型（`CustodianState`、`Binding`、`BindingLife`）来自 model。判定不在本成员：保管库把当前状态快照交给 model 的判定函数。模块、机制与理由见[内部架构](docs/architecture.md)。

## 配置与运行

保管库路径与工厂秘密是保管库仅有的配置，由应用提供。本地装配的路由地址、代理、TLS、连接容量与各项限额全部由应用配置给出，本包不写默认值。在本仓库的云端环境里，保管库只存占位值，真实密钥由出站代理注入。文件锁不按时间过期，持锁进程崩溃后须在所有写者停止后手工删除 `${path}.lock`。保管库从磁盘记录经 legal-identity 重新铸造租户值，租户相等只在同一 legal-identity 实例内成立，因此调用方与保管库须在同一进程内共享该实例。

## 验证

在仓库根运行以下命令。包的 engines 要求 Node.js >=24，pnpm 版本为 10.28.1。实际验证过的 Node.js 版本以各次运行报告为准。

```sh
pnpm turbo run typecheck --filter=@omne-harness/model-host-local
pnpm turbo run test --filter=@omne-harness/model-host-local
pnpm turbo run test:fast --filter=@omne-harness/model-host-local
pnpm turbo run test:slow --filter=@omne-harness/model-host-local
pnpm run check:docs
```

Turbo 的 `test`、`test:fast` 与 `test:slow` 先构建本包及其依赖，再执行所选测试。`typecheck` 不先构建。直接运行 `pnpm --filter @omne-harness/model-host-local test` 不自动构建，所需构建产物须已就绪。`test:fast` 与 `test:slow` 分别选择快层与慢层。

测试覆盖五种解析结果、租户隔离、轮换与撤销、文件损坏、关闭、跨进程更新与保存确认未知，并用真实 Cordis 4.0.4 核对插件发布与撤除。快层测试核对发送资源的凭据槽、物化传输归属、释放与关闭。慢层测试用本地 HTTPS 服务回放两个家族录制的 SSE，经装配的发送路径与 model 运行时驱动调用，核对 `Bearer` 凭据、唯一终止、账目到达与应付金额。它们不证明其他宿主能力，不证明经真实厂商或代理的请求，也不证明跨机器或网络文件系统上的锁语义。

## 维护

修改保管库行为、记录格式或插件入口时，同步[文档登记](documentation.json)、model 的判定状态形状、model-cordis-contract 的服务定义消费、组页与本包测试。model 的 `SendResources` 端口或 pi-ai-transport 的传输配置变化时，同步发送资源、本地装配、SPEC 与测试。未实现的宿主能力保持实际状态，不在文档里预先承诺。

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
