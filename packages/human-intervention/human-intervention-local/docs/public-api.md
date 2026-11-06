# 公开接口导航

## 导出入口

根入口由 [src/index.ts](../src/index.ts)导出，仅面向可信装配者。无 Cordis 子路径。消费方提供共享 SqlStorage 及已登记组合，不从此入口取得身份资格。

## 定义索引

- [createIndependentHitlApplication](../src/application.ts)：独立等待的完整公共命令、查询与恢复方法。
- [hitlCommandBinding 与 recoveryCommandBinding](../src/command-binding.ts)：计算原操作查询依据，不提供权限。
- [createIndependentHitlQueries](../src/queries.ts)：独立等待的当前资格请求/卡片查询与签名池分页。完整支持范围见[SPEC](../SPEC.md#独立等待的查询与分页)。
- [createIdentityQualifiedHitl](../src/identity.ts)：核验当前成员资格，协调具名写入、结果披露与关闭排空；不是完整用户应用服务。
- [createHitlStandingDestination](../src/identity-destination.ts)：供 Identity 可信装配封口目的操作。
- [hitlSqlMaterials](../src/materials.ts)：返回 SQL participant、migration 与 snapshot reader 的具名材料。
- [independentWaitSqlMaterials](../src/independent-materials.ts)：登记独立等待控制、收件箱与读口。
- [independentControlCommands 与 independentRequestCommands](../src/commands.ts)：生成具名参与者命令，所有事实依赖均进入同一事务。
- [createHitlSqlOperations](../src/operations.ts)：认回原方法与完整结果，封口后排除迟到提交。
- [createHitlSqlTerminals](../src/terminals.ts)：固定 tenant domain，提供原操作 inspect 与 seal；不管理 SqlStorage 生命周期。
- [HitlSqlBindingSchema](../src/terminal-schema.ts)：原操作与输入摘要的严格 JSON 绑定；同文件拥有终态类型和 operation-open 事实定义。

非类型语义见[原操作身份](../SPEC.md#原操作身份)和[终态与封口](../SPEC.md#终态与封口)。完整接口由 human-intervention 合同定义；独立等待的应用工厂已实现这些方法，其他来源适配及人类登录仍由相应拥有者接入。
