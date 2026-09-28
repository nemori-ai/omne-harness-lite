# D-105：恢复时序提供者实施采用

2026-09-28，主线依用户持续实施、主调度及技术验收委托，技术采用下列两个提供者增量。来源沿[模型适配提案](../../proposals/model-request-adaptation/design.md)及[本次独立评审归因摘要](../../proposals/model-request-adaptation/review.md)。语义由[D-104](../model-recovery-timing-adoption/decision.md)已接受的 MR8/RT9 承载；本次逐文件核对其55个规范资源摘要全部一致，不发布新规范或业务政策。

| 精确实施映射 | SHA256 |
|---|---|
| [core model-response v8 rev1](../../../realization/packages/core/model-response/v8-design.md) | `8dd767477baff940b9bddea396a5d90944bf598f73e574c99b11b38971d72b7f` |
| [runtime v12 revision1](../../../realization/packages/model/model-request-runtime/v12-recovery-timing-design.md) | `66da0f35031af73e2994c778e23d5bdcbe8fccefca83f4337084b134b2c4aa11` |

接受 core 根/schema 直接迁移 MR8、持久 interrupted 可空时刻与普通 invoke/Pending 严格实际时刻的区别；接受 runtime 单一 mrr/3 当前根迁移、内部锚定中断构造、同次原执行只读事实保留、真实原 owner 关联与既有 coordinator 恢复接线。原完整批优先、恢复零 HTTP、未知来源不降为缺席、已知账与头不被未知值覆盖。保留 D-102/D-103 全部有效生命周期承诺，不用 nullable 或 observedFacts 解除未知写入责任。

独立 architecture-reviewer 与 spec-reviewer 对表中精确正文及其候选 README/verification 均无本范围阻断。架构非阻断 N1 要求把 actual stopped、owned事实稳定性、结算 unknown 与登记释放合成一个场景；主线已在 runtime verification 的 T12-V5/V9 后补明该验收义务，正文SHA不变。此补充由主线核对，未声称独立复审。评审未运行产品、网络或形式工具。

本采用接续而不改写 D-100/D-104：core 旧 MR7 根与 runtime 仅严格时刻假设须按当前消费者同批破坏性迁移，不留旧入口、猜版、兼容分流。冻结规范所需的精确旧 Schema 依赖仍按各自契约保存。新增绑定0；core V8-1～5、runtime T12-V1～11及新增组合场景均仍待实现和验收。

L1 永久撤除后 L2 的原 owner 交接、G-28/withRun、原产品来源归并未裁项均不在本次关闭范围。原 handle 查询不提供交接权；只可在真实恢复前提具备的同代际及冷恢复 noRun 分支实施。demo/主线装配、真实 kill/reopen、竞争、费用与逐模型 public/service 认证另验；本记录不使其自动完成。
