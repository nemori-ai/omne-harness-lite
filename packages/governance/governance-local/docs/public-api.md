# 公开接口导航

## 导出入口

根入口导出固定SQL材料、普通应用服务工厂与Identity目的解析器，定义见[index.ts](../src/index.ts)。createGovernanceLocal只在启动恢复完成后交回贡献服务与关闭接口。SQL、Identity、声明来源与当前事实是受信装配输入。

./cordis导出createGovernanceLocalPlugin与配置，定义见[cordis.ts](../src/cordis.ts)。它继承governance-contract唯一的服务定义。调用方fiber只承担自身贡献清理，内部清理权柄不从公共根入口导出。

## 定义索引

迁移材料遵循sql-contract的SqlMaterialCatalog。业务类型归[governance-contract](../../governance-contract/docs/public-api.md)。调用方及提供者关闭见[Cordis集成](cordis.md)，持久行为与限制见[SPEC](../SPEC.md)。

## 采用集合引用

根入口还导出createGovernanceCollection。调用方用已知的scope、声明修订、完整贡献引用、DefinitionRef和选定目标构造collection。它只计算稳定引用，不证明集合完整、当前或已获授权。提供者仍从当前候选重算，并拒绝漏项、重复和过期依据。

## Transaction-local target observation

The root exports `governanceTargetProjectionCommand`, its binding/result schemas and fact identifier. Register the participant from `governanceSqlMaterials` together with the real Governance table owner. This is a trusted SQL composition interface, not another caller-authorized application service. Management and runtime conditions, unavailable results and observation limits are defined in [GL-24](../SPEC.md#gl-24-transaction-local-target-projection).


## 当前权限依据

本成员不提供当前权限读取。权限依据由应用装配在一次投影读里算出，行为见应用的[权限解释](../../../../apps/harness-server/docs/rows/permission-interpretation.md)。本成员为它提供 `governance.target-projection` 与 `governance.selected-definition-projection` 两个只读投影参加者。

`readCatalog` 经 `GovernanceLocalOptions.projection` 读取。`GovernanceProjectionRead.read(commands)` 在一个快照里执行只读命令并返回最后一条命令的答复；它由装配提供，定义见 [catalog.ts](../src/catalog.ts)，行为归 SPEC 的目录一节。

## 不依赖 Settings 目标的当前声明

`governanceDefinitionProjectionCommand` 生成只读 SQL 参加命令。输入与输出类型分别为 `GovernanceDefinitionBinding`、`GovernanceDefinitionProjection`，精确字段归 [definition-projection.ts](../src/definition-projection.ts)。固定材料提供 `governance.definition-projection` 参加者及同名事实。装配的组合仍须声明 Governance 表的拥有者。

该读取接受完整 scope、epoch、principalRef、captureId、transactionDomain 和 definition，不接受 target 或 mode。返回完整当前注册声明及相关修订，或明确的 scope、definition、limit 不可用原因。它没有将声明采用到 runtime，也没有读取 Settings 配值。没有 Settings 投影的权限项可直接消费此事实。

事实绑定字段不是身份凭证。调用必须来自受信 SQL 装配，消费方须核对原请求的完整绑定。后续动作仍需真实发布、适用约束和准入依据。当前注册、原发布、实际持有和执行器存活是不同事实，不能互相替代。

原 `governanceTargetProjectionCommand` 保留公开形状和 management/runtime 行为。它与独立声明读取共用同一条有界声明查询，runtime 继续检查当前 selected target。行为与验证边界归 [GL-31](../SPEC.md#gl-31-当前注册声明与-settings-目标分离)。
