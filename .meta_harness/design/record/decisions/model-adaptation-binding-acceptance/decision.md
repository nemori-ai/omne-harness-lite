# D-070 模型适配绑定首批技术接受

2026-09-27。依据用户对八家固定模型、公共实现加模型窄适配、提醒映射、可配置缓存与实际验证的确认，以及最后的明确实施指令“Implement the plan.”。主线在技术实施委托内接受已完成独立复审的规范增量；人的总体交付接受不在本决定内。

选择采用[适配提案 revision 2](../../proposals/model-request-adaptation/design.md)的公共传输/家族规则/模型窄定义方向。独立架构复审关闭AR1～3，独立规格复审关闭B1/N1/N2，范围及反方意见见[复审记录](../../proposals/model-request-adaptation/review.md)。

接受 data.model-profile/v3（S1～31）、data.messages/v4（S1～50）、data.model-response/v4（S1～38）、capability.model-profile-directory/v3（S1～35）。完整适配绑定、模型与路由相等、同档案历史配置修订不可改义、实际供应商原串及缓存单一usage权威均由精确规范承载。接受资源摘要见 acceptance.json。

原2/3资源与其消费者不自动升级；旧规范继续冻结。新消息/响应/目录消费者明确采用profile3。目录注册、目录采用、停止旧版准入分别提交，注册表可用性不由目录拥有；自建档案不自动跟随official。

本决定不接受仍在评审的 runtime3、根正文/求值/清单/注册表候选，不关闭中心据点协议或初选生产者缺口；不接受生产提供者设计或宣称源码已兑现。后续provider projection另经独立评审并精确采用。现有研究冷暖读与有限模型只支持记录前提，不能替代生产路径认证、取消、恢复或耐久提交。

登记元数据校正：初始acceptance.json遗漏机器所需scope_clauses，保留原件；[补齐范围的记录](acceptance-2.json)逐包显式列原已接受S1至末条，未改资源、坐标、权威或语义，catalog采用该记录。
