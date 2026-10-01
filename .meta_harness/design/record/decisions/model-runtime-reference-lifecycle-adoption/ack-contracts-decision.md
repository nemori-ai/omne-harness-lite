# D-110 后继：接受模型调用 ACK 契约及实现映射

2026-09-30。接受者为本轮获用户明确授权的主线技术集成与验收者 root；不代替产品负责人对整体交付的最终签收。用户要求消费方显式 ACK 后清理模型侧重复数据，产品与技术方向已由[前次决定](ack-product-and-direction-decision.md)接受。本次在该范围内接受精确契约和提供者设计，未增加产品政策。

## 接受对象及取代范围

接受同 baseline `omne-harness-lite-design-2026-09-15` 的四份后继完整条款及其登记资源：`capability.model-request-runtime/v12`、`data.messages/v8`、`data.model-response/v11`、`data.call-accounts/v4`。精确资源摘要见 [ack-acceptance.json](ack-acceptance.json)，由 registry 登记 accepted 并新增冻结；原 970 项冻结资源、原接受记录和有效的旧精确规范引用保持不变。

同时技术采用 runtime 的 [v22 revision 2](../../../realization/packages/model/model-request-runtime/v22-acknowledgement-design.md)、[messages v8](../../../realization/packages/core/messages/v8-acknowledgement-design.md)、[model-response v11](../../../realization/packages/core/model-response/v11-acknowledgement-design.md)、[call-accounts v4](../../../realization/packages/core/call-accounts/v4-acknowledgement-design.md)，以及 [PF-013 projection/v9](../../../product/PF-013-model-profiles-and-invocation/projection/v9/projection.md)。原受审正文中的 candidate、待复评及未接受标签保留其快照时刻，现行采用状态由本决定及登记承接，不原地改写受审字节。

本决定取代 D-110/v20 中“模型副本默认永久保管、无独立回收”的范围，并接续 v21 已采用的图片准备和资源责任；其他未 ACK 行为保持。当前实现直接迁移至本批后继，不保留 noGC 平行执行模式。原十三操作加 acquireCall、acknowledgeCall 共十五项；独立 invokeModel 没有此类耐久副本保管，不强加 ACK 或 Session/Run 依赖。

## 采用依据与精确复核

