# omne-harness-lite-spec-tools

开发期 Python 工具包，属于根 uv workspace；负责文档导航、需求身份与维度引用、版本化规格、工具环境和
开发模型评估证据的检查，不是产品运行时依赖。可执行代码、包内格式和测试在此维护；
被检查的规格仍在 `spec/`，评估政策与公开任务包仍在 `docs/evaluation/`。

## 使用与开发

根目录的 `make check` 串联文档、规格与测试检查；`make docs-check`、`make spec-check`、
`make spec-tools`、`make test` 提供单项入口。也可从仓库根显式选择成员：

```sh
uv run --locked --package omne-harness-lite-spec-tools omne-docs-check
uv run --locked --package omne-harness-lite-spec-tools omne-spec-check
uv run --locked --package omne-harness-lite-spec-tools omne-spec-tools-check
uv run --locked --package omne-harness-lite-spec-tools omne-evaluate-developer-model REPORT
uv build --package omne-harness-lite-spec-tools --out-dir .dist/spec-tools
```

涉及仓库材料的命令（docs、spec、evaluation）默认从当前工作目录向上定位受检仓库，
也接受 `--root PATH`，不会把安装位置当作受检仓库。
环境检查仅检查本机 Java/JAR。包的 wheel 自带检查器的格式文件，评估政策从目标
仓库读取；无目标材料时明确报错，不携带一份隐藏的项目政策副本。

在本成员目录运行 `uv run --locked pytest` 检查包测试；根测试还覆盖 skill 生成器。
依赖在本包声明，根开发组只引用本地 workspace 成员和跨包开发工具。
检查支持的结论与形式验证覆盖见[验证规范](../../docs/maintenance/verification.md)。
