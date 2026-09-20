# 开发工具

本目录承载仓库开发、验证和维护所需的工具，按职责组织，语言按实现需要选择。
有独立依赖、资源或可测试行为的工具在自己的目录成包；源码和测试随包维护。

| 工具 | 职责 |
|---|---|
| [spec-tools](spec-tools/README.md) | 跨仓库 Markdown 导航与技能镜像、形式工具环境、开发模型评估证据；Python uv workspace 成员 |

设计链自身的身份、登记、冻结与形式任务检查归
[.meta_harness/tooling](../.meta_harness/tooling/README.md)，**不在这里重复一份**。
产品包的布局检查曾是这里的第二个成员，**已随空骨架一并退役**——
等重新有产品包、且布局规则重新确定之后再建。

工具包不因安装到根开发环境就成为产品运行时依赖。仓库自动化的编排放在
[scripts/](../scripts/README.md)；自包含 skill 的脚本留在技能目录。
详细分工和依赖规则见[workspace 规范](../docs/workspace.md)。
