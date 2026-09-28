# D-073：接受 PF-021 rev 8 产品设计

- 当前状态：已接受，仅产品设计。
- 接受日期：2026-09-28。
- 接受者与授权：产品负责人明确授权，主线完成指定修订后登记；原话见 [INT-030](../../../product/PF-021-schedule-and-calendar/interviews/2026-09-28-product-discussion.md#int-030补齐设计并正式接受交付的授权)。
- 来源研究：[omne-next 日程与日历研究](../../../../research/omne-next-schedule-calendar/README.md)，固定上游修订 `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`；本仓库前置研究基线 `e2b0d4aa5b5bf0bc8610dce950635f8b30940891`。
- 被接受对象：[PF-021](../../../product/PF-021-schedule-and-calendar/README.md) rev 8 的 design、tools、flows 与 acceptance；词表、对象条目和相邻引用作为一致性维护，事实来源及推导留该包 decisions/interviews。

## 选择与范围

接受日历计算及数据供应、日程管理与触发、通知及目标租户送达三项产品能力；Schedule 内含 Routine，Job 为单次工作；系统自用只执行机械操作，agent 执行每次新建专属会话。
日期处理、补跑、重叠和适用通知声明均由 Schedule 明确配置；既有 Job 的采用内容与事实不回写。接受五组 24 条工具命令、单次 Job 取消及 90 条产品验收场景。
日期处理与无会话等待 Job 取消两处整包缺口已补齐；PF-014 来源、PF-015 用途和作业执行约束、PF-016 通知与操作入口的产品引用已对齐。

## 评审与验证边界

独立 product-design-reviewer 先发现上述两处缺口，修订后进行整包与组合场景复核，最终未发现剩余阻断或非阻断问题。
复核覆盖日期规则、平移及排除边界、取消与执行竞争、通知义务、工具命令及相邻 PF 引用；评审支持本次登记，不代替产品负责人的授权。
`make design-check`（internal，formal=registered）、`make docs-check` 与 `git diff --check` 通过。对账为 255 词条、48 对象、9 项技术或既有待裁、50 实现映射节点。
未执行形式模型或产品运行测试。技术协议、实现、运行质量与剩余技术待裁没有因产品接受而完成。

## 精确产品快照

| 文件 | SHA-256 |
|---|---|
| `design.md` | `f2aae0c1447253613fde4d9097b09600244b9226b55d87eea711ba1a7df91a63` |
| `tools.md` | `f5cfe79f982a51fa0f3ca3749365efb5cde36cac8e1db5c5e56ec3cb2a7f63f4` |
| `flows.md` | `938e0ae7c1b6c6dcc9afd2c661cae156e16c35bc22665406f3a8f063023ecb5f` |
| `acceptance.md` | `60e71a7c146a369a35356cfbb55406d76bfa9a5a2af2312fef6d694186de5f1c` |

## 取代与下游

本决定不取代已有正式决定或冻结契约；PF-021 前七版为设计过程，rev 8 为首次整包正式产品接受。
PF-014/015/016 仅引用对齐，各自原有修订号、规则和接受范围保持原状；本决定不替它们的独立未决项拍板。
后续架构与规格从 PF-021 rev 8 及明确的相邻依赖展开，技术交接事项由其拥有者解决；不建立产品实现包、不修改 catalog 或 frozen 清单。
