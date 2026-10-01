# D-101：有依据的 token 估算与明确余量的技术接受

2026-09-28，主调度在用户实施与技术验收委托内接受下述精确资源。用户回答“允许有依据的估算与可配置余量（推荐）”，允许模型适用的估算而不承诺等于上游实际计数；profile有限上限保留，字节/图片数量精确，实际usage/cost独立。产品依据为PF-013 rev15及其decisions中的本次裁决；延续[适配提案](../../proposals/model-request-adaptation/design.md)与[D-100](../model-runtime-current-generation-adoption/decision.md)。

## 接受范围

接受 `data.model-profile/v6` S1–33、`capability.model-request-runtime/v8` S1–76共50规范资源；摘要在acceptance。采用transport v10与runtime v9两份计量映射。新计量保证取代本纵线MP5/RT7中发送必须准确计数或可证明上界的范围；其余身份、状态、取消、恢复、未知写者、同批及当前代际无旧执行兼容责任保持。冻结原件不改。

MS6、MR7、LC6、Directory5、Runner5继续精确现版；它们只消费未变表示/纯判定，不自动升级。core现行MP5 Schema继续给这些消费者，runtime直接采用MP6发送保证，不能把Schema成功当作计量通过。

主线技术采用以下精化：每次公开计划显式传tokenMargin两成员，即使当次准确/上界分支不应用；缺适用cap先拒绝，margin非法沿malformed；精确十进制向上取整；同时准确超限与估算超门时优先准确事实；estimated metadata禁止actual成员。可信meter随原精确contribution/lease，不新建注册平台；算法更换发布新implementation修订。

## 审查与证据

独立产品审查PF013rev15原§8硬实际上界冲突已修，最终无阻断；PF010/PF012按本计量规则解释装得下，不引入新回执。31词条/3对象45处来源逐条复核，严格对账通过。

独立spec-reviewer核50资源、20依赖、82覆盖、10正形式任务及十三操作，计量增量无阻断；三处继承状态文字已修并定点复核，新RT8正文摘要a202ff9f1d932173c7e98aae42309c641b5c263c1f9fb6c0064dfd667177da68。独立架构审查两映射无阻断，估算通过后上游拒绝的验收补强已落实并复核。

[有限形式运行](../../evidence/2026-09-28-formal-token-estimate-admission/README.md)两正及九指定反例已保全；作者运行、独立审阅原输出及输入，不冒称独立重跑。HUB候选中央登记internal/formal registered通过。

## 实施与尚未完成

该接受释放真实meter与公开PlanInput/PlanFailure迁移，runtime只透传同一transport门。首模型tokenizer/encoder制品、完整输入适用依据、精确十进制实现、估算超门、上游拒绝及多轮真实OpenRouter仍须实际验收；token估算许可不表示其余36模型已可发送或已认证。

十三操作统一装配、Run G28、runner结论来源以及另行核实的sentAt恢复矛盾保持未完成；本决定不豁免、不伪造它们。包README/README_ZH和demo当前消费者须一起迁移，不保留旧默认或旧发送旁路。整体交付最终验收未发生。
