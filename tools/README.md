# 开发工具

本目录承载仓库开发、验证和维护所需的工具，按职责组织，语言按实现需要选择。
有独立依赖、资源或可测试行为的工具在自己的目录成包；源码和测试随包维护。

| 工具 | 职责 |
|---|---|
| [spec-tools](spec-tools/README.md) | 文档、规格、形式工具环境及开发模型评估证据检查；Python uv workspace 成员 |
| [package-checks](package-checks/README.md) | 产品叶子布局、依赖/公开入口、来源与逐包隔离产物消费；pnpm 开发成员 |

工具包不因安装到根开发环境就成为产品运行时依赖。仓库自动化的编排放在
[scripts/](../scripts/README.md)；自包含 skill 的脚本留在技能目录。
详细分工和依赖规则见[workspace 规范](../docs/maintenance/workspace.md)。
