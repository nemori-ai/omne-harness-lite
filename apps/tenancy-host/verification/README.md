# 治理宿主的组合验证义务

[整体契约](../SPEC.md)拥有真实装配、升级、开放、维护和收场责任。这里组织持续验证输入，单次结果归任务tmp。

| 边界 | 实际入口 | 必须保留的观察 |
| --- | --- | --- |
| 两层树与安全静态准备 | [plugin-options](../tests/plugin-options.spec.ts)、[树验证](../../../packages/core/cordis-plugin-tree/verification/README.md) | 坏JSON、module、export、配置或声明零apply；职责禁用或helper替代拒绝，停用后等价角色插入允许；打印零数据副作用且秘密诱饵不泄 |
| 真实代际与双面 | [managed-lifecycle](../tests/managed-lifecycle.spec.ts)、[lifecycle](../tests/lifecycle.spec.ts) | setup及close失败分别保留；先确认再开闸；监听撤除后同步阻新准入；在途scrypt、注册晚返及业务后半程完成先于依赖关闭 |
| 升级与恢复 | [upgrade](../tests/upgrade.spec.ts)、[维护启动](../tests/maintenance-startup.spec.ts)、[SQL验证](../../../packages/infra/storage-sql/verification/README.md) | 确认前失败可恢复与确认后不可回滚分开；同一真实guard及StorageUnit身份；原确认与恢复断言不得因迁移放宽，有限观察不是系统通用RTO |
| 实际网络与进程 | [e2e](../tests/e2e/README.md)、[probes](../tests/probes/README.md)、[process](../tests/process.spec.ts) | SQLite、TLS、Unix、CLI及维护真实组合；固定字节、跨租户和结果真实性不以mock替代 |
| 生命周期控制 | [应用tests](../tests/managed-lifecycle.spec.ts)、[装配协议](../../../packages/core/assembly-lifecycle/verification/README.md) | 同tick双load仅首个；句柄先于apply；ready失败而closed pending；部分前缀、重入、双清理失败及30秒still-stopping，不把外部watchdog超时判完成 |
| PostgreSQL未闭范围 | [PG测试](../tests/pg.spec.ts)和[SQL限制](../../../packages/infra/storage-sql/SPEC.md#验证与范围) | 独立协议或测试存在不表示迁移后宿主整体恢复闭合，不开放成已支持升级路径 |

源码、声明、运行和独立安装制品须分别核公开根闭包及Schema输入。业务、迁移、Schema身份和模型输入从其唯一拥有者读取，不从当前encoder或实现生成期望值取代规范例子。

原身份、治理、注册、客户端及CLI模型保持各自有限前提和负控。原顺序破坏或直接effect.close负控须在具名提前释放性质失败；工具缺失、解析失败或超时不算有效反例。有限模型不证明任意真实IO终止、所有平台、物理断电或完整Session恢复。

## 目标连续性与当前固定代

[当前整代停止](../README.md#当前装配限制与架构偏离)是待处理的装配偏离。既有退出测试继续验证真实收场、失败保留和依赖不早释；它们不能把无关能力随局部变化退出判为目标符合。装配与机制拥有者须追加真实消费者范围、可选依赖换代、候选失败与在途交接的组合验证。此次文档修订未运行这些产品场景。
