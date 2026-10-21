# Agent 通用实现的行为边界

根入口导出 `createAgentRuntime`、通用评估器 `agentEvaluator`、它写入的 checkpoint 的 schema 采用 `agentCheckpointSchema` 与构造类型。根入口另导出 agentProcessedResultSchema、readProcessedModelMaterial 与 ProcessedModelIdentity，供本实现及 Model 消费者 owner 的受信证据适配器解释已存 processed facts；读取器只判断 schema 与原关联，不独自证明 Journal 绑定或当前资格。工厂的设计已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受。工厂的创建校验、四个面的访问守卫与 `invoke` 的 Loop 正常路径骨架已实现，I0 输入批与 I1 请求准备、不可用读取的 W0 保存、真实 cannot-fit 的 F1 出口已实现。F1 新建候选从注入的 AgentClock.now 取时；失败保留原准备与续点，不写候选；同一已形成候选重试不再次取时。I2/M0 的固定主调用与意图提交、M6 原调用认回、M1 真实收场、M3 processed 结果处理及 M4/M5 直通已实现。首内容前最终失败且无有效回复经 I3 形成 no-reply 候选。I3 的接纳事实、message 事件与 Q4 接续同 revision 提交。I4 提交真实空动作批，I8 重读最新事实后选择新 step、一次等待保存或 F1 候选，部分内容不直接决定完成。其他操作本体及剩余 Loop 节点的精确语义与失败分支尚未实现，实际支持范围见[成员 README](README_ZH.md#支持范围)。运行契约的接受范围以 [公共 SPEC](../agent-contract/SPEC.md) 为准。

## 兑现责任

实现须完整兑现公共操作与失败语义，不在此复制公共状态机或结果形状。配置与注入能力聚合由 [构造入口](docs/public-api.md) 拥有，机制及尚缺设计见 [内部架构](docs/architecture/README.md)。

## 资源与替换

通过显式依赖取得外部能力，不导入 Cordis 或固定本地提供者。业务身份作为操作输入，不以 Context 或插件配置替代。替换和退出保留未完成责任，不能把依赖丢失或 disposer 完成报告成业务成功。

## 验证

当前测试核对构造、访问守卫、正常路径、输入承接、请求准备、主调用接缝、回复准入、空动作批、I8 三种去向、原操作认回与一次等待保存。测试使用脚本化 Model 与非耐久内存 Journal，不证明真实提供者或完整恢复。needs-compaction 按 #513 revision 2 保存原结果并返回 unsupported，压缩路径与相应 F1 结果留给 4.5。内部窄接续从同一内存 Journal 的已存 ready/step 或 PendingCall 重建固定帧，并从 results[].completion 读取处理后的材料，覆盖意图提交前后与 ACK 后至 I3 的必要切点，要求原 runtime、Access/Authority 与旧驱动已停；I2 尚须无未决 Journal 操作。它不是公开恢复或进程耐久。Agent stream 尚未交付。缺原产出 scope/format 的 reasoning_state、完整或未封 thinking 返回 unsupported，关闭 Read 后保留 Model 的原生产责任，关闭失败明确返回失败。精确范围与限制见成员 README 与 tests/README。

本实现的 M3 processed 路径局部依赖 AgentMaterials：先保存本包版本化 facts 中的已解释结果、原关联、settlement、部分内容、费用与后续 I3 责任，再以 recordResult 建立 Journal 完成绑定。两者均成立、真实材料可读且当前资格有效后才 ACK。只采用原材料回执，owner 不符时零 ACK；保存或绑定失败/未知时保留已有材料与 Model 责任。I3 从 Journal completion 解释结果；材料损坏或 schema 未知返回失败，不退化为空回复。本依赖属于本实现，不给所有 processed 实现增加公共义务。完整读取内容跨账目/保存失败保留；不完整 Read 先关闭再用同调用的新读取身份重领，closeRead 失败保留原 Read 重试。

producer 已提交到 M4 后的窄接续在 I3 认回真实原 ACK 确认。I3 核原 reference、收场版本、consumer、ACK 操作与原 completion，不重新受理、不重读正文、不重复 ACK。既有 O0 用稳定原 consumption 操作记录 confirmed release；写入未知先查询原操作，失败或 unknown 不静默成功。这只修复当前主调用 M4/M5/I3 切点，不接受后续 O0 整体责任交清。

I3 只准入完整普通结果。completed/limit 的合法全 sealed 内容可形成回复，原 settlement、parts 与真实 trims 保留在 processed 材料中，不合成提醒或 trim。含 partial 的结果不升级为完整消息。interrupted 按部分结果回 I8，原控制身份随材料保留，不改成上游故障。该消费出口不表示控制请求、阶段记录或公开恢复已交付。
