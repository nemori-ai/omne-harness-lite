# Moonshot／Qwen 开源叶可见推理详情计量的有限架构评审

2026-09-30，主线记录独立 `architecture-reviewer` 的一次只读交接；本记录不是 reviewer 自写文件，也不是实现验收。

受审对象为两份同构的 provider 补充（revision 1，受审基线 HUB `43b3436b`，reviewer 以工作树 `9483adb4` 的字节为准并确认两页在其间未变）：[Moonshot 可见推理计量](../../../realization/packages/model/pi-ai-transport/moonshot-visible-reasoning-estimate-design.md) 与 [Qwen 开源两叶可见推理计量](../../../realization/packages/model/pi-ai-transport/qwen-open-visible-reasoning-estimate-design.md)。评审前提为主调度 2026-09-30 裁决 R-N（同文强制落 wire 层）、G7 登记、QV0 为 Qwen 前置。未运行测试、未改文件、未请求模型。

## 判断与处置

范围内无阻断。六个必答问题的结论：

1. 「计量副本把 details 替换为模板推理槽位字符串」有 [RT12 S-74](../../../spec/capabilities/model-request-runtime/v12/contract.md#s-74-每次发送之前的完整输入限制与固定计划)③ 依据：固定公开模板对历史 assistant 一律渲染推理槽位、固定 tokenizer、OpenRouter 官方文档把 `reasoning` 与 `reasoning_details` 都定义为传回推理的方式、归档同路由流中 detail 文字与 `reasoning` 串逐字相同；同两款 meter 已接受的 `reasoning` 字符串路径依赖同一类假设，本映射不引入新假设类别。误差方向无界，页面如实不承诺界。
2. 形状识别收成家族中立纯谓词不越过 D-107 共享核边界；它不是新判定源而是对 `reasoning.text` 的第五处家族判定，四键谓词与 DeepSeek 已采用判定语义逐项相同，应从 `projectDeepSeekMeterBody` 抽出；消息级并行键政策三家三样，仅对直接调用公开函数的消费者可见。
3. 「附加键即 unavailable」与 R-L 合并结果相容：迟到签名在 R-F 下成多项、在 R-L 下多出 `signature` 键，两条路都是拒绝；归档 816＋104 帧全部恰四键，观测范围内零误伤。显式 `signature: null` 会使整家族回放回到拒绝，应列为首次真实回放的观察项。
4. definition／implementation／algorithm 同升、replay 保持 `unsupported-marginal/1`、transform 保持 `openrouter-wire/2` 与 xAI V5、Anthropic mp4-18、Google r2 一致；唯一不一致处是 tokenizerRevision 随 algorithm 默认派生，三个先例都显式钉住。
5. Moonshot 可按 xAI 决定「机制接线先行、真实回放作门」采用；Qwen 在 QV0 前只能登记，这不是架构必需而是证据可追溯性的诚实选择。
6. 强制反证：采用方最强论据是与已接受字符串路径共用同一假设、适用表每条失败都是 unavailable、不采用则四叶真实多轮停在第二轮；落选方最强论据是带 details 的历史从未真实发送、「同一槽位」在产品路径无探针、三家三政策的表面复杂度、Qwen 当前发送域零流式观测。置信度 Moonshot 中高、Qwen（QV0 后）中；改票条件为真实回放显示上游拒收 details、`prompt_tokens` 残差表明 details 未计入、或同路由对照证伪「同一槽位」。

非阻断六项（残留「待裁」措辞、并行键政策分歧与谓词双份、`signature: null` 观察项、tokenizerRevision 派生漂移、Qwen 非流收据不可从工作区追溯、渲染与 `mediaTokens` 须共用同一派生副本）与范围外四问（DeepSeek 并行键政策是否回溯对齐、同路由对照是否必做、G7 六款测试是否入门、R-B 守门读法）由主调度裁为 R-P，并在两页 revision 2 落地：Moonshot SHA256 `3ba51d5c70584c05cacb61878d7577805d73c735af84d5e1fedf77cb9312b361`，Qwen SHA256 `fd6f1f63855b358f6fa7b48f8d9a31299f305f24483b8eabc6eb13c25f19b97e`。

## 未覆盖

未逐字节比对受审基线与工作树；未验证归档 16 条成员 SHA（抽核 5 条）；未复算 816／104 帧；未验证 MV／QV 任何一项；未读 OpenRouter 快照的「Reasoning Details API Shape」段。

返回[提案](README.md)。
