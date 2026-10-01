# D-073 当前输入读取链契约采用

2026-09-27。依用户“Implement the plan.”委托、[读取链提案](../../proposals/model-request-adaptation/read-projection.md)及[独立表达复审](../../proposals/model-request-adaptation/review.md#2026-09-27-当前读取链五包表达复审)，技术接受 capability.asset-evaluation/v4、capability.assembly-manifest/v3、capability.asset-registry/v3、data.loop-extension/v4。精确资源、范围和设计哈希见 acceptance.json。

根正文由实际所选版本提供，根属性沿已有层序计算；成功结果读取是五类 DTO 的纯值检查，不证明输入真实、原声明正确或权限有效。历史清单固定 head 及会话后读取，不让旧表 reuse 回退最新 E；合法固定根与真实 current holding 的 C16 失配是依赖 unavailable，不得修造来源或提交新报告。LC4 保留模型失败主体的完整绑定。

同时采用 core/asset-evaluation/v4 的纯实现投影：共用第一步选择、受限根声明计算及公共结果判定，复用既有无损值和属性算法。不创建外部读服务。独立架构复审无阻断；默认 BodyContracts 仍沿既有非 Connector 范围及明确旧版正文依赖。

本事件不采用其他读取提供者，不接受 runtime3/runner3，不补产品初值、共享/workspace/MCP 或完整会话创建。真实 IO、源真实性、当前资格、形式模型与实际符合性各保留范围和证据，未作为无条件证明；人的总体签收尚未发生。
