---
kind: product-feature
id: PF-022
primary_dimension: agent
secondary_dimensions: [user]
source_baseline: omne-harness-lite-legacy-spec
source_commit: e3573ca72d18bfe7ddd002df5025551b51eede46
source_file: docs/requirements/product/agent/PF-022-multimodal-response-and-output.md
source_sha256: bb2d94894da9e25d76a183a4480a473183b0e5a3a6254889e881657b085b292b
source_anchor: "heading:# PF-022：多模态响应与输出"
target_baseline: omne-harness-lite-design-2026-09-15
migration_status: equivalent-current-requirement
---


# PF-022：多模态响应与输出

[智能体维度](../by-agent.md) · [来源核对](../../../research/requirements-gap-resolution-sources/research.md)

2026-09-12 用户接受 GAP-9，并明确新增 Agent 的多模态响应/输出能力。
主维度为智能体，副维度为用户；与 PF-009 的用户多模态输入分别维护。

## 已确认要求

- **PF-022.C1：Agent 能用多模态内容作答。** 回复不仅限于文本，可以
  包含图片、音频等非文本媒体以及文件/附件，并与文本组合交付。实际输出
  模态受当前模型/工具能力、部署支持和有效权限约束；不能只返回“已生成”的
  文字或宿主机上的内部路径来代替用户可取得的结果。

以下 C2–C6 结合来源的工具生成和模型原生多模态回复要求细化。

- **PF-022.C2：模型原生输出与工具产出均可交付。** 当模型及本次调用
  允许原生多模态输出时，模型直接返回的图片/音频可进入回复，不强制绕行
  创作工具；通过获准工具生成的媒体同样可以使用。两种来源都保留实际来源
  与模型/工具关联，面向用户适用一致的附件读取与治理规则。
- **PF-022.C3：支持逐步响应并保留顺序。** Agent 实际逐步生成的回复
  可以持续呈现，文本、媒体及附件的关系与顺序可辨；流式路径不能因含有媒体
  就静默丢弃媒体或一律关闭整个回复的流式交付。媒体可按其真实生成/取得进度
  到达，不承诺所有模态都能逐字节播放或具备同一种时间轴。
- **PF-022.C4：原件和历史可取回。** 用户能沿受权路径查看、播放或下载
  实际内容，在后续会话历史中取回仍处于有效保留期的原件。断线重连、刷新或
  运行时重建后，取得同一已确认回复；临时流进度与耐久内容明确区分。暂存路径
  或过期外部链接不能作为已承诺持久交付的唯一依据。
- **PF-022.C5：治理覆盖所有输出来源。** 租户归属、访问权限、额度、
  生命周期与删除后的可读状态不因模型直出、工具生成或既有制品引用而绕开。
  输出中的附件可引用 PF-015 的制品，但输出消息、持久工作材料和公开发布
  是不同效果，生成内容不自动公开给其他用户或租户。
- **PF-022.C6：部分交付与失败如实可见。** 模态不受支持、内容落存失败、
  媒体无法送达或生成被中断时，用户能区分已取得部分、未交付部分和最终状态；
  不能展示成功文本却无声丢失媒体。需要转换或替代路径时明确告知并遵循授权，
  不把自动转写伪装成原始多模态结果。

## 场景与范围

| 场景 | 应有表现 |
|---|---|
| 模型直接输出图片和解释文字 | 两者有序进入回复，图片可按权限取得，不额外伪造一次工具调用 |
| 工具生成音频或文件 | Agent 可随回复交付实际产物，后续历史仍可定位到同一内容 |
| 文本已流出但媒体保存失败 | 明确显示部分交付和失败原因，不能把整条回复标为完整成功 |

图片、音频与文件是本轮据来源细化的明确交付场景。用户的多模态方向不限定
于这些类型；具体视频生成/直出、实时视听对齐、转码和客户端支持矩阵仍待展开，
不声称任意模型或终端都支持全部模态。协议、媒体承载与存储形式待设计。
输入归 [PF-009](../PF-009-multimodal-input-attachments-and-commands/requirements.md)，
工具内部帧归 [PF-003](../PF-003-tool-execution-observation-and-control/requirements.md)，
持久制品归 [PF-015](../PF-015-artifact-management-and-isolated-working-copies/requirements.md)，
会话模型切换引用 [PF-023](../PF-023-session-model-selection-and-continuity/requirements.md)。
