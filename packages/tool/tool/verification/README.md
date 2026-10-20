# tool 持续验证资源

[Invoke 恢复模型](models/README.md)维护来源唯一关联、丢答重入及有限进展的判据、假设、源码映射与运行命令。[公开组合测试](../tests/invoke-recovery.spec.ts)运行真实 runtime、配对来源和非耐久 ledger，另验证权限、唤醒恢复与一次启动。控制 commands/reads 使用共享操作记录的替身，只验证门面。

公共验证义务归契约包的 [verification](../../tool-contract/verification/index.md)。当前没有生产存储、跨进程或断电验证，完整控制与执行终局仍未实现。单次运行和评审证据归任务 tmp，不据模型通过授予最终接受。

契约范围见 [SPEC](../SPEC.md)，导航见 [index](index.md)。
