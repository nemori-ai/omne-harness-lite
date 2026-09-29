# RT10 验证义务（candidate）

## 变化的影响

2026-09-29：继承 D-104 RT9，消费 MR9 新事实，追加 S-77～S-83。十三服务操作及既有失败集合不变；按现有九项操作附加输入/输出/守卫/原批责任，不另立 metering service。新行为模型只覆盖本次校准，并列出既有 RT9/SL3 前提；不把原接受或模型复制当本批执行证据。

## 必需证据

| 性质 | 证据落点 | 实现验收状态 |
|---|---|---|
| stable P/basis 增量；两类失效全量 | formal UsageCalibration 的 AnchorSource/PrefixGuard/BasisGuard；有控 meter 必须可观测未 tokenize P | 实现未开始 |
| 正确 φ/δ、误差不累计、精度不升级、O 不双加 | ErrorReset/NoDoubleOutput/PrecisionHonest、README 条件归纳、真实 tokenizer 对照 | 真实适配证据未开始 |
| accurate/bound 条件窗口、estimated 不保证 | ExactOrBound/UpperBound；EstimatedWindow 预期反例 | 不把有限 oracle 换成真实上游保证 |
| 必需事实同原 response/reply 批；unknown 不提前发布、原值恢复 | SameBatch/OriginalBatch/AppendOnly/NoEarlyPublish 与逐负控；真实追加失去回执故障注入 | 真实存储验收未开始 |
| 发送等于 plan、绑定更换不覆盖进行中调用 | PlanSendSame/LeaseHeld；实际 send 字节和租约释放验收 | 实现未开始 |
| 租户/日志来源授权、actual branch ancestry | 模型在一个已授权域内检 branch；跨租户同 seq/越权需真实 service 测试 | 真实 service 验收未开始 |
| 无隐藏 log IO、公开函数独立使用 | 独立包消费者及 IO 监视；TLA 不声称覆盖 | 实现未开始 |
| 百万 token 性能 | 分别量最终序列化、来源核验、新增 meter、完整调用；与研究中的全量 baseline 比较 | 新增实现尚未开始；无预设未经采用阈值 |
| 原未变义务 | 继承 v9 模型/验证义务与提供者场景 | 旧证据仅旧输入范围，本批未全跑旧模型 |

## 形式配置与结果责任

formal/README.md 逐配置列前提/断言/负控；formal-tasks 只登记正向配置。实际输出归本批版本外 evidence。负控只有预定 invariant 被违反才算有效，parser/定义域异常与 timeout 不算反例。有限 TLC 无反例不是无条件证明。

本批模型初次三轮扩域发现 Tail(empty) 定义域错误；修订为序列非空时才删首项，空序列保持空。该修订不排除空输入或关闭性质；错误重现与修订后输出应同时保留在执行证据。response/reply 拆为两个序列并增 SameBatch/PartialBatch 负控，避免把待检查同批性质隐藏在一个值里。

## 已知缺口与报给主线

G-35：各实际绑定 φ/δ/compatibility 与上游 observation 证据，owner 适配/计量提供者；G-36：compaction 硬 fit 与 estimated 取舍，owner 产品/上下文主线。本版不实现 compaction、完整 Session/Run/Agent Loop、store 或内核。

需要独立架构/规格审查、主线明确接受及 realization 投影后才能实现；本作者不接受、也不以本地形式结果认证产品。当前 U1 产物未发布。
