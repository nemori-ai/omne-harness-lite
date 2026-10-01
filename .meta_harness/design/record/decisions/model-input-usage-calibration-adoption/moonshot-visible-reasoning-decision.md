# D-107 后继：Moonshot 可见推理详情的有限估算

2026-09-30，主线技术负责人依据用户持续实施、调度和技术验收授权，采用下述提供者补充；不代替完整交付签收。

## 精确采用及依据

技术采用 [Moonshot 可见推理计量 revision 2](../../../realization/packages/model/pi-ai-transport/moonshot-visible-reasoning-estimate-design.md)，SHA256 `3ba51d5c70584c05cacb61878d7577805d73c735af84d5e1fedf77cb9312b361`。原 candidate 字节保留，当前采用由本决定表达。同批起草的 [Qwen 开源两叶候选](../../../realization/packages/model/pi-ai-transport/qwen-open-visible-reasoning-estimate-design.md)**本决定不采用**：它以 QV0（当前绑定 high／max 真实流形状）为前置，观测归 root 付费账本，观测后另记后继。

依据为归档真实原件（[2026-09-27 探针运行](../../evidence/2026-09-27-probe-model-request-runtime/README.md)中 Moonshot 10 份流、816 帧恰四键、与 `reasoning` 串逐字同文）、[独立架构评审](../../proposals/model-input-usage-calibration/moonshot-qwen-visible-reasoning-review.md)（无阻断，六项非阻断已在 revision 2 闭合）与 [D-111](../model-request-runtime-rulings-2026-09-30/README.md) 的 R-A／R-F＋R-L／R-K。主调度当日裁决 R-N（同文强制落 wire 层）与 R-P（并行键政策分歧登记为已知差异、同路由对照必做、G7 不作本次门、R-B 读法认可）随本决定入档。既有 RT12 S-74、S-78、S-79 与 MR11 S-43 足以约束本有限估算，不新增规范版本、registry 资源或形式证明声明。

## 实施范围和不可省略的验收

只适用两款固定 Moonshot 经 `moonshotai/mxfp4`／`moonshotai/int4` 路由的明确可见 `reasoning.text` details 形态（恰一项、format `unknown`、index 0、无 id 无签名、text 非 `[REDACTED]`）。四键形状谓词从 DeepSeek 已采用判定抽出而不另写；并行 `reasoning`／`reasoning_content` 存在时须与 text 逐字相同且只计一次，否则 unavailable。仅改变计量副本，原发送体、serialized、units、输出组与摘要保留；渲染与图片计数共用同一派生副本。full-only：φ／δ 保持 `unsupported-marginal/1`，不加 O 或 reasoning_tokens，原可配置 margin 仅应用一次。不承诺精确或上界。

两叶 factory 的直接公开方法须接到现有共同包装；definition／implementation／algorithm 升为新唯一值，tokenizerRevision 显式钉当前值，旧 lease 不热替换，无旧工厂兼容过渡。summary、encrypted、任何附加键（含显式 `signature: null`）、多项或空数组、非 `unknown` format、非 0 index 一律 unavailable。

释放 MV1–MV3 实施与受影响验收（两叶有／无 tools 三轮本机公开与 Cordis 路径、等价预言与负控、直接入口正反测试、`moonshot-closeout-boundaries.spec.ts` 与演示装配 details 用例改为估算）。MV4 真实路线（含**必做**同路由对照）仅由 root 沿现有预算与唯一账本执行；本采用不证明这些门已通过，不关闭 T21／T22／Moonshot 整家。新增 bindings 0；不扩大完整 Session／Run、ACK 或其他模型的责任。

## 2026-09-30 MV4 真实路线与 P2 同路由对照结果

主调度沿唯一预算账本以 R7 认证工具（HUB `104ce616`／`a2fd1e50`）执行：两叶**有 tools**（第六批 d）与**无 tools**（第六批 e）三轮各 3/3 complete、exit 0，`reasoning.text` details 自第 2 轮起原样回放并被上游接受，缓存命中递增（K3 1024→1280、无 tools 768；K2.7 768→1024、无 tools 768），答案判据全部 accepted，逐帧 details 恰四键、无显式 `signature: null`。本地 full 估算残差（预测 − 实际 prompt）：K3 +3／+3／+3（0.3%），K2.7 +7／+39／+71（0.7%→6.3%），方向为高估；残差只作记录，不引入修正常数。

**P2 同路由对照（必做，闭合 G1）**：研究阶段探针（HUB `74bdd9ef`，账本 research 条目）对同一第 2 轮历史分别发送 (A) `reasoning_details` 回放、(B) `reasoning` 字符串、(C) 不带推理，其余字节相同，`stream:false`：

| 叶 | A details | B reasoning 串 | C 无推理 | 本地预测 |
|---|---|---|---|---|
| kimi-k3 | 1209 | 1209 | 1179 | 1212 |
| kimi-k2.7-code | 1035 | 1035 | 1011 | 1074 |

A 与 B 的 `prompt_tokens` 逐 token 相等，C 恰少推理文本占用（30／24 token）：「同一槽位」假设成立，OpenRouter 把 `reasoning.text` details 与 `reasoning` 字符串转发为同一 Moonshot 原生推理字段并计入 prompt。G1 由此闭合。MV4 全部义务完成；本节不关闭 T21／T22 或 Moonshot 整家交付。证据：主检出 HUB `tmp/model-request-runtime/private/paid-out/batch6d-104ce616/moonshot-*`、`batch6e-a2fd1e50/moonshot-*-notools`、`p2-74bdd9ef/p2-moonshotai_*.json`（0600）。
