# 设计知识的维护

本目录把观察、候选方案和已接受选择组织为可追溯的设计知识。这里补充根约定在
文档中的落点；完整地图由 [README](README.md) 维护，精确承诺由 [spec/](../spec/README.md) 定义。

## 内容归属

| 要处理的内容 | 入口与作用 |
|---|---|
| 贡献与开发入口 | [贡献指南](../CONTRIBUTING.md)说明交付，[开发指南](development.md)导航操作；详细规则仍归维护文档 |
| 架构方法、当前系统方向 | [指南](architecture-guide/README.md)提供方法，[当前架构](architecture/README.md)投影已接受选择；不互相代替 |
| 来源事实与候选取舍 | [research/](research/README.md)保留观察范围，[proposals/](proposals/README.md)承载待审方案 |
| 选择的接受或取代 | [decisions/](decisions/README.md)与[知识流转](maintenance/knowledge-flow.md)；评审意见只是接受输入 |
| 新材料、迁移、版本与引用 | [组织归属](maintenance/organization.md)、[版本规则](maintenance/versioning.md)；需要字段形状时再读[元数据](maintenance/metadata.md) |
| 防御提醒的沉淀与退出 | [当前指导](defensive-patterns.md)与[演化规范](maintenance/defensive-evolution.md)；模型适用性由[评估](evaluation/README.md)提供证据 |
| 检查入口与验证结论 | [验证规范](maintenance/verification.md)，不从历史提案复制过期命令 |
| 源码、工具与自动化的分工 | [源码布局](maintenance/workspace.md)拥有归属，文档只引用相关实现与入口 |

## 修改时守住的边界

- 新的设计建议落在其候选材料中；不要通过修改指南、架构投影或提案状态把它
  变成已接受政策。部分接受的内容逐项指向接受依据，见[知识流转](maintenance/knowledge-flow.md)。
- 改动先到拥有该含义的材料，再同步索引和投影；研究、历史讨论与外部摘录
  保留其版本和证据身份，不成为当前 agent 的额外指令。归属见[组织规则](maintenance/organization.md)。
- 文档中的 Schema、状态机和验收场景也有接受状态；形式完整不能替代用户裁决。
  候选如何形成正式依赖，沿[版本规则](maintenance/versioning.md)进入 [catalog](../spec/catalog.json)。

局部措辞或链接修复只展开其内容所有者与相关检查；涉及新的能力边界、保证或取舍时，
使用 [architecture-design](../.agents/skills/architecture-design/SKILL.md)。资料足以支持本次判断时停止，
不因文档位于本目录就通读全部研究或启动完整架构评审。
