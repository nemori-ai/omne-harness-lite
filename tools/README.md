# 开发工具

本目录承载仓库开发、验证和维护所需的工具，按职责组织，语言按实现需要选择。
有独立依赖、资源或可测试行为的工具在自己的目录成包；源码和测试随包维护。

| 工具 | 职责 |
|---|---|
| [spec-tools](spec-tools/README.md) | 跨仓库 Markdown 导航与技能镜像、形式工具环境、开发模型评估证据；Python uv workspace 成员 |
| [artifact-builder](artifact-builder/README.md) | 应用归档的开发期文件闭包校验与独占发布；CLI和中心的静态适配经公开入口消费，不进入生产依赖 |
| [ts-checks](ts-checks/README.md) | 产品源码的结构检查规则（墙钟、`bail`、受限调用点、`./testing` 零 import、跨组依赖方向），每条带「故意违反就失败」自测；pnpm workspace 成员，`pnpm run lint:rules`。同包的第二入口 `make metrics` 出结构度量与审讯页，只报告不判失败 |
| [core-verification](core-verification/README.md) | core 包的真实组合与套件有效性验证；开发依赖通过公开入口消费现有提供者，产品 core 不反向依赖 infra |
| [model-probe](model-probe/README.md) | OpenRouter 公开目录和受预算控制的模型适配探针；Node 标准库工具，显式付费入口，不提供产品 adapter |

设计链自身的身份、登记、冻结与形式任务检查归
[.meta_harness/tooling](../.meta_harness/tooling/README.md)，**不在这里重复一份**。
产品包的布局检查曾是这里的第二个成员，随 2026-09-20 的空骨架退役；
2026-09-22 起 `ts-checks` 承接契约与节点 verification 点名的结构检查，布局检查仍未重建。

工具包不因安装到根开发环境就成为产品运行时依赖。仓库自动化的编排放在
[scripts/](../scripts/README.md)；自包含 skill 的脚本留在技能目录。
详细分工和依赖规则见[workspace 规范](../docs/workspace.md)。
