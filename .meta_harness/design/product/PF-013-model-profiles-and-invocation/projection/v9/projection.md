# PF-013 · 模型调用 ACK 与副本释放投影 v9

2026-09-29，post-review candidate；PF013rev17及ACK技术方向已正式采用，四契约及四节点仍待主线精确采用，未实现。局部快照不覆盖其它模型计量、图片或T29全部投影。[精确来源](provenance.json)。

| 产品承诺 | 唯一契约与提供者落点 | 交付边界 |
| --- | --- | --- |
| 消费方明确确认已自行处理/保存后回收模型侧重复内容，读取不隐式确认 | RT12 S95–103 acknowledgeCall；MS8 S56–59 ACK事实/摘要/原账见证；runtime v22同调用保留门与自动恢复 | ACK独立于consumed/persisted/vetoed；不等待未来消费者，不要求完整Session实现 |
| 旧ref明确已确认/释放，不伪不存在；已发生费用与未知责任仍真实 | CA4 S43按final→合法ACK见证→ready同ResponseId只选一次；MR11 S49不制造不完整final | 小型状态/费用与大副本分离；同值冲突先拒绝，原归属不转移至新Run |
| 真实读写/删除竞争、崩溃重启可恢复 | runtime v22按实际owner排空，日志ACK确认与SQL删除分阶段；删除和released同Storage事务；持久分配序号防重用 | 已有实际读可完成自有copy或明确失败；闲置句柄和缓存不扣住大payload；跨域IO不假原子 |
| ACK后允许合法独立处分，不能永久保存假想未来结果 | RT12 S99当前权限＋消费方自持完整原值核摘要；新实际结算批先耐久保存、实际责任结束自动清理 | 不授普通ref调用者persisted写权；unknown/late原批责任不丢；不新增第二次ACK |

四纯数据/运行时节点见[MS8](../../../../realization/packages/core/messages/v8-acknowledgement-design.md)、[MR11](../../../../realization/packages/core/model-response/v11-acknowledgement-design.md)、[CA4](../../../../realization/packages/core/call-accounts/v4-acknowledgement-design.md)、[runtime v22](../../../../realization/packages/model/model-request-runtime/v22-acknowledgement-design.md)。前三者纯数据/验证，既有Cordis runtime service承接实际所有权、权限与释放；不引入通用GC、资产删除或Session/Run状态机。

独立[架构](../../../../record/proposals/model-runtime-reference-lifecycle/ack-architecture-review.md)和[表达](../../../../record/proposals/model-runtime-reference-lifecycle/ack-spec-review.md)评审无阻断。两正八负有限模型、Schema及摘要向量见[原始证据](../../../../record/evidence/2026-09-29-model-call-ack-candidate/README.md)，不代替真实Storage/日志/权限/缓存/外引用验收。现有noGC只在被本增量取代范围失效，旧冻结规格作为历史保留，不新增运行时双轨或默认永久保留开关。
