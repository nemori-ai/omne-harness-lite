# 架构评审记录：Qwen 商业六叶可见推理计量候选 revision 1

2026-09-30，独立 architecture-reviewer（只读；未运行测试或 Jinja，未发请求）。对象在 HUB `0f1d9efa`：[Qwen 商业六叶候选 rev1](../../../realization/packages/model/pi-ai-transport/qwen-commercial-visible-reasoning-estimate-design.md)。依据：[开源两叶页](../../../realization/packages/model/pi-ai-transport/qwen-open-visible-reasoning-estimate-design.md)与[其采用决定](../../decisions/model-input-usage-calibration-adoption/qwen-visible-reasoning-decision.md)、ZAI 页、[D-111](../../decisions/model-request-runtime-rulings-2026-09-30/README.md)、[前两次评审](google-zai-visible-reasoning-review.md)、Qwen 研究页 09-28／09-29／[09-30 社区与 batch8](../../../../research/model-request-adaptation/vendor-continuation/qwen/2026-09-30-community-harness-commercial-reasoning.md)、RT12 S-74/S-77/S-78/S-79、MR11 S-43、源码与固定模板。三条纪律未失守。

## 结论：可采用，三处需修已闭合

- 阻断：无。
- 需修（已按本记录闭合于候选页）：**M1** QG5 声称「前三项进 QC-V6」而 QC-V6 未点名非 ASCII 与 0902 缺省／`max` → QC-V6 逐项列出并给期望读数；**M2** 3.7 回合内几何的 A／C 对照必须由真实规划器生成并记录 `system_reminder` 是否在场（主线核实：运行时不在工具结果后常规插提醒，runner 只在扩展失败且 record 时造一条）→ 已写入 QC-V6；**M3** 对账 D 只列收益、未标单 user 形状在 3.8 叶由 ±2 退到 −9（约 −13%）→ 已补代价。
- 非阻断（已随闭合落页）：N1 QG1 静默低估加消费者后果与 owner；N2 `tokenizerRevision` 规则只写一处（tokenizer 文件＋渲染基，换类即换值）；N3 max-prime 标签在 QC-V0 后可改「单场景观察推断」；N4 QG7 加共享 `stream.ts` 分组规则变化触发；N5 开源两叶 `implementationRevision` 保持 `mp4-19`。
- 确认成立：整体换计数法有据（第 1 轮替身残差 −134～−186 由模板固定段解释，同 tokenizer 下 18 请求收到 +1）；3.7 取 false 分支是 S-74③ 下唯一有适用依据的分支，默认分支被同批数据否定且不能标上界；max-prime 沿 3.8 设定可作 QC-V0 前置＋QC-V6 证伪门；域收窄未越出证据（产品路径 reader 只出四键单项，收窄仅对直接调用者可见）；未覆盖形状取估算与 R-B 同模式且方向为高估；不建模常数诚实；接缝不越权、失败层与版本装卸同构；逐叶设定作版本化常量正确（S-77）。
- 反证表：六叶换模板（替身已采用、单 user 3.8 更准、一场景证据薄、替身在 3.7 只高估——置信度 QC-V0 前中）、3.7 false 分支（中高）、max-prime 归 3.8（中）、不建模常数（中高）、域收窄（高）、未覆盖形状估算（中）、设定为常量（高）；改票条件系于 QC-V0／QC-V6 读数。

## 范围外待裁（O-1～O-8，由采用决定处置）

O-1 域收窄接受；O-2 R-B 是否及于 0902（`high` 已观测、`max` 未）；O-3 max-prime 作采用前提；O-4 QG1 持续残差复核 owner；O-5 QC-V0 入库位置与第二执行者、QC-V6／V7 付费授权；O-6 用户方向入档与派发引用更正；O-7 QG3 缓存写入口径归 usage／cost owner；O-8 R8 已交付。

## 未覆盖

未读 batch8 原始 SSE（按研究页数字采信）；未运行任何预言；未读 Qwen 可见推理 spec 文件；未逐字节比对 `63980767`→`0f1d9efa`；表达项转 spec-reviewer（N3 措辞、有限适用表的类型核验迁入、候选 algorithm 名与账本坐标）。
