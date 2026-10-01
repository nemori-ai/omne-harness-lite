# D-111：2026-09-30 模型请求运行时收口程的裁决汇编（范围、共享 reader 分组、换路由 opaque、四家 full-only）

- **状态**：已裁。R-I 由产品负责人当场裁定（原话见下）；其余由主线技术负责人在产品负责人持续实施、调度与验收授权内自定，产品负责人可推翻，推翻时以本页编号引用并由新决定取代范围。
- **来源**：[四家残差盘点与共享家族采用](../model-input-usage-calibration-adoption/priority-family-decision.md)、[音视频承载研究](../../../../research/model-request-adaptation/vendor-continuation/media-carriage/2026-09-30-audio-video-carriage.md)、[A22-G2 接缝评审](../../proposals/model-runtime-reference-lifecycle/ack-seam-review.md)、[Google 推理历史候选](../../../realization/packages/model/pi-ai-transport/google-reasoning-history-output-group-candidate.md)、2026-09-30 真实付费观测（主线证据目录，随收口程入库）。
- **不表示**：任何契约或节点因此被接受；四家逐叶真实认证完成；R-L／R-M 的实现已落地并验收；T21／T22／T29 关闭。

## 裁决

| # | 事项 | 裁决 | 落点 |
|---|---|---|---|
| R-I | 本期交付模态 | **产品负责人原话**：「本期我们明确一下 model runtime 只交付到 text 和 image 即可，研究可以正式落盘但不作为我们实现交付到边界内目标。」定义里的声明模态不缩减（沿[共享家族采用](../model-input-usage-calibration-adoption/priority-family-decision.md#释放和未完成义务)），audio／video 在本期保持 `modality_not_carried`，不算未闭缺口；受影响叶的认证按 text 与 image 判定 | transport [design.md](../../../realization/packages/model/pi-ai-transport/design.md) `PI_AI_CARRIABLE_MODALITIES` 不变；研究页留档；transport 音视频 realization 候选起草停止 |
| R-A | Google／Qwen／Moonshot／ZAI 的 φ/δ 增量 | 本轮**不适用**：四家 meter 只有 full（estimated），无提供者采用页；以 full-only 交付，README 与逐叶证据明写「增量 unavailable、未采用」，不写假的 φ/δ。先例：OpenAI 六个 Pro 叶按 full-only 接受 | 各家 README／README_ZH 家族段；后续提供者页被接受时再按其范围开增量 |
| R-B | 无 holdout 的显式 effort full 估算扩展 | 按 Google 与 ZAI Prime 先例接受，条件是 evidence 明写「无 holdout、无误差界」，且不改「带未知 opaque／加密历史即 unavailable」的守门；真实 holdout 归付费认证 | Qwen 2.4T／27B 已接受 effort 的 full 估算扩展 |
| R-F＋R-L | 共享 `stream.ts` 对 `reasoning.text` 片段的合并规则 | 同 id：签名可从缺席／null 到一次非空值、之后只许重复同值，冲突或非法签名分离（不变）。**无 id**：R-F 原判「任一方带签名即分离」被 2026-09-30 真实付费观测证伪（Sonnet 5 经 OpenRouter 以无 id、同 index 的相邻片段流出，签名单独在最后一片到达）；改为 R-L——双方相邻、type／format／index 及其余未知成员逐值相等且都无 id 时，签名允许一次采用，之后只许重复同值；签名到达后再来的无签名片段视为新条目。ZAI 的无签名相邻拼接不变。**假设**：同一响应内相邻同 index 片段属同一内容块（Anthropic 协议的内容块身份），写进 `stream.ts` 注释 | transport 共享 reader；夹具按真实观测形状构造；分组行为变化是否提升共享修订号按 provenance 惯例 |
| R-K | 换路由时带 `opaque` 的思考块 | transport **规划拒绝** `unavailable`，原块不剥离、不降级为明文。理由：签名／密文降级为明文改线上语义与计量基准，`reasoning.encrypted` 亦无文本可降级；早暴露优于静默改写。`content-blocks/v2` S-9 把换模型带不带交给传输适配，契约无条款要求降级 | transport [design.md 换路由行](../../../realization/packages/model/pi-ai-transport/design.md)已改；测试期望按拒绝；**GG-11** 登记为运行时上下文组装义务：同会话切模型后由组装把外来 opaque 思考块 `visibility.toModel` 置否或丢弃 |
| R-M | Anthropic `reasoning.encrypted.data === "[REDACTED]"` | 判不可解释：下一轮 unavailable、零 HTTP，同 xAI 先例；r5 映射页「encrypted 含非空 data」补条件「且非占位」 | Anthropic 分类器；[优先两家候选](../../../realization/packages/model/pi-ai-transport/priority-family-output-cache-candidate.md)映射条件 |
| R-G | A22-G2 接缝 | **以 R1–R4 修订为条件接受**（见[接缝评审](../../proposals/model-runtime-reference-lifecycle/ack-seam-review.md)）；本轮不给 S-70② 摘要等价解释；ACK 后在途新写维持仅诊断可见 | 修订已落 revision 2；主线复核后在 [ACK 契约决定](../model-runtime-reference-lifecycle-adoption/README.md)加日期附注 |
| R-J | T29 runtime 任务 A/B | ACK 记录独立按调用去重键暂按作者编码采用，独立评审核对 MS8「独立种类域稳定键」；同 CallKey 重复 ACK 只有整值相等才算幂等认回；「所有可能写者实停＋同源完整前缀证实缺席后同批重送」以 RT11 S-86 与 v20 revision 2 为准，压过旧 README；`write_unknown` 固定原请求。集成状态「作者自测、独立评审进行中」，评审未出前不据此声称 RT11 修复已验收 | runtime 节点与 README；独立评审结论出后另记 |
| R-H | 音视频线上承载的前置裁决 | 六条（承载形状取 OpenRouter 官方格式白名单、复用 v21／v15 准备接缝、有限上限为可配置初值、Google 静态公式 estimated 而其余 `input_size_unavailable`、失败走既有分类、只做 transport realization 增量）**保留为将来立项输入**，因 R-I 本期不构成任何实现或采用义务 | 研究页；将来立项时从本页起 |

## 明确的共享缺口（本页只登记，不裁）

- **GG-10**（reader＋runtime owner）：`stream.ts` 只在 finish≠`length` 时发带 opaque 的收束事件，截断回复的领域块不带 details，runtime 仍记 completeness=complete；是否符合 `model-response/v11` S-43「实际收到且保留」待裁，三个裁法在 [Google 候选评审](../../../realization/packages/model/pi-ai-transport/google-reasoning-history-output-group-candidate.md)登记。
- **GG-11**（runtime／上下文组装 owner）：见 R-K 落点。

返回[决定](../README.md)。

## 2026-09-30 附注：R-N／P1 扩用与 GG-12／GG-14

R-N 与 R-P 的 P1 自 [ZAI 采用决定](../model-input-usage-calibration-adoption/zai-visible-reasoning-decision.md)起扩用到 ZAI（第四家已知并行键差异）。共享缺口清单补：GG-12（ZAI 可见推理历史映射，已由该决定处置）；GG-14（Google `reasoning.encrypted` 条目 `id` 等于上游 tool-call id、回放时工具调用 id 为 reader 生成的 CallId，永不匹配；owner transport reader／投影，可能需 content-blocks 规格演进）。
