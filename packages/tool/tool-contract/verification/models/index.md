# Tool 协议模型索引

- [正文生命周期模型](body-lifecycle/README.md)：账本与正文存储为两个独立参与者、五个独立时钟的 BodyLifecycle 模型，守有限期限、先耐久再发布与有界聚合，含具名负控、进展配置和运行入口。
- [有界披露模型](disclosure/README.md)：首屏为描述头加预览的 Disclosure 模型，守有界披露，含具名负控和运行入口。
- [交接释放模型](handoff/README.md)：Handoff 模型，守消费方耐久承接后才释放与同一身份只追加一次，含具名负控和运行入口。
- [正文保管模型与论证](body-custody/README.md)：旧保管机制（Custody、Writer、Materialization、FinalReceipt、MaterialTime）的模型与论证，以及 Handoff 的旧副本。它们验证的是被替换的机制，随该机制一起删除；Handoff 的现行副本在 `handoff/`。
- [目录职责](README.md)。
- [包索引](../../index.md)。

模型检查不代替实现和部署验收。
