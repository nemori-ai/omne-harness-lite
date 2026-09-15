# Cordis/DSH 复用选择设计

## 需要作出的选择

怎样在不引入完整 DSH Harness 产品政策的前提下复用成熟内核与原语。

## 现有能力如何承载

SYS-KERNEL 已把 Cordis 官方包与自维护 DSH fork 分开；F 只消费 scope/agent 原语。能力契约由项目拥有，源码集合只是 provider 输入，不新增同名业务维度。

## 剩余责任与能力演化

本轮关系是“等价重基 + 修复/补齐提供者”，不是新增能力。identity、live-agent、binding 的责任分离仍成立；新实现必须各自投影到独立插件或组合者边界。

## 契约、动作链与 Cordis 投影

Registry/实例插件拥有活体资源；Factory 作为受管贡献注册；Session/IAM/资源提供者通过精确能力进入共同门。
装载与撤除成对：登记 owner 后准备，发布前共同复核；撤除先关准入、排空/移交、按依赖释放，最后卸载。Context 可见性和 initiator 不授权。

## 证据义务与受阻消费

P2 checker、条款级 rebase、形式模型登记和独立架构/spec 评审是新 v1 候选门槛；实际 provider 符合性和完整组合仍未完成。


## 仍有效的来源集合

旧 D-006 选择的 10 个主体来源为：`dsh-scope`、`dsh-agent`、`dsh-session`、`dsh-session-projection`、
`dsh-session-persistence`、`dsh-session-persistence-jsonl`、`dsh-agent-loop`、`dsh-system-prompt`、`dsh-tools`、`dsh-llm`。
4 个限定支撑来源为 `dsh-brand`、`dsh-util-values`、`dsh-timeout`、`dsh-attachment`。它们是允许定向复用的源码来源，不是 14 个目标包或已兑现能力。

明确排除完整 presets/jobs/settings/approval 应用、历史 Session 格式迁移、Zstd/native 路径、PTC/code-runtime、直连模型 adapter、环境工具和完整 Harness。
排除源码不撤回 HITL、后台、授权、预算、媒体、工具或 OpenRouter 义务；这些由相应能力重新建模。引入新来源或扩大限定范围必须修订选择。

本批源码可拆分、重组和演化，不保留未经要求的上游 API 兼容；复制部分仍须保留 MIT 版权/许可和逐文件 provenance。
