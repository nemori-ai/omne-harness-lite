---
kind: research
id: R-connector-environment-source-sources
scope: PF-002 Connector 接入、信源授权与供给、生命周期及感知响应的来源拓展
---

# Connector 与外部环境信源的来源核对

[PF-002 正文](../requirements/product/environment/PF-002-external-change-response.md) · [研究索引](README.md)

2026-09-12 用户指向原系统 Connector，要求拓展 PF-002。检索确定对应入口为
`omne_harness/libs/omne_harness_connector_sdk`；相关产品要求分布于安装/授权、
内容供给、租户治理、订阅与反应文档。核对固定提交
`6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`，所列文件均与该提交 Git blob
逐字节比对。包名和实现白名单只证明来源定位，不代表本项目采用该 API。

## 来源与映射

| 来源 | 状态与核对范围 | PF-002 对应 |
|---|---|---|
| [Connector SDK README][sdk]、[表面白名单][surface] | 当前来源代码/说明，静态读取；`register`、`push_to_channel`、`get_status` | C2 的入口定位：安装握手、供给、自身状态；不开放 Harness 业务数据读取、管理或内部跨子系统调用。未执行客户端或测试 |
| [ADR-058][protocol] | Accepted 设计，2026-07-23；D-10、07-27“注册即安装”及 08-04 要求对账修订 | 解释聚焦的外部接入面与实际服务端授权；旧“全局注册”命名不能覆盖用户安装语义；SDK、URL、包依赖和兼容策略未随本轮接受 |
| [用户信源安装、授权与生命周期][installation] | Accepted · committed-future，2026-08-04 / 08-05 合并；两个分支及 INST/LIFE 要求 | C3/C5：多账号独立安装、凭据与供给授权两道门、用户同意、更新扩权、暂停/撤销/重装及旧代隔离 |
| [外部来源供给与可观察状态][supply] | Accepted · committed-future，2026-08-04；Required behavior、AC-1～6 | C4/C6：Push 与未来 Pull、同等受信准入、有界信息、新鲜度与故障、内容始终是数据 |
| [租户准入及组织要求安装][tenant] | Accepted · committed-future，2026-08-04；政策、mandate 与撤回、AC-1～7 | C7：个人/组织准入、按成员独立安装、组织不能代替个人 OAuth、不得偷换同意来源 |
| [订阅声明与有效解析][subscription] | Accepted · committed-future，2026-08-04；Outcome、Required behavior、AC-1～5 | C8：定义声明与实际有效订阅、时机和兼容性；声明不创造供给、授权或唤醒 |
| [运行会话被动感知][passive] | Accepted · committed-future，2026-08-04；Outcome、Required behavior、AC-1～6 | C8：运行边界感知、各会话独立进度、可见/呈现/理解区分、恢复不伪造完整重放 |
| [多通道反应与唤醒][reaction] | Accepted · committed-future，2026-08-04；Outcome、Required behavior、AC-1～7 | C9：确定性条件、窗口与有界累积、明确目标及忙碌策略、可恢复单次触发和多目标独立结果 |

用户明确 Connector 纳入 PF-002；其可无歧义映射的原系统未来承诺按
[SYS-CONTINUITY](../requirements/system/omne-next-continuity.md) 登记。新条款
保留主维度为环境，不新建产品编号，也不反向升级旧研究快照的其它未接受内容。

## 防止范围误读

- **注册是安装，不是开发者发布。** ADR-058 07-27 明确将源本体重定性为
  用户安装，并移除 Agent 作为安装归属轴；后续 canonical requirement 将
  grant/credential 与 lifecycle/generation 合并为同一专题。代码方法仍叫
  `register` 不能据此创建一个全局 Connector registry 产品承诺。
- **SDK 白名单不是完整功能清单。** 三方法是当前实现公开面；未来 Pull、用户
  管理和组织政策仍由产品要求承诺，不能因为 SDK 没有相同方法就丢弃。反过来，
  用户能管理安装不意味着第三方 Connector 能任意管理 Harness。服务端授权
  才负责执行边界，限制 SDK 方法不能单独证明权限安全。
- **供给与执行目标分开。** 安装与供给按租户/用户范围，来源不能自报 Agent、
  会话、提示词或路由取得效力。后续被动订阅和主动反应分别决定内容如何进入
  工作；本次没有把 Connector 扩展为任意读写内部系统的通用工具客户端。
- **两个消费路径均需保留。** 被动感知只作用于已经运行的会话，更新本身不
  唤醒它；主动反应以独立受治理条件触发工作，不要求目标预先直接订阅。内容
  已供给、已呈现、模型理解和行动成功分别有证据，不能用一个在线灯代表全部。
- **组织政策不合并成员私人内容。** 源 mandate 针对每个成员分别安装；它
  不是组织共享 buffer，也不能代替个人外部账号同意。该专门数据边界与
  [PF-010](../requirements/product/user/PF-010-organization-personal-assets-and-permissions.md)
  的组织级资产/权益共享分开表达；未来组织公共数据源如需共享内容须另行明确。
- **卸载与物理删除分开。** 原安装终结、旧代退出默认 Agent 输入面、旧请求
  无法写入新代已有明确要求；保留期限、审计和物理删除不从“默认隐藏”推导。
  暂停或技术故障也不能被当作同意已撤销。
- **版本与恢复不偷扩权。** Push 是来源首条交付路径，Pull 是正式未来承诺；
  两者均受授权、代次和容量边界约束。兼容更新可记录后采用，扩权与破坏性升级
  重新取同意；安全撤销不能借连续性绕过。SDK 自身版本窗口及旧实现兼容债不
  自动成为本项目实现义务。

初次 PF-002 的[来源记录](product-feature-sources.md#第二项外部环境感知与响应)
保持历史身份；本轮新确认的对应范围以 C2–C9 及本页为准。日程规划/通知继续
归 [PF-011](../requirements/product/agent/PF-011-future-planning-calendars-and-reminders.md)，
其信号输入可来自这里的 Connector。

本轮未运行连接器、外部授权或 Push/Pull，没有验证供应延迟、重放、撤销传播或
唤醒恢复；实现文件的存在不构成兑现证据。旧框架、事件、存储、聚合及身份字段
只作来源信息，后续语言无关建模须另行确认。

[sdk]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_connector_sdk/README.md
[surface]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_connector_sdk/omne_harness_connector_sdk/surface.py
[protocol]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/adrs/accepted/ADR-058-external-source-channel-registration-protocol.md
[installation]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/inbound-user-external-source-installation-grant-and-lifecycle.md
[supply]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-controlled-external-source-channel-supply-and-observable-standing.md
[tenant]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/tenant-external-source-admission-and-mandated-installation-governance.md
[subscription]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/agent-definition-agent-authored-broadcast-subscription-declaration-and-resolution.md
[passive]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/runtime-running-session-passive-broadcast-perception.md
[reaction]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/inbound-configurable-multi-channel-reaction-and-agent-wake.md
