# D-110 后继：消费方确认与模型副本回收

2026-09-29，主线在用户持续交付、技术调度与验收授权内，采用 PF-013 rev17 的结果确认与副本清理增量，并接受下述技术方向作为后继规格输入。**本决定不接受尚在起草的契约、形式模型、提供者映射或实现，不释放删除代码的实施。**

## 产品依据与范围

用户明确要求提供 ACK 原语，让消费方自行确认后清理，避免超长期运行中重复内容永久累积。采用 [PF-013 §6.19](../../../product/PF-013-model-profiles-and-invocation/design.md#619-消费方确认结果后清理模型侧不再需要的副本)、对应流程与 A1–A15 验收；产品来源和必要推导 P53–P58 分别保留在该 topic 的 decisions。独立产品评审及 A15 的定点修正见 [评审记录](../../proposals/model-runtime-reference-lifecycle/ack-product-review.md)。主线回读了产品差分、反例与修正，确认没有新增待裁政策。

ACK 表示有权消费方已经处理结果或自行保管后续所需内容；不能被读取成功、释放句柄、调用完成或 Run 结束代替。执行或重试未收场时不允许借 ACK 取消；真实结束的失败和中断可以确认。确认不等于回复处分，也不要求正式 Session 持久化先实现。确认后模型侧负责继续完成回收，保护实际在途读取及尚需认回的写入，不等待闲置句柄或所有历史消费者。旧引用保留明确的已确认／已释放状态，未知费用不改零、不以独立记账责任扣留无用大副本。

产品六文件采用基线为 `bdcb732e`、`3c922c0a`，HUB 对应 `853e58f4`、`5dcf5dad`。来源复核及中央修订接续为 `1890ba65`（HUB `1ed0c2a7`）；其逐条记录 [ack-source-review.json](../../proposals/model-runtime-reference-lifecycle/ack-source-review.json) 的 SHA256 为 `403d0b60090258c5cd9f8101e6e7e3d76df0bb2d58bdaf85477884aabddc44be`。ACK 是 Model Call 上的动作，不新增产品对象身份。

## 接受的技术方向

采用 [技术选择 revision 2](../../proposals/model-runtime-reference-lifecycle/ack-technical-choices.md) 与 [四表对账](../../proposals/model-runtime-reference-lifecycle/ack-reconciliation.md)。独立架构复评的精确基线为 `cc1e354d`、技术选择 SHA256 `0508d679ca6b724958384a55975d7a25357c74eb2be3a213e653da688cac3a17`；[评审记录](../../proposals/model-runtime-reference-lifecycle/ack-architecture-review.md) 关闭了将 ACK 伪作 consumed 的阻断。主线同时核过 `25c75f20` 对创建来源与终结发出记账来源的区分：各自保存原来源，不以创建时 attempt 替代终结发出的 attempt。合入该澄清后技术选择 SHA256 为 `5d4a32ad46bfba9703d8e0ee1678a9d31c5e9c4d0d619c6d1c26e1864b8b79ed`；此澄清未冒充独立评审的新基线。

- 在现有 model runtime 服务增加模型专属确认操作；确认、真实处分和实际释放分别可见。
- 独立耐久 ACK 事实承接确认；最小原账见证保证删除 ready 大载荷以后账仍可核实，final 与见证按原 ResponseId 唯一选择，不双计。
- 创建幂等与延后真实处分使用明确的无损语义摘要；字节摘要不能冒充语义相等，摘要不能恢复正文或授予权限。ACK 后才处分的消费者须自行持有原完整结果。
- 读取、发布与删除共同使用同一调用的 Storage 保留控制对象。先关闭新准入、确认日志事实、认回并排空真实旧责任，再于同一 Storage 事务删除内容及更新释放状态；不虚构日志与 SQL 的跨库原子性。
- 回收同时覆盖模型自己持有的内存大对象与存储副本。消费方自持内容、已有不可变记录、其他调用及仍有用途的共享内容不被误删。

取代 D-110 在本范围内的无 GC／永久保留前提。未确认结果的可靠承接、原账及迟到记账、租户隔离、真实停止与未知回执责任不减。完整 Session／Run／Agent、通用内容或 GC 平台仍在本轮边界外。

## 后继放行条件

[施工 brief（已外置）](../../evidence/2026-10-01-checks-model-runtime-repository-cleanup/README.md#外置原件) 的 RT12、MS8、MR11、CA4 候选必须完成精确字段、操作和来源关系、形式反例与运行证据，以及独立规格／架构评审。ACK 后新合法处分产生未知写入时的暂存与收束责任须在后继明确，不能永久复活已释放副本。runtime、messages、accounts 的映射和受影响消费者随之更新。冻结 RT11/MS7/MR10/CA3 不原改，不提供旧执行兼容分支。

完成上述精确采用后才实施 ACK 删除；此前可继续既有契约下无冲突的存取、幂等、模型适配及认证工作。本次采用不证明 SQL/JSONL 耐久、TLA 模型性质、SHA 碰撞安全或端到端回收已经实现。
