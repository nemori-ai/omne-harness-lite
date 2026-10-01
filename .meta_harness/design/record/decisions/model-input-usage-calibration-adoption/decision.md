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

## 同日后继：采用 transport v12 revision 2 与 runtime v16

在前述纯core采用之后，主线收到并复核两次独立架构审查：[runtime整体与transport B1修订二复核](../../proposals/model-input-usage-calibration/review.md)。此前仅阻断transport的正常Anthropic前缀问题已在设计层关闭，未新增政策缺口。主线据原实施/验收授权，现进一步技术采用：

- [pi-ai-transport v12 revision 2](../../../realization/packages/model/pi-ai-transport/v12-usage-calibration-design.md)，正文 SHA256 `8e2c62b2379ef7741ad44112421b1e6440849ec43d4b54edd7d94c2ff8e41476`，UCT-P/UCT-V责任按该正文及verification；固定provider投影、full/φ/δ、reader终态事实及注册贡献整体换代。
- [model-request-runtime v16](../../../realization/packages/model/model-request-runtime/v16-usage-calibration-design.md)，正文 SHA256 `17e4552faac16a3ab03aa974b210e150ac1fc96a5982f4812b8e549e203c978d`，U16-P1～P7/V1～V12；唯一接口账本、来源选择、invoke、原日志codec/结算/恢复及真实demo消费者。

此后继仅取代本决定先前“transport/runtime尚未采用”的当前实施门，不改其历史事实，不改规范资源/接受清单。三个包可按同一接口账本并行实现；产品公共类型及全部消费者在HUB成组迁移，无旧格式兼容。原B1风险现转为明确待执行的UCT-V12/U16-V10验收义务，不表示性能或四型号认证已经通过。

参考omne-next缓存middleware是已派研究输入；滚动多断点/stride或TTL/布局政策未由此自动采用，不偷偷改变现有last_message语义。完整37模型、十三操作、withRun、D4/D6仍按原交付范围验收。新绑定0，本次采用没有新增实现执行证据。


## 同日后继：采用 runtime v19 与 transport v13 多输出组交接

2026-09-29，主线依据用户持续实施、调度及技术验收授权，在[联合评审及 B1 定点复评](../../proposals/model-input-usage-calibration/review.md#同日多历史输出组提供者增量联合评审)后技术采用以下精确提供者增量：

- [runtime v19 revision 1](../../../realization/packages/model/model-request-runtime/v19-output-history-design.md)，SHA256 `348d951ffe855645075911858e963627b60210976da46cd2505a65c3b3423a92`；H19 公共接口、owned 来源交接及 H19-V1～V10。
- [transport v13 revision 1](../../../realization/packages/model/pi-ai-transport/v13-output-history-design.md)，SHA256 `793c346fe97b4f31d970b42f2ce25df2afb168f3327f627d25270127a56a295f`；H13 同一投影覆盖、full/φ/δ 显式事实与 H13-V1～V9，包括已闭合的独立 full/planner 失败映射。

本次取代两节点对该增量“尚未技术采用”的实施门；候选原字节保留。MR9/RT10 原接受清单、冻结资源及 registry 状态不变；没有新增语言无关政策、数据对象、服务、持久格式或第十四操作。允许按唯一接口账本破坏性迁移全部消费者，不提供缺必填成员时默认空数组的兼容通道。

实施先固定公共类型和纯校验，再并行 runtime 来源消费与 transport 覆盖/meter 接线；HUB 须按同一接口成组整合。模型映射依据仍归各家窄贡献，不能把 I+O 作为无条件通式。共享声明不允许删历史 wire、密文 tokenize 或 reasoning 重复相加。

H13-G4 的本轮处理：要求对组目标唯一性、P/G/N 归属和无依据转换执行有界枚举及故障变异验证，至少覆盖同组双加、跨区 aggregate 和无依据转换三类反例；这属于已接受性质的实现符合性验证，不扩张旧 TLA 的证明范围，也不修改冻结形式资源。若以后新增规范语义或提出组级形式证明声明，须由 spec owner 发布对应正式后继；本次不声称已完成该证明。

新增 bindings 0；本次采用尚未运行新的实现验收或形式模型。H19/H13、逐型号映射、真实 OR 与 README 双语仍是交付门；既有五项主线验收只复验受影响范围，不由本决定自动撤销或扩大。
