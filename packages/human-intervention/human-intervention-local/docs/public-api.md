# 公开接口导航

## 导出入口

根入口由 [src/index.ts](../src/index.ts)导出，仅面向可信装配者。无 Cordis 子路径。消费方提供共享 SqlStorage 及已登记组合，不从此入口取得身份资格。

## 定义索引

- [hitlSqlMaterials](../src/materials.ts)：返回 SQL participant、migration 与 snapshot reader 的具名材料。
- [independentWaitSqlMaterials](../src/independent-materials.ts)：登记独立等待控制、收件箱与读口。
- [independentControlCommands 与 independentRequestCommands](../src/commands.ts)：生成具名参与者命令，所有事实依赖均进入同一事务。
- [createHitlSqlOperations](../src/operations.ts)：认回原方法与完整结果，封口后排除迟到提交。
- [createHitlSqlTerminals](../src/terminals.ts)：固定 tenant domain，提供原操作 inspect 与 seal；不管理 SqlStorage 生命周期。
- [HitlSqlBindingSchema](../src/terminal-schema.ts)：原操作与输入摘要的严格 JSON 绑定；同文件拥有终态类型和 operation-open 事实定义。

非类型语义见[原操作身份](../SPEC.md#原操作身份)和[终态与封口](../SPEC.md#终态与封口)。完整用户命令/查询仍由 human-intervention 合同定义，此成员尚未实现该服务工厂。
