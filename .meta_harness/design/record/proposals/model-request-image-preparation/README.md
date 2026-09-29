# 请求图片的缩放与重编码

2026-09-29，revision 1，候选，未接受、未实施、未验证。

本包选择既有模型调用中图片发送前处理的承载方式。范围是图片仍作为图片发送：原图片保持不变，实际发送表示按当次模型档案限制选定；不建设完整上下文组装、Session/Run、跨模态转换件或通用媒体存储。

- [设计与四表](design.md)：已有承诺、推荐机制、失败/资源/计量交接。
- [三个实质候选](alternatives.md)：请求期共同步骤、调用方接线、预生成多档。
- [评审](review.md)：尚待独立审查，作者推荐不是采用。
- [来源](sources.json)：本次输入精确字节；域读数由独立作者封存。

持续消费者是 transport/runtime 的后继提供者设计与验收人员。现有 PF-010 rev7、PF-013 rev16、RT10 S-74/S-77～83 已给出范围/原件不变/实际投影计量；本包先判断既有语义能否覆盖，不因公开函数异步就新增领域契约。realization 候选拟用 transport v15、runtime v21，须独立评审后由主线决定；不占 T29 v20 或其规格版本。正式研究唯一归 `.meta_harness/research/typescript-image-input-handling/`，本包不复制上游调查。

## 当前候选交接

[transport v15 revision4](../../../realization/packages/model/pi-ai-transport/v15-image-preparation-design.md) 与 [runtime v21 revision3](../../../realization/packages/model/model-request-runtime/v21-image-preparation-design.md) 已完成独立架构、表达与对应增量复评，精确hash和原反例见[评审记录](review.md#2026-09-29-r3r4-收束记录)。结论是可交主线采用判断，尚无采用或实施授权。没有新增领域spec，公开接口只在现有RT10语义内精确化；所有实际验收义务保留。

- [D109 施工接缝定点评审](scope-and-basis-followup-review.md)：scope 清理端口与原计量依据适用表的窄补充，候选未采用；原v15/v21保持已接受字节。
