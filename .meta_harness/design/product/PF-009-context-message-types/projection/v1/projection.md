# 内容块纯模块 · PF-009 rev8 局部技术投影 v1

本版只承接 PF-009 的块／两个标注、完整与半截调用、原内容保存要求，精确语义沿已接受 `data.content-blocks/v2` S-1～21、S-23～27、S-34，以及 D-068。完整 PF-009 涉及的消息、流装配、日志、模态转换不在本版实施范围。它是派生视图，不是第二份产品或契约权威。

对象与性质：内容块、块标注、附件引用沿 PF 和契约；本模块只处理值。没有新的身份宿主、租户推断、提交或存储。数值不丢精度、重复成员拒绝、六种拒绝次序固定、不补默认标注、不修复输入；无损 codec 的每跳使用仍归消费者。有限输入和计算资源可用是纯计算返回的前提，没有新增时限 SLA。

公开入口沿 [content-blocks 节点](../../../../realization/packages/core/content-blocks/design.md)：类型／模态／媒体类型／相等、readJsonStrict、writeJsonLossless、judgeContentBlock。读取失败按 syntax/duplicate_member 返回，块接收边界映射 malformed；参数读取失败由消费者落为解析不了的调用。judge 按 S-26，缺席按各条原规则拒绝，绝不自动补齐；写入 codec 只接受本模块 JSON 值代数。成功输出保留原无损内容，不返回数值校验视图，不改变调用者输入。

Cordis 投影为空：普通纯包 import，无 plugin/service/inject/effect/事件、无装卸顺序、无原子提交或恢复。原 Schema 字节副本交 Ajv，CB 私有数值视图只进末位 Schema 判定；具名谓词把 LosslessNumber 当数字。生成不在这里，普通生产者与 pi 的限定分工按 D-068；数据接收不解析编号来源。

实施顺序：先严格 codec 与数字表示，验证重复键／无损往返；再类型、模态和副本 Schema；再有序 judge 及 NS-1～3、IS-1 的本地部分；最后独立核规范 examples、原值／输入保护、包依赖无 Cordis/存储，登记真实证据。每步都不能替代后续真实消费者链路。

当前源码不存在，bindings 为空，正式符合性尚未运行。附件解引用、消息级查重、CallId 登记／恢复和每跳无损仍有 owner；其他数据节点的完整 Schema 桥接未定；pi 非法 target 与 D-019 门保持。本版不允许跳过这些门去拼完整 Agent 会话。
