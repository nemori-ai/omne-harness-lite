公开入口提供声明校验、纯求值、变更决定及查询/命令应用服务。持久化和实际目标策略由独立成员 settings-local 与 assets-local 提供。导出条件 `source` 指向本包源码。发布时去掉它。

# settings

## 职责与状态

本成员提供不依赖 Assets、Cordis 或数据库的设置核心。声明以 JSON Schema 描述合法值，Zod 校验协议，Ajv 校验取值。目标资格与当前提交由注入端口提供，应用服务不自行授予权限。完整产品的剩余采用边界、原有效能力与阶段承诺沿[产品正文](../../../.meta_harness/design/product/assets-and-rules/design.md)判断。

## 使用与集成

独立消费从 [SPEC](SPEC.md)读取行为，从 [公开入口](src/index.ts)读取精确类型。`defineSettings` 校验声明，`evaluateSettings` 处理已合法化的有序来源，`decideSettingsChange` 产生纯变更决定。`createSettingsQueries` 与 `createSettingsCommands` 消费注入端口；提供者必须兑现一致读取、当前资格及原子提交，空实现不构成真实集成。Cordis 装配沿[IC 约定](../../../docs/architecture/cordis-integration-conventions.md)，运行对象不进入业务 DTO。公开入口还定义秘密保管的两个窄端口 `SecretCustodyManagement`、`SecretCustodyUse`，以及把外部文本解析成 `SecretText` 的唯一边界 `parseSecretText`（[SPEC 秘密设置项](SPEC.md#secret-items)）；文件提供者在 [settings-local 的 `./secrets`](../settings-local/README.md#secret-custody)。

准备式提交的类型与Schema归 `SettingsPreparationPort`，行为见[准备协议](docs/protocol.md#准备提交与根操作结果)。现行本地提供者和命令工厂仍待切换，不能把这个接口当作已运行的持久服务。

## 契约与设计

[SPEC](SPEC.md)维护非类型行为，[内部设计](docs/internals.md)维护机制与未完成义务；[组合模型](../docs/settings-composition.md)维护独立使用与资产组合的 DDD/OOP 和数学分解。[组入口](../README.md)维护依赖及协作。精确类型归公开源码。

## 配置与运行

核心无环境变量或默认持久层。部署参数、身份协调和关闭顺序见 [本地提供者](../settings-local/README.md)。核心可独立用于纯计算，托管命令必须注入满足契约的提供者。

## 验证与维护

运行 `pnpm --filter @omne-harness/settings test:fast` 验证纯核心及应用端口行为。`build` 与 `typecheck` 检查公开实现和测试类型。测试不证明实际托管提供者或完整系统联调。
[验证资源](verification/README.md)维护有限模型与负控，其前提与源码符合性分别判断。成员维护者同步公开形状、行为、消费者与验证，组维护者同步跨成员协作。
