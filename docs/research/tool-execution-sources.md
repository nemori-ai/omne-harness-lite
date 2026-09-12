---
kind: research
id: R-tool-execution-sources
scope: PF-003 工具观察、中断、手动与自动转后台及恢复后关联的 omne-next 来源核对
---

# 工具执行可观察与控制的来源核对

[PF-003 正文](../requirements/product/agent/PF-003-tool-execution-observation-and-control.md) · [研究索引](README.md)

2026-09-12，用户提出本项产品要求，并允许参考 `omne-next/omne_harness`。
本次读取本机干净检出，固定提交 `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`；
下列四份引用文件均已与该提交的 Git blob 逐字节核对，链接不使用浮动分支。

## 来源与观察

| 来源 | 核对章节与源状态 | 对本次要求有用的内容 |
|---|---|---|
| [工具执行状态、位置与时长][standing] | Requirement statement、AC-1～AC-7；Accepted · committed-future，2026-09-02 | 每次调用可辨认，前后台状态都可读取；状态变化、快照与耐久事实保持可解释关系，运行时丢失不应让调用成为黑箱 |
| [工具主动发出的过程事件流][progress] | Requirement statement、AC-1～AC-7；Accepted · committed-future，2026-09-02，含后续验收说明 | 命令输出、增量渲染和阶段进度由工具发出，带调用归属并按序送达；来源额外要求前后台一致、重入先取已持久部分、再接增量，以及回放和显式超限处理 |
| [单独中断一次工具执行][interrupt] | Statement、Rationale、AC-1～AC-7；Accepted · current，2026-09-08，含 2026-09-09 补充 | 控制目标是一件在飞执行，可覆盖前台或后台；停止与转后台是不同意图，用户中断与工具失败可辨认；整轮控制另有边界 |
| [脱离执行与耐久等待][detach] | Requirement statement、AC-1～AC-4/7/8、2026-08-31 与 2026-09-08 amendments；Accepted · current，2026-08-31 | 声明阈值后自动离场，受系统上限和运行预算约束；后台宿主与会话实例生命周期分离，工作可辨认且结果可回流；后续修订补充执行上下文可重建及显式调用级切换入口 |

以上是源文件在该版本记录的接受状态，不是本项目的设计接受或实现证据。
本次没有运行源系统或重验其交付状态。尤其脱离执行文档同时保留早期观察及
后续订正，不能把“曾经尚未实现”或某次局部落地概括成它的完整现状。

## 用于 PF-003 的补充

1. 调用级状态与工具内部过程是两个观察面，最终结果又有自己的含义。滚动输出
   能解释“正在做什么”，但不能单独证明执行完成或结果已经保存。[状态][standing]、[过程流][progress]
2. 单次中断的目标需与某一次执行稳定关联；工具已转后台，仍应能被识别和控制。
   来源也强调中断的可辨认性以及取消不撤销既有外部效果。[中断][interrupt]
3. 后台工作要能脱离会话实例存活；只把工作放在原会话实例的局部任务中，无法
   说明实例回收后为什么还能继续。来源采用耐久工作与可重建上下文作为实现
   条件，本项目可以用它们识别需要回答的边界。[脱离执行][detach]
4. 用户后续明确继承自动转后台机制，PF-003.C5 对应来源 Statement 与 AC-2。
   用户同时确认恢复后的智能体运行时能重新关联已有后台调用（C6）；来源 AC-3/7
   及执行上下文补充为耐久辨认和结果回流提供参考。[脱离执行][detach]
5. 前后台切换、会话重建或门面重连后的状态与过程连续性需要明确；C6 已确认
   重新关联能力，来源的快照、历史和增量衔接可帮助细化其机制，尚未确定本项目
   的完整送达保证。[状态][standing]、[过程流][progress]

## 不随引用自动采用的范围

用户本轮直接确认了“内部帧按需披露”“用户手动把支持后台的在途调用转后台”，
并在后续补充中确认自动转后台和运行时恢复后重新关联。
源过程流要求主要讨论工具主动发出及送达，不替本项目裁定具体按需披露方式。
源文档的 `on_demand` 是 Agent 在调用时传参，`auto` 是阈值切换；已确认继承
`auto` 的机制，同时仍需覆盖用户对执行中调用的手动切换。调用级中断来源中的
转后台处置可以补充这一边界。

以下仍是原系统自己的选择，不成为 PF-003 的额外确认条款：

- 中断与转后台的具体处置参数，尤其“不能转后台就中断”的分支；
- 中断对模型使用特定成功状态合成结果，以及系统不提供中断后恢复的政策；
- 可离场声明的三值词表、自动切换阈值的具体数值、幂等或外部宿主资格、作废前台段后从头
  重新执行、耐久工作单与 WaitFact、单停驻限制及宽限回收策略；
- 完成后只通知状态再用官方工具取回结果、恰好一次唤醒续跑及具体回流策略；
- 事件字段、传输方式、持久化布局、用户界面、进度保留/裁剪数值或验收工具链。

继承方向继续受 [SYS-CONTINUITY](../requirements/system/omne-next-continuity.md)
约束；此研究提交不因这次引用成为全部功能继承的截止基线。来源解释、待定
选择和本轮明确要求由 PF-003 分别记录，不能用来源机制替代产品要求。

[standing]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/runtime-tool-execution-standing-and-location-transparency.md
[progress]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/runtime-tool-emitted-progressive-event-stream.md
[interrupt]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/runtime-owner-initiated-tool-execution-interruption.md
[detach]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/runtime-detached-tool-execution-and-generalized-durable-wait.md
