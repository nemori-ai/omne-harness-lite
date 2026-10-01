# r5：无独立回收的耐久容器与本轮范围

2026-09-29，候选技术分支，主线最终接受前不实施。接续[r4](technical-choices-r4.md)，按[节点评审反例](node-review-r1.md)收窄机制，不改变产品政策、同日志事实源或partial保留承诺。

本轮采用候选为[runtime v20](../../../realization/packages/model/model-request-runtime/v20-reference-lifecycle-design.md) revision2：现Storage私有不可变原字节行，无独立GC/delete；同日志有效引用及可能发布writer同存续，确认内容后再发布marker，unknown/孤儿/关闭不删。外部引用只在实际启用时要求真实保留协议，缺席unavailable。RT11 S85/S93/G39、MS7 S55明确有独立回收才要求同保留记录；未来GC须重新设计，不能沿用无回收前提。

当前资格仍为真实受信准入协议，不强制SQL与JSONL同事务。当前文本输出沿H19原值路径，不新增replyDerivations或transport v16前置；真正媒体派生按既有来源不足失败，原源或摘要矛盾不能full绕过。完整Session/Run/Agent、通用内容平台、全部未来CB提供者均不在本轮。

代价显式保留：内容确认与marker分两次提交；未知和未发布孤儿占用持久空间；没有独立清理能力；真实外部引用/治理/派生提供者缺席时相应路径不可用。这些不是隐藏默认值或已完成验收。实现对这些前提的反例见节点R20-V6/V11/V20/V21，候选有限模型不代证实际存储。
