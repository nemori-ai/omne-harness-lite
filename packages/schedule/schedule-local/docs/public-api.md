# 公开入口

根入口提供独立计算worker和管理SQL后端。类型与方法唯一形状源是[src/index.ts](../src/index.ts)及其公开导出。`./cordis`已登记，尚无绑定导出。

| 导出 | 使用与责任 |
| --- | --- |
| createScheduleCalculationWorker | 显式并发/排队配置，返回calculator及dispose；编译包后使用 |
| createScheduleManagementSqlBackend | 消费SqlStorage、固定scope、组合版本、材料摘要和具名guards，返回store/persistence |
| scheduleManagementSqlMaterials | 返回本域迁移、参加者及读取handler材料，由宿主登记 |
| scheduleManagementGuardBinding / scheduleManagementGuardRequirement | 生成完整本地守卫要求；不自行授予权限 |
| ScheduleManagementGuardRequirementSchema、ScheduleManagementGuardFactSchema、ScheduleManagementGuardRejectionSchema | 校验具名守卫输入、成功事实及结构化拒绝 |
| scheduleManagementTransactionDomain等协议常量 | 供材料组合及适配使用，见[materials](../src/storage/materials.ts) |

宿主持有SqlStorage生命周期并保证组合材料一致。工厂不自动登记迁移、创建数据库或提供外域守卫。守卫的成功response必须携带同一完整fact。权威查询或提交不明时按[SPEC](../SPEC.md)保留unknown。业务调用者通过schedule-contract的应用服务消费，不传SQL参加者。

未实现Job执行、扫描器、通知发送或生产跨域装配。完整目标继续归[业务设计](../../schedule/docs/public-api-design.md)。