来源为[最终候选交接（已外置）](../../evidence/2026-10-01-checks-model-runtime-repository-cleanup/README.md#外置原件)、[技术选择](../../proposals/model-runtime-reference-lifecycle/ack-technical-choices.md)、[四表对账](../../proposals/model-runtime-reference-lifecycle/ack-reconciliation.md)及[ACK 后真实处分接续](../../proposals/model-runtime-reference-lifecycle/ack-post-confirmation-settlement.md)。[独立架构评审](../../proposals/model-runtime-reference-lifecycle/ack-architecture-review.md)覆盖最终节点及原账来源，末次基线 `7b0871ab7c53f7f0184e7a0a16298504810290b8`，无阻断；[独立规格评审](../../proposals/model-runtime-reference-lifecycle/ack-spec-review.md)末次基线 `3c78263ac4b1cc275009ea31a1f68a37228bc87b`，现行版本坐标的 N1 已关闭，无表达阻断。

主线在 HUB `1c365791` 回读全部新增 ACK 条款、四节点、评审与实际结果：315 项交接摘要全部吻合，原 970 项冻结资源未变，144 项归档原件逐字节摘要吻合。归档中的 Schema 最终结果为 80/80，摘要为 20 个向量与 4 等价/6 不等价对；两个有限模型各 6688 个生成状态、2124 个不同状态、exit 0，八个单项破坏配置各 exit 12 并命中具名不变量。具体输入、输出及早期失败保持在[原证据](../../evidence/2026-09-29-model-call-ack-candidate/README.md)。这是原运行的独立复核，不冒作本次重跑，也不证明真实 SQL/JSONL、授权、跨进程停止或内存释放。

## 不可削去的性质与实现责任

ACK 只接受当前有承接权限的消费者对真实终态的显式确认。ref、只读权限、零消费者、句柄释放、Run 结束都不授 ACK；确认不伪造 consumed/persisted，不改变原创建和各次 dispatch 的身份或账。创建与终结 dispatch 的 attempt 可以合法不同，各按原记录核验。

runtime 在同一持久 ModelCallRetention 上协调真实读写准入、代际、许可及清理。日志中原 ACK 完整批确认是确认线性化点；随后仅在同 Storage 事务中核清理条件、删除精确自有内容并更新 released。不得把 JSONL 和 Storage 宣称为同一事务，unknown 不作无提交，abort/超时/fence/Map 缺席不作写者已停证据。内容身份使用持久单调分配序号，已删除 locator/version 不复用。

已确认但不能清理时返回真实 pending 原因，并由 runtime 保有耐久清理责任；实际存储、任务结束、外部配对释放与公平调度满足前提后最终清理，不等消费者回来或第二次 ACK。发布 released 前还须解除 runtime 缓存、队列和闲置句柄对大值的持有。已进入的真实读取受保护，已交付消费者的 owned copy 不追删；日志、消息、其他调用和共享外部内容不由此删除。

ACK 后 ref 返回可核的小状态与原账事实，不重新领取全文。后续真实处分可由合法消费者回送自持完整 Pending，经 MS8 唯一语义摘要和当前权限核验；ordinary settleReply 仍不提供 persisted 权限。新处分在第一次可能追加前耐久保存实际完整原批到独立 SettlementWork；unknown 保原批，确认且全部写者停后自动删除，无第二次 ACK。合法 tailChanged 引起 late 重构时，在新的追加可能生效前耐久更新为实际将追加的完整批，不能覆盖尚未决的旧批或复活旧 ready。

费用由 runtime 按同 ResponseId 的 final、ACK witness、ready 顺序选择唯一原事实，同时拒绝相互矛盾的来源；各历史失败 dispatch、未知费用及晚到补账保持原归属。call-accounts 仍是纯值计算，messages 独占语义摘要算法，model-response 保持完整 Pending/final；不通过扩建通用账务、内容或 GC 服务兑现本增量。

## 实施释放与验收边界

本次关闭四契约及四节点的采用缺口，并接受 ACK 后新处分接缝的设计。真实授权、读写排空、跨进程唯一恢复、启用外部引用的解除、删除认回和内存引用释放仍须各提供者兑现；没有外部引用的 inline 路径不前置不存在的内容平台。

2026-09-30 附注：上段对「ACK 后新处分接缝」的接受以独立定点架构评审的 R1–R4 修订为条件（主调度裁决 R-G）；修订已作为接缝 [revision 2](../../proposals/model-runtime-reference-lifecycle/ack-post-confirmation-settlement.md) 落地，由主调度复核；复核前该接缝仍为 candidate。原句不改。

2026-09-30 复核附注：主调度已复核接缝 revision 2（SHA256 `edb9524f27477a45f9bed1fd8ef4c39d1c7c0182fa249d932245e72d81c9a910`）：R1 暂存行精确含义、R2 反例 A–E（A、B 各配 validity-check 变异配置并经 TLC 证据 [2026-09-30 运行](../../evidence/2026-09-30-ack-seam-vnext-tlc/README.md)，C–E 归 A22-V13/V14 真实并发验收）、R3 删除重试复用 ACK 清理同一套耐久待办与可配置策略、R4 崩溃恢复默认路径与重送前重核资格均已落地，B3 候选对照已补；**接缝接受生效**。同时采用节点 [v22 revision 3](../../../realization/packages/model/model-request-runtime/v22-acknowledgement-design.md)（SHA256 `003b9eaf6c4386ef37427d6ca95fd829500d3cab49f6bdf91d23dd084c6fed55`），它只按接缝 revision 2 同步节点表，不改 revision 2 已采用的范围。实施状态：A1–A3 与首轮独立评审修复批已入集成分支，第二轮独立验收进行中；接缝对应的 A4 实施与 A22-V13/V14 仍待。

实施按 CA4→MS8→MR11 的实际资源边集成；可并行编写独立包，不能以缺资源占位符通过消费者检查。runtime 保留唯一写入 owner，公共类型/codec、持久控制与所有入口的传播一致交付；示例只实现合法消费的 Cordis loop，不建设完整 Session/Run。每个增量同步 README/README_ZH、实际包制品与受影响消费者。

必须执行四节点的 A4、M8、R11、A22 验收义务，特别是真实双提交域故障、ACK 与 final 竞争、重复确认、旧 ref 小视图、在途读写排空、后 ACK 新原批崩溃恢复与自动清理。新增实际 bindings 为 0；本决定不接受任何 ACK 实现或整项 T29 完成，不替代全纵线 D1～D7 与37型号认证。
