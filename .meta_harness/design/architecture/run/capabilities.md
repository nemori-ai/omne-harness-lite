# 能力边界

Run 拥有一次工作的 basis、Step、epoch、等待登记簿、控制及终态。工具、人类请求和模型执行仍由各自能力拥有；Run 只保存稳定引用、接续和控制关系。

## Cordis 投影

Run 插件提供状态折叠、控制、epoch 与等待登记；驱动器只持有当前 claim，不成为 Run 状态 owner。
所有 Run 转移由 Run owner 无副作用 prepare；跨 owner 协调者只合并 opaque facts/guard，CC submit 时
owner 重核 aggregate revision、latestIssuedEpoch、openEpoch 与 operation。Session、Tools、Driver 不写 `run.*`。
具体三候选与未接受状态见[Run 转移归属提案](../../proposals/run-transition-ownership/README.md)。

Context、服务引用或 AgentRef 只提供定位，不构成授权、执行权或耐久事实。每次使用仍核对
tenant、精确代次、当前资格与撤销屏障；运行插件缺席不得删除其长期 owner 的责任。
