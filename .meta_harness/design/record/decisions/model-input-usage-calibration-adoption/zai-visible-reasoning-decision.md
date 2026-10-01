# D-107 后继：ZAI 五叶可见推理历史的有限估算（GG-12）

2026-09-30，主线技术负责人依据用户持续实施、调度与技术验收授权（用户 2026-09-30 指令：ZAI 五叶开始推进），采用下述提供者补充；不代替完整交付签收。

## 精确采用及依据

技术采用 [ZAI 可见推理计量候选 revision 1](../../../realization/packages/model/pi-ai-transport/zai-visible-reasoning-estimate-design.md)（含按 [联合架构评审](../../proposals/model-input-usage-calibration/google-zai-visible-reasoning-review.md) Z-N1～Z-N5 闭合的措辞；采用字节以本决定同一提交为准）。依据为 09-27 探针归档（GLM-5.2 五份，603 帧）与 09-28 原件（Prime 三份 62 帧、FlashX 两份 64 帧）——每帧恰一项四键 `reasoning.text`、format `unknown`、index 0、无 id 无签名、并行 `reasoning` 逐字同文；评审「可采用」结论；[D-111](../model-request-runtime-rulings-2026-09-30/README.md) 的 R-F＋R-L、R-K、R-M、R-N、R-O、R-P 与 [Moonshot](moonshot-visible-reasoning-decision.md)／[Qwen](qwen-visible-reasoning-decision.md) 同形采用。既有 RT12 S-74、S-78、S-79 与 MR11 S-43 足以约束，不新增规范版本、registry 资源或形式证明声明。

## 采用范围与主线裁决

- **承载与映射**：三个现有 ZAI factory 的纯数据投影；复用 `projectVisibleReasoningBody(body, ['reasoning'])` 把纯 `reasoning` 串与单项可见 `reasoning.text` details 投到固定 GLM 模板的 `<think>` 推理槽位（`clear_thinking=false` 口径渲染全部历史）；Prime／FlashX 沿用「公开模板计数减 1」；full-only，φ／δ 保持 `unsupported-marginal/1`。
- **分批释放**：GLM-5.2、Prime、FlashX（当前发送域已有原件）机制接线先行、ZV4 真实回放作门；GLM-5.3 与 Flash 以 ZV0（各一次当前绑定单轮付费观测）为前置，观测同形即释放。分流键是各叶 definition／implementation 修订，不是布尔开关。
- **O-3 裁决**：R-N（并行键同文强制落 wire 层）与 R-P 的 P1（并行键政策差异登记为已知差异）**扩用到 ZAI**；ZAI 选 Qwen 同形（`reasoning` 与 text 同文只计一次，`reasoning_content` 照旧拒绝），登记为第四家已知差异。
- **O-4**：GLM-5.2 的 `clear_thinking` 口径由 ZV4 的 A/B/C 对照与三轮逐轮残差两组读数共同裁，本决定采用非缺省口径为初值（方向高估）。
- **ZG8 入档**：R-O（ZAI 本机 B+B' 收口、GG-12 登记）自 D-111 起生效，本决定为 GG-12 的处置；GG-12 列入 D-111 共享缺口清单。
- **ZG9**：Prime 路由显式 5m `last_message` 断点，认证工具 service 配置档须按路由取缓存档（R8）作为 ZV4 service 路径前置。
- **O-5**：ZV0（GLM-5.3、Flash）与 ZV4（含必做 A/B/C 同路由对照）为付费观测，由主调度沿唯一预算账本在用户已批授权内执行。

## 释放的实施与不可省略的验收

释放 ZV1～ZV3 实施与本机验证（三叶 public 与 Cordis 路径有／无 tools 三轮、三套模板 Jinja 等价预言与反例 1～13、直接入口正反测试）与 ZV5 文档（含删除 `zai-candidate.ts`）。ZV0 与 ZV4 由主调度执行；本采用不证明这些门已通过，不关闭 T21、M-ZAI 或 ZAI 整家交付。新增 bindings 0。
