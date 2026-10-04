# D-110：模型调用引用生命周期的技术采用

2026-09-29，主调度沿用户「Implement the plan」「主调度者和验收者」及明确要求 model runtime 通过可序列化引用与消费者解耦的授权，接受[来源提案最终 r5](../../proposals/model-runtime-reference-lifecycle/technical-choices-r5.md)。本次只作技术采用，不代替用户对完整交付的签收。

## 精确采用

接受同 baseline 的 capability.model-request-runtime/v11、data.model-response/v10、data.messages/v7、data.call-accounts/v3 全部条款及其显式缺口。118 个资源按 [acceptance.json](acceptance.json) 的逐项 SHA 冻结；四契约由 candidate 转 accepted。旧 852 个冻结资源不改，covers 的 reviewed 与形式任务执行状态不因采用提升。

采用现有节点的 [runtime v20 revision 2](../../../realization/packages/model/model-request-runtime/v20-reference-lifecycle-design.md)、[messages v7](../../../realization/packages/core/messages/v7-design.md)、[model-response v10](../../../realization/packages/core/model-response/v10-reference-result-design.md)、[call-accounts v3](../../../realization/packages/core/call-accounts/v3-design.md)、[model-profile v6 资源增补](../../../realization/packages/core/model-profile/v6-schema-resource-design.md)，以及 [PF-013 projection/v5](../../../product/PF-013-model-profiles-and-invocation/projection/v5/projection.md)。节点与投影的摘要同列接受文件。原候选标签及 provenance.acceptance=null 保留快照时刻；本决定承接其接受状态，不覆盖原受审字节。

主线回读核心接口、状态、存储、失败和消费者映射，核对 307 个交接工件与 155 个投影来源；仅 runtime 导航保留 HUB 独立增补。原 formal 输入/输出与当前模型逐项核验，13 个有限运行包括 3 个正向和 10 个预期反例；70 个 Schema 案例在 HUB 实际执行通过。它们不证明真实 SQL/JSONL、授权、资源停止或无界状态。

[成组契约评审](../../proposals/model-runtime-reference-lifecycle/contract-review-r2.md)及[最终节点复评](../../proposals/model-runtime-reference-lifecycle/node-review-r2.md)均无其范围阻断。无 GC 修订、opened 原执行事实与新工作分离、原响应与首次合法消息派生分离的反例及修复保留。评审和有限模型不是实际交付验收。

## 采用理由与不能削去的性质

保留既有 modelRuntime service、ModelCallHost 和公开 invokeModel；消费者持有 CallKey，经新增 acquireCall 查回或等待原执行。消费者释放不取消执行；ref 不是授权、Cordis 对象或新执行请求。interrupt 继续是控制命令，dispatch/acquire 交付同一套完整结果事实，不让调用方从 delta 重建需要保留的结果。

采用既有 Storage 的私有不可变原字节内容行，再在同本 Session 日志确认 created/ready marker。内容先耐久确认，marker 后发布；没有跨 SQL/JSONL 事务声明。本轮无独立 delete/GC，内容与有效引用及尚可能发布的 writer 同存续，unknown、孤儿和关闭均不删。代价是额外写入与可能未发布内容占用空间；未来回收需重新设计共享保留互斥，不自动继承本次无回收前提。

日志保持执行事实权威；按键索引是可重建投影，当前性必须由受信 generation 与 SL3 readByKey 的真实 tail 双读核验。Map 缺席不推断失联，正常 acquire 不发送、恢复或重试。当前 read/wait/settle/cancel 权限及撤权次序由真实受信来源和准入协议给出，不用 caller 布尔代替。已准入旧 attempt 的 opened 事实与新工作资格分开，新 dispatch 继续受 fence 约束。

原 pending 的 reply、usage、cost、inputCalibration 等全部事实不变，final 只增加规定的顶层处分与 late。首次合法 AssistantMessage 的受限派生由 MS7 唯一关系 helper 核值，来源与写权仍由外侧负责。ready/final 的费用按同一 Session + ResponseId 唯一选择，缺 payload 不填零，补账仍指原归属。

相较重建通用 registry/内容平台或把生命周期焊在消费者上，所选方案仅在既有模型 owner 内补耐久引用和独立消费，不复制执行状态机。独立公开函数、现有模型计量和请求准备继续可用，T29 不增加 transport v16、媒体派生 DTO 或完整 Session/Run 前置。

## 实施、迁移与边界

本批释放四 core 节点和 runtime 节点的实施。core root 直接迁移 MS7/MR10/CA3，无旧 judge 兼容入口；现行精确引用需要的 CA2/MS6/MP6 Schema 以具名公开资源保留，不能以旧 URI 重定向新资源。model-profile root 继续 MP5，MP6 仅为已采用精确 Schema 资源，token 准入语义仍由 runtime 兑现。

runtime 原十三操作逐实际影响迁移并新增 acquireCall，共十四操作。共享数据和关系 helper 先明确，core 可独立并行；runtime 与正在实施的图片异步生命周期同文件部分须顺序集成。既有未受影响证据按原范围复用，不重开完整 Session、Run、Agent、Inbound、工具执行或通用资产交付。

必须完成各 core 节点验收与 runtime R20-V1～V23：真实持久化和冷读、creation 幂等与冲突、独立消费者、提前结束保留、unknown 留责、撤权与写入次序、opened 竞争、ready/final 唯一费用、索引重建及读取成本、来源代际、真实关闭、十四操作和实际包制品。demo 只承担合法消费装配与交互验证，不伪称生产 Session/Run。对应外部提供者缺席限制实际启用路径，不能将已承诺的模型侧消费硬编码成 unavailable。

新增实际 bindings 为 0。实现、真实组合、双语 README 和整体 D1～D7/37 型号认证仍分别待验；不得以本决定提升它们的完成状态。
