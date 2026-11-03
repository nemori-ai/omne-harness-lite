# 公开入口

根入口提供独立计算worker、管理SQL后端及本地应用组合。类型与方法唯一形状源是[src/index.ts](../src/index.ts)及其公开导出。`./cordis`提供[注入插件](cordis.md)。

| 导出 | 使用与责任 |
| --- | --- |
| createScheduleCalculationWorker | 显式并发/排队配置，返回calculator及dispose；编译包后使用 |
| createScheduleLocalApplication | 组合真实worker、SQL后端、管理、预测和查询，返回commands/queries/close；输入形状归[application.ts](../src/application.ts) |
| createScheduleManagementSqlBackend | 消费SqlStorage、固定scope、组合版本、材料摘要和具名guards，返回store/persistence |
| scheduleManagementSqlMaterials | 返回本域迁移、参加者及读取handler材料，由宿主登记 |
| scheduleManagementGuardBinding / scheduleManagementGuardRequirement | 生成完整本地守卫要求；不自行授予权限 |
| ScheduleManagementGuardRequirementSchema、ScheduleManagementGuardFactSchema、ScheduleManagementGuardRejectionSchema | 校验具名守卫输入、成功事实及结构化拒绝 |
| scheduleManagementTransactionDomain等协议常量 | 供材料组合及适配使用，见[materials](../src/storage/materials.ts) |

宿主持有SqlStorage生命周期并保证组合材料一致。工厂不自动登记迁移、创建数据库或提供外域守卫。守卫的成功response必须携带同一完整fact。权威查询或提交不明时按[SPEC](../SPEC.md)保留unknown。业务调用者通过schedule-contract的应用服务消费，不传SQL参加者。

未实现Job执行、扫描器、通知发送或生产跨域装配。完整目标继续归[业务设计](../../schedule/docs/public-api-design.md)。

本地应用拥有worker，借用SqlStorage。管理与查询共享wall clock，预测与查询共享单调clock。close同步关闭新准入，等待所有已接纳调用及worker退出；重复调用返回同一Promise。独立使用worker工厂的宿主仍自行等待dispose。
