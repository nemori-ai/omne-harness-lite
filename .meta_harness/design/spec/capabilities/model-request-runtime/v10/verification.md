# RT10 验证义务（candidate）

## 变化的影响

2026-09-29：继承 D-104 RT9，消费 MR9 新事实，追加 S-77～S-83。十三服务操作及既有失败集合不变；按现有九项操作附加输入/输出/守卫/原批责任，不另立 metering service。新行为模型只覆盖本次校准，并列出既有 RT9/SL3 前提；不把原接受或模型复制当本批执行证据。

修订二：S-59 明确 reader 首次归一化并交出同次 observedInput，S-54 显式传递且禁止旁路重读；S-77/S-82 要求实际使用最新可用因果祖先，新增三轮稳定重锚正配置及 NeverUseAnchor/KeepOldAnchor 负控。新适配缺口使用 G-37，避免覆盖原 LC6 G-35。运行记录与实施进度由版本外证据拥有。

## 必需证据

| 性质 | 证据落点 | 证据边界 |
|---|---|---|
| stable P/basis 增量；两类失效全量 | formal UsageCalibration 的 AnchorSource/PrefixGuard/BasisGuard；有控 meter 必须可观测未 tokenize P | 须实际实施验收 |
| 正确 φ/δ、误差不累计、精度不升级、O 不双加 | ErrorReset/NoDoubleOutput/PrecisionHonest、README 条件归纳、真实 tokenizer 对照 | 须实际适配证据 |
| accurate/bound 条件窗口、estimated 不保证 | ExactOrBound/UpperBound；EstimatedWindow 预期反例 | 不把有限 oracle 换成真实上游保证 |
| 必需事实同原 response/reply 批；unknown 不提前发布、原值恢复 | SameBatch/OriginalBatch/AppendOnly/NoEarlyPublish 与逐负控；真实追加失去回执故障注入 | 须实际存储验收 |
| 发送等于 plan、绑定更换不覆盖进行中调用 | PlanSendSame/LeaseHeld；实际 send 字节和租约释放验收 | 须实际实施验收 |
| 租户/日志来源授权、actual branch ancestry | 模型在一个已授权域内检 branch；跨租户同 seq/越权需真实 service 测试 | 须真实 service 验收 |
| 无隐藏 log IO、公开函数独立使用 | 独立包消费者及 IO 监视；TLA 不声称覆盖 | 须实际实施验收 |
| 百万 token 性能 | 分别量最终序列化、来源核验、新增 meter、完整调用；与研究中的全量 baseline 比较 | 分别保留基线与新增路径测量，无预设未经采用阈值 |
| 原未变义务 | 继承 v9 模型/验证义务与提供者场景 | 旧证据仅旧输入范围，变动影响须另行验证 |

## 形式配置与结果责任

formal/README.md 逐配置列前提/断言/负控；formal-tasks 只登记正向配置。实际输出归本批版本外 evidence。负控只有预定 invariant 被违反才算有效，parser/定义域异常与 timeout 不算反例。有限 TLC 无反例不是无条件证明。

response/reply 须分别表达并检查 SameBatch，使用 PartialBatch 负控；不得把同批目标隐藏在不可分割值中。重锚进展须检查准确提交后实际使用最新可用观察，并以 NeverUseAnchor 与 KeepOldAnchor 验证性质可失败；EventuallyDone 不能代替该性质。

## 已知缺口与报给主线

G-37：各实际绑定 φ/δ/compatibility 与上游 observation 证据，owner 适配/计量提供者；G-36：compaction 硬 fit 与 estimated 取舍，owner 产品/上下文主线。本版不实现 compaction、完整 Session/Run/Agent Loop、store 或内核。

需要独立架构/规格审查、主线明确接受及 realization 投影后才能实现；本作者不接受、也不以本地形式结果认证产品。规格状态以 registry 的候选条目为准。
