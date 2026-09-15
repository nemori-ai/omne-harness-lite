---
kind: research
id: R-design-spec-maintenance
scope: 架构、规格和具体提供者设计的维护衔接证据
---

# 设计与规格维护的交接证据

## 来源与保留

本轮按用户指定读取 `design/dsh-core-adoption` 的交接文档。原件来自提交
`ce8bebab1340a8fa9efdbceefb3c2d59a17390ff` 的
`docs/proposals/core-capabilities/design-spec-maintenance-handoff.md`，读取时源分支
HEAD 为 `db106159687450bfda818282da0b7162426751a6`。原件自身的事实基线是
`4e67db6`，Agent/Session 受审稿为 `cd16f1`；这些身份不能混为本轮主分支状态。

[保留原件](handoff.md.txt)按该提交逐字保存，SHA-256 为
`2d9284d68cb86baaf1ccca5f89e3c433affd94c39304ed755c82f0ad314ecf59`。
原件中的相对链接属于原目录及其基线，不作为本目录的当前导航；必要时按原提交
与路径核对。保留原件避免来源只存在于临时工作树。

本轮修改基于 main `12855d2`，未合并交接分支的产品规格或实现。原件关于 D-008、
work-data、Agent/Session 修订和场景状态的记录是该分支的交接事实，不据此更新
本轮主线的产品完成状态。

## 可核对的观察

本轮直接读取的主线材料已经要求：三类语言无关契约、精确接受与冻结、按性质增加
模型，以及明确依赖和生命周期。对应来源是
[组织规范](../../maintenance/organization.md)、[版本规范](../../maintenance/versioning.md)、
[契约描述要点](../../architecture-guide/reference/contract-description.md)和
[规格与证据](../../architecture-guide/assurance/specification.md)。
`12855d2` 的上述材料尚未明确包/应用当前实现设计的稳定正文，以及语义接受与具体
提供者可实施之间的维护交接；这可通过同一 Git 基线复查。

交接报告了具体映射不全、长期正文不明、完成范围表达不足，以及跨能力直接拒绝
路径曾遗留接续责任的问题。它同时记录后者已通过限定范围的设计复核，实际产品
场景仍待验证。本轮采用其问题与因果分析作为维护设计输入，没有重跑那些产品
场景，也不声称重新确认其设计关闭结果。

## 推断与局限

这些观察支持补齐责任、就绪范围、当前正文和跨能力路径核对；不能据此推断
`contract.md` 数量少就是设计错误、所有能力都需要形式模型，或已有审阅越过了
当时范围。采用 Cordis 的通用机制也不自动完成本项目提供者设计。

本轮治理候选与验证范围见[提案](../../proposals/design-spec-maintenance/README.md)。
研究保存来源及推断，不接受新的公共服务接口、产品语义或历史候选。

用户随后补充的插件装载效应与撤除责任，另见
[官方机制核对](effect-cleanup-sources.md)；它不属于原交接文档的新增历史结论。

## 后续 diagnostics 观察补记

后续交接在 `7e758f21f8f92c1d46fab194fdaf120239b8e11c` 的原
`docs/proposals/core-capabilities/design-spec-maintenance-handoff.md` §已发现的缺口
补入了 diagnostics 观察；该版本 SHA-256 为
`13adda83be3db0a7ba2fdae6cc0daf007cae0949b44ee953ec559269fb13ca79`，与上文
`ce8bebab` 原件不同。这里提炼新增事实，原研究附件仍保持原字节。

[对 `66d92a9` 的只读评审](../../proposals/core-capabilities/implementation/review.md#diagnostics-d1-实现评审)
提出六项问题，而 HUB `46770b9` 已通过当时的完整产品及独立消费检查；新发现
在该时点是源码分析，评审者未执行反例。旧绿色及其局限见
[原 HUB 证据](../../proposals/core-capabilities/implementation/evidence/p1-diagnostics-hub/README.md)。

| 已要求的保证 | 分析发现与因果含义 |
|---|---|
| 目录容量包含旧来源及未确认写入 | 各来源独立核算可能复用共同余额，单实例测量不足以检验跨实例不变量 |
| 准备/关闭失败后资源责任仍可核对 | 写失败、关闭失败分别通过不能排除组合路径失去原资源责任；应沿取得与移交检查 |
| 已结束句柄只保留不可变身份 | 活动计数归零不排除公开 context 仍保留 SDK span/runtime，应观察真实对象关系 |

这些例子支持按承诺的范围、资源与交接选择能否定错误实现的测量，不能推出
增加 contract 文件即可解决。目录反例的后续实际测量及限定修订另见
[D-011](../../decisions/D-011-diagnostics-directory-ownership.md)；本补记不把后续
RED/GREEN 倒写成原只读评审的实测，也不作 D1 产品接受。
