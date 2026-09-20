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


## 固定来源与关键差异

核对对象为 DeepSeek Harness `c291e7961a515f6d7af9304e7fd1d257929aef26`、`dsh-agent 0.1.5-rc.2` 与 Cordis `4.0.2`。

| 上游机制 | 目标处置与依据 |
|---|---|
| 单 sessionId Registry、直接返回活体 | 改为 SessionRef 预留、AgentRef 精确代际和受限 Handle（ARI-1～5、AR-1/2/4） |
| created 同步否决/重入 | 改为门内发布、门外事实通知；监听器失败不回滚，重入关闭如实返回当前阶段（AR-6/17） |
| detach 与不同 Registry/Factory 释放顺序 | 内部化原始 detach，统一关准入→排空/移交→资源/attachment→撤占位（AR-11～14） |
| 单 Factory 槽和调用 Context 所有权 | 作用域/解析键的精确受管贡献；稳定 runtime owner 与 initiator/业务 parent 分离（AR-3/5/15） |
| typert 活体解析及 send/cancel 等应用策略 | 从目标公开面移除；业务操作归 Run/输入/工具能力，不由活体 Registry 偷带政策 |

来源测试只证明当时原语配置；目标租户、代际、退出和隔离义务必须由项目 provider 重新验证。
