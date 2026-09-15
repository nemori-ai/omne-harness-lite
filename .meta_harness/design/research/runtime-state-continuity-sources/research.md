---
kind: research
source_baseline: omne-harness-lite-legacy-spec
source_commit: e3573ca72d18bfe7ddd002df5025551b51eede46
source_file: docs/research/runtime-state-continuity-sources.md
source_sha256: 9a8ddce1925b57f81d75b7ae90d8813503bc7229ec6dc2cb23217343b01ebaad
source_anchor: "heading:# 运行时与持久状态、恢复接续及环境适配的来源核对"
target_baseline: omne-harness-lite-design-2026-09-15
migration_status: current-evidence-selection
---


# 运行时与持久状态、恢复接续及环境适配的来源核对

[系统目标正文](../../requirements/system/runtime-state-and-continuity/requirements.md) · [研究索引](../README.md)

2026-09-12，用户明确新增运行时与持久化解耦、同构资源恢复接续和异构环境适配
的系统目标，并授权从 `omne-next/omne_harness` 查找额外参考。
本次读取本机干净检出，固定提交为 `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`；
下列五份引用文件均已与该提交的 Git blob 逐字节核对，链接固定至该提交。

## 来源、观察与适用范围

| 来源 | 核对章节及来源状态 | 有用信息与限制 |
|---|---|---|
| [原系统恢复模型][recovery] | §1、页首 amendment；Accepted，含后续局部修订 | 将执行实例与持久状态分开，恢复从持久事实重新建立执行体。本次仅取这一概念区分，不沿用其恢复机制或早期跨节点措辞 |
| [运行时丢失后的会话续接][same-node] | Statement、相邻 claim 边界、AC-1～AC-6、Authority resolution；Accepted · current，2026-07-30 | 原 worker 或同物理节点的合格新 worker 可续接同一 user_chat 会话，保留身份及已确认历史；不把空白新会话当成恢复，也不从历史存在推导在途调用已完成 |
| [兼容物理节点间的会话续接][compatible-node] | Statement、AC-F1/F2、Architecture and reality relations、Unapproved expansion boundary；Accepted · committed-future，2026-07-30 | 相同执行兼容类别的另一物理节点可承接原会话；具体兼容维度尚未锁定。这是未来承诺，文档明确记录它与当前节点绑定设计的冲突，已有实现证据不覆盖完整跨节点续接 |
| [节点服务资格与工作兼容性][compatibility] | 概念边界、必须成立的候选资格、AC-2/5；Accepted · current，2026-08-03 | 兼容性针对具体工作所需组件、模型、工具、资源及执行环境判断，设备粗分类不能单独证明兼容；窄能力不能冒充完整执行能力 |
| [按部署配置声明支持范围][profile] | Every supported profile must declare its envelope、AC-1；Accepted · current，2026-08-05 | 公开支持的部署配置须说明依赖、运行边界、恢复方式及证据；能表达或启动一种拓扑与正式支持该配置是不同事实 |

这些是源仓库在该提交记录的接受状态，不表示本次执行过源系统、验证了其实现，
也不等于本项目接受了原系统的具体契约。当前只读取上述相关章节和导航，没有
重审其全部决定演进链、测试或交付证据。

## 对本项目的补充与未采用部分

从这些来源可以提炼出三个核对方向：持久状态的连续性独立于旧运行实例存续；
恢复兼容性要结合实际执行前提判断；不同装配或部署版本的可运行范围需要被说明
和验证。这些作为新目标的参考解释，精确含义仍由本项目后续建模和设计确定。

源码中的 `user_chat`、canonical `session_id`、worker/node 分类、Blueprint、
EventLog、checkpoint、lease、fence 及部署 profile 都属于来源自己的模型或
机制，不因被引用就成为本项目的字段、能力划分或方案。

尤其不能把来源的当前同节点限制用来否定本项目新要求，也不能把来源的未来
兼容节点续接写成它已经交付。来源明确限定的聊天会话、自动接管与在途调用范围，
也不能替用户裁定本项目完整 Agent 状态或自动恢复范围。

对不同物理环境和操作系统采用针对性装配或部署版本，是本轮用户直接提出的
目标；上述兼容性和部署材料只提供相邻参考。本次没有从来源取得本项目应支持的
操作系统清单、同构判定算法或任意异构环境间的状态迁移保证。
来源提交仍是研究快照，不改变 [SYS-CONTINUITY](../../requirements/system/omne-next-continuity/requirements.md)
中尚未确认的全部功能继承截止范围。

[recovery]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/adrs/accepted/ADR-009-failover-and-recovery-model.md
[same-node]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-user-chat-session-resume-after-runtime-loss.md
[compatible-node]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-user-chat-session-resume-across-compatible-physical-nodes.md
[compatibility]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/runtime-fleet-node-service-eligibility-and-workload-compatibility.md
[profile]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/constraints/profile-scoped-deployment-and-partition-aware-degradation.md
