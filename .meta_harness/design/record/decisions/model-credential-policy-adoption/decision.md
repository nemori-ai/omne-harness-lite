# D-093：RT5 G-6 共享政策的限定技术采用

2026-09-27。主线依用户授权实施已确认模型请求纵线、按接受设计施工及主调度/验收职责，技术采用 [credential-policy 三候选](../../proposals/model-request-adaptation/credential-policy.md)的 B，并**部分采用** [v5-redaction-design rev2](../../../realization/packages/model/model-request-runtime/v5-redaction-design.md)，设计原SHA `843b6101c7ff4f50cf8f4bd755a2617688e935cb0fdb9843cba97b4b90b1c6c2`。RT5/MR5沿D-090，D-091的不透明网络资源和其它传输采用不变。

可实施范围是：本包公开纯构造器和S-60 redact；显式三参数配置的完整校验、复制/冻结；已知全值及不少于m的窗口匹配、两个有限描述扫描、原输入区间并集；纯text、敏感头剥除与键/有序值投影、上游raw/error JSON的键及所有scalar投影；幂等、不别名和受控错误。没有网络、存储、Cordis服务、隐藏配置或新领域状态。精确非秘密基线openrouter-redaction/1为m=8、原设计11个头名、sk-/bearer/basic三描述；不是算法默认，部署必须显式传入。通用值域与生产允许的加强变体严格按原设计区分。

作者rev1的boolean/null旁路被独立architecture-reviewer以合法短凭据反驳。rev2对数字/boolean/null统一按精确JSON token扫描，命中才整体变成标记字符串，未命中保留原类型/值；同一reviewer对上述SHA复评无剩余设计阻断，并限定可实施text/header/JSON范围。配置复杂度、极端输入、实际公共可达面及失败原文保护尚待源码和独立oracle，审阅无阻断不视为这些运行已过。

本次**不采用为完整可实施保证**的范围：raw.body保真字节/附件留存（R5R-G3）、runtime/transport所有出值路径与公共policy迁移（R5R-G2）、涉及必需事实的处理冲突（R5R-G4）。V=503与真实HTTP503的碰撞仍归契约owner，不自行收紧凭据准入、改变状态/身份/费用或宣称豁免；也不把完整ModelResponse交给通用redactor改值。完整S-20、PH-G2、生产rawHeaders/H出值、invoke→append/reopen链及37认证未放行。该限定采用不替代后续接线的精确provider投影与真实TLS验收。

新增绑定0，规范/Schema/registry契约版本不变。v5-redaction-design的candidate字样保留起草历史，当前可消费范围以本决定为准。人的总体交付接受未发生。
