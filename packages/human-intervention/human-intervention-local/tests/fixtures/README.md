# 固定输入与故障材料

## 允许的内容

本目录保存真实旧版本生成的迁移输入和具名事务失败参与者。测试先复制输入库，再升级或故意损坏副本；不修改原库。

## 边界

legacy.sqlite 由基线 4700809fb0b6a36be83d3f8e85c5e4e44ae278c3 的本成员编译产物，通过原 SqlStorage 和公开命令生成。数据库关闭并checkpoint后保存，未手写SqlStorage私有journal。其SHA-256为 `0def9175d798d0ccc96322f4986691e05b10d5591ac591d9c13e329b7dff6d1c`。legacy.json保留原命令及结果，便于按原OperationRef和摘要认回。

八类输入是prepared、active、部分答复、未消费、部分消费、消费未ack、terminal、generation变化，另含aborted封口。题目两张，原话含空格和四字节字符。数据是合成测试业务，不包含用户数据或密钥。

## 维护

修改迁移时继续使用旧库，不能用新实现重新生成后冒称旧版本兼容。需要重建时检出上述基线，用原prepare/register/submit/bind/consume/ack/invalidate/seal流程生成同类状态，保存旧迁移checksum及完整原结果，并独立检查来源。

reject.mjs在事务中返回失败；late-reject.mjs经材料requiresFacts依赖WaitOwner完成，用于验证F已写后的共同回滚。它们不代替业务参与者。
