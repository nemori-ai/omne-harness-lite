# 运行时共同提交与 Session 附着设计

## 需要作出的选择

多个独立能力怎样在激活与释放时保护当前资格、精确 attachment 和资源使用。

## 现有能力如何承载

live-agent 单方无法拥有 Session 资格或 IAM 当前权限；Session 也不能拥有活体资源退出。剩余整体责任由 `composition.agent-session-binding` 承载，不形成新的数据或通用事务能力。

## 剩余责任与能力演化

本轮关系是“等价重基 + 修复/补齐提供者”，不是新增能力。identity、live-agent、binding 的责任分离仍成立；新实现必须各自投影到独立插件或组合者边界。

## 契约、动作链与 Cordis 投影

Registry/实例插件拥有活体资源；Factory 作为受管贡献注册；Session/IAM/资源提供者通过精确能力进入共同门。
装载与撤除成对：登记 owner 后准备，发布前共同复核；撤除先关准入、排空/移交、按依赖释放，最后卸载。Context 可见性和 initiator 不授权。

## 证据义务与受阻消费

P2 checker、条款级 rebase、形式模型登记和独立架构/spec 评审是新 v1 候选门槛；实际 provider 符合性和完整组合仍未完成。
