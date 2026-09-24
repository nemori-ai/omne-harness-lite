# D-038：块 D 与两块运行时的数据形状——2026-09-23 产品负责人逐节裁决的十九处分岔

产品负责人 2026-09-23 对主线起草的八份数据形状草案（内容块、消息、到达事件与装配、工具定义、工具结果与账、拓展点协议、模型档案、模型响应）**按章节顺序逐节裁决**，
十九处分岔与三条追加要求全部有了答案。**接受的是形状层面的取舍，不是契约**——
契约由 `data.content-blocks` `data.call-accounts` `data.messages` `data.arrival-events` `capability.stream-assembly` `data.tool-definition` `data.loop-extension` `data.model-profile` `data.model-response` 各自起草并另行接受；
本决定是它们条款里「产品负责人裁定」那一类依据的**长期落点**，代替只存在于任务区台账里的转述。

- **输入与下游**：研究 [message-model-and-stream-sources](../../../../research/message-model-and-stream-sources/README.md)、
  [model-request-transport-sources](../../../../research/model-request-transport-sources/README.md)、
  [loop-extension-hooks-compat](../../../../research/loop-extension-hooks-compat/README.md)、
  [tool-definition-shape-sources](../../../../research/tool-definition-shape-sources/README.md)；
  起点方向 [D-035](../message-and-stream-baseline/README.md)、[D-031](../tool-definition-baseline/README.md)、[D-033](../hooks-compat-baseline/README.md)、[D-019](../model-provider-pi-ai-fork/README.md)。
  形状草案本身是过程材料（主检出 `tmp/assets-runtimes/shapes-draft-v0.md`），不作为长期依据；本决定把裁决原话与其含义逐条落下。
  下游是上列九份契约（起草中或已起草为 candidate），以及 PF-009 rev 7、PF-013 rev 8 两次产品修订（已落）。
- **范围定位**：只解决「这十九处分岔各取哪一边」。**不解决**：字段名与 Schema（归契约）、这些裁决之外主线为起草补的推导（记在契约的「推导」项与任务区账本 `tmp/assets-runtimes/pending-user-rulings.md`，**未经产品负责人签字**，不在本决定内）。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 有权者 | 产品负责人（`panqiwei`） |
| 接受记录 | 2026-09-23 对话中逐节裁决，原话逐字录于[决定正文](decision.md#裁决原话与含义)；当日台账为主检出 `tmp/assets-runtimes/g1-rulings.md` 第 8a–8h 行（过程材料，本处逐字引用是长期记录） |
| 精确修订 | 形状草案 `shapes-draft-v0.md` 2026-09-23 18:28 版；PF-009 rev 7 与 PF-013 rev 8 是这些裁决已落的产品部分（HUB 提交 `265bde7`） |
| 接受范围 | 十九处分岔 Q1–Q19 与三条追加要求（压缩可见性、完整响应体、账与 model selector 口子）；逐项见[决定正文](decision.md#裁决原话与含义) |
| 保留前提 | 「工具等待态的答复只能阻塞在前台」是当前产品限定、原话已明说「未来未必」；「默认主模型 + 可选路由模型组」是将来项，本版只留 `select_model` 口子；见[正文](decision.md#理由与保留前提) |
| 评审状态 | 无独立评审；形状草案的对照证据来自上列四份研究 |
| 取代关系 | 不取代任何决定；在 D-035「三层起点」之下给出三层的具体形状取舍；回答 D-033 明文推迟到「协议起草时」的运行时接口问题（Q10）——G1–G11 逐项仍未由产品负责人裁，主线裁定在任务区账本 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 每处分岔的原话、取哪一边、落到哪份契约 | [决定正文](decision.md) |
| 这些形状为什么这样、对照了哪家 | 上列四份研究的正文 |
| 产品侧已落的部分 | [PF-009 changelog rev 7](../../../product/PF-009-context-message-types/changelog.md)、[PF-013 changelog rev 8](../../../product/PF-013-model-profiles-and-invocation/changelog.md) |

返回[决定](../README.md)。
