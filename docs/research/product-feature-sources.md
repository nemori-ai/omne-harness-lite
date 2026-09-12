---
kind: research
id: R-product-feature-sources
scope: 产品特性整理时对 omne-next Harness 与个人版既有材料的核对和补充
---

# 产品特性的既有来源核对

[系统目标与产品特性](../requirements/README.md) · [研究索引](README.md)

用户授权在逐项整理产品特性时，自行检索 `omne-next/omne_harness` 与
`omne-next/omne_harness_product_personal_edition`，选择有用信息补充描述、减少歧义。
本页保留核对版本、观察和采用范围；用户明确要求与依据来源整理的补充解释在
目标文档中分别标明。

## 第二项：外部环境感知与响应

核对日期：2026-09-12。来源为本机 `omne-next` 的干净检出，固定提交
`6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`；下列五份 requirement 的工作区文件
均已与该提交中的 Git blob 逐字节核对。链接固定至该提交，不使用浮动分支。

### 来源与观察

| 来源 | 核对章节 | 来源中的状态与可用信息 |
|---|---|---|
| [运行中 Session 的被动感知][passive] | Outcome、Required behavior、AC-1/2/5 | Accepted · committed-future；运行中的工作在适用边界接收获准的新信息，内容可见、呈现给模型与模型理解或行动是不同事实 |
| [多信道反应与 Agent 唤醒][reaction] | Outcome、Ownership and required behavior | Accepted · committed-future；独立观察机制可在获准条件成立时触发新工作，目标 agent 无须原本正在运行 |
| [外部来源供给与可观察状态][supply] | Outcome、Safe bounded content、User-observable standing | Accepted · committed-future；感知来源、内容新鲜度和失败可辨认；外部内容保留数据身份，供给与后续响应分别有结果 |
| [个人版自主调查与主动通知][proactive] | Outcome、PEP-1/2/7、PEP-AC-1、Rationale | Accepted · committed-future；关注的来源变化可在用户没有发话时触发调查、形成有依据的结论并告知用户，活动可回溯且受授权约束 |
| [个人版来源关注与定时简报][briefing] | Outcome、PEB-1/3/5 | Accepted · committed-future；用户可选择关注来源，查看最近供给、新鲜度和失败，区分没有新内容与无法取得内容 |

这些是来源仓库记录的接受状态和未来承诺，不表示它们已经完整实现、验证或交付。
本次核对 requirement 正文及相关设计导航，没有执行来源系统，也没有核查其全部
实现与交付证据。

### 用于补充产品理解的部分

1. **感知与发起新工作分别表达。** 运行中的协作可以接收环境变化作为新的输入；
   变化也可以在相应条件成立时触发原本未在运行的 agent 开始工作。两者有不同的
   触发含义。[被动感知][passive]与[主动反应][reaction]支持这个区分。
2. **响应能够形成有目的的行动。** 来源给出的场景是：被授权关注的 CI 失败后，
   助理自行调查，给出有依据的结论和待用户决定的下一步。这个场景帮助解释
   “响应并作出行为”，具体信息源与场景覆盖仍需结合本项目目标展开。[产品来源][proactive]
3. **感知和响应具有可追溯的关联。** 应能够说明响应由哪次外部变化引起、随后
   做了什么，并如实区分无变化、感知失败、调查失败和结论不确定。[自主活动与调查][proactive]、[来源状态][briefing]
4. **环境变化不改变授权归属。** 来源中的供给和唤醒受 Tenant/User 与授权约束；
   与本项目第一项特性结合，感知范围和可采取的行为应按所属租户与适用组织上下文
   生效。外部内容提供信息，不能自行授予权限。[供给边界][supply]、[反应准入][reaction]

这里是对本次特性的补充解释。来源中的 Channel、Subscriber、Blueprint、State、
Inbound、Runtime 等名称和 owner 分工仍属于原系统设计；本项目的能力划分与执行
机制留给后续建模。原系统的 Push/Pull 交付顺序、定时简报、通知中心、预算策略和
具体暂停语义各有独立承诺，不在本项中展开为新的产品特性。

### 仍需明确

本项目要感知哪些环境与变化、何时响应、响应时效、允许采取哪些行为，以及
失联、重复变化或恢复后的处理，需要继续随产品介绍细化。来源中的特定时序、
有界缓存或恢复政策不会仅因被引用就成为本项目的精确契约。

[passive]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/runtime-running-session-passive-broadcast-perception.md
[reaction]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/inbound-configurable-multi-channel-reaction-and-agent-wake.md
[supply]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-controlled-external-source-channel-supply-and-observable-standing.md
[proactive]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness_product_personal_edition/requirements/capabilities/personal-edition-proactive-investigation-and-notice.md
[briefing]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness_product_personal_edition/requirements/capabilities/personal-edition-scheduled-source-briefing.md
