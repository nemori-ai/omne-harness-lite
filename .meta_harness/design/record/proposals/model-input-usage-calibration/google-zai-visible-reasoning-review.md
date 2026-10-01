# 架构评审记录：Google 推理历史候选 revision 4 与 ZAI 可见推理候选 revision 1

2026-09-30，独立 architecture-reviewer（只读，未运行测试或形式工具，未发请求）。评审对象在 HUB `3a3a41ab`：[Google 候选 rev4](../../../realization/packages/model/pi-ai-transport/google-reasoning-history-output-group-candidate.md)、[ZAI 候选 rev1](../../../realization/packages/model/pi-ai-transport/zai-visible-reasoning-estimate-design.md)。依据：RT12 S-74/S-77/S-78/S-79、MR11 S-43、content-blocks v3 S-9/S-12/S-14、[D-111](../../decisions/model-request-runtime-rulings-2026-09-30/README.md)、xAI／Moonshot／Qwen 采用决定、[上一次同类评审](moonshot-qwen-visible-reasoning-review.md)、研究原件页与相关源码。三条纪律（双盲、绑定到语义条目、契约写性质）两页均未失守。

## Google rev4：修后可采用

- 阻断：无。
- 需修：**G-R1**（GS-V9 的 D 变体原只在 Δ_E＝0 时发送，导致「E 被计入但因 id 失配未被关联」在最可能的正向读数下无读数）→ D 改为 A、C 都接受即发，读数表补两支；**G-R2**（`requiresSignedPrefix` 取 false 的未覆盖场景「前缀变化后回放 E」未写成显式范围）→ 在接缝段写明不覆盖、归 GG-3。两处均已按评审闭合。
- 非阻断：G-N1（GS-V6 的 id 不等断言应标为 GG-14 观察断言）、G-N2（多条 E 时 GG-14 逐条放大）、G-N3（reader 修订号提升时 V4 整体 unavailable，失败方向为关闭）——已随闭合措辞落页。
- 确认成立：E-only 主承载、O 一次（xAI／priority 先例；O ⊇ reasoning 11/11；不以「E 计 0」预设）；域只收 E（TS／S 只见于截断帧，`stream.ts` 在 `finish==='length'` 时不发 opaque 收束）；GG-14 归 reader／投影 owner 且不阻断机制接线、只阻断坐标钉定与 GS-V7；K7 偏离先例有 Google 专属理由（已知结构性 id 失配，出网后付费拒绝比计划期零 HTTP 拒绝更差）；T-only 保持 unavailable；共享接缝不越权；失败层与版本装卸同构；反例以 unavailable 收口。
- 反证表：K1（E 计 0／继续拒绝／分词密文）、K3（保留 TS／S、按 OpenRouter schema 放开、收 summary）、K7（采用即钉定少一步串行付费）、K2（现在就钉 O 一次）——置信度中～高，改票条件均系于 GS-V9／GS-V10 读数。

## ZAI rev1：可采用

- 阻断：无；需修：无。
- 非阻断：Z-N1（采用门理由把两类未知说成一类）、Z-N2（ZV4 A＝B＝C 的补救口径应由三轮逐轮残差共同决定）、Z-N3（ZG9 已被 Qwen service prepare 拒绝观测证实，owner 落 R8）、Z-N4（纯 `reasoning` 串无路由身份，前提是 GG-11 由上下文组装处置）、Z-N5（分两批释放的分流键是修订而非布尔开关）——已随闭合措辞落页。
- 确认成立：投到模板 `<think>` 槽位有据（三套固定公开模板；`clear_thinking` 缺省与非缺省的风险已标价；Moonshot／Qwen P2 已证 OpenRouter 在两路由转发进原生推理字段）；并行键选 Qwen 同形复用 `projectVisibleReasoningBody`；Prime／FlashX「减 1」代理是加性常数；ZV0 前置范围（GLM-5.3、Flash）与 QV0 先例同判据；ZV4 A/B/C 能闭合 ZG1；不越权改共享层；失败层与版本装卸符合规矩；反例覆盖原件之外形状。
- 反证表：槽位投影（维持全拒／JSON 替身／原 O）、GLM-5.2 非缺省口径、机制先行 vs 对照前移、并行键三政策、减 1 代理、ZV0 前置两叶——置信度中～中高，改票条件系于 ZV4／ZV0。

## 范围外待裁（主线，见采用决定）

O-1 K7 偏离先例；O-2 GG-14 修复可能触及 content-blocks 规格（S-9／S-12／S-14）；O-3 R-N／P1 是否及于 ZAI；O-4 GLM-5.2 口径由 ZV4 读数后裁；O-5 GS-V9／GS-V10／ZV0／ZV4 付费义务授权归唯一账本。

## 未覆盖

未逐字节比对 rev3→rev4；未读 09-30 raw 原件（主调度私有目录），按研究页读数核对；未复算 ZAI 09-27 归档 SHA；未读 `google-three-round-invoke.spec.ts`／`zai-*.spec.ts`；表达项转 spec-reviewer（GG-11 撞号说明段与修订记录叙述是否留正文；ZG7／ZG8 落点；条款坐标与 registry 登记）。
