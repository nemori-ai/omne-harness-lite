# External Hooks v1 验证范围

本能力已有 [Hooks/Run/授权联合有限模型](v1/formal/README.md)：三个正配置与十个指定反例在当前
契约快照下重放，并经独立审阅核对；它只检查 cap、超时、关闭上下文和当前门的有限交错，
不证明真实原子提交、恢复重放、身份绑定或隔离实现。本能力尚无符合规格的产品实现。
规范场景仍要求 provider 验证 bounded effects、S1 返回/合并、durable
`fieldEntries[]`/`presentationEntries[]`、TL-07 预备门与 CC-02/AU-06 屏障、cap=1 多 handler 原子 take/start、恢复去重、tenant 资产、
程序化作答资格、每次运行唯一 completion 与卸载 drain。源码中的零散 hook 形状不构成实现。
