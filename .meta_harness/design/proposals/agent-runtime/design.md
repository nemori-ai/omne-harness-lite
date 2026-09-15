# 活体 Agent 运行时边界设计

## 需要作出的选择

在 Cordis 上怎样兑现独占活体实例、精确代际、工作所有权和可验证退出。

## 现有能力如何承载

现有 identity 数据契约承载长期/活体身份分离，live-agent 契约承载实例生命周期，binding 组合承载 Session 交接；语义边界充分，剩余是新谱系等价重基与 provider 实现缺口。旧 D-005 选择定向维护 agent 原语并在 Cordis 上实现受管 Registry，本轮不新增能力维度。

## 剩余责任与能力演化

本轮关系是“等价重基 + 修复/补齐提供者”，不是新增能力。identity、live-agent、binding 的责任分离仍成立；新实现必须各自投影到独立插件或组合者边界。

## 契约、动作链与 Cordis 投影

Registry/实例插件拥有活体资源；Factory 作为受管贡献注册；Session/IAM/资源提供者通过精确能力进入共同门。
装载与撤除成对：登记 owner 后准备，发布前共同复核；撤除先关准入、排空/移交、按依赖释放，最后卸载。Context 可见性和 initiator 不授权。

## 证据义务与受阻消费

P2 checker、条款级 rebase、形式模型登记和独立架构/spec 评审是新 v1 候选门槛；实际 provider 符合性和完整组合仍未完成。
