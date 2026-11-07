# 公开接口导航

## 导出入口

根入口导出固定SQL材料、普通应用服务工厂、Identity目的解析器与Settings来源目的解析器，定义见[index.ts](../src/index.ts)。createGovernanceLocal只在启动恢复完成后交回五个应用方法和关闭接口。SQL、Identity、声明来源与当前事实是受信装配输入。

./cordis导出createGovernanceLocalPlugin与配置，定义见[cordis.ts](../src/cordis.ts)。它继承governance-contract唯一的服务定义。调用方fiber只承担自身贡献清理，内部清理权柄不从公共根入口导出。

## 定义索引

迁移材料遵循sql-contract的SqlMaterialCatalog。业务类型归[governance-contract](../../governance-contract/docs/public-api.md)。调用方及提供者关闭见[Cordis集成](cordis.md)，持久行为与限制见[SPEC](../SPEC.md)。

## 采用集合引用

根入口还导出createGovernanceCollection。调用方用已知的scope、声明修订、完整贡献引用、DefinitionRef和选定目标构造collection。它只计算稳定引用，不证明集合完整、当前或已获授权。提供者仍从当前候选重算，并拒绝漏项、重复和过期依据。

## Transaction-local target observation

The root exports `governanceTargetProjectionCommand`, its binding/result schemas and fact identifier. Register the participant from `governanceSqlMaterials` together with the real Governance table owner. This is a trusted SQL composition interface, not another caller-authorized application service. Management and runtime conditions, unavailable results and observation limits are defined in [GL-24](../SPEC.md#gl-24-transaction-local-target-projection).


## Settings来源协调

createGovernanceLocalSourceDestination 只依赖固定storage、domain、metadata及sourceRoute，可在Settings服务之前构造。装配者把它接到对应Settings来源服务的目的路由，再把该服务的reserve/settle端口作为sourceReservations传给普通工厂。路由必须与原capture保存的路由一致。

sourceReservations是借用依赖。无来源责任的目录装配可以省略；存在历史来源责任时，缺少该依赖使启动恢复失败。关闭时任一来源责任未结算均返回pending，工厂不销毁借用服务。内部来源协调不是公开权限求值入口，实际PermissionCurrent应用接线仍未完成。
