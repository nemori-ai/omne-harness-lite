# 治理中心 Docker 部署

将已交付的单机治理中心装入 Docker，保持维护资源真实收场、同机备份与隔离恢复边界。持续消费者是 tenancy-host 的部署/分发提供者与维护者；失效事件是部署运行机制或停止/调度采用变化。

- 状态：A的R4原由[合并前本支 D-067](../../decisions/governance-docker-deployment-adoption/decision.md)采用，现由[D-070 Docker R4](../../decisions/core11-integration-coordination/decision.md#docker-r4)承接；R1/R2/R3保留历史。实施消费[tenancy-host Docker 映射](../../../realization/apps/tenancy-host/docker.md)及决定快照，不能用旧候选覆盖。机制探针已有有限结果，Docker产品实现与验收仍未完成。
- 输入：PF-017 rev5、PF-016 rev8；用户2026-09-26明确采用Docker内网部署；EC3 S55–59、HT3、D055/D056/D057、现行 tenancy-host 维护与分发映射。
- 范围：采用路径与提供者映射，不改领域能力、线上业务路由、登录规则或备份结果语义。
- [性质与候选映射](design.md) · [三个部署候选](alternatives.md) · [独立架构评审](review.md)

本主题按已有能力的提供者/装配演化展开，不新增领域对象或能力契约。过程排期、worker任务与未封存输出留工作区tmp/next-iteration。本次独立架构/spec与施工计划评审、有限机制证据已经处置；产品与整装验收另行记录。

2026-09-27 实施反推：[停止请求 R5 候选](stop-r5.md)重新比较一次正常停止请求的确认依据，尚未接受；不能用它覆盖D-070 承接的 R4，I2 的该接缝等待实验和独立评审。

同轮[实施表达补充](stop-r5-details.md)固定 TERM 配置、空 wait 结果及三处停止调用的取代范围；仍是候选，不提升实验和采用状态。

R5 的 stop-r5、stop-r5-details 和 docker-r5-reviewed 已受审文本保持原 hash；其中 D-067 均指 `7b755ac65f63208f0362288f5dad40318b109ec3` 下 `record/decisions/governance-docker-deployment-adoption/` 的合并前本支编号。当前读它的“取代 D-067”时，精确目标是 [D-070 的 Docker R4 承接范围](../../decisions/core11-integration-coordination/decision.md#docker-r4)，不是上游的格式化件 D-067。

2026-09-27 接续：[D-071](../../decisions/governance-docker-stop-adoption/decision.md)在限定机制实验与独立复核后接受R5。上面未接受句与R5原稿保留当时状态；当前实施读取节点R5及新快照，最终产品验收尚未完成。
