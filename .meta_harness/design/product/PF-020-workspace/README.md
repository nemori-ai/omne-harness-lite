---
id: PF-020
title: 工作区
status: draft
revision: 2
relations:
  supersedes: []
  depends-on:
    - id: PF-001
      for: 租户所有权、跨租户隔离与身份边界
    - id: PF-002
      for: 工作区所提供资产的归属、设置求值与权限过滤规则
    - id: PF-005
      for: 本地执行环境与资源边界的区分
    - id: PF-015
      for: 会话如何携带工作区选择并跨会话持续
  extends: []
---

# PF-020：工作区

工作区是一个跨会话持续存在、带有自身身份和治理归属的完整资源聚合包。它有一个治理所有者租户，
也可以授权其他租户参与同一个工作区；不同类型的 agent 可以在不同会话和不同部署节点上继续工作；它不绑定一个固定目标，
也不等同于某台机器上的目录。

本 topic 先把工作区本体、租户—工作区关系、工作区实例和工作区地址分开，并把工作区类别与地址提供者类型分轴。资产层的设置、替换和权限过滤
仍由 [PF-002](../PF-002-assets-settings-and-permissions/README.md) 负责；本版不提前决定
中心存储、同步冲突或并发写入的具体策略。

## 关系

| 关系 | 含义 | 本 topic 的情况 |
|---|---|---|
| `supersedes` | 取代对方全部内容 | 无；PF-002 的资产层规则继续有效 |
| `depends-on` | 直接使用对方已定义的概念 | PF-001 的租户与隔离、PF-002 的工作区资产层、PF-005 的执行边界、PF-015 的会话选择 |
| `extends` | 在对方基础上扩展范围，对方继续有效 | 无；本 topic 将 PF-002 原来混在一起的工作区本体与承载问题单独展开 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 工作区是什么、边界在哪里 | [产品设计](design.md) |
| 工作区怎样被装载、跨会话继续工作 | [流程与状态](flows.md) |
| 做成什么样算对了 | [验收标准](acceptance.md) |
| 哪些是用户裁定、哪些是 PM 推导、哪些未定 | [决策与来源](decisions.md) |
| 这块设计如何演变 | [变更历史](changelog.md) |
| 本轮交流原话 | [设计交流笔记](interviews/2026-09-24-workspace-concept.md) |

## 状态

- 产品设计：**rev 2，草稿**。这是当前讨论的初步落盘，后续仍会补充产品需求与策略。
- 未决项：10 项（见 [design.md 第九节](design.md#九未决项)）。
- 待裁决：0 项；用户已明确的方向与 PM 推导分列在 [decisions.md](decisions.md)。
- 技术投影：尚未开始。

## 本包的文件

```text
PF-020-workspace/
├── README.md
├── design.md
├── flows.md
├── acceptance.md
├── decisions.md
├── changelog.md
└── interviews/2026-09-24-workspace-concept.md
```
