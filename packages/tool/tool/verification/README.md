# tool 持续验证资源

[Invoke 恢复模型](models/README.md)维护来源唯一关联、丢答重入及有限进展的判据、假设、源码映射与运行命令。[公开组合测试](../tests/invoke-recovery.spec.ts)运行真实 runtime、配对来源和非耐久 ledger，另验证权限、唤醒恢复与一次启动。控制 commands/reads 使用共享操作记录的替身，只验证门面。

公共验证义务归契约包的 [verification](../../tool-contract/verification/index.md)。当前没有生产存储、跨进程或断电验证，完整控制、真实环境自动释放与完整异常源恢复仍未实现。单次运行和评审证据归任务 tmp，不据模型通过授予最终接受。

契约范围见 [SPEC](../SPEC.md)，导航见 [index](index.md)。

[事实保管测试](../tests/facts-receive.spec.ts) 在真实 createToolLedger、原调用事务与非耐久内存 store 上验证 process/final 的同提交、原回执认回、cursor 连续性、来源换版、process 历史和未知提交重投。原 final 的重建读取不依赖源继续提供原批次。自动读取由下述组合另验。

[来源确认测试](../tests/fact-acknowledgement.spec.ts) 使用真实启动的契约内存执行源、ledger 与配对恢复绑定，验证完整 evidence 核验、ACK 丢答、applied/dropped/delayed unknown、同提交清责任、输入突变、跨租户、历史 operation progress 和 P01 排除。源的受限 acknowledge 可在原 live 路由不再可用时继续核验。该组合仍是单进程、非耐久，不能单独证明自动续读或生产恢复。

[自动读取组合](../tests/driver-facts.spec.ts) 验证 invoke 到源 ACK 的完整本地链，明确区分取消发起前和命令在途。清理竞争使用可控 return，反向核对不并开 reader、不丢新 run。有限资源画像记录批数、elapsed、最大在途 next、reader 和宿主监听终态。该单进程测试源与宿主均非生产提供者。

[事实交接模型](models/README.md#事实保管交接模型) 检查保管先于源释放、原 receipt 和确认责任留存、重复与冲突以及提交未知。它不形式化 reader、公平性或生产耐久。单次运行输出、版本与 hash 仍归任务 tmp。

[收场账本](../tests/ledger-settlement.spec.ts)、[环境释放账本](../tests/ledger-environment-release.spec.ts)、[排除交错](../tests/exclusion-interleavings.spec.ts)和 [driver 收场组合](../tests/driver-settlement.spec.ts)覆盖独立保管、三域未知、原结果单赢家、canonical 清理计划、原环境核验、ACK 离线、异常 late process、持久 blocked facts 与成功后 queue 任务复核。driver 组合使用真实 runtime、内存 ledger/custody/executor 与受控宿主；原作者执行计数、原任务和下一同 slot 调用分别观察。宿主真实构造接线由 tool-host-local 的 start-composition 测试覆盖，不代表生产环境释放或生产宿主完整交付。

[SettlementRelease 模型](models/README.md#原结果与队列释放模型)分别检查 custody、call、queue 的已应用未知和未应用未知、结果单赢家、queue duty 与墓碑。两个负控分别放宽保管确认及 queue 责任屏障，要求命中指定不变量。有限安全性不代替真实实现符合性、进展或最终接受。
