# D-044 · 治理入口共同提交与新版传输

2026-09-25，主线按用户已授权治理CLI/TUI完整交付作技术采用。依据[机制提案与独立评审](../../proposals/governance-production-mechanisms/review.md)、D040/D042/D043、[入口提供者增量](../../../realization/packages/tenancy/governance-center-entry/v2-design.md)。

接受composition.governance-center-entry v2 S1～54及composition.governance-center-entry-https-json v2 S1～33的登记资源；采用entry v2-design及此构建唯一protocolVersion字符串`2`→HT2映射，不提供旧业务路由别名。health仍entry/v1#S18，固定133字节version-mismatch及公开体检字节保持。精确规范资源冻结在registry，不修改任何v1原件。

普通业务由显式StorageUnit贯穿认人、身份比较、授权、领域、Schema和最终活动；表示不合格的出示物先于存储拒绝。改密准备在写事务外，最终先G后登录，不多做exchange改变失败次序；注册仍三独立提交。所有不可用/缺陷先使共同事务结束再输出；仅原本归不可用的声明失败不增缺陷，作用域误用等原分类为缺陷的仍记录。完整业务Promise跨运输超时受管，finally等待全部工作；host总超时不继续释放尚需依赖。

规格表达经过独立定向复审，最后S49例外由作者收窄到原不可用类别。architecture-reviewer对节点hash `f240f8b1ae3e3362e2069b66ae9b9e76ae06f3457dda6ebcfbc609c0fda02fe5`局部无阻断。此前无存储拒绝、污染边界停止SQL及运输异常仍排空三项反馈已逐项落实到映射。

验证依据：三个独立有限模型（分类、提交、预期租户）及其负控；入口分类776 distinct，八变异反例，补跑九分支可达性；28项Schema形状和七份HT2规范字节重算。见[模型运行](../../evidence/2026-09-25-formal-entry-candidates/README.md)、[补充验证](../../evidence/2026-09-25-formal-entry-candidates-2/README.md)。模型未组合为端到端证明，不是SQL精化或实现证据。

局部实施须新增真实SQL、身份竞争、改密G优先、成功编码失败回滚、长准备和运输清理异常的生命周期测试，重跑全部受影响入口/host流程。直接可信调用者另行拥有排空责任。本决定不接受尚未完成的CLI/TUI本地状态与交互契约，不声明安装分发、备份恢复或生产开闸。HT2 G2/G3/G4仍按各owner保留；当前版本行为已明确，不预定未来版本触发条件。单机SQLite，PG/跨库/分布式未准入。
