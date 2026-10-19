# @omne-harness/model-host-local

[中文](README_ZH.md)

## Responsibility and status

本成员是 Model 的单机宿主提供者，目前只承载本地凭据保管：文件保管库（磁盘记录、文件锁、原子发布、关闭）和装载它的 Cordis 插件。其余宿主能力（时钟、实例调度、目录装载、托管运行插件）尚未实现，也不在本成员当前范围内承诺。凭据的公共值与端口归 [model-contract](../model-contract/README_ZH.md)，`modelCredential` 服务定义归 [model-cordis-contract](../model-cordis-contract/README_ZH.md)，存在性与解析的判定归 [model](../model/README_ZH.md)。设计、实现与运行验证分别判断。

## Usage

独立程序从根入口取得 `createLocalCustodian` 与 `openLocalCustodian`，不启动 Cordis。Cordis 宿主从 `./cordis` 装载 `LocalCredentialPlugin`，需要时用 `deliverInjected` 经静态注入发送。用法与示例见[使用与定位](docs/context.md)，初始化与释放责任见[Cordis 集成](docs/cordis.md)。选择本成员会安装 Cordis、model-cordis-contract 与 proper-lockfile；直接使用根入口的保管工厂不启动 Cordis，但安装闭包仍含它们。

## Contracts

[行为规格](SPEC.md)拥有保管库文件、文件锁、发布确认、刷新、关闭与插件生命周期的行为。引用、结果和端口的形状归 model-contract。公开入口的导航见[公开接口](docs/public-api.md)。

## Design

磁盘记录的编码在 [records.ts](src/records.ts)，保管库与文件系统交互在 [store.ts](src/store.ts)，插件在 [cordis.ts](src/cordis.ts)，注入发送在 [deliver-injected.ts](src/deliver-injected.ts)。保管状态的类型（`CustodianState`、`Binding`、`BindingLife`）来自 model。判定不在本成员：保管库把当前状态快照交给 model 的判定函数。模块、机制与理由见[内部架构](docs/architecture.md)。

## Configuration and operation

保管库路径与工厂秘密是仅有的配置，由应用提供。文件锁不按时间过期，持锁进程崩溃后须在所有写者停止后手工删除 `${path}.lock`。保管库从磁盘记录经 legal-identity 重新铸造租户值，租户相等只在同一 legal-identity 实例内成立，因此调用方与保管库须在同一进程内共享该实例。

## Verification

运行 `pnpm --filter @omne-harness/model-host-local typecheck`、`pnpm --filter @omne-harness/model-host-local test` 与 `make docs-check`。测试覆盖五种解析结果、租户隔离、轮换与撤销、文件损坏、关闭、跨进程更新与保存确认未知，并用真实 Cordis 4.0.4 核对插件发布与撤除。它们不证明其他宿主能力，也不证明跨机器或网络文件系统上的锁语义。

## Maintenance

修改保管库行为、记录格式或插件入口时，同步[文档登记](documentation.json)、model 的判定状态形状、model-cordis-contract 的服务定义消费、组页与本包测试。未实现的宿主能力保持实际状态，不在文档里预先承诺。

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the public types
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Modules, state and resource ownership, mechanisms
├── flows.md              Key business flows and data flows
├── object-model.md       Internal object model
├── public-api.md         Public boundary and definition index
├── context.md            Consumer use and position in the system
└── cordis.md             Cordis applicability and integration
src/                      Public definitions, validation, and implementation
tests/                    Continuous tests; fixtures/ holds test inputs
schema/                   External schemas
verification/             models/ and proofs/
adr/                      Implementation decisions with continuing consumers
examples/                 Examples against the public entry
resources/                Non-source runtime resources
acceptance/               Independent acceptance; fixtures/ holds its inputs
```

Each directory has README.md for its role and index.md for navigation. See [index.md](index.md) for reading paths. A docs topic can grow into a directory of the same name with README.md and index.md. Keep this map current when a topic moves.
