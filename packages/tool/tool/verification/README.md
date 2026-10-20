# tool 持续验证资源

[Invoke 恢复模型](models/README.md)维护来源唯一关联、丢答重入及有限进展的判据、假设、源码映射与运行命令。[公开组合测试](../tests/invoke-recovery.spec.ts)运行真实 runtime、配对来源和非耐久 ledger，另验证权限、唤醒恢复与一次启动。控制 commands/reads 使用共享操作记录的替身，只验证门面。

公共验证义务归契约包的 [verification](../../tool-contract/verification/index.md)。当前没有生产存储、跨进程或断电验证，完整控制与执行终局仍未实现。单次运行和评审证据归任务 tmp，不据模型通过授予最终接受。

契约范围见 [SPEC](../SPEC.md)，导航见 [index](index.md)。

[事实保管测试](../tests/facts-receive.spec.ts) 在真实 createToolLedger、原调用事务与非耐久内存 store 上验证 process/final 的同提交、原回执认回、cursor 连续性、来源换版、process 历史和未知提交重投。原 final 的重建读取不依赖源继续提供原批次。runtime 自动读取尚未交付。

[来源确认测试](../tests/fact-acknowledgement.spec.ts) 使用真实启动的契约内存执行源、ledger 与配对恢复绑定，验证完整 evidence 核验、ACK 丢答、applied/dropped/delayed unknown、同提交清责任、输入突变、跨租户、历史 operation progress 和 P01 排除。源的受限 acknowledge 可在原 live 路由不再可用时继续核验。该组合仍是单进程、非耐久，不能证明自动续读或生产恢复。
