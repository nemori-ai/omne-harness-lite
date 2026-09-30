# D-107 后继：Qwen 商业六叶可见推理历史的有限估算（公开模板口径）

2026-09-30，主线技术负责人依据用户持续实施、调度与技术验收授权采用；用户方向原文（2026-09-30）：「按开源页同法给商业六叶补一条候选并实现，但是你应该先去调研社区上的其他 harness，尤其是 langchain、pi」。调研已完成并入库，本决定不代替完整交付签收。

## 精确采用及依据

技术采用 [Qwen 商业六叶候选 revision 1](../../../realization/packages/model/pi-ai-transport/qwen-commercial-visible-reasoning-estimate-design.md)（含按[架构评审](../../proposals/model-input-usage-calibration/qwen-commercial-visible-reasoning-review.md) M1～M3、N1～N5 闭合的措辞；字节以本决定同一提交为准）。六叶为 `qwen/qwen3.8-max-0902`、`qwen3.8-max-prime`、`qwen3.8-flash`、`qwen3.7-max`、`qwen3.7-plus`、`qwen3.7-flash`（定义表无 `qwen3.8-max`）。依据：[社区与 batch8 研究页](../../../../research/model-request-adaptation/vendor-continuation/qwen/2026-09-30-community-harness-commercial-reasoning.md)（阿里参数参考一手写明 3.8 三叶默认 `preserve_thinking=true`、3.7 三叶默认 false；公开模板＋固定 tokenizer 离线复算 18 请求全部 +1、12 个轮间增量残差 0；社区无一家为商业叶另写投影）、评审「可采用」结论、[开源两叶采用决定](qwen-visible-reasoning-decision.md)与 [D-111](../model-request-runtime-rulings-2026-09-30/README.md) 的 R-A、R-B、R-F＋R-L、R-P。既有 RT12 S-74、S-77、S-78、S-79 与 MR11 S-43 足以约束，不新增规范版本、registry 资源或形式证明声明。

## 主线裁决（评审 O-1～O-8）

- **O-1**：接受域收窄——`reasoning.summary`、带 `id`、多项 details、并行串不同文由估算改 unavailable；产品路径 reader 只出四键单项，收窄仅对直接调用者可见，失败方向为拒绝。
- **O-2**：R-B 的无 holdout 显式 effort 扩展**及于 0902**，含 `high`（batch8 已观测）与 `max`（映射 xhigh 说明，首次观察在 QC-V6）；evidence 字串写明。
- **O-3**：max-prime 沿 3.8 设定作为采用前提；QC-V6 读出 A＝B＝C 即证伪，出后继修订改 false 分支。
- **O-4**：QG1 持续残差复核 owner 归 root 认证工具：自 R9 起每次真实认证按叶记录 `prompt_tokens` 残差带并对偏出者报警；R9 之前候选页明示「行为变化无检测」。
- **O-5**：QC-V0（batch8 汇总入库＋独立复算）由主调度执行，第二执行者为一名 verification-developer 依研究页方法独立写脚本复算；入库位置为研究页同目录。QC-V6／QC-V7 为付费观测，由主调度沿唯一预算账本在用户已批授权内执行，不因本决定获额外授权。
- **O-6**：用户方向已入本决定；派发笔误更正——「按 R-K 列为未覆盖」不成立，候选页未引用；R-V 是主调度临时裁决簿条目，不在 record。
- **O-7**：QG3 max-prime 缓存写入口径归 usage／cost owner，不影响本页输入计数，不挡采用。
- **O-8**：R8（认证工具按路由取缓存档）已交付，QC-V7 四个显式档叶的 service 前置解除。
- **3.7 false 分支**：接受，静默低估风险由 O-4 的残差报警承接；消费者不得把 3.7 三叶 full 估算当上游计数下界（候选页 QG1）。

## 释放的实施与不可省略的验收

**QC-V0 通过后**释放 QC-V1～V5 与 QC-V8 的实施（六叶修订、`renderQwenPrompt` 两参、结构前置迁移与替身删除、开源两叶回归预言逐字节不变且 `mp4-19` 不动、直接入口正反测试、双语 README）。QC-V6（含 M1／M2 补充场景）与 QC-V7 由主调度执行。本采用不证明这些门已通过，不关闭 M-Qwen 或 Qwen 整家交付。新增 bindings 0。
