# D-107：采用响应输入校准规范与纯值映射

日期：2026-09-29。决定者：主线技术负责人，依据用户持续实施、调度和技术验收授权；不代替用户完整交付签收。

## 输入、选择及精确范围

来源：[U0 三候选及施工简报](../../proposals/model-input-usage-calibration/README.md)、[两轮规格/架构复评及 core 审查](../../proposals/model-input-usage-calibration/review.md)。选择 C：校准事实属于本次 response 原 payload，随既有 response/reply batch 追加；不修改历史 log，不引入独立计量记录、服务或存储。

正式接受 `data.model-response/v9` S-1～S-45（5 资源）与 `capability.model-request-runtime/v10` S-1～S-83（76 资源），资源逐项 SHA256 见本包 acceptance.json，规范为受审 `62ab2001`／HUB `1fef9c90` 的原字节。规范内起草时 candidate 标签保留；当前状态以本决定与 registry 为准。旧已冻结版本不修改；MR9/RT10 是新消费者目标，不自动升级正在运行的消费者，不保留旧格式兼容过渡。MP6、CA2、MS6、SL3 及十三操作数量不因此改变。

同时技术采用 [core v9 纯值映射](../../../realization/packages/core/model-response/v9-usage-calibration-design.md)，正文 SHA256 `a650ba101257ca9ee51b9d6cb8520c7351aaf53eb6e6fceba5e5d210e6813726`，范围 R9-P1～P5/V9-1～V9-7。六个共享类型、required inputCalibration、严格自有快照 copy、Schema-only validate 与完整 judge 关系可独立实施；真实摘要、观察来源、授权祖先、φ/δ、原批持久仍归适配/runtime。

## 为何可先实施这一范围

MR9/RT10 修订二的独立 spec-review 与 architecture-review 已关闭原 B1～B3/N1～N2；core 整体审查无阻断。transport 的 Anthropic 正常缓存标记移动反例阻止其投影采用，不否定规范或纯值责任。规范已要求版本化 input-bearing 投影与稳定条件重锚，无需为保守实现缺陷削弱它。

因此仅释放纯 core 实施，**不采用当前 transport v12 或 runtime v16 候选**。两者继续完成有依据的投影修订和整体交接评审；consumer 破坏性迁移须在主线成组集成，单个包的测试通过不等于整个 HUB 已迁移。当前新字段的真实采集不得通过统一填 unavailable 冒充完成。

## 证据与局限

[第二轮有限形式证据](../../evidence/2026-09-29-formal-model-input-usage-calibration-2/README.md)：20 Schema/关系实例、TLC 6 正向/16 指定负控；主线已核输入快照及原始日志，reviewer 未独立重跑。三调用配置 1,675,125 distinct，稳定后继配置 66,825 distinct，负控实际击中安全/重锚性质。只支持所列有限域和环境假设，不证明真实 tokenizer、网络、存储或无条件窗口安全。

本次未执行新的产品实现测试，未证明性能交付。后继仍须完成真实授权来源、部分 usage 和取消实停、同批 unknown/冷恢复、不同分支隔离、provider 窄依据、稳定追加历史 tokenizer 零调用及百万输入的序列化/投影/计量分项验收；每包双语 README 和真实制品消费随实施交付。原压缩硬 fit 缺口仍由上下文 owner 处置，本纵线不实现完整 compaction。
