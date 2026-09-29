# 模型调用引用、执行与消费者生命周期

最终来源清单、规范/Schema/五节点/形式证据摘要、原始提交顺序及HUB导航合并提示见[交接manifest](handoff-manifest.json)；PF-013的[v5派生快照](../../../product/PF-013-model-profiles-and-invocation/projection/v5/projection.md)只映射已审范围，不改变接受状态。

当前设计增量已完成[无GC最小映射定点复评](node-review-r2.md)：架构与规格表达均无阻断，基本ref路径不需要新内容平台或transport版本。精确受审提交97f04eed；最终采用/实施仍由主线裁定，真实验证未完成。

提供者阶段的当前候选方向见[r5范围收窄](technical-choices-r5.md)及[五节点评审](node-review-r1.md)：无GC私有内容行、受信准入协议、当前H19原值路径。后继规范条件与节点已修，定点复评中；此前r4及下文是其各自阶段状态。

当前成组契约以 `1254553f` 为受审快照：第二轮两位独立 reviewer 均无阻断，少量文档残留已定点修正；见[实际复评](contract-review-r2.md)与[新运行证据](../../evidence/2026-09-29-formal-model-reference-candidate-2/README.md)。四个提供者节点仍在候选映射阶段，本包未接受，不释放实现。

本包比较怎样在 **model runtime 纵线内**兑现持久调用引用、在途重新等待、完成结果重取和消费者释放不取消执行。作者推荐候选 A：扩展现有模型服务，复用执行 owner、调用容器和原日志；这只是待主线裁定的推荐。

- 当前状态：A 方向已独立评审；首份 RT11/MR10/MS7/CA3 成组候选已评出需修项，正按 [revision 4](technical-choices-r4.md) 修订。全部未接受，不是实现依据。下文初稿过程段按当时状态读取。
- 选择对象：调用定位与消费资源的责任放在哪里，怎样接续既有执行与耐久事实。
- 范围：模型能力自身和必要的身份、归属、授权端口；**不交付完整 Session、Run、Agent Runtime，也不创建三领域通用 registry 平台**。
- 基线：Git `ce5f2c6b0f0f381b7a0cc1a0256a836b7aa59996`；PF-013 rev16、PF-012 rev21、PF-015 rev20；RT10／MR9，runtime realization v19、runner v8。产品新要求不自动接受后继技术设计。

## 读了什么、没读什么、为什么

起草者读取 handbook 的能力演化、对账判据及设计选择、工作区与本区约定、模板、当前产品相关段落、对象／词条、RT10 相关条款和三项 Cordis 4.0.4 basis，以及本包封存的 A/B、C 和上游影响报告。候选阶段有意同时读取两份读数，**本稿不声称双盲**。原 A/B 的严格双盲限制、C 未读 B 正文的声明分别完整保留在附录，不能由本稿升级。

源码观察主要消费独立 C 读数及影响报告；本次只核关键源文件跨基线字节相等，没有重新执行行为测试。DSH registry 是主线转交的固定来源观察，起草者未独立核验上游，不能作为采用依据。没有读取设计留档、运行付费请求、修改实现、写主线四表、做接受或委派评审。

## 准入核对

持久消费者是后继架构裁定、RT 规格演进和模型节点映射。失效事件是本次选择前提或责任切分改变，故归提案。现有覆盖与窄缺口见正文；三个候选的差异分别为 **既有服务扩展、定位能力与执行能力分离、日志驱动的模型动作协调**，并非接口改名或参数差异。未决语义在正文逐项阻止依赖它的定稿；不阻止候选比較。

| 当前问题 | 入口 |
|---|---|
| 现有覆盖、缺口、候选装配和规格交接 | [设计正文](design.md) |
| 三个实质候选、反例、可计数代价和改票条件 | [候选与取舍](alternatives.md) |
| 第一遍领域读数与原始来源清单 | [领域读数](sources/domain-reading.md)、[原 manifest](sources/domain-sources.json) |
| 独立机制读数及静态证据 | [机制读数](sources/mechanism-reading.md)、[comparison](sources/mechanism-comparison.json) |
| 上游产品差异与旧 opened fence 条件轨迹 | [影响报告](sources/upstream-impact.md) |
| 封存字节、当前产品和源码基线重绑 | [来源说明](sources/README.md)、[manifest](sources/manifest.json) |

## 后续消费

本稿不替主线做四表裁定。选择需独立架构评审及有权接受；随后才起草精确后继契约、形式义务和 realization。RT10 冻结资源不得原地改写。MR9、消息、日志及 runner 是否升版，按被选方案实际改变的保证决定，**不预定整批升版**。无评审发生，因此本包没有空白 `review.md`。提案总入口索引由有权主线在纳入时维护，本次写入范围不包含该索引。

## 同日后继：主线对账与来源核对

三候选起草释放后，设计责任人补齐 [四表对账](reconciliation.md)，保持封存 A/B 不改；独立架构评审已派发，尚无评审结论、更无接受。DSH 固定源码由另一调查执行者核验并由本设计责任人重取关键原文复核，正式事实见 [研究包](../../../../research/dsh-agent-registry-reference/README.md)；起草正文中“尚未独立核验”是当时状态，现仅该来源状态由本段更新，不自动采用其 Agent 所有权/撤除次序。

候选 A 的六项技术保护点已补作者收敛稿 [technical-choices.md](technical-choices.md)，包括新增消费面、身份公布与未处分完整结果耐久、旧执行 opened 写权以及直接读取；仍待独立评审，未起草/发布后继契约。

### 技术收敛稿修订二

当前技术稿为 [revision 2](technical-choices-r2.md)。独立评审指出私有状态行不能取代执行事实的唯一日志权威，修订二改为同日志 created/result-ready 事实及不可变外存 payload，私有行仅投影。初稿 [revision 1](technical-choices.md) 保留错误选择和当时依据，不再作为推荐；该修改待同位复核，尚未接受。

### 当前交接点：三轮独立架构审查后

当前作者推荐是 [revision 3](technical-choices-r3.md)，受审增量及范围见 [review.md](review.md)：A 边界无阻断，B1 日志权威已关闭；N1 成本、N2 状态分离方向明确，精确规格及 N3 跨提交协议/验证仍未完成。r1/r2 保留为已发生的候选与修订来源，不是当前推荐。尚无接受决定，不供实现；主线可据完整材料判断是否释放精确 spec 起草。

### 当前交接点：首份契约批次之后

RT11/MR10/MS7/CA3 candidate 提交 `3f597c18` 已成稿，SL3 保持。两位独立 reviewer 对精确字节发现批内交界问题，见 [首轮成组评审](contract-review-r1.md)；[有限运行证据](../../evidence/2026-09-29-formal-model-reference-candidate/README.md) 不代替语义闭合。当前修订方向为 [revision 4](technical-choices-r4.md)，定点修正原回复与消息派生、live 复接、创建后零发送终结及其表达。r3 未变部分继续作为候选依据，修订仍待新契约快照复评；没有任何实现放行。
