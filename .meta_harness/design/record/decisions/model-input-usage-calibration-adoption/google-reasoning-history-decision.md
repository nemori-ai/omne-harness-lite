# D-107 后继：Google 两叶 `google-gemini-v1` 推理历史的有限估算（机制先行）

2026-09-30，主线技术负责人依据用户持续实施、调度与技术验收授权（用户 2026-09-30 指令：Google 两叶开始推进），采用下述提供者补充；不代替完整交付签收。

## 精确采用及依据

技术采用 [Google 推理历史候选 revision 4](../../../realization/packages/model/pi-ai-transport/google-reasoning-history-output-group-candidate.md)（含按 [联合架构评审](../../proposals/model-input-usage-calibration/google-zai-visible-reasoning-review.md) G-R1／G-R2／G-N1～N3／O-2 闭合的措辞；采用时字节以 HUB 本决定同一提交为准）。依据为 [09-30 真实完整回复原件](../../../../research/model-request-adaptation/vendor-continuation/google/2026-09-30-complete-reply-originals.md)（两叶各一份当前绑定 raw SSE：恰一条 `reasoning.encrypted`、format `google-gemini-v1`、`id` 等于上游 tool-call id、无 signature／text／thought；prompt 949／951、reasoning 93／64）、评审「修后可采用」结论与 [D-111](../model-request-runtime-rulings-2026-09-30/README.md) 的 R-K／R-M／R-L。既有 RT12 S-74、S-77、S-78、S-79 与 MR11 S-43 足以约束本有限估算，不新增规范版本、registry 资源或形式证明声明。

## 采用范围与主线裁决

- **主承载**：同模型、同路由 `google-ai-studio`、完整（非 `length` 截断）、仅含 E（`reasoning.encrypted`）条目的输出组，以原组上游 O 一次作为 workload 相关 estimated；不是精确占用、不是上界、误差方向未知。域只收 E；E+T、缺 id、`[REDACTED]`、TS、S、外模型／外路由一律 unavailable；T-only 保持 unavailable（K2 a，待 GS-V10）。身份按 xAI 守卫 4 成对判定。
- **O-1（K7）裁决**：接受偏离 xAI／Qwen 先例——**机制接线先行**（policy、countBody、共享核委托、K3 域、K4 身份、K5 修订规则，replay 保持 `unsupported-marginal/1`）现在实施并做 GS-V1～V6 本机正反验证；**三个坐标（definition 4、`pi-ai:google@mp4-N`、algorithm）在 GS-V9 A 变体读出上游接受原样回放之后才钉定发布**。理由：GG-14 是已知的结构性 id 失配，先发布会把今天的计划期零 HTTP 拒绝变成出网后的付费拒绝。
- **O-2 裁决**：GG-14 归 transport reader／投影 owner，登记为「可能需 content-blocks 规格演进」（S-9 禁止改写 opaque、S-14 CallId 由登记方生成、S-12 工具调用块无上游 id 成员）；本页不在计量里兜底，不删签名规避。
- **G-R2 范围**：前缀变化（上下文压缩、system／tools 改动）后回放 E 不在本采用覆盖范围，归 GG-3；是否加改前缀的 GS-V9 变体由主调度在 GS-V9 时决定。
- **O-5**：GS-V7、GS-V9（A／C／D，D 在 A、C 都接受时必发）、GS-V10 为付费观测，由主调度沿唯一预算账本在用户已批 $200 授权内执行；本决定不构成额外授权。

## 释放的实施与不可省略的验收

释放 GS-V1～V6 实施与本机验证（两叶 public 与 Cordis 路径三轮、E 组等价预言与反例、直接入口正反测试、GS-V6 中 id 不等断言标为 GG-14 观察断言）。GS-V7 真实三轮、GS-V9 同路由对照与 GS-V10 K2 对照由主调度执行；坐标钉定与官方 factory 发布另记后继附注。新增 bindings 0；不关闭 T21、M-Google 或 Google 整家交付；不扩大 Session／Run、ACK 或其他模型的责任。
