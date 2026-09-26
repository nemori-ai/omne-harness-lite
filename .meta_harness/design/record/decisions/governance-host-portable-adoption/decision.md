# D-052 · 治理中心可搬运归档与共同开发工具

2026-09-25，主线沿用户完整治理闭环实施授权，在[单机分发候选A](../../proposals/governance-production-mechanisms/single-host-delivery.md)与[独立评审](../../proposals/governance-production-mechanisms/review.md)基础上，采用[宿主节点packaging](../../../realization/apps/tenancy-host/packaging.md)，采用时SHA256 `23eebc55495f089395d53f75c97144041da3ec5929170b5e241a9a1859685676`。只接受实施；实际制品与故障路径待验。

采用范围：复用pnpm生产闭包并在新路径独占发布宿主归档；把D050共有算法移入tools/artifact-builder，经开发依赖和公开入口供两个应用薄适配使用。工具公共运行入口为固定Node24可去类型执行的src，避免首次调用先依赖dist的自举循环；类型声明由workspace构建。源码/锁/dist稳定前提与原D050发布后失败边界保留。新增宿主纯--version拥有文件和输出失败，BUILD_ID与EC2/HT2中的HOST_VERSION不同。

限定取代D050的算法物理归属与CLI工具内部委托方式，保留scripts/package-cli.sh形状、CLI归档清单格式、既有失败语义及领域契约；不修改冻结CQ1/CQ2或其他契约。开发工具不能进入生产制品。共享修改必须两端回归；未出现任意执行钩子或插件框架需求，不为此预建。

依据包括独立架构无阻断、施工调度无阻断，以及[仓库外宿主闭包原型](../../../../research/governance-recovery-providers/reports/2026-09-25-single-host-delivery/README.md)。已有原型不能替代新算法迁移后的两制品验证。两个实际消费者足以支撑有限工具边界，未把目录视作运行时能力。

首次无dist的打包、两端故障测试、制品清单与额外成员、宿主version纯路径、实际Linux容器keygen/serve和Mac互联必须执行；宿主与客户端平台矩阵分别报告。中心服务管理、每日备份、隔离恢复及安全再开放不在本次接受，完整生产目标仍未完成。没有上传、全局安装或真实生产部署授权扩大。
