# 2026-10-03 · 默认 Schema owner 的运行记录

## 初次身份断言冲突

候选 `b03945d7ea2ed341e37569f6b0a30078a9aaca39`，基线 `52bc6005dc168f2254d21ff79f6cd2df021676b8`。三默认 owner 的实现来自 D-116 已接受的 AE 生产 Schema/ports 发布快照与首次使用构造。此阶段独立验收尚未执行。

实际 AE 慢层128条中127通过，旧 body-domain.spec.ts 的第一个 toBe(originalPort)失败。原[结果](identity-original-failure.json)、[输出](identity-original-output.txt)、[输入](identity-inputs.json)及[摘要](identity-provenance.json)保留。原端口已冻结，复制 Schema 后发布新 port，与四条旧 port 对象身份要求不相容。

独立[选择评审](../../proposals/fixed-schema-precompile/default-owners-identity-choice.txt)只判断既有快照边界，未执行工具。ROOT 按原技术交付授权采纳AE四条端口身份和库存消费者同类五条身份断言的有限迁移，保留值、category、职责函数与业务预期；修订后的运行及独立QA另行追加，不把本次失败改记为通过。


同一候选的库存工具慢层27条中25通过，w6真实消费者正反控各因旧身份断言失败。该源码还保留四个原port身份及一个LC3原Schema身份要求；ROOT按同一已接受复制边界逐处迁移，不修改正反控业务预期。原[结果](w6-original-failure.json)和[输出](w6-original-output.txt)保留。选择评审针对先发现的AE反例，库存同类处置由ROOT判断，不冒充另一次独立实现审查。
