# D-107 后继：Qwen 开源两叶可见推理详情的有限估算

2026-09-30，主线技术负责人依据用户持续实施、调度和技术验收授权，在 QV0 观测完成后采用下述提供者补充；不代替完整交付签收。

## 精确采用及依据

技术采用 [Qwen 开源两叶可见推理计量 revision 2](../../../realization/packages/model/pi-ai-transport/qwen-open-visible-reasoning-estimate-design.md)。原 candidate 字节保留，当前采用由本决定表达。前置 QV0 已由主调度沿唯一预算账本完成（R7 认证工具，HUB `104ce616`，第六批 d，10:42–10:43Z）：`qwen/qwen3.8-27b` 与 `qwen/qwen3.8-2.4t-a95b` 各一条 `alibaba` 路由、`effort: high`、带 tools 的当前绑定真实流，raw SSE 落盘（8712／7890 字节）。逐帧形状与候选页假设一致：details 恰四键 `format`／`index`／`text`／`type`、`format: unknown`、`index: 0`、无 `id`、无 `signature`；并行 `reasoning` 字符串与 details 文本逐字相同（165／110 字节）；`prompt_tokens` 1175／1177，显式缓存 `cache_write_tokens` 1159／1161；本地 full 估算 1214／1216（高估约 3.3%，方向保守）。同批第 2 轮按当前绑定在计划期以 `input_size_unavailable` 拒绝，正是本采用要释放的缺口。

依据沿用 [Moonshot 采用决定](moonshot-visible-reasoning-decision.md)的同一评审（[独立架构评审](../../proposals/model-input-usage-calibration/moonshot-qwen-visible-reasoning-review.md)，无阻断）与 [D-111](../model-request-runtime-rulings-2026-09-30/README.md) 的 R-A／R-F＋R-L／R-K／R-P（P4 认可 Qwen 页对 R-B 守门的读法）。既有 RT12 S-74、S-78、S-79 与 MR11 S-43 足以约束本有限估算，不新增规范版本、registry 资源或形式证明声明。

## 实施范围和不可省略的验收

只适用两款固定 Qwen 开源叶经 `alibaba` 路由的明确可见 `reasoning.text` details 形态（恰一项、format `unknown`、index 0、无 id 无签名、text 非 `[REDACTED]`）。四键形状谓词与并行键同文判定复用 DeepSeek／Moonshot 已采用实现，不另写；并行 `reasoning` 存在时须与 text 逐字相同且只计一次，否则 unavailable。仅改变计量副本；full-only，φ／δ 保持 `unsupported-marginal/1`，不加 O 或 reasoning_tokens。Qwen 两叶路由要求显式 5 分钟缓存（断点 `system`），缓存档由调用方配置，计量不因缓存改变。不承诺精确或上界。

两叶 factory 的直接公开方法接到现有共同包装；definition／implementation／algorithm 升为新唯一值，tokenizerRevision 显式钉当前值，旧 lease 不热替换，无旧工厂兼容过渡。summary、encrypted、附加键（含显式 `signature: null`）、多项或空数组、非 `unknown` format、非 0 index 一律 unavailable。商业六叶（G7）不在本次门内。

释放 QV1–QV3 实施与受影响验收（两叶有／无 tools 三轮本机公开与 Cordis 路径、等价预言与负控、直接入口正反测试、演示装配 details 用例改为估算）与 QV5 文档义务。QV4 真实路线（含**必做**同路由对照，P2）仅由 root 沿现有预算与唯一账本执行；本采用不证明这些门已通过，不关闭 T21／T22／Qwen 整家。新增 bindings 0。
