# omne-harness-lite-spec-tools

开发期 Python 工具包，属于根 uv workspace，负责文档导航、形式工具环境和开发模型评估报告检查。
它不是产品运行时依赖。源码与测试归本包；评估政策和任务包归
[开发模型评估入口](../../.meta_harness/agents/evaluation/developer-model/README.md)。
模块承诺与系统约束的归属见[架构维护入口](../../.meta_harness/design/architecture/README.md)。

## 使用与开发

`make docs-check`、`make formal-tools`、`make test` 提供单项入口。
也可从仓库根显式选择成员：

```sh
uv run --locked --package omne-harness-lite-spec-tools omne-docs-check
uv run --locked --package omne-harness-lite-spec-tools omne-spec-tools-check
uv run --locked --package omne-harness-lite-spec-tools omne-evaluate-developer-model REPORT
uv build --package omne-harness-lite-spec-tools --out-dir .dist/spec-tools
```

涉及仓库材料的命令（docs、evaluation）默认从当前工作目录向上定位受检仓库，
也接受 `--root PATH`，不会把安装位置当作受检仓库。
环境检查仅检查本机 Java/JAR。评估政策与格式从目标仓库的实际评估入口读取；
无目标材料时明确报错，wheel 不携带项目政策或旧设计链格式的副本。

在本成员目录运行 `uv run --locked pytest` 检查包测试；根测试还覆盖 skill 生成器。
依赖在本包声明，根开发组只引用本地 workspace 成员和跨包开发工具。
检查支持的结论与形式验证覆盖见[验证规范](../../docs/verification.md)。
