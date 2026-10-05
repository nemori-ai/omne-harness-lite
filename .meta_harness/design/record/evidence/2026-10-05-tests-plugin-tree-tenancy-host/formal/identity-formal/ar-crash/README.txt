# AR2 模型复用边界

[Registration.tla](Registration.tla)与[basic](basic.cfg)、[crash](crash.cfg)、[progress](progress.cfg)逐字复用冻结v1工件。
模型语义仍是独立步骤、激活/清除依据与两条跨步骤不变量，模型含提交后中断/回执未达路径；版本说明不改可执行字节。

- S13/S35：ActivatedHasPersonalOrganization、OnePersonalOrganizationPerAccount、NoOrphanPersonalOrganization；不预填通过。
- S6/S36：未知回执不是无效果；模型中崩溃前已成立的持久状态保留。提交未知到具体storage-unavailable返回的映射不由旧模型证明，需要真实已提交后失回执注入。
- S19：progress的Failures=FALSE/Abandoning=FALSE及公平性是前提，不能说真实故障最终必定恢复。
- 密钥不可伪造、绑定多个账号、真实SQL引用/唯一约束、业务排空及新entry不在模型范围；同v1范围限制，不提升为整装验证。

本版候选未接受；正式任务及证据登记待采用，不复制旧通过状态。
