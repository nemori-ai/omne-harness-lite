# D-098：输入限制提供者的分段技术采用

2026-09-28，主调度在用户持续实施及技术验收授权内，采用下列已完成独立评审的节点。实际范围以 [acceptance.json](acceptance.json) 的精确路径和摘要为准；尚未列入的候选不随同采用。

## core/model-profile v4

契约来源为 [D-097](../model-profile-v4-limit-contract-adoption/decision.md)接受的 MP4；技术方向沿[既有模型适配提案](../../proposals/model-request-adaptation/design.md)及 D-071 纯值采用方式。采用 [v4-design](../../../realization/packages/core/model-profile/v4-design.md)：root/schema 升级 MP4，保留显式 v3 与既有 v2 入口；精确数值、三态事实、十四项 Schema 定义、M15/M16 次序和完整快照形状按文落实。

独立 architecture-reviewer 核对 `51dd8ad98fc4e933e18d3cc630ca68a610efc7922e9cb7f7e6e537fd642133bc` 后无阻断或非阻断残留。其分段依据是 MP4 仅正向依赖 IV1/OE1/CB2；runtime、目录等是消费者，不构成纯值包的反向前置。所保留的硬前提是同次集成将尚未采用 MP4 的消费者明确固定到 v3，特别是旧 model-response Schema；不隐式升级，不按缺字段猜版，不补旧 cap。独立评审为只读，未执行产品测试。

本纯包不取得资源，不新增 Cordis 服务、时钟、存储、克隆服务或默认限额。目录更新时间、实际输入计量、快照写入和历史认回仍由其原 owner 承担。实施范围包含包双语 README、独立制品和 v4/旧版 Schema 不串版检查；实际实现与验证尚待交付。

## 取代范围与未采用部分

本次只使选用 MP4 的纯值 root 具备可施工映射，不原地修改 D-071 采用的 v3 文件，不改变仍显式消费 v3/v2 的契约。目录 v4、传输 v7 及其余数据/runtime/runner 增量保持各自评审和采用边界；不以本决定放行未知 token 算法、37 份定义或完整 service。
