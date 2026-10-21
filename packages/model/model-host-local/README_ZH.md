# @omne-harness/model-host-local

[English](README.md)

## 职责与状态

本成员是 Model 的单机宿主提供者，目前只承载本地凭据保管：文件保管库（磁盘记录、文件锁、原子发布、关闭）和装载它的 Cordis 插件。其余宿主能力（时钟、实例调度、目录装载、托管运行插件）的设计已接受，暂存于 [model/docs/cordis.md](../model/docs/cordis.md)，尚未实现。凭据的公共值与端口归 [model-contract](../model-contract/README_ZH.md)，`modelCredential` 服务定义归 [model-cordis-contract](../model-cordis-contract/README_ZH.md)，存在性与解析的判定归 [model](../model/README_ZH.md)。设计、实现与运行验证分别判断。

## 使用

独立程序从根入口取得 `createLocalCustodian` 与 `openLocalCustodian`，不启动 Cordis。Cordis 宿主从 `./cordis` 装载 `LocalCredentialPlugin`，需要时用 `deliverInjected` 经静态注入发送。用法与示例见[使用与定位](docs/context.md)，初始化与释放责任见[Cordis 集成](docs/cordis.md)。选择本成员会安装 Cordis、model-cordis-contract 与 proper-lockfile；直接使用根入口的保管工厂不启动 Cordis，但安装闭包仍含它们。

## 契约

[行为规格](SPEC.md)拥有保管库文件、文件锁、发布确认、刷新、关闭与插件生命周期的行为。引用、结果和端口的形状归 model-contract。公开入口的导航见[公开接口](docs/public-api.md)。

## 设计

磁盘记录的编码在 [records.ts](src/records.ts)，保管库与文件系统交互在 [store.ts](src/store.ts)，插件在 [cordis.ts](src/cordis.ts)，注入发送在 [deliver-injected.ts](src/deliver-injected.ts)。保管状态的类型（`CustodianState`、`Binding`、`BindingLife`）来自 model。判定不在本成员：保管库把当前状态快照交给 model 的判定函数。模块、机制与理由见[内部架构](docs/architecture.md)。

## 配置与运行

保管库路径与工厂秘密是仅有的配置，由应用提供。文件锁不按时间过期，持锁进程崩溃后须在所有写者停止后手工删除 `${path}.lock`。保管库从磁盘记录经 legal-identity 重新铸造租户值，租户相等只在同一 legal-identity 实例内成立，因此调用方与保管库须在同一进程内共享该实例。

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

测试覆盖五种解析结果、租户隔离、轮换与撤销、文件损坏、关闭、跨进程更新与保存确认未知，并用真实 Cordis 4.0.4 核对插件发布与撤除。它们不证明其他宿主能力，也不证明跨机器或网络文件系统上的锁语义。

## 维护

修改保管库行为、记录格式或插件入口时，同步[文档登记](documentation.json)、model 的判定状态形状、model-cordis-contract 的服务定义消费、组页与本包测试。未实现的宿主能力保持实际状态，不在文档里预先承诺。

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
