# D-107 后继：DeepSeek 可见推理详情的有限估算

2026-09-30，主线技术负责人依据用户持续实施、调度和技术验收授权，采用下述提供者补充；不代替完整交付签收。

## 精确采用及依据

技术采用 [DeepSeek 可见推理计量 revision 2](../../../realization/packages/model/pi-ai-transport/deepseek-visible-reasoning-estimate-design.md)，SHA256 `d3c298d56759f8e6504a1da095804a730487f563738528b6a59c6dd6107e63ed`。原 candidate 字节保留，当前采用由本决定表达。

依据为[实际旧响应与固定官方 encoder 调查](../../../../research/model-request-adaptation/reports/2026-09-30-deepseek-reasoning-history.md)及[独立两轮评审](../../proposals/model-input-usage-calibration/deepseek-visible-reasoning-review.md)。范围内无阻断，来源守门 N1 已在设计层闭合。既有 RT10/RT12 S-74、S-78、S-79 及 MR9/MR11 S-43 足以约束本有限估算，不新增规范版本、registry 资源或形式证明声明。

## 实施范围和不可省略的验收

只适用两款固定 DeepSeek 经 DeepInfra/fp8 的明确可见 details 形态。复用共享家族 decoder 和固定官方 encoder；仅改变计量副本，保留原发送体、serialized、units、输出组与摘要。full、φ、δ 共用同一投影，不额外加 O 或 reasoning，不将密文/metadata 的 JSON 长度当 token。不承诺精确或上界，原可配置 margin 仅应用一次。

两款 factory 的直接公开方法须复用已有共同来源包装；不可假设 `defineInputMeter` 已守门，不能只测 planner。未知 details 沿原 unavailable/发前拒绝；显式非法组不得以 full 绕过。发布更新家族与两叶唯一修订，固定旧 lease 不热替换，无旧工厂兼容过渡；未证明兼容的 basis 改变触发 full。

释放 DV1–DV5 实施与受影响验收：捕获形状有/无 tools 三轮、原 wire 保真、共享单计数、直接方法非法 history、稳定 P 零 tokenizer、真实路线误差、制品和双语 README。实际上游请求仅由 root 沿现有预算与唯一账本执行；本采用不证明这些门已通过，不关闭 T21/T22/DeepSeek 整家。新增 bindings 0；不扩大完整 Session/Run、ACK 或其他 35 模型的责任。
